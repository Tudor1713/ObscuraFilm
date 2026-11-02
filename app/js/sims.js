// Film simulations baked from SpektraLab (see app/luts/NOTICE.md). Each is a 33^3 LUT that takes an sRGB
// picture to how that film, printed on its paired paper (slide film: scanned), renders it. A roll uses
// one; its strip also takes on that stock's film base, edge-print ink and edge text.

export const LUT_N = 33;

const NEG_K = { base: '#de9762', ink: '#3c1e0e' };   // Kodak colour negative: orange mask
const NEG_F = { base: '#db8e63', ink: '#3a1a10' };   // Fujicolor: a pinker orange
const ECN = { base: '#c98656', ink: '#2e1608' };     // motion-picture negative, rem-jet washed off
const SLIDE = { base: '#131012', ink: '#f1dcaa' };   // reversal: the rebate is black
const BW = { base: '#cecacc', ink: '#19171a' };      // silver negative: grey-clear base

export const SIMS = [
  { id: 'none', name: '原色', note: '不做胶片模拟', group: 'none' },
  { id: 'kodak_gold_200', name: 'Kodak Gold 200', group: 'neg', edge: 'KODAK GOLD 200', ...NEG_K, base: '#d98a52' },
  { id: 'kodak_ultramax_400', name: 'Kodak Ultramax 400', group: 'neg', edge: 'KODAK UM 400', ...NEG_K, base: '#da8b54' },
  { id: 'kodak_portra_160', name: 'Kodak Portra 160', group: 'neg', edge: 'KODAK PORTRA 160', ...NEG_K, base: '#e1a06c' },
  { id: 'kodak_portra_400', name: 'Kodak Portra 400', group: 'neg', edge: 'KODAK PORTRA 400', ...NEG_K, base: '#e09c66' },
  { id: 'kodak_portra_800', name: 'Kodak Portra 800', group: 'neg', edge: 'KODAK PORTRA 800', ...NEG_K },
  { id: 'kodak_portra_800_push1', name: 'Kodak Portra 800 · 增感 1 档', group: 'neg', edge: 'KODAK PORTRA 800  +1', ...NEG_K },
  { id: 'kodak_portra_800_push2', name: 'Kodak Portra 800 · 增感 2 档', group: 'neg', edge: 'KODAK PORTRA 800  +2', ...NEG_K },
  { id: 'kodak_ektar_100', name: 'Kodak Ektar 100', group: 'neg', edge: 'KODAK EKTAR 100', ...NEG_K, base: '#dd9258' },
  { id: 'fujifilm_c200', name: 'Fujifilm C200', group: 'neg', edge: 'FUJI C200', ...NEG_F },
  { id: 'fujifilm_pro_400h', name: 'Fujifilm Pro 400H', group: 'neg', edge: 'FUJIFILM PRO 400H', ...NEG_F, base: '#de9568' },
  { id: 'fujifilm_xtra_400', name: 'Fujifilm X-Tra 400', group: 'neg', edge: 'FUJICOLOR X-TRA 400', ...NEG_F, base: '#d98b5f' },
  { id: 'kodak_ektachrome_100', name: 'Kodak Ektachrome 100', group: 'slide', edge: 'KODAK E100', ...SLIDE },
  { id: 'kodak_kodachrome_64', name: 'Kodak Kodachrome 64', group: 'slide', edge: 'KODACHROME 64', ...SLIDE, base: '#151012' },
  { id: 'fujifilm_provia_100f', name: 'Fujifilm Provia 100F', group: 'slide', edge: 'FUJI RDP III', ...SLIDE },
  { id: 'fujifilm_velvia_100', name: 'Fujifilm Velvia 100', group: 'slide', edge: 'FUJI RVP 100', ...SLIDE, base: '#151112' },
  { id: 'cinestill_800t', name: 'CineStill 800T', group: 'cine', edge: 'CINESTILL 800T', base: '#d8c2ad', ink: '#3b2318' },
  { id: 'kodak_vision3_50d', name: 'Kodak Vision3 50D', group: 'cine', edge: 'KODAK 5203 VISION3 50D', ...ECN },
  { id: 'kodak_vision3_250d', name: 'Kodak Vision3 250D', group: 'cine', edge: 'KODAK 5207 VISION3 250D', ...ECN },
  { id: 'kodak_vision3_200t', name: 'Kodak Vision3 200T', group: 'cine', edge: 'KODAK 5213 VISION3 200T', ...ECN },
  { id: 'kodak_vision3_500t', name: 'Kodak Vision3 500T', group: 'cine', edge: 'KODAK 5219 VISION3 500T', ...ECN },
  { id: 'kodak_verita_200d', name: 'Kodak Verita 200D', group: 'cine', edge: 'KODAK VERITA 200D', ...ECN },
  { id: 'kodak_tri_x_400', name: 'Kodak Tri-X 400', group: 'bw', edge: 'KODAK 400TX', ...BW, base: '#cbc7c8' },
  { id: 'kodak_tmax_100', name: 'Kodak T-Max 100', group: 'bw', edge: 'KODAK 100TMX', ...BW },
  { id: 'ilford_hp5_plus_400', name: 'Ilford HP5 Plus 400', group: 'bw', edge: 'ILFORD HP5 PLUS', ...BW, base: '#d1cdd2' },
  { id: 'fujifilm_neopan_acros_100_ii', name: 'Fujifilm Acros II', group: 'bw', edge: 'FUJI ACROS II', ...BW, base: '#d3d3d3' },
];

