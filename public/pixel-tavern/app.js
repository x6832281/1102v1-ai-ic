/* ============================================================
 * 游戏酒馆 · 主逻辑
 * 视图路由 / 角色卡集市 / 书架 / 收藏 / 历史 / Build / 对话引擎
 * 沉浸互动 BETA / TTS / 导入导出 / 设置
 * ============================================================ */
'use strict';

/* 跨文件全局（由 data.js / avatars.js / jukebox.js 以 window.* 导出） */
/* global PT_CHARACTERS, PT_NEWS, PTAvatar, PTJukebox, PTFire, drawTavernLogo, renderPixelIcons, drawLantern, catName, PTChatAI */
/* global openChat, pushMessage, updateImmersive, updateModeBadge, sendUserMessage, persistSession, doExportChat */
/* global renderGrid, renderMarket, renderTabs, initBuild, initImport, resetBuildForm, buildCardPng, buildCardPayload, initMarketSearch */

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
    settings: Object.assign({ volume: 40, tts: false, typewriter: true, immersive: true, accent: 'gold', chatFont: 'm', skin: 'clean', aiEnabled: true, aiApi: { base: '', key: '', model: '' } }, store.get('settings', {})),
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
    const wrap = $('#toast-wrap');
    while (wrap.children.length >= 3) wrap.firstElementChild.remove(); /* 队列上限 */
    wrap.appendChild(box);
    setTimeout(() => { box.classList.add('out'); setTimeout(() => box.remove(), 400); }, ms);
}
let _lastFocus = null;
function openModal(id) {
    _lastFocus = document.activeElement;
    $('#overlay').classList.remove('hidden');
    $$('.modal-window').forEach(m => m.classList.add('hidden'));
    if (id) {
        $('#' + id).classList.remove('hidden');
        /* 焦点入弹窗：优先主按钮，其次关闭钮 */
        const w = $('#' + id);
        const target = w.querySelector('.px-btn.gold') || w.querySelector('.px-btn') || w;
        if (target.focus) target.focus();
    }
}
function closeModal() {
    $('#overlay').classList.add('hidden');
    $$('.modal-window').forEach(m => m.classList.add('hidden'));
    if (_lastFocus && _lastFocus.focus) { try { _lastFocus.focus(); } catch { /* ignore */ } }
    _lastFocus = null;
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
    document.body.dataset.activeView = name;
    $$('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== name));
    $$('#side-nav .side-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.mob-nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
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
 * 历史
 * ============================================================ */
/* 会话纪要筛选（瞬时态，不入库） */
let histQuery = '';
let histChip = '';

function renderHistory() {
    const box = $('#history-list');
    box.innerHTML = '';
    /* 统计条 */
    const stats = $('#hist-stats');
    if (stats) {
        const totalMsgs = state.history.reduce((s, h) => s + (h.messages ? h.messages.length : 0), 0);
        const chars = new Set(state.history.map(h => h.charId)).size;
        const words = state.history.reduce((s, h) => s + (h.messages || []).reduce((a, m) => a + (m.role === 'user' ? (m.text || '').length : 0), 0), 0);
        stats.innerHTML = `共 <b>${state.history.length}</b> 段对话 · <b>${totalMsgs}</b> 条消息 · 与 <b>${chars}</b> 位角色互动 · 你输出了 <b>${words}</b> 字`;
    }
    if (!state.history.length) {
        /* 无会话时同样清空筛选控件状态 */
        const chips = $('#hist-chips');
        if (chips) chips.innerHTML = '';
        box.innerHTML = '<div class="empty-tip"><canvas class="empty-art" width="128" height="112"></canvas>还没有历史对话。从集市挑一位角色开始冒险吧！</div>';
        const art = box.querySelector('.empty-art');
        if (art) drawLantern(art);
        return;
    }
    /* 筛选 chips：按会话中出现过的角色聚合（R15） */
    const chipsBox = $('#hist-chips');
    if (chipsBox) {
        const seen = new Map();
        state.history.forEach(h => { if (!seen.has(h.charId)) seen.set(h.charId, h.charName || '未知'); });
        chipsBox.innerHTML = `<button type="button" class="hist-chip${histChip === '' ? ' active' : ''}" data-id="">全部 ${state.history.length}</button>` +
            [...seen.entries()].map(([id, name]) =>
                `<button type="button" class="hist-chip${histChip === id ? ' active' : ''}" data-id="${esc(id)}">${esc(name)}</button>`
            ).join('');
        chipsBox.querySelectorAll('.hist-chip').forEach(b => b.addEventListener('click', () => {
            histChip = b.dataset.id || '';
            renderHistory();
        }));
    }
    /* 过滤：角色 chip + 实时关键词（角色名与会话全文） */
    const q = histQuery.trim().toLowerCase();
    const list = state.history.filter(h => {
        if (histChip && h.charId !== histChip) return false;
        if (!q) return true;
        return (h.charName || '').toLowerCase().includes(q)
            || (h.messages || []).some(m => (m.text || '').toLowerCase().includes(q));
    });
    if (!list.length) {
        box.innerHTML = '<div class="empty-tip">没有匹配的会话——换个关键词，或点「全部」复位。</div>';
        return;
    }
    list.forEach(h => {
        const row = document.createElement('div');
        row.className = 'history-row';
        const char = findChar(h.charId);
        /* 头像在 HTML 之后前置插入（innerHTML += 会抹掉先前 appendChild 的节点） */
        row.innerHTML = `
            <div class="hist-main">
                <div class="hist-name">${esc(h.charName)}</div>
                <div class="hist-last">${esc((h.messages[h.messages.length - 1] || {}).text || '').slice(0, 60)}</div>
            </div>
            <div class="hist-meta">
                <span>${new Date(h.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span>${h.messages.length} 条</span>
            </div>`;
        if (char) {
            const av = document.createElement('img');
            av.className = 'hist-avatar';
            av.src = PTAvatar.toDataURL(char, 64);
            av.alt = '';
            av.draggable = false;
            row.prepend(av);
        } else {
            /* 孤儿会话（角色已被移除/旧世代数据）：首字占位头像兜底 */
            const fb = document.createElement('span');
            fb.className = 'hist-avatar fallback';
            fb.textContent = (h.charName || '？').slice(0, 1);
            fb.setAttribute('aria-hidden', 'true');
            row.prepend(fb);
        }
        const openBtn = document.createElement('button');
        openBtn.className = 'px-btn'; openBtn.textContent = '继续';
        openBtn.addEventListener('click', () => reopenHistory(h.id));
        const expBtn = document.createElement('button');
        expBtn.className = 'px-btn'; expBtn.textContent = '⬇'; expBtn.title = '导出这段对话（Markdown）';
        expBtn.addEventListener('click', () => {
            const lines = ['# 与 ' + (h.charName || '角色') + ' 的对话', '', '- 时间：' + new Date(h.time).toLocaleString('zh-CN'), '- 消息数：' + h.messages.length, ''];
            (h.messages || []).forEach(msg => {
                lines.push((msg.role === 'user' ? '**你**：' : '**' + (h.charName || '角色') + '**：') + (msg.text || ''));
                lines.push('');
            });
            const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'echo-' + (h.charName || 'chat') + '-' + new Date(h.time).toISOString().slice(0, 10) + '.md';
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 3000);
            toast('已导出这段对话（Markdown）');
        });
        const delBtn = document.createElement('button');
        delBtn.className = 'px-btn danger'; delBtn.textContent = '删除';
        delBtn.addEventListener('click', () => askConfirm('删除这段对话记录？', () => {
            state.history = state.history.filter(x => x.id !== h.id);
            saveHistory(); renderHistory();
        }));
        const btns = document.createElement('div');
        btns.className = 'hist-btns';
        btns.appendChild(openBtn); btns.appendChild(expBtn); btns.appendChild(delBtn);
        row.appendChild(btns);
        box.appendChild(row);
    });
}

/* 纪要实时筛选输入（一次性绑定，输入即时重渲染） */
(function initHistSearch() {
    const inp = $('#hist-search');
    if (inp) inp.addEventListener('input', () => { histQuery = inp.value; renderHistory(); });
})();

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
 * 设置
 * ============================================================ */
function applyAccent() {
    document.body.dataset.accent = state.settings.accent;
    document.body.dataset.chatfont = state.settings.chatFont || 'm';
    /* 界面风格：clean（默认，现代清晰）/ pixel（复古像素） */
    document.body.dataset.skin = state.settings.skin === 'pixel' ? 'pixel' : 'clean';
}
/* 数据导出 / 导入（JSON 备份） */
function initExportImport() {
    const exportBtn = $('#btn-export-data');
    const importBtn = $('#btn-import-data');
    const fileInput = $('#import-data-file');
    if (!exportBtn || !importBtn || !fileInput) return;
    exportBtn.addEventListener('click', () => {
        const payload = {
            app: 'echocraft', version: 2, exportedAt: Date.now(),
            favs: state.favs, history: state.history,
            custom: state.custom, imported: state.imported, settings: state.settings,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'echocraft-data-' + new Date().toISOString().slice(0, 10) + '.json';
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
            if (data.app !== 'echocraft' && data.app !== 'pixel-tavern') { toast('请选择有效的备份文件'); return; }
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
    /* 对话字号 */
    const syncFontBtns = () => $$('#font-row .font-btn').forEach(fb => fb.classList.toggle('active', fb.dataset.font === state.settings.chatFont));    $$('#font-row .font-btn').forEach(fb => fb.addEventListener('click', () => {
        state.settings.chatFont = fb.dataset.font;
        saveSettings(); applyAccent(); syncFontBtns();
    }));
    syncFontBtns();
    /* 界面风格切换（清晰 / 复古像素） */
    const syncSkinBtns = () => $$('#skin-row .font-btn').forEach(sb => sb.classList.toggle('active', sb.dataset.skin === (state.settings.skin === 'pixel' ? 'pixel' : 'clean')));
    $$('#skin-row .font-btn').forEach(sb => sb.addEventListener('click', () => {
        state.settings.skin = sb.dataset.skin;
        saveSettings(); applyAccent(); syncSkinBtns();
    }));
    syncSkinBtns();
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
    /* 模型接入（真实大模型 / BYOK） */
    syncToggle('#set-ai', state.settings.aiEnabled !== false);
    $('#set-ai').addEventListener('click', () => {
        const on = state.settings.aiEnabled === false;
        state.settings.aiEnabled = on;
        syncToggle('#set-ai', on); saveSettings(); renderAIStatus();
    });
    const aiCfg = () => (state.settings.aiApi = state.settings.aiApi || { base: '', key: '', model: '' });
    $('#ai-base').value = aiCfg().base || '';
    $('#ai-key').value = aiCfg().key || '';
    $('#ai-model').value = aiCfg().model || '';
    $('#btn-ai-save').addEventListener('click', () => {
        aiCfg().base = $('#ai-base').value.trim();
        aiCfg().key = $('#ai-key').value.trim();
        aiCfg().model = $('#ai-model').value.trim();
        saveSettings(); renderAIStatus();
        toast('接入点已保存（仅存于本机）');
    });
    $('#btn-ai-test').addEventListener('click', async () => {
        const base = $('#ai-base').value.trim();
        const key = $('#ai-key').value.trim();
        const model = $('#ai-model').value.trim();
        if (!base || !key) { toast('请先填写 Base URL 与 API Key'); return; }
        const btn = $('#btn-ai-test');
        btn.disabled = true; btn.textContent = '测试中…';
        try {
            const headers = { 'Content-Type': 'application/json' };
            const csrf = window.PTChatAI && PTChatAI.csrf();
            if (csrf) headers['X-CSRF-Token'] = csrf;
            const r = await fetch('/api/pixel/probe', {
                method: 'POST', headers,
                body: JSON.stringify({ base_url: base, api_key: key, model: model || 'gpt-4o-mini' }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.ok) toast('✓ 连接成功'); else toast('✗ ' + (j.error || ('HTTP ' + r.status)));
        } catch { toast('✗ 网络错误'); }
        btn.disabled = false; btn.textContent = '测试连接';
    });
    $('#btn-ai-clear').addEventListener('click', () => {
        state.settings.aiApi = { base: '', key: '', model: '' };
        $('#ai-base').value = ''; $('#ai-key').value = ''; $('#ai-model').value = '';
        saveSettings(); renderAIStatus();
        toast('已清除接入点');
    });
    document.addEventListener('pt-ai-status', renderAIStatus);
    renderAIStatus();
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

/* 设置页「模型接入」状态行 */
function renderAIStatus() {
    const el = $('#ai-status');
    if (!el) return;
    const cfg = state.settings.aiApi || {};
    if (cfg.base && cfg.key) {
        el.textContent = '✓ 自用接入点：' + cfg.base.replace(/^https?:\/\//, '').slice(0, 42);
        el.className = 'ai-status ok';
        return;
    }
    if (window.PTChatAI && PTChatAI.status) {
        if (PTChatAI.status.ai) {
            el.textContent = '✓ 站点共享模型：' + PTChatAI.status.model;
            el.className = 'ai-status ok';
        } else {
            el.textContent = '未接入模型 · 使用剧本引擎';
            el.className = 'ai-status warn';
        }
        return;
    }
    el.textContent = '正在探测…';
}

/* ============================================================
 * 事件绑定 & 启动
 * ============================================================ */
/* 同步迷你播放器按钮/动画状态 */
function syncMiniPlayBtn() {
    const playing = PTJukebox.playing;
    $('#btn-mini-play').textContent = playing ? '❚❚' : '▶';
    const eq = document.getElementById('mini-eq');
    if (eq) eq.classList.toggle('on', playing);
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
    /* ESC 关闭弹窗/抽屉；`/` 聚焦搜索（集市视图） */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!$('#overlay').classList.contains('hidden')) { closeModal(); return; }
            const sb = $('#sidebar');
            if (sb.classList.contains('open')) { closeDrawer(); return; }
            if (state.view === 'chat') { document.querySelector('#btn-chat-back').click(); }
        }
        if (e.key === '/' && state.view === 'market' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
            e.preventDefault();
            $('#search-input').focus();
        }
    });
    /* 移动端侧栏抽屉 */
    const closeDrawer = () => {
        $('#sidebar').classList.remove('open');
        $('#drawer-backdrop').classList.add('hidden');
    };
    $('#btn-drawer').addEventListener('click', (e) => {
        e.stopPropagation();
        const open = $('#sidebar').classList.toggle('open');
        $('#drawer-backdrop').classList.toggle('hidden', !open);
    });
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('click', (e) => {
        const sb = $('#sidebar');
        if (sb.classList.contains('open') && !sb.contains(e.target) && e.target !== $('#btn-drawer')) {
            closeDrawer();
        }
    });
    $$('#side-nav .side-item').forEach(b => b.addEventListener('click', () => {
        switchView(b.dataset.view);
        closeDrawer();
    }));
    $$('.mob-nav-item').forEach(b => b.addEventListener('click', () => {
        switchView(b.dataset.view);
    }));
    $('#btn-settings-top').addEventListener('click', () => switchView('settings'));
    $('#btn-classic').addEventListener('click', () => {
        window.open('/?classic=1', '_blank');
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
    $('#btn-delete-card').addEventListener('click', () => {
        const id = state.currentDetail;
        if (!id) return;
        askConfirm('删除这张角色卡？其历史对话将保留在历史页。', () => {
            state.custom = state.custom.filter(c => c.id !== id);
            state.imported = state.imported.filter(c => c.id !== id);
            saveCustom(); saveImported();
            if (state._editingCardId === id) resetBuildForm();
            closeModal();
            renderTabs(); renderMarket();
            if (state.view === 'shelf') switchView('shelf');
            if (state.view === 'fav') switchView('fav');
            toast('角色卡已删除');
        });
    });
    $('#btn-edit-card').addEventListener('click', () => {
        const id = state.currentDetail;
        const c = findChar(id);
        if (!c || c.origin !== 'custom') return;
        closeModal();
        switchView('build');
        state._editingCardId = id;
        $('#build-name').value = c.name;
        $('#build-title').value = c.title || '';
        $('#build-cat').value = c.category;
        $('#build-greeting').value = c.greeting || '';
        $('#build-desc').value = c.desc || '';
        $('#build-lore').value = (c.lore || []).map(e => [e.keys, e.title, e.text].join(' | ')).join('\n');
        $('#build-hair').value = (c.palette && c.palette.hair) || '#e8c97a';
        $('#build-bg').value = (c.palette && c.palette.bg1) || '#3a5a40';
        $('#build-name').dispatchEvent(new Event('input'));
        $('#build-editing').classList.remove('hidden');
        $('#build-editing-name').textContent = c.name;
        $('#btn-build-submit').textContent = '✓ 保存修改';
    });
    $('#btn-build-cancel').addEventListener('click', () => resetBuildForm());
    $('#btn-export-card').addEventListener('click', () => {
        const c = findChar(state.currentDetail);
        if (!c) return;
        const payload = buildCardPayload(c);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${c.name}-角色卡.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        toast('角色卡 JSON 已导出');
    });
    $('#btn-export-png').addEventListener('click', async () => {
        const c = findChar(state.currentDetail);
        if (!c) return;
        try {
            const payload = buildCardPayload(c);
            const cardBuf = await buildCardPng(c, JSON.stringify(payload));
            const blob = new Blob([cardBuf], { type: 'image/png' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${c.name}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            toast('PNG 角色卡已导出（可导入任何 SillyTavern）');
        } catch (err) { toast('导出失败：' + err.message); }
    });
    $('#btn-longimage-download').addEventListener('click', () => {
        const pending = state._pendingPng;
        if (!pending) { toast('预览已失效，请重新导出'); closeModal(); return; }
        pending.cv.toBlob((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `对话-${pending.name}-${new Date().toISOString().slice(0, 10)}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            toast('对话长图已导出（' + (state.chat.session ? state.chat.session.messages.length : 0) + ' 条）');
        }, 'image/png');
        closeModal();
    });
    $('#btn-greet-cycle').addEventListener('click', () => {
        const list = state._greetList || [];
        if (list.length < 2) return;
        state._greetIdx = (state._greetIdx + 1) % list.length;
        $('#detail-greet').textContent = '「' + list[state._greetIdx] + '」';
        toast('开场白 ' + (state._greetIdx + 1) + '/' + list.length);
    });
    $('#btn-start-chat').addEventListener('click', () => openChat(state.currentDetail, state._greetList ? state._greetList[state._greetIdx] : undefined));
    $('#btn-open-classic').addEventListener('click', () => {
        window.open('/?classic=1#character_list', '_blank');
        toast('已在新窗口打开经典核心，可在角色列表中查阅');
    });
    /* 聊天：多行输入（Enter 发送 / Shift+Enter 换行 + 自适应增高） */
    const chatInput = $('#chat-input');
    const growInput = () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    };
    chatInput.addEventListener('input', growInput);
    const countEl = document.querySelector('#chat-count');
    const syncCount = () => {
        if (!countEl) return;
        const n = chatInput.value.length;
        countEl.textContent = n + '/300';
        countEl.classList.toggle('limit', n >= 280);
    };
    chatInput.addEventListener('input', syncCount);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            $('#chat-form').requestSubmit();
        }
    });
    $('#chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        sendUserMessage(chatInput.value);
        chatInput.style.height = '';
        if (countEl) { countEl.textContent = '0/300'; countEl.classList.remove('limit'); }
    });
    $('#btn-chat-back').addEventListener('click', () => switchView('market'));
    $('#btn-random-chat').addEventListener('click', () => {
        const pool = allChars().filter(c => c.greeting);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        openChat(pick.id);
        toast('随机遇见「' + pick.name + '」');
    });
    $('#btn-chat-export').addEventListener('click', (e) => {
        e.stopPropagation();
        $('#export-menu').classList.toggle('hidden');
    });
    $$('#export-menu button').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        $('#export-menu').classList.add('hidden');
        doExportChat(b.dataset.fmt);
    }));
    document.addEventListener('click', (e) => {
        const menu = $('#export-menu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== $('#btn-chat-export')) {
            menu.classList.add('hidden');
        }
    });
    $('#imm-collapse-btn').addEventListener('click', () => {
        const panel = $('#immersive-panel');
        const collapsed = panel.classList.toggle('imm-collapsed');
        $('#imm-collapse-btn').textContent = collapsed ? '展开状态' : '收起状态';
    });
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

/* 纪事简讯滚动条 */
function initTicker() {
    const el = $('#ticker-text');
    if (!el || !window.PT_NEWS) return;
    const items = [
        PT_NEWS.version + '「' + PT_NEWS.codename + '」全新蜕变上线',
        '真实大模型接入：偏好设置 → 模型接入，即刻流式生成',
        '沉浸分支交互：通过决策选项自然推进剧情走向',
        '环境音律舱：纯净背景白噪音，专注更深层次叙事',
        '创作者工坊：自制角色档案，随建随聊',
        '底层核心：顶栏一键直通原生 SillyTavern 引擎',
    ];
    const half = items.join('　◆　') + '　◆　';
    el.innerHTML = esc(half + half); /* 双份内容实现无缝循环 */
}

/* 访问计数：优先服务器全站计数，服务器不可达时回退本地计数 */
function bumpVisits() {
    const el = $('#visit-count');
    const animateTo = (n) => {
        n = Math.max(0, Math.floor(n));
        let cur = 0;
        const step = () => {
            cur += Math.ceil((n - cur) / 8) || 1;
            if (cur >= n) { el.textContent = n.toLocaleString(); return; }
            el.textContent = cur.toLocaleString();
            requestAnimationFrame(step);
        };
        if (n === 0) { el.textContent = '0'; return; }
        step();
    };
    const localCount = () => {
        const visits = store.get('visits', 0) + 1;
        store.set('visits', visits);
        return visits;
    };
    fetch('/api/pixel/visit', { method: 'POST' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
        .then(j => animateTo(Number.isFinite(j && j.visits) ? j.visits : localCount()))
        .catch(() => animateTo(localCount()));
    $('#online-count').textContent = 3 + Math.floor(Math.random() * 9);
}

/* 启动序列 */
function boot() {
    /* 兜底超时安全机制：无论发生何种情况，至多 2.5 秒后必须强行移除启动画面 */
    const forceDismiss = setTimeout(() => {
        const b = document.getElementById('boot');
        if (b && !b.classList.contains('done')) {
            b.classList.add('done');
            setTimeout(() => { if (b.parentNode) b.remove(); }, 400);
        }
    }, 2500);

    /* Logo 与图标 */
    document.body.dataset.activeView = state.view || 'market';
    try { if ($('#logo-canvas')) drawTavernLogo($('#logo-canvas')); } catch (e) { console.warn(e); }
    try { if ($('#boot-logo')) drawTavernLogo($('#boot-logo')); } catch (e) { console.warn(e); }
    try { if (typeof renderPixelIcons === 'function') renderPixelIcons(); } catch (e) { console.warn(e); }
    try { applyAccent(); } catch (e) { console.warn(e); }
    try { initTicker(); } catch (e) { console.warn(e); }
    try { bumpVisits(); } catch (e) { console.warn(e); }
    try { if (window.PTChatAI) PTChatAI.refresh(); } catch (e) { console.warn(e); }

    /* 静态托管（Vercel）下门户位于 /pixel-tavern：地址栏美化回根路径 */
    if (location.pathname === '/pixel-tavern' || location.pathname === '/pixel-tavern/') {
        try { history.replaceState(null, '', '/'); } catch { /* ignore */ }
    }
    /* canonical 随部署域名自动更新 */
    const canon = document.getElementById('pt-canonical');
    if (canon) canon.href = location.origin + '/';

    /* 启动画面进度 */
    const tips = ['正在连接共鸣波谱…', '正在校准星轨频率…', '正在载入角色档案…', '幻境回声准备就绪！'];
    let tipIdx = 0;
    const tipTimer = setInterval(() => {
        tipIdx = (tipIdx + 1) % tips.length;
        const tipEl = $('#boot-tip');
        if (tipEl) tipEl.textContent = tips[tipIdx];
    }, 380);

    const fill = $('#boot-bar-fill');
    let p = 0;
    const prog = setInterval(() => {
        p += 14 + Math.random() * 20;
        if (fill) fill.style.width = Math.min(100, p) + '%';
        if (p >= 100) {
            clearInterval(prog);
            clearInterval(tipTimer);
            clearTimeout(forceDismiss);
            setTimeout(() => {
                const b = $('#boot');
                if (b) {
                    b.classList.add('done');
                    setTimeout(() => { if (b.parentNode) b.remove(); }, 500);
                }
                if (!store.get('welcomed', false)) {
                    store.set('welcomed', true);
                    openModal('modal-welcome');
                }
            }, 180);
        }
    }, 60);

    try { renderTabs(); } catch (e) { console.warn(e); }
    try { renderMarket(); } catch (e) { console.warn(e); }
    try { initBuild(); } catch (e) { console.warn(e); }
    try { initImport(); } catch (e) { console.warn(e); }
    try { initSettings(); } catch (e) { console.warn(e); }
    try { initExportImport(); } catch (e) { console.warn(e); }
    try { initMarketSearch(); } catch (e) { console.warn(e); }
    try { initChatBottomBtn(); } catch (e) { console.warn(e); }
    try { bindEvents(); } catch (e) { console.warn(e); }
    try { if ($('#fireplace-canvas')) PTFire.start($('#fireplace-canvas')); } catch (e) { console.warn(e); }
    try { switchView('market'); } catch (e) { console.warn(e); }
}

/* 全局错误兜底：console 留痕 + 用户侧像素 toast */
window.addEventListener('error', (e) => {
    console.error('[PixelTavern]', e.message);
    try { toast('出了点小状况：' + e.message, 4000); } catch { /* boot 前忽略 */ }
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[PixelTavern] unhandled rejection:', e.reason);
});

document.addEventListener('DOMContentLoaded', boot);
