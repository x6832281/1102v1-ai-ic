/* 游戏酒馆 · POST /api/pixel/probe —— BYOK 接入点连通性测试 */
'use strict';

import { applySecurityHeaders, sameOrigin, rateLimit, clientIp, resolveUpstream, readJSONBody, sendJSON } from './_lib.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
    applySecurityHeaders(res);
    if (req.method !== 'POST') {
        return sendJSON(res, 405, { ok: false, error: 'Method Not Allowed' });
    }
    if (!sameOrigin(req)) {
        return sendJSON(res, 403, { ok: false, error: '跨站请求被拒绝' });
    }
    if (!rateLimit('byok', clientIp(req))) {
        return sendJSON(res, 429, { ok: false, error: '请求过于频繁，请稍后再试' });
    }
    let body;
    try {
        body = await readJSONBody(req);
    } catch (err) {
        return sendJSON(res, 400, { ok: false, error: err.message });
    }
    try {
        const baseUrl = resolveUpstream(body?.base_url);
        const apiKey = String(body?.api_key || '').trim();
        const model = String(body?.model || '').trim();
        if (!apiKey || !model) {
            return sendJSON(res, 400, { ok: false, error: '需要 API Key 和模型 ID' });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25 * 1000);
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
