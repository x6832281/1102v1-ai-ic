/* 像素酒馆 · GET /api/pixel/sitemap —— 动态 sitemap.xml（按请求主机名） */
'use strict';

import { applySecurityHeaders, sendSitemap } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    sendSitemap(req, res);
}
