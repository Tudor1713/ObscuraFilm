// Small synthesised foley: the rustle of film over felt, perforation ticks, the can lifting and landing,
// and a soft sweep when a frame is developed back to colour. Everything is generated, nothing is bundled.

export class Sound {
  constructor() {
    this.on = true;
    try { this.on = localStorage.getItem('anhe-sound') !== 'off'; } catch {}
    this.ctx = null;
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('anhe-sound', this.on ? 'on' : 'off'); } catch {}
    if (!this.on) this.rustle(0);
    return this.on;
  }

  ensure() {
    if (this.ctx || !window.AudioContext) return this.ctx;
    const ctx = this.ctx = new AudioContext();
    // everything audible meets on one bus: the foley (through master) and a playing video
    this.bus = ctx.createGain();
    this.bus.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.bus);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    this.rustleGain = ctx.createGain(); this.rustleGain.gain.value = 0;
    src.connect(bp).connect(hp).connect(this.rustleGain).connect(this.master);
    src.start();
    return ctx;
  }

  // send a <video>'s sound through the graph too, so a screen recording hears it
  media(el) {
    const ctx = this.ensure();
    if (!ctx || el.anheSource) return;
    ctx.resume?.();
    el.anheSource = ctx.createMediaElementSource(el);
    el.anheSource.connect(this.bus);
  }

  get live() { return this.on && this.ctx && this.ctx.state === 'running'; }

  rustle(speed) {
    if (!this.ctx) return;
    const g = this.on ? Math.min(1, Math.abs(speed) / 26) ** 1.4 * 0.16 : 0;
    this.rustleGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
  }

  burst(t, dur, freq, q, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }

  tone(t, dur, f0, f1, gain, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  tick(level = 1) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.018, 2600, 2.2, 0.16 * level);
    this.tone(t, 0.03, 1900, 1400, 0.025 * level);
  }

  lift() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.06, 900, 1.1, 0.12);
    this.tone(t, 0.12, 220, 120, 0.05);
  }

  land() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.16, 150, 70, 0.14);
    this.burst(t, 0.035, 1800, 1.6, 0.14);
  }

  develop() {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.9);
  }
}
