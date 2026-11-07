/* ============================================================
 * 游戏酒馆 · 像素点唱机 PIXEL JUKEBOX
 * WebAudio 实时合成 8-bit 酒馆小曲，无外部音频文件。
 * ============================================================ */
'use strict';

const PTJukebox = (() => {
    /* ---------- 曲目（A=6 音阶记谱，null=休止） ---------- */
    const N = (name) => { /* 音名转 MIDI */
        const m = name.match(/^([A-G])(#|b)?(-?\d)$/);
        const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
        const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
        return (parseInt(m[3]) + 1) * 12 + base + acc;
    };
    const seq = (arr) => arr; /* 可读性占位 */

    const TRACKS = [
        {
            name: '温暖篝火酒馆', bpm: 96, wave: 'square',
            lead: seq(['E4', 'G4', 'A4', 'G4', 'E4', 'D4', 'C4', 'D4', 'E4', 'G4', 'A4', 'B4', 'A4', 'G4', 'E4', null,
                'D4', 'E4', 'F4', 'E4', 'D4', 'C4', 'A3', 'C4', 'D4', 'E4', 'G4', 'E4', 'D4', 'C4', null, null]),
            bass: seq(['C3', null, 'G3', null, 'A3', null, 'E3', null, 'F3', null, 'C4', null, 'G3', null, 'G2', null,
                'A2', null, 'E3', null, 'F3', null, 'C3', null, 'D3', null, 'A3', null, 'G3', null, 'G2', null]),
            arp: seq(['C4', 'E4', 'G4', 'E4', 'A3', 'C4', 'E4', 'C4', 'F3', 'A3', 'C4', 'A3', 'G3', 'B3', 'D4', 'B3',
                'A3', 'C4', 'E4', 'C4', 'F3', 'A3', 'C4', 'A3', 'D3', 'F3', 'A3', 'F3', 'G3', 'B3', 'D4', 'B3']),
        },
        {
            name: '星空下的旅店', bpm: 76, wave: 'triangle',
            lead: seq(['A4', null, 'C5', 'B4', 'A4', 'E4', null, 'G4', 'A4', null, 'E5', 'D5', 'C5', 'B4', null, null,
                'F4', 'A4', 'C5', null, 'B4', 'G4', 'E4', null, 'D4', 'E4', 'G4', 'A4', 'B4', 'A4', null, null]),
            bass: seq(['A2', null, 'E3', null, 'F3', null, 'C3', null, 'D3', null, 'A3', null, 'E3', null, 'E2', null,
                'F2', null, 'C3', null, 'G3', null, 'C3', null, 'G2', null, 'D3', null, 'A3', null, 'E3', null]),
            arp: seq(['A3', 'E4', 'A4', 'E4', 'F3', 'C4', 'F4', 'C4', 'D3', 'A3', 'D4', 'A3', 'E3', 'B3', 'E4', 'B3',
                'F3', 'C4', 'F4', 'C4', 'G3', 'D4', 'G4', 'D4', 'G2', 'D3', 'G3', 'D3', 'A2', 'E3', 'A3', 'E3']),
        },
        {
            name: '王城集市的黄昏', bpm: 118, wave: 'square',
            lead: seq(['D4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'D4', 'A3', 'B3', 'D4', 'F#4', 'B4', 'A4', 'F#4', 'D4', null,
                'G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D4', 'A4', 'D5', 'F#5', 'A5', 'E5', 'D5', 'A4', null]),
            bass: seq(['D3', null, 'D3', null, 'G3', null, 'G3', null, 'B2', null, 'B2', null, 'A3', null, 'A3', null,
                'G3', null, 'G3', null, 'B3', null, 'B3', null, 'D3', null, 'D3', null, 'A3', null, 'A3', null]),
            arp: seq(['D3', 'A3', 'D4', 'A3', 'G2', 'D3', 'G3', 'D3', 'B2', 'F#3', 'B3', 'F#3', 'A2', 'E3', 'A3', 'E3',
                'G2', 'D3', 'G3', 'D3', 'B2', 'F#3', 'B3', 'F#3', 'D3', 'A3', 'D4', 'A3', 'A2', 'E3', 'A3', 'E3']),
        },
        {
            name: '雨巷灯影', bpm: 66, wave: 'triangle',
            lead: seq(['E4', null, 'G4', null, 'B4', null, 'A4', 'G4', 'E4', null, null, null, 'D4', 'E4', null, null,
                'C4', null, 'E4', null, 'G4', null, 'F#4', 'E4', 'B3', null, null, null, null, null, null, null]),
            bass: seq(['E2', null, null, null, 'C3', null, null, null, 'A2', null, null, null, 'B2', null, null, null,
                'C3', null, null, null, 'G2', null, null, null, 'B2', null, null, null, 'E2', null, null, null]),
            arp: seq(['E3', 'G3', 'B3', 'G3', 'C3', 'E3', 'G3', 'E3', 'A2', 'C3', 'E3', 'C3', 'B2', 'D#3', 'F#3', 'D#3',
                'C3', 'E3', 'G3', 'E3', 'G2', 'B2', 'D3', 'B2', 'B2', 'E3', 'G3', 'E3', 'E2', 'B2', 'E3', 'B2']),
        },
    ];

    /* ---------- 状态 ---------- */
    let ctx = null;
    let master = null;
    let timer = null;
    let trackIdx = 0;
    let step = 0;
    let playing = false;
    let volume = 0.4;

    function ensureCtx() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            master = ctx.createGain();
            master.gain.value = volume;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
    }

    function note(midi, when, dur, wave, gainVal, detune = 0) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        osc.detune.value = detune;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(gainVal, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, when + dur);
        osc.connect(g); g.connect(master);
        osc.start(when); osc.stop(when + dur + 0.02);
    }

    /* lookahead 调度器 */
    const LOOKAHEAD = 0.12; const STEP_DUR = () => 60 / TRACKS[trackIdx].bpm / 2; /* 8分音符 */
    let nextTime = 0;

    function schedule() {
        while (nextTime < ctx.currentTime + LOOKAHEAD) {
            const tr = TRACKS[trackIdx];
            const i = step % tr.lead.length;
            const d = STEP_DUR();
            if (tr.lead[i]) note(N(tr.lead[i]), nextTime, d * 0.9, tr.wave, 0.16);
            if (tr.bass[i]) note(N(tr.bass[i]), nextTime, d * 1.6, 'triangle', 0.22);
            if (tr.arp[i % tr.arp.length]) note(N(tr.arp[i % tr.arp.length]), nextTime, d * 0.5, 'square', 0.05, 6);
            nextTime += d;
            step++;
        }
    }

    function play() {
        ensureCtx();
        if (playing) return;
        playing = true;
        nextTime = ctx.currentTime + 0.06;
        timer = setInterval(schedule, 50);
    }
    function pause() {
        playing = false;
        if (timer) clearInterval(timer);
        timer = null;
        if (ctx) ctx.suspend();
    }
    function toggle() { playing ? pause() : play(); return playing; }

    function next(dir = 1) {
        trackIdx = (trackIdx + dir + TRACKS.length) % TRACKS.length;
        step = 0;
        if (playing && ctx) { /* 保持播放，直接切曲目 */
            /* 无需额外处理，schedule 读取新 track */
        }
        return TRACKS[trackIdx];
    }
    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (master) master.gain.value = volume;
    }
    return {
        TRACKS, play, pause, toggle, next, setVolume,
        get playing() { return playing; },
        get current() { return TRACKS[trackIdx]; },
        get index() { return trackIdx; },
    };
})();

/* 导出为全局供 app.js 使用 */
window.PTJukebox = PTJukebox;
