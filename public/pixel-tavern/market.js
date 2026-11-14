/* ============================================================
 * 游戏酒馆 · 卡片市场模块
 * 卡片渲染/集市/详情弹窗/Build/导入导出/PNG 角色卡构建
 * （依赖 app.js 的 state/store/$/esc 等全局，均为运行时引用）
 * ============================================================ */
'use strict';

/* global state, PT_CATEGORIES, esc, PTAvatar, mulberry32, isFav, findChar, toast, openModal, allChars, switchView, saveCustom, saveImported, reopenHistory, drawLantern */

/* ============================================================
 * 卡片渲染
 * ============================================================ */
let currentCat = 'all';
let searchQ = '';

function catName(id) { const c = PT_CATEGORIES.find(x => x.id === id); return c ? c.name : id; }

function renderTabs() {
    const tabs = $('#cat-tabs');
    tabs.innerHTML = '';
    const cats = PT_CATEGORIES.filter(c => c.id !== 'custom' || state.custom.length + state.imported.length > 0);
    cats.forEach(c => {
        const b = document.createElement('button');
        b.className = 'cat-tab' + (currentCat === c.id ? ' active' : '');
        b.textContent = c.name;
        b.addEventListener('click', () => { currentCat = c.id; renderTabs(); renderMarket(); });
        tabs.appendChild(b);
    });
}

function filteredMarket() {
    return allChars().filter(c => {
        if (currentCat === 'all') return true;
        if (currentCat === 'custom') return c.origin === 'custom' || c.origin === 'imported';
        return c.category === currentCat;
    }).filter(c => {
        if (!searchQ) return true;
        const q = searchQ.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q)
            || (c.tags || []).some(t => t.toLowerCase().includes(q));
    });
}

/* 搜索命中高亮（先转义再包裹，防注入） */
function highlight(text, q) {
    const safe = esc(text);
    if (!q || !text) return safe;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return safe;
    return esc(text.slice(0, idx))
        + '<span class="hl">' + esc(text.slice(idx, idx + q.length)) + '</span>'
        + esc(text.slice(idx + q.length));
}

/* 当日会话缓存：每轮渲染前重建（history ≤ 30 条，开销可忽略） */
let todaySet = new Map();
function refreshTodayCache() {
    todaySet = new Map();
    const today = new Date().toDateString();
    state.history.forEach(h => {
        if (new Date(h.time).toDateString() !== today) return;
        const list = todaySet.get(h.charId) || [];
        list.push(h);
        todaySet.set(h.charId, list);
    });
}
function getTodays(charId) { return (todaySet.get(charId) || []).slice().sort((a, b) => b.time - a.time); }

function makeCardEl(char, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card' + (opts.small ? ' small' : '');
    const cover = document.createElement('div');
    cover.className = 'card-cover';
    const av = document.createElement('img');
    av.src = PTAvatar.toDataURL(char, 320, 400); /* 全幅封面（走缓存，重渲染零重绘） */
    av.alt = '';
    av.draggable = false;
    cover.appendChild(av);
    /* 推荐/自制角标 */
    if ((char.tags || []).includes('推荐')) {
        const badge = document.createElement('span');
        badge.className = 'card-badge rec'; badge.textContent = '推荐';
        cover.appendChild(badge);
    }
    if (char.origin === 'custom') {
        const badge = document.createElement('span');
        badge.className = 'card-badge mine'; badge.textContent = '自制';
        cover.appendChild(badge);
    }
    if (char.origin === 'imported') {
        const badge = document.createElement('span');
        badge.className = 'card-badge mine imp'; badge.textContent = '导入';
        cover.appendChild(badge);
    }
    if (isFav(char.id)) {
        const badge = document.createElement('span');
        badge.className = 'card-badge fav'; badge.textContent = '♥';
        cover.appendChild(badge);
    }
    /* 今日互动标记（点击继续今日会话） */
    const todays = getTodays(char.id);
    if (todays.length) {
        const badge = document.createElement('span');
        badge.className = 'card-badge today'; badge.textContent = '今日';
        badge.title = '继续今日对话';
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const latest = todays.sort((a, b) => b.time - a.time)[0];
            reopenHistory(latest.id);
        });
        cover.appendChild(badge);
    }
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `<div class="card-name">${highlight(char.name, searchQ)}</div><div class="card-cat">${highlight(char.title || '', searchQ)} · ${esc(catName(char.category))}</div>`;
    cover.appendChild(info); /* 信息层内嵌封面底部（渐变压字） */
    el.appendChild(cover);
    el.addEventListener('click', () => openDetail(char.id));
    /* 键盘可达：Tab 聚焦 + Enter/Space 打开详情 */
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', '查看角色 ' + char.name);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(char.id); }
    });
    return el;
}

