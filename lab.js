// The darkroom: SpektraLab's own renderer (spektralab-host.exe, GPL-3.0, bundled under resources\spektralab)
// runs beside the app and prints every frame the way SpektraLab would with that film and paper: its auto
// exposure, grain, halation, coupler effects, enlarger filtration and glare all included. Prints are JPEGs
// in <userData>\lab, served to the page as anhe://app/lab/<key>.jpg; the page shows the film's LUT until
// a print is ready. Without the engine (no Vulkan, files missing) every request answers null and the LUT
// stays.
const { app, nativeImage } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// part of every print's file name: bump it when the render parameters change
const VERSION = 'v1';
// long edge of a print: s = the strip (from the stored thumb), l = the lightbox (from the full copy),
// p = the film picker's contact sheet (from the thumb)
const SIZES = { s: 800, l: 2048, p: 288 };
const KEY = /^[\w.~-]{1,160}$/;

const dirs = () => {
  const root = path.join(app.getPath('userData'), 'lab');
  return { prints: root, src: path.join(root, 'src') };
};

// the packaged app carries the engine in resources\spektralab (tools/pack.js); from source it is
// SPEKTRALAB_DIR, else the copy checked in under build\runtime, else a SpektraLab folder beside this one
function engineDir() {
  const near = [path.join(__dirname, 'build', 'runtime', 'spektralab'), path.join(__dirname, '..', 'spektralab')];
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'spektralab')
    : process.env.SPEKTRALAB_DIR || near.find(d => fs.existsSync(path.join(d, 'spektralab-host.exe'))) || near[1];
  const res = fs.existsSync(path.join(dir, 'engine')) ? path.join(dir, 'engine') : path.join(dir, 'host', 'engine');
  return { exe: path.join(dir, 'spektralab-host.exe'), res };
}

// each film is printed on the paper its LUT was baked with (app/luts/bake-report.json); slide film is scanned
let pairs = null;
function pairOf(stock) {
  if (!pairs) {
    pairs = {};
    for (const r of JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'luts', 'bake-report.json'), 'utf8'))) if (!r.error) pairs[r.id] = r;
  }
  return pairs[stock];
}
// SpektraLab's per-stock grain strength (agents: ownGrain)
const OWN_GRAIN = { kodak_tri_x_400: 1.7, ilford_hp5_plus_400: 1.49, kodak_tmax_100: 0.74, fujifilm_neopan_acros_100_ii: 0.64 };

// what SpektraLab's own window sends for a fresh photo on 135 film (agents/agent.mjs: FILM_PARAMS_DEFAULT
// through wire()), with the film and paper set
function params(stock) {
  const pr = pairOf(stock), mono = pr.print === 'ilford_multigrade_iv_rc';
  return {
    film_stock: stock, print_stock: pr.print, scan_film: !!pr.scan,
    exposure_compensation_ev: 0, auto_exposure: true, auto_exposure_method: 'balanced', film_format_mm: 36,
    grain_active: true, grain_sublayers_active: !mono, halation_active: true, glare_active: true,
    print_exposure: 1, y_filter_shift: 0, m_filter_shift: 0, filter_shift_scale: 40,
    extended_dynamic_range: false, preflash_exposure: 0, contrast_mask_active: false, scene_latitude_active: false,
    halation_amount: 1, halation_scatter_amount: 1, grain_amount: OWN_GRAIN[stock] ?? 1,
    dir_couplers_active: true, dir_couplers_amount: 1, glare_amount: 1,
    antihalation_removed: false, halation_boost_ev: 0, halation_headroom_ev: 4,
    input_color_space: 'sRGB', input_cctf_decoding: true,
    ...(mono ? { c_filter_neutral: 0, m_filter_neutral: 0, y_filter_neutral: 68 } : {}),
  };
}
const GEO = { crop: { x: 0, y: 0, width: 1, height: 1 }, angle: 0, quarterTurns: 0, flipH: false, flipV: false, aspect: 'free', intendedSize: null, lockedRatio: null };
const ZONE = { hue: 0, saturation: 0, luminance: 0 }, CURVE = { points: [[0, 0], [1, 1]] };
const ADJ = {
  enabled: false, temperature: 0, tint: 0, exposure: 0, contrast: 0, brightness: 0, saturation: 0, highlights: 0, shadows: 0, blackPoint: 0, whitePoint: 0,
  curves: { rgb: CURVE, luma: CURVE, red: CURVE, green: CURVE, blue: CURVE },
  colorBalance: { master: ZONE, shadows: ZONE, midtones: ZONE, highlights: ZONE }, vignette: { amount: 0, midpoint: 50 },
};

