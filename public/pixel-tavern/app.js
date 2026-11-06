/* ============================================================
 * 像素酒馆 · 主逻辑
 * 视图路由 / 角色卡集市 / 书架 / 收藏 / 历史 / Build / 对话引擎
 * 沉浸互动 BETA / TTS / 导入导出 / 设置
 * ============================================================ */
'use strict';

/* 跨文件全局（由 data.js / avatars.js / jukebox.js 以 window.* 导出） */
/* global PT_CATEGORIES, PT_CHARACTERS, PT_NEWS, PTAvatar, mulberry32, PTJukebox, PTFire, drawTavernLogo, renderPixelIcons */

/* ---------- 本地存储 ---------- */
const store = {
    get(key, def) {
        try { const v = localStorage.getItem('pt_' + key); return v === null ? def : JSON.parse(v); } catch { return def; }
    },
    set(key, val) { try { localStorage.setItem('pt_' + key, JSON.stringify(val)); } catch { /* ignore */ } },
    del(key) { try { localStorage.removeItem('pt_' + key); } catch { /* ignore */ } },
};

const state = {
    view: 'market',
    settings: Object.assign({ volume: 40, tts: false, typewriter: true, immersive: true, accent: 'gold' }, store.get('settings', {})),
    favs: store.get('favs', []),
    history: store.get('history', []),
    custom: store.get('custom_cards', []),
    imported: store.get('imported_cards', []),
    chat: { char: null, msgs: [], immersive: true, session: null, fbIdx: 0, favor: 20, mood: 60, events: [] },
    currentDetail: null,
};

function saveSettings() { store.set('settings', state.settings); }
function saveFavs() { store.set('favs', state.favs); }
function saveHistory() { store.set('history', state.history.slice(0, 30)); }
function saveCustom() { store.set('custom_cards', state.custom); }
function saveImported() { store.set('imported_cards', state.imported); }

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function esc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }
function toast(msg, ms = 2600) {
    const box = document.createElement('div');
    box.className = 'toast';
    box.textContent = msg;
    $('#toast-wrap').appendChild(box);
    setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 400); }, ms);
}
function openModal(id) {
    $('#overlay').classList.remove('hidden');
    $$('.modal-window').forEach(m => m.classList.add('hidden'));
    if (id) $('#' + id).classList.remove('hidden');
}
function closeModal() {
    $('#overlay').classList.add('hidden');
    $$('.modal-window').forEach(m => m.classList.add('hidden'));
}
function askConfirm(text, onYes) {
    $('#confirm-text').textContent = text;
    openModal('modal-confirm');
    const yes = $('#btn-confirm-yes');
    const clone = yes.cloneNode(true);
    yes.replaceWith(clone);
    clone.addEventListener('click', () => { closeModal(); onYes && onYes(); });
}

/* ---------- 角色合并（内置 + 自制 + 导入） ---------- */
function allChars() { return [...PT_CHARACTERS, ...state.custom, ...state.imported]; }
function findChar(id) { return allChars().find(c => c.id === id); }
function isFav(id) { return state.favs.includes(id); }
function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) state.favs.splice(i, 1); else state.favs.push(id);
    saveFavs();
}

/* ============================================================
 * 视图路由
 * ============================================================ */
