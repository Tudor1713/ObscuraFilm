import * as THREE from '../vendor/three.module.js';
import { MOUTH, EXIT_HEADING, FILM_YC } from './canister.js';
import { LUT_N } from './sims.js';

// A strip of 35 mm film hanging out of a canister's felt lip. The strip is a ruled surface: its width runs
// straight up the y axis and its length follows a curve in the canister's xz plane, so the whole shape is
// one heading function θ(σ) of the distance σ from the lip. Pulling film out is just raising `p`, the length
// that has left the lip; the leader curl, the exit bend and a travelling flutter are terms of θ.

export const FILM_W = 3.5, PITCH = 3.8, LEADER = 8, TAIL = 7;
// a portrait picture takes a half frame (18 x 24 mm, four perforations) and stands upright in it; a
// landscape one takes a full frame (36 x 24 mm). Nothing is ever turned on its side.
export const HALF = PITCH / 2;
export const IMG = { s0: 0.1, t0: 0.55, t1: 2.95 };   // picture area: from s0 to len - s0 along the strip
export const isPortrait = photo => photo.w / photo.h < 0.95;
const DS = 0.04, COL = 0.08, INSIDE = 0.9;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform float uLen;
uniform float uU0;
uniform float uKind;
uniform vec3 uBase;
uniform vec3 uInk;
uniform sampler2D uEdge;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uReady;
uniform float uSat;
uniform float uAspect;
uniform float uHover;
uniform float uSpec;
uniform float uDim;
uniform vec3 uLight;
precision highp sampler3D;
uniform sampler3D uLutA;
uniform sampler3D uLutB;
uniform float uLutT;
uniform sampler2D uPrint;
uniform float uPrintOn;
uniform float uAmt;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// the roll's film simulation: SpektraLab's print of the frame once the darkroom has made it (uPrint), the
// film's 33^3 LUT on sRGB values until then; a film being tried in the picker is its LUT (B) faded in over
// that. uAmt is how strongly the film is laid over the picture.
vec3 encodeSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 decodeSRGB(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 simulate(vec3 lin, vec2 uv) {
  vec3 p = clamp(encodeSRGB(clamp(lin, 0.0, 1.0)), 0.0, 1.0) * (LUT_N - 1.0) / LUT_N + 0.5 / LUT_N;
  vec3 a = decodeSRGB(texture(uLutA, p).rgb);
  if (uPrintOn > 0.0) a = mix(a, texture2D(uPrint, uv).rgb, uPrintOn);
  vec3 film = mix(a, decodeSRGB(texture(uLutB, p).rgb), uLutT);
  return mix(lin, film, uAmt);
}

float coverage(float s, float t, float aa) {
  float cov = 1.0;
  if (uKind < 0.5) {
    // the leader: a rounded tongue along the top edge that widens into full film
    float low = mix(1.62, 0.0, smoothstep(2.9, 4.1, s));
    float d = sdBox(vec2(s - 2.0, t - 2.56), vec2(2.0, 0.94), 0.4);
    if (s > 2.6) d = min(d, low - t);
    cov *= 1.0 - smoothstep(-aa, aa, d);
  }
  float g = uU0 + s;
  float ps = mod(g, 0.475) - 0.2375;
  float hole = min(sdBox(vec2(ps, t - 0.3395), vec2(0.099, 0.1395), 0.045),
                   sdBox(vec2(ps, t - 3.1605), vec2(0.099, 0.1395), 0.045));
  cov *= smoothstep(-aa, aa, hole);
  return cov;
}

void main() {
  float s = vUv.x * uLen, t = vUv.y * 3.5;
  float aa = max(fwidth(s), fwidth(t)) * 0.8 + 1e-5;
  float cov = coverage(s, t, aa);
  if (cov < 0.002) discard;
#ifdef PASS_SPEC
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vV);
  vec3 H = normalize(normalize(uLight) + V);
  float sp = pow(max(dot(N, H), 0.0), 48.0) * 0.17 + pow(1.0 - abs(dot(N, V)), 4.0) * 0.035;
  gl_FragColor = vec4(vec3(sp * cov * uSpec), 1.0);
#else
  vec3 T = uBase;
  float ib = texture2D(uEdge, vec2(s / uLen, clamp((t - 0.025) / 0.16, 0.0, 1.0) * 0.5)).a;
  float it = texture2D(uEdge, vec2(s / uLen, 0.5 + clamp((t - 3.315) / 0.16, 0.0, 1.0) * 0.5)).a;
  float ink = t < 0.19 ? ib * step(0.025, t) : (t > 3.31 ? it * step(t, 3.475) : 0.0);
  T = mix(T, uInk, ink * 0.9);

  // the picture area spans the segment (full or half frame); the image covers it, upright, cropped to fit
  float fw = uLen - 0.2, fa = fw / 2.4;
  vec2 a = vec2((s - 0.1) / fw, (t - 0.55) / 2.4);
  vec2 sc = uAspect > fa ? vec2(fa / uAspect, 1.0) : vec2(1.0, uAspect / fa);
  vec2 iuv = clamp(0.5 + (a - 0.5) * sc, 0.001, 0.999);
  vec4 tex = texture2D(uMap, iuv);
  if (uKind > 0.5 && (uKind < 1.5 || uKind > 2.5)) {
    float m = 1.0 - smoothstep(-aa, aa, sdBox(vec2(s - uLen * 0.5, t - 1.75), vec2(uLen * 0.5 - 0.1, 1.2), 0.07));
    vec3 img;
    if (uKind > 2.5) {
      img = mix(uBase, uInk, tex.a * (0.5 + 0.5 * uHover));
    } else {
      // undeveloped: a plain black and white of the picture; developed: the film's own rendering of it
      vec3 ph = tex.rgb;
      float l = dot(ph, vec3(0.2126, 0.7152, 0.0722));
      vec3 mono = vec3(mix(l, l * l * (3.0 - 2.0 * l), 0.3));
      ph = mix(mono, simulate(ph, iuv), uSat);
      ph *= 1.0 + uHover * 0.07;
      vec3 wait = mix(uBase, uBase * 0.82, 0.6);
      img = mix(wait, ph, uHasMap * uReady);
    }
    T = mix(T, img, m);
  }
  gl_FragColor = vec4(mix(vec3(1.0), T * uDim, cov), 1.0);
#endif
  #include <colorspace_fragment>
}`;

const DEPTH_FRAG = /* glsl */`
uniform float uLen;
uniform float uU0;
uniform float uKind;
uniform float uShadow;
varying vec2 vUv;
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p) + 0.03; }
void main() {
  float s = vUv.x * uLen, t = vUv.y * 3.5;
  if (uKind < 0.5) {
    float low = mix(1.62, 0.0, smoothstep(2.9, 4.1, s));
    float d = sdBox(vec2(s - 2.0, t - 2.56), vec2(2.0, 0.94), 0.4);
    if (s > 2.6) d = min(d, low - t);
    if (d > 0.0) discard;
  }
  float ps = mod(uU0 + s, 0.475) - 0.2375;
  float hole = min(sdBox(vec2(ps, t - 0.3395), vec2(0.099, 0.1395), 0.045), sdBox(vec2(ps, t - 3.1605), vec2(0.099, 0.1395), 0.045));
  if (hole < 0.0) discard;
  if (bayer(gl_FragCoord.xy) > uShadow) discard;
  gl_FragColor = vec4(1.0);
}`;

let blankTex;
function blank() {
  if (!blankTex) {
    blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blankTex.needsUpdate = true;
  }
  return blankTex;
}

function edgeTexture(edge, kind, len, n, dur) {
  const c = document.createElement('canvas');
  c.width = Math.round(270 * len); c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  const px = u => (u / len) * c.width;
  const text = (str, u, band, size = 44, w = 700) => {
    g.font = `${w} ${size}px Archivo, sans-serif`;
    g.fontStretch = 'semi-condensed';
    g.letterSpacing = '2px';
    g.fillText(str, px(u), band ? 96 : 34);
  };
  const ticks = (u0, seed) => {
    let r = seed * 97 + 13;
    for (let u = u0; u < u0 + 1.5; u += 0.07) {
      r = (r * 16807) % 2147483647;
      if (r % 3) g.fillRect(px(u), 14, px(0.035), r % 2 ? 40 : 22);
    }
  };
  if (kind === 'leader') {
    text('◀', 4.6, 0, 40); text(edge, 5.2, 0); text(edge, 5.0, 1, 40, 600);
  } else if (kind === 'tail') {
    text(edge, 0.6, 0); ticks(4.2, 99); text('E', 1.2, 1, 40);
  } else if (len < PITCH) {   // half frame: one mark on each edge
    const mm = dur != null && `${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}`;
    if (mm) text(mm, 0.18, 0, 40, 600);
    else if (n % 2) text(edge.split(' ')[0], 0.18, 0, 40, 600);
    else ticks(0.3, n);
    text(String(n), 0.18, 1, 46);
  } else {
    if (dur != null) {   // a video frame prints its running time where the stock name would be
      text(`${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')}`, 0.55, 0); text(edge, 1.6, 0, 40, 600);
    } else if (n % 2) { text(edge, 0.55, 0); text(String(n), 2.75, 0, 40, 600); }
    else ticks(0.6, n);
    text(String(n), 0.22, 1, 46);
    text('▸' + n + 'A', 1.95, 1, 40, 600);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

