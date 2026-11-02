// HEIC/HEIF support: sniff the file, decode it in heic-worker.js. The worker (and the wasm heap a
// 12-megapixel decode grows) is let go once imports have been idle for a while.

const BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const ascii = (u8, i) => String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);

// decided by the bytes, not the name: phones and chat apps hand out JPEGs called .HEIC. The ftyp box
// lists the brands; AVIF also says mif1, but Chromium reads that one itself.
export async function isHeif(file) {
  const u8 = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (u8.length < 16 || ascii(u8, 4) !== 'ftyp') return false;
  const end = Math.min(u8.length, new DataView(u8.buffer).getUint32(0));
  const brands = [ascii(u8, 8)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(u8, i));
  if (brands.some(b => b === 'avif' || b === 'avis')) return false;
  return brands.some(b => BRANDS.has(b)) || /\.(heic|heif|hif)$/i.test(file.name);
}

// wide gamut if the colour box says P3 (nclx primaries 11/12) or carries a Display P3 ICC profile
function isP3(u8) {
  const n = Math.min(u8.length - 12, 1 << 20);
  const utf16 = [...'Display P3'].flatMap(ch => [0, ch.charCodeAt(0)]);
  const has = (from, to, seq) => {
    outer: for (let i = from; i <= to - seq.length; i++) {
      for (let j = 0; j < seq.length; j++) if (u8[i + j] !== seq[j]) continue outer;
      return true;
    }
    return false;
  };
  for (let i = 4; i < n; i++) {
    if (u8[i] !== 0x63 || ascii(u8, i) !== 'colr') continue;
    const type = ascii(u8, i + 4);
    if (type === 'nclx') { const prim = u8[i + 8] << 8 | u8[i + 9]; if (prim === 11 || prim === 12) return true; }
    if (type === 'prof' || type === 'rICC') {
      const size = new DataView(u8.buffer, u8.byteOffset).getUint32(i - 4);
      const to = Math.min(u8.length, i - 4 + size);
      if (has(i, to, [...'Display P3'].map(c => c.charCodeAt(0))) || has(i, to, utf16)) return true;
    }
  }
  return false;
}

// a small pool: each worker decodes one photo at a time, so a batch from a phone goes two by two
const POOL = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
const pool = [], queue = [];
let idle = 0;

function spawn() {
  const w = { worker: new Worker(new URL('./heic-worker.js', import.meta.url), { type: 'module' }), job: null };
  w.worker.onmessage = ({ data }) => {
    const job = w.job;
    w.job = null;
    if (data.error) job.rej(new Error(data.error)); else job.res(data.bmp);
    pump();
  };
  w.worker.onerror = e => {
    w.job?.rej(new Error(e.message || 'heic worker failed'));
    w.worker.terminate();
    pool.splice(pool.indexOf(w), 1);
    pump();
  };
  pool.push(w);
  return w;
}

function pump() {
  clearTimeout(idle);
  while (queue.length) {
    const w = pool.find(x => !x.job) || (pool.length < POOL ? spawn() : null);
    if (!w) return;
    w.job = queue.shift();
    w.worker.postMessage({ id: 0, buf: w.job.buf, p3: w.job.p3 }, [w.job.buf]);
  }
  if (pool.every(x => !x.job)) idle = setTimeout(() => { for (const x of pool.splice(0)) x.worker.terminate(); }, 20000);
}

export async function decodeHeif(file) {
  const buf = await file.arrayBuffer();
  const p3 = isP3(new Uint8Array(buf));
  return new Promise((res, rej) => { queue.push({ buf, p3, res, rej }); pump(); });
}
