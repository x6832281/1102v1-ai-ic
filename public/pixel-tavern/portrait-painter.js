/* ============================================================
 * 幻境回声 · EchoCraft — 「琉璃像馆」清晰肖像绘制器（共享引擎）
 * 逐像素软渲染：平滑渐变 / 软边椭圆 / 弧线光描，零外部素材
 * 门户（avatars.js 经 ImageData）与 /web 海报（tools/make-card-covers.mjs
 * 经 vm）共用本文件——改动外观请只改这里。
 *
 * 坐标系：设计宽 320，设计高 DH = H/s（s = min(W/320, H/400)，方形画布
 * H/s = 320）；所有特征坐标在 [0..320]×[0..DH] 内。
 * ============================================================ */
'use strict';

(function () {
    const TEAL = '#00d1b2', AMBER = '#fbbf24';

    /* ---------- 颜色工具 ---------- */
    function hexRGB(c) {
        if (!c || c[0] !== '#') return [100, 116, 139];
        let h = c.slice(1);
        if (h.length === 3) h = h.split('').map(x => x + x).join('');
        const n = parseInt(h, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function shade(c, amt) {
        const [r, g, b] = hexRGB(c);
        const cl = v => Math.max(0, Math.min(255, Math.round(v + amt)));
        return [cl(r), cl(g), cl(b)];
    }
    function mix(a, b, t) {
        return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
    }
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---------- 软渲染基元（RGBA 缓冲，设备像素） ----------
     * 所有基元接受设备坐标；设计坐标由 paint() 换算后传入。
     * 覆盖率用 smoothstep 软边，天然抗锯齿。 */
    function makeCtx(buf, W, H) {
        const put = (x, y, r, g, b, a) => {
            if (x < 0 || y < 0 || x >= W || y >= H) return;
            const i = (y * W + x) * 4;
            const sa = a;
            buf[i] = buf[i] + (r - buf[i]) * sa;
            buf[i + 1] = buf[i + 1] + (g - buf[i + 1]) * sa;
            buf[i + 2] = buf[i + 2] + (b - buf[i + 2]) * sa;
            buf[i + 3] = Math.max(buf[i + 3], Math.min(255, a * 255 + buf[i + 3]));
        };
        return {
            W, H,
            /* 垂直渐变矩形（背景） */
            vgrad(x, y, w, h, c0, c1) {
                const x0 = Math.max(0, Math.round(x)), x1 = Math.min(W, Math.round(x + w));
                const y0 = Math.max(0, Math.round(y)), y1 = Math.min(H, Math.round(y + h));
                for (let yy = y0; yy < y1; yy++) {
                    const t = (yy - y0) / Math.max(1, y1 - y0);
                    const [r, g, b] = mix(c0, c1, t);
                    for (let xx = x0; xx < x1; xx++) put(xx, yy, r, g, b, 1);
                }
            },
            /* 径向辉光（平方衰减） */
            glow(cx, cy, r, col, a) {
                const R = Math.ceil(r);
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                    const d = Math.sqrt(dx * dx + dy * dy) / r;
                    if (d >= 1) continue;
                    const [cr, cg, cb] = col;
                    put(Math.round(cx + dx), Math.round(cy + dy), cr, cg, cb, a * (1 - d) * (1 - d));
                }
            },
            /* 旋转软边椭圆：radial 时内浅外深，否则按纵向混合 colTop→colBot */
            ell(cx, cy, rx, ry, rot, colTop, colBot, a, opts = {}) {
                const feather = Math.max(1.1 / (this._s || 1), 0.9);
                const cos = Math.cos(rot), sin = Math.sin(rot);
                const R = Math.ceil(Math.max(rx, ry) + feather * 2);
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                    const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
                    const d = Math.sqrt((lx / rx) * (lx / rx) + (ly / ry) * (ly / ry));
                    if (d > 1 + feather / Math.min(rx, ry)) continue;
                    const cov = Math.max(0, Math.min(1, (1 - d) * Math.min(rx, ry) / feather));
                    let col;
                    if (opts.radial) col = mix(opts.inner || colTop, colTop, Math.min(1, d * 1.15));
                    else col = mix(colTop, colBot, Math.max(0, Math.min(1, (ly / ry + 1) / 2)));
                    put(Math.round(cx + dx), Math.round(cy + dy), col[0], col[1], col[2], a * cov);
                }
            },
            /* 圆头胶囊（睫毛/眉/领口滚边） */
            capsule(x0, y0, x1, y1, r, col, a) {
                const dx = x1 - x0, dy = y1 - y0;
                const len2 = dx * dx + dy * dy || 1;
                const feather = Math.max(1.1 / (this._s || 1), 0.9);
                const minX = Math.min(x0, x1) - r - feather, maxX = Math.max(x0, x1) + r + feather;
                const minY = Math.min(y0, y1) - r - feather, maxY = Math.max(y0, y1) + r + feather;
                for (let yy = Math.floor(minY); yy <= Math.ceil(maxY); yy++) for (let xx = Math.floor(minX); xx <= Math.ceil(maxX); xx++) {
                    const t = Math.max(0, Math.min(1, ((xx - x0) * dx + (yy - y0) * dy) / len2));
                    const px = x0 + dx * t, py = y0 + dy * t;
                    const d = Math.sqrt((xx - px) * (xx - px) + (yy - py) * (yy - py)) - r;
                    const cov = Math.max(0, Math.min(1, 1 - d / feather));
                    if (cov <= 0) continue;
                    const [cr, cg, cb] = col;
                    put(xx, yy, cr, cg, cb, a * cov);
                }
            },
            /* 细环带（回声弧） */
            band(cx, cy, r, a0, a1, w, col, a) {
                const steps = Math.max(48, Math.round(r * 2));
                for (let s = 0; s <= steps; s++) {
                    const ang = a0 + (a1 - a0) * (s / steps);
                    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
                    this.capsule(x, y, x + Math.cos(ang) * 0.5, y + Math.sin(ang) * 0.5, w, col, a);
                }
            },
            _s: 1,
        };
    }

    /* ---------- 外观参数（trait 系统，与卡片 avatar 字段对齐） ---------- */
    function buildSpec(char, seed) {
        const pal = char.palette || {};
        const hint = char.avatar || {};
        const rand = mulberry32(seed || 1);
        const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
        return {
            bg1: pal.bg1 || '#2c3e6b',
            hair: pal.hair || '#4a6572',
            skin: pal.skin || '#f2d3b3',
            hairStyle: hint.hairStyle || pick(['long', 'bob', 'twin', 'ponytail', 'bun', 'short']),
            bangs: hint.bangs || pick(['full', 'side', 'center', 'wispy']),
            mouth: hint.mouth || pick(['soft', 'smile', 'calm']),
            hat: !!hint.hat,
            glasses: hint.glasses != null ? !!hint.glasses : rand() < 0.3,
            earring: hint.earring != null ? !!hint.earring : rand() < 0.24,
            trim: hint.trim || (rand() < 0.5 ? TEAL : AMBER),
            eye: hint.eye || null,
        };
    }

    /* ---------- 主绘制：清晰半身像 ---------- */
    function paint(buf, W, H, char) {
        const g = makeCtx(buf, W, H);
        const s = Math.min(W / 320, H / 400);
        const DH = H / s;
        const ox = (W - 320 * s) / 2, oy = (H - 400 * s) / 2;
        const S = (v) => v * s; /* 设计 → 设备 */
        g._s = s;

        const p = buildSpec(char, char.seed || 1);
        const skinC = hexRGB(p.skin), skinD = shade(p.skin, -18), skinDD = shade(p.skin, -42);
        const hairC = hexRGB(p.hair), hairL = shade(p.hair, 40), hairD = shade(p.hair, -30), hairDD = shade(p.hair, -58);
        const bgC = hexRGB(p.bg1);
        const bodyTop = shade(p.bg1, -14), bodyBot = shade(p.bg1, -60);
        const eyeC = mix(shade(p.bg1, -70), hexRGB(TEAL), 0.16);
        const lipC = [184, 106, 94];
        const trimC = hexRGB(p.trim);
        const tealC = hexRGB(TEAL), amberC = hexRGB(AMBER);
        const tiny = s < 0.22; /* 微型头像：省略氛围细节 */

        const DHs = S(DH);
        const headCY = (DH >= 380 ? 150 : 138) * s + oy;
        const headCX = 160 * s + ox;
        const hs = s; /* 尺寸缩放 */

        /* ===== 背景 ===== */
        g.vgrad(0, 0, W, H, mix([6, 10, 17], bgC, 0.16), mix([5, 8, 14], bgC, 0.34));
        g.glow(headCX, headCY - S(20), S(150), hairC, 0.30);
        if (!tiny) {
            const rand = mulberry32((char.seed || 1) * 7 + 13);
            for (let i = 0; i < 26; i++) {
                const bx = rand() * W, by = rand() * H * 0.6, br = 1 + rand() * 2.2;
                g.glow(bx, by, br * 2.2, rand() > 0.7 ? [255, 255, 255] : [102, 212, 190], 0.35 + rand() * 0.4);
            }
            g.band(W / 2, headCY + S(30), S(150), Math.PI * 1.12, Math.PI * 1.88, Math.max(1.2, S(2.4)), tealC, 0.4);
            g.band(W / 2, headCY + S(30), S(172), Math.PI * 1.18, Math.PI * 1.82, Math.max(1, S(1.6)), amberC, 0.2);
        }

        /* ===== 身体（先画，头/发压在其上） ===== */
        const shY = headCY + S(88);
        g.ell(headCX - S(62), shY + S(28), S(46), S(42), 0, bodyTop, bodyBot, 1);
        g.ell(headCX + S(62), shY + S(28), S(46), S(42), 0, bodyTop, bodyBot, 1);
        g.ell(headCX, shY + S(120), S(116), S(124), 0, bodyTop, bodyBot, 1);
        /* 领口 V + 焰色滚边 */
        g.capsule(headCX - S(26), shY - S(2), headCX, shY + S(18), Math.max(1.4, S(2.6)), trimC, 0.9);
        g.capsule(headCX + S(26), shY - S(2), headCX, shY + S(18), Math.max(1.4, S(2.6)), trimC, 0.9);
        g.glow(headCX, shY + S(2), S(14), skinDD, 0.5);
        /* 左胸回声微标 */
        g.glow(headCX - S(52), shY + S(52), S(3.4), trimC, 0.9);
        g.glow(headCX - S(46), shY + S(56), S(2.2), trimC, 0.5);

        /* ===== 头发：后层 ===== */
        g.ell(headCX, headCY + S(6), S(76), S(88), 0, hairC, hairDD, 1); /* 主体积 */
        if (p.hairStyle === 'long') {
            for (const side of [-1, 1]) {
                g.ell(headCX + side * S(66), headCY + S(48), S(30), S(96), side * 0.08, hairC, hairDD, 1);
                g.ell(headCX + side * S(80), headCY + S(20), S(20), S(70), side * 0.16, hairD, hairDD, 1);
            }
        } else if (p.hairStyle === 'bob') {
            for (const side of [-1, 1]) g.ell(headCX + side * S(64), headCY + S(30), S(30), S(58), side * 0.06, hairC, hairDD, 1);
        } else if (p.hairStyle === 'twin') {
            for (const side of [-1, 1]) {
                g.ell(headCX + side * S(84), headCY + S(58), S(24), S(58), side * 0.18, hairC, hairDD, 1);
                g.glow(headCX + side * S(66), headCY + S(16), S(4.5), trimC, 0.95); /* 发绳焰色 */
            }
        } else if (p.hairStyle === 'ponytail') {
            g.ell(headCX + S(74), headCY + S(52), S(26), S(64), 0.22, hairC, hairDD, 1);
            g.glow(headCX + S(56), headCY - S(2), S(5.5), trimC, 0.95); /* 束发焰色 */
        } else if (p.hairStyle === 'bun') {
            g.ell(headCX, headCY - S(84), S(28), S(22), 0, hairL, hairD, 1);
        } /* short：仅主体积 */

        /* ===== 颈 ===== */
        g.ell(headCX, headCY + S(62), S(17), S(26), 0, skinC, skinD, 1);
        g.glow(headCX, headCY + S(56), S(18), skinDD, 0.45); /* 下颌投影 */

        /* ===== 脸 ===== */
        g.ell(headCX, headCY, S(58), S(70), 0, skinC, skinD, 1);
        /* 耳 */
        g.ell(headCX - S(56), headCY + S(4), S(9), S(13), -0.12, skinC, skinD, 1);
        g.ell(headCX + S(56), headCY + S(4), S(9), S(13), 0.12, skinC, skinD, 1);
        /* 腮红 */
        g.glow(headCX - S(38), headCY + S(30), S(13), [242, 163, 163], 0.4);
        g.glow(headCX + S(38), headCY + S(30), S(13), [242, 163, 163], 0.4);
        /* 鼻影 */
        g.glow(headCX, headCY + S(34), S(6), skinDD, 0.4);

        /* ===== 眼睛 ===== */
        const eyeY = headCY + S(10);
        for (const side of [-1, 1]) {
            const ex = headCX + side * S(26);
            /* 眼窝微影 */
            g.ell(ex, eyeY, S(15), S(11), 0, skinD, skinC, 0.5);
            /* 虹膜（径向：亮心深缘） */
            g.ell(ex, eyeY, S(10.5), S(9.5), 0, eyeC, eyeC, 1, { radial: true, inner: mix(eyeC, [255, 255, 255], 0.35) });
            /* 瞳 */
            g.ell(ex, eyeY + S(1), S(4.6), S(5.2), 0, [24, 28, 40], [10, 12, 20], 1);
            /* 高光双点 */
            g.glow(ex - side * S(3.5), eyeY - S(3), S(3.2), [255, 255, 255], 0.95);
            g.glow(ex + side * S(3.5), eyeY + S(3.5), S(1.8), [255, 255, 255], 0.5);
            /* 上睫毛（粗弧 + 外眼角翼） */
            g.capsule(ex - side * S(13), eyeY - S(9.5), ex + side * S(12), eyeY - S(8), Math.max(1.4, S(3.4)), hairDD, 0.95);
            g.capsule(ex + side * S(12), eyeY - S(8), ex + side * S(18), eyeY - S(13), Math.max(1, S(2.2)), hairDD, 0.85);
            /* 眉（soft） */
            g.capsule(ex - side * S(9), headCY - S(17), ex + side * S(10), headCY - S(15), Math.max(1.2, S(3)), mix(hairD, skinC, 0.4), 0.75);
        }

        /* 口型 */
        if (p.mouth === 'smile') {
            g.ell(headCX, headCY + S(47), S(8.5), S(4), 0, mix(lipC, [255, 255, 255], 0.15), lipC, 0.95);
            g.capsule(headCX - S(10), headCY + S(45), headCX - S(6), headCY + S(43), Math.max(0.9, S(1.4)), lipC, 0.5);
            g.capsule(headCX + S(10), headCY + S(45), headCX + S(6), headCY + S(43), Math.max(0.9, S(1.4)), lipC, 0.5);
        } else if (p.mouth === 'soft') {
            g.ell(headCX, headCY + S(47), S(6.5), S(3.2), 0, lipC, shade(p.hair, -10), 0.9);
        } else {
            g.capsule(headCX - S(6), headCY + S(47), headCX + S(6), headCY + S(47), Math.max(1, S(1.6)), [160, 90, 80], 0.8);
        }


        /* ===== 头发：顶与前层（帽替换顶部） ===== */
        if (p.hat) {
            /* 魔女帽：锥顶叠层 + 宽檐 + 焰色帽带 */
            g.ell(headCX, headCY - S(38), S(46), S(30), 0, hairC, hairD, 1);
            g.ell(headCX, headCY - S(72), S(34), S(24), 0, hairD, hairDD, 1);
            g.ell(headCX, headCY - S(102), S(22), S(18), 0, hairDD, hairDD, 1);
            g.ell(headCX, headCY - S(62), S(92), S(13), 0, hairL, hairD, 1); /* 宽檐 */
            g.capsule(headCX - S(66), headCY - S(56), headCX + S(66), headCY - S(52), Math.max(1.6, S(3.6)), trimC, 0.95);
        } else {
            g.ell(headCX, headCY - S(36), S(62), S(42), 0, hairL, hairC, 1); /* 发顶 */
            /* 刘海变体 */
            if (p.bangs === 'full') {
                g.ell(headCX, headCY - S(14), S(56), S(24), 0, hairC, hairD, 1);
            } else if (p.bangs === 'side') {
                g.ell(headCX - S(18), headCY - S(14), S(40), S(22), -0.14, hairC, hairD, 1);
                g.ell(headCX + S(34), headCY - S(12), S(22), S(14), 0.2, hairD, hairDD, 0.9);
            } else if (p.bangs === 'center') {
                for (const side of [-1, 1]) g.ell(headCX + side * S(28), headCY - S(14), S(32), S(22), side * 0.12, hairC, hairD, 1);
            } else {
                for (const side of [-1, 1]) g.ell(headCX + side * S(30), headCY - S(12), S(24), S(17), side * 0.18, hairC, hairD, 0.96);
            }
            /* 侧发垂落 */
            for (const side of [-1, 1]) g.ell(headCX + side * S(50), headCY + S(6), S(16), S(30), side * 0.08, hairC, hairDD, 0.95);
        }
        /* 发丝光泽 */
        g.glow(headCX - S(14), headCY - S(46), S(30), [255, 255, 255], 0.16);
        g.glow(headCX + S(20), headCY - S(40), S(18), [255, 255, 255], 0.10);

        /* ===== 配饰 ===== */
        if (p.glasses) {
            const gc = [223, 233, 242];
            for (const side of [-1, 1]) {
                const ex = headCX + side * S(26);
                g.capsule(ex - S(13), eyeY - S(10), ex + S(13), eyeY - S(9), Math.max(1, S(1.8)), gc, 0.8);
                g.capsule(ex - S(13), eyeY + S(10), ex + S(13), eyeY + S(9), Math.max(1, S(1.8)), gc, 0.8);
                g.capsule(ex - S(14), eyeY - S(9), ex - S(14), eyeY + S(10), Math.max(1, S(1.8)), gc, 0.8);
                g.capsule(ex + S(14), eyeY - S(9), ex + S(14), eyeY + S(10), Math.max(1, S(1.8)), gc, 0.8);
            }
            g.capsule(headCX - S(12), eyeY - S(6), headCX + S(12), eyeY - S(6), Math.max(1, S(1.6)), gc, 0.65);
        }
        if (p.earring) {
            g.glow(headCX - S(56), headCY + S(16), S(3.6), amberC, 0.95);
            g.glow(headCX + S(56), headCY + S(16), S(3.6), amberC, 0.95);
        }

        /* ===== 青琥珀双缘光（EchoCraft 光语） ===== */
        if (!tiny) {
            g.band(headCX - S(10), headCY - S(6), S(88), Math.PI * 0.62, Math.PI * 1.0, Math.max(1.6, S(3.2)), tealC, 0.34);
            g.band(headCX + S(10), headCY - S(6), S(88), Math.PI * 0.14, Math.PI * 0.44, Math.max(1.4, S(2.8)), amberC, 0.26);
            g.band(headCX, shY + S(60), S(128), Math.PI * 0.78, Math.PI * 1.02, Math.max(1.6, S(3.4)), tealC, 0.26);
            g.band(headCX, shY + S(60), S(128), Math.PI * 0.12, Math.PI * 0.3, Math.max(1.4, S(2.8)), amberC, 0.2);
        }

        /* ===== 底部收束 ===== */
        if (!tiny) {
            for (let yy = Math.round(H - S(90)); yy < H; yy++) {
                const t = (yy - (H - S(90))) / S(90);
                const [r0, g0, b0] = [5, 8, 14];
                for (let xx = 0; xx < W; xx++) {
                    const i = (yy * W + xx) * 4;
                    buf[i] = buf[i] + (r0 - buf[i]) * t * 0.4;
                    buf[i + 1] = buf[i + 1] + (g0 - buf[i + 1]) * t * 0.4;
                    buf[i + 2] = buf[i + 2] + (b0 - buf[i + 2]) * t * 0.4;
                }
            }
        }
    }

    window.ECPainter = { paint, buildSpec };
})();
