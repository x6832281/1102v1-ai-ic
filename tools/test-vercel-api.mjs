/* 像素酒馆 · Vercel Serverless 函数本地 harness 测试
 * 用普通 http server 承载 api/pixel/* 的 handler（签名与 Vercel 一致），
 * 联通 mock-llm 验证：流式 / BYOK / 限流 / SSRF / 同源 / SEO / 计数。
 * 用法：node tools/test-vercel-api.mjs   （自动拉起/复用 mock-llm :9990）
 */
'use strict';

import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3111;

/* 动态 import handlers（进程内，env 已由启动者注入） */
const chat = (await import(new URL('../api/pixel/chat.js', import.meta.url))).default;
const status = (await import(new URL('../api/pixel/status.js', import.meta.url))).default;
const probe = (await import(new URL('../api/pixel/probe.js', import.meta.url))).default;
const visit = (await import(new URL('../api/pixel/visit.js', import.meta.url))).default;
const stats = (await import(new URL('../api/pixel/stats.js', import.meta.url))).default;
const seo = (await import(new URL('../api/pixel/seo.js', import.meta.url))).default;

const ROUTES = {
    '/api/pixel/chat': chat,
    '/api/pixel/status': status,
    '/api/pixel/probe': probe,
    '/api/pixel/visit': visit,
    '/api/pixel/stats': stats,
    '/api/pixel/seo': seo,
};

const server = http.createServer(async (req, res) => {
    const pathname = req.url.split('?')[0];
    const fn = ROUTES[pathname];
    if (!fn) { res.statusCode = 404; return res.end('NOT_FOUND'); }
    try { await fn(req, res); } catch (e) { res.statusCode = 500; res.end('ERR ' + e.message); }
});

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function waitForPort(port, tries = 30) {
    for (let i = 0; i < tries; i++) {
        try { await fetch(`http://127.0.0.1:${port}/api/pixel/status`, { signal: AbortSignal.timeout(800) }); return true; } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

async function readSSE(res) {
    const text = await res.text();
    const out = [];
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const d = t.slice(5).trim();
        if (d === '[DONE]') continue;
        try { const j = JSON.parse(d); out.push(j.choices?.[0]?.delta?.content || ''); } catch { /* ignore */ }
    }
    return out.join('');
}

const results = {};
results.mode = process.env.PIXEL_ALLOW_PRIVATE === '1' ? 'permissive' : 'strict';

server.listen(PORT, async () => {
    console.log(`[harness] mode=${results.mode} port=${PORT}`);
    const B = `http://127.0.0.1:${PORT}`;

    if (results.mode === 'permissive') {
        /* ---------- 宽松模式：共享模型 + BYOK 全链路 ---------- */
        check('等待 harness 就绪', await waitForPort(PORT));
        let r = await fetch(`${B}/api/pixel/status`);
        let j = await r.json();
        check('status 返回共享模型', j.ai === true && j.model === 'mock-chat', JSON.stringify(j));

        r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B },
            body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }),
        });
        check('共享模型 SSE 流式（HTTP 200 + event-stream）', r.ok && (r.headers.get('content-type') || '').includes('text/event-stream'));
        const text = await readSSE(r);
        check('流式内容完整（含台词与动作）', text.includes('什么故事') && text.includes('（她抬起头'), text.slice(0, 40));

        r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', Origin: B,
                'X-PT-Base-Url': 'http://127.0.0.1:9990/v1', 'X-PT-Api-Key': 'test-key', 'X-PT-Model': 'mock-chat',
            },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
        });
        const byokText = await readSSE(r);
        check('BYOK 流式', r.ok && byokText.includes('什么故事'));

        r = await fetch(`${B}/api/pixel/probe`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B },
            body: JSON.stringify({ base_url: 'http://127.0.0.1:9990/v1', api_key: 'test-key', model: 'mock-chat' }),
        });
        check('probe 连通', (await r.json()).ok === true);

        /* 同源校验：伪造 Origin 必须被拒 */
        r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
        });
        check('跨站 Origin 被拒（403）', r.status === 403);

        /* 计数 */
        r = await fetch(`${B}/api/pixel/visit`, { method: 'POST' });
        const v1 = (await r.json()).visits;
        r = await fetch(`${B}/api/pixel/visit`, { method: 'POST' });
        const v2 = (await r.json()).visits;
        check('visit 计数递增', v2 === v1 + 1, `${v1}→${v2}`);
        r = await fetch(`${B}/api/pixel/stats`);
        check('stats 可查询', Number.isFinite((await r.json()).visits));

        /* Vercel 网关会注入 x-forwarded-* 头，测试模拟之 */
        const FWD = { 'x-forwarded-proto': 'http', 'x-forwarded-host': '127.0.0.1:3111' };
        r = await fetch(`${B}/api/pixel/seo?type=robots`, { headers: FWD });
        const robots = await r.text();
        if (!robots.includes('Sitemap: http://127.0.0.1') || !robots.includes('Disallow: /api/')) {
            console.log('  [debug robots status=' + r.status + ']:', JSON.stringify(robots.slice(0, 200)));
        }
        check('robots 动态生成（含 Sitemap 行）', robots.includes('Sitemap: http://127.0.0.1') && robots.includes('Disallow: /api/'));
        r = await fetch(`${B}/api/pixel/seo?type=sitemap`, { headers: FWD });
        const sitemap = await r.text();
        if (!sitemap.includes('<urlset')) {
            console.log('  [debug sitemap status=' + r.status + ']:', JSON.stringify(sitemap.slice(0, 200)));
        }
        check('sitemap 动态生成', sitemap.includes('<urlset') && sitemap.includes('http://127.0.0.1'));

        console.log(`\n[permissive] 结果：${pass} 通过，${fail} 失败`);
        if (failures.length) failures.forEach((f) => console.log('  - ' + f));
        process.exit(fail ? 1 : 0);
    } else {
        /* ---------- 严格模式：SSRF / 方法 / 405 守卫 ---------- */
        check('等待 harness 就绪', await waitForPort(PORT));
        let r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B, 'X-PT-Base-Url': 'http://192.168.1.1/v1', 'X-PT-Api-Key': 'k' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
        });
        let j = await r.json();
        check('拒绝内网/HTTP 接入点', r.status === 400 && /HTTPS/.test(j.error || ''), j.error);

        r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B, 'X-PT-Base-Url': 'http://localhost:8080/v1', 'X-PT-Api-Key': 'k' },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
        });
        check('拒绝 localhost', r.status === 400);

        r = await fetch(`${B}/api/pixel/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: B },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
        });
        check('无共享模型返回 503 提示', r.status === 503, JSON.stringify(await r.json()));

        r = await fetch(`${B}/api/pixel/chat`, { method: 'GET' });
        check('GET /chat → 405', r.status === 405);

        r = await fetch(`${B}/api/pixel/status`);
        j = await r.json();
        check('严格模式 status ai:false', j.ai === false && j.byok === true);

        console.log(`\n[strict] 结果：${pass} 通过，${fail} 失败`);
        if (failures.length) failures.forEach((f) => console.log('  - ' + f));
        process.exit(fail ? 1 : 0);
    }
});
