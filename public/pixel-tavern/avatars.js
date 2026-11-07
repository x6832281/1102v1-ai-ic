/* ============================================================
 * 游戏酒馆 · 程序化像素头像 / 图标 / 炉火 / Logo 绘制
 * 全部在浏览器本地生成，无外部图片依赖。
 * ============================================================ */
'use strict';

/* ---------- 确定性随机 ---------- */
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

/* ---------- 像素头像（16x16 逻辑网格） ---------- */
const PTAvatar = (() => {
    const GRID = 16;

    /* 发型模板：'.'空 'H'头发 'S'皮肤 'E'眼睛 'M'嘴 'B'腮红 'C'刘海高光 */
    const HAIRSTYLES = [
        // 平刘海
        [
            '....HHHHHHHH....',
            '..HHHHHHHHHHHH..',
            '.HHHHHHHHHHHHHH.',
            '.HHHHHHHHHHHHHH.',
            '.HHHSSSSSSSSHHH.',
            '.HHSSESSESSESHH.',
            '..SSSSSSSSSSSS..',
        ],
        // 双马尾
        [
            '....HHHHHHHH....',
            '..HHHHHHHHHHHH..',
            'HHHHHHHHHHHHHHHH',
            'HHHHHHHHHHHHHHHH',
            'HHSSSSSSSSSSSHHH',
            'HHSSESSESSESSHHH',
            'H.SSSSSSSSSSS.HH',
        ],
        // 侧分短发
        [
            '....HHHHHHHH....',
            '..HHHHHHHHHHH...',
            '.HHHHHHHHHHHHH..',
            '.HHHHHHHHHHHHHH.',
            '.HHSSSSSSSSHHHH.',
            '.HSSESSESSESHHH.',
            '..SSSSSSSSSSSH..',
        ],
        // 蓬松卷发
        [
            '...HH.HHHH.HH...',
            '..HHHHHHHHHHHH..',
            '.HHHHHHHHHHHHHH.',
            'HHHHHHHHHHHHHHHH',
            'HHSSSSSSSSSSSHHH',
            'HHSSESSESSESSHHH',
            '.SSSSSSSSSSSSHH.',
        ],
        // 高马尾
        [
            '.HH...HHHH...HH.',
            '.HHHHHHHHHHHHHH.',
            '..HHHHHHHHHHHH..',
            '.HHHHHHHHHHHHHH.',
            '.HHSSSSSSSSHHHH.',
            '.HSSESSESSESHHH.',
            '..SSSSSSSSSSSH..',
        ],
    ];

    const EYES = [
        ['E..E', 'E..E', 'E..E'],
        ['EE.E', 'E..E', 'E..E'],
        ['E..E', 'EE.E', 'E..E'],
        ['E..E', 'E..E', '....'],
        ['EEE.', '.E.E', '.E.E'],
    ];
    const MOUTHS = [
        ['.M.', '.M.', '.M.'],
        ['...', '.M.', '...'],
        ['.M.', '.M.', '...'],
        ['...', 'MM.', '...'],
    ];

    function shade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        const r = Math.max(0, Math.min(255, (n >> 16) + amt));
        const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
        const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    }

    /**
     * 绘制像素头像。
     * @param {HTMLCanvasElement} canvas 目标画布
     * @param {object} char 角色（palette + seed + name）
     * @param {object} opts { bg1, bg2, accessory }
     */
    function draw(canvas, char, opts = {}) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const size = canvas.width;
        const px = size / GRID;
        const rand = mulberry32((char.seed || 1) * 7919 + hashString(char.name || ''));
        const pal = Object.assign({ hair: '#e8c97a', skin: '#f2d3b3', bg1: '#3a5a40', bg2: '#22331f' }, char.palette || {}, opts);
        const hairDark = shade(pal.hair, -60);
        const hairLite = shade(pal.hair, 40);
        const style = HAIRSTYLES[Math.floor(rand() * HAIRSTYLES.length)];
        const eyeStyle = EYES[Math.floor(rand() * EYES.length)];
        const mouthStyle = MOUTHS[Math.floor(rand() * MOUTHS.length)];
        const hasBlush = rand() > 0.4;
        const eyeColor = rand() > 0.5 ? '#2a2a35' : '#7a3a2a';
        const accessory = opts.accessory !== undefined ? opts.accessory : Math.floor(rand() * 4); // 0无 1发夹 2缎带 3帽

        /* 背景两色纵带 + 顶部光晕 */
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                ctx.fillStyle = y < 3 ? shade(pal.bg1, 25) : (x % 2 === 0 ? pal.bg1 : pal.bg2);
                ctx.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px));
            }
        }
        /* 背景像素星点 */
        ctx.fillStyle = 'rgba(255,235,180,0.35)';
        for (let i = 0; i < 6; i++) {
            const sx = Math.floor(rand() * GRID), sy = Math.floor(rand() * 5);
            ctx.fillRect(sx * px, sy * px, px, px);
        }

        /* 脸部：头部区域 y=4..11，宽 x=3..12 */
        const faceRows = style.length;
        const faceTop = GRID - 6 - faceRows + 1;
        /* 画头发模板行（含脸） */
        for (let r = 0; r < faceRows; r++) {
            const row = style[r];
            for (let c = 0; c < row.length; c++) {
                const ch = row[c];
                if (ch === '.') continue;
                const x = c * px, y = (faceTop + r) * px;
                let color = pal.hair;
                if (ch === 'S') color = pal.skin;
                if (ch === 'H') color = (r < 2 ? hairLite : (c % 5 === 0 ? hairDark : pal.hair));
                ctx.fillStyle = color;
                ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(px), Math.ceil(px));
            }
        }
        /* 眼睛（放在头发模板之下两行） */
        const eyeTop = faceTop + faceRows - 2;
        for (let r = 0; r < 3; r++) {
            const row = eyeStyle[r];
            for (let c = 0; c < 4; c++) {
                if (row[c] === 'E') {
                    ctx.fillStyle = eyeColor;
                    /* 左眼 x=5+col映射: 4格映射到 5,7 与 9,11 */
                    const map = [5, 6, 9, 10];
                    ctx.fillRect(map[c] * px, (eyeTop + r) * px, px, px);
                }
            }
        }
        /* 眼睛高光 */
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(5 * px + px / 3, eyeTop * px, Math.max(1, px / 3), Math.max(1, px / 3));
        ctx.fillRect(9 * px + px / 3, eyeTop * px, Math.max(1, px / 3), Math.max(1, px / 3));

        /* 嘴 */
        const mouthTop = eyeTop + 4;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (mouthStyle[r][c] === 'M') {
                    ctx.fillStyle = shade('#b06a5a', -20);
                    ctx.fillRect((7 + c - 1) * px, (mouthTop + r) * px, px, px);
                }
            }
        }
        /* 腮红 */
        if (hasBlush) {
            ctx.fillStyle = 'rgba(240,130,130,0.55)';
            ctx.fillRect(4 * px, (mouthTop - 1) * px, px, px);
            ctx.fillRect(11 * px, (mouthTop - 1) * px, px, px);
        }

        /* 配饰 */
        if (accessory === 1) { /* 发夹 */
            ctx.fillStyle = '#ffb545';
            ctx.fillRect(11 * px, (faceTop) * px, px, px);
            ctx.fillStyle = '#fff';
            ctx.fillRect(12 * px, (faceTop) * px, px, px);
        } else if (accessory === 2) { /* 缎带 */
            ctx.fillStyle = '#e5484d';
            ctx.fillRect(2 * px, (faceTop - 1) * px, px * 2, px);
            ctx.fillRect(3 * px, (faceTop - 2) * px, px, px * 2);
        } else if (accessory === 3) { /* 兜帽 */
            ctx.fillStyle = shade(pal.bg1, -35);
            ctx.fillRect(2 * px, (faceTop - 2) * px, 12 * px, px);
            ctx.fillRect(px, (faceTop - 1) * px, px, px * 3);
            ctx.fillRect(14 * px, (faceTop - 1) * px, px, px * 3);
        }

        /* 底部像素签名条 */
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, size - px, size, px);
        return canvas;
    }

    /* 生成 dataURL 缓存 */
    const cache = new Map();
    function toDataURL(char, size = 96) {
        const key = char.id + ':' + size + ':' + (char.seed || 0) + JSON.stringify(char.palette || {});
        if (cache.has(key)) return cache.get(key);
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        draw(c, char);
        const url = c.toDataURL();
        cache.set(key, url);
        return url;
    }
    return { draw, toDataURL, GRID };
})();

