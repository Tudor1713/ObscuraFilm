// bake.mjs <outdir> [stock ...]: for each film, find the fixed exposure (exposure_baseline_ev; the
// compensation EV only acts on auto exposure) at which an 18% grey card prints as SpektraLab's own auto
// exposure prints it, then render the 33^3 chart at that exposure.
import { Host, SPK } from './host.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// chart33.png and grey.png come from `python chart.py` in this folder
const DIR = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');
const [outDir, ...only] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const catalog = JSON.parse(readFileSync(`${SPK}/agents/StockCatalog.json`, 'utf8')).stocks;
const films = catalog.filter(s => s.stage === 'filming' && (!only.length || only.includes(s.id)));

const GEO = { crop: { x: 0, y: 0, width: 1, height: 1 }, angle: 0, quarterTurns: 0, flipH: false, flipV: false, aspect: 'free', intendedSize: null, lockedRatio: null };
const ZONE = { hue: 0, saturation: 0, luminance: 0 }, CURVE = { points: [[0, 0], [1, 1]] };
const ADJ = { enabled: false, temperature: 0, tint: 0, exposure: 0, contrast: 0, brightness: 0, saturation: 0, highlights: 0, shadows: 0, blackPoint: 0, whitePoint: 0,
  curves: { rgb: CURVE, luma: CURVE, red: CURVE, green: CURVE, blue: CURVE }, colorBalance: { master: ZONE, shadows: ZONE, midtones: ZONE, highlights: ZONE }, vignette: { amount: 0, midpoint: 50 } };

function paramsFor(s) {
  const positive = s.type === 'positive', mono = !!s.monochrome;
  return {
    film_stock: s.id,
    print_stock: s.targetPrint || 'kodak_portra_endura',
    scan_film: positive,
    film_format_mm: 200, lens_blur_um: 0,
    grain_active: false, grain_sublayers_active: false, halation_active: false, glare_active: false,
    input_color_space: 'sRGB', input_cctf_decoding: true,
    ...(mono ? { c_filter_neutral: 0, m_filter_neutral: 0, y_filter_neutral: 68 } : {}),
  };
}

const h = new Host();
await h.call('hello');
const render = async (session, params, size) => (await h.call('render_view', { session, params, adjustments: ADJ, geometry: GEO, source_geometry: GEO, tier: 'preview', display: 'srgb', long_edge: size, generation: 1, format: 'rgba16' }));
const greyOf = (payload, size) => {
  let sum = 0, n = 0;
  for (let y = size / 2 - 40; y < size / 2 + 40; y++) for (let x = size / 2 - 40; x < size / 2 + 40; x++) {
    const i = (y * size + x) * 8;
    sum += 0.2126 * payload.readUInt16LE(i) + 0.7152 * payload.readUInt16LE(i + 2) + 0.0722 * payload.readUInt16LE(i + 4); n++;
  }
  return sum / n / 257;
};

const report = [];
for (const s of films) {
  const base = paramsFor(s);
  try {
    const grey = (await h.call('open', { path: `${DIR}/grey.png`, params: base })).result.session;
    const target = greyOf((await render(grey, { ...base, auto_exposure: true, auto_exposure_method: 'balanced' }, 512)).payload, 512);
    let lo = -6, hi = 12, ev = 0;
    for (let i = 0; i < 16; i++) {
      ev = (lo + hi) / 2;
      const g = greyOf((await render(grey, { ...base, auto_exposure: false, exposure_baseline_ev: ev }, 512)).payload, 512);
      if (g < target) lo = ev; else hi = ev;
    }
    await h.call('close', { session: grey });
    const p = { ...base, auto_exposure: false, exposure_baseline_ev: ev };
    const chart = (await h.call('open', { path: `${DIR}/chart33.png`, params: p })).result.session;
    const r = await render(chart, p, 2280);
    await h.call('close', { session: chart });
    writeFileSync(`${outDir}/${s.id}.bin`, r.payload);
    report.push({ id: s.id, name: s.name, ev: +ev.toFixed(3), grey: +target.toFixed(1), print: p.print_stock, scan: p.scan_film });
    console.log(s.id, 'ev', ev.toFixed(2), 'grey', target.toFixed(1));
  } catch (e) { console.log(s.id, 'ERR', e.message); report.push({ id: s.id, error: e.message }); }
}
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
h.stop();
