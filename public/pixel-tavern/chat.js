/* ============================================================
 * 像素酒馆 · 对话引擎模块
 * 气泡/打字机/剧本/沉浸互动/导出/PNG 长图 + 真实大模型流式接入
 * （依赖 app.js 的 state/store/$/esc 等全局，均为运行时引用）
 * ============================================================ */
'use strict';

/* global state, PTAvatar, mulberry32, esc, toast, openModal, closeModal, findChar, catName, switchView, openDetail, saveHistory */
/* 模块导出：openChat / doExportChat 由 app.js 在运行时调用 */


/* ============================================================
 * AI 模型接入（V1.3「明炉真火」）
 * 优先站点共享模型（服务端配置 PIXEL_LLM_*），或用户自配
 * OpenAI 兼容接入点（BYOK，Key 仅存于浏览器 localStorage）。
 * 连接失败或未接入时自动回退本地剧本引擎。
 * ============================================================ */
const PT_AI = { csrf: null, status: null };

async function fetchAIStatus() {
    try {
        const r = await fetch('/csrf-token', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); PT_AI.csrf = j.token; }
    } catch { PT_AI.csrf = null; }
    try {
        const r = await fetch('/api/pixel/status', { cache: 'no-store' });
        PT_AI.status = r.ok ? await r.json() : null;
    } catch { PT_AI.status = null; }
    document.dispatchEvent(new CustomEvent('pt-ai-status'));
    return PT_AI.status;
}

function byokCfg() {
    return state.settings.aiApi || { base: '', key: '', model: '' };
}

function aiReady() {
    if (state.settings.aiEnabled === false) return false;
    const cfg = byokCfg();
    return Boolean((PT_AI.status && PT_AI.status.ai) || (cfg.base && cfg.key));
}

function buildAIMessages(char) {
    const sys = [
        '你是「' + char.name + '」——像素酒馆在线角色扮演中的角色。',
        char.title ? '角色定位：' + char.title + '。' : '',
        char.desc ? '角色设定：' + char.desc : '',
        '风格要求：全程用中文；保持角色扮演不出戏，不要提及你是 AI 或模型；动作用（…）表示，台词用「…」，偶尔用*轻动作*；每次回复控制在 50~200 字；根据用户的输入自然推进剧情，可以主动制造小事件或提问。',
    ].filter(Boolean).join('\n');
    const msgs = [{ role: 'system', content: sys }];
    const hist = (state.chat.session && state.chat.session.messages) || [];
    for (const m of hist.slice(-24)) {
        if (m.role === 'user') msgs.push({ role: 'user', content: m.text });
        else if (m.role === 'char') msgs.push({ role: 'assistant', content: m.text });
    }
    return msgs;
}

async function aiStreamReply(char, typingEl) {
    const bodyEl = typingEl.querySelector('.msg-body');
    const cfg = byokCfg();
    const useByok = Boolean(cfg.base && cfg.key);
    const headers = { 'Content-Type': 'application/json' };
    if (PT_AI.csrf && PT_AI.csrf !== 'disabled') headers['X-CSRF-Token'] = PT_AI.csrf;
    if (useByok) {
        headers['X-PT-Base-Url'] = cfg.base;
        headers['X-PT-Api-Key'] = cfg.key;
        if (cfg.model) headers['X-PT-Model'] = cfg.model;
    }
    const res = await fetch('/api/pixel/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: buildAIMessages(char), temperature: 0.9, max_tokens: 700 }),
    });
    if (!res.ok) {
        let msg = '模型连接失败（' + res.status + '）';
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* ignore */ }
        throw new Error(msg);
    }
    /* 流式渲染：把思考气泡变成逐步生长的正文 */
    bodyEl.classList.remove('dots');
    bodyEl.innerHTML = '';
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '', full = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
                const j = JSON.parse(data);
                const delta = (j.choices && j.choices[0] && (j.choices[0].delta?.content || j.choices[0].message?.content)) || '';
                if (delta) {
                    full += delta;
                    bodyEl.textContent = full;
                    const log = $('#chat-log');
                    if (log) log.scrollTop = log.scrollHeight;
                }
            } catch { /* 半包或心跳，忽略 */ }
        }
    }
    if (!full.trim()) throw new Error('模型返回了空回复');
    return full.trim();
}


/* ============================================================
 * 对话引擎
 * ============================================================ */