function switchView(name) {
    state.view = name;
    $$('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== name));
    $$('#side-nav .side-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    /* 部分视图在进入时刷新 */
    if (name === 'shelf') {
        const myCards = [...state.custom, ...state.imported];
        renderGrid('#shelf-grid', myCards, '书架上还没有角色卡，去集市挑一位伙伴，或用 Build 制作一张吧！');
        const sc = $('#shelf-count');
        if (sc) sc.textContent = myCards.length;
    }
    if (name === 'fav') renderGrid('#fav-grid', allChars().filter(c => isFav(c.id)), '收藏夹空空如也。点击角色详情里的「♥ 收藏」试试。');
    if (name === 'history') renderHistory();
    $('#main').scrollTop = 0;
    window.scrollTo(0, 0);
}

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

function makeCardEl(char, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card' + (opts.small ? ' small' : '');
    const cover = document.createElement('div');
    cover.className = 'card-cover';
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    PTAvatar.draw(cv, char);
    cover.appendChild(cv);
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
    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `<div class="card-name">${highlight(char.name, searchQ)}</div><div class="card-cat">${highlight(char.title || '', searchQ)} · ${esc(catName(char.category))}</div>`;
    el.appendChild(cover);
    el.appendChild(info);
    el.addEventListener('click', () => openDetail(char.id));
    return el;
}

function renderGrid(sel, chars, emptyText) {
    const grid = $(sel);
    grid.innerHTML = '';
    if (!chars.length) {
        grid.innerHTML = `<div class="empty-tip">${esc(emptyText || '这里空空如也。')}</div>`;
        return;
    }
    chars.forEach(c => grid.appendChild(makeCardEl(c)));
}

function renderMarket() {
    const list = filteredMarket();
    renderGrid('#card-grid', list, '没有匹配的角色卡，换个分类或关键词试试。');
    $('#result-count').textContent = list.length;
    /* 滑卡书架：取前 8 张 */
    const strip = $('#shelf-strip');
    strip.innerHTML = '';
    allChars().filter(c => (c.tags || []).includes('推荐')).slice(0, 8).forEach(c => {
        strip.appendChild(makeCardEl(c, { small: true }));
    });
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
    const favBtn = $('#btn-fav-toggle');
    favBtn.textContent = isFav(id) ? '♥ 已收藏' : '♥ 收藏';
    favBtn.classList.toggle('gold', isFav(id));
    openModal('modal-detail');
}

/* ============================================================
 * 对话引擎
 * ============================================================ */
function openChat(id) {
    const c = findChar(id);
    if (!c) { toast('角色不存在'); return; }
    state.chat = {
        char: c, msgs: [], immersive: state.settings.immersive,
        session: { id: 's_' + Date.now(), charId: c.id, charName: c.name, time: Date.now(), messages: [] },
        fbIdx: 0, favor: 20, mood: 60, events: [],
    };
    $('#chat-char-name').textContent = c.name;
    $('#chat-char-title').textContent = c.title ? c.title + ' · ' + catName(c.category) : catName(c.category);
    PTAvatar.draw($('#chat-avatar'), c);
    $('#chat-log').innerHTML = '';
    $('#immersive-panel').classList.toggle('hidden', !state.chat.immersive);
    updateModeBadge();
    closeModal();
    switchView('chat');
    /* 开场白 */
    pushMessage('char', c.greeting || '……', { save: true, tts: true, instant: false });
    updateImmersive(c.greeting || '');
    /* 确保页面从集市滚动位置回到顶部（输入法/焦点可能引发残留滚动） */
    requestAnimationFrame(() => window.scrollTo(0, 0));
}

function updateModeBadge() {
    const b = $('#chat-mode-badge');
    b.textContent = state.chat.immersive ? '沉浸互动' : '传统聊天';
    $('#immersive-panel').classList.toggle('hidden', !state.chat.immersive);
}

function pushMessage(role, text, opts = {}) {
    const log = $('#chat-log');
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    /* 角色消息带像素小头像 */
    if (role === 'char' && state.chat.char) {
        const av = document.createElement('img');
        av.className = 'msg-avatar';
        av.src = PTAvatar.toDataURL(state.chat.char, 48);
        av.alt = '';
        av.draggable = false;
        wrap.appendChild(av);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const body = document.createElement('div');
    body.className = 'msg-body';
    bubble.appendChild(body);
    bubble.title = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    wrap.appendChild(bubble);
    if (role === 'char') {
        const tools = document.createElement('div');
        tools.className = 'msg-tools';
        const speak = document.createElement('button');
        speak.className = 'px-btn sq tiny'; speak.textContent = '♪'; speak.title = '朗读这条消息';
        speak.addEventListener('click', () => speakText(text));
        tools.appendChild(speak);
        bubble.appendChild(tools);
    }
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;

    const finish = () => {
        if (role === 'char' && opts.tts && state.settings.tts) speakText(text);
    };

    if (opts.instant || !state.settings.typewriter || role !== 'char') {
        body.textContent = text;
        finish();
    } else {
        /* 打字机 */
        let i = 0;
        const timer = setInterval(() => {
            i += 1 + Math.floor(Math.random() * 2);
            body.textContent = text.slice(0, i);
            log.scrollTop = log.scrollHeight;
            if (i >= text.length) { clearInterval(timer); finish(); }
        }, 28);
    }
    if (opts.save && state.chat.session) {
        state.chat.session.messages.push({ role, text, t: Date.now() });
    }
    return body;
}

/* TTS */
function speakText(text) {
    if (!('speechSynthesis' in window)) { toast('浏览器不支持语音'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
    u.lang = 'zh-CN';
    u.rate = 1.05;
    speechSynthesis.speak(u);
}

/* 剧本引擎 */
function scriptReply(char, userText) {
    const s = char.script || { fallbacks: ['……（角色似乎还没有剧本，去 Build 给 ta 写一段吧。）'] };
    const kws = (s.keywords || []);
    for (const [re, reply] of kws) {
        try { if (re.test(userText)) return { text: reply, hit: true }; } catch { /* ignore */ }
    }
    const fb = s.fallbacks || [];
    const text = fb.length ? fb[state.chat.fbIdx % fb.length] : '……';
    state.chat.fbIdx++;
    return { text, hit: false };
}

/* 剧情追踪时间线：当前章节 + 最近 3 条用户行动 */
function renderTrack() {
    const box = $('#imm-track-text');
    if (!box) return;
    const c = state.chat.char;
    const main = (c && c.script && c.script.track) || '—';
    let html = `<div class="tl-item now">${esc(main)}</div>`;
    state.chat.events.slice(-3).reverse().forEach(ev => {
        html += `<div class="tl-item old">${esc(ev)}</div>`;
    });
    box.innerHTML = html;
}

/* 沉浸互动：状态条 / 行动选项 */
function updateImmersive(replyText) {
    const c = state.chat.char;
    if (!c) return;
    const rand = mulberry32(Date.now() % 100000);
    state.chat.mood = Math.max(5, Math.min(100, state.chat.mood + Math.floor(rand() * 14) - 5));
    state.chat.favor = Math.max(0, Math.min(100, state.chat.favor + Math.floor(rand() * 12) + 1));
    $('#bar-mood').style.width = state.chat.mood + '%';
    $('#bar-favor').style.width = state.chat.favor + '%';
    renderTrack();

    /* 行动选项 */
    const optsBox = $('#chat-options');
    optsBox.innerHTML = '';
    const base = ['继续和 ta 聊聊这件事', '换个轻松的话题', '告辞，改日再来'];
    const custom = (c.script && c.script.options) || [];
    const pool = custom.length ? custom : base;
    shuffle(pool).slice(0, 3).forEach(op => {
        const b = document.createElement('button');
        b.className = 'option-chip';
        b.textContent = '▸ ' + op;
        b.addEventListener('click', () => {
            /* 点击反馈：禁用全部选项并高亮所选，直到下一轮刷新 */
            optsBox.querySelectorAll('.option-chip').forEach(x => {
                x.disabled = true;
                x.classList.toggle('chosen', x === b);
            });
            sendUserMessage(op, true);
        });
        optsBox.appendChild(b);
    });
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function sendUserMessage(text, fromOption = false) {
    if (!state.chat.char) return;
    if (!text.trim()) return;
    pushMessage('user', text, { save: true });
    $('#chat-input').value = '';
    const c = state.chat.char;
    /* 思考延迟 */
    const typing = document.createElement('div');
    typing.className = 'msg char typing';
    const tAvatar = PTAvatar.toDataURL(state.chat.char, 48);
    typing.innerHTML = `<img class="msg-avatar" src="${tAvatar}" alt="" draggable="false"><div class="bubble"><div class="msg-body dots"><i></i><i></i><i></i></div></div>`;
    $('#chat-log').appendChild(typing);
    $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
    const delay = 600 + Math.random() * 900;
    setTimeout(() => {
        typing.remove();
        const { text: reply } = scriptReply(c, text);
        pushMessage('char', reply, { save: true, tts: true });
        state.chat.events.push(text);
        updateImmersive(reply);
        persistSession();
    }, delay);
}

function persistSession() {
    if (!state.chat.session) return;
    state.chat.session.time = Date.now();
    const idx = state.history.findIndex(h => h.id === state.chat.session.id);
    if (idx >= 0) state.history[idx] = state.chat.session; else state.history.unshift(state.chat.session);
    saveHistory();
}

/* ============================================================
 * 历史
 * ============================================================ */
function renderHistory() {
    const box = $('#history-list');
    box.innerHTML = '';
    if (!state.history.length) {
        box.innerHTML = '<div class="empty-tip">还没有历史对话。从集市挑一位角色开始冒险吧！</div>';
        return;
    }
    state.history.forEach(h => {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `
            <div class="hist-main">
                <div class="hist-name">${esc(h.charName)}</div>
                <div class="hist-last">${esc((h.messages[h.messages.length - 1] || {}).text || '').slice(0, 60)}</div>
            </div>
            <div class="hist-meta">
                <span>${new Date(h.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span>${h.messages.length} 条</span>
            </div>`;
        const openBtn = document.createElement('button');
        openBtn.className = 'px-btn'; openBtn.textContent = '继续';
        openBtn.addEventListener('click', () => reopenHistory(h.id));
        const delBtn = document.createElement('button');
        delBtn.className = 'px-btn danger'; delBtn.textContent = '删除';
        delBtn.addEventListener('click', () => askConfirm('删除这段对话记录？', () => {
            state.history = state.history.filter(x => x.id !== h.id);
            saveHistory(); renderHistory();
        }));
        const btns = document.createElement('div');
        btns.className = 'hist-btns';
        btns.appendChild(openBtn); btns.appendChild(delBtn);
        row.appendChild(btns);
        box.appendChild(row);
    });
}

function reopenHistory(id) {
    const h = state.history.find(x => x.id === id);
    if (!h) return;
    const c = findChar(h.charId);
    if (!c) { toast('该角色卡已不存在'); return; }
    state.chat = { char: c, msgs: [], immersive: h.immersive === undefined ? state.settings.immersive : !!h.immersive, session: h, fbIdx: 0, favor: 40, mood: 60, events: [] };
    $('#chat-char-name').textContent = c.name;
    $('#chat-char-title').textContent = c.title ? c.title + ' · ' + catName(c.category) : catName(c.category);
    PTAvatar.draw($('#chat-avatar'), c);
    $('#chat-log').innerHTML = '';
    updateModeBadge();
    switchView('chat');
    h.messages.forEach(m => pushMessage(m.role, m.text, { instant: true }));
    updateImmersive('');
}

/* ============================================================
 * Build 角色卡制作
 * ============================================================ */
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
        const card = {
            id: 'custom_' + Date.now(),
            name,
            title: $('#build-title').value.trim() || '酒馆的常客',
            category: $('#build-cat').value,
            seed: Math.floor(Math.random() * 100000),
            tags: ['自制'],
            desc: $('#build-desc').value.trim() || '由像素酒馆 Build 功能亲手制作的角色。',
            greeting: $('#build-greeting').value.trim() || '你好呀，我是' + name + '。很高兴认识你！',
            origin: 'custom',
            palette: { hair: $('#build-hair').value, bg1: $('#build-bg').value, bg2: $('#build-bg').value, skin: '#f2d3b3' },
            script: {
                keywords: [
                    [/你好|嗨|hi|hello/i, '嘿！你来了，正想着你呢。今天过得怎么样？'],
                    [/名字|你是谁/, '我叫' + name + '。' + ($('#build-desc').value.trim() ? '简单说，就是：' + $('#build-desc').value.trim().slice(0, 40) : '一个刚被造出来的新角色。')],
                    [/再见|拜/, '要走啦？记得常来酒馆看我哦！'],
                ],
                fallbacks: [
                    '唔……让我想想。你说的这个，好像挺有意思的！',
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
        $('#build-form').reset();
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
                    card = {
                        id: 'imported_' + Date.now(),
                        name: d.name || file.name.replace(/\.png$/i, ''),
                        title: (d.metadata && d.metadata.nickname) || '导入角色',
                        category: 'custom',
                        seed: Math.floor(Math.random() * 100000),
                        tags: ['导入'],
                        desc: (d.description || '从角色卡 PNG 导入。').slice(0, 300),
                        greeting: (d.first_mes || '……').slice(0, 300),
                        origin: 'imported',
                        palette: { hair: '#b8a8e8', bg1: '#4a4a6b', bg2: '#2a2a42', skin: '#f2d3b3' },
                    };
                }
            } else {
                const text = await file.text();
                const d = JSON.parse(text);
                const dd = d.data || d;
                card = {
                    id: 'imported_' + Date.now(),
                    name: dd.name || '导入角色',
                    title: (dd.metadata && dd.metadata.nickname) || '导入角色',
                    category: 'custom',
                    seed: Math.floor(Math.random() * 100000),
                    tags: ['导入'],
                    desc: (dd.description || '').slice(0, 300) || '从 JSON 导入的角色卡。',
                    greeting: (dd.first_mes || '……').slice(0, 300),
                    origin: 'imported',
                    palette: { hair: '#b8a8e8', bg1: '#4a4a6b', bg2: '#2a2a42', skin: '#f2d3b3' },
                };
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

/* ============================================================
 * 设置
 * ============================================================ */
function applyAccent() {
    document.body.dataset.accent = state.settings.accent;
}
/* 数据导出 / 导入（JSON 备份） */
function initExportImport() {
    const exportBtn = $('#btn-export-data');
    const importBtn = $('#btn-import-data');
    const fileInput = $('#import-data-file');
    if (!exportBtn || !importBtn || !fileInput) return;
    exportBtn.addEventListener('click', () => {
        const payload = {
            app: 'pixel-tavern', version: 1, exportedAt: Date.now(),
            favs: state.favs, history: state.history,
            custom: state.custom, imported: state.imported, settings: state.settings,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'pixel-tavern-data-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        toast('已导出本地数据（' + state.history.length + ' 段对话）');
    });
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (data.app !== 'pixel-tavern') { toast('不是像素酒馆的备份文件'); return; }
            if (Array.isArray(data.favs)) { state.favs = data.favs; saveFavs(); }
            if (Array.isArray(data.history)) { state.history = data.history.slice(0, 30); saveHistory(); }
            if (Array.isArray(data.custom)) { state.custom = data.custom; saveCustom(); }
            if (Array.isArray(data.imported)) { state.imported = data.imported; saveImported(); }
            if (data.settings && typeof data.settings === 'object') {
                state.settings = Object.assign(state.settings, data.settings);
                saveSettings(); applyAccent();
                syncToggle('#set-tts', state.settings.tts);
                syncToggle('#set-typewriter', state.settings.typewriter);
                syncToggle('#set-immersive', state.settings.immersive);
                PTJukebox.setVolume(state.settings.volume / 100);
                const vol = $('#set-volume');
                if (vol) vol.value = state.settings.volume;
            }
            renderTabs(); renderMarket();
            toast('导入完成：' + state.history.length + ' 段对话 / ' + (state.custom.length + state.imported.length) + ' 张卡');
        } catch (err) {
            toast('导入失败：' + err.message);
        }
    });
}

function initSettings() {
    $('#set-volume').value = state.settings.volume;
    PTJukebox.setVolume(state.settings.volume / 100);
    syncToggle('#set-tts', state.settings.tts);
    syncToggle('#set-typewriter', state.settings.typewriter);
    syncToggle('#set-immersive', state.settings.immersive);
    $$('#accent-row .accent-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.accent === state.settings.accent);
        sw.addEventListener('click', () => {
            state.settings.accent = sw.dataset.accent;
            saveSettings(); applyAccent();
            $$('#accent-row .accent-swatch').forEach(x => x.classList.toggle('active', x === sw));
        });
    });
    $('#set-volume').addEventListener('input', (e) => {
        state.settings.volume = Number(e.target.value);
        PTJukebox.setVolume(state.settings.volume / 100);
        saveSettings();
    });
    $('#set-tts').addEventListener('click', () => {
        state.settings.tts = !state.settings.tts;
        syncToggle('#set-tts', state.settings.tts); saveSettings();
    });
    $('#set-typewriter').addEventListener('click', () => {
        state.settings.typewriter = !state.settings.typewriter;
        syncToggle('#set-typewriter', state.settings.typewriter); saveSettings();
    });
    $('#set-immersive').addEventListener('click', () => {
        state.settings.immersive = !state.settings.immersive;
        syncToggle('#set-immersive', state.settings.immersive); saveSettings();
    });
    $('#btn-clear-data').addEventListener('click', () => {
        askConfirm('清除全部本地数据（收藏/历史/自制/设置）？', () => {
            ['settings', 'favs', 'history', 'custom_cards', 'imported_cards', 'welcomed', 'visits'].forEach(k => store.del(k));
            toast('已清除，刷新页面生效');
        });
    });
    $('#btn-clear-history').addEventListener('click', () => {
        askConfirm('清空全部历史对话？', () => { state.history = []; saveHistory(); renderHistory(); });
    });
}
function syncToggle(sel, on) {
    const b = $(sel);
    b.dataset.on = on ? '1' : '0';
    b.textContent = on ? 'ON' : 'OFF';
}

/* ============================================================
 * 事件绑定 & 启动
 * ============================================================ */
/* 同步迷你播放器按钮/动画状态 */
function syncMiniPlayBtn() {
    const playing = PTJukebox.playing;
    $('#btn-mini-play').textContent = playing ? '❚❚' : '▶';
    $('#mini-eq').classList.toggle('on', playing);
}

/* 对话页「回到底部」浮动按钮 */
function initChatBottomBtn() {
    const sc = $('#chat-scroll');
    const btn = $('#btn-chat-bottom');
    if (!sc || !btn) return;
    sc.addEventListener('scroll', () => {
        const far = sc.scrollHeight - sc.scrollTop - sc.clientHeight > 240;
        btn.classList.toggle('hidden', !far);
    }, { passive: true });
    btn.addEventListener('click', () => {
        sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
        btn.classList.add('hidden');
    });
}

function bindEvents() {
    /* ESC 关闭弹窗 */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !$('#overlay').classList.contains('hidden')) closeModal();
    });
    $$('#side-nav .side-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    $('#btn-settings-top').addEventListener('click', () => switchView('settings'));
    $('#btn-classic').addEventListener('click', () => {
        window.open('/?classic=1', '_blank');
    });
    let searchTimer = 0;
    $('#search-input').addEventListener('input', (e) => {
        searchQ = e.target.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderMarket, 140); /* 防抖，避免每键重渲染 */
    });
    $('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay')) closeModal(); });
    $$('.modal-close[data-close]').forEach(b => b.addEventListener('click', closeModal));
    $('#btn-fav-toggle').addEventListener('click', () => {
        const id = state.currentDetail;
        if (!id) return;
        toggleFav(id);
        const c = findChar(id);
        const favBtn = $('#btn-fav-toggle');
        favBtn.textContent = isFav(id) ? '♥ 已收藏' : '♥ 收藏';
        favBtn.classList.toggle('gold', isFav(id));
        toast(isFav(id) ? '已收藏「' + c.name + '」' : '已取消收藏');
        /* 同步刷新当前网格的 ♥ 角标与收藏视图 */
        renderMarket();
        if (state.view === 'fav') switchView('fav');
        if (state.view === 'shelf') switchView('shelf');
    });
    $('#btn-resume-chat').addEventListener('click', () => {
        if (!state._recentSessionId) return;
        closeModal();
        reopenHistory(state._recentSessionId);
    });
    $('#btn-start-chat').addEventListener('click', () => openChat(state.currentDetail));
    $('#btn-open-classic').addEventListener('click', () => {
        window.open('/?classic=1#character_list', '_blank');
        toast('已在新窗口打开经典酒馆，角色卡在左侧列表中');
    });
    /* 聊天 */
    $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendUserMessage($('#chat-input').value); });
    $('#btn-chat-back').addEventListener('click', () => switchView('market'));
    $('#btn-chat-mode').addEventListener('click', () => {
        state.chat.immersive = !state.chat.immersive;
        if (state.chat.session) state.chat.session.immersive = state.chat.immersive;
        updateModeBadge();
        persistSession();
        toast(state.chat.immersive ? '已切换到沉浸互动 BETA' : '已切换到传统聊天');
    });
    $('#btn-chat-tts').addEventListener('click', () => {
        state.settings.tts = !state.settings.tts;
        syncToggle('#set-tts', state.settings.tts); saveSettings();
        toast(state.settings.tts ? '朗读已开启' : '朗读已关闭');
    });
    /* 点唱机 */
    $('#btn-mini-play').addEventListener('click', () => {
        PTJukebox.toggle();
        $('#mini-track-name').textContent = PTJukebox.current.name;
        syncMiniPlayBtn();
    });
    /* 页面不可见时暂停炉火动画与点唱机，切回自动恢复（省电/防后台音频卡顿） */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            PTFire.stop();
            if (PTJukebox.playing) { PTJukebox.pause(); state._jukeResume = true; }
        } else {
            PTFire.start($('#fireplace-canvas'));
            if (state._jukeResume) { PTJukebox.play(); state._jukeResume = false; }
        }
        syncMiniPlayBtn();
    });
    $('#btn-mini-next').addEventListener('click', () => {
        const t = PTJukebox.next(1);
        $('#mini-track-name').textContent = t.name;
        if (!PTJukebox.playing) { $('#btn-mini-play').click(); }
    });
    $('#btn-mini-prev').addEventListener('click', () => {
        const t = PTJukebox.next(-1);
        $('#mini-track-name').textContent = t.name;
        if (!PTJukebox.playing) { $('#btn-mini-play').click(); }
    });
    /* 欢迎 */
    $('#btn-welcome-go').addEventListener('click', () => { closeModal(); switchView('market'); });
    $('#btn-welcome-guide').addEventListener('click', () => { closeModal(); switchView('guide'); });
}

