import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import express from 'express';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

import { serverDirectory } from '../server-directory.js';
import { getConfigValue } from '../util.js';

/**
 * 像素酒馆 (Pixel Tavern) public API:
 *   GET  /api/pixel/status  – shared AI model availability (no secrets)
 *   POST /api/pixel/chat    – OpenAI-compatible streaming chat proxy
 *   POST /api/pixel/probe   – tiny non-streamed request to test BYOK credentials
 *   POST /api/pixel/visit   – bump the public visit counter
 *   GET  /api/pixel/stats   – public aggregate stats
 *
 * Mounted before requireLoginMiddleware (public), but still behind the global
 * CSRF protection, so POSTs from the portal must send X-CSRF-Token.
 *
 * Credentials are never logged. The shared key comes from the environment:
 *   PIXEL_LLM_BASE_URL / PIXEL_LLM_API_KEY / PIXEL_LLM_MODEL
 * Visitors may also bring their own OpenAI-compatible endpoint via the
 * x-pt-base-url / x-pt-api-key / x-pt-model headers (validated, HTTPS only).
 */

const router = express.Router();

const SHARED_BASE_URL = process.env.PIXEL_LLM_BASE_URL || '';
const SHARED_API_KEY = process.env.PIXEL_LLM_API_KEY || '';
const SHARED_MODEL = process.env.PIXEL_LLM_MODEL || '';
const ALLOW_PRIVATE = process.env.PIXEL_ALLOW_PRIVATE === '1';

const UPSTREAM_TIMEOUT_MS = 120 * 1000;
const MAX_MESSAGES = 64;
const MAX_MESSAGE_CHARS = 32000;
const MAX_TOTAL_CHARS = 200000;

// --- simple per-IP sliding window rate limiter -------------------------------
const RATE_LIMITS = {
    shared: { windowMs: 5 * 60 * 1000, max: 40 },
    byok: { windowMs: 5 * 60 * 1000, max: 120 },
    visit: { windowMs: 60 * 1000, max: 30 },
};
const rateBuckets = new Map();

function rateLimit(kind, req) {
    const limit = RATE_LIMITS[kind];
    if (!limit) {
        return true;
    }
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${kind}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket) {
        bucket = [];
        rateBuckets.set(key, bucket);
    }
    while (bucket.length && now - bucket[0] > limit.windowMs) {
        bucket.shift();
    }
    if (bucket.length >= limit.max) {
        return false;
    }
    bucket.push(now);
    // Opportunistic cleanup so the map cannot grow unbounded.
    if (rateBuckets.size > 4096) {
        for (const [k, b] of rateBuckets) {
            if (!b.length || now - b[b.length - 1] > limit.windowMs) {
                rateBuckets.delete(k);
            }
        }
    }
    return true;
}

// --- visit counter ------------------------------------------------------------
const statsPath = path.resolve(serverDirectory, getConfigValue('dataRoot', './data'), 'pixel-stats.json');
let stats = { visits: 0 };
let statsSaveTimer = null;

try {
    if (fs.existsSync(statsPath)) {
        const parsed = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        if (Number.isFinite(parsed?.visits)) {
            stats.visits = Math.max(0, Math.floor(parsed.visits));
        }
    }
} catch {
    // Corrupted or unreadable stats file: start from zero rather than crash.
}

function persistStats() {
    if (statsSaveTimer) {
        return;
    }
    statsSaveTimer = setTimeout(() => {
        statsSaveTimer = null;
        try {
            fs.mkdirSync(path.dirname(statsPath), { recursive: true });
            writeFileAtomicSync(statsPath, JSON.stringify(stats, null, 4));
        } catch {
            // Non-fatal: the counter is best-effort.
        }
    }, 3000);
}

// --- BYOK endpoint validation -------------------------------------------------
function isPrivateHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
        return true;
    }
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

/**
 * Validates a BYOK base URL and returns the resolved chat/completions URL.
 * Only https (or http for local development when explicitly allowed) to
 * well-known public hosts is accepted.
 * @returns {URL} the upstream URL
 */
function resolveUpstream(rawBase) {
    let parsed;
    try {
        parsed = new URL(String(rawBase).trim());
    } catch {
        throw new Error('接入点地址无效');
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ALLOW_PRIVATE)) {
        throw new Error('接入点必须使用 HTTPS');
    }
    if (!ALLOW_PRIVATE && isPrivateHost(parsed.hostname)) {
        throw new Error('不允许使用内网地址');
    }
    if (parsed.port && parsed.protocol === 'https:' && parsed.port !== '443') {
        throw new Error('仅支持 443 端口');
    }
    if (parsed.username || parsed.password) {
        throw new Error('接入点不应包含用户名密码');
    }
    let base = parsed.href.replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(base)) {
        base += '/chat/completions';
    }
    return new URL(base);
}