function renderGrid(sel, chars, emptyText) {
    refreshTodayCache();
    const grid = $(sel);
    grid.innerHTML = '';
    if (!chars.length) {
        grid.innerHTML = `<div class="empty-tip"><canvas class="empty-art" width="128" height="112"></canvas>${esc(emptyText || '这里空空如也。')}</div>`;
        const art = grid.querySelector('.empty-art');
        if (art) drawLantern(art);
        return;
    }
    chars.forEach(c => grid.appendChild(makeCardEl(c)));
}

/* 焦点档案（SPOTLIGHT）：推荐角色优先，无推荐标记时按分类首见兜底，保证不空 */
function renderSpotlight() {
    const strip = $('#shelf-strip');
    strip.innerHTML = '';
    const day = Math.floor(Date.now() / 864e5);
    const pool = allChars();
    const rotated = pool.map((c, i) => pool[(i + day) % pool.length]);
    let featured = rotated.filter(c => (c.tags || []).includes('推荐'));
    if (!featured.length) {
        const seen = new Set();
        featured = rotated.filter(c => (c.category === 'custom' ? true : !seen.has(c.category) && seen.add(c.category)));
    }
    featured.slice(0, 8).forEach(c => {
        const el = document.createElement('div');
        el.className = 'spot-item';
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', '聚焦角色 ' + c.name);
        const raw = ((c.alts && c.alts[0]) || c.greeting || '').replace(/\s+/g, ' ').trim();
        const quote = raw.length > 32 ? raw.slice(0, 32) + '…' : raw;
        el.innerHTML =
            `<div class="spot-avatar"><img src="${PTAvatar.toDataURL(c, 112)}" alt=""></div>` +
            `<div class="spot-meta"><div class="spot-name">${highlight(c.name, searchQ)}</div>` +
            `<div class="spot-title">${esc(c.title || '')} · ${esc(catName(c.category))}</div>` +
            (quote ? `<div class="spot-quote">${esc(quote)}</div>` : '') +
            `</div>`;
        el.addEventListener('click', () => openDetail(c.id));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(c.id); }
        });
        strip.appendChild(el);
    });
}

function renderMarket() {
    refreshTodayCache();
    const list = filteredMarket();
    renderGrid('#card-grid', list, '没有匹配的角色卡，换个分类或关键词试试。');
    $('#result-count').textContent = list.length;
    renderSpotlight();
}

/* ============================================================
 * 角色详情弹窗
 * ============================================================ */
