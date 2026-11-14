#!/usr/bin/env node
/* ============================================================
 * 幻境回声 · EchoCraft — 角色封面海报生成器（零依赖，纯 Node）
 * 为卡库角色（public/pixel-tavern/cards.js 的 9 位）生成
 * 512×640 竖版海报：深空底 + 回声弧 + 棱镜 + 16 格像素肖像放大
 * 输出：../ai-website-cloner-template/public/sites/echocraft/cards/card-*.png
 * 用法：node tools/make-card-covers.mjs
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(__dirname, '..', '..', 'ai-website-cloner-template', 'public', 'sites', 'echocraft', 'cards');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 画布 ---------- */
function makeCanvas(w, h) {
    const px = Buffer.alloc(w * h * 4);
    const set = (x, y, c, a = 255) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const o = (y * w + x) * 4, sa = a / 255;
        px[o] = Math.round(c[0] * sa + px[o] * (1 - sa));
        px[o + 1] = Math.round(c[1] * sa + px[o + 1] * (1 - sa));
        px[o + 2] = Math.round(c[2] * sa + px[o + 2] * (1 - sa));
        px[o + 3] = Math.max(px[o + 3], 255);
    };
    const rect = (x, y, rw, rh, c, a = 255) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c, a); };
    const arc = (cx, cy, r, a0, a1, color, width, alpha = 255) => {
        const steps = Math.max(64, Math.round(r * 4));
        for (let s = 0; s <= steps; s++) {
            const ang = a0 + (a1 - a0) * (s / steps);
            for (let t = 0; t < width; t++) set(cx + Math.cos(ang) * (r + t), cy + Math.sin(ang) * (r + t), color, alpha);
        }
    };
    const seg = (x0, y0, x1, y1, color, width, alpha = 255) => {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let s = 0; s <= steps; s++) {
            const x = x0 + (x1 - x0) * (s / steps), y = y0 + (y1 - y0) * (s / steps);
            for (let t = 0; t < width; t++) set(x + t * 0.5, y, color, alpha);
        }
    };
    const glow = (cx, cy, r, color, alpha) => {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            const d = Math.sqrt(i * i + j * j) / r;
            if (d <= 1) set(cx + i, cy + j, color, Math.round(alpha * (1 - d)));
        }
    };
    return { px, set, rect, arc, seg, glow, w, h };
}

/* ---------- 调色 ---------- */
const C = {
    deep: [8, 13, 20], teal: [0, 209, 178], tealSoft: [102, 212, 190],
    amber: [245, 158, 11], amberHi: [253, 200, 96],
    white: [255, 255, 255], line: [30, 42, 54],
};
function hexRGB(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(c, amt) { const [r, g, b] = hexRGB(c); const cl = v => Math.max(0, Math.min(255, v + amt)); return [cl(r), cl(g), cl(b)]; }

/* ---------- 16 格像素肖像（与 make-demo-cards 同构图，可换调色板） ---------- */
/* 返回 { grid, mask }：mask 标记人物主体格（海报只画人物，不画场景底） */
function portraitGrid(pal, seed) {
    const P = { hair: hexRGB(pal.hair), bg1: hexRGB(pal.bg1), skin: hexRGB(pal.skin) };
    const G = 16, grid = [], mask = [];
    for (let y = 0; y < G; y++) { grid.push([]); mask.push([]); for (let x = 0; x < G; x++) { grid[y].push(null); mask[y].push(false); } }
    let s = (seed * 7919) >>> 0 || 1;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < G && y < G) { grid[y][x] = c; mask[y][x] = true; } };
    const bg = (x, y, c) => { if (x >= 0 && y >= 0 && x < G && y < G) grid[y][x] = c; }; /* 场景底：不进 mask */
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) bg(x, y, y < 3 ? shade(P.bg1, 25) : (x % 2 ? shade(P.bg1, -18) : P.bg1));
    for (let i = 0; i < 6; i++) bg(Math.floor(rand() * G), Math.floor(rand() * 5), [255, 235, 180]);
    for (let y = 2; y <= 6; y++) for (let x = 3; x <= 12; x++) put(x, y, y <= 3 ? shade(P.hair, 40) : P.hair);
    put(2, 4, P.hair); put(2, 5, P.hair); put(13, 4, P.hair); put(13, 5, P.hair);
    for (let y = 5; y <= 11; y++) for (let x = 4; x <= 11; x++) put(x, y, P.skin);
    const eye = rand() > 0.5 ? [42, 42, 53] : [122, 58, 42];
    for (const ex of [5, 9]) { put(ex, 8, eye); put(ex, 9, eye); }
    put(5, 8, [255, 255, 255]); put(9, 8, [255, 255, 255]);
    put(7, 10, [140, 70, 60]); put(8, 10, [140, 70, 60]);
    put(4, 9, [240, 150, 150]); put(11, 9, [240, 150, 150]);
    for (let y = 12; y < G; y++) for (let x = 4; x <= 11; x++) put(x, y, shade(P.bg1, -45));
    put(7, 12, P.skin); put(8, 12, P.skin);
    return { grid, mask };
}