function sanitizeMessages(input) {
    if (!Array.isArray(input) || input.length === 0) {
        throw new Error('messages 不能为空');
    }
    if (input.length > MAX_MESSAGES) {
        throw new Error('消息过多');
    }
    let total = 0;
    const messages = [];
    for (const m of input) {
        if (!m || typeof m !== 'object') {
            throw new Error('消息格式无效');
        }
        const role = String(m.role || '');
        if (!['system', 'user', 'assistant'].includes(role)) {
            throw new Error('未知的消息角色');
        }
        const content = String(m.content ?? '');
        if (content.length > MAX_MESSAGE_CHARS) {
            throw new Error('单条消息过长');
        }
        total += content.length;
        if (total > MAX_TOTAL_CHARS) {
            throw new Error('对话内容过长');
        }
        messages.push({ role, content });
    }
    return messages;
}

function upstreamFetch(url, apiKey, payload, signal) {
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
    });
}

async function proxyChat(req, res, baseUrl, apiKey, model) {
    let messages;
    let temperature;
    let maxTokens;
    try {
        messages = sanitizeMessages(req.body?.messages);
        temperature = Math.min(2, Math.max(0, Number(req.body?.temperature ?? 0.9)));
        maxTokens = Math.min(4096, Math.max(16, Number(req.body?.max_tokens ?? 512) || 512));
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream;
    try {
        upstream = await upstreamFetch(baseUrl, apiKey, {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
        }, controller.signal);
    } catch (err) {
        clearTimeout(timer);
        return res.status(502).json({ error: '无法连接模型接入点' });
    }

    if (!upstream.ok) {
        clearTimeout(timer);
        let detail = '';
        try {
            const text = await upstream.text();
            detail = text.slice(0, 400).replace(apiKey, '***');
        } catch { /* ignore */ }
        return res.status(502).json({ error: `上游返回 ${upstream.status}`, detail });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    req.on('close', () => controller.abort());
    const reader = upstream.body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const ok = res.write(Buffer.from(value));
            if (!ok) {
                await new Promise((resolve) => res.once('drain', resolve));
            }
        }
        res.end();
    } catch {
        res.end();
    } finally {
        clearTimeout(timer);
    }
}

router.get('/status', (req, res) => {
    const sharedReady = Boolean(SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL);
    res.json({
        ai: sharedReady,
        model: sharedReady ? SHARED_MODEL : null,
        byok: true,
        version: '1.0',
    });
});

router.post('/probe', async (req, res) => {
    if (!rateLimit('byok', req)) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    try {
        const baseUrl = resolveUpstream(req.body?.base_url);
        const apiKey = String(req.body?.api_key || '').trim();
        const model = String(req.body?.model || '').trim();
        if (!apiKey || !model) {
            return res.status(400).json({ error: '需要 API Key 和模型 ID' });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30 * 1000);
        const upstream = await upstreamFetch(baseUrl, apiKey, {
            model,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
            stream: false,
        }, controller.signal);
        clearTimeout(timer);
        if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            return res.status(502).json({ ok: false, status: upstream.status, detail: text.slice(0, 300).replace(apiKey, '***') });
        }
        return res.json({ ok: true });
    } catch (err) {
        return res.status(400).json({ ok: false, error: err.message });
    }
});

router.post('/chat', async (req, res) => {
    const byokBase = req.headers['x-pt-base-url'];
    const byokKey = req.headers['x-pt-api-key'];
    const byokModel = req.headers['x-pt-model'];

    if (byokBase || byokKey) {
        if (!rateLimit('byok', req)) {
            return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
        }
        let baseUrl;
        try {
            baseUrl = resolveUpstream(byokBase);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
        return await proxyChat(req, res, baseUrl, String(byokKey || ''), String(byokModel || SHARED_MODEL || 'gpt-4o-mini'));
    }

    const sharedReady = Boolean(SHARED_BASE_URL && SHARED_API_KEY && SHARED_MODEL);
    if (!sharedReady) {
        return res.status(503).json({ error: '站点未配置共享模型，请在设置中接入自己的 API' });
    }
    if (!rateLimit('shared', req)) {
        return res.status(429).json({ error: '共享模型当前繁忙，请配置自己的接入点或稍后再试' });
    }
    return await proxyChat(req, res, resolveUpstream(SHARED_BASE_URL), SHARED_API_KEY, SHARED_MODEL);
});

router.post('/visit', (req, res) => {
    if (!rateLimit('visit', req)) {
        return res.json(stats);
    }
    stats.visits += 1;
    persistStats();
    res.json(stats);
});

router.get('/stats', (req, res) => {
    res.json(stats);
});

export default router;
