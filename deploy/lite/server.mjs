/* ============================================================
 * 像素酒馆 · Lite 独立服务器（零依赖，Node 18+）
 *
 * 用途：
 *   1) ZCode Sites / 任意 PaaS 的极速上线（只需 portal 静态文件 + 本文件）
 *   2) 无 Docker 的极简自托管（配合 systemd / 反代）
 *
 * 提供与 SillyTavern 版一致的像素 API：
 *   GET  /api/pixel/status   共享模型状态
 *   POST /api/pixel/chat     OpenAI 兼容流式聊天代理（SSE）
 *   POST /api/pixel/probe    BYOK 连接测试
 *   POST /api/pixel/visit    访问计数 +1
 *   GET  /api/pixel/stats    访问计数查询
 * 以及静态托管 /pixel-tavern/* 与 /。
 * 密钥只存在于服务端环境变量，绝不发给浏览器。BYOK 仅允许 HTTPS 公网地址。
 * ============================================================ */
'use strict';

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
/* 仓库布局：deploy/lite/ → ../../public/pixel-tavern；打包布局（stage）：./public/pixel-tavern */
const STATIC_CANDIDATES = [
    path.resolve(__dirname, '..', '..', 'public', 'pixel-tavern'),
    path.resolve(__dirname, 'public', 'pixel-tavern'),
];
const STATIC_ROOT = STATIC_CANDIDATES.find((p) => fs.existsSync(path.join(p, 'index.html')))
    || STATIC_CANDIDATES[0];
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'pixel-tavern-lite');
const STATS_PATH = path.join(DATA_DIR, 'pixel-stats.json');

const SHARED_BASE_URL = process.env.PIXEL_LLM_BASE_URL || '';
const SHARED_API_KEY = process.env.PIXEL_LLM_API_KEY || '';
const SHARED_MODEL = process.env.PIXEL_LLM_MODEL || '';
const ALLOW_PRIVATE = process.env.PIXEL_ALLOW_PRIVATE === '1';

const UPSTREAM_TIMEOUT_MS = 120 * 1000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_MESSAGES = 64;
const MAX_MESSAGE_CHARS = 32000;
const MAX_TOTAL_CHARS = 200000;

/* ---------- 访问计数 ---------- */
let stats = { visits: 0 };
try {
    if (fs.existsSync(STATS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
        if (Number.isFinite(parsed?.visits)) stats.visits = Math.max(0, Math.floor(parsed.visits));
    }
} catch { /* 起始为零 */ }
let statsTimer = null;
function persistStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
        statsTimer = null;
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 4));
        } catch { /* 尽力而为 */ }
    }, 3000);
}

/* ---------- 限流（每 IP 滑动窗口） ---------- */
const RATE_LIMITS = {
    shared: { windowMs: 5 * 60 * 1000, max: 40 },
    byok: { windowMs: 5 * 60 * 1000, max: 120 },
    visit: { windowMs: 60 * 1000, max: 30 },
};
const buckets = new Map();
function rateLimit(kind, ip) {
    const lim = RATE_LIMITS[kind];
    if (!lim) return true;
    const key = kind + ':' + ip;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    while (b.length && now - b[0] > lim.windowMs) b.shift();
    if (b.length >= lim.max) return false;
    b.push(now);
    if (buckets.size > 4096) {
        for (const [k, bb] of buckets) if (!bb.length || now - bb[bb.length - 1] > lim.windowMs) buckets.delete(k);
    }
    return true;
}

/* ---------- BYOK 校验 ---------- */
function isPrivateHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (net.isIPv4(h)) {
        const [a, b] = h.split('.').map(Number);
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        return false;
    }
    if (net.isIPv6(h)) {
        const v = h.toLowerCase();
        return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
    }
    return false;
}

