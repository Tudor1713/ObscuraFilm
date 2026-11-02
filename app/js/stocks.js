// Twelve 135 stocks. Each one paints its own label onto a canvas that wraps the canister body:
// x = 0 and x = W meet at the felt lip, x = 3W/4 faces the camera on the shelf and x = W/4 faces it
// once the canister has been turned round on the light table. Text runs down the can with the glyph
// tops facing +x, the way real cans are printed.

export const LABEL_W = 2048, LABEL_H = 1040;
export const EXPOSURES = 36;

const SANS = 'Archivo, "Segoe UI", sans-serif';
const SERIF = '"Instrument Serif", Georgia, serif';
const SCRIPT = '"Segoe Script", "Instrument Serif", cursive';
const HAN = '"Noto Sans SC", "Microsoft YaHei UI", sans-serif';

function helpers(ctx) {
  const W = LABEL_W, H = LABEL_H;
  const h = {
    ctx, W, H, F: W * 0.75, B: W * 0.25, S: W * 0.5,
    fill(style, x = 0, y = 0, w = W, hh = H) { ctx.fillStyle = style; ctx.fillRect(x, y, w, hh); },
    band(x0, x1, style, y0 = 0, y1 = H) { h.fill(style, x0, y0, x1 - x0, y1 - y0); },
    ring(y0, y1, style) { h.fill(style, 0, y0, W, y1 - y0); },
    box(x, y, w, hh, r, style) { ctx.fillStyle = style; ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); ctx.fill(); },
    vgrad(stops, y0 = 0, y1 = H) {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      for (const [o, c] of stops) g.addColorStop(o, c);
      return g;
    },
    hgrad(stops, x0 = 0, x1 = W) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      for (const [o, c] of stops) g.addColorStop(o, c);
      return g;
    },
    font(o) {
      ctx.font = `${o.style || 'normal'} ${o.weight || 700} ${o.size}px ${o.family || SANS}`;
      ctx.fontStretch = o.stretch || 'normal';
      ctx.letterSpacing = (o.track || 0) + 'px';
    },
    len(text, o) { h.font(o); return ctx.measureText(text).width; },
    // vertical text: (cx, y) is the centre line of the run and where it starts (or ends / centres)
    vt(text, cx, y, o) {
      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(Math.PI / 2);
      h.font(o);
      const w = ctx.measureText(text).width;
      ctx.textBaseline = 'middle';
      ctx.textAlign = o.align === 'end' ? 'right' : o.align === 'center' ? 'center' : 'left';
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.fillStyle = o.color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
      return o.align === 'end' ? y - w : o.align === 'center' ? y + w / 2 : y + w;
    },
    ht(text, x, y, o) {
      ctx.save();
      h.font(o);
      ctx.textBaseline = o.baseline || 'middle';
      ctx.textAlign = o.align || 'left';
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.fillStyle = o.color;
      ctx.fillText(text, x, y);
      ctx.restore();
    },
    // a column of small print, read down the can, stepping left
    small(lines, cx, y, o, gap) { lines.forEach((t, i) => h.vt(t, cx - i * (gap || o.size * 1.3), y, o)); },
    // lab barcode: bars run along the height of the can
    barcode(x, y, w, hh, seed, ink = '#111', paper = '#f4f1ea') {
      h.fill(paper, x - 12, y - 12, w + 24, hh + 24);
      let r = seed * 9301 + 49297;
      const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      ctx.fillStyle = ink;
      for (let py = y; py < y + hh;) {
        const bw = 2 + Math.floor(rnd() * 4) * 2;
        if (rnd() > 0.4) ctx.fillRect(x, py, w, bw);
        py += bw + 2;
      }
      h.vt('0 41771 ' + (10000 + seed * 337) % 99999, x - 4, y + hh + 10, { size: 18, weight: 500, color: ink, family: '"IBM Plex Mono", monospace' });
    },
    // DX contact pattern: bare metal squares against black paint
    dx(x, y, bits, cell = 30) {
      for (let i = 0; i < 12; i++) {
        const cx = x + (i % 2) * cell, cy = y + Math.floor(i / 2) * cell;
        const metal = (bits >> i) & 1 || i % 6 === 0;
        if (metal) {
          const g = ctx.createLinearGradient(cx, cy, cx + cell, cy + cell);
          g.addColorStop(0, '#eceae6'); g.addColorStop(0.5, '#a9abad'); g.addColorStop(1, '#d6d5d2');
          ctx.fillStyle = g;
        } else ctx.fillStyle = '#121212';
        ctx.fillRect(cx, cy, cell - 1, cell - 1);
      }
    },
    exp(cx, color, y = H - 64, size = 64) {
      const e = h.vt(String(EXPOSURES), cx, y, { size, weight: 800, color, align: 'end', track: -2 });
      h.vt('EXP.', cx + size * 0.12, e - 10, { size: size * 0.42, weight: 700, color, align: 'end', track: 2 });
    },
  };
  return h;
}

