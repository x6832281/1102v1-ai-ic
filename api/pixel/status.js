/* 游戏酒馆 · GET /api/pixel/status —— 共享模型状态（不含任何密钥） */
'use strict';

import { applySecurityHeaders, sharedModelReady, sendJSON } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    const ready = sharedModelReady();
    sendJSON(res, 200, {
        ai: ready,
        model: ready ? (process.env.PIXEL_LLM_MODEL || null) : null,
        byok: true,
        version: '1.0',
    });
}
