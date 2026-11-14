#!/usr/bin/env node
/* ============================================================
 * 幻境回声 · EchoCraft — 角色卡编译器
 * 读取经典酒馆卡库（data/default-user/characters/*.png），
 * 提取 chara_card_v2 内嵌 JSON + echocraft 扩展，
 * 编译为门户数据 public/pixel-tavern/cards.js（window.PT_CARD_CHARACTERS）
 *
 * 角色数据源优先级：卡 PNG 内嵌 JSON > tools/card-overrides/<file>.json
 * （卡 PNG 缺失时（如新 clone），若补充文件含 content 字段则用它兜底）
 *
 * 用法：node tools/build-cards.mjs
 * 产出：public/pixel-tavern/cards.js（生成物，提交到仓库；请勿手改）
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'data', 'default-user', 'characters');
const OVERRIDE_DIR = path.join(__dirname, 'card-overrides');
const OUT = path.join(ROOT, 'public', 'pixel-tavern', 'cards.js');

/* ---------- PNG tEXt 提取（与 market.js 浏览器版同逻辑） ---------- */
function readCardJSON(buf) {
    let off = 8;
    while (off + 12 <= buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        if (type === 'tEXt') {
            const nul = buf.indexOf(0, off + 8);
            const key = buf.toString('ascii', off + 8, nul);
            if (key === 'chara' || key === 'ccv3') {
                const raw = buf.slice(nul + 1, off + 8 + len).toString('latin1');
                return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
            }
        }
        off += 12 + len;
    }
    return null;
}

/* ---------- 门户角色形状编译 ---------- */
function compile(d, file, override) {
    d = d.data || d; /* chara_card_v2/v3 外层为 {spec, spec_version, data:{…}} */
    const ext = (d.extensions && d.extensions.echocraft) || {};
    const ov = override && override.portal ? override.portal : {};
    const description = d.description || (override?.content?.description) || '';
    const first = d.first_mes || (override?.content?.first_mes) || '';
    const personality = d.personality || (override?.content?.personality) || '';
    const scenario = d.scenario || (override?.content?.scenario) || '';

    const descParts = [description];
    if (personality) descParts.push('性格：' + personality);
    if (scenario) descParts.push('场景：' + scenario);

    /* 剧本：卡内扩展优先，补充文件次之；关键词源码编译为 RegExp */
    const scriptSrc = ext.script || ov.script || null;
    let script;
    if (scriptSrc) {
        script = {
            track: scriptSrc.track || '',
            keywords: (scriptSrc.keywords || []).map(([src, reply]) => {
                try { return [new RegExp(src), reply]; } catch { return null; }
            }).filter(Boolean),
            fallbacks: scriptSrc.fallbacks || [],
            options: scriptSrc.options || [],
        };
    }

    const cardAlts = (d.alternate_greetings && d.alternate_greetings.length) ? d.alternate_greetings : (ov.alts || []);
    const alts = [first, ...cardAlts];

    return {
        id: 'card-' + path.basename(file, '.png').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: d.name,
        title: ext.title || ov.title || '',
        category: ext.category || ov.category || 'fantasy',
        seed: ext.seed ?? ov.seed ?? 1,
        tags: d.tags && d.tags.length ? d.tags : (ov.tags || []),
        desc: descParts.filter(Boolean).join('\n\n'),
        example: d.mes_example || '',
        greeting: first,
        alts,
        palette: ext.palette || ov.palette || { hair: '#e8c97a', bg1: '#3a5a40', skin: '#f2d3b3' },
        avatar: ext.avatar || ov.avatar || null,
        lore: ext.lore || ov.lore || null,
        script,
        origin: 'builtin',
        cardFile: file,
        source: 'card-v2',
    };
}

/* ---------- 主流程 ---------- */
if (!fs.existsSync(SRC_DIR)) {
    console.error(`卡库目录不存在：${SRC_DIR}\n请先运行 node tools/make-demo-cards.mjs 或启动一次服务器。`);
    process.exit(1);
}
const files = fs.readdirSync(SRC_DIR).filter(f => f.toLowerCase().endsWith('.png'));
const built = [];
for (const file of files) {
    const overridePath = path.join(OVERRIDE_DIR, file + '.json');
    const override = fs.existsSync(overridePath) ? JSON.parse(fs.readFileSync(overridePath, 'utf8')) : null;

    let data = null;
    try { data = readCardJSON(fs.readFileSync(path.join(SRC_DIR, file))); } catch { /* fallthrough */ }
    if (!data) {
        /* 卡 PNG 缺失/损坏：用补充文件的 content 兜底 */
        if (override && override.content) {
            data = { data: { name: path.basename(file, '.png'), ...override.content, extensions: {} } };
            console.warn(`⚠ ${file} 无法从卡库读取，使用 card-overrides 兜底内容`);
        } else {
            console.warn(`⚠ 跳过 ${file}（未找到 chara/ccv3 数据块，也无兜底内容）`);
            continue;
        }
    }
    const c = compile(data, file, override);
    if (!c.name || !c.greeting) { console.warn(`⚠ 跳过 ${file}（name/first_mes 缺失）`); continue; }
    built.push(c);
    console.log(`✓ ${c.id.padEnd(20)} ${c.name}（${c.title || '角色卡'}）desc:${c.desc.length}字 alts:${c.alts.length}${c.script ? ' 剧本✓' : ''}`);
}
/* 自有扩展卡在前，外来卡（如官方卡）在后，同组按文件名排序 */
built.sort((a, b) => (a.source === 'card-v2' && a.script ? 0 : 1) - (b.source === 'card-v2' && b.script ? 0 : 1) || a.cardFile.localeCompare(b.cardFile));

const banner = `/* ============================================================
 * 幻境回声 · EchoCraft — 门户角色数据（生成物，勿手改）
 * 来源：data/default-user/characters/*.png（经典酒馆卡库，唯一角色数据源）
 * 重新生成：node tools/make-demo-cards.mjs && node tools/build-cards.mjs
 * 生成时间：${new Date().toISOString()}
 * ============================================================ */
'use strict';

`;
/* RegExp 在 JSON.stringify 中会丢成 {}，先换成占位符再还原为 new RegExp(...) */
const finalBody = 'window.PT_CARD_CHARACTERS = ' + JSON.stringify(built, (k, v) => (v instanceof RegExp ? '__RE_' + v.source + '_RE__' : v), 4).replace(/"__RE_(.*?)_RE__"/g, (m, src) => {
    /* 源码里的反斜杠已由 JSON 编码保护，直接还原为 RegExp 字面量形式 */
    return 'new RegExp(' + JSON.stringify(src) + ')';
}, 'utf8') + ';\n';
fs.writeFileSync(OUT, banner + finalBody);

const total = built.reduce((n, c) => n + c.desc.length + c.alts.join('').length + (c.example || '').length, 0);
console.log(`\n完成：${built.length} 位角色 → ${path.relative(ROOT, OUT)}（正文 ${total} 字）`);
console.log('门户 data.js 将以 window.PT_CARD_CHARACTERS 为角色数据源。');