function openDetail(id) {
    const c = findChar(id);
    if (!c) return;
    state.currentDetail = id;
    PTAvatar.draw($('#detail-avatar'), c);
    $('#detail-name').textContent = c.name;
    $('#detail-title').textContent = `${c.title || ''} · ${catName(c.category)}`;
    $('#detail-tags').innerHTML = (c.tags || []).map(t => `<span class="px-tag">${esc(t)}</span>`).join('');
    $('#detail-desc').textContent = c.desc || '（暂无简介）';
    $('#detail-greet').textContent = '「' + (c.greeting || '……') + '」';
    /* 世界书 v1：设定集折叠区 */
    const loreBox = $('#detail-lore');
    const loreList = $('#detail-lore-list');
    if (loreBox && loreList) {
        const lore = c.lore || [];
        loreBox.classList.toggle('hidden', !lore.length);
        loreBox.open = false;
        loreList.innerHTML = lore.map(e =>
            `<div class="lore-item${e.core ? ' core' : ''}"><div class="lore-title">${esc(e.title || '')}${e.core ? '<i>核心</i>' : ''}</div><div class="lore-text">${esc(e.text || '')}</div></div>`
        ).join('');
    }
    const rand = mulberry32(id.length * 131 + (c.seed || 0));
    $('#detail-pop').style.width = (55 + Math.floor(rand() * 40)) + '%';
    $('#detail-act').style.width = (35 + Math.floor(rand() * 60)) + '%';
    /* 最近对话摘录 */
    const recent = $('#detail-recent');
    const h = state.history.find(x => x.charId === id && x.messages && x.messages.length);
    if (recent) {
        if (h) {
            const last = h.messages[h.messages.length - 1];
            recent.classList.remove('hidden');
            recent.innerHTML = `<span class="lab">最近对话 · ${esc(new Date(h.time).toLocaleDateString('zh-CN'))} · ${h.messages.length} 条</span>${esc(String(last.text).slice(0, 80))}`;
        } else {
            recent.classList.add('hidden');
        }
    }
    /* 继续上次对话按钮 */
    state._recentSessionId = h ? h.id : null;
    const resumeBtn = $('#btn-resume-chat');
    if (resumeBtn) resumeBtn.classList.toggle('hidden', !h);
    /* 删除按钮（仅自制/导入卡） */
    const delBtn = $('#btn-delete-card');
    if (delBtn) delBtn.classList.toggle('hidden', !(c.origin === 'custom' || c.origin === 'imported'));
    /* 编辑按钮（仅自制卡） */
    const editBtn = $('#btn-edit-card');
    if (editBtn) editBtn.classList.toggle('hidden', c.origin !== 'custom');
    /* JSON 导出按钮（自制/导入卡） */
    const expCardBtn = $('#btn-export-card');
    if (expCardBtn) expCardBtn.classList.toggle('hidden', !(c.origin === 'custom' || c.origin === 'imported'));
    /* PNG 卡导出按钮（同上） */
    const expPngBtn = $('#btn-export-png');
    if (expPngBtn) expPngBtn.classList.toggle('hidden', !(c.origin === 'custom' || c.origin === 'imported'));
    /* 轮换开场白预览 */
    state._greetList = [c.greeting, ...(c.alts || [])];
    const gl = c.alts && c.alts.length ? c.alts.length : 1;
    state._greetIdx = Math.floor(Date.now() / 864e5) % gl; /* 每日开场白：按日序轮换，可手动切换 */
    const cycleBtn = $('#btn-greet-cycle');
    if (cycleBtn) cycleBtn.classList.toggle('hidden', state._greetList.length < 2);
    const favBtn = $('#btn-fav-toggle');
    favBtn.textContent = isFav(id) ? '♥ 已收藏' : '♥ 收藏';
    favBtn.classList.toggle('gold', isFav(id));
    openModal('modal-detail');
}

/* ============================================================
 * Build 角色卡制作
 * ============================================================ */
/* 退出 Build 编辑态，恢复新建表单 */
function resetBuildForm() {
    state._editingCardId = null;
    const hint = $('#build-editing');
    if (hint) hint.classList.add('hidden');
    const btn = $('#btn-build-submit');
    if (btn) btn.textContent = '✚ 放入我的书架';
    $('#build-form').reset();
    $('#build-name').dispatchEvent(new Event('input'));
}

/* 世界书输入解析：每行「关键词 | 标题 | 内容」（两段式视为关键词 | 内容），首行标记核心 */
function parseLoreInput(raw) {
    return (raw || '').split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        return {
            keys: parts[0],
            title: parts.length >= 3 ? parts[1] : (parts[1].slice(0, 10) || '设定 ' + (i + 1)),
            text: parts.length >= 3 ? parts.slice(2).join('：') : parts[1],
            core: i === 0,
        };
    }).filter(e => e && e.text);
}

