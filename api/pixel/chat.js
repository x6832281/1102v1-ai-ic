/* 游戏酒馆 · POST /api/pixel/chat —— 流式聊天代理（共享模型或 BYOK） */
'use strict';

import {
    applySecurityHeaders, sameOrigin, rateLimit, clientIp,
    resolveUpstream, sharedModelReady, readJSONBody, sendJSON, proxyChat,
    SHARED_BASE_URL, SHARED_API_KEY, SHARED_MODEL,
} from './_lib.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
    applySecurityHeaders(res);
    if (req.method !== 'POST') {
        return sendJSON(res, 405, { error: 'Method Not Allowed' });
    }
    if (!sameOrigin(req)) {
        return sendJSON(res, 403, { error: '跨站请求被拒绝' });
    }
    const ip = clientIp(req);
    const byokBase = req.headers['x-pt-base-url'];
    const byokKey = req.headers['x-pt-api-key'];
    const byokModel = req.headers['x-pt-model'];
    let body;
    try {
        body = await readJSONBody(req);
    } catch (err) {
        return sendJSON(res, 400, { error: err.message });
    }

    if (byokBase || byokKey) {
        if (!rateLimit('byok', ip)) {
            return sendJSON(res, 429, { error: '请求过于频繁，请稍后再试' });
        }
        let baseUrl;
        try { baseUrl = resolveUpstream(byokBase); } catch (err) { return sendJSON(res, 400, { error: err.message }); }
        return await proxyChat(req, res, baseUrl, String(byokKey || ''), String(byokModel || 'gpt-4o-mini'), body);
    }

    if (!sharedModelReady()) {
        return sendJSON(res, 503, { error: '站点未配置共享模型，请在设置中接入自己的 API' });
    }
    if (!rateLimit('shared', ip)) {
        return sendJSON(res, 429, { error: '共享模型当前繁忙，请配置自己的接入点或稍后再试' });
    }
    return await proxyChat(req, res, resolveUpstream(SHARED_BASE_URL), SHARED_API_KEY, SHARED_MODEL, body);
}
