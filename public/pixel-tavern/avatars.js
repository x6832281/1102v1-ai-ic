/* ============================================================
 * 幻境回声 · EchoCraft — 程序化艺术肖像 / 氛围徽记 / 视效引擎
 * 纯原生 Canvas 绘制，零外部素材与图片依赖
 * V2.2 肖像引擎：24×28 像素网格具象半身像
 *   · 6 发型 × 4 刘海 × 眼瞳/口型/配饰组合，角色卡 avatar 字段可指定
 *   · 三阶发色明暗 + 下颌/颈影 + 青琥珀双缘光（EchoCraft 光语）
 *   · 大画布半身构图，小画布自动裁头部特写
 * ============================================================ */
'use strict';

/* ---------- 确定性随机数生成器 ---------- */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/* ---------- 颜色工具 ---------- */
function hexToRgba(hex, alpha = 1) {
    if (!hex || hex[0] !== '#') return `rgba(100, 116, 139, ${alpha})`;
    let c = hex.slice(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}
function shadeHex(hex, amt) {
    if (!hex || hex[0] !== '#') return hex;
    let c = hex.slice(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const n = parseInt(c, 16);
    const cl = v => Math.max(0, Math.min(255, v));
    const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sa, sb) => Math.round(sa + (sb - sa) * t);
    const r = ch((pa >> 16) & 255, (pb >> 16) & 255);
    const g = ch((pa >> 8) & 255, (pb >> 8) & 255);
    const bl = ch(pa & 255, pb & 255);
    return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

/* ---------- 角色肖像引擎：24×28 像素网格具象半身像 ---------- */
const PTAvatar = (() => {
    const GW = 24, GH = 28;
    const ECHO_TEAL = '#00d1b2', ECHO_AMBER = '#fbbf24';
    const dataUrlCache = new Map();

    const pick = (rand, arr) => arr[Math.floor(rand() * arr.length) % arr.length];

    /* 构建半身像网格：G[y][x] = { c: '#hex', a: alpha } | null */
    function buildGrid(char, rand) {
        const G = Array.from({ length: GH }, () => Array(GW).fill(null));
        const put = (x, y, c, a = 1) => { if (x >= 0 && y >= 0 && x < GW && y < GH && c) G[y][x] = { c, a }; };

        const pal = char.palette || {};
        const bg1 = pal.bg1 || '#2c3e6b';
        const hair = pal.hair || '#4a6572';
        const skin = pal.skin || '#f2d3b3';
        const hairL = shadeHex(hair, 38), hairD = shadeHex(hair, -30), hairDD = shadeHex(hair, -52);
        const skinD = shadeHex(skin, -18), skinDD = shadeHex(skin, -40);
        const bodyC = shadeHex(bg1, -28), bodyD = shadeHex(bg1, -55), bodyL = shadeHex(bg1, -6);
        const eyeC = mixHex(shadeHex(bg1, -62), ECHO_TEAL, 0.14);

        /* 角色卡指定的外观线索（无则按种子推导） */
        const hint = char.avatar || {};
        const hairStyle = hint.hairStyle || pick(rand, ['long', 'bob', 'twin', 'ponytail', 'bun', 'short']);
        const bangs = hint.bangs || pick(rand, ['full', 'side', 'center', 'wispy']);
        const mouthV = hint.mouth || pick(rand, ['soft', 'smile', 'calm']);
        const hat = !!hint.hat;
        const glasses = hint.glasses != null ? !!hint.glasses : rand() < 0.3;
        const earring = hint.earring != null ? !!hint.earring : rand() < 0.24;
        const trimCol = hint.trim || (rand() < 0.5 ? ECHO_TEAL : ECHO_AMBER);

        /* ---------- 身体：肩线 / 衣领 / 织物 ---------- */
        put(10, 14, skinD); put(11, 14, skinD); put(12, 14, skinD); put(13, 14, skinD);
        for (let x = 10; x <= 13; x++) { put(x, 15, skin); put(x, 16, x === 10 || x === 13 ? skinD : skin); }
        /* 肩部斜线（16→20 行展开） */
        for (let x = 6; x <= 9; x++) put(x, 16, bodyC);
        for (let x = 14; x <= 17; x++) put(x, 16, bodyC);
        for (let x = 4; x <= 19; x++) put(x, 17, x >= 10 && x <= 13 ? skinDD : bodyC);
        for (let x = 3; x <= 20; x++) put(x, 18, bodyC);
        for (let y = 19; y < GH; y++) for (let x = 2; x <= 21; x++) put(x, y, bodyC);
        /* 领口 V + 焰色滚边 */
        put(11, 17, skinDD); put(12, 17, skinDD);
        put(9, 17, trimCol); put(14, 17, trimCol);
        put(8, 18, trimCol); put(15, 18, trimCol);
        /* 织物明暗：褶皱与侧影 */
        for (let y = 19; y < GH; y++) { put(5, y, bodyD, 0.55); put(18, y, bodyD, 0.55); put(2, y, bodyD, 0.35); put(21, y, bodyD, 0.35); }
        for (let y = 23; y < GH; y++) { put(11, y, bodyD, 0.3); put(12, y, bodyD, 0.3); }
        put(3, 19, bodyL); put(4, 19, bodyL); /* 左肩受光 */
        /* 左胸回声微标 */
        put(5, 21, trimCol, 0.9); put(6, 21, trimCol, 0.5);

        /* ---------- 面部 ---------- */
        for (let y = 5; y <= 11; y++) for (let x = 7; x <= 16; x++) put(x, y, skin);
        for (let x = 8; x <= 15; x++) put(x, 12, skin);
        for (let x = 9; x <= 14; x++) put(x, 13, skinD); /* 下颌收影 */
        /* 耳 */
        put(6, 8, skin); put(6, 9, skinD); put(17, 8, skin); put(17, 9, skinD);
        /* 眉（第 6 行） */
        const browC = mixHex(hairD, skin, 0.42);
        put(9, 6, browC); put(10, 6, browC); put(13, 6, browC); put(14, 6, browC);
        /* 眼：睫线 + 2×2 瞳 + 眼眸光 */
        for (const ex of [9, 13]) {
            put(ex, 7, hairDD); put(ex + 1, 7, hairDD);
            put(ex, 8, eyeC); put(ex + 1, 8, eyeC);
            put(ex, 9, eyeC); put(ex + 1, 9, mixHex(eyeC, '#000000', 0.25));
            put(ex, 8, '#ffffff', 0.72); /* 眼眸光（瞳内左上，左青光源方向） */
        }
        /* 鼻影 */
        put(11, 10, skinD, 0.8);
        /* 口型 */
        if (mouthV === 'smile') { put(11, 11, '#b86a5e'); put(12, 11, '#b86a5e'); put(10, 11, '#b86a5e', 0.55); put(13, 11, '#b86a5e', 0.55); }
        else if (mouthV === 'soft') { put(11, 11, '#b86a5e'); put(12, 11, '#b86a5e'); }
        else { put(11, 11, '#a05a50', 0.85); }
        /* 腮红 */
        put(8, 10, '#f2a3a3', 0.42); put(15, 10, '#f2a3a3', 0.42);

        /* ---------- 发型基座（穹顶 + 侧框） ---------- */
        let top = 0;
        if (hat) {
            /* 魔女帽：锥顶 + 宽檐 + 焰色帽带 */
            for (let x = 10; x <= 13; x++) put(x, 0, hairDD);
            for (let x = 8; x <= 15; x++) put(x, 1, hairD);
            for (let x = 6; x <= 17; x++) put(x, 2, hair);
            for (let x = 4; x <= 19; x++) put(x, 3, hair);
            put(5, 3, hairD); put(18, 3, hairD);
            for (let x = 6; x <= 17; x++) put(x, 4, x % 2 ? trimCol : hairD); /* 帽带 */
            top = 5;
        } else {
            for (let x = 8; x <= 15; x++) put(x, 0, hairL);
            for (let x = 6; x <= 17; x++) put(x, 1, x <= 9 || x >= 14 ? hairL : hair);
            for (let x = 5; x <= 18; x++) put(x, 2, hair);
            for (let x = 5; x <= 18; x++) put(x, 3, x === 5 || x === 18 ? hairD : hair);
            top = 4;
        }
        /* 侧发框（4–7 行） */
        for (let y = top; y <= 7; y++) { put(5, y, y === 7 ? hairD : hair); put(6, y, y === top ? hairL : hair); put(17, y, y === top ? hair : hairL); put(18, y, y === 7 ? hairD : hair); }

        /* ---------- 刘海（覆盖 5–6 行额头，眉保持可见） ---------- */
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
            } else { /* wispy 碎发 */
                for (const x of [7, 9, 10, 13, 14, 16]) put(x, 5, x === 7 || x === 16 ? hairD : hair);
                for (const x of [8, 11, 12, 15]) put(x, 5, skin);
                put(8, 6, hairD, 0.85); put(15, 6, hairD, 0.85);
            }
        }

        /* ---------- 发型延伸 ---------- */
        const lockC = hair, lockD = hairD;
        if (hairStyle === 'long') {
            for (let y = 6; y <= 16; y++) {
                put(4, y, lockD); put(5, y, y >= 12 ? lockD : lockC);
                put(18, y, lockC); put(19, y, lockD);
            }
            for (let y = 17; y <= 21; y++) { put(3, y, hairDD, 0.9); put(4, y, lockD, 0.9); put(19, y, lockD, 0.9); put(20, y, hairDD, 0.9); }
        } else if (hairStyle === 'bob') {
            for (let y = 6; y <= 11; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
            for (const x of [5, 6, 17, 18]) put(x, 12, lockD, 0.95);
        } else if (hairStyle === 'twin') {
            for (let y = 6; y <= 9; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
            for (let y = 9; y <= 15; y++) {
                put(3, y, lockD); put(4, y, lockC);
                put(19, y, lockC); put(20, y, lockD);
                if (y >= 12) { put(2, y, hairDD, 0.85); put(21, y, hairDD, 0.85); }
            }
            put(4, 8, trimCol, 0.95); put(19, 8, trimCol, 0.95); /* 发绳焰色 */
        } else if (hairStyle === 'ponytail') {
            for (let y = 6; y <= 9; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
            for (let y = 5; y <= 14; y++) {
                put(19, y, lockC, 0.95); put(20, y, lockD);
                if (y >= 9 && y <= 12) put(21, y, hairDD, 0.8);
            }
            put(18, 5, trimCol, 0.95); put(18, 6, trimCol, 0.7); /* 高马尾束发 */
        } else if (hairStyle === 'bun') {
            if (!hat) { for (let x = 9; x <= 14; x++) put(x, 0, hairL); }
            for (let y = 6; y <= 8; y++) { put(4, y, lockD); put(5, y, lockC); put(18, y, lockC); put(19, y, lockD); }
            put(6, 5, trimCol, 0.9); put(17, 5, trimCol, 0.9); /* 发簪焰点 */
        } else { /* short 短碎发 */
            for (let y = 6; y <= 7; y++) { put(5, y, hairD); put(6, y, lockC); put(17, y, lockC); put(18, y, hairD); }
            put(7, 4, hairL, 0.9); put(16, 4, hairL, 0.9);
        }

        /* ---------- 配饰 ---------- */
        if (glasses) {
            const gC = '#cfe0ee';
            for (const ex of [9, 13]) { put(ex - 1, 8, gC, 0.85); put(ex + 2, 8, gC, 0.85); put(ex, 7, gC, 0.85); put(ex + 1, 7, gC, 0.85); put(ex, 10, gC, 0.85); put(ex + 1, 10, gC, 0.85); }
            put(11, 8, gC, 0.7); put(12, 8, gC, 0.7); put(6, 8, gC, 0.6); put(17, 8, gC, 0.6);
        }
        if (earring) { put(6, 10, ECHO_AMBER, 0.95); put(17, 10, ECHO_AMBER, 0.95); }

        /* ---------- 青琥珀双缘光（EchoCraft 光语：左青右暖） ---------- */
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
    }

    /* ---------- 主绘制：向量氛围底 + 像素人物 ---------- */
    function drawToCanvas(canvas, char, options = {}) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.imageSmoothingEnabled = true;

        const seed = options.seed ?? char.seed ?? hashString(char.name || char.id || 'echo');
        const rand = mulberry32(seed);

        const pal = char.palette || {};
        const bg1 = pal.bg1 || '#161b24';
        const bg2 = pal.bg2 || shadeHex(bg1, -26) || '#0e1117';
        const hairCol = pal.hair || '#4a6572';

        /* 1. 深空底渐变 */
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, mixHex(bg1, '#000000', 0.35));
        grad.addColorStop(0.55, bg1);
        grad.addColorStop(1, bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        const small = Math.min(W, H) < 72; /* 小画布省略繁复氛围 */
        if (!small) {
            /* 2. 头后辉光 + 星尘 */
            const glow = ctx.createRadialGradient(W / 2, H * 0.34, W * 0.08, W / 2, H * 0.34, W * 0.62);
            glow.addColorStop(0, hexToRgba(hairCol, 0.30));
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, W, H);
            for (let i = 0; i < Math.round(W / 16); i++) {
                ctx.fillStyle = rand() > 0.72 ? 'rgba(255,255,255,0.85)' : hexToRgba('#66d4be', 0.25 + rand() * 0.5);
                const sx = rand() * W, sy = rand() * H * 0.62, sr = rand() < 0.12 ? 1.6 : 1;
                ctx.fillRect(Math.round(sx), Math.round(sy), sr, sr);
            }
            /* 3. 回声弧（角色身后单弧） */
            ctx.strokeStyle = hexToRgba(ECHO_TEAL, 0.4);
            ctx.lineWidth = Math.max(1.5, W * 0.02);
            ctx.beginPath();
            ctx.arc(W / 2, H * 0.42, W * 0.44, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.strokeStyle = hexToRgba(ECHO_AMBER, 0.22);
            ctx.lineWidth = Math.max(1, W * 0.012);
            ctx.beginPath();
            ctx.arc(W / 2, H * 0.42, W * 0.5, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
        }

        /* 4. 像素人物（整数格，居中；小画布裁头部特写） */
        const G = buildGrid(char, rand);
        const cell = Math.max(1, Math.floor(Math.min(W / GW, H / GH)));
        const figW = cell * GW, figH = cell * GH;
        const fits = W >= figW && H >= figH;
        const offX = Math.floor((W - Math.min(W, figW)) / 2);
        const offY = fits ? Math.floor((H - figH) / 2) : 0;
        const colFrom = fits ? 0 : Math.floor((GW - W / cell) / 2);
        const colTo = fits ? GW : Math.min(GW, colFrom + Math.ceil(W / cell));
        const rowTo = fits ? GH : Math.min(GH, Math.ceil(H / cell));
        for (let y = 0; y < rowTo; y++) {
            for (let x = colFrom; x < colTo; x++) {
                const c = G[y][x];
                if (!c) continue;
                ctx.globalAlpha = c.a;
                ctx.fillStyle = c.c;
                ctx.fillRect(offX + (x - colFrom) * cell, offY + y * cell, cell, cell);
            }
        }
        ctx.globalAlpha = 1;

        /* 5. 底部收束暗角（稳住构图） */
        if (!small) {
            const vig = ctx.createLinearGradient(0, H * 0.62, 0, H);
            vig.addColorStop(0, 'rgba(0,0,0,0)');
            vig.addColorStop(1, 'rgba(4,8,14,0.5)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, H * 0.62, W, H * 0.38);
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
        }
    }

    function toDataURL(char, size = 64, height) {
        const h = height || size;
        const key = `${char.id || char.name || 'custom'}_${size}x${h}_${char.seed || 0}`;
        if (dataUrlCache.has(key)) return dataUrlCache.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = h;
        drawToCanvas(canvas, char);
        const url = canvas.toDataURL('image/png');
        dataUrlCache.set(key, url);
        return url;
    }

    function clearCache() {
        dataUrlCache.clear();
    }

    return {
        draw: drawToCanvas,
        drawToCanvas,
        toDataURL,
        clearCache,
    };
})();

/* ---------- 氛围共鸣波形仪（现代流体声波仪） ---------- */
const PTFire = (() => {
    let raf = 0;
    let t = 0;

    function frame(ts, canvas) {
        raf = requestAnimationFrame(timestamp => frame(timestamp, canvas));
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#0c111a');
        bgGrad.addColorStop(1, '#080c12');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        t += 0.04;

        const waves = [
            { col: 'rgba(0, 209, 178, 0.45)', speed: 1.0, freq: 0.08, amp: 5, yOffset: H * 0.5 },
            { col: 'rgba(243, 168, 71, 0.45)', speed: 1.4, freq: 0.11, amp: 4, yOffset: H * 0.52 },
            { col: 'rgba(147, 197, 253, 0.35)', speed: 0.7, freq: 0.06, amp: 6, yOffset: H * 0.48 },
        ];

        waves.forEach(w => {
            ctx.beginPath();
            ctx.strokeStyle = w.col;
            ctx.lineWidth = 1.5;
            for (let x = 0; x <= W; x += 2) {
                const y = w.yOffset + Math.sin(x * w.freq + t * w.speed) * w.amp;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        });

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 4; i++) {
            const px = (W * 0.2 + (t * 12 + i * 18)) % W;
            const py = H * 0.5 + Math.sin(t * 1.5 + i * 2) * 5;
            ctx.beginPath();
            ctx.arc(px, py, 0.9, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    return {
        start(canvas) {
            if (!raf && canvas) frame(0, canvas); /* 同步首帧：后台标签页 RAF 暂停时不至于空黑 */
        },
        stop() {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        },
    };
})();

/* ---------- 品牌 Logo 绘制（现代几何星轨图腾） ---------- */
function drawTavernLogo(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;

    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.38;

    ctx.strokeStyle = 'rgba(0, 209, 178, 0.85)';
    ctx.lineWidth = Math.max(1.5, W * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.25, Math.PI * 1.45);
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.2, W * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.6);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.6);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
}

/* ---------- 极简空白状态图标 ---------- */
function drawLantern(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;

    const cx = W / 2;
    const cy = H / 2;

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#00d1b2';
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.18, cy);
    ctx.lineTo(cx + W * 0.18, cy);
    ctx.moveTo(cx, cy - H * 0.18);
    ctx.lineTo(cx, cy + H * 0.18);
    ctx.stroke();
}

/* ---------- 侧栏微型图标系统 ---------- */
const PT_ICONS = {
    market: [
        '..1111..',
        '.1....1.',
        '1..11..1',
        '1.1..1.1',
        '11111111',
        '1......1',
        '1......1',
        '11111111',
    ],
    shelf: [
        '11111111',
        '1......1',
        '11111111',
        '1......1',
        '11111111',
        '1......1',
        '1......1',
        '11111111',
    ],
    build: [
        '......11',
        '.....111',
        '....111.',
        '...111..',
        '..111...',
        '.111....',
        '11......',
        '1.......',
    ],
    fav: [
        '.11..11.',
        '11111111',
        '11111111',
        '11111111',
        '.111111.',
        '..1111..',
        '...11...',
        '....1...',
    ],
    history: [
        '..1111..',
        '.1....1.',
        '1...1..1',
        '1...1..1',
        '1...11.1',
        '1......1',
        '.1....1.',
        '..1111..',
    ],
    news: [
        '1111111.',
        '1.....11',
        '1.111.11',
        '1.....11',
        '1.111.11',
        '1.....11',
        '11111111',
        '........',
    ],
    guide: [
        '..1111..',
        '.1....1.',
        '....11..',
        '...11...',
        '...11...',
        '........',
        '...11...',
        '...11...',
    ],
    settings: [
        '..1..1..',
        '.111111.',
        '11.11.11',
        '.111111.',
        '.111111.',
        '11.11.11',
        '.111111.',
        '..1..1..',
    ],
};

function renderPixelIcons() {
    document.querySelectorAll('.pi[data-icon]').forEach(el => {
        const icon = el.dataset.icon;
        const m = PT_ICONS[icon];
        if (!m) return;
        const shadows = [];
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (m[y][x] === '1') shadows.push(`${x + 1}px ${y + 1}px 0 0 currentColor`);
            }
        }
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.boxShadow = shadows.join(',');
    });
}

/* 导出为全局变量 */
window.PTAvatar = PTAvatar;
window.PTFire = PTFire;
window.drawTavernLogo = drawTavernLogo;
window.drawLantern = drawLantern;
window.mulberry32 = mulberry32;
window.renderPixelIcons = renderPixelIcons;
