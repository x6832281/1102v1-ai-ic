/* ============================================================
 * 幻境回声 · EchoCraft — 门户背景场景生成器 v3（零依赖，纯 Node）
 * 「月下酒廊」：巨月 / 城市地平线剪影（亮窗）/ 串灯 / 垂藤 / 彩光酒瓶
 * 输出：public/pixel-tavern/bg-echo.png（1920×1080）
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

function makeCanvas(w, h) {
    const px = Buffer.alloc(w * h * 4);
    const put = (x, y, c, a = 255) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const o = (y * w + x) * 4, sa = a / 255;
        px[o] = Math.round(c[0] * sa + px[o] * (1 - sa));
        px[o + 1] = Math.round(c[1] * sa + px[o + 1] * (1 - sa));
        px[o + 2] = Math.round(c[2] * sa + px[o + 2] * (1 - sa));
        px[o + 3] = Math.max(px[o + 3], 255);
    };
    const rect = (x, y, rw, rh, c, a = 255) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) put(i, j, c, a); };
    const arc = (cx, cy, r, a0, a1, color, width, alpha = 255) => {
        const steps = Math.max(64, Math.round(r * 4));
        for (let s = 0; s <= steps; s++) {
            const ang = a0 + (a1 - a0) * (s / steps);
            for (let t = 0; t < width; t++) put(cx + Math.cos(ang) * (r + t), cy + Math.sin(ang) * (r + t), color, alpha);
        }
    };
    const seg = (x0, y0, x1, y1, color, width, alpha = 255) => {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let s = 0; s <= steps; s++) {
            const x = x0 + (x1 - x0) * (s / steps), y = y0 + (y1 - y0) * (s / steps);
            for (let t = 0; t < width; t++) put(x + t * 0.5, y, color, alpha);
        }
    };
    const capsule = (x0, y0, x1, y1, r, col, a) => {
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
        for (let t = 0; t <= 1; t += 0.02) {
            const px2 = x0 + dx * t, py2 = y0 + dy * t;
            for (let dy2 = -r; dy2 <= r; dy2++) for (let dx2 = -r; dx2 <= r; dx2++) {
                const d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                if (d > r) continue;
                put(Math.round(px2 + dx2), Math.round(py2 + dy2), col, a);
            }
        }
    };
    const ell = (cx, cy, rx, ry, c0, c1, a) => {
        for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
            const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
            if (d > 1) continue;
            const col = [Math.round(c0[0] + (c1[0] - c0[0]) * (dy / ry + 1) / 2), Math.round(c0[1] + (c1[1] - c0[1]) * (dy / ry + 1) / 2), Math.round(c0[2] + (c1[2] - c0[2]) * (dy / ry + 1) / 2)];
            put(cx + dx, cy + dy, col, a * Math.min(1, (1 - d) * 24));
        }
    };
    const glow = (cx, cy, r, color, alpha) => {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            const d = Math.sqrt(i * i + j * j) / r;
            if (d <= 1) put(cx + i, cy + j, color, Math.round(alpha * Math.pow(1 - d, 3)));
        }
    };
    return { px, put, rect, arc, seg, glow, ell, capsule, w, h };
}

const C = {
    deep: [7, 11, 18], teal: [0, 209, 178], tealSoft: [102, 212, 190],
    amber: [245, 158, 11], amberHi: [253, 200, 96],
    white: [255, 255, 255], gold: [212, 168, 84], warm: [255, 186, 110],
};

const W = 1920, H = 1080;
const cv = makeCanvas(W, H);

/* 1. 夜空渐变 */
for (let y = 0; y < H; y++) {
    const t = y / H;
    cv.rect(0, y, W, 1, [Math.round(6 + 7 * t), Math.round(11 + 9 * t), Math.round(15 + 11 * t)]);
}

/* 2. 星云氛围 */
cv.glow(W * 0.28, H * 0.2, 700, C.teal, 62);
cv.glow(W * 0.8, H * 0.36, 640, C.amber, 40);
cv.glow(W * 0.55, H * 0.82, 700, [44, 70, 92], 52);

/* 3. 星尘 */
let seed = 20261114;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
for (let i = 0; i < 560; i++) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H * 0.62);
    const b = rnd();
    cv.put(x, y, b > 0.74 ? C.white : C.tealSoft, Math.round(24 + b * 120));
    if (b > 0.94) { cv.put(x + 1, y, C.tealSoft, 85); cv.put(x, y + 1, C.tealSoft, 85); }
}

/* 4. 巨月 */
const moonX = W * 0.78, moonY = H * 0.26, moonR = 178;
cv.glow(moonX, moonY, moonR * 2.3, [210, 224, 218], 58);
cv.glow(moonX, moonY, moonR * 1.4, [228, 236, 230], 78);
cv.ell(moonX, moonY, moonR, moonR, [228, 234, 226], [198, 208, 200], 240);
for (let i = 0; i < 5; i++) {
    const cx2 = moonX - moonR * 0.45 + (i % 3) * moonR * 0.44;
    const cy2 = moonY - moonR * 0.35 + Math.floor(i / 3) * moonR * 0.52 + 18;
    cv.ell(cx2, cy2, 13 + (i % 3) * 8, 10 + (i % 3) * 6, [204, 212, 202], [186, 196, 188], 120);
}
cv.glow(moonX - moonR * 0.3, moonY - moonR * 0.3, moonR * 0.7, [255, 255, 250], 46);
/* 月晕双环 + 边缘光 */
cv.glow(moonX, moonY, moonR + 34, [214, 226, 222], 34);
cv.glow(moonX, moonY, moonR + 58, [214, 226, 222], 18);
cv.arc(moonX, moonY, moonR + 2, Math.PI * 1.15, Math.PI * 1.85, [255, 255, 250], 2.6, 130);