function resolveUpstream(rawBase) {
    let parsed;
    try { parsed = new URL(String(rawBase).trim()); } catch { throw new Error('接入点地址无效'); }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ALLOW_PRIVATE)) throw new Error('接入点必须使用 HTTPS');
    if (!ALLOW_PRIVATE && isPrivateHost(parsed.hostname)) throw new Error('不允许使用内网地址');
    if (parsed.port && parsed.protocol === 'https:' && parsed.port !== '443') throw new Error('仅支持 443 端口');
    if (parsed.username || parsed.password) throw new Error('接入点不应包含用户名密码');
    let base = parsed.href.replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(base)) base += '/chat/completions';
    return new URL(base);
}

function sanitizeMessages(input) {
    if (!Array.isArray(input) || input.length === 0) throw new Error('messages 不能为空');
    if (input.length > MAX_MESSAGES) throw new Error('消息过多');
    let total = 0;
    const messages = [];
    for (const m of input) {
        if (!m || typeof m !== 'object') throw new Error('消息格式无效');
        const role = String(m.role || '');
        if (!['system', 'user', 'assistant'].includes(role)) throw new Error('未知的消息角色');
        const content = String(m.content ?? '');
        if (content.length > MAX_MESSAGE_CHARS) throw new Error('单条消息过长');
        total += content.length;
        if (total > MAX_TOTAL_CHARS) throw new Error('对话内容过长');
        messages.push({ role, content });
    }
    return messages;
}

/* ---------- 工具 ---------- */
function sendJSON(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}

function readJSONBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) { reject(new Error('请求体过大')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('JSON 解析失败')); }
        });
        req.on('error', reject);
    });
}

/* ---------- 聊天代理 ---------- */
async function proxyChat(req, res, baseUrl, apiKey, model, body) {
    let messages;
    let temperature;
    let maxTokens;
    try {
        messages = sanitizeMessages(body?.messages);
        temperature = Math.min(2, Math.max(0, Number(body?.temperature ?? 0.9)));
        maxTokens = Math.min(4096, Math.max(16, Number(body?.max_tokens ?? 512) || 512));
    } catch (err) {
        return sendJSON(res, 400, { error: err.message });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream;
    try {
        upstream = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true }),
            signal: controller.signal,
        });
    } catch {
        clearTimeout(timer);
        return sendJSON(res, 502, { error: '无法连接模型接入点' });
    }
    if (!upstream.ok) {
        clearTimeout(timer);
        let detail = '';
        try { detail = (await upstream.text()).slice(0, 400).replace(apiKey, '***'); } catch { /* ignore */ }
        return sendJSON(res, 502, { error: '上游返回 ' + upstream.status, detail });
    }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    req.on('close', () => controller.abort());
    const reader = upstream.body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) await new Promise((r) => res.once('drain', r));
        }
        res.end();
    } catch { res.end(); } finally { clearTimeout(timer); }
}

/* ---------- 静态文件 ---------- */
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