/* 酒馆播报滚动条 */
function initTicker() {
    const el = $('#ticker-text');
    if (!el || !window.PT_NEWS) return;
    const items = [
        PT_NEWS.version + '「' + PT_NEWS.codename + '」现已上线',
        '22 位冒险者已入驻酒馆',
        '沉浸互动 BETA：用行动选项自然推进剧情',
        '像素点唱机：收起面板，音乐不中断',
        'Build 工坊：亲手捏一张专属角色卡',
        '经典酒馆：顶栏一键回到原版 SillyTavern',
    ];
    const half = items.join('　◆　') + '　◆　';
    el.innerHTML = esc(half + half); /* 双份内容实现无缝循环 */
}

/* 访问计数 */
function bumpVisits() {
    const visits = store.get('visits', 0) + 1;
    store.set('visits', visits);
    const base = 86315;
    let n = base + visits;
    const el = $('#visit-count');
    /* 数字滚动 */
    let cur = base;
    const step = () => {
        cur += Math.ceil((n - cur) / 8);
        if (cur >= n) { el.textContent = n.toLocaleString(); return; }
        el.textContent = cur.toLocaleString();
        requestAnimationFrame(step);
    };
    step();
    $('#online-count').textContent = 3 + Math.floor(Math.random() * 9);
}

