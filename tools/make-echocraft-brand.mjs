/* ============================================================
 * 幻境回声 · EchoCraft — 品牌资产生成器（零依赖，纯 Node，自有版权）
 * 视觉语言对齐 avatars.js drawTavernLogo：青色回声弧 + 琥珀棱镜 + 白核
 * 产出：brand/og-banner.png（1200×630）与 icon-32/64/192/512.png
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'pixel-tavern', 'brand');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
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
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 调色 ---------- */
const C = {
    deep: [8, 13, 20], deep2: [11, 17, 26],
    teal: [0, 209, 178], tealSoft: [102, 212, 190],
    amber: [245, 158, 11], amberHi: [253, 200, 96],
    white: [255, 255, 255], dim: [154, 168, 178],
    line: [30, 42, 54],
};

/* ---------- 画布工具 ---------- */
function makeCanvas(w, h, base) {
    const px = Buffer.alloc(w * h * 4);
    const set = (x, y, c, a = 255) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const o = (y * w + x) * 4;
        const sa = a / 255;
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
            for (let t = 0; t < width; t++) {
                set(cx + Math.cos(ang) * (r + t), cy + Math.sin(ang) * (r + t), color, alpha);
            }
        }
    };
    const seg = (x0, y0, x1, y1, color, width, alpha = 255) => {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let s = 0; s <= steps; s++) {
            const x = x0 + (x1 - x0) * (s / steps);
            const y = y0 + (y1 - y0) * (s / steps);
            for (let t = 0; t < width; t++) {
                set(x + t * 0.5, y, color, alpha);
            }
        }
    };
    const disc = (cx, cy, r, color, alpha = 255) => {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            if (i * i + j * j <= r * r) set(cx + i, cy + j, color, alpha);
        }
    };
    const glow = (cx, cy, r, color, alpha) => {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
            const d = Math.sqrt(i * i + j * j) / r;
            if (d <= 1) set(cx + i, cy + j, color, Math.round(alpha * (1 - d)));
        }
    };
    return { px, set, rect, arc, seg, disc, glow, w, h };
}

/* ---------- 品牌图腾（回声弧 + 棱镜 + 白核） ---------- */
function drawEmblem(cv, cx, cy, r) {
    /* 三层青色回声弧（余韵） */
    cv.arc(cx, cy, r, -Math.PI * 0.25, Math.PI * 1.45, C.teal, Math.max(2, Math.round(r * 0.10)), 235);
    cv.arc(cx, cy, r * 0.82, -Math.PI * 0.1, Math.PI * 1.2, C.tealSoft, Math.max(1, Math.round(r * 0.05)), 120);
    cv.arc(cx, cy, r * 0.66, Math.PI * 0.05, Math.PI * 1.0, C.tealSoft, 1, 70);
    /* 琥珀棱镜三角 */
    cv.seg(cx, cy - r * 0.85, cx + r * 0.7, cy + r * 0.6, C.amber, Math.max(2, Math.round(r * 0.08)), 255);
    cv.seg(cx + r * 0.7, cy + r * 0.6, cx - r * 0.7, cy + r * 0.6, C.amber, Math.max(2, Math.round(r * 0.08)), 255);
    cv.seg(cx - r * 0.7, cy + r * 0.6, cx, cy - r * 0.85, C.amberHi, Math.max(2, Math.round(r * 0.08)), 255);
    /* 白色核心 + 微光 */
    cv.glow(cx, cy, r * 0.5, C.teal, 70);
    cv.disc(cx, cy, Math.max(2, r * 0.18), C.white, 255);
}