export const GROUPS = [
  ['neg', '彩色负片'], ['slide', '反转片'], ['cine', '电影胶片'], ['bw', '黑白'], ['none', '不模拟'],
];

// each can on the shelf starts out as its own film (or the nearest one SpektraLab has)
const DEFAULT = {
  gold200: 'kodak_gold_200', velvia50: 'fujifilm_velvia_100', hp5: 'ilford_hp5_plus_400', c200: 'fujifilm_c200',
  cine800t: 'cinestill_800t', portra400: 'kodak_portra_400', trix400: 'kodak_tri_x_400', lomo800: 'kodak_portra_800',
  e100: 'kodak_ektachrome_100', vista200: 'fujifilm_c200', acros100: 'fujifilm_neopan_acros_100_ii', lucky100: 'kodak_tmax_100',
};

// grain for what the darkroom cannot print (a playing video, a photo before its print arrives): measured
// from SpektraLab's grain on flat grey fields at 135, as the standard deviation of the print in 8-bit
// levels: r, g, b at the peak, which sits at output level mu with width w (a gaussian in the output value)
const GRAIN = {
  cinestill_800t: [6.5, 4.1, 6.8, 0.43, 0.3], fujifilm_c200: [6.5, 5.8, 9.4, 0.47, 0.23],
  fujifilm_neopan_acros_100_ii: [5.0, 5.0, 5.0, 0.52, 0.24], fujifilm_pro_400h: [6.0, 4.2, 6.6, 0.46, 0.25],
  fujifilm_provia_100f: [2.9, 2.4, 3.1, 0.56, 0.39], fujifilm_velvia_100: [2.8, 2.8, 3.8, 0.56, 0.36],
  fujifilm_xtra_400: [8.1, 6.5, 9.8, 0.48, 0.22], ilford_hp5_plus_400: [4.8, 4.8, 4.8, 0.51, 0.24],
  kodak_ektachrome_100: [2.9, 2.6, 3.9, 0.55, 0.39], kodak_ektar_100: [5.5, 3.6, 6.0, 0.47, 0.25],
  kodak_gold_200: [5.1, 3.3, 5.5, 0.47, 0.26], kodak_kodachrome_64: [2.6, 2.4, 3.0, 0.53, 0.37],
  kodak_portra_160: [4.7, 3.3, 5.6, 0.47, 0.26], kodak_portra_400: [5.5, 3.5, 5.8, 0.47, 0.26],
  kodak_portra_800: [5.4, 3.5, 6.1, 0.47, 0.26], kodak_portra_800_push1: [6.8, 4.3, 7.2, 0.48, 0.23],
  kodak_portra_800_push2: [7.8, 4.8, 8.3, 0.48, 0.21], kodak_tmax_100: [4.3, 4.3, 4.3, 0.49, 0.26],
  kodak_tri_x_400: [4.4, 4.4, 4.4, 0.5, 0.25], kodak_ultramax_400: [5.3, 3.5, 6.1, 0.47, 0.26],
  kodak_verita_200d: [5.8, 3.4, 5.6, 0.43, 0.3], kodak_vision3_200t: [5.8, 3.6, 5.7, 0.43, 0.3],
  kodak_vision3_250d: [6.5, 4.2, 6.7, 0.43, 0.3], kodak_vision3_500t: [6.5, 4.1, 6.8, 0.43, 0.3],
  kodak_vision3_50d: [5.3, 3.4, 5.4, 0.43, 0.3],
};
export function grainOf(id) {
  const g = GRAIN[id];
  return g ? { amp: g.slice(0, 3).map(v => v / 255), mu: g[3], w: g[4], mono: simById(id).group === 'bw' } : null;
}

