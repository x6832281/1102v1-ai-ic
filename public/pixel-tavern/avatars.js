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
/* ---------- 角色肖像引擎：琉璃像馆清晰绘制（共享引擎 portrait-painter.js） ---------- */
const PTAvatar = (() => {
    const dataUrlCache = new Map();

    function drawToCanvas(canvas, char, options = {}) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const seed = options.seed ?? char.seed ?? hashString(char.name || char.id || 'echo');
        if (window.ECPainter) {
            const img = ctx.createImageData(W, H);
            window.ECPainter.paint(img.data, W, H, { palette: char.palette, avatar: char.avatar, seed: seed, name: char.name });
            ctx.putImageData(img, 0, 0);
        } else {
            /* 兜底：共享绘制器缺失时的极简占位 */
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#131a26');
            grad.addColorStop(1, '#0a0f18');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(0, 209, 178, 0.55)';
            ctx.font = Math.round(H * 0.4) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((char.name || '·').slice(0, 1), W / 2, H / 2);
        }
    }

    function toDataURL(char, size = 64, height) {
        const h = height || size;
        const key = (char.id || char.name || 'custom') + '_' + size + 'x' + h + '_' + (char.seed || 0);
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
