#!/usr/bin/env node
/* ============================================================
 * 游戏酒馆 · 冒烟测试
 * 用法：node tools/smoke.mjs
 * 覆盖：文件完整性 / JS 语法 / 角色数据不变量 / HTML 资源引用 /
 *       CSS 结构 / 服务器路由与角色卡 API（服务器未启动时自动跳过）
 * 退出码：0 全部通过，1 存在失败
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PT = path.join(ROOT, 'public', 'pixel-tavern');
const BASE = 'http://127.0.0.1:8000';
let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(t) { console.log(`\n■ ${t}`); }

/* ---------- 1. 文件完整性 ---------- */
section('文件完整性');
['index.html', 'style.css', 'app.js', 'chat.js', 'market.js', 'cards.js', 'data.js', 'avatars.js', 'jukebox.js', 'fonts/zpix-subset.woff2']
    .forEach(f => check(`存在 ${f}`, fs.existsSync(path.join(PT, f))));

/* ---------- 2. JS 语法 ---------- */
section('JS 语法（node --check）');
['cards.js', 'app.js', 'chat.js', 'market.js', 'data.js', 'avatars.js', 'jukebox.js'].forEach(f => {
    try {
        execFileSync(process.execPath, ['--check', path.join(PT, f)], { stdio: 'pipe' });
        check(`语法 ${f}`, true);
    } catch (e) {
        check(`语法 ${f}`, false, (e.stderr ? e.stderr.toString() : e.message).split('\n')[0]);
    }
});