// spektralab-host speaks frames of [u32 json length][u32 payload length][json][payload] on stdin/stdout
class Host {
  constructor({ exe, res }) {
    this.p = spawn(exe, ['--resources', res], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.buf = Buffer.alloc(0); this.next = 1; this.waiting = new Map(); this.alive = true;
    const fail = err => {
      this.alive = false;
      for (const w of this.waiting.values()) w.rej(err);
      this.waiting.clear();
    };
    this.p.on('error', fail);
    this.p.on('exit', code => fail(new Error('engine exited ' + code)));
    this.p.stdin.on('error', () => {});
    this.p.stderr.on('data', () => {});
    this.p.stdout.on('data', b => {
      this.buf = Buffer.concat([this.buf, b]);
      while (this.buf.length >= 8) {
        const h = this.buf.readUInt32LE(0), n = this.buf.readUInt32LE(4);
        if (this.buf.length < 8 + h + n) return;
        const q = JSON.parse(this.buf.subarray(8, 8 + h).toString()), payload = Buffer.from(this.buf.subarray(8 + h, 8 + h + n));
        this.buf = this.buf.subarray(8 + h + n);
        const w = this.waiting.get(q.id);
        if (!w) continue;
        this.waiting.delete(q.id); clearTimeout(w.timer);
        if (q.ok === false) w.rej(new Error(JSON.stringify(q.error))); else w.res({ result: q.result, payload });
      }
    });
  }
  call(method, params = {}, ms = 30000) {
    if (!this.alive) return Promise.reject(new Error('engine not running'));
    const id = this.next++, json = Buffer.from(JSON.stringify({ id, method, params }));
    const pre = Buffer.alloc(8); pre.writeUInt32LE(json.length, 0); pre.writeUInt32LE(0, 4);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.waiting.delete(id); rej(new Error(method + ' timed out')); this.kill(); }, ms);
      this.waiting.set(id, { res, rej, timer });
      this.p.stdin.write(Buffer.concat([pre, json]));
    });
  }
  kill() { this.alive = false; try { this.p.kill(); } catch {} }
}

class Lab {
  constructor() {
    this.queue = [];          // waiting jobs, best first
    this.jobs = new Map();    // key -> job (waiting or printing)
    this.host = null;
    this.failures = 0;        // engine starts that failed in a row
    this.busy = false;
  }

  file(key) { return path.join(dirs().prints, `${VERSION}~${key}.jpg`); }
  url(key) { return `anhe://app/lab/${VERSION}~${key}.jpg`; }
  srcFile(photo, which) { return path.join(dirs().src, `${photo}-${which === 'l' ? 'l' : 's'}.jpg`); }
  get off() { return this.failures >= 2; }

  // req: { key, photo, demo, which, stock, prio, group } -> { url } | { need: 'src' } | null
  async print(req) {
    if (!KEY.test(req.key) || !KEY.test(req.photo) || !SIZES[req.which] || !pairOf(req.stock) || this.off) return null;
    const out = this.file(req.key);
    if (fs.existsSync(out)) return { url: this.url(req.key) };
    let src;
    if (req.demo) {
      src = path.normalize(path.join(__dirname, 'app', req.demo));
      if (!src.startsWith(path.join(__dirname, 'app')) || !fs.existsSync(src)) return null;
    } else {
      src = this.srcFile(req.photo, req.which);
      if (!fs.existsSync(src)) return { need: 'src' };
    }
    let job = this.jobs.get(req.key);
    if (job) { if ((req.prio || 0) > job.prio) { job.prio = req.prio; this.sort(); } return job.done; }
    job = { key: req.key, src, out, stock: req.stock, size: SIZES[req.which], prio: req.prio || 0, group: req.group || '', at: this.jobs.size };
    job.done = new Promise(res => { job.res = res; });
    this.jobs.set(req.key, job);
    this.queue.push(job);
    this.sort();
    this.pump();
    return job.done;
  }