// a LUT as a WebGL 3D texture (RGBA8, r fastest); identity until a roll's own is loaded
export function lutTexture(data) {
  const t = new THREE.Data3DTexture(data, LUT_N, LUT_N, LUT_N);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
let idLut;
function identityLut() {
  if (idLut) return idLut;
  const N = LUT_N, d = new Uint8Array(N * N * N * 4);
  for (let b = 0, i = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++, i += 4) {
    d[i] = Math.round(r / (N - 1) * 255); d[i + 1] = Math.round(g / (N - 1) * 255); d[i + 2] = Math.round(b / (N - 1) * 255); d[i + 3] = 255;
  }
  return (idLut = lutTexture(d));
}

let glyphTex;
function addGlyph() {
  if (glyphTex) return glyphTex;
  const c = document.createElement('canvas');
  c.width = 720; c.height = 480;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(360, 150); g.lineTo(360, 258); g.moveTo(306, 204); g.lineTo(414, 204); g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '500 40px "Noto Sans SC", "Microsoft YaHei UI", sans-serif';
  g.letterSpacing = '8px';
  g.fillText('装入照片 / 视频', 364, 322);
  g.font = '500 22px "IBM Plex Mono", monospace';
  g.letterSpacing = '5px';
  g.fillText('LOAD FRAMES', 364, 370);
  glyphTex = new THREE.CanvasTexture(c);
  glyphTex.anisotropy = 8;
  return glyphTex;
}

export class Film {
  constructor(stock, parent, renderer) {
    this.stock = stock;
    this.renderer = renderer;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.base = new THREE.Color(stock.base);
    this.stubBase = new THREE.Color(stock.stub || stock.base);
    this.leaderBase = this.stubBase.clone();
    this.ink = new THREE.Color(stock.ink);
    this.edgeText = stock.edge;
    // shared by every frame of the strip; app.js loads the roll's LUT into them and sets its strength
    this.lut = { a: { value: identityLut() }, b: { value: identityLut() }, t: { value: 0 }, amt: { value: 1 } };
    // SpektraLab prints of the frames for the roll's film (photo id -> texture)
    this.sim = 'none';
    this.prints = new Map();
    this.dim = { value: 0.9 };
    this.shadow = { value: stock.kind === 'slide' ? 0.82 : stock.kind === 'bw' ? 0.5 : 0.56 };
    this.p = 4.2;
    this.shape = { theta0: EXIT_HEADING, rest: EXIT_HEADING, bendLen: 2.2, curl: 2.05, curlLen: 3.1, flutter: 0, phase: 0 };
    this.light = new THREE.Vector3(-0.45, 0.75, 0.6);
    this.order = [1, 2];
    this.casts = true;
    this.segs = [];
    this.texCache = new Map();
    this.edgeCache = new Map();
    this.X = new Float32Array(2048); this.Z = new Float32Array(2048); this.TH = new Float32Array(2048);
    this.build([]);
  }

  get frameCount() { return this.segs.filter(s => s.kind === 'frame').length; }
  get length() { const l = this.segs[this.segs.length - 1]; return l.u0 + l.len; }

  edge(kind, len, n, dur = null) {
    const key = kind + n + '/' + len + (dur == null ? '' : 'v' + Math.round(dur));
    if (!this.edgeCache.has(key)) this.edgeCache.set(key, edgeTexture(this.edgeText, kind, len, n, dur));
    return this.edgeCache.get(key);
  }

  // the developed strip as a given film stock: its base colour, edge-print ink and edge text (null: the
  // can's own). Takes effect on the next build.
  setStyle(style) {
    const s = style?.base ? style : this.stock;
    this.base.set(s.base);
    this.ink.set(s.ink);
    this.edgeText = s.edge;
    for (const t of this.edgeCache.values()) t.dispose();
    this.edgeCache.clear();
  }

  texture(photo) {
    let e = this.texCache.get(photo.id);
    if (!e) {
      e = { tex: null, ready: null };
      e.ready = new Promise(res => {
        new THREE.TextureLoader().load(photo.thumbUrl, tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          e.tex = tex;
          res(tex);
        }, undefined, () => res(null));
      });
      this.texCache.set(photo.id, e);
    }
    return e;
  }

  makeSeg(kind, len, u0, extra = {}) {
    const cols = Math.max(2, Math.ceil(len / COL) + 1);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(cols * 6), nor = new Float32Array(cols * 6), uv = new Float32Array(cols * 4);
    const idx = [];
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      uv.set([u, 0, u, 1], c * 4);
      if (c < cols - 1) { const a = c * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const n = extra.number || 0;
    const uniforms = {
      uLen: { value: len }, uU0: { value: u0 },
      uKind: { value: { leader: 0, frame: 1, tail: 2, add: 3 }[kind] },
      uBase: { value: kind === 'leader' || kind === 'tail' ? this.leaderBase : this.base }, uInk: { value: this.ink },
      uEdge: { value: this.edge(kind, len, n, extra.photo?.video ? extra.photo.dur : null) },
      uMap: { value: kind === 'add' ? addGlyph() : blank() },
      uHasMap: { value: 0 }, uReady: { value: 0 },
      uSat: { value: extra.photo?.color ? 1 : 0 },
      uAspect: { value: 1.5 },
      uHover: { value: 0 }, uSpec: { value: 1 }, uDim: this.dim, uShadow: this.shadow,
      uLight: { value: this.light },
      uLutA: this.lut.a, uLutB: this.lut.b, uLutT: this.lut.t, uAmt: this.lut.amt,
      uPrint: { value: blank() }, uPrintOn: { value: 0 },
    };
    const common = { uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: { LUT_N: LUT_N.toFixed(1) }, side: THREE.DoubleSide, depthWrite: false, transparent: false };
    const mul = new THREE.ShaderMaterial({
      ...common, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    });
    const spec = new THREE.ShaderMaterial({
      ...common, defines: { ...common.defines, PASS_SPEC: 1 }, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const mesh = new THREE.Mesh(geo, mul), gloss = new THREE.Mesh(geo, spec);
    mesh.customDepthMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    mesh.castShadow = this.casts;
    mesh.renderOrder = this.order[0]; gloss.renderOrder = this.order[1];
    this.group.add(mesh, gloss);
    const seg = { kind, len, u0, cols, geo, mesh, gloss, uniforms, number: n, photo: extra.photo || null, index: extra.index ?? -1 };
    mesh.userData.seg = seg;
    if (seg.photo) {
      const e = this.texture(seg.photo);
      uniforms.uAspect.value = seg.photo.w / seg.photo.h;
      const show = tex => {
        if (!tex) return;
        uniforms.uMap.value = tex;
        uniforms.uHasMap.value = 1;
        seg.fadeIn = true;
      };
      if (e.tex) { show(e.tex); uniforms.uReady.value = 1; seg.fadeIn = false; } else e.ready.then(show);
      const pr = this.prints.get(seg.photo.id);
      if (pr) { uniforms.uPrint.value = pr; uniforms.uPrintOn.value = 1; }
    }
    return seg;
  }

  // frames: [{ id, thumbUrl, w, h, color }] in film order; `room` adds an empty frame that loads photos
  build(frames, room = false) {
    for (const s of this.segs) { s.geo.dispose(); s.mesh.material.dispose(); s.mesh.customDepthMaterial.dispose(); s.gloss.material.dispose(); this.group.remove(s.mesh, s.gloss); }
    this.segs = [];
    let u = 0;
    this.segs.push(this.makeSeg('leader', LEADER, u)); u += LEADER;
    frames.forEach((photo, i) => {
      const len = isPortrait(photo) ? HALF : PITCH;
      this.segs.push(this.makeSeg('frame', len, u, { photo, number: i + 1, index: i }));
      u += len;
    });
    if (room) { this.segs.push(this.makeSeg('add', PITCH, u, { number: frames.length + 1, index: frames.length })); u += PITCH; }
    this.segs.push(this.makeSeg('tail', TAIL, u));
    const live = new Set(frames.map(f => f.id));
    for (const [id, e] of this.texCache) if (!live.has(id)) { e.tex?.dispose(); this.texCache.delete(id); }
    for (const [id, t] of this.prints) if (!live.has(id)) { t.dispose(); this.prints.delete(id); }
    this.update();
  }

  // the film the prints are of; a different one throws them away (the LUT shows until new ones arrive)
  setSim(id) {
    if (id === this.sim) return;
    this.sim = id;
    for (const t of this.prints.values()) t.dispose();
    this.prints.clear();
    for (const s of this.segs) { s.uniforms.uPrint.value = blank(); s.uniforms.uPrintOn.value = 0; s.printIn = false; }
  }

  // a print of one frame has come back from the darkroom: it fades in over the LUT
  setPrint(id, sim, url) {
    if (sim !== this.sim || this.prints.has(id)) return Promise.resolve(false);
    return new Promise(res => new THREE.TextureLoader().load(url, tex => {
      if (sim !== this.sim || this.prints.has(id)) { tex.dispose(); return res(false); }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.prints.set(id, tex);
      for (const s of this.segs) if (s.photo?.id === id) { s.uniforms.uPrint.value = tex; s.printIn = true; }
      res(true);
    }, undefined, () => res(false)));
  }

  release() {
    for (const e of this.texCache.values()) e.tex?.dispose();
    this.texCache.clear();
    for (const t of this.prints.values()) t.dispose();
    this.prints.clear();
    this.build([]);
  }

  // 0 = the raw film you see hanging out of a new cartridge, 1 = a developed strip on the light table
  setProcessed(k) {
    this.leaderBase.lerpColors(this.stubBase, this.base, k);
    this.dim.value = lerp(0.9, 1, k);
  }

  setCasts(on) {
    this.casts = on;
    for (const s of this.segs) s.mesh.castShadow = on;
  }

  setOrder(a, b) {
    this.order = [a, b];
    for (const s of this.segs) { s.mesh.renderOrder = a; s.gloss.renderOrder = b; }
  }

  // the frame and load-more segments, in film order (each has u0, len and index)
  get frames() { return this.segs.filter(s => s.kind === 'frame' || s.kind === 'add'); }

  // which of those sits at distance u past the end of the leader
  frameAt(u) {
    const fr = this.frames;
    let i = 0;
    while (i < fr.length - 1 && u >= fr[i].u0 + fr[i].len - LEADER) i++;
    return i;
  }

  heading(s) {
    const h = this.shape;
    const bend = h.rest + (h.theta0 - h.rest) * (1 - smooth(0, h.bendLen, s));
    const tip = 1 - smooth(0, h.curlLen, this.p - s);
    const flutter = h.flutter * Math.sin(s * 0.75 - h.phase) * smooth(0.5, 4, s) * Math.exp(-s / 30);
    return bend + h.curl * tip * tip + flutter;
  }

  // position (canister-local) and heading at distance σ from the lip
  at(sigma, out) {
    const h = this.shape;
    if (sigma <= 0) {
      const d = Math.min(-sigma, INSIDE);
      out.x = MOUTH.x - Math.cos(h.theta0) * d; out.z = MOUTH.y + Math.sin(h.theta0) * d; out.th = h.theta0;
      return out;
    }
    const f = sigma / DS, k = Math.floor(f), n = this.n;
    if (k >= n - 1) {
      const e = sigma - (n - 1) * DS, th = this.TH[n - 1];
      out.x = this.X[n - 1] + Math.cos(th) * e; out.z = this.Z[n - 1] - Math.sin(th) * e; out.th = th;
      return out;
    }
    const w = f - k;
    out.x = this.X[k] + (this.X[k + 1] - this.X[k]) * w;
    out.z = this.Z[k] + (this.Z[k + 1] - this.Z[k]) * w;
    out.th = this.TH[k] + (this.TH[k + 1] - this.TH[k]) * w;
    return out;
  }

  update() {
    const p = this.p;
    const n = Math.min(this.X.length, Math.floor(Math.max(0, Math.min(p, 78)) / DS) + 2);
    let x = MOUTH.x, z = MOUTH.y;
    for (let k = 0; k < n; k++) {
      const th = this.heading(k * DS);
      this.X[k] = x; this.Z[k] = z; this.TH[k] = th;
      x += Math.cos(th) * DS; z -= Math.sin(th) * DS;
    }
    this.n = n;
    const y0 = FILM_YC - FILM_W / 2, y1 = FILM_YC + FILM_W / 2;
    const o = {};
    for (const seg of this.segs) {
      const hidden = p - (seg.u0 + seg.len) < -INSIDE - 0.1 && p - seg.u0 < -INSIDE;
      seg.mesh.visible = seg.gloss.visible = !hidden;
      if (hidden) continue;
      const pos = seg.geo.attributes.position.array, nor = seg.geo.attributes.normal.array;
      for (let c = 0; c < seg.cols; c++) {
        const u = seg.u0 + seg.len * c / (seg.cols - 1);
        this.at(p - u, o);
        const nx = Math.sin(o.th), nz = Math.cos(o.th), i = c * 6;
        pos[i] = o.x; pos[i + 1] = y0; pos[i + 2] = o.z;
        pos[i + 3] = o.x; pos[i + 4] = y1; pos[i + 5] = o.z;
        nor[i] = nx; nor[i + 1] = 0; nor[i + 2] = nz;
        nor[i + 3] = nx; nor[i + 4] = 0; nor[i + 5] = nz;
      }
      seg.geo.attributes.position.needsUpdate = true;
      seg.geo.attributes.normal.needsUpdate = true;
      seg.geo.computeBoundingSphere();
    }
  }

  // world-space corners of a frame's picture area, for the lightbox flight
  frameCorners(seg) {
    const o = {}, out = [];
    this.group.updateWorldMatrix(true, false);
    const s0 = IMG.s0, s1 = seg.len - IMG.s0;
    for (const [s, t] of [[s0, IMG.t0], [s1, IMG.t0], [s1, IMG.t1], [s0, IMG.t1]]) {
      this.at(this.p - (seg.u0 + s), o);
      out.push(new THREE.Vector3(o.x, FILM_YC - FILM_W / 2 + t, o.z).applyMatrix4(this.group.matrixWorld));
    }
    return out;
  }
}
