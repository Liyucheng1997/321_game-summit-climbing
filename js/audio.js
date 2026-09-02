/* 程序合成音效：风声、脚步、撞击、拾取等（无需音频文件） */
class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.enabled = true;
    this.stepTimer = 0;
  }

  init() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(ctx.destination);
    this.noiseBuf = this.makeNoise(3);

    // 风：低通噪声
    this.windSrc = ctx.createBufferSource(); this.windSrc.buffer = this.noiseBuf; this.windSrc.loop = true;
    this.windFilt = ctx.createBiquadFilter(); this.windFilt.type = 'lowpass'; this.windFilt.frequency.value = 300; this.windFilt.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilt); this.windFilt.connect(this.windGain); this.windGain.connect(this.master); this.windSrc.start();

    // 呼啸：带通噪声
    this.howlSrc = ctx.createBufferSource(); this.howlSrc.buffer = this.noiseBuf; this.howlSrc.loop = true;
    this.howlFilt = ctx.createBiquadFilter(); this.howlFilt.type = 'bandpass'; this.howlFilt.frequency.value = 500; this.howlFilt.Q.value = 8;
    this.howlGain = ctx.createGain(); this.howlGain.gain.value = 0;
    this.howlSrc.connect(this.howlFilt); this.howlFilt.connect(this.howlGain); this.howlGain.connect(this.master); this.howlSrc.start();

    // 滑坠摩擦：高通噪声
    this.slideSrc = ctx.createBufferSource(); this.slideSrc.buffer = this.noiseBuf; this.slideSrc.loop = true;
    this.slideFilt = ctx.createBiquadFilter(); this.slideFilt.type = 'highpass'; this.slideFilt.frequency.value = 1500;
    this.slideGain = ctx.createGain(); this.slideGain.gain.value = 0;
    this.slideSrc.connect(this.slideFilt); this.slideFilt.connect(this.slideGain); this.slideGain.connect(this.master); this.slideSrc.start();
  }

  makeNoise(sec) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      // 粉红噪声近似，更接近风声
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }

  /* level 0..1 风力，storm 0..1 暴风雪 */
  setWind(level, storm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const l = clamp(level, 0, 1);
    this.windGain.gain.setTargetAtTime(0.08 + l * 0.55 + storm * 0.2, t, 0.3);
    this.windFilt.frequency.setTargetAtTime(180 + l * 900 + storm * 400, t, 0.3);
    this.howlGain.gain.setTargetAtTime(l * l * 0.22 + storm * 0.15, t, 0.4);
    this.howlFilt.frequency.setTargetAtTime(380 + Math.sin(t * 0.9) * 120 + l * 350, t, 0.5);
  }
  setSlide(level) {
    if (!this.ctx) return;
    this.slideGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.35, this.ctx.currentTime, 0.08);
  }

  burst(freq, q, dur, vol, type = 'bandpass', attack = 0.005) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, vol, type = 'sine', slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  step(mat, run) {
    const v = run ? 0.3 : 0.2;
    if (mat === 3) this.burst(700, 0.8, 0.12, v * 0.8, 'lowpass');       // 雪：闷
    else if (mat === 4) this.burst(2500, 3, 0.06, v * 0.6, 'bandpass');  // 冰：脆
    else if (mat === 2) this.burst(1800, 2, 0.07, v, 'bandpass');       // 岩：硬
    else this.burst(1100, 1.2, 0.09, v * 0.8, 'bandpass');              // 草/土
  }
  grab() { this.burst(1400, 1.5, 0.15, 0.25, 'bandpass'); }
  lunge() { this.burst(900, 1, 0.25, 0.3, 'bandpass'); this.tone(180, 0.2, 0.15, 'triangle', 120); }
  hit(intensity) {
    const v = clamp(0.25 + intensity * 0.5, 0, 0.9);
    this.tone(90, 0.35, v, 'sine', 40);
    this.burst(400, 0.7, 0.25, v * 0.7, 'lowpass');
  }
  land(intensity) { this.burst(500, 0.8, 0.15, 0.2 + intensity * 0.3, 'lowpass'); }
  pickup() { this.tone(880, 0.15, 0.25); setTimeout(() => this.tone(1320, 0.25, 0.25), 90); }
  camp() { this.tone(523, 0.2, 0.25); setTimeout(() => this.tone(659, 0.2, 0.25), 130); setTimeout(() => this.tone(784, 0.4, 0.3), 260); }
  summit() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.6, 0.3, 'triangle'), i * 160)); }
  rockWarn() { this.tone(700, 0.5, 0.3, 'sawtooth', 220); this.burst(300, 1, 0.6, 0.35, 'lowpass'); }
  gripLost() { this.tone(300, 0.4, 0.3, 'square', 90); }
  warn() { this.tone(440, 0.25, 0.25, 'square'); setTimeout(() => this.tone(440, 0.25, 0.25, 'square'), 350); }
  death() { this.tone(200, 1.2, 0.4, 'sawtooth', 50); this.burst(200, 0.6, 0.8, 0.4, 'lowpass'); }
}
