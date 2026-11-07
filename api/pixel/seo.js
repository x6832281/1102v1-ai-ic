/* 像素酒馆 · GET /api/pixel/seo?type=robots|sitemap —— 动态 SEO 文件（按请求主机名生成） */
'use strict';

import { applySecurityHeaders, sendRobots, sendSitemap, sendJSON } from './_lib.js';

export default function handler(req, res) {
    applySecurityHeaders(res);
    const type = new URL(req.url, 'http://local').searchParams.get('type');
    if (type === 'robots') return sendRobots(req, res);
    if (type === 'sitemap') return sendSitemap(req, res);
    return sendJSON(res, 404, { error: 'Not Found' });
}