/* ---------- 3. 角色数据不变量（卡库编译产物 cards.js 为唯一角色源） ---------- */
section('角色数据不变量（卡库编译产物）');
try {
    const cardsSrc = fs.readFileSync(path.join(PT, 'cards.js'), 'utf8');
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(cardsSrc, sandbox);   /* cards.js 先载入：window.PT_CARD_CHARACTERS */
    vm.runInContext(fs.readFileSync(path.join(PT, 'data.js'), 'utf8'), sandbox);
    const chars = sandbox.window.PT_CHARACTERS || [];
    const cats = sandbox.window.PT_CATEGORIES || [];
    check('cards.js 为生成物（含勿手改标记）', cardsSrc.includes('生成物，勿手改'));
    check(`分类 ≥ 8（实际 ${cats.length}）`, cats.length >= 8);
    check(`内置角色 ≥ 9（实际 ${chars.length}）`, chars.length >= 9);
    const ids = chars.map(c => c.id);
    check('角色 id 唯一', new Set(ids).size === ids.length);
    check('角色 id 以 card- 开头（卡源标记）', chars.every(c => typeof c.id === 'string' && c.id.startsWith('card-')));
    check('分类 id 均有定义', chars.every(c => cats.some(k => k.id === c.category)));
    check('每位角色有 greeting', chars.every(c => typeof c.greeting === 'string' && c.greeting.length > 0));
    check('每位角色有剧本 fallbacks', chars.every(c => c.script && Array.isArray(c.script.fallbacks) && c.script.fallbacks.length > 0));
    check('每位角色有调色板', chars.every(c => c.palette && c.palette.hair && c.palette.bg1 && c.palette.skin));
    check('轮换开场白二段化', chars.every(c => Array.isArray(c.alts) && c.alts.length >= 2));
    check('剧本关键词均为合法正则', chars.every(c => (c.script.keywords || []).every(([re]) => { try { new RegExp(re.source ?? re); return true; } catch { return false; } })));
    check('角色人设量级（合计正文 ≥ 12000 字）', chars.reduce((n, c) => n + c.desc.length + c.alts.join('').length + (c.example || '').length, 0) >= 12000);
    check('每位角色有设定集 lore ≥ 3 条', chars.every(c => Array.isArray(c.lore) && c.lore.length >= 3));
    check('lore 条目含 keys 与 text', chars.every(c => c.lore.every(e => typeof e.keys === 'string' && typeof e.text === 'string' && e.text.length > 20)));
    const jbSrc = fs.readFileSync(path.join(PT, 'jukebox.js'), 'utf8');
    check('点唱机曲目 ≥ 7', (jbSrc.match(/name: '/g) || []).length >= 7);
    check('工坊含设定集输入 build-lore', fs.readFileSync(path.join(PT, 'index.html'), 'utf8').includes('build-lore'));
    check('存在 docs/CREDITS.md 许可证文档', fs.existsSync(path.join(ROOT, 'docs', 'CREDITS.md')));
} catch (e) {
    check('卡库数据可在 vm 沙箱执行', false, e.message);
}

/* ---------- 4. HTML 资源引用 ---------- */
section('HTML 资源引用');
try {
    const html = fs.readFileSync(path.join(PT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(\/pixel-tavern\/[^"]+)"/g)].map(m => m[1]);
    check(`存在站内资源引用（${refs.length} 个）`, refs.length >= 5);
    refs.forEach(r => {
        const rel = r.replace('/pixel-tavern/', '').split('?')[0];
        check(`引用存在 ${r}`, fs.existsSync(path.join(PT, rel)));
    });
    const cleaned = html.replace(/(?:src|href)="(?:https?:|\/|#|data:)[^"]*"/g, '');
    check('无相对路径资源引用（部署在 / 下）', !/(?:src|href)="(?!https?:|\/|#|data:)[^"]*"/.test(cleaned));
} catch (e) {
    check('index.html 可读', false, e.message);
}

/* ---------- 5. CSS 结构 ---------- */
section('CSS 结构');
try {
    const css = fs.readFileSync(path.join(PT, 'style.css'), 'utf8');
    const open = (css.match(/{/g) || []).length;
    const close = (css.match(/}/g) || []).length;
    check(`CSS 花括号平衡（${open}/${close}）`, open === close);
    check('CSS 非空且体积合理', css.length > 10000 && css.length < 100000, `${css.length}B`);
} catch (e) {
    check('style.css 可读', false, e.message);
}

/* ---------- 5.5 经典酒馆主题 ---------- */
section('经典酒馆主题');
try {
    const themePath = path.join(ROOT, 'data', 'default-user', 'themes', 'Game Tavern.json');
    const theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
    check('主题文件合法且含 custom_css', theme.name === 'Game Tavern' && typeof theme.custom_css === 'string' && theme.custom_css.length > 50);
} catch (e) {
    check('主题文件合法且含 custom_css', false, e.message);
}

/* ---------- 5.6 上线能力（V1.3 明炉真火） ---------- */
section('上线能力（真实模型 / SEO / 部署套件）');
try {
    /* 品牌 PNG */
    const pngSig = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    const brand = path.join(PT, 'brand');
    for (const [f, w, h] of [['icon-32.png', 32, 32], ['icon-64.png', 64, 64], ['icon-192.png', 192, 192], ['icon-512.png', 512, 512], ['og-banner.png', 1200, 630]]) {
        const buf = fs.readFileSync(path.join(brand, f));
        check(`品牌 ${f} PNG 合法`, pngSig(buf) && buf.readUInt32BE(16) === w && buf.readUInt32BE(20) === h);
    }
    /* webmanifest */
    const man = JSON.parse(fs.readFileSync(path.join(PT, 'site.webmanifest'), 'utf8'));
    check('site.webmanifest 合法且含图标', man.name?.includes('幻境回声') && Array.isArray(man.icons) && man.icons.length >= 2);
    /* HTML：SEO 与新 UI */
    const html = fs.readFileSync(path.join(PT, 'index.html'), 'utf8');
    ['og:title', 'og:image', 'twitter:card', 'site.webmanifest', 'pt-canonical'].forEach(k => check(`HTML 含 ${k}`, html.includes(k)));
    ['ai-base', 'ai-key', 'ai-model', 'btn-ai-test', 'set-ai', 'ai-status'].forEach(id => check(`HTML 含设置元素 #${id}`, html.includes(`id="${id}"`)));
    check('HTML 含版本徽标 #version-badge', html.includes('id="version-badge"'));
    check('HTML 含合规声明（隐私/版权/未成年人）', html.includes('隐私声明') && html.includes('版权声明') && html.includes('未成年人'));
    /* EchoCraft V2.0 视觉体系（青色回声弧 + 深空底） */
    check('HTML 含 EchoCraft 品牌标识', html.includes('幻境回声') && html.includes('EchoCraft'));
    const css2 = fs.readFileSync(path.join(PT, 'style.css'), 'utf8');
    check('CSS 含 EchoCraft 设计令牌', /#00d1b2|--ec-/.test(css2) || css2.includes('EchoCraft'));
    /* chat.js / app.js AI 管线 */
    const chatSrc = fs.readFileSync(path.join(PT, 'chat.js'), 'utf8');
    check('chat.js 含流式 AI 回复管线', chatSrc.includes('aiStreamReply') && chatSrc.includes('/api/pixel/chat'));
    check('chat.js 含剧本回退', chatSrc.includes('scriptReply'));
    const appSrc = fs.readFileSync(path.join(PT, 'app.js'), 'utf8');
    check('app.js 含 AI 状态渲染与访问计数 API', appSrc.includes('renderAIStatus') && appSrc.includes('/api/pixel/visit'));
    /* 服务端 */
    const pixelSrc = path.join(ROOT, 'src', 'endpoints', 'pixel.js');
    check('存在 src/endpoints/pixel.js', fs.existsSync(pixelSrc));
    execFileSync(process.execPath, ['--check', pixelSrc], { stdio: 'pipe' });
    check('语法 pixel.js', true);
    const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'server-main.js'), 'utf8');
    check('server-main 挂载 /api/pixel', mainSrc.includes("'/api/pixel'"));
    check('server-main 动态 robots/sitemap 路由', mainSrc.includes('/robots.txt') && mainSrc.includes('/sitemap.xml'));
    /* 部署套件 */
    const deploy = path.join(ROOT, 'deploy');
    ['docker-compose.yml', 'Caddyfile', '.env.example', 'README-DEPLOY.md', path.join('config', 'config.yaml'), path.join('lite', 'server.mjs')]
        .forEach(f => check(`部署套件存在 ${f}`, fs.existsSync(path.join(deploy, f))));
    execFileSync(process.execPath, ['--check', path.join(deploy, 'lite', 'server.mjs')], { stdio: 'pipe' });
    check('语法 lite/server.mjs', true);
    const compose = fs.readFileSync(path.join(deploy, 'docker-compose.yml'), 'utf8');
    check('compose 含 PIXEL_LLM 透传', compose.includes('PIXEL_LLM_API_KEY') && compose.includes('caddy'));
    const caddy = fs.readFileSync(path.join(deploy, 'Caddyfile'), 'utf8');
    check('Caddyfile 公开像素路径并保护其余', caddy.includes('/api/pixel/*') && caddy.includes('basic_auth'));
    const prodCfg = fs.readFileSync(path.join(deploy, 'config', 'config.yaml'), 'utf8');
    check('生产配置：listen 开 / 白名单关 / CSRF 保持', /^listen: true/m.test(prodCfg) && /^whitelistMode: false/m.test(prodCfg) && /^disableCsrfProtection: false/m.test(prodCfg));
    /* 数据版本 */
    const dataSrc = fs.readFileSync(path.join(PT, 'data.js'), 'utf8');
    check('PT_NEWS 结构完整（version/codename）', /const PT_NEWS = \{/.test(dataSrc) && /version: '/.test(dataSrc) && /codename: '/.test(dataSrc));
    /* 卡库管线（角色数据源工具链，V2.1 卡源合一） */
    ['make-demo-cards.mjs', 'build-cards.mjs', 'make-card-covers.mjs'].forEach(f => check(`卡库工具存在 tools/${f}`, fs.existsSync(path.join(ROOT, 'tools', f))));
    check('Seraphina 门户补充文件存在', fs.existsSync(path.join(ROOT, 'tools', 'card-overrides', 'default_Seraphina.png.json')));
    check('门户背景场景 bg-echo.png 存在', fs.existsSync(path.join(PT, 'bg-echo.png')));
    const avSrc = fs.readFileSync(path.join(PT, 'avatars.js'), 'utf8');
    check('肖像引擎为 24×28 具象半身像', avSrc.includes('buildGrid') && avSrc.includes('青琥珀双缘光'));
    check('CSS 引用背景场景', fs.readFileSync(path.join(PT, 'style.css'), 'utf8').includes('bg-echo.png'));
    check('data.js 角色源指向卡库编译产物', dataSrc.includes('window.PT_CARD_CHARACTERS'));
    const webCardDir = path.join(ROOT, 'public', 'web', 'sites', 'echocraft', 'cards');
    const webCards = fs.existsSync(webCardDir) ? fs.readdirSync(webCardDir).filter(f => f.startsWith('card-') && f.endsWith('.png')) : [];
    check(`/web 卡封面 ≥ 9（实际 ${webCards.length}）`, webCards.length >= 9);
    const webHtml = fs.existsSync(path.join(ROOT, 'public', 'web', 'index.html')) ? fs.readFileSync(path.join(ROOT, 'public', 'web', 'index.html'), 'utf8') : '';
    check('/web 含 V2.2 琉璃像馆公告', webHtml.includes('琉璃像馆'));
    /* Vercel Serverless 版像素 API（ai-ic.top 自动部署路径） */
    const apiDir = path.join(ROOT, 'api', 'pixel');
    const apiFiles = ['_lib.js', 'chat.js', 'status.js', 'probe.js', 'visit.js', 'stats.js', 'seo.js'];
    apiFiles.forEach(f => check(`Vercel 函数存在 api/pixel/${f}`, fs.existsSync(path.join(apiDir, f))));
    apiFiles.forEach(f => {
        try {
            execFileSync(process.execPath, ['--check', path.join(apiDir, f)], { stdio: 'pipe' });
            check(`语法 api/pixel/${f}`, true);
        } catch (e) {
            check(`语法 api/pixel/${f}`, false, (e.stderr ? e.stderr.toString() : e.message).split('\n')[0]);
        }
    });
    const vjson = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const vred = Array.isArray(vjson.redirects) ? vjson.redirects : [];
    check('vercel.json / 门户路由（redirects 先于 filesystem）', vred.some(x => x.source === '/' && x.destination === '/pixel-tavern'));
    check('vercel.json robots/sitemap 路由', vred.some(x => x.source === '/robots.txt') && vred.some(x => x.source === '/sitemap.xml'));
    const chatFn = fs.readFileSync(path.join(apiDir, 'chat.js'), 'utf8');
    check('chat 函数限时长（maxDuration）', chatFn.includes('maxDuration'));
} catch (e) {
    check('上线能力检查可执行', false, e.message);
}

/* ---------- 6. 服务器检查（未启动则跳过） ---------- */
section('服务器检查');
async function main() {
    let serverUp = false;
    try {
        const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(4000) });
        serverUp = res.ok;
        check('GET / 可访问', res.ok);
        if (res.ok) {
            const text = await res.text();
            check('首页为项目门户', text.includes('/pixel-tavern/index.html') || text.includes('游戏酒馆') || text.includes('幻境回声') || text.includes('EchoCraft'));
        }
    } catch {
        check('GET / 可访问', false, '服务器未运行——跳过其余服务器检查');
    }

    if (serverUp) {
        try {
            const classic = await fetch(`${BASE}/?classic=1`, { signal: AbortSignal.timeout(6000) });
            check('GET /?classic=1 → 200', classic.ok);
        } catch (e) { check('GET /?classic=1 → 200', false, e.message); }

        try {
            const font = await fetch(`${BASE}/pixel-tavern/fonts/zpix-subset.woff2`, { signal: AbortSignal.timeout(6000) });
            check('像素字体可访问', font.ok);
        } catch (e) { check('像素字体可访问', false, e.message); }

        try {
            const tokenRes = await fetch(`${BASE}/csrf-token`, { signal: AbortSignal.timeout(4000) });
            const cookies = (tokenRes.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
            const { token } = await tokenRes.json();
            const res = await fetch(`${BASE}/api/characters/all`, {
                method: 'POST',
                headers: { 'X-CSRF-Token': token, Cookie: cookies, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(6000),
            });
            const chars = await res.json();
            check(`经典酒馆角色卡 ≥ 8（实际 ${Array.isArray(chars) ? chars.length : '非数组'}）`, Array.isArray(chars) && chars.length >= 8);
        } catch (e) { check('经典酒馆角色卡 API', false, e.message); }
    }

    console.log(`\n结果：${pass} 通过，${fail} 失败${serverUp ? '' : '（服务器未启动，部分检查跳过）'}`);
    if (failures.length) {
        console.log('\n失败项：');
        failures.forEach(f => console.log('  - ' + f));
    }
    process.exit(fail ? 1 : 0);
}
await main();
