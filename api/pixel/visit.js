/* 游戏酒馆 · POST /api/pixel/visit —— 全站访问计数 +1 */
'use strict';

import { applySecurityHeaders, rateLimit, clientIp, bumpVisits, getStats, sendJSON } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    if (req.method !== 'POST') {
        return sendJSON(res, 405, { error: 'Method Not Allowed' });
    }
    /* 被限流的请求不递增，仅返回当前计数 */
    const result = rateLimit('visit', clientIp(req)) ? bumpVisits() : getStats();
    sendJSON(res, 200, result);
}
