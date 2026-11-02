// IndexedDB persistence: one record per roll (name, photo order) and one per photo (blobs or a bundled
// demo path, size, and whether it has been developed back to colour). A video is a photo record with
// kind 'video': its original file in `video`, a poster frame in `full`/`thumb`, and its length in `dur`.
import { isHeif, decodeHeif } from './heic.js';

const DB_NAME = 'anhe', DB_VER = 1;
let dbp;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('rolls', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const all = store => tx(store, 'readonly', s => s.getAll());
export const put = (store, v) => tx(store, 'readwrite', s => { s.put(v); });
export const del = (store, k) => tx(store, 'readwrite', s => { s.delete(k); });
export const putMany = (store, list) => tx(store, 'readwrite', s => { for (const v of list) s.put(v); });
export const getMeta = k => tx('meta', 'readonly', s => s.get(k)).then(r => r?.v);
export const setMeta = (k, v) => put('meta', { k, v });

// object URLs for stored blobs, created on demand
const urls = new Map();
export function photoUrls(p) {
  if (p.demo) return { thumbUrl: p.demo, fullUrl: p.demo };
  let u = urls.get(p.id);
  if (!u) {
    u = { thumbUrl: URL.createObjectURL(p.thumb), fullUrl: URL.createObjectURL(p.full) };
    if (p.video) u.videoUrl = URL.createObjectURL(p.video);
    urls.set(p.id, u);
  }
  return u;
}
export function dropUrls(id) {
  const u = urls.get(id);
  if (!u) return;
  for (const k of ['thumbUrl', 'fullUrl', 'videoUrl']) if (u[k]) URL.revokeObjectURL(u[k]);
  urls.delete(id);
}

export const isVideo = f => /^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|ogv|3gp)$/i.test(f.name);

async function scaled(bmp, max, quality) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/jpeg', quality });
}

// a video keeps its original file; a frame from a moment in (past any fade up from black) becomes its
// poster on the strip and in the lightbox while the video itself loads
async function ingestVideo(file) {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  const once = (ok, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('video timed out')), ms);
    v.addEventListener(ok, () => { clearTimeout(t); res(); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); rej(v.error || new Error('video')); }, { once: true });
  });
  try {
    await once('loadeddata', 20000);
    if (!v.videoWidth) throw new Error('no picture in this file');
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    v.currentTime = Math.min(1, dur * 0.12 || 0.5);
    await once('seeked', 20000);
    const bmp = await createImageBitmap(v);
    const [full, thumb] = await Promise.all([scaled(bmp, 2560, 0.9), scaled(bmp, 1280, 0.88)]);
    const r = { kind: 'video', w: bmp.width, h: bmp.height, dur, full, thumb, video: file };
    bmp.close();
    return r;
  } finally {
    v.removeAttribute('src'); v.load();
    URL.revokeObjectURL(url);
  }
}

// decode a dropped/picked file into a full-size copy for the lightbox and a smaller one for the strip
export async function ingest(file) {
  if (isVideo(file)) return ingestVideo(file);
  const bmp = await isHeif(file) ? await decodeHeif(file) : await createImageBitmap(file, { imageOrientation: 'from-image' });
  const [full, thumb] = await Promise.all([scaled(bmp, 2560, 0.92), scaled(bmp, 1280, 0.88)]);
  const r = { w: bmp.width, h: bmp.height, full, thumb };
  bmp.close();
  return r;
}