function initBuild() {
    const sel = $('#build-cat');
    PT_CATEGORIES.filter(c => c.id !== 'all' && c.id !== 'custom').forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.name;
        sel.appendChild(o);
    });
    const pv = $('#build-preview');
    function reroll() {
        const draft = {
            id: '_draft', name: $('#build-name').value || '新角色', seed: Math.floor(Math.random() * 100000),
            palette: { hair: $('#build-hair').value, bg1: $('#build-bg').value, bg2: $('#build-bg').value, skin: '#f2d3b3' },
        };
        PTAvatar.draw(pv, draft);
    }
    $('#build-name').addEventListener('input', reroll);
    $('#build-hair').addEventListener('input', reroll);
    $('#build-bg').addEventListener('input', reroll);
    $('#btn-build-reroll').addEventListener('click', reroll);
    reroll();

    $('#build-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#build-name').value.trim();
        if (!name) { toast('给角色起个名字吧'); return; }
        /* 编辑模式：更新已有卡片 */
        if (state._editingCardId) {
            const card = state.custom.find(c => c.id === state._editingCardId);
            if (!card) { toast('卡片已不存在'); resetBuildForm(); return; }
            card.name = name;
            card.title = $('#build-title').value.trim() || '漫游协作者';
            card.category = $('#build-cat').value;
            card.greeting = $('#build-greeting').value.trim() || '你好，我是' + name + '。很高兴与你连线。';
            card.desc = $('#build-desc').value.trim() || '由幻境回声创作者工坊构建的个性化档案。';
            card.lore = parseLoreInput($('#build-lore').value);
            card.palette = { hair: $('#build-hair').value, bg1: $('#build-bg').value, bg2: $('#build-bg').value, skin: '#f2d3b3' };
            saveCustom();
            resetBuildForm();
            renderTabs(); renderMarket();
            if (state.view === 'shelf') switchView('shelf');
            toast('「' + name + '」已保存修改');
            return;
        }
        const card = {
            id: 'custom_' + Date.now(),
            name,
            title: $('#build-title').value.trim() || '漫游协作者',
            category: $('#build-cat').value,
            seed: Math.floor(Math.random() * 100000),
            tags: ['自制'],
            desc: $('#build-desc').value.trim() || '由幻境回声创作者工坊构建的个性化档案。',
            greeting: $('#build-greeting').value.trim() || '你好，我是' + name + '。很高兴与你连线。',
            lore: parseLoreInput($('#build-lore').value),
            origin: 'custom',
            palette: { hair: $('#build-hair').value, bg1: $('#build-bg').value, bg2: $('#build-bg').value, skin: '#f2d3b3' },
            script: {
                keywords: [
                    [/你好|嗨|hi|hello/i, '很高兴收到你的信号。今天一切还顺遂吗？'],
                    [/名字|你是谁/, '我是' + name + '。' + ($('#build-desc').value.trim() ? '简而言之：' + $('#build-desc').value.trim().slice(0, 40) : '一位刚刚载入档案库的同伴。')],
                    [/再见|别/, '期待下一次与你建立共鸣。'],
                ],
                fallbacks: [
                    '让我想想……你提到的这个视角很有意思。',
                    '（' + name + '歪着头看你）……再说多点嘛，我在听。',
                    '嘿，作为一张新卡，我的知识还不多，但陪你聊天没问题！',
                ],
                track: '与' + name + '的故事，才刚刚开始。',
            },
        };
        state.custom.unshift(card);
        saveCustom();
        toast('「' + name + '」已放入书架！');
        switchView('shelf');
        renderTabs(); renderMarket();
        resetBuildForm();
        reroll();
    });
}

/* ============================================================
 * 导入角色卡（JSON / PNG tEXt chara）
 * ============================================================ */
function parsePngCard(buf) {
    const dv = new DataView(buf);
    const sig = [0x89, 0x50, 0x4e, 0x47];
    for (let i = 0; i < 4; i++) if (dv.getUint8(i) !== sig[i]) return null;
    let off = 8;
    while (off + 8 < dv.byteLength) {
        const len = dv.getUint32(off);
        if (off + 12 + len > dv.byteLength) break; /* 防损坏/伪造的超长块 */
        const type = String.fromCharCode(dv.getUint8(off + 4), dv.getUint8(off + 5), dv.getUint8(off + 6), dv.getUint8(off + 7));
        if (type === 'tEXt') {
            const data = new Uint8Array(buf, off + 8, len);
            const str = new TextDecoder('latin1').decode(data);
            const nul = str.indexOf('\0');
            if (nul > 0) {
                const key = str.slice(0, nul);
                if (key === 'chara' || key === 'ccv3') {
                    try {
                        const json = decodeURIComponent(escape(atob(str.slice(nul + 1).trim())));
                        return JSON.parse(json);
                    } catch { return null; }
                }
            }
        }
        off += 12 + len;
        if (type === 'IEND') break;
    }
    return null;
}

