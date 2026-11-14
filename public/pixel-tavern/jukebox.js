/* ============================================================
 * 幻境回声 · EchoCraft — 环境氛围音律合成引擎 (Ambient Soundscape Engine)
 * WebAudio 实时低噪平滑合成，零外部音频文件，非侵权独立原创音律
 * ============================================================ */
'use strict';

const PTJukebox = (() => {
    const N = (name) => {
        const m = name.match(/^([A-G])(#|b)?(-?\d)$/);
        if (!m) return 60;
        const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
        const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
        return (parseInt(m[3], 10) + 1) * 12 + base + acc;
    };

    const seq = (arr) => arr;

    /* 原创环境氛围音景（温柔纯净，去除 8-bit 粗糙方波） */
    const TRACKS = [
        {
            name: '星海浮标 · Stellar Drift',
            bpm: 72,
            wave: 'sine',
            lead: seq(['E4', null, 'G4', 'A4', null, 'B4', 'A4', null, 'E4', null, 'D4', 'E4', null, null, 'G4', null,
                'A4', null, 'C5', 'B4', null, 'G4', 'E4', null, 'D4', 'C4', 'D4', null, 'E4', null, null, null]),
            bass: seq(['A2', null, 'E3', null, 'F2', null, 'C3', null, 'D2', null, 'A2', null, 'E2', null, 'B2', null,
                'F2', null, 'C3', null, 'G2', null, 'D3', null, 'A2', null, 'E3', null, 'A2', null, null, null]),
            arp: seq(['C4', 'E4', 'G4', 'B4', 'A3', 'C4', 'E4', 'G4', 'F3', 'A3', 'C4', 'E4', 'E3', 'G3', 'B3', 'D4',
                'F3', 'A3', 'C4', 'E4', 'G3', 'B3', 'D4', 'F4', 'A3', 'C4', 'E4', 'G4', 'A3', 'C4', 'E4', 'A4']),
        },
        {
            name: '雨夜温室 · Rain Glasshouse',
            bpm: 64,
            wave: 'triangle',
            lead: seq(['C4', 'E4', 'G4', null, 'A4', null, 'G4', 'E4', 'F4', null, 'E4', 'D4', 'C4', null, null, null,
                'D4', 'F4', 'A4', null, 'B4', null, 'A4', 'F4', 'G4', null, 'F4', 'E4', 'D4', null, null, null]),
            bass: seq(['C3', null, 'G3', null, 'A2', null, 'E3', null, 'F2', null, 'C3', null, 'G2', null, 'D3', null,
                'D3', null, 'A3', null, 'G2', null, 'D3', null, 'C3', null, 'G3', null, 'C2', null, null, null]),
            arp: seq(['E4', 'G4', 'C5', 'G4', 'E4', 'A4', 'C5', 'A4', 'F4', 'A4', 'D5', 'A4', 'G4', 'B4', 'D5', 'B4',
                'F4', 'A4', 'D5', 'A4', 'G4', 'B4', 'E5', 'B4', 'E4', 'G4', 'C5', 'G4', 'C4', 'E4', 'G4', 'C5']),
        },
        {
            name: '旧书深巷 · Antiquarian Alley',
            bpm: 80,
            wave: 'sine',
            lead: seq(['D4', null, 'F4', 'A4', 'D5', null, 'A4', 'F4', 'G4', null, 'B4', 'D5', 'E5', 'D5', 'A4', null,
                'F4', null, 'A4', 'C5', 'B4', null, 'G4', 'E4', 'D4', 'E4', 'F4', 'E4', 'D4', null, null, null]),
            bass: seq(['D3', null, 'A3', null, 'G2', null, 'D3', null, 'B2', null, 'F#3', null, 'A2', null, 'E3', null,
                'F2', null, 'C3', null, 'G2', null, 'D3', null, 'D3', null, 'A3', null, 'D2', null, null, null]),
            arp: seq(['D4', 'F4', 'A4', 'F4', 'G3', 'B3', 'D4', 'B3', 'B3', 'D4', 'F#4', 'D4', 'A3', 'C#4', 'E4', 'C#4',
                'F3', 'A3', 'C4', 'A3', 'G3', 'B3', 'D4', 'B3', 'D3', 'F3', 'A3', 'F3', 'D3', 'F3', 'A3', 'D4']),
        },
        {
            name: '潮汐灯塔 · Tidal Beacon',
            bpm: 58,
            wave: 'triangle',
            lead: seq(['A4', null, 'C5', null, 'E5', 'D5', 'C5', null, 'B4', null, 'G4', null, 'A4', null, null, null,
                'F4', null, 'A4', null, 'C5', 'B4', 'A4', null, 'G4', null, 'E4', null, 'A4', null, null, null]),
            bass: seq(['A2', null, 'E3', null, 'C3', null, 'G3', null, 'G2', null, 'D3', null, 'A2', null, 'E3', null,
                'F2', null, 'C3', null, 'D3', null, 'A3', null, 'E2', null, 'B2', null, 'A2', null, null, null]),
            arp: seq(['C4', 'E4', 'A4', 'E4', 'E4', 'G4', 'B4', 'G4', 'D4', 'F4', 'A4', 'F4', 'C4', 'E4', 'A4', 'E4',
                'A3', 'C4', 'F4', 'C4', 'D4', 'F4', 'A4', 'F4', 'B3', 'E4', 'G4', 'E4', 'A3', 'C4', 'E4', 'A4']),
        },
        {
            name: '霓虹天台 · Neon Rooftop',
            bpm: 88,
            wave: 'sine',
            lead: seq(['A4', null, 'C5', null, 'E5', null, 'D5', 'C5', 'F4', null, 'A4', null, 'C5', 'B4', null, null,
                'E4', null, 'G4', null, 'C5', null, 'B4', 'G4', 'D4', null, 'G4', 'A4', 'B4', null, null, null]),
            bass: seq(['A2', null, 'E3', null, 'F2', null, 'C3', null, 'F2', null, 'C3', null, 'C3', null, 'G2', null,
                'C3', null, 'G2', null, 'A2', null, 'E3', null, 'G2', null, 'D3', null, 'G2', null, null, null]),
            arp: seq(['C4', 'E4', 'A4', 'E4', 'C4', 'E4', 'A4', 'E4', 'F3', 'A3', 'C4', 'A3', 'C4', 'E4', 'G4', 'E4',
                'C4', 'E4', 'G4', 'E4', 'A3', 'C4', 'E4', 'C4', 'B3', 'D4', 'G4', 'D4', 'B3', 'D4', 'G4', 'B4']),
        },
        {
            name: '雨港灯影 · Harbor Lanterns',
            bpm: 50,
            wave: 'triangle',
            lead: seq(['D4', null, null, 'F4', null, null, 'A4', null, 'F4', null, null, 'D4', null, null, null, null,
                'C4', null, null, 'E4', null, null, 'G4', null, 'A4', null, null, null, null, null, null, null]),
            bass: seq(['D2', null, 'A2', null, null, null, 'D3', null, 'A#2', null, 'F2', null, null, null, 'D3', null,
                'F2', null, 'C3', null, null, null, 'F3', null, 'C3', null, 'G2', null, 'A2', null, null, null]),
            arp: seq(['D3', 'F3', 'A3', 'F3', 'D3', 'F3', 'A3', 'F3', 'A#2', 'D3', 'F3', 'D3', 'F3', 'A#3', 'F3', 'D3',
                'F3', 'A3', 'C4', 'A3', 'F3', 'A3', 'C4', 'A3', 'C3', 'E3', 'G3', 'E3', 'C4', 'E3', 'G3', 'E3']),
        },
        {
            name: '魔女营地 · Witchfire Camp',
            bpm: 96,
            wave: 'sine',
            lead: seq(['E4', 'G4', 'B4', null, 'A4', 'G4', 'E4', null, 'C4', null, 'E4', 'G4', null, 'E4', null, null,
                'G4', 'B4', 'D5', null, 'B4', 'A4', 'G4', null, 'D4', 'E4', 'F#4', 'A4', 'B4', null, null, null]),
            bass: seq(['E2', null, 'B2', null, 'E3', null, 'B2', null, 'C3', null, 'G2', null, 'C3', null, 'G2', null,
                'G2', null, 'D3', null, 'G2', null, 'D3', null, 'D3', null, 'A2', null, 'B2', null, null, null]),
            arp: seq(['E3', 'G3', 'B3', 'G3', 'E4', 'B3', 'G3', 'B3', 'C3', 'E3', 'G3', 'E3', 'C4', 'G3', 'E3', 'G3',
                'G3', 'B3', 'D4', 'B3', 'G4', 'D4', 'B3', 'D4', 'F#3', 'A3', 'D4', 'A3', 'F#4', 'A3', 'D4', 'F#4']),
        },
    ];

    let ctx = null;
    let master = null;
    let filter = null;
    let playing = false;
    let trackIdx = 0;
    let step = 0;
    let timer = null;
    let volume = 0.35;

    function ensureCtx() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = volume;

            // 柔和低通暖色滤波器，去除高频毛刺与刺耳杂音
            filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1600;
            filter.Q.value = 1.0;

            master.connect(filter);
            filter.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
    }

    function midiToFreq(m) {
        return 440 * Math.pow(2, (m - 69) / 12);
    }

    function note(midi, when, dur, wave = 'sine', gainVal = 0.12) {
        if (!midi || !ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = midiToFreq(midi);

        // 柔和起音与自然衰减
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(gainVal, when + Math.min(0.05, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

        osc.connect(g);
        g.connect(master);
        osc.start(when);
        osc.stop(when + dur + 0.05);
    }

    const LOOKAHEAD = 0.12;
    const STEP_DUR = () => 60 / TRACKS[trackIdx].bpm / 2;
    let nextTime = 0;

    function schedule() {
        while (nextTime < ctx.currentTime + LOOKAHEAD) {
            const tr = TRACKS[trackIdx];
            const i = step % tr.lead.length;
            const d = STEP_DUR();
            if (tr.lead[i]) note(N(tr.lead[i]), nextTime, d * 1.2, tr.wave, 0.14);
            if (tr.bass[i]) note(N(tr.bass[i]), nextTime, d * 1.8, 'sine', 0.18);
            if (tr.arp[i % tr.arp.length]) note(N(tr.arp[i % tr.arp.length]), nextTime, d * 0.7, 'triangle', 0.06);
            nextTime += d;
            step++;
        }
    }

    function play() {
        ensureCtx();
        if (playing) return;
        playing = true;
        nextTime = ctx.currentTime + 0.05;
        timer = setInterval(schedule, 45);
    }

    function pause() {
        playing = false;
        if (timer) clearInterval(timer);
        timer = null;
        if (ctx) ctx.suspend();
    }

    function toggle() {
        playing ? pause() : play();
        return playing;
    }

    function next(dir = 1) {
        trackIdx = (trackIdx + dir + TRACKS.length) % TRACKS.length;
        step = 0;
        return TRACKS[trackIdx];
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (master) master.gain.value = volume;
    }

    return {
        TRACKS,
        play,
        pause,
        toggle,
        next,
        setVolume,
        get playing() { return playing; },
        get current() { return TRACKS[trackIdx]; },
        get index() { return trackIdx; },
    };
})();

window.PTJukebox = PTJukebox;
