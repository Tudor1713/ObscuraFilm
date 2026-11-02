// Screen recording of the app's own page: the WebGL shelf and every bit of DOM over it, captured as a
// tab (main.js answers getDisplayMedia with this frame, so no picker appears), with the app's own foley
// mixed in from the Web Audio graph. Chunks stream to main.js, which writes them straight to disk.

const TYPES = [
  'video/mp4;codecs=avc1.640033,mp4a.40.2',
  'video/mp4;codecs=avc1.640033,opus',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export class Recorder {
  constructor(sound) {
    this.sound = sound;
    this.mr = null;
    this.busy = false;
  }

  get on() { return !!this.mr; }
  get elapsed() { return this.mr ? (performance.now() - this.t0) / 1000 : 0; }

  // `at` is where the stand-in pill window goes (the record button's spot, in page px)
  async start(at) {
    if (this.mr || this.busy) return;
    this.busy = true;
    try {
      const dpr = devicePixelRatio || 1;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 }, width: { ideal: Math.round(innerWidth * dpr) }, height: { ideal: Math.round(innerHeight * dpr) } },
        audio: false,
      });
      try {
        const ctx = this.sound.ensure();
        if (ctx) {
          ctx.resume?.();
          this.tap = ctx.createMediaStreamDestination();
          this.sound.bus.connect(this.tap);
          stream.addTrack(this.tap.stream.getAudioTracks()[0]);
        }
        const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t)) || '';
        const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9e6, audioBitsPerSecond: 160e3 });
        this.file = await window.anhe.rec.start(mimeType.startsWith('video/mp4') ? 'mp4' : 'webm', at);
        // keep chunks in order even though reading each blob is async
        this.chain = Promise.resolve();
        mr.ondataavailable = e => {
          if (!e.data.size) return;
          this.chain = this.chain.then(() => e.data.arrayBuffer()).then(b => window.anhe.rec.chunk(b));
        };
        this.stream = stream;
        stream.getVideoTracks()[0].addEventListener('ended', () => this.onEnded?.());
        mr.start(1000);
        this.mr = mr;
        this.t0 = performance.now();
        this.settings = { mimeType, ...stream.getVideoTracks()[0].getSettings() };
      } catch (e) {
        for (const t of stream.getTracks()) t.stop();
        if (this.tap) { try { this.sound.bus.disconnect(this.tap); } catch {} this.tap = null; }
        throw e;
      }
    } finally {
      this.busy = false;
    }
  }

  async stop() {
    const mr = this.mr;
    if (!mr || this.busy) return null;
    this.busy = true;
    try {
      const seconds = this.elapsed;
      const done = new Promise(r => mr.addEventListener('stop', r, { once: true }));
      mr.stop();
      await done;
      await this.chain;
      for (const t of this.stream.getTracks()) t.stop();
      if (this.tap) { try { this.sound.bus.disconnect(this.tap); } catch {} this.tap = null; }
      this.mr = null;
      const file = await window.anhe.rec.stop();
      return { file, seconds };
    } finally {
      this.busy = false;
    }
  }
}