/* ---------- 读取卡库（cards.js 生成物为唯一来源） ---------- */
const cardsSrc = fs.readFileSync(path.join(ROOT, 'public', 'pixel-tavern', 'cards.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(cardsSrc, sandbox);
const cards = sandbox.window.PT_CARD_CHARACTERS || [];
if (!cards.length) { console.error('cards.js 为空——先运行 node tools/build-cards.mjs'); process.exit(1); }

/* ---------- 海报 ---------- */
const W = 512, H = 640;
function drawPoster(card) {
    const cv = makeCanvas(W, H);
    /* 深空渐变 */
    for (let y = 0; y < H; y++) {
        const t = y / H;
        cv.rect(0, y, W, 1, [Math.round(8 + 7 * t), Math.round(13 + 9 * t), Math.round(20 + 13 * t)]);
    }
    /* 星点（种子稳定） */
    let seed = (card.seed * 100003 + card.name.length * 131) >>> 0 || 1;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
    for (let i = 0; i < 130; i++) cv.set(Math.floor(rnd() * W), Math.floor(rnd() * H), rnd() > 0.75 ? C.white : C.tealSoft, Math.round(36 + rnd() * 120));
    /* 角色底色氛围辉光 */
    const bg = hexRGB(card.palette.bg1);
    cv.glow(W / 2, H * 0.62, 240, bg, 70);
    cv.glow(W * 0.2, H * 0.18, 160, C.teal, 34);
    cv.glow(W * 0.82, H * 0.8, 170, C.amber, 26);
    /* 细网格 */
    for (let y = 0; y < H; y += 32) cv.rect(0, y, W, 1, C.line, 80);
    for (let x = 0; x < W; x += 32) cv.rect(x, 0, 1, H, C.line, 80);
    /* 回声弧（左上两段） */
    cv.arc(W * 0.24, H * 0.2, 120, -Math.PI * 0.35, Math.PI * 1.05, C.teal, 6, 190);
    cv.arc(W * 0.24, H * 0.2, 92, -Math.PI * 0.15, Math.PI * 0.85, C.tealSoft, 3, 110);
    /* 琥珀棱镜（右下小） */
    cv.seg(W * 0.86, H * 0.62, W * 0.94, H * 0.78, C.amber, 4, 200);
    cv.seg(W * 0.94, H * 0.78, W * 0.78, H * 0.78, C.amberHi, 4, 180);
    cv.seg(W * 0.78, H * 0.78, W * 0.86, H * 0.62, C.amberHi, 4, 200);
    /* 双线边框 + 角标（先画框，再叠肖像，避免整幅被罩色） */
    cv.rect(10, 10, W - 20, H - 20, C.teal, 190);
    cv.rect(16, 16, W - 32, H - 32, C.deep);
    cv.rect(22, 22, W - 44, H - 44, C.amber, 120);
    cv.rect(26, 26, W - 52, H - 52, C.deep);
    const tick = 26;
    for (const [tx, ty, dx, dy] of [[22, 22, 1, 1], [W - 22, 22, -1, 1], [22, H - 22, 1, -1], [W - 22, H - 22, -1, -1]]) {
        cv.rect(tx, ty, dx * tick, dy * 5, C.amberHi, 230);
        cv.rect(tx, ty, dx * 5, dy * tick, C.amberHi, 230);
    }
    /* 中央像素肖像（仅人物主体格，16 格 → 320×320，底部对齐 H*0.88） */
    const { grid, mask } = portraitGrid(card.palette, card.seed);
    const cell = 20, ox = Math.round((W - 16 * cell) / 2), oy = Math.round(H * 0.88) - 16 * cell;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (!mask[y][x]) continue;
        cv.rect(ox + x * cell, oy + y * cell, cell, cell, grid[y][x], 255);
    }
    /* 肖像基座光带 */
    cv.rect(ox - 24, oy + 16 * cell + 6, 16 * cell + 48, 2, C.teal, 170);
    /* 底部回声点阵 */
    for (let i = 0; i < 5; i++) cv.rect(W / 2 - 40 + i * 20, H - 52, 6, 6, i % 2 ? C.amber : C.teal, 220);
    return { w: W, h: H, px: cv.px };
}

let n = 0;
for (const card of cards) {
    const p = drawPoster(card);
    const file = path.join(OUT, card.id + '.png');
    fs.writeFileSync(file, encodePNG(p.w, p.h, p.px));
    console.log('✓', card.id + '.png', `${p.w}x${p.h}`, (fs.statSync(file).size / 1024).toFixed(0) + 'KB', card.name);
    n++;
}
/* 清理旧 15 位角色的封面（c-*.png），保持目录只含现役 9 张 */
for (const f of fs.readdirSync(OUT)) {
    if (/^c-[a-z]+\.png$/.test(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('− 移除旧封面', f); }
}
console.log(`\n完成：${n} 张海报 → ${path.relative(ROOT, OUT)}`);