function initImport() {
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            let card = null;
            if (file.name.toLowerCase().endsWith('.png')) {
                const buf = await file.arrayBuffer();
                const data = parsePngCard(buf);
                if (data) {
                    const d = data.data || data;
                    const px = (d.extensions && (d.extensions.pixel_tavern || d.extensions.echocraft)) || null;
                    const alt = (d.alternate_greetings || []).map(g => String(g).slice(0, 300));
                    card = {
                        id: 'imported_' + Date.now(),
                        name: d.name || file.name.replace(/\.png$/i, ''),
                        title: (d.metadata && d.metadata.nickname) || (px && px.title) || '导入角色',
                        category: 'custom',
                        seed: Math.floor(Math.random() * 100000),
                        tags: ['导入'],
                        desc: (d.description || '从角色卡 PNG 导入。').slice(0, 300),
                        greeting: (d.first_mes || '……').slice(0, 300),
                        alts: [(d.first_mes || '……').slice(0, 300), ...alt].slice(0, 3),
                        example: (d.mes_example || '').slice(0, 1200),
                        lore: (px && px.lore) || null,
                        avatar: (px && px.avatar) || null,
                        origin: 'imported',
                        palette: (px && px.palette) || { hair: '#b8a8e8', bg1: '#4a4a6b', bg2: '#2a2a42', skin: '#f2d3b3' },
                    };
                }
            } else {
                const text = await file.text();
                const d = JSON.parse(text);
                const dd = d.data || d;
                const px = dd.extensions && (dd.extensions.pixel_tavern || dd.extensions.echocraft);
                card = {
                    id: 'imported_' + Date.now(),
                    name: dd.name || '导入角色',
                    title: (dd.metadata && dd.metadata.nickname) || (px && px.title) || '导入角色',
                    category: 'custom',
                    seed: Math.floor(Math.random() * 100000),
                    tags: ['导入'],
                    desc: (dd.description || '').slice(0, 300) || '从 JSON 导入的角色卡。',
                    greeting: (dd.first_mes || '……').slice(0, 300),
                    alts: [(dd.first_mes || '……').slice(0, 300), ...((dd.alternate_greetings || []).map(g => String(g).slice(0, 300)))].slice(0, 3),
                    example: (dd.mes_example || '').slice(0, 1200),
                    lore: (px && px.lore) || null,
                    avatar: (px && px.avatar) || null,
                    origin: 'imported',
                    palette: (px && px.palette) || { hair: '#b8a8e8', bg1: '#4a4a6b', bg2: '#2a2a42', skin: '#f2d3b3' },
                };
                /* 还原门户导出的剧本（正则序列化逆向） */
                if (px && px.script) {
                    card.script = {
                        keywords: (px.script.keywords || []).map(([src, flags, reply]) => {
                            try { return [new RegExp(src, flags || ''), reply]; } catch { return null; }
                        }).filter(Boolean),
                        fallbacks: px.script.fallbacks || [],
                        track: px.script.track || '',
                        options: px.script.options || [],
                    };
                    if (px.id) card.id = 'imported_' + px.id;
                }
            }
            if (!card) { toast('导入失败：未找到角色卡数据'); return; }
            state.imported.unshift(card);
            saveImported();
            toast('已导入「' + card.name + '」');
            renderTabs(); renderMarket();
            openDetail(card.id);
        } catch (err) {
            console.error(err);
            toast('导入失败：' + err.message);
        }
    });
}

