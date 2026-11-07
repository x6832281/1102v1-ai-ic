/* ============================================================
 * 游戏酒馆 · 品牌资产生成器（零依赖，纯 Node）
 * 生成 public/pixel-tavern/brand/ 下的图标与 OG 横幅：
 *   icon-32/64/192/512.png（16×16 招牌·最近邻放大）
 *   og-banner.png（1200×630，5×7 位图字体标语）
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'pixel-tavern', 'brand');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- PNG 编码（RGBA8，无压缩滤波） ---------- */
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
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const stride = w * 4;
    const raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 调色板 ---------- */
const C = {
    bg: [13, 16, 15, 255],        // #0d100f
    bg2: [17, 21, 19, 255],
    goldHi: [232, 201, 122, 255], // #e8c97a
    gold: [212, 169, 78, 255],    // #d4a94e
    glow: [255, 181, 69, 255],    // #ffb545
    dark: [10, 12, 11, 255],
    ember: [224, 122, 62, 255],
    dim: [154, 160, 142, 255],    // #9aa08e
    line: [46, 52, 48, 255],
};

/* ---------- 16×16 招牌：像素啤酒杯 ---------- */
function drawSign16() {
    const w = 16, h = 16;
    const px = Buffer.alloc(w * h * 4);
    const set = (x, y, c) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        px.set(c, (y * w + x) * 4);
    };
    const rect = (x, y, rw, rh, c) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c); };
    rect(0, 0, 16, 16, C.bg);
    /* 泡沫（带冒出的气泡） */
    rect(3, 3, 10, 3, C.goldHi);
    rect(4, 2, 3, 1, C.goldHi);
    rect(9, 2, 3, 1, C.goldHi);
    set(2, 4, C.goldHi); set(13, 4, C.goldHi);
    /* 杯体 */
    rect(4, 6, 8, 8, C.gold);
    /* 竖向高光 */
    rect(5, 6, 2, 8, [232, 201, 122, 255]);
    /* 酒液波纹 */
    rect(6, 9, 5, 1, [232, 201, 122, 255]);
    /* 把手（右侧，带孔） */
    rect(12, 6, 1, 6, C.gold);
    rect(14, 6, 1, 6, C.gold);
    rect(12, 6, 3, 1, C.gold);
    rect(12, 11, 3, 1, C.gold);
    rect(13, 7, 1, 4, C.bg);
    /* 杯底与桌面 */
    rect(4, 14, 8, 1, [166, 128, 52, 255]);
    rect(2, 15, 12, 1, C.line);
    return { w, h, px };
}

function scaleNearest(src, factor) {
    const { w, h, px } = src;
    const ow = w * factor, oh = h * factor;
    const out = Buffer.alloc(ow * oh * 4);
    for (let y = 0; y < oh; y++) {
        const sy = Math.floor(y / factor);
        for (let x = 0; x < ow; x++) {
            const sx = Math.floor(x / factor);
            px.copy(out, (y * ow + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
        }
    }
    return { w: ow, h: oh, px: out };
}

/* ---------- 5×7 位图字体（仅 OG 横幅所需 ASCII） ---------- */
const FONT5x7 = {
    'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    'G': ['01110', '10001', '10000', '10011', '10001', '10001', '01111'],
    'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    '·': ['00000', '00000', '00000', '00100', '00000', '00000', '00000'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/* ---------- OG 横幅 1200×630 ---------- */
function drawBanner() {
    const w = 1200, h = 630;
    const px = Buffer.alloc(w * h * 4);
    const set = (x, y, c) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        px.set(c, (y * w + x) * 4);
    };
    const rect = (x, y, rw, rh, c) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c); };
    /* 底色 + 微纹理 */
    rect(0, 0, w, h, C.bg);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) if (((x + y) / 8) % 2 === 0) rect(x, y, 8, 8, C.bg2);
    /* 双层金边 */
    rect(16, 16, w - 32, h - 32, C.gold);
    rect(20, 20, w - 40, h - 40, C.bg);
    rect(24, 24, w - 48, h - 48, [212, 169, 78, 120]);
    rect(28, 28, w - 56, h - 56, C.bg);
    /* 中央招牌（×14 = 224px） */
    const sign = scaleNearest(drawSign16(), 14);
    const sx = 120, sy = Math.floor((h - sign.h) / 2);
    for (let y = 0; y < sign.h; y++) for (let x = 0; x < sign.w; x++) {
        const off = (y * sign.w + x) * 4;
        set(sx + x, sy + y, [sign.px[off], sign.px[off + 1], sign.px[off + 2], 255]);
    }
    /* 招牌光晕 */
    rect(sx - 12, sy + 40, sign.w + 24, 8, [255, 181, 69, 40]);
    /* 文案绘制器 */
    const drawText = (text, tx, ty, scale, color) => {
        let cx = tx;
        for (const ch of text) {
            const g = FONT5x7[ch];
            if (g) {
                for (let r = 0; r < 7; r++) for (let c2 = 0; c2 < 5; c2++) {
                    if (g[r][c2] === '1') rect(cx + c2 * scale, ty + r * scale, scale, scale, color);
                }
            }
            cx += 6 * scale;
        }
        return cx;
    };
    const textX = sx + sign.w + 64;
    drawText('GAME', textX, 190, 12, C.goldHi);
    drawText('TAVERN', textX, 300, 12, C.gold);
    drawText('ONLINE · AI · ROLEPLAY', textX, 410, 4, C.dim);
    /* 底部炉火点缀 */
    for (let i = 0; i < 3; i++) {
        const fx = 340 + i * 260;
        rect(fx, h - 92, 24, 12, C.ember);
        rect(fx + 4, h - 104, 16, 12, C.glow);
        rect(fx + 8, h - 112, 8, 8, C.goldHi);
    }
    return { w, h, px };
}

/* ---------- 输出 ---------- */
const sign = drawSign16();
for (const size of [32, 64, 192, 512]) {
    const icon = scaleNearest(sign, size / 16);
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), encodePNG(icon.w, icon.h, icon.px));
    console.log(`icon-${size}.png  ${icon.w}x${icon.h}`);
}
const banner = drawBanner();
fs.writeFileSync(path.join(OUT, 'og-banner.png'), encodePNG(banner.w, banner.h, banner.px));
console.log(`og-banner.png  ${banner.w}x${banner.h}`);
console.log('DONE ->', OUT);