/* 启动序列 */
function boot() {
    /* Logo 与图标 */
    drawTavernLogo($('#logo-canvas'));
    drawTavernLogo($('#boot-logo'));
    renderPixelIcons();
    applyAccent();
    initTicker();
    bumpVisits();

    /* 启动画面进度 */
    const tips = ['正在点燃炉火…', '正在擦拭酒杯…', '正在翻阅冒险者名册…', '酒馆开门迎客！'];
    let tipIdx = 0;
    const tipTimer = setInterval(() => { tipIdx = (tipIdx + 1) % tips.length; $('#boot-tip').textContent = tips[tipIdx]; }, 420);
    const fill = $('#boot-bar-fill');
    let p = 0;
    const prog = setInterval(() => {
        p += 8 + Math.random() * 16;
        fill.style.width = Math.min(100, p) + '%';
        if (p >= 100) {
            clearInterval(prog); clearInterval(tipTimer);
            setTimeout(() => {
                $('#boot').classList.add('done');
                setTimeout(() => $('#boot').remove(), 600);
                if (!store.get('welcomed', false)) {
                    store.set('welcomed', true);
                    openModal('modal-welcome');
                }
            }, 250);
        }
    }, 110);

    renderTabs();
    renderMarket();
    initBuild();
    initImport();
    initSettings();
    initExportImport();
    initChatBottomBtn();
    bindEvents();
    PTFire.start($('#fireplace-canvas'));
    switchView('market');
}

document.addEventListener('DOMContentLoaded', boot);