// print realism: crimp shading at the caps, ink grain, scuffs where fingers and cap rims rub
function finish(ctx, seed) {
  const W = LABEL_W, H = LABEL_H;
  let r = seed * 7919 + 17;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (const [y0, y1, a] of [[0, 30, 0.38], [H, H - 30, 0.38]]) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, 30);
  }
  ctx.save();
  for (let i = 0; i < 14000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.045)';
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // soft mottling of the lithographed tin
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W, y = rnd() * H, rad = 40 + rnd() * 140;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rnd() > 0.5 ? '255,250,235' : '40,25,10'},${0.03 + rnd() * 0.03})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 44; i++) {
    const top = rnd() > 0.5, x = rnd() * W, y = top ? 16 + rnd() * 60 : H - 16 - rnd() * 60;
    ctx.strokeStyle = `rgba(230,226,218,${0.1 + rnd() * 0.22})`;
    ctx.lineWidth = 1 + rnd() * 2.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 10); ctx.stroke();
  }
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, 16, H); ctx.fillRect(W - 16, 0, 16, H);
  ctx.restore();
}

// roughness map: varnish is glossier in the middle, rubbed matte near the rims, with fine scratches
function roughness(seed) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 520;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 520);
  grd.addColorStop(0, '#9a9a9a'); grd.addColorStop(0.12, '#606060'); grd.addColorStop(0.88, '#606060'); grd.addColorStop(1, '#9a9a9a');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 520);
  let r = seed * 131 + 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 1024, y = rnd() * 520, l = 10 + rnd() * 70, a = (rnd() - 0.5) * 0.5;
    g.strokeStyle = `rgba(${rnd() > 0.3 ? '200,200,200' : '40,40,40'},${0.15 + rnd() * 0.3})`;
    g.lineWidth = 0.6 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const x = rnd() * 1024, y = 120 + rnd() * 280, rad = 30 + rnd() * 50;
    const gg = g.createRadialGradient(x, y, 0, x, y, rad);
    gg.addColorStop(0, 'rgba(170,170,170,0.35)'); gg.addColorStop(1, 'rgba(170,170,170,0)');
    g.fillStyle = gg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

const DX = [0b101101001011, 0b011010110101, 0b110100101101, 0b100110101101, 0b101011010011, 0b010111001011];