/* ---------- 8x8 像素图标（box-shadow 绘制） ---------- */
const PT_ICONS = {
    market: ['........', '...11...', '..1111..', '.111111.', '.111111.', '..1111..', '...11...', '........'],
    shelf: ['.111111.', '.1....1.', '.1.11.1.', '.1.11.1.', '.1....1.', '.111111.', '.1....1.', '.111111.'],
    build: ['...1....', '...1....', '.111111.', '.1...1..', '.11.11..', '.1...1..', '.111111.', '........'],
    fav: ['.11.11..', '1111111.', '1111111.', '.11111..', '..111...', '...1....', '........', '........'],
    history: ['..1111..', '.1....1.', '.1..11..', '.1....1.', '.1.1..1.', '..1111..', '........', '...11...'],
    news: ['...11...', '..1111..', '.111111.', '.11..11.', '.111111.', '..1111..', '...11...', '...11...'],
    guide: ['..1111..', '.1....1.', '.1.11.1.', '.1.11.1.', '.1....1.', '.1..1.1.', '.1....1.', '..1111..'],
    settings: ['...1.1..', '..1.1...', '.11.11..', '...1...1', '.1.11...', '..1.1...', '.1.1.1..', '........'],
};
function renderPixelIcons(root) {
    (root || document).querySelectorAll('i.pi[data-icon]').forEach(el => {
        const m = PT_ICONS[el.dataset.icon];
        if (!m) return;
        const shadows = [];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            if (m[y][x] === '1') shadows.push(`${x + 1}px ${y + 1}px 0 0 currentColor`);
        }
        el.style.width = '1px'; el.style.height = '1px';
        el.style.boxShadow = shadows.join(',');
    });
}