function serveStatic(res, absPath, cache = 'public, max-age=3600') {
    const data = fs.readFileSync(absPath);
    res.writeHead(200, {
        'Content-Type': MIME[path.extname(absPath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
    });
    res.end(data);
}

/* ---------- 请求路由 ---------- */
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    const pathname = decodeURIComponent(url.pathname);
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();

    try {
        /* 像素 API */
        if (pathname === '/api/pixel/status' && req.method === 'GET') {
            const sharedReady = Boolean(SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL);
            return sendJSON(res, 200, { ai: sharedReady, model: sharedReady ? SHARED_MODEL : null, byok: true, version: '1.0' });
        }
        if (pathname === '/api/pixel/stats' && req.method === 'GET') {
            return sendJSON(res, 200, stats);
        }
        if (pathname === '/api/pixel/visit' && req.method === 'POST') {
            if (rateLimit('visit', ip)) { stats.visits += 1; persistStats(); }
            return sendJSON(res, 200, stats);
        }
        if (pathname === '/api/pixel/probe' && req.method === 'POST') {
            if (!rateLimit('byok', ip)) return sendJSON(res, 429, { error: '请求过于频繁，请稍后再试' });
            const body = await readJSONBody(req);
            try {
                const baseUrl = resolveUpstream(body?.base_url);
                const apiKey = String(body?.api_key || '').trim();
                const model = String(body?.model || '').trim();
                if (!apiKey || !model) return sendJSON(res, 400, { ok: false, error: '需要 API Key 和模型 ID' });
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 30 * 1000);
                const upstream = await fetch(baseUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
                    signal: controller.signal,
                });
                clearTimeout(timer);
                if (!upstream.ok) {
                    const text = await upstream.text().catch(() => '');
                    return sendJSON(res, 502, { ok: false, status: upstream.status, detail: text.slice(0, 300).replace(apiKey, '***') });
                }
                return sendJSON(res, 200, { ok: true });
            } catch (err) {
                return sendJSON(res, 400, { ok: false, error: err.message });
            }
        }
        if (pathname === '/api/pixel/chat' && req.method === 'POST') {
            const byokBase = req.headers['x-pt-base-url'];
            const byokKey = req.headers['x-pt-api-key'];
            const byokModel = req.headers['x-pt-model'];
            const body = await readJSONBody(req);
            if (byokBase || byokKey) {
                if (!rateLimit('byok', ip)) return sendJSON(res, 429, { error: '请求过于频繁，请稍后再试' });
                let baseUrl;
                try { baseUrl = resolveUpstream(byokBase); } catch (err) { return sendJSON(res, 400, { error: err.message }); }
                return await proxyChat(req, res, baseUrl, String(byokKey || ''), String(byokModel || SHARED_MODEL || 'gpt-4o-mini'), body);
            }
            const sharedReady = Boolean(SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL);
            if (!sharedReady) return sendJSON(res, 503, { error: '站点未配置共享模型，请在设置中接入自己的 API' });
            if (!rateLimit('shared', ip)) return sendJSON(res, 429, { error: '共享模型当前繁忙，请配置自己的接入点或稍后再试' });
            return await proxyChat(req, res, resolveUpstream(SHARED_BASE_URL), SHARED_API_KEY, SHARED_MODEL, body);
        }

        /* SEO 动态文件 */
        if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
            const publicHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
                || String(req.headers.host || 'example.com');
            const base = (String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()) + '://' + publicHost;
            if (pathname === '/robots.txt') {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                return res.end([
                    '# Pixel Tavern (像素酒馆)',
                    'User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /login', '',
                    'Sitemap: ' + base + '/sitemap.xml', '',
                ].join('\n'));
            }
            const today = new Date().toISOString().slice(0, 10);
            res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
            return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n <url><loc>' + base + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>');
        }

        /* 静态门户 */
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return sendJSON(res, 405, { error: 'Method Not Allowed' });
        }
        let rel = pathname === '/' ? '/index.html' : pathname;
        if (rel.startsWith('/pixel-tavern/')) rel = rel.slice('/pixel-tavern'.length);
        const target = path.resolve(STATIC_ROOT, '.' + rel);
        if (target !== STATIC_ROOT && !target.startsWith(STATIC_ROOT + path.sep)) {
            return sendJSON(res, 403, { error: 'Forbidden' });
        }
        if (fs.existsSync(target) && fs.statSync(target).isFile()) {
            const cache = rel.startsWith('/fonts/') || rel.startsWith('/brand/') ? 'public, max-age=604800' : 'public, max-age=3600';
            return serveStatic(res, target, cache);
        }
        /* SPA 兜底：未知路径回门户 */
        return serveStatic(res, path.join(STATIC_ROOT, 'index.html'), 'no-cache');
    } catch (err) {
        console.error('[pixel-lite]', req.method, pathname, err?.message || err);
        if (!res.headersSent) sendJSON(res, 500, { error: '服务器内部错误' });
        else res.end();
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[pixel-lite] 像素酒馆 Lite 已启动: http://${HOST}:${PORT}`);
    console.log(`[pixel-lite] 静态目录: ${STATIC_ROOT}`);
    console.log(`[pixel-lite] 共享模型: ${SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL ? SHARED_MODEL : '未配置（访客可用自带接入点）'}`);
});
