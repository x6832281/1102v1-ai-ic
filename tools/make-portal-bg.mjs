#!/usr/bin/env node
/* ============================================================
 * 幻境回声 · EchoCraft — 门户背景场景生成器（零依赖，纯 Node）
 * 1920×1080 深空回声场景：暗曜渐变 / 星云辉光 / 星尘 / 回声弧 / 棱镜
 * 刻意压暗（对比度优先）：供 CSS 分层叠加，正文对比度不受影响
 * 输出：public/pixel-tavern/bg-echo.png
 * 用法：node tools/make-portal-bg.mjs
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'pixel-tavern', 'bg-echo.png');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

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
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
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

const C = {
    deep: [7, 11, 18], teal: [0, 209, 178], tealSoft: [102, 212, 190],
    amber: [245, 158, 11], amberHi: [253, 200, 96],
    white: [255, 255, 255], line: [26, 37, 48],
};

const W = 1920, H = 1080;
const cv = makeCanvas(W, H);

/* 1. 暗曜渐变（顶部最深，向下微亮，避免头重脚轻） */
for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = [Math.round(6 + 7 * t), Math.round(10 + 9 * t), Math.round(17 + 13 * t)];
    cv.rect(0, y, W, 1, c);
}

/* 2. 星云辉光（三团，刻意低强度） */
cv.glow(W * 0.22, H * 0.24, 460, C.teal, 34);
cv.glow(W * 0.80, H * 0.66, 520, C.amber, 20);
cv.glow(W * 0.52, H * 0.94, 620, [52, 82, 104], 22);

/* 3. 星尘（560 颗，明暗两档 + 少量十字星） */
let seed = 20261114;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
for (let i = 0; i < 560; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    const bright = rnd();
    cv.set(x, y, bright > 0.74 ? C.white : C.tealSoft, Math.round(26 + bright * 130));
    if (bright > 0.94) { cv.set(x + 1, y, C.tealSoft, 90); cv.set(x, y + 1, C.tealSoft, 90); cv.set(x, y - 1, C.tealSoft, 60); cv.set(x - 1, y, C.tealSoft, 60); }
}

/* 4. 细网格（极低透明度，只给 texture 不抢戏） */
for (let y = 0; y < H; y += 48) cv.rect(0, y, W, 1, C.line, 42);
for (let x = 0; x < W; x += 48) cv.rect(x, 0, 1, H, C.line, 42);

/* 5. 回声弧（右上两段 + 左下远弧） */
cv.arc(W * 0.86, H * 0.18, 320, Math.PI * 0.45, Math.PI * 1.35, C.teal, 7, 120);
cv.arc(W * 0.86, H * 0.18, 258, Math.PI * 0.55, Math.PI * 1.25, C.tealSoft, 4, 70);
cv.arc(W * 0.06, H * 0.88, 380, Math.PI * 1.45, Math.PI * 2.1, C.teal, 5, 60);

/* 6. 琥珀棱镜（右下小棱镜，弱化） */
const px0 = W * 0.78, py0 = H * 0.8, r0 = 110;
cv.seg(px0, py0 - r0 * 0.8, px0 + r0 * 0.62, py0 + r0 * 0.5, C.amber, 4, 120);
cv.seg(px0 + r0 * 0.62, py0 + r0 * 0.5, px0 - r0 * 0.62, py0 + r0 * 0.5, C.amberHi, 4, 105);
cv.seg(px0 - r0 * 0.62, py0 + r0 * 0.5, px0, py0 - r0 * 0.8, C.amberHi, 4, 120);

/* 7. 双波形（青主 + 琥珀副，横贯） */
for (let x = 0; x < W; x++) {
    const y1 = H * 0.32 + Math.sin(x * 0.008) * 34 + Math.sin(x * 0.0021) * 16;
    cv.set(x, y1, C.tealSoft, 90);
    cv.set(x, y1 + 1, C.teal, 55);
    const y2 = H * 0.72 + Math.sin(x * 0.006 + 1.8) * 26 + Math.sin(x * 0.0017 + 0.6) * 12;
    cv.set(x, y2, C.amberHi, 52);
}

/* 8. 上下暗角（保证顶部导航与底部内容的可读性） */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
    const vig = Math.max(0, 0.42 - Math.min(ex, ey) * 2.4);
    if (vig > 0) cv.set(x, y, [5, 8, 14], Math.round(vig * 160));
}

fs.writeFileSync(OUT, encodePNG(W, H, cv.px));
console.log('bg-echo.png', W + 'x' + H, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