/* ---------- 炉火动画 ---------- */
const PTFire = (() => {
    let raf = 0, last = 0;
    function frame(ts, canvas) {
        raf = requestAnimationFrame(t => frame(t, canvas));
        if (ts - last < 90) return; /* ~11fps 像素感 */
        last = ts;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#14100c';
        ctx.fillRect(0, 0, W, H);
        /* 石壁 */
        ctx.fillStyle = '#241c14';
        for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
        /* 底座石台 */
        for (let x = 0; x < W; x++) {
            const n = Math.sin(x * 2.3) * 0.5 + 0.5;
            ctx.fillStyle = n > 0.6 ? '#3a332a' : (n > 0.3 ? '#2e2822' : '#241f1a');
            ctx.fillRect(x, H - 2, 1, 2);
        }
        /* 柴 */
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(6, H - 4, 20, 3);
        ctx.fillStyle = '#7a4a2a';
        ctx.fillRect(4, H - 3, 24, 2);
        /* 火焰（伪随机跳动的像素柱） */
        const t = ts / 120;
        for (let x = 6; x < 26; x++) {
            const n = Math.sin(x * 1.7 + t) * 0.5 + Math.sin(x * 0.9 - t * 1.3) * 0.5;
            const h = Math.max(1, Math.round((10 - Math.abs(x - 16) * 0.55) + n * 3));
            for (let y = 0; y < h; y++) {
                const yy = H - 4 - y;
                let col;
                if (y > h - 3) col = '#e5484d';
                else if (y > h - 6) col = '#ff8c42';
                else if (y > h - 9) col = '#ffb545';
                else col = '#ffe97a';
                ctx.fillStyle = col;
                ctx.fillRect(x, yy, 1, 1);
            }
        }
        /* 火星 */
        ctx.fillStyle = 'rgba(255,220,120,0.8)';
        for (let i = 0; i < 3; i++) {
            const mx = 12 + ((t * 7 + i * 9) % 12);
            const my = (H - 6 - ((t * 5 + i * 7) % 14));
            ctx.fillRect(Math.floor(mx), Math.floor(my), 1, 1);
        }
    }
    return {
        start(canvas) { if (!raf) raf = requestAnimationFrame(t => frame(t, canvas)); },
        stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
    };
})();

/* ---------- 空状态像素灯笼 ---------- */
function drawLantern(canvas) {
    const M = [
        '......GGGG......',
        '.....G....G.....',
        '....G......G....',
        '.GGGGGGGGGGGGGG.',
        '.GRRRRRRRRRRRRG.',
        'GRRWRRRRRRRRWRRG',
        'GRRRRRRRRRRRRRRG',
        'GRRWRRRRRRRRWRRG',
        'GRRRRRRRRRRRRRRG',
        '.GRRRRRRRRRRRRG.',
        '.GGGGGGGGGGGGGG.',
        '....G.GGGG.G....',
        '......G..G......',
        '.....GG..GG.....',
    ];
    const COLS = { G: '#d4a94e', R: '#c0392b', W: '#ffb545' };
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = Math.min(canvas.width / 16, canvas.height / 14);
    const ox = (canvas.width - 16 * px) / 2, oy = (canvas.height - 14 * px) / 2;
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) {
        const c = M[y][x];
        if (c !== '.') { ctx.fillStyle = COLS[c]; ctx.fillRect(ox + x * px, oy + y * px, px, px); }
    }
}

/* ---------- 酒馆 Logo（像素小酒杯） ---------- */
function drawTavernLogo(canvas) {
    const M = [
        '................',
        '..1111111111....',
        '..1........1....',
        '..1..2222..1.33.',
        '..1..2222..1333.',
        '..1..2222..1.33.',
        '..1..2222..1....',
        '..1........1....',
        '..1..4444..1....',
        '..1.444444.1....',
        '..1.444444.1....',
        '..1..4444..1....',
        '...1......1.....',
        '....111111......',
        '................',
        '................',
    ];
    const COLS = { 1: '#e8c97a', 2: '#d4a94e', 3: '#7fd57f', 4: '#b5772a' };
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = Math.min(canvas.width / 16, canvas.height / 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const c = M[y][x];
        if (c !== '.') { ctx.fillStyle = COLS[c]; ctx.fillRect(x * px, y * px, px, px); }
    }
}

/* 导出为全局供 app.js 使用 */
window.PTAvatar = PTAvatar;
window.renderPixelIcons = renderPixelIcons;
window.PTFire = PTFire;
window.drawTavernLogo = drawTavernLogo;
window.mulberry32 = mulberry32;
window.drawLantern = drawLantern;