/* ---------- 5×7 位图字体（新增 C H F S） ---------- */
const FONT5x7 = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/* ---------- OG 横幅 1200×630 ---------- */
function drawBanner() {
    const w = 1200, h = 630;
    const cv = makeCanvas(w, h);
    /* 深空底 + 渐变 */
    for (let y = 0; y < h; y++) {
        const t = y / h;
        const c = [Math.round(C.deep[0] + 6 * t), Math.round(C.deep[1] + 8 * t), Math.round(C.deep[2] + 12 * t)];
        cv.rect(0, y, w, 1, c);
    }
    /* 细网格 */
    for (let y = 0; y < h; y += 36) cv.rect(0, y, w, 1, C.line, 110);
    for (let x = 0; x < w; x += 36) cv.rect(x, 0, 1, h, C.line, 110);
    /* 星点 */
    let seed = 20261112;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xFFFFFFFF; };
    for (let i = 0; i < 220; i++) cv.set(Math.floor(rnd() * w), Math.floor(rnd() * h), C.tealSoft, Math.round(30 + rnd() * 110));
    /* 双层金/青边框 */
    cv.rect(14, 14, w - 28, h - 28, C.teal, 200);
    cv.rect(18, 18, w - 36, h - 36, C.deep);
    cv.rect(22, 22, w - 44, h - 44, C.amber, 150);
    cv.rect(26, 26, w - 52, h - 52, C.deep);
    /* 中央图腾 */
    drawEmblem(cv, 250, 315, 150);
    /* 回声波形线（正弦，贯穿右侧） */
    for (let x = 470; x <= 1120; x++) {
        const y = 200 + Math.sin((x - 470) * 0.022) * 34 + Math.sin((x - 470) * 0.007) * 14;
        cv.set(x, y, C.tealSoft, 220);
        cv.set(x, y + 1, C.teal, 140);
    }
    /* 文案 */
    const drawText = (text, tx, ty, scale, color, alpha = 255) => {
        let cx = tx;
        for (const ch of text) {
            const g = FONT5x7[ch];
            if (g) for (let r = 0; r < 7; r++) for (let c2 = 0; c2 < 5; c2++) {
                if (g[r][c2] === '1') cv.rect(cx + c2 * scale, ty + r * scale, scale, scale, color, alpha);
            }
            cx += 6 * scale;
        }
        return cx;
    };
    drawText('ECHOCRAFT', 470, 260, 11, C.teal, 255);
    drawText('IMMERSIVE', 470, 372, 5, C.amberHi, 230);
    drawText('NARRATIVE SALON', 470, 420, 5, C.dim, 210);
    /* 底部回声点阵 */
    for (let i = 0; i < 7; i++) cv.disc(500 + i * 90, h - 90, 4 + (i % 3) * 3, i % 2 ? C.teal : C.amber, 200);
    return { w, h, px: cv.px };
}

/* ---------- 图标（单尺寸） ---------- */
function drawIcon(size) {
    const cv = makeCanvas(size, size);
    cv.rect(0, 0, size, size, C.deep);
    if (size >= 192) {
        /* 大图标：星点装饰 */
        let seed = size;
        const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0xFFFFFFFF; };
        for (let i = 0; i < 40; i++) cv.set(Math.floor(rnd() * size), Math.floor(rnd() * size), C.tealSoft, 140);
    }
    drawEmblem(cv, size / 2, size / 2, size * 0.36);
    return { w: size, h: size, px: cv.px };
}

/* ---------- 输出 ---------- */
const banner = drawBanner();
fs.writeFileSync(path.join(OUT, 'og-banner.png'), encodePNG(banner.w, banner.h, banner.px));
console.log('og-banner.png', banner.w + 'x' + banner.h, (fs.statSync(path.join(OUT, 'og-banner.png')).size / 1024).toFixed(0) + 'KB');
for (const size of [32, 64, 192, 512]) {
    const icon = drawIcon(size);
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), encodePNG(icon.w, icon.h, icon.px));
    console.log(`icon-${size}.png`, (fs.statSync(path.join(OUT, `icon-${size}.png`)).size / 1024).toFixed(1) + 'KB');
}
console.log('DONE ->', OUT);
