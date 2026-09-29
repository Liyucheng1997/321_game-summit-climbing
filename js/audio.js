/* 程序合成音频：环境声、音效与生成式配乐（无需任何音频文件） */
const MUSIC_MOODS = {
  menu: { chords: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 66]], scale: [60, 62, 64, 67, 69, 72, 74, 76], len: 9, pluck: 0.35, bright: 1100 },
  day: { chords: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]], scale: [67, 69, 72, 74, 76, 79, 81], len: 8, pluck: 0.5, bright: 1300 },
  night: { chords: [[45, 52, 60, 64], [40, 47, 55, 62], [41, 48, 57, 60], [36, 43, 52, 59]], scale: [57, 60, 62, 64, 67, 69, 72], len: 11, pluck: 0.25, bright: 700 },
  storm: { chords: [[38, 45, 53, 57], [34, 41, 50, 53], [43, 50, 55, 58], [45, 52, 57, 61]], scale: [50, 53, 55, 57, 60, 62], len: 7, pluck: 0.15, bright: 600 },
  summit: { chords: [[48, 55, 64, 72], [43, 55, 62, 71], [45, 52, 64, 72], [41, 53, 60, 69]], scale: [72, 74, 76, 79, 81, 84, 86, 88], len: 5, pluck: 0.9, bright: 2000 },
  camp: { chords: [[41, 48, 57, 64], [45, 52, 57, 64], [43, 50, 59, 62], [48, 55, 60, 64]], scale: [60, 64, 65, 67, 69, 72], len: 10, pluck: 0.3, bright: 900 },
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioSys {
  constructor() { this.ctx = null; this.muted = false; this.vol = { master: 0.8, music: 0.5, sfx: 0.8 }; this.mood = 'menu'; this.chordIdx = 0; this.nextChord = 0; this.nextPluck = 0; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3;
    this.comp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.comp);
    this.music = ctx.createGain(); this.music.connect(this.comp);
    this.amb = ctx.createGain(); this.amb.connect(this.comp);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.makeImpulse(3.2, 2.5);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.6;
    this.reverb.connect(this.revGain); this.revGain.connect(this.comp);
    this.noiseBuf = this.makeNoise(3);
    this.applyVolumes();
    const loop = (filtType, freq, q, dest = this.amb) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filtType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(dest); src.start();
      return { f, g };
    };
    this.wind = loop('lowpass', 300, 0.6);
    this.howl = loop('bandpass', 500, 8);
    this.slide = loop('highpass', 1500, 0.7, this.sfx);
    this.fire = loop('bandpass', 900, 0.5);
    this.water = loop('bandpass', 600, 0.4);
  }

  makeNoise(sec) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    return buf;
  }
  makeImpulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return buf;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.3);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.1);
  }
  setMuted(m) { this.muted = m; this.applyVolumes(); }
  setMood(m) { if (this.mood !== m) { this.mood = m; this.nextChord = 0; } }

  /* 环境：风、火、水 */
  setAmbience(wind, storm, fire, water) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, l = clamp(wind, 0, 1);
    this.wind.g.gain.setTargetAtTime(0.06 + l * 0.5 + storm * 0.25, t, 0.3);
    this.wind.f.frequency.setTargetAtTime(180 + l * 900 + storm * 400, t, 0.3);
    this.howl.g.gain.setTargetAtTime(l * l * 0.2 + storm * 0.15, t, 0.4);
    this.howl.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.9) * 120 + l * 350, t, 0.5);
    this.fire.g.gain.setTargetAtTime(fire * 0.12, t, 0.3);
    this.water.g.gain.setTargetAtTime(water * 0.08, t, 0.5);
    this.fireLevel = fire;
  }
  setSlide(level) { if (this.ctx) this.slide.g.gain.setTargetAtTime(clamp(level, 0, 1) * 0.35, this.ctx.currentTime, 0.08); }

  burst(freq, q, dur, vol, type = 'bandpass', attack = 0.005, dest, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx); src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', slideTo = null, when = 0, dest, rev = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    if (rev) { const rg = ctx.createGain(); rg.gain.value = rev; g.connect(rg); rg.connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* ---------- 配乐 ---------- */
  updateMusic() {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime, M = MUSIC_MOODS[this.mood] || MUSIC_MOODS.day;
    if (now >= this.nextChord - 0.1) {
      const ch = M.chords[this.chordIdx % M.chords.length];
      this.chordIdx++;
      const start = Math.max(now, this.nextChord);
      this.pad(ch, start, M.len, M.bright);
      this.nextChord = start + M.len;
    }
    if (now >= this.nextPluck) {
      if (Math.random() < M.pluck) {
        const n = M.scale[Math.floor(Math.random() * M.scale.length)];
        this.pluck(midi(n), now + 0.05, 0.08);
        if (Math.random() < 0.35) this.pluck(midi(n + (Math.random() < 0.5 ? 7 : 12)), now + 0.35, 0.05);
      }
      this.nextPluck = now + 0.9 + Math.random() * 2.2;
    }
  }
  pad(notes, t, len, bright) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 2.5); g.gain.setValueAtTime(0.07, t + len - 1); g.gain.linearRampToValueAtTime(0.0001, t + len + 2.5);
    f.connect(g); g.connect(this.music);
    const rg = ctx.createGain(); rg.gain.value = 0.5; g.connect(rg); rg.connect(this.reverb);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = n < 50 ? 'sine' : 'triangle'; o.frequency.value = midi(n); o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = n < 50 ? 0.5 : 0.28;
        o.connect(og); og.connect(f); o.start(t); o.stop(t + len + 2.6);
      }
    }
  }
  pluck(freq, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    const g2 = ctx.createGain(); g2.gain.value = 0.15;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.music);
    const rg = ctx.createGain(); rg.gain.value = 0.9; g.connect(rg); rg.connect(this.reverb);
    o.start(t); o2.start(t); o.stop(t + 2.3); o2.stop(t + 2.3);
  }

  /* 环境随机音：鸟鸣、蟋蟀、火堆噼啪 */
  ambientTick(dt, env) {
    if (!this.ctx) return;
    this.ambT = (this.ambT || 0) - dt;
    if (this.fireLevel > 0.1 && Math.random() < dt * 6 * this.fireLevel) this.burst(2500 + Math.random() * 2500, 4, 0.03 + Math.random() * 0.04, 0.08 * this.fireLevel, 'bandpass', 0.002, this.amb);
    if (this.ambT > 0) return;
    this.ambT = 1.5 + Math.random() * 4;
    if (env.forest && !env.night && Math.random() < 0.7) {
      const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) this.tone(base * (1 + Math.random() * 0.2), 0.09, 0.03, 'sine', base * 1.4, k * 0.12, this.amb, 0.3);
    }
    if (env.forest && env.night && Math.random() < 0.8) {
      for (let k = 0; k < 6; k++) this.tone(4200, 0.03, 0.015, 'square', null, k * 0.06, this.amb);
    }
    if (env.eagle && Math.random() < 0.12) this.tone(1800, 0.6, 0.03, 'sawtooth', 1100, 0, this.amb, 0.6);
  }

  step(mat, run) {
    const v = run ? 0.25 : 0.16;
    if (mat === 3) this.burst(700, 0.8, 0.12, v * 0.9, 'lowpass');
    else if (mat === 4) this.burst(2500, 3, 0.06, v * 0.6, 'bandpass');
    else if (mat === 2) this.burst(1800, 2, 0.07, v, 'bandpass');
    else if (mat === 1) this.burst(1300, 1.4, 0.08, v * 0.9, 'bandpass');
    else this.burst(1000, 1.2, 0.09, v * 0.7, 'bandpass');
  }
  grab() { this.burst(1400, 1.5, 0.12, 0.2, 'bandpass'); }
  reach() { this.burst(900, 1, 0.1, 0.07, 'bandpass'); }
  hammer() { [0, 0.25, 0.5].forEach((w, i) => { this.tone(2400 - i * 100, 0.12, 0.12, 'triangle', null, w); this.burst(3000, 5, 0.05, 0.1, 'bandpass', 0.002, null, w); }); }
  ropeCatch() { this.burst(300, 1, 0.3, 0.4, 'lowpass'); this.tone(140, 0.4, 0.2, 'triangle', 90); this.tone(900, 0.5, 0.05, 'sawtooth', 700, 0.1); }
  crumble() { for (let k = 0; k < 5; k++) this.burst(600 + Math.random() * 1500, 1.5, 0.12, 0.2, 'bandpass', 0.002, null, k * 0.07); }
  lunge() { this.burst(900, 1, 0.25, 0.25, 'bandpass'); this.tone(180, 0.2, 0.12, 'triangle', 120); }
  dyno() { this.burst(600, 0.7, 0.4, 0.35, 'lowpass', 0.05); }
  hit(i) { const v = clamp(0.25 + i * 0.5, 0, 0.9); this.tone(90, 0.35, v, 'sine', 40); this.burst(400, 0.7, 0.25, v * 0.7, 'lowpass'); }
  land(i) { this.burst(500, 0.8, 0.15, 0.15 + i * 0.3, 'lowpass'); }
  pickup() { this.tone(880, 0.15, 0.2, 'sine', null, 0, null, 0.3); this.tone(1320, 0.25, 0.2, 'sine', null, 0.09, null, 0.3); }
  page() { this.burst(3500, 0.6, 0.25, 0.15, 'highpass', 0.05); this.tone(660, 0.8, 0.1, 'sine', null, 0.1, null, 0.6); this.tone(990, 1.0, 0.08, 'sine', null, 0.3, null, 0.6); }
  camp() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 0.18, 'triangle', null, i * 0.13, null, 0.5)); }
  ignite() { this.burst(400, 0.5, 1.2, 0.35, 'lowpass', 0.3); this.burst(2000, 1, 0.5, 0.1, 'bandpass', 0.1); }
  eat() { for (let k = 0; k < 4; k++) this.burst(2200 + Math.random() * 800, 2, 0.05, 0.15, 'bandpass', 0.002, null, k * 0.15); }
  drink() { for (let k = 0; k < 3; k++) this.tone(300 - k * 30, 0.12, 0.12, 'sine', 180, k * 0.25); }
  tent() { for (let k = 0; k < 8; k++) this.burst(1500 + Math.random() * 2000, 1, 0.15, 0.12, 'highpass', 0.03, null, k * 0.2); }
  shutter() { this.burst(4000, 2, 0.04, 0.35, 'bandpass', 0.001); this.burst(2500, 2, 0.06, 0.25, 'bandpass', 0.001, null, 0.07); }
  achievement() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.6, 0.12, 'sine', null, i * 0.09, null, 0.7)); }
  summit() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 1.4, 0.2, 'triangle', null, i * 0.18, null, 0.8)); }
  rockWarn() { this.burst(300, 1, 0.8, 0.3, 'lowpass'); for (let k = 0; k < 4; k++) this.burst(800 + k * 200, 2, 0.08, 0.15, 'bandpass', 0.002, null, 0.2 + k * 0.12); }
  gripLost() { this.tone(300, 0.4, 0.25, 'square', 90); }
  warn() { this.tone(440, 0.25, 0.2, 'square'); this.tone(440, 0.25, 0.2, 'square', null, 0.35); }
  death() { this.tone(200, 1.2, 0.35, 'sawtooth', 50); this.burst(200, 0.6, 0.8, 0.35, 'lowpass'); }
  click() { this.tone(1200, 0.05, 0.08, 'sine'); }
  hover() { this.tone(1800, 0.03, 0.03, 'sine'); }
  zip() { this.burst(3000, 3, 0.35, 0.15, 'bandpass', 0.02); }
}
