/* ============================================================
 * 幻境回声 · EchoCraft — 「琉璃像馆」清晰肖像绘制器 v2（共享引擎）
 * 逐像素软渲染：平滑渐变 / 软边椭圆 / 弧线光描 / 发丝线 / 分类场景道具
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

    /* ---------- 软渲染基元（RGBA 缓冲，设备像素） ---------- */
    function makeCtx(buf, W, H) {
        const put = (x, y, r, g, b, a) => {
            if (x < 0 || y < 0 || x >= W || y >= H) return;
            const i = (y * W + x) * 4;
            buf[i] = buf[i] + (r - buf[i]) * a;
            buf[i + 1] = buf[i + 1] + (g - buf[i + 1]) * a;
            buf[i + 2] = buf[i + 2] + (b - buf[i + 2]) * a;
            buf[i + 3] = Math.min(255, buf[i + 3] + a * 255);
        };
        return {
            W, H,
            vgrad(x, y, w, h, c0, c1) {
                const x0 = Math.max(0, Math.round(x)), x1 = Math.min(W, Math.round(x + w));
                const y0 = Math.max(0, Math.round(y)), y1 = Math.min(H, Math.round(y + h));
                for (let yy = y0; yy < y1; yy++) {
                    const t = (yy - y0) / Math.max(1, y1 - y0);
                    const [r, g, b] = mix(c0, c1, t);
                    for (let xx = x0; xx < x1; xx++) put(xx, yy, r, g, b, 1);
                }
            },
            glow(cx, cy, r, col, a) {
                const R = Math.ceil(r);
                for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
                    const d = Math.sqrt(dx * dx + dy * dy) / r;
                    if (d >= 1) continue;
                    const [cr, cg, cb] = col;
                    put(Math.round(cx + dx), Math.round(cy + dy), cr, cg, cb, a * (1 - d) * (1 - d));
                }
            },
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
            band(cx, cy, r, a0, a1, w, col, a) {
                const steps = Math.max(48, Math.round(r * 2));
                for (let s = 0; s <= steps; s++) {
                    const ang = a0 + (a1 - a0) * (s / steps);
                    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
                    this.capsule(x, y, x + Math.cos(ang) * 0.5, y + Math.sin(ang) * 0.5, w, col, a);
                }
            },
            polyline(pts, r, col, a) {
                for (let i = 0; i < pts.length - 1; i++) this.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, col, a);
            },
            _s: 1,
        };
    }

    /* ---------- 外观参数 ---------- */
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
            eyeTilt: rand() * 0.12 - 0.06,
            eyeSize: 0.9 + rand() * 0.25,
            faceW: 0.94 + rand() * 0.12,
            cat: char.category || 'quiet',
        };
    }

    /* ---------- 分类场景道具（人物身后的叙事环境，软剪影） ---------- */
    function sceneProps(g, S, wx, headCY, base, p, rand) {
        if (p.cat === 'fantasy') {
            for (let i = 0; i < 5; i++) {
                const fx = wx + S(-130 + i * 65), fh = S(90 + rand() * 60);
                g.ell(fx, base - S(30) - fh / 2, S(26), fh / 2, 0, shade(p.bg1, -46), shade(p.bg1, -70), 0.85);
            }
            for (let i = 0; i < 8; i++) g.glow(wx + S(-120 + rand() * 240), headCY + S(-60 + rand() * 160), S(2.2 + rand() * 2), [190, 255, 214], 0.5);
        } else if (p.cat === 'neon') {
            for (let i = 0; i < 6; i++) {
                const bx = wx + S(-150 + i * 52), bw = S(44), bh = S(70 + rand() * 80);
                g.ell(bx, base - bh / 2, bw / 2, bh / 2, 0, shade(p.bg1, -50), shade(p.bg1, -72), 0.9);
            }
            g.glow(wx + S(-96), base - S(150), S(16), hexRGB(AMBER), 0.55);
            g.glow(wx + S(110), base - S(110), S(14), hexRGB(TEAL), 0.5);
        } else if (p.cat === 'history') {
            for (const side of [-1, 1]) {
                const lx = wx + side * S(118), ly = headCY - S(70);
                g.ell(lx, ly, S(13), S(16), 0, [214, 120, 66], [140, 64, 40], 0.92);
                g.capsule(lx, ly - S(24), lx, ly - S(15), Math.max(0.8, S(1.2)), [120, 80, 50], 0.8);
                g.glow(lx, ly, S(26), [255, 170, 90], 0.4);
            }
        } else if (p.cat === 'odyssey') {
            g.band(wx, headCY + S(40), S(180), Math.PI * 1.15, Math.PI * 1.75, Math.max(1.2, S(2)), [150, 170, 210], 0.4);
            g.glow(wx + S(120), headCY - S(90), S(20), [190, 200, 240], 0.35);
        }
    }

    /* ---------- 主绘制：清晰半身像 v2 ---------- */
    function paint(buf, W, H, char) {
        const g = makeCtx(buf, W, H);
        const s = Math.min(W / 320, H / 400);
        const DH = H / s;
        const ox = (W - 320 * s) / 2, oy = (H - 400 * s) / 2;
        const S = (v) => v * s;
        g._s = s;

        const p = buildSpec(char, char.seed || 1);
        const rand = mulberry32((char.seed || 1) * 3 + 7);
        const skinC = hexRGB(p.skin), skinD = shade(p.skin, -20), skinDD = shade(p.skin, -46), skinHi = shade(p.skin, 14);
        const hairC = hexRGB(p.hair), hairL = shade(p.hair, 44), hairD = shade(p.hair, -32), hairDD = shade(p.hair, -62);
        const bgC = hexRGB(p.bg1);
        const bodyTop = shade(p.bg1, -8), bodyBot = shade(p.bg1, -64);
        const eyeC = mix(shade(p.bg1, -74), hexRGB(TEAL), 0.2);
        const lipC = [186, 104, 92];
        const trimC = hexRGB(p.trim);
        const tealC = hexRGB(TEAL), amberC = hexRGB(AMBER);
        const tiny = s < 0.22;

        const headCY = (DH >= 380 ? 150 : 138) * s + oy;
        const headCX = 160 * s + ox;
        const shY = headCY + S(88);
        const base = headCY + S(240);

        /* ===== 背景 ===== */
        g.vgrad(0, 0, W, H, mix([6, 10, 17], bgC, 0.22), mix([5, 8, 14], bgC, 0.42));
        g.glow(headCX, headCY - S(20), S(160), hairC, 0.32);
        if (!tiny) {
            for (let i = 0; i < 26; i++) {
                const bx = rand() * W, by = rand() * H * 0.6, br = 1 + rand() * 2.4;
                g.glow(bx, by, br * 2.4, rand() > 0.7 ? [255, 255, 255] : [102, 212, 190], 0.32 + rand() * 0.4);
            }
            sceneProps(g, S, headCX, headCY, base, p, rand);
            g.band(W / 2, headCY + S(30), S(152), Math.PI * 1.12, Math.PI * 1.88, Math.max(1.2, S(2.4)), tealC, 0.42);
            g.band(W / 2, headCY + S(30), S(174), Math.PI * 1.18, Math.PI * 1.82, Math.max(1, S(1.6)), amberC, 0.22);
        }

        /* ===== 轮廓底影（暗色描边，让人物从背景里立出来） ===== */
        g.ell(headCX, headCY - S(2), S(64 * (p.faceW || 1)), S(78), 0, shade(p.bg1, -78), shade(p.bg1, -86), 0.55);

        /* ===== 头发：后层（先于脸） ===== */
        g.ell(headCX, headCY + S(2), S(78), S(86), 0, hairD, hairDD, 1);
        if (p.hairStyle === 'long') {
            for (const side of [-1, 1]) {
                g.ell(headCX + side * S(80), headCY + S(54), S(17), S(88), side * 0.12, hairC, hairDD, 1);
                g.ell(headCX + side * S(93), headCY + S(12), S(10), S(56), side * 0.22, hairD, hairDD, 1);
            g.capsule(headCX + side * S(80), headCY + S(30), headCX + side * S(82), headCY + S(90), Math.max(0.8, S(1.5)), hairL, 0.45);
            }
        } else if (p.hairStyle === 'bob') {
            for (const side of [-1, 1]) g.ell(headCX + side * S(65), headCY + S(30), S(31), S(58), side * 0.06, hairC, hairDD, 1);
        } else if (p.hairStyle === 'twin') {
            for (const side of [-1, 1]) g.ell(headCX + side * S(86), headCY + S(58), S(25), S(60), side * 0.18, hairC, hairDD, 1);
        } else if (p.hairStyle === 'ponytail') {
            g.ell(headCX + S(76), headCY + S(52), S(27), S(66), 0.22, hairC, hairDD, 1);
        } else if (p.hairStyle === 'bun') {
            g.ell(headCX, headCY - S(86), S(29), S(23), 0, hairL, hairD, 1);
        }


        /* ===== 身体 ===== */
        g.ell(headCX - S(62), shY + S(28), S(46), S(42), 0, bodyTop, bodyBot, 1);
        g.ell(headCX + S(62), shY + S(28), S(46), S(42), 0, bodyTop, bodyBot, 1);
        g.ell(headCX, shY + S(120), S(116), S(124), 0, bodyTop, bodyBot, 1);
        g.polyline([[headCX - S(78), shY + S(96)], [headCX - S(70), shY + S(140)], [headCX - S(76), shY + S(185)]], Math.max(1, S(2.2)), shade(p.bg1, -50), 0.5);
        g.polyline([[headCX + S(80), shY + S(100)], [headCX + S(72), shY + S(148)]], Math.max(1, S(2)), shade(p.bg1, -50), 0.45);
        g.glow(headCX - S(46), shY + S(22), S(30), shade(p.bg1, 26), 0.34);
        g.glow(headCX + S(30), shY + S(40), S(24), shade(p.bg1, -40), 0.3);
        g.capsule(headCX - S(26), shY - S(2), headCX, shY + S(18), Math.max(1.4, S(2.8)), trimC, 0.92);
        g.capsule(headCX + S(26), shY - S(2), headCX, shY + S(18), Math.max(1.4, S(2.8)), trimC, 0.92);
        g.glow(headCX, shY + S(2), S(15), skinDD, 0.5);
        g.capsule(headCX - S(96), shY + S(44), headCX - S(50), shY + S(12), Math.max(0.8, S(1.4)), trimC, 0.26);
        g.capsule(headCX + S(96), shY + S(44), headCX + S(50), shY + S(12), Math.max(0.8, S(1.4)), trimC, 0.26);
        g.glow(headCX - S(52), shY + S(52), S(3.4), trimC, 0.9);

        /* ===== 颈 ===== */
        g.ell(headCX, headCY + S(62), S(17), S(26), 0, skinC, skinD, 1);
        g.glow(headCX, headCY + S(56), S(19), skinDD, 0.5);

        /* ===== 脸 ===== */
        g.ell(headCX, headCY, S(58 * (p.faceW || 1)), S(70), 0, skinHi, skinD, 1);
        /* 月光顶光：上额亮、下颌暗、侧颊过渡 */
        g.glow(headCX, headCY - S(38), S(40), skinHi, 0.42);
        g.glow(headCX, headCY + S(52), S(40), skinDD, 0.34);
        g.glow(headCX - S(42), headCY + S(14), S(24), skinDD, 0.3);
        g.glow(headCX + S(42), headCY + S(14), S(24), skinDD, 0.3);
        g.glow(headCX - S(40), headCY + S(22), S(30), skinDD, 0.22);
        g.ell(headCX - S(56), headCY + S(4), S(9), S(13), -0.12, skinC, skinD, 1);
        g.ell(headCX + S(56), headCY + S(4), S(9), S(13), 0.12, skinC, skinD, 1);
        g.glow(headCX - S(38), headCY + S(30), S(14), [244, 158, 158], 0.42);
        g.glow(headCX + S(38), headCY + S(30), S(14), [244, 158, 158], 0.42);
        g.glow(headCX, headCY + S(34), S(6), skinDD, 0.42);

        /* ===== 眼睛 ===== */
        const eyeY = headCY + S(10);
        for (const side of [-1, 1]) {
            const ex = headCX + side * S(26);
            g.glow(ex, eyeY, S(17), skinHi, 0.3);
            const es = S(p.eyeSize || 1);
            g.ell(ex, eyeY + side * S(p.eyeTilt || 0) * 8, S(15), S(11.5) * (p.eyeSize || 1), 0, skinD, skinC, 0.45);
            g.ell(ex, eyeY + S(1), S(10.5) * (p.eyeSize || 1), S(7.6) * (p.eyeSize || 1), 0, [225, 230, 238], [198, 208, 220], 0.42);
            g.ell(ex, eyeY, S(10) * (p.eyeSize || 1), S(9) * (p.eyeSize || 1), 0, eyeC, eyeC, 1, { radial: true, inner: mix(eyeC, [255, 255, 255], 0.52) });
            g.ell(ex, eyeY - S(3.4), S(9.4), S(3.2), 0, shade(p.bg1, -78), shade(p.bg1, -78), 0.26);
            g.ell(ex, eyeY + S(1), S(4.4), S(5), 0, [16, 20, 32], [8, 10, 18], 1);
            g.glow(ex - side * S(3.6), eyeY - S(3.2), S(3.4), [255, 255, 255], 0.95);
            g.glow(ex + side * S(3.8), eyeY + S(3.6), S(1.9), [255, 255, 255], 0.55);
            g.capsule(ex - side * S(13), eyeY - S(9.8), ex + side * S(11), eyeY - S(8.6), Math.max(1.2, S(2.8)), hairDD, 0.92);
            g.capsule(ex + side * S(11), eyeY - S(8.6), ex + side * S(16), eyeY - S(12.4), Math.max(0.9, S(1.8)), hairDD, 0.8);
            g.capsule(ex - side * S(8), eyeY + S(11), ex + side * S(8), eyeY + S(11), Math.max(0.8, S(1.6)), skinHi, 0.5);
            g.capsule(ex - side * S(9), headCY - S(17), ex + side * S(10), headCY - S(15), Math.max(1.2, S(3)), mix(hairD, skinC, 0.38), 0.8);
        }

        /* 口型 */
        if (p.mouth === 'smile') {
            g.ell(headCX, headCY + S(47), S(7.6), S(3.6), 0, mix(lipC, [255, 255, 255], 0.12), lipC, 0.92);
        } else if (p.mouth === 'soft') {
            g.ell(headCX, headCY + S(47), S(6.8), S(3.4), 0, lipC, shade(p.hair, -12), 0.92);
        } else {
            g.capsule(headCX - S(6.4), headCY + S(47), headCX + S(6.4), headCY + S(47), Math.max(1, S(1.7)), [158, 88, 78], 0.85);
        }

        /* ===== 头发：发丝线（后层收尾） ===== */
        if (p.hairStyle === 'long') {
            g.polyline([[headCX - S(66), headCY + S(20)], [headCX - S(72), headCY + S(80)], [headCX - S(62), headCY + S(130)]], Math.max(0.9, S(1.8)), hairDD, 0.7);
            g.polyline([[headCX + S(66), headCY + S(20)], [headCX + S(72), headCY + S(84)]], Math.max(0.9, S(1.8)), hairDD, 0.6);
        } else if (p.hairStyle === 'ponytail') {
            g.polyline([[headCX + S(70), headCY + S(20)], [headCX + S(82), headCY + S(60)], [headCX + S(76), headCY + S(104)]], Math.max(0.9, S(1.8)), hairDD, 0.65);
            g.glow(headCX + S(56), headCY - S(2), S(5.8), trimC, 0.95);
        }

        /* ===== 头发：前层（帽替换顶部） ===== */
        if (p.hat) {
            g.ell(headCX, headCY - S(36), S(44), S(24), 0, hairC, hairD, 1);
            g.ell(headCX + S(8), headCY - S(76), S(40), S(17), 0.3, hairD, hairDD, 1);
            g.ell(headCX + S(22), headCY - S(106), S(15), S(11), 0.3, hairDD, hairDD, 1);
            g.ell(headCX + S(28), headCY - S(116), S(10), S(7), 0.32, hairDD, hairDD, 1);
            g.ell(headCX, headCY - S(58), S(88), S(10.5), 0, hairL, hairD, 1);
            g.capsule(headCX - S(58), headCY - S(54), headCX + S(58), headCY - S(50), Math.max(1.1, S(2.4)), trimC, 0.9);
        } else {
            g.ell(headCX, headCY - S(40), S(60), S(34), 0, hairL, hairC, 1);
            if (p.bangs === 'full') {
                g.ell(headCX, headCY - S(19), S(55), S(19), 0, hairC, hairD, 1);
            } else if (p.bangs === 'side') {
                g.ell(headCX - S(20), headCY - S(20), S(38), S(16), -0.14, hairC, hairD, 1);
                g.ell(headCX + S(34), headCY - S(12), S(22), S(14), 0.2, hairD, hairDD, 0.9);
            } else if (p.bangs === 'center') {
                for (const side of [-1, 1]) g.ell(headCX + side * S(28), headCY - S(20), S(30), S(16), side * 0.12, hairC, hairD, 1);
            } else {
                for (const side of [-1, 1]) g.ell(headCX + side * S(30), headCY - S(18), S(23), S(13), side * 0.18, hairC, hairD, 0.96);
            }
            for (const side of [-1, 1]) g.ell(headCX + side * S(52), headCY - S(2), S(14), S(21), side * 0.08, hairC, hairDD, 0.95);
        }
        /* 刘海投影 AO（顶光下眼窝上方的一线暗） */
        if (!p.hat) g.glow(headCX, headCY - S(4), S(46), shade(p.hair, -70), 0.18);
        /* 发丝光泽线 */
        g.polyline([[headCX - S(34), headCY - S(40)], [headCX - S(20), headCY - S(30)]], Math.max(0.8, S(1.5)), hairL, 0.55);
        g.polyline([[headCX + S(12), headCY - S(42)], [headCX + S(30), headCY - S(34)]], Math.max(0.8, S(1.3)), hairL, 0.45);
        if (p.hairStyle === 'long') {
            g.polyline([[headCX - S(66), headCY + S(30)], [headCX - S(62), headCY + S(76)]], Math.max(0.8, S(1.6)), hairL, 0.5);
            g.polyline([[headCX + S(66), headCY + S(34)], [headCX + S(64), headCY + S(80)]], Math.max(0.8, S(1.6)), hairL, 0.45);
        }
        g.glow(headCX - S(6), headCY - S(52), S(34), [255, 255, 255], 0.2);
        g.glow(headCX - S(22), headCY - S(40), S(18), [255, 255, 255], 0.12);

        /* ===== 配饰 ===== */
        if (p.glasses) {
            const gc = [226, 236, 245];
            for (const side of [-1, 1]) {
                const ex = headCX + side * S(26);
                g.capsule(ex - S(12), eyeY - S(9.4), ex + S(12), eyeY - S(8.8), Math.max(0.8, S(1.05)), gc, 0.45);
                g.capsule(ex - S(12), eyeY + S(9.6), ex + S(12), eyeY + S(9), Math.max(0.8, S(1.05)), gc, 0.45);
                g.capsule(ex - S(13), eyeY - S(9), ex - S(13), eyeY + S(9.4), Math.max(0.8, S(1.05)), gc, 0.45);
                g.capsule(ex + S(13), eyeY - S(9), ex + S(13), eyeY + S(9.4), Math.max(0.8, S(1.05)), gc, 0.45);
            }
            g.capsule(headCX - S(12), eyeY - S(5.5), headCX + S(12), eyeY - S(5), Math.max(0.7, S(0.9)), gc, 0.4);
        }
        if (p.earring) {
            g.glow(headCX - S(56), headCY + S(16), S(3.8), amberC, 0.95);
            g.glow(headCX + S(56), headCY + S(16), S(3.8), amberC, 0.95);
        }

        /* ===== 青琥珀双缘光 ===== */
        if (!tiny) {
            g.band(headCX - S(10), headCY - S(6), S(90), Math.PI * 0.62, Math.PI * 1.0, Math.max(1.6, S(3.2)), tealC, 0.36);
            g.band(headCX + S(10), headCY - S(6), S(90), Math.PI * 0.14, Math.PI * 0.44, Math.max(1.4, S(2.8)), amberC, 0.28);
            g.band(headCX, shY + S(60), S(130), Math.PI * 0.78, Math.PI * 1.02, Math.max(1.6, S(3.4)), tealC, 0.28);
            g.band(headCX, shY + S(60), S(130), Math.PI * 0.12, Math.PI * 0.3, Math.max(1.4, S(2.8)), amberC, 0.22);
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
