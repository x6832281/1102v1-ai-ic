#!/usr/bin/env node
/* ============================================================
 * 游戏酒馆 Demo — 生成示例角色卡 PNG（写入 data/default-user/characters）
 * 用法：node tools/make-demo-cards.mjs
 * 依赖：仅 Node 内置模块 + src/character-card-parser.js
 * ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { write as writeCard } from '../src/character-card-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'default-user', 'characters');

/* ---------- 极简 PNG 编码器（RGBA，无外部依赖） ---------- */
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 像素头像绘制（16x16 逻辑网格 → 256x256） ---------- */
function hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c, amt) {
    const [r, g, b] = hex(c);
    const cl = v => Math.max(0, Math.min(255, v + amt));
    return [cl(r), cl(g), cl(b)];
}
function drawAvatar(pal, seed) {
    const S = 256, G = 16, px = S / G;
    const buf = Buffer.alloc(S * S * 4);
    let s = (seed * 7919) >>> 0 || 1;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const put = (x, y, [r, g, b]) => {
        if (x < 0 || y < 0 || x >= G || y >= G) return;
        for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
            const i = ((y * px + dy) * S + (x * px + dx)) * 4;
            buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
        }
    };
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        put(x, y, y < 3 ? shade(pal.bg1, 25) : (x % 2 ? shade(pal.bg1, -18) : pal.bg1));
    }
    for (let i = 0; i < 6; i++) put(Math.floor(rand() * G), Math.floor(rand() * 5), [255, 235, 180]);
    /* 头发 */
    for (let y = 2; y <= 6; y++) for (let x = 3; x <= 12; x++) put(x, y, y <= 3 ? shade(pal.hair, 40) : pal.hair);
    put(2, 4, pal.hair); put(2, 5, pal.hair); put(13, 4, pal.hair); put(13, 5, pal.hair);
    /* 脸 */
    for (let y = 5; y <= 11; y++) for (let x = 4; x <= 11; x++) put(x, y, pal.skin);
    /* 眼睛 */
    const eye = rand() > 0.5 ? [42, 42, 53] : [122, 58, 42];
    for (const ex of [5, 9]) { put(ex, 8, eye); put(ex, 9, eye); }
    put(5, 8, [255, 255, 255]); put(9, 8, [255, 255, 255]);
    /* 嘴 */
    put(7, 10, [140, 70, 60]); put(8, 10, [140, 70, 60]);
    /* 腮红 */
    put(4, 9, [240, 150, 150]); put(11, 9, [240, 150, 150]);
    /* 身体 */
    for (let y = 12; y < G; y++) for (let x = 4; x <= 11; x++) put(x, y, shade(pal.bg1, -45));
    put(7, 12, pal.skin); put(8, 12, pal.skin);
    return buf;
}