  sort() { this.queue.sort((a, b) => b.prio - a.prio || a.at - b.at); }

  // a photo's stored copy, written once so the engine can open it
  saveSrc(photo, which, buf) {
    if (!KEY.test(photo)) return false;
    fs.mkdirSync(dirs().src, { recursive: true });
    const f = this.srcFile(photo, which);
    fs.writeFileSync(f + '.part', Buffer.from(buf));
    fs.renameSync(f + '.part', f);
    return true;
  }

  // drop waiting jobs of a group (a roll's strip for a film that is no longer chosen)
  drop(group) {
    this.queue = this.queue.filter(j => {
      if (j.group !== group) return true;
      this.jobs.delete(j.key); j.res(null);
      return false;
    });
  }

  // a deleted photo: its stored copies and prints go
  forget(photo) {
    if (!KEY.test(photo)) return;
    const { prints, src } = dirs();
    for (const d of [prints, src]) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) if (f.startsWith(`${VERSION}~${photo}~`) || f.startsWith(`${photo}-`)) fs.rmSync(path.join(d, f), { force: true });
    }
  }

  async ensureHost() {
    if (this.host?.alive) return this.host;
    const e = engineDir();
    if (!fs.existsSync(e.exe)) { this.failures = 2; throw new Error('no engine at ' + e.exe); }
    const h = new Host(e);
    try {
      await h.call('hello', {}, 20000);
    } catch (err) {
      h.kill(); this.failures++;
      throw err;
    }
    this.failures = 0;
    return (this.host = h);
  }

  async pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      let url = null;
      for (let attempt = 0; attempt < 2 && !url && !this.off; attempt++) {
        try { url = await this.render(job); } catch (err) { console.warn('[lab]', job.key, err.message); }
      }
      this.jobs.delete(job.key);
      job.res(url ? { url } : null);
    }
    this.busy = false;
  }

  async render(job) {
    const h = await this.ensureHost(), p = params(job.stock);
    const session = (await h.call('open', { path: job.src.split(path.sep).join('/'), params: p })).result.session;
    let r;
    try {
      r = await h.call('render_view', {
        session, params: p, adjustments: ADJ, geometry: GEO, source_geometry: GEO,
        tier: 'preview', display: 'srgb', long_edge: job.size, generation: 1, format: 'rgba8',
      });
    } finally {
      h.call('close', { session }).catch(() => {});
    }
    const { width, height } = r.result.image, px = r.payload;
    if (px.length < width * height * 4) throw new Error('short print');
    for (let i = 0; i < width * height * 4; i += 4) { const t = px[i]; px[i] = px[i + 2]; px[i + 2] = t; px[i + 3] = 255; }   // RGBA -> BGRA
    const jpg = nativeImage.createFromBitmap(px, { width, height }).toJPEG(92);
    fs.mkdirSync(dirs().prints, { recursive: true });
    fs.writeFileSync(job.out + '.part', jpg);
    fs.renameSync(job.out + '.part', job.out);
    return this.url(job.key);
  }

  // anhe://app/lab/<name> -> the print on disk
  servePath(name) {
    if (!/^[\w.~-]+\.jpg$/.test(name)) return null;
    return path.join(dirs().prints, name);
  }

  // prints from older render parameters go, then the oldest until the darkroom is under ~2 GB
  prune(max = 2e9) {
    const { prints } = dirs();
    if (!fs.existsSync(prints)) return;
    const files = fs.readdirSync(prints).filter(f => f.endsWith('.jpg')).map(f => {
      const s = fs.statSync(path.join(prints, f));
      return { f, size: s.size, t: s.mtimeMs };
    }).sort((a, b) => a.t - b.t);
    let total = files.reduce((a, x) => a + x.size, 0);
    for (const x of files) {
      if (x.f.startsWith(VERSION + '~') && total <= max) continue;
      fs.rmSync(path.join(prints, x.f), { force: true });
      total -= x.size;
    }
  }

  stop() { this.host?.p.stdin.end(); setTimeout(() => this.host?.kill(), 800).unref?.(); }
}

module.exports = { Lab };
