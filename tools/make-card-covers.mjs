#!/usr/bin/env node
/* ============================================================
 * 幻境回声 · EchoCraft — 角色封面海报生成器（零依赖，纯 Node）
 * 为卡库角色（public/pixel-tavern/cards.js 的 9 位）生成
 * 512×640 竖版海报：深空底 + 回声弧 + 棱镜 + 24×28 像素具象半身像
 * 人物网格与 public/pixel-tavern/avatars.js 的 buildGrid 保持一致
 * （改动肖像请同步两处；门户侧为运行时 Canvas，工具侧为离线栅格）
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
const OUT2 = path.join(ROOT, 'public', 'sites', 'echocraft', 'cards');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(OUT2, { recursive: true });

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
            if (d <= 1) set(cx + i, cy + j, color, Math.round(alpha * (1 - d) * (1 - d)));
        }
    };
    return { px, set, rect, arc, seg, glow, w, h };
}

/* ---------- 调色工具（与 avatars.js 同规则） ---------- */
const ECHO_TEAL = '#00d1b2', ECHO_AMBER = '#fbbf24';
function hexRGB(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shadeRGB(c, amt) { const [r, g, b] = hexRGB(c); const cl = v => Math.max(0, Math.min(255, v + amt)); return [cl(r), cl(g), cl(b)]; }
function mixRGB(a, b, t) { const pa = hexRGB(a), pb = hexRGB(b); return [0, 1, 2].map(i => Math.round(pa[i] + (pb[i] - pa[i]) * t)); }
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ---------- 24×28 像素具象半身像（与 avatars.js buildGrid 同步） ---------- */
function buildGrid(char, rand) {
    const GW = 24, GH = 28;
    const G = Array.from({ length: GH }, () => Array(GW).fill(null));
    const put = (x, y, c, a = 1) => { if (x >= 0 && y >= 0 && x < GW && y < GH && c) G[y][x] = { c, a }; };
    const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

    const pal = char.palette || {};
    const bg1 = pal.bg1 || '#2c3e6b';
    const hair = pal.hair || '#4a6572';
    const skin = pal.skin || '#f2d3b3';
    const hairL = shadeHex(hair, 38), hairD = shadeHex(hair, -30), hairDD = shadeHex(hair, -52);
    const skinD = shadeHex(skin, -18), skinDD = shadeHex(skin, -40);
    const bodyC = shadeHex(bg1, -28), bodyD = shadeHex(bg1, -55), bodyL = shadeHex(bg1, -6);
    const eyeC = mixHex(shadeHex(bg1, -62), ECHO_TEAL, 0.14);

    const hint = char.avatar || {};
    const hairStyle = hint.hairStyle || pick(rand, ['long', 'bob', 'twin', 'ponytail', 'bun', 'short']);
    const bangs = hint.bangs || pick(rand, ['full', 'side', 'center', 'wispy']);
    const mouthV = hint.mouth || pick(rand, ['soft', 'smile', 'calm']);
    const hat = !!hint.hat;
    const glasses = hint.glasses != null ? !!hint.glasses : rand() < 0.3;
    const earring = hint.earring != null ? !!hint.earring : rand() < 0.24;
    const trimCol = hint.trim || (rand() < 0.5 ? ECHO_TEAL : ECHO_AMBER);

    /* 身体 */
    put(10, 14, skinD); put(11, 14, skinD); put(12, 14, skinD); put(13, 14, skinD);
    for (let x = 10; x <= 13; x++) { put(x, 15, skin); put(x, 16, x === 10 || x === 13 ? skinD : skin); }
    for (let x = 6; x <= 9; x++) put(x, 16, bodyC);
    for (let x = 14; x <= 17; x++) put(x, 16, bodyC);
    for (let x = 4; x <= 19; x++) put(x, 17, x >= 10 && x <= 13 ? skinDD : bodyC);
    for (let x = 3; x <= 20; x++) put(x, 18, bodyC);
    for (let y = 19; y < GH; y++) for (let x = 2; x <= 21; x++) put(x, y, bodyC);
    put(11, 17, skinDD); put(12, 17, skinDD);
    put(9, 17, trimCol); put(14, 17, trimCol);
    put(8, 18, trimCol); put(15, 18, trimCol);
    for (let y = 19; y < GH; y++) { put(5, y, bodyD, 0.55); put(18, y, bodyD, 0.55); put(2, y, bodyD, 0.35); put(21, y, bodyD, 0.35); }
    for (let y = 23; y < GH; y++) { put(11, y, bodyD, 0.3); put(12, y, bodyD, 0.3); }
    put(3, 19, bodyL); put(4, 19, bodyL);
    put(5, 21, trimCol, 0.9); put(6, 21, trimCol, 0.5);

    /* 面部 */
    for (let y = 5; y <= 11; y++) for (let x = 7; x <= 16; x++) put(x, y, skin);
    for (let x = 8; x <= 15; x++) put(x, 12, skin);
    for (let x = 9; x <= 14; x++) put(x, 13, skinD);
    put(6, 8, skin); put(6, 9, skinD); put(17, 8, skin); put(17, 9, skinD);
    const browC = mixHex(hairD, skin, 0.42);
    put(9, 6, browC); put(10, 6, browC); put(13, 6, browC); put(14, 6, browC);
    for (const ex of [9, 13]) {
        put(ex, 7, hairDD); put(ex + 1, 7, hairDD);
        put(ex, 8, eyeC); put(ex + 1, 8, eyeC);
        put(ex, 9, eyeC); put(ex + 1, 9, shadeRGB(hexRGB(eyeC), -40));
        put(ex, 8, '#ffffff', 0.72);
    }
    put(11, 10, skinD, 0.8);
    if (mouthV === 'smile') { put(11, 11, '#b86a5e'); put(12, 11, '#b86a5e'); put(10, 11, '#b86a5e', 0.55); put(13, 11, '#b86a5e', 0.55); }
    else if (mouthV === 'soft') { put(11, 11, '#b86a5e'); put(12, 11, '#b86a5e'); }
    else { put(11, 11, '#a05a50', 0.85); }
    put(8, 10, '#f2a3a3', 0.42); put(15, 10, '#f2a3a3', 0.42);

    /* 发型基座 */
    let top = 0;
    if (hat) {
        for (let x = 10; x <= 13; x++) put(x, 0, hairDD);
        for (let x = 8; x <= 15; x++) put(x, 1, hairD);
        for (let x = 6; x <= 17; x++) put(x, 2, hair);
        for (let x = 4; x <= 19; x++) put(x, 3, hair);
        put(5, 3, hairD); put(18, 3, hairD);
        for (let x = 6; x <= 17; x++) put(x, 4, x % 2 ? trimCol : hairD);
        top = 5;
    } else {
        for (let x = 8; x <= 15; x++) put(x, 0, hairL);
        for (let x = 6; x <= 17; x++) put(x, 1, x <= 9 || x >= 14 ? hairL : hair);
        for (let x = 5; x <= 18; x++) put(x, 2, hair);
        for (let x = 5; x <= 18; x++) put(x, 3, x === 5 || x === 18 ? hairD : hair);
        top = 4;
    }
    for (let y = top; y <= 7; y++) { put(5, y, y === 7 ? hairD : hair); put(6, y, y === top ? hairL : hair); put(17, y, y === top ? hair : hairL); put(18, y, y === 7 ? hairD : hair); }

    /* 刘海 */
    if (!hat) {
        if (bangs === 'full') {
            for (let x = 7; x <= 16; x++) put(x, 5, x === 7 || x === 16 ? hairD : hair);
            for (let x = 8; x <= 15; x++) put(x, 6, hairD, 0.9);
        } else if (bangs === 'side') {
            for (let x = 7; x <= 16; x++) put(x, 5, x === 16 ? hairD : hair);
            for (let x = 7; x <= 12; x++) put(x, 6, hair, 0.95);
            put(13, 6, hairD, 0.7);
        } else if (bangs === 'center') {
            for (let x = 7; x <= 16; x++) put(x, 5, x === 7 || x === 16 ? hairD : hair);
            for (const x of [7, 8, 15, 16]) put(x, 6, hair, 0.95);
            put(9, 6, hairD, 0.8); put(14, 6, hairD, 0.8);
        } else {
            for (const x of [7, 9, 10, 13, 14, 16]) put(x, 5, x === 7 || x === 16 ? hairD : hair);
            for (const x of [8, 11, 12, 15]) put(x, 5, skin);
            put(8, 6, hairD, 0.85); put(15, 6, hairD, 0.85);
        }
    }

    /* 发型延伸 */
    const lockC = hair, lockD = hairD;
    if (hairStyle === 'long') {
        for (let y = 6; y <= 16; y++) {
            put(4, y, lockD); put(5, y, y >= 12 ? lockD : lockC);
            put(18, y, lockC); put(19, y, lockD);
        }
        for (let y = 17; y <= 21; y++) { put(3, y, shadeHex(hair, -52), 0.9); put(4, y, lockD, 0.9); put(19, y, lockD, 0.9); put(20, y, shadeHex(hair, -52), 0.9); }
    } else if (hairStyle === 'bob') {
        for (let y = 6; y <= 11; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
        for (const x of [5, 6, 17, 18]) put(x, 12, lockD, 0.95);
    } else if (hairStyle === 'twin') {
        for (let y = 6; y <= 9; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
        for (let y = 9; y <= 15; y++) {
            put(3, y, lockD); put(4, y, lockC);
            put(19, y, lockC); put(20, y, lockD);
            if (y >= 12) { put(2, y, shadeHex(hair, -52), 0.85); put(21, y, shadeHex(hair, -52), 0.85); }
        }
        put(4, 8, trimCol, 0.95); put(19, 8, trimCol, 0.95);
    } else if (hairStyle === 'ponytail') {
        for (let y = 6; y <= 9; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
        for (let y = 5; y <= 14; y++) {
            put(19, y, lockC, 0.95); put(20, y, lockD);
            if (y >= 9 && y <= 12) put(21, y, shadeHex(hair, -52), 0.8);
        }
        put(18, 5, trimCol, 0.95); put(18, 6, trimCol, 0.7);
    } else if (hairStyle === 'bun') {
        if (!hat) { for (let x = 9; x <= 14; x++) put(x, 0, hairL); }
        for (let y = 6; y <= 8; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
        put(6, 5, trimCol, 0.9); put(17, 5, trimCol, 0.9);
    } else {
        for (let y = 6; y <= 7; y++) { put(5, y, hairD); put(6, y, lockC); put(17, y, lockC); put(18, y, hairD); }
        put(7, 4, hairL, 0.9); put(16, 4, hairL, 0.9);
    }

    /* 配饰 */
    if (glasses) {
        const gC = '#cfe0ee';
        for (const ex of [9, 13]) { put(ex - 1, 8, gC, 0.85); put(ex + 2, 8, gC, 0.85); put(ex, 7, gC, 0.85); put(ex + 1, 7, gC, 0.85); put(ex, 10, gC, 0.85); put(ex + 1, 10, gC, 0.85); }
        put(11, 8, gC, 0.7); put(12, 8, gC, 0.7); put(6, 8, gC, 0.6); put(17, 8, gC, 0.6);
    }
    if (earring) { put(6, 10, ECHO_AMBER, 0.95); put(17, 10, ECHO_AMBER, 0.95); }

    /* 青琥珀双缘光 */
    for (let y = 0; y < GH; y++) {
        let min = -1, max = -1;
        for (let x = 0; x < GW; x++) if (G[y][x]) { if (min < 0) min = x; max = x; }
        if (min < 0) continue;
        if (min !== max) {
            G[y][min] = { c: mixHex(G[y][min].c, ECHO_TEAL, 0.4), a: G[y][min].a };
            G[y][max] = { c: mixHex(G[y][max].c, ECHO_AMBER, 0.32), a: G[y][max].a };
        }
    }
    return G;

    function shadeHex(hex, amt) {
        let c = hex.slice(1);
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const n = parseInt(c, 16);
        const cl = v => Math.max(0, Math.min(255, v));
        const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }
    function mixHex(a, b, t) {
        const pa = hexRGB(a), pb = hexRGB(b);
        const ch = (sa, sb) => Math.round(sa + (sb - sa) * t);
        const r = ch(pa[0], pb[0]), g = ch(pa[1], pb[1]), bl = ch(pa[2], pb[2]);
        return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
    }
}

/* ---------- 读取卡库 ---------- */
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
    for (let y = 0; y < H; y++) {
        const t = y / H;
        cv.rect(0, y, W, 1, [Math.round(8 + 7 * t), Math.round(13 + 9 * t), Math.round(20 + 13 * t)]);
    }
    let seed = (card.seed * 100003 + card.name.length * 131) >>> 0 || 1;
    const rnd = mulberry32(seed);
    const bg = hexRGB(card.palette.bg1);
    cv.glow(W / 2, H * 0.36, 300, bg, 74);
    cv.glow(W * 0.18, H * 0.14, 170, hexRGB(ECHO_TEAL), 30);
    cv.glow(W * 0.85, H * 0.86, 190, hexRGB(ECHO_AMBER), 24);
    for (let i = 0; i < 130; i++) cv.set(Math.floor(rnd() * W), Math.floor(rnd() * H * 0.62), rnd() > 0.75 ? [255, 255, 255] : hexRGB('#66d4be'), Math.round(36 + rnd() * 120));
    for (let y = 0; y < H; y += 32) cv.rect(0, y, W, 1, [30, 42, 54], 74);
    for (let x = 0; x < W; x += 32) cv.rect(x, 0, 1, H, [30, 42, 54], 74);
    cv.arc(W * 0.5, H * 0.4, W * 0.44, Math.PI * 1.15, Math.PI * 1.85, hexRGB(ECHO_TEAL), 6, 120);
    cv.arc(W * 0.5, H * 0.4, W * 0.5, Math.PI * 1.2, Math.PI * 1.8, hexRGB(ECHO_AMBER), 3, 70);
    /* 边框（先框后人） */
    cv.rect(10, 10, W - 20, H - 20, hexRGB(ECHO_TEAL), 190);
    cv.rect(16, 16, W - 32, H - 32, [8, 13, 20]);
    cv.rect(22, 22, W - 44, H - 44, hexRGB(ECHO_AMBER), 110);
    cv.rect(26, 26, W - 52, H - 52, [8, 13, 20]);
    const tick = 26;
    for (const [tx, ty, dx, dy] of [[22, 22, 1, 1], [W - 22, 22, -1, 1], [22, H - 22, 1, -1], [W - 22, H - 22, -1, -1]]) {
        cv.rect(tx, ty, dx * tick, dy * 5, hexRGB(ECHO_AMBER), 230);
        cv.rect(tx, ty, dx * 5, dy * tick, hexRGB(ECHO_AMBER), 230);
    }
    /* 像素人物（整数格居中，底部对齐） */
    const rand = mulberry32(card.seed * 7919 || 1);
    const G = buildGrid(card, rand);
    const GW = 24, GH = 28;
    const cell = Math.max(4, Math.floor(Math.min(W / GW, (H * 0.82) / GH)));
    const ox = Math.floor((W - GW * cell) / 2);
    const oy = Math.floor(H * 0.86) - GH * cell;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const c = G[y][x];
        if (!c) continue;
        const [r, g, b] = hexRGB(c.c);
        cv.rect(ox + x * cell, oy + y * cell, cell, cell, [r, g, b], Math.round(c.a * 255));
    }
    /* 基座光带 + 回声点阵 */
    cv.rect(ox - 24, oy + GH * cell + 8, GW * cell + 48, 2, hexRGB(ECHO_TEAL), 170);
    for (let i = 0; i < 5; i++) cv.rect(W / 2 - 40 + i * 20, H - 52, 6, 6, i % 2 ? hexRGB(ECHO_AMBER) : hexRGB(ECHO_TEAL), 220);
    return { w: W, h: H, px: cv.px };
}

let n = 0;
for (const card of cards) {
    const p = drawPoster(card);
    const file = path.join(OUT, card.id + '.png');
    fs.writeFileSync(file, encodePNG(p.w, p.h, p.px));
    fs.writeFileSync(path.join(OUT2, card.id + '.png'), encodePNG(p.w, p.h, p.px));
    console.log('✓', card.id + '.png', `${p.w}x${p.h}`, (fs.statSync(file).size / 1024).toFixed(0) + 'KB', card.name);
    n++;
}
for (const dir of [OUT, OUT2]) {
    for (const f of fs.readdirSync(dir)) {
        if (/^c-[a-z]+\.png$/.test(f)) { fs.unlinkSync(path.join(dir, f)); console.log('− 移除旧封面', path.relative(ROOT, path.join(dir, f))); }
    }
}
console.log(`\n完成：${n} 张海报 → ${path.relative(ROOT, OUT)} + ${path.relative(ROOT, OUT2)}`);