/* ---------- PNG 角色卡生成（浏览器端 tEXt 注入，兼容 SillyTavern 规范） ---------- */
const PNG_CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function pngCrc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = PNG_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, pngCrc32(out.subarray(4, 8 + data.length)));
    return out;
}
async function buildCardPng(char, cardJson) {
    /* 1. 像素头像卡面（金框 + 斜纹纹理 + 名条） */
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    PTAvatar.draw(cv, char);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    /* 斜纹纹理 */
    g.fillStyle = 'rgba(255, 181, 69, 0.05)';
    for (let i = -256; i < 256; i += 12) {
        g.beginPath();
        g.moveTo(i, 0); g.lineTo(i + 256, 256); g.lineTo(i + 260, 256); g.lineTo(i + 4, 0);
        g.fill();
    }
    /* 底部名条 */
    g.fillStyle = '#161d1a';
    g.fillRect(0, 212, 256, 44);
    g.fillStyle = '#d4a94e';
    g.fillRect(0, 212, 256, 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '20px "Zpix Local", "SimSun", monospace';
    g.fillStyle = '#e8c97a';
    g.fillText(char.name, 128, 230);
    g.font = '11px "Zpix Local", "SimSun", monospace';
    g.fillStyle = '#9aa08e';
    g.fillText(char.title || 'GAME TAVERN', 128, 246);
    /* 双层金框 */
    g.strokeStyle = '#d4a94e';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 252, 252);
    g.strokeStyle = '#8a6a2a';
    g.lineWidth = 2;
    g.strokeRect(8, 8, 240, 240);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    const png = new Uint8Array(await blob.arrayBuffer());
    /* 2. tEXt(chara) chunk（UTF-8 → base64，与 ST 规范一致） */
    const b64 = btoa(unescape(encodeURIComponent(cardJson)));
    const textStr = 'chara\0' + b64;
    const textData = new Uint8Array(textStr.length);
    for (let i = 0; i < textStr.length; i++) textData[i] = textStr.charCodeAt(i) & 0xFF;
    const chunk = pngChunk('tEXt', textData);
    /* 3. 插入 IEND 之前 */
    const dv = new DataView(png.buffer);
    let off = 8, iendStart = png.length - 12;
    while (off + 8 < png.length) {
        const len = dv.getUint32(off);
        const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
        if (type === 'IEND') { iendStart = off; break; }
        off += 12 + len;
    }
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, iendStart), 0);
    out.set(chunk, iendStart);
    out.set(png.subarray(iendStart), iendStart + chunk.length);
    return out.buffer;
}

/* 构建角色卡 V2 payload（JSON / PNG 导出共用） */
function buildCardPayload(c) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: c.name,
            description: c.desc || '',
            personality: '',
            scenario: '幻境回声 · EchoCraft Studio',
            first_mes: c.greeting || '',
            alternate_greetings: c.alts || [],
            mes_example: '',
            creator_notes: '由幻境回声叙事工坊导出，可在门户「导入档案」还原',
            tags: c.tags || [],
            creator: 'EchoCraft Studio',
            character_version: '2.0',
            extensions: {
                pixel_tavern: {
                    id: c.id,
                    palette: c.palette,
                    origin: c.origin,
                    avatar: c.avatar || null,
                    lore: c.lore || null,
                    example: c.example || '',
                    script: c.script ? {
                        keywords: (c.script.keywords || []).map(([re, reply]) => [re.source ?? String(re), re.flags ?? '', reply]),
                        fallbacks: c.script.fallbacks || [],
                        track: c.script.track || '',
                        options: c.script.options || [],
                    } : null,
                },
                echocraft: {
                    title: c.title || '',
                    avatar: c.avatar || null,
                    lore: c.lore || null,
                },
            },
        },
    };
}

/* 导出为全局供 app.js 运行时调用 */
window.makeCardEl = makeCardEl;
window.renderGrid = renderGrid;
window.renderMarket = renderMarket;
window.renderTabs = renderTabs;
window.catName = catName;
window.openDetail = openDetail;
window.initBuild = initBuild;
window.initImport = initImport;
window.resetBuildForm = resetBuildForm;
window.parsePngCard = parsePngCard;
window.buildCardPng = buildCardPng;
window.buildCardPayload = buildCardPayload;
window.initMarketSearch = initMarketSearch;

/* 搜索框防抖（market 域内状态） */
let searchTimer = 0;
function initMarketSearch() {
    const si = document.querySelector('#search-input');
    if (!si) return;
    si.addEventListener('input', (e) => {
        searchQ = e.target.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderMarket, 140);
    });
}
