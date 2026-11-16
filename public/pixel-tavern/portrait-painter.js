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
                const steps = Math.max(64, Math.round(r * 3)); /* R27：步进加密，环线边缘不再有台阶虚边 */
                for (let s = 0; s <= steps; s++) {
                    const ang = a0 + (a1 - a0) * (s / steps);
                    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
                    this.capsule(x, y, x + Math.cos(ang) * 0.5, y + Math.sin(ang) * 0.5, w, col, a);
                }
            },
            polyline(pts, r, col, a) {
                for (let i = 0; i < pts.length - 1; i++) this.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r, col, a);
            },
            rect(x, y, w, h, col, a) {
                const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.W, Math.round(x + w));
                const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.H, Math.round(y + h));
                for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) put(xx, yy, col[0], col[1], col[2], a);
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
            /* 五官几何三档分布：眼长/眼距/眉粗/嘴宽/鼻长按种子落档 */
            eyeL: [0.88, 1, 1.14][Math.floor(rand() * 3)],
            eyeDX: [24, 26, 28][Math.floor(rand() * 3)],
            eyeSize: 0.9 + rand() * 0.25,
            browW: [8, 10, 12][Math.floor(rand() * 3)],
            browY: [-18, -16, -14][Math.floor(rand() * 3)],
            mouthW: [5.6, 6.8, 8][Math.floor(rand() * 3)],
            noseY: [32, 34, 36][Math.floor(rand() * 3)],
            faceW: 0.94 + rand() * 0.12,
            cat: char.category || 'quiet',
        };
    }

    /* ---------- 分类场景：有纵深/光源/氛围的微型环境画 v3 ----------
     * 可见性三原则：亮天光当背景 → 暗剪影母题（明度差 ≥15%、画幅 ≥25%）→ 前景点源。
     * 眼区/身体区为场景禁区；弧带与画框留白。 */
    function sceneProps(g, S, scx, headCY, base, p, rand) {
        const C = { warm: [255, 186, 110], tealSoft: [102, 212, 190] };
        const R = (a, b) => a + rand() * (b - a);

        if (p.cat === 'fantasy') {
            /* 天光：月光主导的左上天空 */
            g.glow(scx - S(84), headCY - S(78), S(96), [148, 196, 178], 0.32);
            g.glow(scx - S(84), headCY - S(78), S(26), [228, 246, 236], 0.55);
            g.ell(scx - S(84), headCY - S(78), S(15), S(15), 0, [240, 250, 242], [206, 230, 218], 0.9);
            /* 地平雾带（比背景亮一档，给树影当衬底） */
            g.ell(scx, base - S(58), S(196), S(72), 0, mix(shade(p.bg1, 10), [126, 164, 146], 0.4), shade(p.bg1, -6), 0.45);
            /* 远景：整幅森林墙树冠线 */
            for (let i = 0; i < 12; i++) {
                const tx = scx + S(-165 + i * 30 + R(-6, 6)), th = S(R(56, 104));
                g.ell(tx, base - S(10) - th / 2, S(16), th / 2, 0, shade(p.bg1, -50), shade(p.bg1, -68), 0.8);
            }
            /* 中景：左右大树（暗剪影 + 月侧亮边） */
            for (const side of [-1, 1]) {
                const tx = scx + side * S(112 + R(0, 14)), th = S(R(150, 196));
                g.capsule(tx, base, tx + S(side * 6), base - th, S(5), shade(p.bg1, -76), 0.95);
                for (let c = 0; c < 4; c++) {
                    const cx2 = tx + S(side * R(-6, 16)), cy2 = base - th - S(c * 12 + R(0, 8)), cr = S(R(18, 26));
                    g.ell(cx2 - S(side * 3), cy2 - S(3), cr, cr * 0.78, R(-0.3, 0.3), [152, 192, 174], [128, 168, 150], 0.3);
                    g.ell(cx2, cy2, cr, cr * 0.78, R(-0.3, 0.3), shade(p.bg1, -58), shade(p.bg1, -76), 0.92);
                }
            }
            /* 月光光柱（斜切） */
            g.capsule(scx - S(96), -S(24), scx - S(28), base - S(28), S(17), [188, 228, 208], 0.12);
            g.capsule(scx - S(70), -S(12), scx - S(20), base - S(44), S(9), [188, 228, 208], 0.09);
            /* 前景：地面雾 + 萤火虫 */
            for (let i = 0; i < 3; i++) g.glow(scx + S(-100 + i * 100), base - S(4), S(30), [182, 216, 198], 0.16);
            for (let i = 0; i < 12; i++) g.glow(scx + S(R(-145, 145)), headCY + S(R(-50, 170)), S(R(1.6, 3.4)), [196, 255, 220], R(0.4, 0.7));
        } else if (p.cat === 'neon') {
            /* 天光：地平城市辉光（品红 + 青） */
            g.glow(scx, base - S(36), S(160), [172, 92, 148], 0.26);
            g.glow(scx - S(64), base - S(60), S(70), [104, 88, 176], 0.2);
            g.glow(scx + S(88), base - S(46), S(64), [76, 102, 164], 0.2);
            g.ell(scx, base - S(8), S(204), S(26), 0, [98, 78, 122], [64, 58, 88], 0.5);
            /* 湿街霓虹倒影：双塔霓虹色的竖向光渍 */
            for (const side of [-1, 1]) {
                const rx = scx + side * S(R(96, 126));
                const rc = side < 0 ? hexRGB(TEAL) : hexRGB(AMBER);
                g.capsule(rx, base - S(18), rx + S(side * 2), base + S(2), S(3.2), rc, 0.35);
                g.capsule(rx + S(side * 10), base - S(12), rx + S(side * 12), base + S(3), S(2.2), rc, 0.27);
            }
            g.glow(scx, base - S(4), S(60), [124, 96, 140], 0.22);
            /* 远景：整幅天际线（连绵楼墙 + 密集窗格点阵） */
            for (let i = 0; i < 13; i++) {
                const bx = scx + S(-168 + i * 26), bw = S(R(16, 24)), bh = S(R(44, 96));
                g.rect(bx, base - bh, bw, bh + S(8), shade(p.bg1, -62), 0.85);
                for (let wy = 0; wy < Math.floor(bh / S(14)); wy++) for (let wx2 = 0; wx2 < 2; wx2++) {
                    if (rand() < 0.55) g.rect(bx + S(3 + wx2 * 7), base - bh + S(6 + wy * 13), S(2.6), S(4), rand() < 0.6 ? C.warm : C.tealSoft, 0.8);
                }
            }
            /* 中景：左右双塔 + 霓虹笔画 */
            for (const side of [-1, 1]) {
                const bx = scx + side * S(R(106, 128)), bw = S(R(36, 46)), bh = S(R(140, 184));
                g.rect(bx - bw / 2, base - bh, bw, bh + S(8), shade(p.bg1, -80), 0.95);
                for (let wy = 0; wy < 6; wy++) for (let wx2 = 0; wx2 < 3; wx2++) {
                    if (rand() < 0.5) g.rect(bx - bw / 2 + S(6 + wx2 * 11), base - bh + S(12 + wy * 24), S(3.2), S(6), rand() < 0.55 ? C.warm : C.tealSoft, 0.85);
                }
                const nc = side < 0 ? hexRGB(TEAL) : hexRGB(AMBER);
                g.polyline([[bx - bw / 2 + S(4), base - bh + S(10)], [bx - bw / 2 + S(4), base - S(30)]], Math.max(1, S(2)), nc, 0.85);
                g.polyline([[bx + bw / 2 - S(4), base - bh + S(10)], [bx + bw / 2 - S(4), base - S(46)]], Math.max(1, S(2)), nc, 0.7);
                g.glow(bx, base - bh + S(8), S(14), nc, 0.4);
            }
            /* 雨丝 */
            for (let i = 0; i < 13; i++) {
                const rx = scx + S(R(-150, 150)), ry = S(R(-10, 380));
                g.capsule(rx, ry, rx + S(3), ry + S(12), Math.max(0.4, S(0.55)), [158, 194, 216], 0.2);
            }
        } else if (p.cat === 'history') {
            /* 天光：殿顶后的暖霞 */
            g.glow(scx, base - S(120), S(140), [214, 132, 84], 0.18);
            g.glow(scx - S(96), headCY - S(40), S(52), [255, 176, 104], 0.16);
            /* 檐梁剪影：横贯上部的屋檐，给宫灯依附 */
            g.rect(0, headCY - S(106), 340 * S(1), S(7), shade(p.bg1, -68), 0.62);
            g.rect(0, headCY - S(99), 340 * S(1), S(2), shade(p.bg1, -52), 0.5);
            /* 远景飞檐：角上两片弧脊剪影 */
            for (const side of [-1, 1]) {
                const px = scx + side * S(118);
                g.band(px, base - S(84), S(56), side > 0 ? Math.PI * 1.12 : Math.PI * 1.42, side > 0 ? Math.PI * 1.58 : Math.PI * 1.88, Math.max(1.6, S(3.4)), shade(p.bg1, -68), 0.72);
                g.rect(px + side * S(4) - S(20), base - S(84), S(40), S(44), shade(p.bg1, -62), 0.62);
            }
            /* 中景宫灯：檐梁下垂挂，左右各一盏 */
            for (const side of [-1, 1]) {
                const lx = scx + side * S(118), ly = headCY - S(R(56, 76));
                g.capsule(lx, headCY - S(99), lx, ly - S(11), Math.max(0.7, S(1)), [116, 82, 54], 0.85);
                g.ell(lx, ly, S(10.5), S(13.5), 0, [244, 158, 88], [168, 84, 48], 0.97);
                g.glow(lx, ly, S(27), [255, 182, 102], 0.5);
            }
            /* 近景飘落花瓣 */
            for (let i = 0; i < 9; i++) {
                const fx = scx + S(R(-140, 140)), fy = headCY + S(R(-60, 180));
                g.ell(fx, fy, S(2.4), S(1.4), R(0, 3), [255, 190, 200], [228, 150, 160], 0.42);
            }
        } else if (p.cat === 'mystery') {
            /* 天光：窗外冷月 */
            g.glow(scx - S(40), headCY - S(90), S(80), [128, 158, 196], 0.22);
            g.glow(scx - S(40), headCY - S(90), S(22), [214, 230, 246], 0.4);
            /* 两侧书架 + 书脊 */
            for (const side of [-1, 1]) {
                const shx = scx + side * S(122);
                g.rect(shx - S(26), headCY - S(92), S(52), S(230), [16, 20, 28], 0.82);
                for (let row = 0; row < 4; row++) {
                    const ry = headCY - S(78) + row * S(56);
                    g.rect(shx - S(26), ry, S(52), S(2.4), [70, 82, 98], 0.7);
                    for (let b = 0; b < 5; b++) {
                        if (rand() < 0.78) {
                            const bh2 = S(R(12, 19));
                            g.rect(shx - S(22) + b * S(9.6), ry - bh2, S(7.4), bh2, [96 + b * 12, 62 + ((b * 23) % 40), 54], 0.72);
                        }
                    }
                }
            }
            /* 月光斜窗 */
            g.capsule(scx + S(-76), -S(16), scx + S(4), base - S(40), S(17), [198, 220, 238], 0.1);
            g.capsule(scx + S(-50), -S(8), scx + S(20), base - S(56), S(8), [198, 220, 238], 0.08);
            /* 浮尘 */
            for (let i = 0; i < 14; i++) g.glow(scx + S(R(-140, 140)), headCY + S(R(-90, 170)), S(R(0.8, 1.8)), [226, 226, 214], R(0.2, 0.4));
        } else if (p.cat === 'quiet') {
            /* 天光：室内暖灯（右上） */
            g.glow(scx + S(94), headCY - S(24), S(56), C.warm, 0.2);
            /* 右侧窗：暖光 + 窗棂 */
            const wx0 = scx + S(66);
            g.rect(wx0 - S(3), headCY - S(81), S(64), S(102), [30, 38, 50], 0.7);
            g.glow(wx0 + S(29), headCY - S(30), S(26), C.warm, 0.42);
            g.rect(wx0, headCY - S(78), S(58), S(96), [242, 196, 130], 0.3);
            g.rect(wx0 + S(27), headCY - S(78), S(4), S(96), [36, 46, 58], 0.85);
            g.rect(wx0, headCY - S(36), S(58), S(4), [36, 46, 58], 0.85);
            g.rect(wx0 - S(3), headCY + S(14), S(64), S(4), [46, 56, 68], 0.72); /* 窗台（R28）：垂线元素落地锚 */
            /* 左侧盆栽剪影 */
            const plx = scx - S(116);
            g.capsule(plx, base - S(6), plx + S(7), base - S(52), Math.max(0.8, S(1.5)), [46, 66, 54], 0.75);
            g.ell(plx + S(10), base - S(64), S(15), S(22), 0.3, [40, 60, 48], [28, 46, 38], 0.78);
            g.ell(plx - S(6), base - S(56), S(12), S(18), -0.4, [40, 60, 48], [28, 46, 38], 0.74);
            /* 暖尘 */
            for (let i = 0; i < 8; i++) g.glow(scx + S(R(-130, 130)), headCY + S(R(-70, 150)), S(R(0.8, 1.6)), C.warm, R(0.16, 0.32));
        } else if (p.cat === 'odyssey') {
            /* 天光：星云辉光 */
            g.glow(scx - S(80), headCY - S(60), S(90), [96, 88, 158], 0.2);
            g.glow(scx + S(90), headCY + S(30), S(70), [72, 108, 158], 0.16);
            /* 星系带：两道弧 */
            g.band(scx, headCY + S(46), S(170), Math.PI * 1.14, Math.PI * 1.78, Math.max(1.4, S(2.4)), [162, 184, 224], 0.45);
            g.band(scx, headCY + S(46), S(146), Math.PI * 1.2, Math.PI * 1.72, Math.max(1.1, S(1.7)), [206, 218, 244], 0.3);
            /* 远处星球 + 光环（避开弧带与画框交汇区） */
            const px = scx + S(120), py = headCY - S(104);
            g.ell(px, py, S(13), S(13), 0, [222, 228, 248], [172, 186, 220], 0.5);
            g.band(px, py, S(18), Math.PI * 1.06, Math.PI * 1.9, Math.max(0.9, S(1.2)), [196, 208, 238], 0.42);
            g.glow(px, py, S(22), [198, 208, 246], 0.36);
            /* 小月亮 */
            g.ell(scx - S(124), headCY - S(84), S(6.5), S(6.5), 0, [240, 242, 250], [214, 220, 236], 0.6);
            /* 星尘 */
            for (let i = 0; i < 18; i++) g.glow(scx + S(R(-150, 150)), headCY + S(R(-110, 170)), S(R(0.7, 1.6)), [255, 255, 255], R(0.18, 0.4));
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
        const geo = char.geo || {};
        /* 卡设几何优先于随机：geo.eyeL/eyeDX/browW/mouthW/noseY/jawW 覆盖随机值 */
        const rand = mulberry32((char.seed || 1) * 3 + 7);
        const skinC = hexRGB(p.skin), skinD = shade(p.skin, -20), skinDD = shade(p.skin, -46), skinHi = shade(p.skin, 14);
        const hairC = hexRGB(p.hair), hairL = shade(p.hair, 44), hairD = shade(p.hair, -32), hairDD = shade(p.hair, -62);
        const bgC = hexRGB(p.bg1);
        const bodyTop = shade(p.bg1, -8), bodyBot = shade(p.bg1, -64);
        const eyeC = mix(shade(p.bg1, -74), hexRGB(TEAL), 0.2);
        const geoL = geo.eyeL, geoDX = geo.eyeDX, geoBrowW = geo.browW, geoBrowY = geo.browY, geoMouthW = geo.mouthW, geoNoseY = geo.noseY, geoJawW = geo.jawW;
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
            g.band(W / 2, headCY + S(30), S(148), Math.PI * 1.16, Math.PI * 1.84, Math.max(1.2, S(2.4)), tealC, 0.42);
            g.band(W / 2, headCY + S(30), S(158), Math.PI * 1.22, Math.PI * 1.74, Math.max(1, S(1.6)), amberC, 0.22);
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


        /* ===== 轮廓描边底层（暗色外扩，人物立起来） ===== */
        const oc = shade(p.bg1, -84);
        g.ell(headCX - S(62), shY + S(28), S(49), S(45), 0, oc, oc, 1);
        g.ell(headCX + S(62), shY + S(28), S(49), S(45), 0, oc, oc, 1);
        g.ell(headCX, shY + S(120), S(119), S(127), 0, oc, oc, 1);
        g.ell(headCX, headCY + S(2), S(81), S(90), 0, oc, oc, 1);
        g.ell(headCX, headCY, S(61), S(73), 0, oc, oc, 1);

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
        /* 内衬衫领（白）+ 外套翻领（深） */
        g.capsule(headCX - S(10), shY + S(2), headCX - S(2), shY + S(16), Math.max(0.8, S(1.6)), skinHi, 0.85);
        g.capsule(headCX + S(10), shY + S(2), headCX + S(2), shY + S(16), Math.max(0.8, S(1.6)), skinHi, 0.85);
        g.capsule(headCX - S(30), shY + S(6), headCX - S(8), shY + S(30), Math.max(1.2, S(2.4)), bodyBot, 0.9);
        g.capsule(headCX + S(30), shY + S(6), headCX + S(8), shY + S(30), Math.max(1.2, S(2.4)), bodyBot, 0.9);
        /* 领褶（R28）：翻领下沿的短褶皱，锚定领口走势 */
        g.capsule(headCX - S(18), shY + S(34), headCX - S(6), shY + S(40), Math.max(0.8, S(1.4)), shade(p.bg1, -22), 0.5);
        g.capsule(headCX + S(6), shY + S(36), headCX + S(18), shY + S(42), Math.max(0.8, S(1.4)), shade(p.bg1, -22), 0.5);
        /* 扣子两枚 */
        g.glow(headCX + S(2), shY + S(42), S(2.6), trimC, 0.85);
        g.glow(headCX + S(2), shY + S(60), S(2.6), trimC, 0.7);
        g.glow(headCX, shY + S(2), S(15), skinDD, 0.5);
        g.glow(headCX - S(52), shY + S(52), S(3.4), trimC, 0.9);
        /* 布纹斜线 */
        g.polyline([[headCX - S(90), shY + S(110)], [headCX - S(40), shY + S(150)]], Math.max(0.6, S(1)), shade(p.bg1, 14), 0.3);
        g.polyline([[headCX + S(38), shY + S(126)], [headCX + S(88), shY + S(162)]], Math.max(0.6, S(1)), shade(p.bg1, 14), 0.3);

        /* ===== 颈 ===== */
        g.ell(headCX, headCY + S(62), S(17), S(26), 0, skinC, skinD, 1);
        g.glow(headCX, headCY + S(56), S(19), skinDD, 0.5);
        /* 颈侧反弹光（R28）：衣领反光 onto 颈部两侧，体积感 */
        g.glow(headCX - S(12), headCY + S(66), S(12), shade(p.bg1, 26), 0.26);
        g.glow(headCX + S(12), headCY + S(66), S(12), shade(p.bg1, 26), 0.22);

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
        g.glow(headCX, headCY + S(geoNoseY || p.noseY || 34), S(6), skinDD, 0.55);
        /* 鼻梁高光 + 下巴反光 */
        g.capsule(headCX, headCY + S((geoNoseY || p.noseY || 34) - 14), headCX, headCY + S((geoNoseY || p.noseY || 34) - 3), Math.max(0.7, S(1.5)), skinHi, 0.4);
        g.glow(headCX, headCY + S(56), S(9), skinHi, 0.4);

        /* ===== 眼睛 ===== */
        const eyeY = headCY + S(10);
        for (const side of [-1, 1]) {
            const ex = headCX + side * S(geoDX || p.eyeDX || 26);
            const eL = S(10) * (geoL || p.eyeL || 1);
            g.glow(ex, eyeY, S(17), skinHi, 0.3);
            const es = S(p.eyeSize || 1);
            g.ell(ex, eyeY + side * S(p.eyeTilt || 0) * 8, S(15), S(11.5) * (p.eyeSize || 1), 0, skinD, skinC, 0.45);
            /* 虹膜直填（无眼白底板）： radial 亮心 + 顶部月牙影 + 瞳 + 双高光 */
            g.ell(ex, eyeY + S(1), eL, S(7.6) * (p.eyeSize || 1), 0, skinDD, skinD, 0.5);
            g.ell(ex, eyeY, S(10) * (p.eyeSize || 1), S(9) * (p.eyeSize || 1), 0, eyeC, eyeC, 1, { radial: true, inner: mix(eyeC, [255, 255, 255], 0.52) });
            /* 虹膜粗结构：5 根粗辐条 + 亮环（卡片尺寸可读） */
            for (let a = 0; a < 5; a++) {
                const ang2 = (a / 5) * Math.PI * 2 + 0.4 + side * 0.2;
                g.polyline([[ex, eyeY + S(1)], [ex + Math.cos(ang2) * S(7.6), eyeY + Math.sin(ang2) * S(6.6)]], Math.max(0.8, S(1.7)), shade(p.bg1, -92), 0.55);
            }
            g.band(ex, eyeY, S(5.6), 0, Math.PI * 2, Math.max(0.7, S(1.2)), mix(eyeC, [255, 255, 255], 0.62), 0.66);
            g.ell(ex, eyeY - S(3.4), S(9.4), S(3.2), 0, shade(p.bg1, -78), shade(p.bg1, -78), 0.26);
            g.ell(ex, eyeY + S(1), S(4.4), S(5), 0, [16, 20, 32], [8, 10, 18], 1);
            g.glow(ex - side * S(3.6), eyeY - S(3.2), S(3.4), [255, 255, 255], 0.95);
            g.glow(ex + side * S(3.8), eyeY + S(3.6), S(1.9), [255, 255, 255], 0.55);
            g.capsule(ex - side * S(13), eyeY - S(9.8), ex + side * S(11), eyeY - S(8.6), Math.max(1.2, S(2.8)), hairDD, 0.92);
            g.capsule(ex + side * S(11), eyeY - S(8.6), ex + side * S(16), eyeY - S(12.4), Math.max(0.9, S(1.8)), hairDD, 0.8);
            /* 眉形弧化（full 刘海自然遮盖眉区时跳过） */
            const skipBrow = p.bangs === 'full' && !p.hat;
            const bw = S(geoBrowW || p.browW || 9);
            if (!skipBrow) {
                g.capsule(ex - side * bw * 0.7, headCY - S((geoBrowY || p.browY || 17) + 1), ex + side * bw * 0.35, headCY - S(geoBrowY || p.browY || 17), Math.max(0.9, S(1.9)), mix(hairD, skinC, 0.5), 0.62);
                g.capsule(ex + side * bw * 0.35, headCY - S(geoBrowY || p.browY || 17), ex + side * bw * 0.75, headCY - S((geoBrowY || p.browY || 17) - 1), Math.max(0.9, S(1.9)), mix(hairD, skinC, 0.5), 0.62);
            }
        }

        const mw = S(geoMouthW || p.mouthW || 6.8);
        /* 口型 */
        if (p.mouth === 'smile') {
            g.ell(headCX, headCY + S(47), S(7.6), S(3.6), 0, mix(lipC, [255, 255, 255], 0.12), lipC, 0.92);
        } else if (p.mouth === 'soft') {
            g.ell(headCX, headCY + S(47), mw, S(3.4), 0, lipC, shade(p.hair, -12), 0.92);
        } else {
            g.capsule(headCX - mw * 0.8, headCY + S(47), headCX + mw * 0.8, headCY + S(47), Math.max(1, S(1.7)), [158, 88, 78], 0.85);
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
            /* 发顶（亮）→ 前发（深）分层，刘海用深色调保证可读 */
            g.ell(headCX, headCY - S(46), S(58), S(30), 0, hairL, hairC, 1);
            if (p.bangs === 'full') {
                g.ell(headCX, headCY - S(20), S(54), S(17), 0, hairD, hairDD, 1);
                g.glow(headCX, headCY - S(3), S(48), hairDD, 0.22);
                g.glow(headCX, headCY - S(10), S(44), hairD, 0.18);
            } else if (p.bangs === 'side') {
                g.ell(headCX - S(22), headCY - S(20), S(36), S(15), -0.16, hairD, hairDD, 1);
                g.ell(headCX + S(30), headCY - S(16), S(20), S(10), 0.2, hairD, hairDD, 0.9);
                g.ell(headCX - S(32), headCY - S(12), S(26), S(5), -0.1, hairDD, hairDD, 0.7);
            } else if (p.bangs === 'center') {
                for (const side of [-1, 1]) g.ell(headCX + side * S(28), headCY - S(21), S(28), S(14), side * 0.14, hairD, hairDD, 1);
                g.glow(headCX, headCY - S(8), S(14), skinDD, 0.3);
            } else {
                for (const side of [-1, 1]) g.ell(headCX + side * S(30), headCY - S(19), S(22), S(12), side * 0.18, hairD, hairDD, 0.96);
                g.ell(headCX, headCY - S(8), S(14), S(5), 0, hairDD, hairDD, 0.7);
            }
            for (const side of [-1, 1]) g.ell(headCX + side * S(62), headCY - S(4), S(14), S(20), side * 0.05, hairC, hairDD, 0.95);
        }
        /* 刘海投影 AO（顶光下眼窝上方的一线暗） */
        if (!p.hat) g.glow(headCX, headCY - S(4), S(46), shade(p.hair, -70), 0.18);
        /* 发丝簇：渐变丝线（暗底+亮芯） */
        g.polyline([[headCX - S(44), headCY - S(26)], [headCX - S(34), headCY - S(16)], [headCX - S(28), headCY - S(8)]], Math.max(0.8, S(1.8)), hairDD, 0.4);
        g.polyline([[headCX - S(42), headCY - S(28)], [headCX - S(30), headCY - S(12)]], Math.max(0.5, S(1.1)), hairL, 0.65);
        g.polyline([[headCX + S(40), headCY - S(28)], [headCX + S(28), headCY - S(12)]], Math.max(0.5, S(1.1)), hairL, 0.58);
        g.polyline([[headCX + S(44), headCY - S(26)], [headCX + S(36), headCY - S(17)], [headCX + S(30), headCY - S(7)]], Math.max(0.8, S(1.6)), hairDD, 0.35);
        if (p.hairStyle === 'long' || p.hairStyle === 'bob') {
            g.polyline([[headCX - S(66), headCY + S(16)], [headCX - S(70), headCY + S(56)]], Math.max(0.7, S(1.4)), hairL, 0.42);
            g.polyline([[headCX + S(66), headCY + S(18)], [headCX + S(70), headCY + S(58)]], Math.max(0.7, S(1.4)), hairL, 0.4);
        }
        /* 发丝光泽线 */
        g.polyline([[headCX - S(34), headCY - S(40)], [headCX - S(20), headCY - S(30)]], Math.max(0.8, S(1.5)), hairL, 0.55);
        g.polyline([[headCX + S(12), headCY - S(42)], [headCX + S(30), headCY - S(34)]], Math.max(0.8, S(1.3)), hairL, 0.45);
        /* 发丝层次增补（R28）：三四道弱高光，全部落在发冠安全区（眉线以上） */
        g.polyline([[headCX - S(24), headCY - S(44)], [headCX - S(6), headCY - S(36)]], Math.max(0.7, S(1.3)), hairL, 0.38);
        g.polyline([[headCX + S(36), headCY - S(40)], [headCX + S(52), headCY - S(30)]], Math.max(0.7, S(1.3)), hairL, 0.34);
        if (p.hairStyle === 'long') {
            g.polyline([[headCX - S(66), headCY + S(30)], [headCX - S(62), headCY + S(76)]], Math.max(0.8, S(1.6)), hairL, 0.5);
            g.polyline([[headCX + S(66), headCY + S(34)], [headCX + S(64), headCY + S(80)]], Math.max(0.8, S(1.6)), hairL, 0.45);
        }
        g.glow(headCX - S(6), headCY - S(56), S(34), [255, 255, 255], 0.2);
        g.glow(headCX - S(22), headCY - S(40), S(18), [255, 255, 255], 0.12);

        /* ===== 配饰 ===== */
        if (p.glasses) {
            const gc = [226, 236, 245];
            for (const side of [-1, 1]) {
                const ex = headCX + side * S(26);
                g.band(ex, eyeY, S(12.5), 0, Math.PI * 2, Math.max(0.9, S(1.4)), gc, 0.55);
            }
            g.capsule(headCX - S(13), eyeY - S(4), headCX + S(13), eyeY - S(4), Math.max(0.7, S(1.1)), gc, 0.5);
        }
        if (p.earring) {
            g.glow(headCX - S(56), headCY + S(16), S(3.8), amberC, 0.95);
            g.glow(headCX + S(56), headCY + S(16), S(3.8), amberC, 0.95);
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
