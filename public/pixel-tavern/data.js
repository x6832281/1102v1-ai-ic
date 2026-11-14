/* ============================================================
 * 幻境回声 · EchoCraft — 门户编辑数据（分类/版本）
 * 角色数据源 = 经典酒馆角色卡库（cards.js 生成物，勿在此处加角色）
 * ============================================================ */
'use strict';

/* 档案分类 */
const PT_CATEGORIES = [
    { id: 'all',      name: '全部档案' },
    { id: 'odyssey',  name: '荒原与深空' },
    { id: 'quiet',    name: '谧夜陪伴' },
    { id: 'mystery',  name: '思辨与博弈' },
    { id: 'fantasy',  name: '奇境异闻' },
    { id: 'neon',     name: '都市霓虹' },
    { id: 'history',  name: '往昔长风' },
    { id: 'custom',   name: '自制档案' },
];

/* 角色数据源：经典酒馆卡库 data/default-user/characters/*.png
 * 管线：tools/make-demo-cards.mjs（卡内容源）→ tools/build-cards.mjs（编译）→ cards.js
 * 本文件只保留分类/版本等门户编辑内容 */
const PT_CHARACTERS = window.PT_CARD_CHARACTERS || [];

const PT_NEWS = {
    version: 'V2.1',
    codename: '卡源合一',
    date: '2026.11.14',
};

/* 导出全局对象 */
if (typeof window !== 'undefined') {
    window.PT_CATEGORIES = PT_CATEGORIES;
    window.PT_CHARACTERS = PT_CHARACTERS;
    window.PT_NEWS = PT_NEWS;
}