function openChat(id, greetOverride) {
    const c = findChar(id);
    if (!c) { toast('角色不存在'); return; }
    /* 轮换开场白：详情预览的选择优先，否则随机（含 alternate greetings） */
    const greetPool = [c.greeting, ...(c.alts || [])];
    const greet = greetOverride || greetPool[Math.floor(Math.random() * greetPool.length)];
    state.chat = {
        char: c, msgs: [], immersive: state.settings.immersive,
        session: { id: 's_' + Date.now(), charId: c.id, charName: c.name, time: Date.now(), messages: [] },
        fbIdx: 0, favor: 20, mood: 60, events: [], aiBusy: false,
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
    pushMessage('char', greet || '……', { save: true, tts: true, instant: false });
    updateImmersive(greet || '');
    /* 确保页面从集市滚动位置回到顶部（输入法/焦点可能引发残留滚动） */
    requestAnimationFrame(() => window.scrollTo(0, 0));
}

function updateModeBadge() {
    const b = $('#chat-mode-badge');
    b.textContent = state.chat.immersive ? '沉浸互动' : '传统聊天';
    $('#immersive-panel').classList.toggle('hidden', !state.chat.immersive);
    /* 窄屏默认收起状态条（只留行动选项） */
    $('#immersive-panel').classList.toggle('imm-collapsed', window.innerWidth <= 640);
    const cb = $('#imm-collapse-btn');
    if (cb) cb.textContent = window.innerWidth <= 640 ? '展开状态' : '收起状态';
}

/* 富文本气泡：动作旁白（……）淡色斜体，台词「…」金色，**加粗**、*斜体*（Markdown 子集）。
   先转义再包裹，防注入 */
function richText(text) {
    let s = esc(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    s = s.replace(/（([^）]*)）/g, '<span class="act">（$1）</span>');
    s = s.replace(/「([^」]*)」/g, '<span class="quote">「$1」</span>');
    return s;
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
    /* 角色名签（点击查看详情） */
    if (role === 'char' && state.chat.char) {
        const nameTag = document.createElement('div');
        nameTag.className = 'msg-name';
        nameTag.textContent = state.chat.char.name;
        nameTag.title = '查看角色详情';
        nameTag.addEventListener('click', () => openDetail(state.chat.char.id));
        bubble.insertBefore(nameTag, body);
    }
    wrap.appendChild(bubble);
    const tools = document.createElement('div');
    tools.className = 'msg-tools';
    const copy = document.createElement('button');
    copy.className = 'px-btn sq tiny'; copy.textContent = '⧉'; copy.title = '复制这条消息';
    copy.addEventListener('click', () => {
        copyText(text).then(() => {
            toast('已复制');
            copy.textContent = '✓';
            copy.style.color = 'var(--green)';
            setTimeout(() => { copy.textContent = '⧉'; copy.style.color = ''; }, 900);
        }).catch(() => toast('复制失败'));
    });
    tools.appendChild(copy);
    if (role === 'char') {
        const speak = document.createElement('button');
        speak.className = 'px-btn sq tiny'; speak.textContent = '♪'; speak.title = '朗读这条消息';
        speak.addEventListener('click', () => speakText(text));
        tools.appendChild(speak);
    }
    bubble.appendChild(tools);
    log.appendChild(wrap);
    /* 长对话保护：DOM 消息超过上限时折叠最早的节点（可点击展开） */
    const MAX_DOM_MSGS = 300;
    const msgEls = log.querySelectorAll(':scope > .msg');
    if (msgEls.length > MAX_DOM_MSGS) {
        const excess = Array.prototype.slice.call(msgEls, 0, msgEls.length - MAX_DOM_MSGS);
        excess.forEach(el => el.remove());
        log.__foldedMsgs = (log.__foldedMsgs || []).concat(excess);
        let fold = log.querySelector('.msg-fold');
        if (!fold) {
            fold = document.createElement('button');
            fold.type = 'button';
            fold.className = 'msg-fold';
            fold.addEventListener('click', () => {
                const stored = log.__foldedMsgs || [];
                stored.forEach(el => log.insertBefore(el, fold));
                log.__foldedMsgs = [];
                fold.remove();
                /* 内容高度变化后重算「回到底部」按钮可见性 */
                const sc = document.querySelector('#chat-scroll');
                if (sc) sc.dispatchEvent(new Event('scroll'));
            });
            log.prepend(fold);
        }
        fold.textContent = '▲ 展开更早的消息（' + log.__foldedMsgs.length + ' 条）';
    }
    log.scrollTop = log.scrollHeight;

    const finish = () => {
        body.innerHTML = richText(text); /* 打完后切换为富文本分色 */
        if (role === 'char' && opts.tts && state.settings.tts) speakText(text);
    };

    if (opts.instant || !state.settings.typewriter || role !== 'char') {
        body.innerHTML = richText(text);
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
    if (state.chat.aiBusy) { toast('模型还在回复中…'); return; }
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
    const settle = (reply) => {
        typing.remove();
        pushMessage('char', reply, { save: true, tts: true, instant: true });
        state.chat.events.push(text);
        updateImmersive(reply);
        persistSession();
    };
    const finishScript = () => {
        const { text: reply } = scriptReply(c, text);
        settle(reply);
    };
    if (!aiReady()) {
        setTimeout(finishScript, 600 + Math.random() * 900);
        return;
    }
    state.chat.aiBusy = true;
    aiStreamReply(c, typing).then((reply) => {
        state.chat.aiBusy = false;
        settle(reply);
    }).catch((err) => {
        state.chat.aiBusy = false;
        console.warn('[pixel] AI 回复失败，回退剧本引擎：', err);
        toast('模型连接失败，已用剧本引擎回复');
        finishScript();
    });
}

function persistSession() {
    if (!state.chat.session) return;
    state.chat.session.time = Date.now();
    const idx = state.history.findIndex(h => h.id === state.chat.session.id);
    if (idx >= 0) state.history[idx] = state.chat.session; else state.history.unshift(state.chat.session);
    saveHistory();
}

/* 复制文本（clipboard API 优先，被拒/缺失时 execCommand 兜底） */
function copyText(t) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch { /* ignore */ }
        ta.remove();
        return Promise.resolve();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(t).catch(fallback);
    }
    return fallback();
}

/* 对话长图渲染：像素风 canvas 排版（头像 + 双色气泡 + 分色富文本 + 自动换行） */
function renderChatCanvas() {
    const c = state.chat.char;
    const msgs = (state.chat.session ? state.chat.session.messages : []).slice(-200);
    const W = 760, PAD = 24, AV = 40, BUBBLE_MAX = 480, LINE_H = 24, FONT = '16px "Zpix Local", "SimSun", monospace';
    const SEG_COLOR = { norm: '#e8e0c8', act: '#9aa08e', quote: '#e8c97a' };
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = FONT;

    /* 富文本 token 化（与气泡 richText 同规则 + Markdown 标记，canvas 绘制用原文） */
    function tokenize(text) {
        const tokens = [];
        const re = /（[^）]*）|「[^」]*」|\*\*[^*]+\*\*|\*[^*]+\*/g;
        let last = 0, m;
        while ((m = re.exec(text)) !== null) {
            if (m.index > last) tokens.push({ t: 'norm', text: text.slice(last, m.index) });
            let t = 'norm', segText = m[0];
            if (m[0].startsWith('（')) t = 'act';
            else if (m[0].startsWith('「')) t = 'quote';
            else if (m[0].startsWith('**')) { t = 'bold'; segText = m[0].slice(2, -2); } else if (m[0].startsWith('*')) { t = 'italic'; segText = m[0].slice(1, -1); }
            tokens.push({ t, text: segText });
            last = m.index + m[0].length;
        }
        if (last < text.length) tokens.push({ t: 'norm', text: text.slice(last) });
        return tokens;
    }

    /* 按 token 逐字换行：每行是 [{t, text, w}] */
    function wrapTokens(tokens, maxW) {
        const lines = [];
        let line = [], w = 0;
        for (const tk of tokens) {
            for (const ch of tk.text) {
                if (ch === '\n') { lines.push(line); line = []; w = 0; continue; }
                const cw = ctx.measureText(ch).width;
                if (w + cw > maxW && line.length) { lines.push(line); line = []; w = 0; }
                const lastSeg = line[line.length - 1];
                if (lastSeg && lastSeg.t === tk.t) { lastSeg.text += ch; lastSeg.w += cw; } else line.push({ t: tk.t, text: ch, w: cw });
                w += cw;
            }
        }
        if (line.length) lines.push(line);
        return lines;
    }

    /* 预排版 */
    const items = [];
    let y = 100;
    msgs.forEach(m => {
        const isUser = m.role === 'user';
        const lines = wrapTokens(tokenize(m.text), BUBBLE_MAX - 28);
        const h = 24 + lines.length * LINE_H + 18;
        items.push({ m, isUser, lines, y, h });
        y += h + 16;
    });
    const truncated = (state.chat.session ? state.chat.session.messages.length : 0) > msgs.length;
    cv.width = W;
    cv.height = Math.min(y + (truncated ? 50 : 40), 16000);

    /* 背景 */
    ctx.fillStyle = '#0d100f';
    ctx.fillRect(0, 0, W, cv.height);
    ctx.textBaseline = 'top';
    ctx.font = '22px "Zpix Local", "SimSun", monospace';
    ctx.fillStyle = '#e8c97a';
    ctx.fillText(`像素酒馆 · 与「${c.name}」的对话`, PAD, 24);
    ctx.font = '13px "Zpix Local", "SimSun", monospace';
    ctx.fillStyle = '#9aa08e';
    ctx.fillText(`导出于 ${new Date().toLocaleString('zh-CN')}`, PAD, 58);

    /* 同步绘制头像画布 */
    const avatarCv = document.createElement('canvas');
    avatarCv.width = 72; avatarCv.height = 72;
    PTAvatar.draw(avatarCv, c);

    items.forEach(it => {
        ctx.font = FONT;
        const bw = Math.min(BUBBLE_MAX, Math.max(...it.lines.map(line => line.reduce((s, seg) => s + seg.w, 0))) + 28);
        const boxX = it.isUser ? W - PAD - bw : PAD + AV + 12;
        /* 头像 */
        if (!it.isUser) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(avatarCv, PAD, it.y + 20, AV, AV);
        }
        /* 名签行 */
        ctx.font = '13px "Zpix Local", "SimSun", monospace';
        ctx.fillStyle = '#ffb545';
        ctx.textAlign = 'left';
        ctx.fillText(`${it.isUser ? '你' : c.name} · ${new Date(it.m.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`, boxX, it.y);
        /* 气泡 */
        ctx.fillStyle = it.isUser ? '#2a2415' : '#1c2621';
        ctx.fillRect(boxX, it.y + 22, bw, it.h - 24);
        ctx.strokeStyle = it.isUser ? '#ffb545' : '#d4a94e';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX + 1, it.y + 23, bw - 2, it.h - 26);
        /* 分色正文（粗体双描 / 斜体倾斜） */
        ctx.font = FONT;
        it.lines.forEach((line, i) => {
            let x = boxX + 14;
            const yy = it.y + 34 + i * LINE_H;
            line.forEach(seg => {
                if (seg.t === 'bold') {
                    ctx.fillStyle = '#ffd98a';
                    ctx.fillText(seg.text, x, yy);
                    ctx.fillText(seg.text, x + 1, yy);
                } else if (seg.t === 'italic') {
                    ctx.save();
                    ctx.translate(x, yy);
                    ctx.transform(1, 0, -0.18, 1, 0, 0);
                    ctx.fillStyle = '#cfc7b0';
                    ctx.fillText(seg.text, 0, 0);
                    ctx.restore();
                } else {
                    ctx.fillStyle = SEG_COLOR[seg.t] || SEG_COLOR.norm;
                    ctx.fillText(seg.text, x, yy);
                }
                x += seg.w;
            });
        });
    });

    if (truncated) {
        ctx.font = '13px "Zpix Local", "SimSun", monospace';
        ctx.fillStyle = '#9aa08e';
        ctx.fillText(`……仅含最近 ${msgs.length} 条，完整记录请用文本导出……`, PAD, cv.height - 30);
    }
    /* 水印 */
    ctx.font = '10px "Press Start 2P", "Zpix Local", monospace';
    ctx.fillStyle = 'rgba(212, 169, 78, 0.45)';
    ctx.fillText('PIXEL TAVERN', W - PAD - 130, cv.height - 26);
    return cv;
}