export const STOCKS = [
  {
    id: 'gold200', brand: 'Kodak', title: 'Gold 200', iso: 200, kind: 'color', process: 'C-41',
    edge: 'KODAK GOLD 200', base: '#d98a52', stub: '#b87648', ink: '#3b1d0d', accent: '#f4b31b', name: '夏至',
    paint(h) {
      const { F, B, S, H } = h;
      h.fill(h.vgrad([[0, '#fbc72a'], [0.5, '#f6b61a'], [1, '#ee9d12']]));
      h.band(S - 190, S + 58, '#141210');
      h.band(S + 58, S + 70, '#d3241c');
      h.vt('DX', S + 4, 70, { size: 72, weight: 900, style: 'italic', color: '#f6b61a' });
      h.exp(S - 104, '#f3eee3', H - 70, 92);
      h.small(['ISO 200/24°', 'CAT 603 3995'], S - 30, H - 70, { size: 26, weight: 600, color: '#f6b61a', align: 'end', track: 3 });
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('Kodak', cx + 150, 62, { size: 218, weight: 800, track: -6, color: '#14110e' });
        const y = h.vt('GOLD', cx - 64, 66, { size: 150, weight: 800, stretch: 'semi-expanded', track: 8, color: '#c51d1c' });
        h.vt(' 200', cx - 64, y, { size: 150, weight: 800, color: '#14110e' });
        h.small(front ? ['35mm color print film', 'Kodak Gold 200 · 36 exp.', 'PROCESS C-41'] : ['for color prints', 'daylight · ISO 200/24°', 'Made in U.S.A.'],
          cx - 206, 70, { size: 38, weight: 500, color: '#1b1814' });
      }
      h.barcode(66, 300, 120, 440, 3);
      h.dx(1900, H - 250, DX[0]);
    },
  },
  {
    id: 'velvia50', brand: 'Fujifilm', title: 'Velvia 50', iso: 50, kind: 'slide', process: 'E-6',
    edge: 'FUJI RVP 50', base: '#151112', stub: '#5d4a42', ink: '#f1d9a2', accent: '#a8264f', name: '雾港',
    paint(h) {
      const { F, B, S, W, H } = h;
      const gold = '#dcbb72';
      h.fill(h.hgrad([[0, '#5a1131'], [0.25, '#8c2050'], [0.5, '#5a1131'], [0.75, '#932256'], [1, '#5a1131']]));
      h.fill(h.vgrad([[0, 'rgba(255,220,240,0.10)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']]));
      for (const y of [82, 92, H - 96, H - 86]) h.ring(y, y + (y === 82 || y === H - 96 ? 5 : 2), gold);
      h.band(S - 170, S + 40, '#33081a');
      h.vt('FUJIFILM', S - 70, 130, { size: 50, weight: 800, stretch: 'semi-expanded', track: 8, color: gold });
      h.exp(S + 6, '#f3e7cc', H - 120, 74);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('Velvia', cx + 150, 122, { size: 252, weight: 400, family: SERIF, style: 'italic', color: gold });
        h.vt('50', cx - 90, 134, { size: 200, weight: 700, color: '#f6ecd6' });
        h.vt('FUJIFILM', cx - 90, H - 136, { size: 58, weight: 800, stretch: 'semi-expanded', track: 10, color: gold, align: 'end' });
        h.small(front ? ['PROFESSIONAL · RVP 50', 'color reversal film for professional use'] : ['ISO 50/18°', 'daylight type · process E-6'],
          cx - 226, 136, { size: 30, weight: 600, track: 3, color: '#efcfdc' });
      }
      h.barcode(62, 330, 110, 400, 7, '#33081a', '#efe5d0');
      h.dx(W - 140, H - 290, DX[1]);
    },
  },
  {
    id: 'hp5', brand: 'Ilford', title: 'HP5 Plus 400', iso: 400, kind: 'bw', process: 'B&W',
    edge: 'ILFORD HP5 PLUS', base: '#d1cdd2', stub: '#a9a4a9', ink: '#1a181c', accent: '#1c7a45', name: '旧街',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#fbfaf6'], [1, '#eeede7']]));
      h.band(S - 160, S + 30, '#111111');
      h.vt('ILFORD', S - 66, 74, { size: 64, weight: 800, stretch: 'expanded', track: 10, color: '#fbfaf6' });
      h.exp(S + 0, '#fbfaf6', H - 70, 70);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('ILFORD', cx + 196, 58, { size: 128, weight: 900, stretch: 'expanded', track: 6, color: '#111111' });
        const y = h.vt('HP5', cx + 28, 60, { size: 236, weight: 900, track: -6, color: '#0f3d26' });
        h.vt('400', cx + 4, H - 62, { size: 112, weight: 800, color: '#111111', align: 'end' });
        h.box(cx - 172, 62, 92, 236, 10, '#111111');
        h.vt('PLUS', cx - 126, 84, { size: 66, weight: 800, track: 8, color: '#fbfaf6' });
        h.small(front ? ['BLACK & WHITE FILM', 'ISO 400/27°'] : ['made in England', 'Harman technology'],
          cx - 214, 70, { size: 32, weight: 700, track: 4, color: '#222' });
      }
      h.barcode(62, 300, 120, 440, 11);
      h.dx(W - 140, H - 290, DX[2]);
    },
  },
  {
    id: 'c200', brand: 'Fujifilm', title: 'C200', iso: 200, kind: 'color', process: 'C-41',
    edge: 'FUJI C200', base: '#db8e63', stub: '#b87a55', ink: '#3a1a10', accent: '#1f9a52', name: '山行',
    paint(h) {
      const { F, B, S, W, H } = h;
      const green = h.vgrad([[0, '#22a75a'], [1, '#16843f']]);
      h.fill(green);
      h.band(S - 150, S + 40, '#0f6a34');
      h.exp(S - 40, '#ffffff', H - 64, 72);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.band(cx - 96, cx + 128, '#f7f7f2');
        h.band(cx + 128, cx + 262, '#d3237a', 470, H - 40);
        h.vt('C200', cx + 196, 494, { size: 132, weight: 800, track: -2, color: '#ffffff' });
        h.vt('FUJIFILM', cx + 196, 64, { size: 64, weight: 800, stretch: 'semi-expanded', track: 8, color: '#ffffff' });
        h.vt('FUJICOLOR', cx + 16, 58, { size: 150, weight: 800, stretch: 'semi-condensed', track: 4, color: '#121212' });
        h.small(front ? ['color negative film', 'for color prints · ISO 200'] : ['ISO 200/24°', 'process C-41'],
          cx - 140, 70, { size: 34, weight: 600, color: '#eaffef' });
      }
      h.barcode(62, 260, 120, 400, 5);
    },
  },
  {
    id: 'cine800t', brand: 'CineStill', title: '800T', iso: 800, kind: 'cine', process: 'C-41',
    edge: 'CINESTILL 800T', base: '#d8c2ad', stub: '#8b6d58', ink: '#3b2318', accent: '#e2231a', name: '长夜',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#1b1b1c'], [1, '#0f0f10']]));
      h.ring(H - 150, H - 132, '#e2231a');
      h.ring(H - 124, H - 114, '#f4f1ea');
      h.ring(H - 106, H - 94, '#2f6bff');
      h.exp(S - 40, '#f4f1ea', H - 170, 66);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('CineStill', cx + 150, 50, { size: 168, weight: 700, family: SCRIPT, color: '#e5281f', track: -2 });
        const y = h.vt('800', cx - 28, 70, { size: 210, weight: 900, stretch: 'condensed', track: -4, color: '#f4f1ea' });
        h.vt('T', cx - 28, y + 4, { size: 210, weight: 900, stretch: 'condensed', color: '#f4f1ea' });
        h.small(front ? ['tungsten balanced · 3200K', 'motion picture color negative', 'process C-41 or ECN-2'] : ['ISO 800/30°', 'remjet removed', 'made for still photography'],
          cx - 160, 72, { size: 30, weight: 500, color: '#c9c4bb' });
      }
      h.barcode(62, 300, 110, 400, 13, '#0f0f10', '#e9e5dc');
      h.dx(W - 140, H - 380, DX[4]);
    },
  },
  {
    id: 'portra400', brand: 'Kodak', title: 'Portra 400', iso: 400, kind: 'color', process: 'C-41',
    edge: 'KODAK PORTRA 400', base: '#e09c66', stub: '#bb7a4c', ink: '#3d200f', accent: '#e2a83a', name: '归途',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#f6ebc8'], [0.55, '#f1dfae'], [1, '#e9cf92']]));
      h.ring(0, 118, '#16140f');
      for (let x = 60; x < W; x += 340) h.ht('C-41', x, 64, { size: 46, weight: 800, track: 6, color: '#f3e7c4' });
      h.ring(118, 128, '#d6a43c');
      h.band(S - 150, S + 30, '#16140f', 128, H);
      h.exp(S - 60, '#f1dfae', H - 64, 70);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.band(cx - 300, cx - 222, h.vgrad([[0, '#e8b54a'], [1, '#c98a23']]), 128, H);
        const py = h.vt('PORTRA', cx + 70, 168, { size: 132, weight: 600, stretch: 'condensed', track: 8, color: '#17150f' });
        h.vt(' 400', cx + 70, py + 6, { size: 132, weight: 600, stretch: 'condensed', track: 4, color: '#17150f' });
        const y = h.vt('Kodak', cx + 214, 176, { size: 70, weight: 800, track: -1, color: '#c1272d' });
        h.vt(' Professional', cx + 214, y, { size: 62, weight: 600, color: '#c1272d' });
        h.small(front ? ['Professional color negative film', 'Kodak Professional · 36 exp.'] : ['ISO 400/27°', 'Made in U.S.A.'],
          cx - 110, 180, { size: 32, weight: 500, color: '#3a3326' });
      }
      h.barcode(62, 250, 120, 400, 17);
      h.dx(W - 140, 200, DX[3]);
    },
  },
  {
    id: 'trix400', brand: 'Kodak', title: 'Tri-X 400', iso: 400, kind: 'bw', process: 'B&W',
    edge: 'KODAK 400TX', base: '#cbc7c8', stub: '#8f8789', ink: '#19171a', accent: '#f6c313', name: '初雪',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#f8ca1e'], [1, '#efb411']]));
      h.band(S - 120, S + 60, '#131313');
      h.vt('black & white negative film', S - 30, 70, { size: 30, weight: 600, color: '#f8ca1e', track: 3 });
      h.exp(S + 70, '#131313', H - 64, 64);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.band(cx + 150, cx + 286, '#131313');
        h.vt('Kodak', cx + 218, 62, { size: 92, weight: 800, track: -2, color: '#f8ca1e' });
        h.vt('400TX', cx + 218, H - 62, { size: 58, weight: 800, stretch: 'condensed', track: 4, color: '#f3eee3', align: 'end' });
        const y = h.vt('TRI-X', cx + 34, 62, { size: 200, weight: 900, stretch: 'condensed', track: -2, color: '#131313' });
        h.vt(' 400', cx + 34, y, { size: 200, weight: 900, stretch: 'condensed', color: '#131313' });
        h.vt('Kodak Professional Film', cx - 118, 70, { size: 54, weight: 700, color: '#131313' });
        h.small(front ? ['ISO 400/27° · develop D-76 / HC-110'] : ['for black & white prints'], cx - 196, 74, { size: 30, weight: 500, color: '#2b2412' });
      }
      h.barcode(62, 310, 110, 400, 19, '#131313', '#f8ca1e');
      h.dx(W - 140, H - 290, DX[5]);
    },
  },
  {
    id: 'lomo800', brand: 'Lomography', title: 'Color 800', iso: 800, kind: 'color', process: 'C-41',
    edge: 'LOMOGRAPHY 800', base: '#d27c48', stub: '#b06c42', ink: '#3a1a0c', accent: '#d8357d', name: '远方',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.hgrad([[0, '#c0287a'], [0.2, '#e85c5a'], [0.34, '#f49a3c'], [0.5, '#b0287c'], [0.62, '#d33f86'], [0.8, '#ee6a4c'], [0.94, '#f6a13c'], [1, '#c0287a']]));
      h.fill(h.vgrad([[0, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(60,0,40,0.2)']]));
      h.exp(S - 40, '#ffffff', H - 64, 70);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('800', cx + 150, 74, { size: 290, weight: 900, track: -8, color: '#ffffff' });
        h.vt('Lomography', cx - 60, 70, { size: 128, weight: 700, family: SCRIPT, color: '#ffffff' });
        h.small(front ? ['color negative film · 35mm', 'ISO 800 · process C-41'] : ['for the analogue future', 'Lomography · Vienna'],
          cx - 208, 84, { size: 30, weight: 600, track: 3, color: '#ffffff', alpha: 0.9 });
      }
      h.barcode(62, 330, 110, 400, 23);
    },
  },
  {
    id: 'e100', brand: 'Kodak', title: 'Ektachrome E100', iso: 100, kind: 'slide', process: 'E-6',
    edge: 'KODAK E100', base: '#121012', stub: '#4b3c36', ink: '#f2e2b4', accent: '#2453c4', name: '晨光',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#2a5ccc'], [0.6, '#1f4db6'], [1, '#173c94']]));
      h.band(S - 140, S + 30, '#0e1f52');
      h.exp(S - 56, '#ffd21f', H - 64, 72);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.band(cx + 172, cx + 286, '#ffd21f');
        const y = h.vt('Kodak', cx + 229, 60, { size: 70, weight: 800, track: -1, color: '#c8202a' });
        h.vt(' Professional', cx + 229, y, { size: 60, weight: 600, color: '#121212' });
        h.vt('E100', cx + 52, 64, { size: 236, weight: 800, track: -4, color: '#ffffff' });
        h.vt('EKTACHROME', cx - 124, 70, { size: 76, weight: 700, stretch: 'semi-expanded', track: 10, color: '#ffffff' });
        h.small(front ? ['color reversal film · process E-6'] : ['ISO 100/21° · daylight'], cx - 206, 74, { size: 30, weight: 500, color: '#dbe4ff' });
      }
      h.barcode(62, 300, 110, 400, 29, '#0e1f52');
      h.dx(W - 140, H - 290, DX[0]);
    },
  },
  {
    id: 'vista200', brand: 'Agfa', title: 'Vista plus 200', iso: 200, kind: 'color', process: 'C-41',
    edge: 'AGFA VISTA 200', base: '#da8752', stub: '#b77346', ink: '#3b1c0c', accent: '#d21f26', name: '雨季',
    paint(h) {
      const { F, B, S, W, H, ctx } = h;
      h.fill(h.vgrad([[0, '#e0282d'], [1, '#c21b22']]));
      h.exp(S - 30, '#ffffff', H - 64, 70);
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.vt('AGFA', cx + 166, 64, { size: 200, weight: 900, track: 4, color: '#ffffff' });
        const y = h.vt('Vista', cx - 10, 70, { size: 166, weight: 400, family: SERIF, style: 'italic', color: '#ffd21a' });
        h.vt(' plus', cx - 10, y, { size: 150, weight: 400, family: SERIF, style: 'italic', color: '#ffd21a' });
        h.vt('200', cx - 150, 70, { size: 96, weight: 800, color: '#ffffff' });
        h.small([front ? 'color negative film' : 'ISO 200/24°'], cx - 230, 74, { size: 30, weight: 600, color: '#ffe0d6' });
        // the little lozenge badge near the foot of the can
        ctx.save();
        ctx.translate(cx + 166, H - 170); ctx.rotate(Math.PI / 4);
        h.box(-52, -52, 104, 104, 8, '#ffffff');
        h.box(-42, -42, 84, 84, 6, '#d6232a');
        ctx.rotate(Math.PI / 4);
        h.ht('Agfa', 0, 2, { size: 30, weight: 800, style: 'italic', color: '#ffffff', align: 'center' });
        ctx.restore();
      }
      h.barcode(62, 260, 110, 400, 31);
    },
  },
  {
    id: 'acros100', brand: 'Fujifilm', title: 'Acros 100 II', iso: 100, kind: 'bw', process: 'B&W',
    edge: 'FUJI ACROS II', base: '#d3d3d3', stub: '#a7a7a7', ink: '#18181a', accent: '#22a35a', name: '海风',
    paint(h) {
      const { F, B, S, W, H } = h;
      h.fill(h.vgrad([[0, '#151617'], [1, '#0f1011']]));
      h.band(S - 140, S + 60, '#f2f2ee');
      h.vt('NEOPAN', S - 40, 70, { size: 44, weight: 700, stretch: 'expanded', track: 14, color: '#141516' });
      for (const [cx, front] of [[F, true], [B, false]]) {
        h.band(cx - 300, cx - 110, '#f2f2ee', 0, H * 0.6);
        h.band(cx - 300, cx - 110, '#22a35a', H * 0.6, H);
        h.vt('FUJIFILM', cx - 150, 64, { size: 58, weight: 800, stretch: 'semi-expanded', track: 8, color: '#141516' });
        h.vt(front ? 'B&W negative film' : 'ISO 100/21°', cx - 230, 70, { size: 32, weight: 600, color: '#3a3c3e' });
        h.exp(cx - 196, '#ffffff', H - 54, 70);
        h.vt('ACROS', cx + 40, 62, { size: 200, weight: 700, stretch: 'condensed', track: 4, color: '#f2f2ee' });
        h.vt('II', cx + 40, H - 62, { size: 200, weight: 700, stretch: 'condensed', color: '#f2f2ee', align: 'end' });
        h.vt('FUJIFILM', cx + 214, 62, { size: 66, weight: 800, stretch: 'semi-expanded', track: 8, color: '#f2f2ee' });
        h.vt('100', cx + 214, H - 62, { size: 66, weight: 800, color: '#f2f2ee', align: 'end' });
      }
      h.barcode(62, 300, 110, 400, 37);
    },
  },
  {
    id: 'lucky100', brand: 'Lucky', title: 'SHD 100', iso: 100, kind: 'bw', process: 'B&W',
    edge: 'LUCKY SHD100', base: '#cac7c2', stub: '#9b9892', ink: '#1a1917', accent: '#d9262c', name: '日常',
    paint(h) {
      const { F, B, S, W, H, ctx } = h;
      h.fill(h.vgrad([[0, '#2453b8'], [0.6, '#1d46a2'], [1, '#163882']]));
      h.ring(H - 34, H, '#d9262c');
      for (const [cx, front] of [[F, true], [B, false]]) {
        // emblem: a red disc with a white sweep
        ctx.save();
        ctx.translate(cx, 150);
        ctx.fillStyle = '#d9262c';
        ctx.beginPath(); ctx.ellipse(0, 0, 86, 66, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 13; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-52, 22); ctx.quadraticCurveTo(-4, -50, 56, -22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-20, 30); ctx.quadraticCurveTo(14, -6, 46, 10); ctx.stroke();
        ctx.restore();
        h.ht('乐凯', cx, 344, { size: 152, weight: 900, family: HAN, color: '#ffffff', align: 'center', track: 6 });
        h.ht('LUCKY', cx, 506, { size: 128, weight: 900, color: '#ffffff', align: 'center', track: 2 });
        h.ht('SHD 100', cx, 640, { size: 108, weight: 800, stretch: 'condensed', color: '#ffd23f', align: 'center', track: 2 });
        h.ht(front ? 'BLACK & WHITE FILM' : '黑白胶卷 · 中国保定', cx, 750, { size: front ? 40 : 38, weight: 700, family: front ? SANS : HAN, color: '#ffffff', align: 'center', track: 4 });
        h.ht('135 · ISO 100', cx - 150, 900, { size: 32, weight: 600, color: '#c9d4f0', align: 'left', track: 3 });
        h.ht(String(EXPOSURES), cx + 190, 900, { size: 60, weight: 800, color: '#ffffff', align: 'right' });
      }
      h.barcode(62, 300, 110, 400, 41, '#163882');
      h.dx(W - 140, H - 320, DX[2]);
    },
  },
];

export const KIND_LABEL = { color: '彩色负片', bw: '黑白负片', slide: '彩色反转片', cine: '电影负片' };

export function stockById(id) { return STOCKS.find(s => s.id === id) || STOCKS[0]; }

export async function loadLabelFonts() {
  const specs = [
    '400 40px Archivo', '500 40px Archivo', '600 40px Archivo', '700 40px Archivo', '800 40px Archivo', '900 40px Archivo',
    'italic 900 40px Archivo', 'italic 400 40px "Instrument Serif"', '400 40px "Instrument Serif"',
    '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"', '900 40px "Noto Sans SC"', '500 40px "Noto Sans SC"', '700 40px "Segoe Script"',
  ];
  await Promise.all(specs.map(s => document.fonts.load(s, 'Kodak乐凯黑白').catch(() => {})));
}

export function paintLabel(stock, seed = 1) {
  const c = document.createElement('canvas');
  c.width = LABEL_W; c.height = LABEL_H;
  const ctx = c.getContext('2d');
  stock.paint(helpers(ctx));
  finish(ctx, seed);
  return { color: c, rough: roughness(seed) };
}
