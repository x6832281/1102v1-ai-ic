#!/usr/bin/env node
/* ============================================================
 * 幻境回声 · EchoCraft — 角色封面海报生成器（零依赖，纯 Node）
 * 为卡库角色（public/pixel-tavern/cards.js 的 9 位）生成
 * 512×640 竖版海报：深空底 + 回声弧 + 棱镜 + 24×28 像素具象半身像
 * 人物由 public/pixel-tavern/portrait-painter.js 共享绘制器渲染（与门户同一引擎）
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

/* ---------- 调色工具（框线用） ---------- */
const ECHO_TEAL = '#00d1b2', ECHO_AMBER = '#fbbf24';
function hexRGB(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/* ---------- 读取卡库 ---------- */
const cardsSrc = fs.readFileSync(path.join(ROOT, 'public', 'pixel-tavern', 'cards.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(cardsSrc, sandbox);
/* 共享绘制器：与门户 avatars.js 同一份 portrait-painter.js */
const painterSrc = fs.readFileSync(path.join(ROOT, 'public', 'pixel-tavern', 'portrait-painter.js'), 'utf8');
const psb = { window: {} };
vm.createContext(psb);
vm.runInContext(painterSrc, psb);
const ECPainter = psb.window.ECPainter;
if (!ECPainter) { console.error('portrait-painter.js 加载失败'); process.exit(1); }

const cards = sandbox.window.PT_CARD_CHARACTERS || [];
if (!cards.length) { console.error('cards.js 为空——先运行 node tools/build-cards.mjs'); process.exit(1); }

/* ---------- 海报（人物由共享绘制器 portrait-painter.js 渲染） ---------- */
const W = 512, H = 640;
function drawPoster(card) {
    const cv = makeCanvas(W, H);
    /* 清晰人物 + 深空氛围（与门户同一引擎） */
    ECPainter.paint(cv.px, W, H, { palette: card.palette, avatar: card.avatar, seed: card.seed, name: card.name });
    /* 海报框线（描边式，不遮盖人物） */
    const F = (x, y, w, h, c, a, t) => { cv.rect(x, y, w, t, c, a); cv.rect(x, y + h - t, w, t, c, a); cv.rect(x, y, t, h, c, a); cv.rect(x + w - t, y, t, h, c, a); };
    F(10, 10, W - 20, H - 20, hexRGB(ECHO_TEAL), 190, 2);
    F(16, 16, W - 32, H - 32, [8, 13, 20], 255, 2);
    F(22, 22, W - 44, H - 44, hexRGB(ECHO_AMBER), 110, 2);
    F(26, 26, W - 52, H - 52, [8, 13, 20], 255, 2);
    const tick = 26;
    for (const [tx, ty, dx, dy] of [[22, 22, 1, 1], [W - 22, 22, -1, 1], [22, H - 22, 1, -1], [W - 22, H - 22, -1, -1]]) {
        cv.rect(tx, ty, dx * tick, dy * 5, hexRGB(ECHO_AMBER), 230);
        cv.rect(tx, ty, dx * 5, dy * tick, hexRGB(ECHO_AMBER), 230);
    }
    /* 回声点阵 */
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
