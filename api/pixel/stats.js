/* 游戏酒馆 · GET /api/pixel/stats —— 全站访问计数查询 */
'use strict';

import { applySecurityHeaders, getStats, sendJSON } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    sendJSON(res, 200, getStats());
}
