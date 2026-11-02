// The enlarger: a frame flies off the strip into a darkened room. It opens in black and white; a tap
// develops it outwards from where you touched it into the roll's film (or its original colour, when the
// roll has no film simulation), another tap takes it back. The picture is drawn by grade.js: a photo is
// SpektraLab's print of it once the darkroom has made one (the film's LUT until then), a playing video
// is the film's LUT with its grain; both take the same develop and the same strength slider.
import { Grader } from './grade.js';

const EASE = 'cubic-bezier(.2,.75,.15,1)';

// CSS-style cubic-bezier easing, for the develop that runs on frames rather than as a CSS animation
function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = f(x1, x2, t) - x, d = (f(x1, x2, t + 1e-4) - f(x1, x2, t)) / 1e-4;
      if (Math.abs(dx) < 1e-5 || !d) break;
      t = Math.min(1, Math.max(0, t - dx / d));
    }
    return f(y1, y2, t);
  };
}
const developEase = bezier(.35, .1, .2, 1);

const loadImage = url => new Promise(res => {
  const im = new Image();
  im.onload = () => im.decode().then(() => res(im), () => res(im));
  im.onerror = () => res(null);
  im.src = url;
});

export class Lightbox {
  constructor(opts) {
    this.o = opts;
    const el = this.el = document.querySelector('#lightbox');
    this.shade = el.querySelector('.lb-shade');
    this.fig = el.querySelector('.lb-fig');
    this.g = new Grader(el.querySelector('.lb-gl'));
    this.no = el.querySelector('.lb-no span');
    this.of = el.querySelector('.lb-no em');
    this.state = el.querySelector('.lb-state');
    this.roll = el.querySelector('.lb-roll');
    this.del = el.querySelector('.lb-del');
    this.video = el.querySelector('.lb-video');
    this.media = el.querySelector('.lb-media');
    this.time = el.querySelector('.lb-time');
    this.fill = el.querySelector('.lb-fill');
    this.track = el.querySelector('.lb-track');
    this.muted = false;
    this.film = null;     // the roll's film simulation, for the labels
    this.printFor = null; // (item, priority) -> Promise of the URL of SpektraLab's print of it, or null
    this.amt = el.querySelector('.lb-amt');
    this.anim = null;     // a develop in progress
    this.fade = null;     // a print fading in over the LUT
    this.isOpen = false;
    this.busy = false;
    this.bindVideo();
    this.fig.addEventListener('click', e => { e.stopPropagation(); this.toggle(e); });
    this.shade.addEventListener('click', () => this.close());
    el.querySelector('.lb-close').addEventListener('click', () => this.close());
    el.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); this.go(-1); });
    el.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); this.go(1); });
    el.querySelector('.lb-del').addEventListener('click', e => { e.stopPropagation(); this.remove(); });
  }

  fit(it) {
    const W = innerWidth, H = innerHeight;
    const bw = W - 2 * Math.max(80, W * 0.07), bh = H - 92 - 118;
    const k = Math.min(bw / it.w, bh / it.h);
    const w = Math.round(it.w * k), h = Math.round(it.h * k);
    return { x: Math.round((W - w) / 2), y: Math.round(92 + (bh - h) / 2), w, h };
  }

  place(r) {
    Object.assign(this.fig.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    const k = Math.min(2, devicePixelRatio || 1);
    this.g.size(Math.round(r.w * k), Math.round(r.h * k));
  }

  // transform + clip that make the full-size figure F sit exactly on the strip's frame rect S
  pose(F, S) {
    const k = Math.max(S.w / F.w, S.h / F.h);
    const vw = S.w / k, vh = S.h / k;
    const dx = S.x + S.w / 2 - (F.x + F.w / 2), dy = S.y + S.h / 2 - (F.y + F.h / 2);
    return {
      transform: `translate(${dx}px, ${dy}px) scale(${k})`,
      clipPath: `inset(${(F.h - vh) / 2}px ${(F.w - vw) / 2}px round ${1.5 / k}px)`,
    };
  }

  label() {
    const it = this.items[this.i], what = it.video ? '画面' : '照片';
    const film = this.film && this.film.id !== 'none' ? this.film.name.replace(/^(Kodak|Fujifilm|Ilford) /, '') : null;
    this.no.textContent = String(this.i + 1).padStart(2, '0');
    this.of.textContent = '/ ' + String(this.items.length).padStart(2, '0');
    this.state.innerHTML = it.color
      ? `<b>${film || '原色'}</b><span>再点一次${what}，回到黑白</span>`
      : `<b>黑白</b><span>轻点${what}，显影${film ? '成 ' + film : '原色'}</span>`;
    this.del.lastChild.textContent = it.video ? '删除这段' : '删除这张';
  }

  get isVideo() { return !!this.items?.[this.i]?.video; }

  bindVideo() {
    const v = this.video, stop = e => e.stopPropagation();
    this.media.addEventListener('click', stop);
    this.media.addEventListener('pointerdown', stop);
    // the picture switches from the poster to the video itself once frames are flowing
    v.addEventListener('playing', () => {
      if (this.isVideo && this.g.el !== v) this.g.setSource(v);
      this.media.classList.remove('paused');
      this.run();
    });
    v.addEventListener('pause', () => this.media.classList.add('paused'));
    v.addEventListener('loadedmetadata', () => this.tick());
    v.addEventListener('seeked', () => { if (this.g.el === v) this.g.draw(); this.tick(); });
    this.media.querySelector('.lb-play').addEventListener('click', () => this.playPause());
    this.media.querySelector('.lb-mute').addEventListener('click', () => this.setMuted(!this.muted));
    // scrub: press on the track and drag
    const seek = e => {
      const r = this.track.getBoundingClientRect(), d = v.duration;
      if (Number.isFinite(d)) v.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * d;
      this.tick();
    };
    this.track.addEventListener('pointerdown', e => { this.track.setPointerCapture(e.pointerId); this.scrubbing = true; seek(e); });
    this.track.addEventListener('pointermove', e => { if (this.scrubbing) seek(e); });
    this.track.addEventListener('pointerup', () => { this.scrubbing = false; });
  }

  // progress line and clock
  tick() {
    const v = this.video, d = Number.isFinite(v.duration) ? v.duration : this.items?.[this.i]?.dur || 0;
    const mm = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    this.time.textContent = `${mm(v.currentTime || 0)} / ${mm(d)}`;
    this.fill.style.transform = `scaleX(${d ? Math.min(1, v.currentTime / d) : 0})`;
  }

  // draws on frames while something moves: a playing video, or a develop
  run() {
    if (this.raf) return;
    const loop = now => {
      this.raf = 0;
      if (!this.isOpen) return;
      const a = this.anim, playing = this.isVideo && !this.video.paused;
      if (a) {
        const k = Math.min(1, (now - a.t0) / a.dur);
        this.g.dev.r = developEase(k) * a.reach;
        if (k >= 1) { this.g.dev.from = this.g.dev.to; this.g.dev.r = 0; this.anim = null; }
      }
      if (this.fade) {
        const k = Math.min(1, (now - this.fade) / 520);
        this.g.printOn = k * k * (3 - 2 * k);
        if (k >= 1) this.fade = null;
      }
      if (playing) this.tick();
      this.g.draw();
      if (this.anim || this.fade || playing) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  playPause() {
    const v = this.video;
    if (!this.isVideo) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }

  setMuted(m) {
    this.muted = m;
    this.video.muted = m;
    this.media.classList.toggle('muted', m);
  }

  setVideo(it) {
    const v = this.video;
    this.fig.classList.toggle('is-video', !!it.video);
    if (!it.video) { this.unload(); return; }
    if (!this.routed) { this.o.onMedia?.(v); this.routed = true; }   // first video: inside the click that opened it
    v.src = it.videoUrl;
    v.muted = this.muted;
    this.media.classList.toggle('muted', this.muted);
    this.media.classList.remove('paused');
    v.play().catch(() => {});
    this.tick();
  }

  unload() {
    const v = this.video;
    v.pause();
    if (v.hasAttribute('src')) { v.removeAttribute('src'); v.load(); }
    this.fig.classList.remove('is-video');
  }

  // put an item up: its picture (a video's poster until the video itself plays), developed or not, and
  // for a photo SpektraLab's print of it, faded in over the LUT if it comes after the picture is up
  async show(it) {
    this.anim = null;
    this.fade = null;
    this.g.el = null;
    this.g.setPrint(null);
    Object.assign(this.g.dev, { from: it.color ? 1 : 0, to: it.color ? 1 : 0, r: 0 });
    this.setVideo(it);
    this.label();
    const print = !it.video && this.printFor ? this.printFor(it, 3).then(url => url && loadImage(url)) : null;
    let early = null;
    print?.then(im => { early = im; });
    const im = await loadImage(it.fullUrl);
    if (this.items[this.i] !== it) return;
    if (im && this.g.el !== this.video) this.g.setSource(im);
    if (early) { this.g.setPrint(early); this.g.printOn = 1; }
    this.g.draw();
    if (print && !early) print.then(pim => {
      if (!pim || this.items[this.i] !== it || !this.isOpen) return;
      this.g.setPrint(pim);
      this.fade = performance.now();
      this.run();
    });
    for (const d of [-1, 1]) {
      const n = this.items[this.i + d];
      if (!n) continue;
      new Image().src = n.fullUrl;
      if (!n.video) this.printFor?.(n, 2);
    }
  }

  // the strength slider moved (here or on the roll)
  setAmount(v) {
    this.g.amount = v;
    if (this.isOpen && !this.raf) this.g.draw();
  }

  async open(items, i, meta, from, opts = {}) {
    if (this.isOpen) return;
    this.items = items; this.i = i; this.isOpen = true; this.busy = true;
    if (opts.muted != null) this.muted = opts.muted;
    if (opts.lut) this.g.setLut(opts.lut);
    this.film = opts.film || null;
    this.printFor = opts.print || null;
    this.g.amount = opts.amount ?? 1;
    this.g.setGrain(opts.grain || null);
    this.g.setHalation(opts.halation || null);
    this.amt.hidden = !this.film || this.film.id === 'none';
    this.roll.innerHTML = `<b>${meta.name}</b><span>${meta.stock}</span>`;
    const it = items[i];
    const F = this.fit(it);
    this.place(F);
    this.el.hidden = false;
    this.o.onShow?.();
    await this.show(it);
    const frames = from
      ? [{ ...this.pose(F, from) }, { transform: 'none', clipPath: `inset(0px 0px round 2px)` }]
      : [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }];
    this.el.classList.add('on');
    await this.fig.animate(frames, { duration: from ? 760 : 420, easing: EASE, fill: 'both' }).finished;
    this.fig.getAnimations().forEach(a => { a.commitStyles?.(); a.cancel(); });
    this.fig.style.transform = ''; this.fig.style.clipPath = 'inset(0px 0px round 2px)';
    this.busy = false;
  }

  async close() {
    if (!this.isOpen || this.busy) return;
    this.busy = true;
    const F = this.fig.getBoundingClientRect();
    const to = this.o.rectFor?.(this.i);
    this.el.classList.remove('on');
    const R = { x: F.left, y: F.top, w: F.width, h: F.height };
    this.video.pause();
    const frames = to
      ? [{ transform: 'none', clipPath: 'inset(0px 0px round 2px)' }, this.pose(R, to)]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }];
    this.o.onHide?.();
    await this.fig.animate(frames, { duration: to ? 620 : 300, easing: EASE, fill: 'forwards' }).finished;
    this.el.hidden = true;
    this.fig.getAnimations().forEach(a => a.cancel());
    this.unload();
    this.isOpen = false; this.busy = false;
    this.o.onClose?.();
  }

  toggle(e) {
    if (this.busy) return;
    const it = this.items[this.i];
    it.color = !it.color;
    const r = this.fig.getBoundingClientRect(), k = this.g.canvas.width / r.width;
    const x = e ? e.clientX - r.left : r.width / 2, y = e ? e.clientY - r.top : r.height / 2;
    const reach = (Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) + 120) * k;
    // a develop already running settles where it was heading before the new one starts
    Object.assign(this.g.dev, { from: this.anim ? this.g.dev.to : this.g.dev.from, to: it.color ? 1 : 0, x: x * k, y: y * k, r: 0 });
    this.anim = { t0: performance.now(), dur: 1100, reach };
    this.run();
    this.label();
    this.o.onColor?.(it);
  }

  async go(d) {
    const n = this.i + d;
    if (this.busy || n < 0 || n >= this.items.length) return;
    this.busy = true;
    await this.fig.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-d * 36}px)` }],
      { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished;
    this.i = n;
    const it = this.items[n];
    this.place(this.fit(it));
    this.o.onIndex?.(n);
    await this.show(it);
    this.fig.getAnimations().forEach(a => a.cancel());
    await this.fig.animate([{ opacity: 0, transform: `translateX(${d * 36}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 340, easing: EASE }).finished;
    this.busy = false;
  }

  async remove() {
    if (this.busy) return;
    const it = this.items[this.i];
    this.busy = true;
    await this.fig.animate([{ opacity: 1, transform: 'none', filter: 'none' }, { opacity: 0, transform: 'translateY(26px) scale(.97)', filter: 'blur(6px)' }],
      { duration: 300, easing: 'ease-in', fill: 'forwards' }).finished;
    this.items.splice(this.i, 1);
    this.unload();
    await this.o.onDelete?.(it);
    if (!this.items.length) {
      this.el.classList.remove('on');
      this.o.onHide?.();
      await new Promise(r => setTimeout(r, 260));
      this.el.hidden = true; this.isOpen = false; this.busy = false;
      this.fig.getAnimations().forEach(a => a.cancel());
      this.o.onClose?.();
      return;
    }
    this.i = Math.min(this.i, this.items.length - 1);
    const next = this.items[this.i];
    this.place(this.fit(next));
    this.o.onIndex?.(this.i);
    await this.show(next);
    this.fig.getAnimations().forEach(a => a.cancel());
    await this.fig.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE }).finished;
    this.busy = false;
  }
}
