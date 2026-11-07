/* ============================================================
 * 游戏酒馆 · Vercel Serverless 共享库
 * 与 src/endpoints/pixel.js、deploy/lite/server.mjs 同源的像素 API：
 *   共享模型走环境变量 PIXEL_LLM_*（密钥零下发）；
 *   访客 BYOK 走 x-pt-* 请求头（HTTPS-only 公网地址，防 SSRF）。
 * Serverless 限制：限流与访问计数为实例内存 + /tmp 文件，
 * 冷启动会重置（免费层的合理折衷；需要精确计数请用 VPS/lite 部署）。
 * ============================================================ */
'use strict';

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SHARED_BASE_URL = process.env.PIXEL_LLM_BASE_URL || '';
export const SHARED_API_KEY = process.env.PIXEL_LLM_API_KEY || '';
export const SHARED_MODEL = process.env.PIXEL_LLM_MODEL || '';
const ALLOW_PRIVATE = process.env.PIXEL_ALLOW_PRIVATE === '1';

const UPSTREAM_TIMEOUT_MS = 55 * 1000; /* Vercel Hobby 函数上限 60s，留余量 */
const MAX_BODY_BYTES = 512 * 1024;
const MAX_MESSAGES = 64;
const MAX_MESSAGE_CHARS = 32000;
const MAX_TOTAL_CHARS = 200000;

/* ---------- 安全响应头 ---------- */
export function applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/* ---------- 同源校验（替代 CSRF：无会话体系下的防跨站调用） ---------- */
export function sameOrigin(req) {
    const origin = String(req.headers.origin || '');
    if (!origin) return true; /* 同源 fetch/GET 可能不带 Origin */
    try {
        return new URL(origin).host === String(req.headers.host || '');
    } catch {
        return false;
    }
}

/* ---------- 限流（每 IP 滑动窗口，实例内存） ---------- */
const RATE_LIMITS = {
    shared: { windowMs: 5 * 60 * 1000, max: 40 },
    byok: { windowMs: 5 * 60 * 1000, max: 120 },
    visit: { windowMs: 60 * 1000, max: 30 },
};
const buckets = new Map();

export function clientIp(req) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(kind, ip) {
    const lim = RATE_LIMITS[kind];
    if (!lim) return true;
    const now = Date.now();
    const key = kind + ':' + ip;
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

/* ---------- 访问计数（实例内存 + /tmp 尽力持久化） ---------- */
const STATS_PATH = path.join(os.tmpdir(), 'pixel-stats.json');
let stats = { visits: 0 };
try {
    if (fs.existsSync(STATS_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
        if (Number.isFinite(parsed?.visits)) stats.visits = Math.max(0, Math.floor(parsed.visits));
    }
} catch { /* 起始为零 */ }

export function bumpVisits() {
    stats.visits += 1;
    try {
        fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
        fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 4));
    } catch { /* 尽力而为 */ }
    return stats;
}

export function getStats() {
    return stats;
}

/* ---------- BYOK / 共享端点校验 ---------- */
export function isPrivateHost(hostname) {
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

export function resolveUpstream(rawBase) {
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

export function sharedModelReady() {
    return Boolean(SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL);
}

export function sanitizeMessages(input) {
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

/* ---------- 请求体 / 响应工具 ---------- */
export function readJSONBody(req) {
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

export function sendJSON(res, status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
}

/* ---------- 流式聊天代理 ---------- */
export async function proxyChat(req, res, baseUrl, apiKey, model, body) {
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
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
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

/* ---------- SEO 动态文件 ---------- */
export function publicBase(req) {
    const host = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
        || String(req.headers.host || 'example.com');
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return proto + '://' + host;
}

export function sendRobots(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end([
        '# Game Tavern (游戏酒馆)',
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        'Sitemap: ' + publicBase(req) + '/sitemap.xml',
        '',
    ].join('\n'));
}

export function sendSitemap(req, res) {
    const today = new Date().toISOString().slice(0, 10);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + ' <url><loc>' + publicBase(req) + '/</loc><lastmod>' + today + '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n'
        + '</urlset>');
}
