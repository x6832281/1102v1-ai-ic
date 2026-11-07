/* ============================================================
 * 幻境回声 · EchoCraft — 程序化艺术肖像 / 氛围徽记 / 视效引擎
 * 纯原生 Canvas 绘制，现代几何艺术风格，零外部素材与图片依赖
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

/* ---------- 角色肖像引擎：现代几何微光人像 ---------- */
const PTAvatar = (() => {
    const dataUrlCache = new Map();

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
        const bg2 = pal.bg2 || '#0e1117';
        const hairCol = pal.hair || '#4a6572';
        const skinCol = pal.skin || '#e2e8f0';

        // 1. 背景流光与几何虚境
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, bg1);
        grad.addColorStop(1, bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // 2. 背景微光圆弧 / 星轨光环
        ctx.save();
        ctx.beginPath();
        const haloX = W * (0.35 + rand() * 0.3);
        const haloY = H * (0.3 + rand() * 0.25);
        const haloR = W * 0.45;
        const haloGrad = ctx.createRadialGradient(haloX, haloY, haloR * 0.2, haloX, haloY, haloR);
        haloGrad.addColorStop(0, hexToRgba(hairCol, 0.28));
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloGrad;
        ctx.arc(haloX, haloY, haloR, 0, Math.PI * 2);
        ctx.fill();

        // 细微星轨线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(W * 0.5, H * 0.52, W * 0.38, 0.2, Math.PI * 1.8);
        ctx.stroke();
        ctx.restore();

        // 3. 角色半身剪影架构
        const cx = W * 0.5;
        const headY = H * 0.38;
        const headR = W * 0.22;

        // 衣服/肩部剪影
        ctx.save();
        ctx.fillStyle = hexToRgba(bg1, 0.95);
        ctx.beginPath();
        ctx.moveTo(cx - W * 0.42, H);
        ctx.quadraticCurveTo(cx - W * 0.35, H * 0.72, cx - W * 0.16, H * 0.62);
        ctx.lineTo(cx + W * 0.16, H * 0.62);
        ctx.quadraticCurveTo(cx + W * 0.35, H * 0.72, cx + W * 0.42, H);
        ctx.closePath();
        ctx.fill();

        // 衣领线条
        ctx.strokeStyle = hexToRgba(hairCol, 0.6);
        ctx.lineWidth = Math.max(1.5, W * 0.02);
        ctx.beginPath();
        ctx.moveTo(cx - W * 0.12, H * 0.62);
        ctx.lineTo(cx, H * 0.74);
        ctx.lineTo(cx + W * 0.12, H * 0.62);
        ctx.stroke();
        ctx.restore();

        // 颈部
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        ctx.rect(cx - W * 0.07, headY + headR * 0.5, W * 0.14, H * 0.2);
        ctx.fill();

        // 头部/面部基底
        ctx.save();
        ctx.fillStyle = skinCol;
        ctx.beginPath();
        ctx.arc(cx, headY, headR, 0, Math.PI * 2);
        ctx.fill();

        // 面颊微红
        ctx.fillStyle = 'rgba(244, 114, 182, 0.15)';
        ctx.beginPath();
        ctx.arc(cx - headR * 0.5, headY + headR * 0.2, headR * 0.2, 0, Math.PI * 2);
        ctx.arc(cx + headR * 0.5, headY + headR * 0.2, headR * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // 4. 眼睛（精致极简现代风格）
        const eyeY = headY + headR * 0.05;
        const eyeDist = headR * 0.42;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx - eyeDist, eyeY, headR * 0.09, 0, Math.PI * 2);
        ctx.arc(cx + eyeDist, eyeY, headR * 0.09, 0, Math.PI * 2);
        ctx.fill();

        // 眼神光
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - eyeDist + 1, eyeY - 1, headR * 0.035, 0, Math.PI * 2);
        ctx.arc(cx + eyeDist + 1, eyeY - 1, headR * 0.035, 0, Math.PI * 2);
        ctx.fill();

        // 嘴部微抿
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - headR * 0.12, headY + headR * 0.45);
        ctx.lineTo(cx + headR * 0.12, headY + headR * 0.45);
        ctx.stroke();

        // 5. 发型轮廓与前额刘海
        ctx.fillStyle = hairCol;
        ctx.beginPath();
        // 发顶
        ctx.arc(cx, headY - headR * 0.15, headR * 1.08, Math.PI * 0.85, Math.PI * 0.15, false);
        // 刘海曲线
        const hairStyleVariant = Math.floor(rand() * 3);
        if (hairStyleVariant === 0) {
            // 斜分流线
            ctx.quadraticCurveTo(cx + headR * 0.3, headY - headR * 0.2, cx + headR * 0.8, headY + headR * 0.4);
            ctx.lineTo(cx - headR * 0.8, headY + headR * 0.4);
        } else if (hairStyleVariant === 1) {
            // 齐平微拱
            ctx.quadraticCurveTo(cx, headY - headR * 0.05, cx + headR * 0.85, headY + headR * 0.35);
            ctx.lineTo(cx - headR * 0.85, headY + headR * 0.35);
        } else {
            // 层次发丝
            ctx.lineTo(cx + headR * 0.9, headY + headR * 0.5);
            ctx.lineTo(cx + headR * 0.3, headY + headR * 0.05);
            ctx.lineTo(cx, headY + headR * 0.15);
            ctx.lineTo(cx - headR * 0.4, headY + headR * 0.02);
            ctx.lineTo(cx - headR * 0.9, headY + headR * 0.5);
        }
        ctx.closePath();
        ctx.fill();

        // 鬓角自然垂发
        ctx.beginPath();
        ctx.rect(cx - headR * 1.05, headY - headR * 0.1, headR * 0.28, headR * 1.1);
        ctx.rect(cx + headR * 0.77, headY - headR * 0.1, headR * 0.28, headR * 1.1);
        ctx.fill();

        // 6. 发丝高光细线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = Math.max(1, W * 0.015);
        ctx.beginPath();
        ctx.arc(cx, headY - headR * 0.15, headR * 0.92, Math.PI * 1.15, Math.PI * 1.45);
        ctx.stroke();

        ctx.restore();

        // 7. 外层精致发光极细边框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    }

    function toDataURL(char, size = 64) {
        const key = `${char.id || char.name || 'custom'}_${size}_${char.seed || 0}`;
        if (dataUrlCache.has(key)) return dataUrlCache.get(key);

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        drawToCanvas(canvas, char);
        const url = canvas.toDataURL('image/png');
        dataUrlCache.set(key, url);
        return url;
    }

    function hexToRgba(hex, alpha = 1) {
        if (!hex || hex[0] !== '#') return `rgba(100, 116, 139, ${alpha})`;
        let c = hex.slice(1);
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

/* ---------- 氛围共鸣波形仪 (原酒馆炉火升级为现代流体声波仪) ---------- */
const PTFire = (() => {
    let raf = 0;
    let t = 0;

    function frame(ts, canvas) {
        raf = requestAnimationFrame(timestamp => frame(timestamp, canvas));
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        // 深邃渐变底色
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#0c111a');
        bgGrad.addColorStop(1, '#080c12');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        t += 0.04;

        // 绘制三道微光交织的平滑正弦共鸣波
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

        // 灵动微尘粒子
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
            if (!raf && canvas) raf = requestAnimationFrame(ts => frame(ts, canvas));
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

    // 1. 发光外轨
    ctx.strokeStyle = 'rgba(0, 209, 178, 0.85)';
    ctx.lineWidth = Math.max(1.5, W * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.25, Math.PI * 1.45);
    ctx.stroke();

    // 2. 内部交错棱镜
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.2, W * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.6);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.6);
    ctx.closePath();
    ctx.stroke();

    // 3. 中心微光核心
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

/* 导出为全局变量 */
window.PTAvatar = PTAvatar;
window.PTFire = PTFire;
window.drawTavernLogo = drawTavernLogo;
window.drawLantern = drawLantern;
window.mulberry32 = mulberry32;