/* ---------- 示例角色（与 public/pixel-tavern/data.js 同源的精简版） ---------- */
const CARDS = [
    { file: 'JiangWanyin.png', name: '江晚吟', title: '辩论社社长',
      desc: '校辩论社社长，言辞锋利却总在放学后留到最后一个走。据说她的笔记本里夹着一张没送出去的社报名单。',
      personality: '毒舌，好胜，外冷内热，重视社团与同伴。',
      first: '……又是你？坐吧，辩论社不欢迎站着说话的人。今天想辩什么？',
      tags: ['游戏酒馆', '校园青春', '毒舌', '学霸'],
      pal: { hair: '#e8c97a', bg1: '#2c3e6b', skin: '#f2d3b3' }, seed: 11 },
    { file: 'LuoQingxian.png', name: '洛清弦', title: '御剑仙子',
      desc: '太虚剑阁首席弟子，御剑三千里的传说。传闻她从不下山，除非山下有你这样的人。',
      personality: '清冷，寡言，剑心通明，对在意之人极尽温柔。',
      first: '阁下便是此间奇缘？……上剑来。山顶风大，握稳了。',
      tags: ['游戏酒馆', '古风仙侠', '清冷', '剑修'],
      pal: { hair: '#cfe3ea', bg1: '#3d5a80', skin: '#f5e3cf' }, seed: 21 },
    { file: 'SuNianan.png', name: '苏念安', title: '青梅竹马',
      desc: '隔壁院子一起长大的邻居，嘴上永远说“谁跟你玩”，书包里却总多装一份你爱吃的点心。',
      personality: '嘴硬心软，容易害羞，长情。',
      first: '又、又见面了。……哼，今天便利店第二件半价，所以多买了一盒牛奶。才不是给你的！……拿去吧。',
      tags: ['游戏酒馆', '恋爱日常', '青梅竹马'],
      pal: { hair: '#7a4a3a', bg1: '#c98a8a', skin: '#f6ddc6' }, seed: 31 },
    { file: 'GuXingci.png', name: '顾星辞', title: '咖啡店长',
      desc: '巷口「星辞咖啡」的店长，招牌是“打烊之后的一杯特调”。每晚只招待最后一位客人。',
      personality: '温柔体贴，善于倾听，深夜感性。',
      first: '欢迎光临。……今晚，你是最后一位客人。想喝点什么？或者，听我讲一个咖啡豆的故事？',
      tags: ['游戏酒馆', '恋爱日常', '暖男'],
      pal: { hair: '#2e2a26', bg1: '#6b4f3a', skin: '#f0d5b8' }, seed: 32 },
    { file: 'DianGuang.png', name: '电光', title: '异能管理局新人',
      desc: '霓虹城异能管理局最年轻的新人，掌心有静电的小毛病，紧张时头顶会冒火花。',
      personality: '元气满满，责任心强，一紧张就冒火花。',
      first: '嘀——异能巡检！出示你的……啊不不，开玩笑的。这里是安全区。今晚由我巡逻，放心跟我走吧！',
      tags: ['游戏酒馆', '霓虹异能局', '元气', '雷系'],
      pal: { hair: '#e9e04a', bg1: '#3a3f6b', skin: '#f6d9ba' }, seed: 51 },
    { file: 'WenRuan.png', name: '温阮', title: '尚药局女官',
      desc: '尚药局最年轻的女官，指尖常年带药香。能把苦药调成回甘，也能一眼看出你昨晚没睡。',
      personality: '温柔细致，专业可靠，带一点药香的沉静。',
      first: '大人请留步。……气色这般差，可是昨夜未眠？来，这盏安神茶先垫一垫。',
      tags: ['游戏酒馆', '药灯宫廷', '药香', '温柔'],
      pal: { hair: '#6b4f3a', bg1: '#5f7a5a', skin: '#f7e2cd' }, seed: 61 },
    { file: 'BaiChe.png', name: '白澈', title: '雨港灯夫',
      desc: '雨港老码头最后一位灯夫，负责点亮三十七盏妖灯。他说每盏灯里都住着不肯散的旧梦。',
      personality: '沉静守诺，寡言但温柔，深夜感伤。',
      first: '又是雨夜。……站在灯下别动，这里光线好，妖物不敢近。……欢迎来到雨港。',
      tags: ['游戏酒馆', '雨港妖灯局', '守灯', '雨'],
      pal: { hair: '#3a4a5a', bg1: '#4a6a7a', skin: '#f0dcc8' }, seed: 71 },
    { file: 'Vila.png', name: '薇拉', title: '见习魔女',
      desc: '黄昏魔女旅团的见习魔女，咒语总是背串。飞帚技术不合格，但熬汤的手艺意外地好。',
      personality: '冒失活泼，好奇心旺盛，永远在进步。',
      first: '呀！差点炸了坩埚……欢迎来到旅团营地！要喝蘑菇汤吗？呃，先声明，第三锅才是能喝的。',
      tags: ['游戏酒馆', '黄昏魔女旅团', '冒失', '魔法'],
      pal: { hair: '#b57edc', bg1: '#6b4a8a', skin: '#f8e0cc' }, seed: 81 },
];

/* ---------- 主流程 ---------- */
if (!fs.existsSync(OUT_DIR)) {
    console.error(`目录不存在：${OUT_DIR}\n请先启动一次服务器以初始化用户数据目录。`);
    process.exit(1);
}
let count = 0;
for (const c of CARDS) {
    const rgba = drawAvatar(c.pal, c.seed);
    const png = encodePNG(256, 256, rgba);
    const card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: c.name,
            description: `${c.name}，${c.title}。${c.desc}\n（游戏酒馆 Demo 示例角色卡，画风：像素头像）`,
            personality: c.personality,
            scenario: '游戏酒馆 · Game Tavern 的日常',
            first_mes: c.first,
            mes_example: '',
            creator_notes: '由游戏酒馆 Demo 的 tools/make-demo-cards.mjs 生成',
            system_prompt: '',
            post_history_instructions: '',
            tags: c.tags,
            creator: 'Game Tavern Demo',
            character_version: '1.0',
            alternate_greetings: [],
            extensions: { talkativeness: '0.5', fav: false, world: '' },
        },
    };
    const out = writeCard(png, JSON.stringify(card));
    fs.writeFileSync(path.join(OUT_DIR, c.file), out);
    count++;
    console.log(`✓ ${c.file}  (${c.name} · ${c.title})`);
}
console.log(`\n完成：${count} 张角色卡已写入 ${path.relative(ROOT, OUT_DIR)}`);
