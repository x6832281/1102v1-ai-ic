/* 像素酒馆 · GET /api/pixel/robots —— 动态 robots.txt（按请求主机名） */
'use strict';

import { applySecurityHeaders, sendRobots } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    sendRobots(req, res);
}