/* 5. 垂藤（顶部两角） */
function vine(x0, dir, len) {
    let vx = x0, vy = 0;
    for (let i = 0; i < len; i++) {
        const nx = vx + dir * (6 + rnd() * 8), ny = vy + 26 + rnd() * 18;
        cv.capsule(vx, vy, nx, ny, 2.2, [40, 62, 48], 225);
        if (rnd() > 0.55) cv.ell(nx, ny + 6, 4 + rnd() * 4, 7 + rnd() * 5, [56, 84, 60], [34, 52, 38], 238);
        if (rnd() > 0.78) cv.glow(nx, ny + 10, 4, C.tealSoft, 96);
        vx = nx; vy = ny;
    }
}
vine(W * 0.02, 1, 16);
vine(W * 0.98, -1, 14);

/* 6. 串灯横贯 */
const garY1 = H * 0.13;
for (let x = 0; x < W; x += 2) {
    const gy = garY1 + Math.sin(x * 0.006) * 24 + Math.sin(x * 0.0023) * 11;
    cv.put(x, gy, [90, 100, 96], 130);
}
for (let i = 0; i < 16; i++) {
    const bx = W * 0.03 + i * W * 0.062;
    const gy = garY1 + Math.sin(bx * 0.006) * 24 + Math.sin(bx * 0.0023) * 11 + 15;
    cv.seg(bx, gy - 13, bx, gy, [80, 92, 90], 1.6, 150);
    const warm2 = i % 3 === 0 ? C.tealSoft : C.warm;
    cv.glow(bx, gy + 4, 7, warm2, 150);
    cv.glow(bx, gy + 4, 16, warm2, 34);
}

/* 7. 城市地平线剪影（两层 + 亮窗） */
const hor = H * 0.64;
for (let i = 0; i < 14; i++) {
    const bw = 90 + rnd() * 130, bh = 90 + rnd() * 130;
    const bx = -60 + i * 148;
    cv.rect(bx, hor - bh, bw, bh, [24, 32, 44], 235);
}
for (let i = 0; i < 10; i++) {
    const bw = 110 + rnd() * 150, bh = 130 + rnd() * 150;
    const bx = -80 + i * 210;
    cv.rect(bx, hor + 40 - bh, bw, bh, [15, 21, 31], 246);
    for (let wn = 0; wn < 12; wn++) {
        if (rnd() > 0.28) cv.rect(bx + 12 + rnd() * (bw - 36), hor + 40 - bh + 16 + rnd() * (bh - 52), 6, 10, rnd() > 0.3 ? C.warm : C.tealSoft, 150);
    }
}

/* 8. 吧台 + 彩光酒瓶 */
const barY = H * 0.88;
cv.rect(0, barY, W, H - barY, [15, 21, 29], 242);
cv.rect(0, barY, W, 4, C.gold, 110);
const bottleSpec = [
    [0.06, 96, [0, 190, 165]], [0.14, 70, [255, 186, 100]], [0.23, 118, [0, 150, 130]],
    [0.36, 84, [255, 186, 100]], [0.52, 64, [0, 170, 148]], [0.66, 104, [255, 186, 100]],
    [0.79, 76, [0, 190, 165]], [0.91, 92, [255, 186, 100]],
];
for (const [fx, bh, gl] of bottleSpec) {
    const bx = W * fx, bw2 = 11;
    const bodyH = bh, neckH = bh * 0.34;
    cv.ell(bx, barY - bodyH / 2 - neckH, bw2, bodyH / 2, gl, [16, 24, 22], 232);
    cv.rect(bx - 3.5, barY - bodyH - neckH * 2 - 4, 7, neckH + 4, [26, 40, 38], 232);
    cv.rect(bx - 5, barY - bodyH - neckH * 2 - 8, 10, 5, gl, 235);
    cv.glow(bx, barY - bodyH / 2 - neckH, 8, gl, 70);
    cv.glow(bx, barY - bodyH / 2 - neckH, 17, gl, 24);
}

/* 9. 萤火 */
for (let i = 0; i < 14; i++) {
    const fx = W * 0.1 + rnd() * W * 0.8, fy = H * 0.42 + rnd() * H * 0.3;
    cv.glow(fx, fy, 3 + rnd() * 3, i % 2 ? C.tealSoft : C.warm, 40 + rnd() * 30);
}

/* 10. 回声弧 + 波形 */
cv.arc(W * 0.5, H * 0.44, 480, Math.PI * 1.12, Math.PI * 1.88, C.teal, 4, 70);
cv.arc(W * 0.5, H * 0.44, 548, Math.PI * 1.16, Math.PI * 1.84, C.amber, 2.6, 48);
for (let x = 0; x < W; x++) {
    const y1 = H * 0.38 + Math.sin(x * 0.008) * 26 + Math.sin(x * 0.0021) * 12;
    cv.put(x, y1, C.tealSoft, 60);
    const y2 = H * 0.74 + Math.sin(x * 0.006 + 1.8) * 20;
    cv.put(x, y2, C.amberHi, 38);
}

/* 11. 上下暗角（保文字对比度） */
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
    const vig = Math.max(0, 0.4 - Math.min(ex, ey) * 2.2);
    if (vig > 0) cv.put(x, y, [5, 8, 14], Math.round(vig * 160));
}

fs.writeFileSync(OUT, encodePNG(W, H, cv.px));
console.log('bg-echo.png v3 月下酒廊', W + 'x' + H, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