/* 导出当前对话（txt / md / png） */
function doExportChat(fmt) {
    const c = state.chat.char;
    if (!c || !state.chat.session || !state.chat.session.messages.length) { toast('还没有可导出的消息'); return; }
    const lines = [];
    if (fmt === 'md') {
        lines.push(`# 像素酒馆 · 与「${c.name}」的对话`, '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, '', '---', '');
        state.chat.session.messages.forEach(m => {
            const who = m.role === 'user' ? '**你**' : `**${c.name}**`;
            const t = new Date(m.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            lines.push(`${who} *${t}*`, '', m.text, '');
        });
    } else {
        lines.push(`像素酒馆 · 与「${c.name}」的对话`, `导出时间：${new Date().toLocaleString('zh-CN')}`, '='.repeat(30), '');
        state.chat.session.messages.forEach(m => {
            const who = m.role === 'user' ? '你' : c.name;
            const t = new Date(m.t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            lines.push(`[${t}] ${who}：${m.text}`);
        });
    }
    if (fmt === 'png') {
        const cv = renderChatCanvas();
        /* 预览弹窗：确认后再下载 */
        state._pendingPng = { cv, name: c.name };
        const show = document.querySelector('#longimage-canvas');
        show.width = cv.width;
        show.height = cv.height;
        show.getContext('2d').drawImage(cv, 0, 0);
        openModal('modal-longimage');
        return;
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `对话-${c.name}-${new Date().toISOString().slice(0, 10)}.${fmt}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast(`对话已导出为 ${fmt.toUpperCase()}（${state.chat.session.messages.length} 条）`);
}

/* 导出为全局供 app.js 运行时调用 */
window.openChat = openChat;
window.doExportChat = doExportChat;
window.PTChatAI = { refresh: fetchAIStatus, ready: aiReady, get status() { return PT_AI.status; }, byokCfg, csrf: () => PT_AI.csrf };