// Video approximation, based on the measured Gold/CineStill scatter radii and the profiles'
// antihalation classification. The other stocks use their backing class, not an individually fitted
// spectral model. Photos always use SpektraLab's full model once their print is ready.
const WEAK_BACKING = new Set(['fujifilm_c200','fujifilm_neopan_acros_100_ii','fujifilm_xtra_400','ilford_hp5_plus_400','kodak_gold_200','kodak_kodachrome_64','kodak_tmax_100','kodak_tri_x_400','kodak_ultramax_400']);
export function halationOf(id) {
  const sim = simById(id);
  if (sim.id === 'none') return null;
  if (id === 'cinestill_800t') return { near:[.35,.049,0], far:[.35,0,0], radii:[12.47/1800,41.64/1800], headroom:true, threshold:.1166, gamma:1.43 };
  const weak = WEAK_BACKING.has(id), mono = sim.group === 'bw';
  const near = mono ? [.18,.18,.18] : weak ? [.7423,.000043,.00476] : [.045,.008,.002];
  const far = mono ? [.025,.025,.025] : weak ? [.000002,.11736,.000906] : [.008,.002,0];
  return {near, far, radii:[4.90/1800,5.49/1800], headroom:false, threshold:.5, gamma:1};
}

export const simById = id => SIMS.find(s => s.id === id) || SIMS[0];
export const simOf = (roll, stockId) => simById(roll?.sim ?? DEFAULT[stockId] ?? 'none');

// LUT data as RGBA8, r fastest then g then b (the layout of a WebGL 3D texture); 'none' is the identity
const loaded = new Map();
export function lutData(id) {
  if (!loaded.has(id)) loaded.set(id, id === 'none' ? Promise.resolve(identity()) : load(id));
  return loaded.get(id);
}

function identity() {
  const N = LUT_N, d = new Uint8Array(N * N * N * 4);
  for (let b = 0, i = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++, i += 4) {
    d[i] = Math.round(r / (N - 1) * 255); d[i + 1] = Math.round(g / (N - 1) * 255); d[i + 2] = Math.round(b / (N - 1) * 255); d[i + 3] = 255;
  }
  return d;
}

async function load(id) {
  const N = LUT_N;
  const bmp = await createImageBitmap(await (await fetch(`luts/${id}.png`)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(N * N, N), g = c.getContext('2d', { colorSpace: 'srgb' });
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const px = g.getImageData(0, 0, N * N, N).data, d = new Uint8Array(N * N * N * 4);
  // strip: x = r + b*N, y = g  ->  3D: r + g*N + b*N*N
  for (let b = 0; b < N; b++) for (let gg = 0; gg < N; gg++) for (let r = 0; r < N; r++) {
    const s = (gg * N * N + b * N + r) * 4, t = (b * N * N + gg * N + r) * 4;
    d[t] = px[s]; d[t + 1] = px[s + 1]; d[t + 2] = px[s + 2]; d[t + 3] = 255;
  }
  return d;
}

// grade a small RGBA image on the CPU (for the picker's previews)
export function gradePixels(src, lut) {
  const N = LUT_N, out = new Uint8ClampedArray(src.length), k = (N - 1) / 255;
  const at = (r, g, b, c) => lut[((b * N + g) * N + r) * 4 + c];
  for (let i = 0; i < src.length; i += 4) {
    const x = src[i] * k, y = src[i + 1] * k, z = src[i + 2] * k;
    const r0 = Math.min(N - 2, x | 0), g0 = Math.min(N - 2, y | 0), b0 = Math.min(N - 2, z | 0);
    const fr = x - r0, fg = y - g0, fb = z - b0;
    for (let c = 0; c < 3; c++) {
      const c00 = at(r0, g0, b0, c) * (1 - fr) + at(r0 + 1, g0, b0, c) * fr;
      const c01 = at(r0, g0 + 1, b0, c) * (1 - fr) + at(r0 + 1, g0 + 1, b0, c) * fr;
      const c10 = at(r0, g0, b0 + 1, c) * (1 - fr) + at(r0 + 1, g0, b0 + 1, c) * fr;
      const c11 = at(r0, g0 + 1, b0 + 1, c) * (1 - fr) + at(r0 + 1, g0 + 1, b0 + 1, c) * fr;
      out[i + c] = (c00 * (1 - fg) + c01 * fg) * (1 - fb) + (c10 * (1 - fg) + c11 * fg) * fb;
    }
    out[i + 3] = 255;
  }
  return out;
}
