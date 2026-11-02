import * as THREE from '../vendor/three.module.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { STOCKS, EXPOSURES, KIND_LABEL, stockById, loadLabelFonts } from './stocks.js';
import { Canister, FILM_YC, MOUTH, EXIT_HEADING } from './canister.js';
import { Film, LEADER, PITCH, FILM_W, lutTexture } from './film.js';
import { SIMS, GROUPS, simOf, simById, lutData, gradePixels, grainOf, halationOf } from './sims.js';
import { Grader } from './grade.js';
import { printOf, dropPrints, forgetPrints } from './prints.js';
import * as store from './store.js';
import { Sound } from './sound.js';
import { Lightbox } from './lightbox.js';
import { Recorder } from './recorder.js';

const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const ease = {
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: t => 1 - (1 - t) ** 3,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};
// easings built from a speed curve: up to speed by `a`, an even run, slowing from `b`
function profile(a, b, pw) {
  const N = 200, acc = [0];
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    acc.push(acc[i - 1] + smooth(0, a, t) * (1 - smooth(b, 1, t)) ** pw);
  }
  return t => { const f = clamp(t, 0, 1) * N, i = Math.floor(f); return lerp(acc[i], acc[Math.min(N, i + 1)], f - i) / acc[N]; };
}
const glide = profile(0.2, 0.42, 1.25);   // a hand pulling film: a firm start, a long even draw, an unhurried stop
const reel = profile(0.1, 0.55, 1.7);     // cranking it back: takes up at once, winds evenly, eases as the leader arrives

const SHORT = {
  gold200: 'Kodak Gold 200', velvia50: 'Fuji Velvia 50', hp5: 'Ilford HP5 Plus', c200: 'Fujicolor C200',
  cine800t: 'CineStill 800T', portra400: 'Kodak Portra 400', trix400: 'Kodak Tri-X 400', lomo800: 'Lomo Color 800',
  e100: 'Kodak E100', vista200: 'Agfa Vista 200', acros100: 'Fuji Acros II', lucky100: 'Lucky SHD 100',
};
const SLOT = 5.25, SHELF_GAP = 8.3, CAN_Z = -0.5, WALL_Z = -3.45, PLANK_D = 4.35, PLANK_T = 0.92;
const TAG_H = 28;    // css px of a tag card at scale 1
const PLANK_FRONT = WALL_Z + PLANK_D;
const STUB = { p: 4.2, curl: 2.05, curlLen: 3.1 };

// ---------------------------------------------------------------- renderer & stage
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.42;
const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 1, 500);

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const OVER = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: false };

// paper backdrop and the veil that fogs the shelf out behind an opened roll (same gradient, so they agree)
const PAPER_FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uBot; uniform vec2 uRes; uniform float uAlpha;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = mix(uBot, uTop, smoothstep(0.0, 1.0, uv.y));
  vec2 q = vec2((uv.x - 0.42) * uRes.x / uRes.y, uv.y - 0.7);
  c *= 1.0 + 0.05 * exp(-dot(q, q) * 1.5);
  vec2 v = uv - 0.5;
  c *= 1.0 - dot(v, v) * 0.22;
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, uAlpha);
}`;
function screenQuad(alpha, order) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: rgb('#efece6') }, uBot: { value: rgb('#e1ddd5') }, uRes: { value: new THREE.Vector2(1, 1) }, uAlpha: { value: alpha } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: PAPER_FRAG, depthTest: false, depthWrite: false, ...OVER,
  }));
  m.frustumCulled = false;
  m.renderOrder = order;
  scene.add(m);
  return m;
}
const backdrop = screenQuad(1, -100);
const veil = screenQuad(0, 5);
veil.visible = false;
veil.onAfterRender = r => r.clearDepth();       // the opened can and its film draw above everything shelved

// the light panel the strip is held against
const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  uniforms: { uSize: { value: new THREE.Vector2(1, 1) }, uAlpha: { value: 0 }, uColor: { value: rgb('#fdfcf9') }, uEdge: { value: 1.5 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform vec2 uSize; uniform float uAlpha; uniform vec3 uColor; uniform float uEdge; varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * uSize;
      vec2 d = abs(p) - (uSize * 0.5 - uEdge);
      float a = (1.0 - smoothstep(-uEdge, uEdge, d.x)) * (1.0 - smoothstep(-uEdge, uEdge, d.y));
      float core = 1.0 - 0.03 * smoothstep(0.0, uSize.y * 0.5, abs(p.y));
      gl_FragColor = vec4(uColor * core, a * uAlpha);
    }`,
  depthTest: false, depthWrite: false, ...OVER,
}));
panel.renderOrder = 6;
panel.frustumCulled = false;
panel.visible = false;
scene.add(panel);

// late-afternoon sun through a window: one far spotlight throws the soft shadows and, through its
// `map`, the out-of-focus shade of leaves outside
const SUN_DIR = new THREE.Vector3(-0.55, 0.45, 0.7).normalize();
let r0 = 20240527;
const rnd = () => (r0 = (r0 * 16807) % 2147483647) / 2147483647;

function leafTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const layer = document.createElement('canvas');
  layer.width = layer.height = S;
  const lg = layer.getContext('2d');
  const leaf = (x, y, len, a) => {
    const wid = len * (0.26 + rnd() * 0.1);
    lg.save(); lg.translate(x, y); lg.rotate(a);
    lg.beginPath(); lg.moveTo(0, 0);
    lg.bezierCurveTo(len * 0.25, -wid, len * 0.7, -wid * 0.9, len, 0);
    lg.bezierCurveTo(len * 0.7, wid * 0.8, len * 0.25, wid, 0, 0);
    lg.fill(); lg.restore();
  };
  // a branch is a quadratic stem with leaves alternating along it; the wall sees roughly
  // x 100..800 and y 150..800 of this texture (measured with a projected grid)
  const branch = (x0, y0, cx, cy, x1, y1, len) => {
    lg.lineWidth = len * 0.07; lg.lineCap = 'round';
    lg.beginPath(); lg.moveTo(x0, y0); lg.quadraticCurveTo(cx, cy, x1, y1); lg.stroke();
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / (len * 0.42));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      const a = Math.atan2(dy, dx), side = i % 2 ? 1 : -1, l = len * (0.75 + rnd() * 0.45) * (1 - t * 0.35);
      leaf(x, y, l, a + side * (0.7 + rnd() * 0.45));
      if (rnd() > 0.55) leaf(x, y, l * 0.8, a - side * (0.6 + rnd() * 0.4));
    }
    leaf(x1, y1, len * 0.8, Math.atan2(y1 - cy, x1 - cx));
  };
  const pass = (blur, alpha, list) => {
    lg.clearRect(0, 0, S, S);
    lg.fillStyle = lg.strokeStyle = '#000';
    for (const b of list) branch(...b);
    g.save(); g.filter = `blur(${blur}px)`; g.globalAlpha = alpha; g.drawImage(layer, 0, 0); g.restore();
  };
  pass(20, 0.46, [[0, 470, 170, 400, 360, 520, 120], [440, 1024, 560, 860, 720, 770, 110], [0, 900, 140, 800, 300, 770, 120]]);
  pass(8, 0.6, [[0, 330, 200, 230, 430, 300, 96], [0, 640, 220, 590, 400, 700, 100], [230, 1024, 300, 800, 520, 650, 92], [40, 170, 160, 140, 290, 220, 80]]);
  pass(3, 0.32, [[120, 560, 190, 520, 260, 560, 54], [330, 860, 380, 820, 430, 840, 50]]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sun = new THREE.SpotLight(0xffecd2, 1.85, 0, 0.21, 0.2, 0);
sun.map = leafTexture();
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 180;
sun.shadow.radius = 7;
sun.shadow.blurSamples = 20;
sun.shadow.bias = -0.0016;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const sky = new THREE.HemisphereLight(0xf4f2ef, 0xd8ccba, 0.22);
scene.add(sky);

function noise1(x, seed) {
  const h = n => { const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

function plasterTexture() {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), d = g.createImageData(N, N);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = 243 + (Math.random() - 0.5) * 9;
    d.data[i] = v; d.data[i + 1] = v - 1; d.data[i + 2] = v - 3; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * N, y = rnd() * N, r = 20 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rnd() > 0.5 ? '255,255,255' : '150,130,110'},0.05)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(9, 6);
  return t;
}

const wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 260), new THREE.MeshStandardMaterial({ color: 0xf2ece2, map: plasterTexture(), roughness: 0.97 }));
wall.position.z = WALL_Z;
wall.receiveShadow = true;
wall.renderOrder = -50;
scene.add(wall);

// white oak: long wavy grain, darker latewood lines, fine pores and the odd ray fleck
function oakTexture() {
  const W = 2048, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), d = g.createImageData(W, H);
  const warpA = new Float32Array(W), warpB = new Float32Array(W);
  for (let x = 0; x < W; x++) { warpA[x] = noise1(x * 0.0021, 1) * 46 + noise1(x * 0.011, 2) * 6; warpB[x] = noise1(x * 0.004, 3); }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const yy = y + warpA[x];
      const band = noise1(yy * 0.05, 4) * 0.6 + noise1(yy * 0.19, 5) * 0.4;
      const line = Math.pow(Math.abs(Math.sin(yy * 0.115 + band * 4.5)), 14);
      const tone = 0.5 + (noise1(yy * 0.012, 6) - 0.5) * 0.5 + (warpB[x] - 0.5) * 0.12;
      const k = line * 0.22 + (1 - band) * 0.05;
      const i = (y * W + x) * 4;
      d.data[i] = 222 + tone * 18 - k * 70;
      d.data[i + 1] = 196 + tone * 16 - k * 66;
      d.data[i + 2] = 160 + tone * 14 - k * 58;
      d.data[i + 3] = 255;
    }
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(110,75,40,${0.06 + rnd() * 0.1})`;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 9, 1);
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(250,236,210,${0.08 + rnd() * 0.1})`;
    g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 22, 1.5 + rnd() * 2, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const oak = oakTexture();
const oakEdge = oak.clone();
oakEdge.repeat.set(1, 0.2);
oakEdge.offset.set(0, 0.4);
const oakEnd = new THREE.MeshPhysicalMaterial({ color: 0xd8bf98, roughness: 0.8 });
const plankMats = [
  oakEnd, oakEnd,
  new THREE.MeshPhysicalMaterial({ map: oak, roughness: 0.6, clearcoat: 0.12, clearcoatRoughness: 0.55 }),
  new THREE.MeshPhysicalMaterial({ color: 0xcdb08a, roughness: 0.8 }),
  new THREE.MeshPhysicalMaterial({ map: oakEdge, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.55, color: 0xf2ece4 }),
  oakEnd,
];

// contact darkening where the shelf meets the wall, above and below it
function aoTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
const aoMat = new THREE.MeshBasicMaterial({
  map: aoTexture(), depthWrite: false, transparent: false, opacity: 0.55,
  blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
});

// ---------------------------------------------------------------- state
let mode = 'boot';           // boot | shelf | opening | open | closing
let canisters = [];
let active = null, hover = null, hoverSeg = null;
const rolls = new Map(), photos = new Map();
const L = { cols: 0, rows: 0, bounds: null, planks: [] };
const view = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const par = { x: 0, y: 0, tx: 0, ty: 0 };
const stage = new THREE.Vector3();
const pull = { target: 0, min: 0, max: 0, start: 0, sigCenter: 0, visW: 16, drag: null, lastInput: -1, lastP: 0, tick: 0 };
const sound = new Sound();
let clock = 0;

// ---------------------------------------------------------------- tweens & loop
const tweens = new Set();
function tween(dur, fn, { delay = 0, ease: e = x => x } = {}) {
  return new Promise(res => { tweens.add({ t: -delay, dur, fn, e, res }); kick(); });
}
function stepTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.e(k), k);
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
}

let running = false, frozen = false, lastT = 0, awake = 0;
function kick() {
  if (running || frozen) return;
  running = true;
  lastT = performance.now();
  requestAnimationFrame(loop);
}
function loop(t) {
  if (frozen) { running = false; return; }
  const dt = clamp((t - lastT) / 1000, 0.0001, 0.05);
  lastT = t;
  let moving = false;
  try {
    moving = step(dt);
    render();
  } catch (e) {
    console.error(e);   // keep the loop alive; one bad frame must not freeze the shelf
  }
  awake = moving ? 0.35 : awake - dt;
  if (tweens.size || awake > 0) requestAnimationFrame(loop);
  else running = false;
}
function render() {
  if (mode !== 'open') renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- layout
function layout(force = false) {
  const cols = innerWidth / innerHeight >= 1.42 ? 6 : 4;
  if (cols === L.cols && !force) return false;
  const rows = Math.ceil(canisters.length / cols);
  L.cols = cols; L.rows = rows;
  canisters.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    c.slot = new THREE.Vector3((col - (cols - 1) / 2) * SLOT, (rows - 1 - row) * SHELF_GAP, CAN_Z);
    c.order = col + row * 0.6;
    if (c !== active) c.root.position.copy(c.slot);
  });
  for (const p of L.planks) { scene.remove(p); p.geometry.dispose(); }
  L.planks = [];
  const w = cols * SLOT + 4.2;
  const ao = (pw, ph, x, y, z, rx, flip) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), aoMat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, flip ? Math.PI : 0);
    m.renderOrder = 0.7;
    scene.add(m);
    L.planks.push(m);
  };
  for (let r = 0; r < rows; r++) {
    const y = r * SHELF_GAP;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, PLANK_T, PLANK_D), plankMats);
    m.position.set(0, y - PLANK_T / 2, WALL_Z + PLANK_D / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    L.planks.push(m);
    ao(w, 1.3, 0, y + 0.003, WALL_Z + 0.65, -Math.PI / 2, false);   // on the shelf, against the wall
    ao(w, 1.1, 0, y + 0.55, WALL_Z + 0.003, 0, true);              // on the wall, just above the shelf
    ao(w, 1.6, 0, y - PLANK_T - 0.8, WALL_Z + 0.003, 0, false);    // on the wall, under the shelf
  }
  const top = (rows - 1) * SHELF_GAP;
  L.bounds = { x0: -w / 2 + 1.6, x1: w / 2 - 1.6, y0: -2.3, y1: top + 5.4 };
  sun.target.position.set(0, top / 2 + 1, 0);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 115);
  // the light table sits on the sun's axis, so the opened can is lit cleanly by the same window
  stage.copy(sun.target.position).addScaledVector(SUN_DIR, 18);
  stage.y -= FILM_YC;
  return true;
}

function shelfView() {
  const b = L.bounds, H = innerHeight, aspect = innerWidth / H;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const top = 132, bottom = 74, usable = Math.max(0.45, (H - top - bottom) / H);
  const halfH = (b.y1 - b.y0) / 2 / usable, halfW = (b.x1 - b.x0) / 2 / 0.93;
  const dist = Math.max(halfH / t, halfW / (t * aspect)) + 2;
  const perPx = 2 * dist * t / H;
  const cy = (b.y0 + b.y1) / 2 + (top - bottom) / 2 * perPx;
  const el = 0.13;
  const target = new THREE.Vector3(0, cy, CAN_Z);
  return { target, pos: target.clone().add(new THREE.Vector3(0, Math.sin(el) * dist, Math.cos(el) * dist)) };
}

function openView() {
  const aspect = innerWidth / innerHeight;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const visH = FILM_W / 0.335, dist = visH / 2 / t, visW = visH * aspect;
  const target = new THREE.Vector3(stage.x - visW * 0.33, stage.y + FILM_YC + 0.12, stage.z + 0.95);
  const el = 0.075;
  return { target, visW, pos: target.clone().add(new THREE.Vector3(0, Math.sin(el) * dist, Math.cos(el) * dist)) };
}

function placePanel(v) {
  const w = v.visW * 1.7 + 24, h = FILM_W + 3.6;
  panel.position.set(v.target.x - 6, stage.y + FILM_YC, stage.z - 2.6);
  panel.scale.set(w, h, 1);
  panel.material.uniforms.uSize.value.set(w, h);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  backdrop.material.uniforms.uRes.value.copy(s);
  veil.material.uniforms.uRes.value.copy(s);
  if (!canisters.length) return;
  layout();
  if (mode === 'shelf' || mode === 'boot') Object.assign(view, shelfView());
  else if (mode === 'open') {
    const v = openView();
    view.pos.copy(v.pos); view.target.copy(v.target);
    placePanel(v);
    measure();
  }
  kick();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- per-frame
const tmp = new THREE.Vector3();
function step(dt) {
  clock += dt;
  let moving = false;
  stepTweens(dt);

  for (const c of canisters) {
    if (c !== active) {
      const l = c.lift, tu = c.turn;
      c.lift = damp(c.lift, c.tLift ?? 0, 11, dt);
      c.turn = damp(c.turn, c.tTurn ?? 0, 8, dt);
      c.tilt = damp(c.tilt, 0, 8, dt);
      if (Math.abs(c.lift - l) + Math.abs(c.turn - tu) > 1e-5) moving = true;
    }
    c.apply();
  }

  const px = par.x, py = par.y;
  const k = mode === 'shelf' || mode === 'boot' ? 1 : 0.25;
  par.x = damp(par.x, par.tx * k, 3.5, dt);
  par.y = damp(par.y, par.ty * k, 3.5, dt);
  if (Math.abs(par.x - px) + Math.abs(par.y - py) > 1e-5) moving = true;
  camera.position.copy(view.pos).add(tmp.set(par.x * 1.6, -par.y * 0.9, 0));
  camera.lookAt(tmp.set(par.x * 0.4, -par.y * 0.25, 0).add(view.target));
  scene.environmentRotation.y = par.x * 0.5;

  if (active) {
    const L = active.film.lut, t = damp(L.t.value, lutTarget, 9, dt);
    if (Math.abs(t - L.t.value) > 1e-4) moving = true;
    L.t.value = Math.abs(t - lutTarget) < 1e-3 ? lutTarget : t;
  }
  const wantPreview = active && mode === 'open' && !lightbox.isOpen && hoverSeg?.kind === 'frame' && hoverSeg.photo?.video ? hoverSeg : null;
  if (wantPreview !== preview.seg) setPreview(wantPreview);
  if (preview.tex) {
    if (preview.printTex) {
      preview.grader.draw();
      preview.printTex.needsUpdate = true;
      preview.seg.uniforms.uPrint.value = preview.printTex;
      preview.seg.uniforms.uPrintOn.value = 1;
    }
    moving = true;
  }

  if (active) {
    const f = active.film;
    if (mode === 'open') {
      const P = pull;
      if (!P.drag && clock - P.lastInput > 0.14) P.target = damp(P.target, clamp(P.target, P.min, P.max), 7, dt);
      f.p = damp(f.p, P.target, P.drag ? 24 : 8.5, dt);
    }
    const dp = f.p - pull.lastP, v = dp / dt;
    pull.lastP = f.p;
    const fl = f.shape.flutter;
    f.shape.flutter = damp(fl, Math.min(0.055, Math.abs(v) * 0.0032), 5, dt);
    f.shape.phase += dt * (4 + Math.abs(v) * 0.45);
    active.spin -= dp / 0.52;
    sound.rustle(v);
    const tick = Math.floor((f.p - LEADER) / PITCH);
    if (tick !== pull.tick) { if (tick >= 0) sound.tick(0.7); pull.tick = tick; }
    if (Math.abs(dp) > 1e-5 || f.shape.flutter > 2e-4 || tweens.size) { f.update(); moving = true; }
    for (const s of f.segs) {
      const u = s.uniforms;
      const h = damp(u.uHover.value, s === hoverSeg ? 1 : 0, 10, dt);
      if (Math.abs(h - u.uHover.value) > 1e-4) moving = true;
      u.uHover.value = h;
      if (s.fadeIn) {
        u.uReady.value = damp(u.uReady.value, 1, 5, dt);
        moving = true;
        if (u.uReady.value > 0.999) { u.uReady.value = 1; s.fadeIn = false; }
      }
      if (s.printIn && s !== preview.seg) {
        u.uPrintOn.value = damp(u.uPrintOn.value, 1, 4, dt);
        moving = true;
        if (u.uPrintOn.value > 0.999) { u.uPrintOn.value = 1; s.printIn = false; }
      }
    }
    if (mode === 'open') updateCounter();
  }
  if (mode !== 'open') placeTags();
  return moving;
}

// ---------------------------------------------------------------- DOM: shelf tags
const proj = new THREE.Vector3();
function toScreen(v) {
  proj.copy(v).project(camera);
  return { x: (proj.x + 1) / 2 * innerWidth, y: (1 - proj.y) / 2 * innerHeight };
}
// each tag is a small archive card on the shelf's front edge, sized to that edge as the camera sees it
let tagScale = 0;
function placeTags() {
  if (!L.cols) return;
  const edge = toScreen(tmp.set(0, -PLANK_T, PLANK_FRONT)).y - toScreen(tmp.set(0, 0, PLANK_FRONT)).y;
  const k = clamp(edge * 0.72 / TAG_H, 0.7, 1.35);
  if (Math.abs(k - tagScale) > 0.004) { tagScale = k; $('#tags').style.setProperty('--k', k.toFixed(3)); }
  for (const c of canisters) {
    if (!c.tag) continue;
    const s = toScreen(tmp.set(c.slot.x, c.slot.y - PLANK_T / 2, PLANK_FRONT + 0.02));
    c.tag.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}

function buildTags() {
  const host = $('#tags');
  for (const c of canisters) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.style.setProperty('--swatch', c.stock.accent);
    el.innerHTML = '<div class="card"><span class="name"></span><span class="count"></span></div>';
    host.appendChild(el);
    c.tag = el;
    const name = el.querySelector('.name');
    bindName(name, () => c.stock.id);
    el.addEventListener('pointerenter', () => { if (mode === 'shelf') setHover(c); });
    el.addEventListener('pointerleave', () => { if (mode === 'shelf' && hover === c) setHover(null); });
    // the tag opens its roll, but never as the tail end of renaming: not when the press began on the
    // name (a drag-select that ends beside it), not while a name was being edited (that click just
    // commits it), and not while text in the tag is still selected
    let press = null;
    el.addEventListener('pointerdown', e => { press = { inName: name.contains(e.target), editing: !!document.activeElement?.isContentEditable }; });
    el.addEventListener('click', e => {
      const p = press;
      press = null;
      if (mode !== 'shelf' || !p || p.inName || p.editing || name.contains(e.target)) return;
      const sel = getSelection();
      if (sel && !sel.isCollapsed && el.contains(sel.anchorNode)) return;
      openRoll(c);
    });
  }
}

function bindName(el, idOf) {
  el.contentEditable = 'plaintext-only';
  el.spellcheck = false;
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = rolls.get(idOf())?.name || ''; el.blur(); }
  });
  el.addEventListener('blur', () => {
    getSelection()?.removeAllRanges();
    const id = idOf();
    if (id) rename(id, el.textContent);
  });
  // the first press on a name selects all of it, ready to type over; once editing, presses place the
  // caret and drag-select as usual
  el.addEventListener('mousedown', e => {
    e.stopPropagation();
    if (document.activeElement === el || e.button !== 0) return;
    e.preventDefault();
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  el.addEventListener('click', e => e.stopPropagation());
}

function rename(id, text) {
  const r = rolls.get(id);
  const name = text.replace(/\s+/g, ' ').trim().slice(0, 16) || stockById(id).name;
  if (name !== r.name) { r.name = name; store.put('rolls', r); }
  syncNames();
}

function syncNames() {
  for (const c of canisters) {
    const r = rolls.get(c.stock.id), n = c.tag.querySelector('.name');
    if (document.activeElement !== n) n.textContent = r.name;
    c.tag.querySelector('.count').innerHTML = `<b>${String(r.photoIds.length).padStart(2, '0')}</b>/${EXPOSURES}`;
  }
  if (active && document.activeElement !== $('#rollName')) $('#rollName').textContent = rolls.get(active.stock.id).name;
  let total = 0;
  for (const r of rolls.values()) total += r.photoIds.length;
  $('#meta').textContent = `${canisters.length} 卷 · ${total} 张`;
}

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(x, y, objs) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(objs, false)[0] || null;
}
const canisterAt = (x, y) => pick(x, y, canisters.map(c => c.hit))?.object.userData.canister || null;

function setHover(c) {
  if (hover === c) return;
  if (hover) { hover.tLift = 0; hover.tTurn = 0; hover.tag.classList.remove('hot'); }
  hover = c;
  if (c) { c.tLift = 0.34; c.tTurn = -0.38; c.tag.classList.add('hot'); }
  canvas.className = c ? 'hand' : '';
  kick();
}

// hovering a video frame on the strip plays it right there, silently and in the strip's black and white
const preview = { seg: null, video: null, tex: null, printTex: null, grader: null };
function setPreview(seg) {
  if (preview.seg === seg) return;
  const old = preview.seg;
  if (old) {
    const poster = active?.film.texCache.get(old.photo.id)?.tex;
    if (poster && old.uniforms.uMap.value === preview.tex) old.uniforms.uMap.value = poster;
    const print = active?.film.prints.get(old.photo.id);
    old.uniforms.uPrintOn.value = print ? 1 : 0;
    if (print) old.uniforms.uPrint.value = print;
    preview.video.pause();
    preview.video.removeAttribute('src');
    preview.video.load();
    preview.tex?.dispose();
    preview.printTex?.dispose();
  }
  Object.assign(preview, { seg, video: null, tex: null, printTex: null });
  if (!seg) return;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true;
  v.src = seg.photo.videoUrl;
  preview.video = v;
  v.addEventListener('playing', () => {
    if (preview.video !== v) return;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    preview.tex = tex;
    seg.uniforms.uMap.value = tex;
    seg.uniforms.uPrintOn.value = 0;
    const sim = rollSim(active);
    lutData(sim.id).then(data => {
      if (preview.video !== v) return;
      const g = preview.grader ||= new Grader(document.createElement('canvas'));
      const k = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
      g.size(Math.max(1, Math.round(v.videoWidth*k)), Math.max(1, Math.round(v.videoHeight*k)));
      g.setLut(data); g.setGrain(grainOf(sim.id)); g.setHalation(halationOf(sim.id));
      g.setPrint(null); g.setSource(v); g.amount = 1; g.dev.from = g.dev.to = 1; g.draw();
      const t = preview.printTex = new THREE.CanvasTexture(g.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      seg.uniforms.uPrint.value = t;
      seg.uniforms.uPrintOn.value = 1;
      kick();
    });
    kick();
  }, { once: true });
  v.play().catch(() => {});
}

function filmHover(x, y) {
  const f = active.film;
  const hit = pick(x, y, f.segs.map(s => s.mesh));
  const seg = hit?.object.userData.seg;
  hoverSeg = seg && (seg.kind === 'frame' || seg.kind === 'add') ? seg : null;
  const can = !hit && pick(x, y, [active.hit]);
  canvas.className = hoverSeg ? (hoverSeg.kind === 'add' ? 'hand' : 'zoom') : can ? 'hand' : hit ? 'grab' : '';
  kick();
}

// ---------------------------------------------------------------- open / close
// what the strip and the lightbox need of a stored photo or video
const frameItem = p => ({ id: p.id, ...store.photoUrls(p), w: p.w, h: p.h, color: !!p.color, video: p.kind === 'video', dur: p.dur || 0 });
function framesOf(id) {
  return rolls.get(id).photoIds.map(pid => photos.get(pid)).filter(Boolean).map(frameItem);
}

function buildFilm() {
  setPreview(null);
  const id = active.stock.id, items = framesOf(id);
  active.film.build(items, items.length < EXPOSURES);
  measure();
  printStrip();
}

function measure() {
  const v = openView(), f = active.film;
  const lipX = stage.x - MOUTH.x;           // the can stands turned round: its +x points to world -x
  const sigLeft = lipX - (v.target.x - v.visW / 2) + 0.2;
  pull.sigCenter = lipX - v.target.x + 0.2;
  pull.visW = v.visW;
  // frames are full or half length, so everything along the strip goes by position, not by count
  const fr = f.frames, span = fr.reduce((a, s) => a + s.len, 0);
  pull.span = span;
  pull.max = LEADER + span + 1.4;
  pull.start = pull.min = Math.min(pull.max, LEADER + sigLeft - 0.9);
  const ticks = $('#scrub .ticks');
  ticks.innerHTML = '';
  for (const u of [...fr.map(s => s.u0 - LEADER), span]) { const t = document.createElement('i'); t.style.left = (u / span * 100) + '%'; ticks.appendChild(t); }
}

function updateCounter() {
  const f = active.film, n = f.frameCount;
  const u = f.p - pull.sigCenter - LEADER;
  const i = f.frameAt(u);
  const cur = n ? String(Math.min(i + 1, n)).padStart(2, '0') : '00';
  const el = $('#cur');
  if (el.textContent !== cur) el.textContent = cur;
  $('#scrub .knob').style.left = clamp(u / (pull.span || 1), 0, 1) * 100 + '%';
}

function fillRollUI() {
  const s = active.stock, r = rolls.get(s.id);
  showSim();
  document.documentElement.style.setProperty('--accent', s.accent);
  $('#rollBrand').textContent = s.brand;
  $('#rollName').textContent = r.name;
  $('#rollStock').innerHTML = `<b>${s.title}</b> &nbsp;·&nbsp; ISO ${s.iso} &nbsp;·&nbsp; ${s.process} &nbsp;·&nbsp; ${KIND_LABEL[s.kind]} &nbsp;·&nbsp; 135`;
  refreshRoom();
}

function refreshRoom() {
  if (!active) return;
  const n = rolls.get(active.stock.id).photoIds.length, left = EXPOSURES - n;
  $('#tot').textContent = String(n).padStart(2, '0');
  $('#room').textContent = left > 0 ? `余 ${left}` : '已满';
  $('#load').disabled = left <= 0;
}

async function openRoll(c) {
  if (mode !== 'shelf') return;
  mode = 'opening';
  sound.ensure();
  setHover(null);
  c.tag.classList.remove('hot');
  active = c;
  hoverSeg = null;
  canvas.className = '';
  document.body.classList.add('in-roll');
  c.setStage(true);
  c.film.setOrder(20, 21);
  c.film.setCasts(false);
  applySim(c);
  buildFilm();
  fillRollUI();
  $('#roll').hidden = false;
  const v0 = { pos: view.pos.clone(), target: view.target.clone() }, v1 = openView();
  placePanel(v1);
  veil.visible = panel.visible = true;
  const from = c.root.position.clone(), to = stage.clone();
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 2.2, 0));
  const turn0 = c.turn, lift0 = c.lift;
  const f = c.film;
  pull.lastP = f.p;
  sound.lift();

  tween(0.9, e => { panel.material.uniforms.uAlpha.value = e; }, { delay: 0.6, ease: ease.out });
  await tween(1.2, (e, k) => {
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, d = e * e;
    c.root.position.set(from.x * a + mid.x * b + to.x * d, from.y * a + mid.y * b + to.y * d, from.z * a + mid.z * b + to.z * d);
    c.lift = lift0 * (1 - e);
    c.grounded = Math.max(1 - smooth(0, 0.1, k), smooth(0.86, 1, k));
    c.turn = lerp(turn0, Math.PI, ease.inOut(smooth(0.06, 0.94, k)));
    c.tilt = -Math.sin(Math.PI * e) * 0.07;
    view.pos.lerpVectors(v0.pos, v1.pos, e);
    view.target.lerpVectors(v0.target, v1.target, e);
    veil.material.uniforms.uAlpha.value = smooth(0, 0.55, k) * 0.984;
  }, { ease: ease.inOut });
  sound.land();
  tween(0.5, e => { c.tilt = Math.sin(e * Math.PI * 2) * 0.012 * (1 - e); });

  measure();
  setTimeout(() => $('#roll').classList.add('on'), 650);
  // a short tug, then the long draw
  await tween(0.2, e => { f.p = lerp(STUB.p, STUB.p + 0.7, e); c.root.position.x = to.x - Math.sin(e * Math.PI) * 0.06; }, { ease: ease.out, delay: 0.08 });
  const p0 = f.p, pEnd = pull.start;
  await tween(clamp(1.1 + (pEnd - p0) * 0.03, 1.2, 1.9), (e, k) => {
    const g = glide(k);
    f.p = lerp(p0, pEnd, g);
    f.shape.rest = lerp(EXIT_HEADING, 0, smooth(0, 0.32, g));
    f.shape.curl = lerp(STUB.curl, 0.28, smooth(0.04, 0.8, g));
    f.shape.curlLen = lerp(STUB.curlLen, 7, g);
    f.setProcessed(smooth(0, 0.6, g));
  });
  pull.target = f.p;
  mode = 'open';
  filmHover(lastPointer.x, lastPointer.y);
}

async function closeRoll() {
  if (mode !== 'open' || lightbox.isOpen) return;
  closeSimPanel();
  dropPrints(printGroup(active));
  mode = 'closing';
  hoverSeg = null;
  canvas.className = '';
  document.activeElement?.blur?.();
  $('#roll').classList.remove('on');
  const c = active, f = c.film, p0 = f.p, s0 = { ...f.shape };
  c.tag.classList.add('away');

  // 1 · wind the film back in. The leader's curl, the exit bend and the raw-film tint follow how much
  // film is still out, so the tongue curls up as it reaches the lip rather than on a timer; meanwhile
  // the camera eases towards the can, which is where the eye is going next.
  const R = clamp(0.8 + (p0 - STUB.p) * 0.007, 0.9, 1.4);
  const v0 = { pos: view.pos.clone(), target: view.target.clone() };
  const lip = stage.clone().add(new THREE.Vector3(-0.3, FILM_YC, 0.4));
  const vA = { target: v0.target.clone().lerp(lip, 0.3) };
  vA.pos = vA.target.clone().add(v0.pos.clone().sub(v0.target).multiplyScalar(0.92));
  const rewound = tween(R, (e, k) => {
    f.p = lerp(p0, STUB.p, reel(k));
    const n = 1 - smooth(STUB.p, STUB.p + 9, f.p);
    f.shape.rest = lerp(s0.rest, EXIT_HEADING, smooth(0, 1, n));
    f.shape.curl = lerp(s0.curl, STUB.curl, n * n);
    f.shape.curlLen = lerp(s0.curlLen, STUB.curlLen, n);
    f.setProcessed(1 - n);
    panel.material.uniforms.uAlpha.value = 1 - smooth(0.25, 0.7, k);
    if (k <= 0.8) {
      const m = ease.sine(k / 0.8);
      view.pos.lerpVectors(v0.pos, vA.pos, m);
      view.target.lerpVectors(v0.target, vA.target, m);
    }
  });

  // 2 · lift off while the last of the leader is still going in, and carry the can home. The shelf
  // comes up out of the fog early so you can see where it is headed; the shelved tags follow.
  const hover = c.slot.clone().add(new THREE.Vector3(0, 0, 1.4)), HOVER = 1.0;
  let B = null;
  const carried = tween(1.2, (e, k) => {
    if (!B) {
      B = { pos: view.pos.clone(), target: view.target.clone(), v1: shelfView(), from: c.root.position.clone() };
      B.mid = B.from.clone().lerp(hover, 0.45).add(new THREE.Vector3(0, 2.4, 0));
      sound.lift();
    }
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, d = e * e;
    c.root.position.set(B.from.x * a + B.mid.x * b + hover.x * d, B.from.y * a + B.mid.y * b + hover.y * d, B.from.z * a + B.mid.z * b + hover.z * d);
    c.lift = HOVER * smooth(0, 0.6, k);
    c.grounded = 1 - smooth(0, 0.12, k);
    c.turn = lerp(Math.PI, 0, ease.inOut(smooth(0.05, 0.9, k)));
    c.tilt = -Math.sin(Math.PI * e) * 0.08;
    view.pos.lerpVectors(B.pos, B.v1.pos, e);
    view.target.lerpVectors(B.target, B.v1.target, e);
    veil.material.uniforms.uAlpha.value = 0.984 * (1 - smooth(0.08, 0.7, k));
    if (k > 0.3) document.body.classList.remove('in-roll');
  }, { ease: ease.inOut, delay: R * 0.8 });
  await Promise.all([rewound, carried]);
  veil.visible = panel.visible = false;
  c.setStage(false);

  // 3 · set it down: back over the shelf, then down onto it, with a little rock as it settles
  let landed = false;
  await tween(0.62, (e, k) => {
    c.root.position.z = lerp(hover.z, c.slot.z, ease.out(Math.min(1, k / 0.7)));
    c.lift = HOVER * (1 - smooth(0.12, 0.82, k)) ** 1.6;
    c.grounded = smooth(0.2, 0.82, k);
    c.tilt = k < 0.82 ? 0 : Math.sin((k - 0.82) / 0.18 * Math.PI * 2) * 0.014 * (1 - (k - 0.82) / 0.18);
    if (!landed && k >= 0.8) {
      landed = true;
      sound.land();
      c.tag.classList.remove('away', 'bump');
      void c.tag.offsetWidth;
      c.tag.classList.add('bump');
    }
  });
  c.root.position.copy(c.slot);
  c.lift = c.tLift = 0; c.tTurn = 0; c.tilt = 0; c.grounded = 1;
  f.setOrder(1, 2);
  Object.assign(f.shape, { rest: EXIT_HEADING, curl: STUB.curl, curlLen: STUB.curlLen, flutter: 0 });
  f.p = STUB.p;
  f.release();
  f.setProcessed(0);
  f.setCasts(true);
  veil.visible = panel.visible = false;
  $('#roll').hidden = true;
  active = null;
  mode = 'shelf';
  syncNames();
  const h = canisterAt(lastPointer.x, lastPointer.y);
  if (h) setHover(h);
  kick();
}

// ---------------------------------------------------------------- film simulation
const lutTex = new Map();
function simTexture(id) {
  if (!lutTex.has(id)) lutTex.set(id, lutData(id).then(lutTexture));
  return lutTex.get(id);
}
const rollSim = c => simOf(rolls.get(c.stock.id), c.stock.id);

// how strongly a roll's film is laid over its pictures (the 浓度 slider), 0..1
const DEFAULT_AMT = 0.7;
const rollAmt = c => rolls.get(c.stock.id)?.simAmt ?? DEFAULT_AMT;

// a roll's film: its base, ink and edge text on the strip right away, its LUT once that has loaded, and
// SpektraLab's prints of its frames as the darkroom makes them
function applySim(c) {
  const sim = rollSim(c);
  c.film.setStyle(sim);
  c.film.setSim(sim.id);
  c.film.lut.amt.value = rollAmt(c);
  simTexture(sim.id).then(t => {
    if (rollSim(c) !== sim) return;
    c.film.lut.a.value = t;
    c.film.lut.t.value = 0;
    kick();
  });
}

// SpektraLab prints of the open roll's frames: the ones in view first, then outwards along the strip
const printGroup = c => c.stock.id + '~' + rollSim(c).id;
function printStrip() {
  const c = active, sim = c && rollSim(c);
  if (!c || sim.id === 'none') return;
  const mid = c.film.p - pull.sigCenter;
  const segs = c.film.segs.filter(s => s.kind === 'frame' && !c.film.prints.has(s.photo.id))
    .sort((a, b) => Math.abs(a.u0 + a.len / 2 - mid) - Math.abs(b.u0 + b.len / 2 - mid));
  segs.forEach((s, i) => {
    const p = photos.get(s.photo.id);
    printOf(p, sim.id, 's', { prio: i < 6 ? 1 : 0, group: printGroup(c) }).then(url => {
      if (url && active === c) c.film.setPrint(p.id, sim.id, url).then(ok => ok && kick());
    });
  });
}

// the roll head's line: the film, and its strength slider when there is a film
function showSim() {
  const sim = rollSim(active);
  $('#simName').textContent = sim.name;
  $('#simAmt').hidden = sim.id === 'none';
  setAmtUI(rollAmt(active));
}
function setAmtUI(v) {
  const pc = Math.round(v * 100);
  for (const el of document.querySelectorAll('.amt input')) { el.value = pc; el.style.setProperty('--v', pc + '%'); }
  for (const el of document.querySelectorAll('.amt output')) el.textContent = pc;
}
// dragging either slider (roll head or lightbox) moves the strip and the lightbox; letting go keeps it
function setAmt(v, save) {
  if (!active) return;
  active.film.lut.amt.value = v;
  setAmtUI(v);
  lightbox.setAmount(v);
  if (save) {
    const roll = rolls.get(active.stock.id);
    roll.simAmt = v;
    store.put('rolls', roll);
  }
  kick();
}
for (const el of document.querySelectorAll('.amt input')) {
  el.addEventListener('input', () => setAmt(el.value / 100, false));
  el.addEventListener('change', () => setAmt(el.value / 100, true));
  el.addEventListener('pointerup', () => el.blur());   // the arrow keys go back to stepping frames
  for (const ev of ['pointerdown', 'click', 'wheel']) el.closest('.amt').addEventListener(ev, e => e.stopPropagation());
}

// the picker. Opening it lays the strip out developed; hovering a film shows it on the strip (the LUT's
// B slot fades in over A); choosing one makes it the roll's. Each film's swatch is the roll's first
// frame, through the LUT at once and then as SpektraLab prints it.
const simPanel = $('#simPanel');
let simOpen = false, simHover = null, lutTarget = 0;

function developAll(on) {
  const segs = active.film.segs.filter(s => s.kind === 'frame');
  const from = segs.map(s => s.uniforms.uSat.value);
  tween(0.6, e => segs.forEach((s, i) => { s.uniforms.uSat.value = lerp(from[i], on || s.photo.color ? 1 : 0, e); }), { ease: ease.sine });
}

function previewPhoto() {
  const r = rolls.get(active.stock.id);
  return photos.get(r.photoIds.find(id => photos.has(id))) || { id: 'demo-p133.jpg', demo: 'demo/p133.jpg' };
}
const loadImg = url => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
function cover(g, im) {
  const W = g.canvas.width, H = g.canvas.height, k = Math.max(W / im.naturalWidth, H / im.naturalHeight) || 1;
  g.drawImage(im, (W - im.naturalWidth * k) / 2, (H - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
}
async function previewSource(p) {
  const im = await loadImg(p.demo || store.photoUrls(p).thumbUrl);
  const c = new OffscreenCanvas(144, 96), g = c.getContext('2d');
  if (im) cover(g, im);
  return g.getImageData(0, 0, 144, 96);
}

async function openSimPanel() {
  if (simOpen || mode !== 'open' || lightbox.isOpen) return;
  simOpen = true;
  const cur = rollSim(active);
  simPanel.innerHTML = GROUPS.map(([g, label]) => `<section><h4>${label}</h4><div class="opts">${SIMS.filter(s => s.group === g).map(s =>
    `<button class="opt${s.id === cur.id ? ' on' : ''}" data-id="${s.id}"><canvas width="288" height="192"></canvas><span>${s.name}</span>${s.note ? `<small>${s.note}</small>` : ''}</button>`).join('')}</div></section>`).join('');
  simPanel.hidden = false;
  requestAnimationFrame(() => simPanel.classList.add('on'));
  $('#simPick').classList.add('open');
  developAll(true);
  const p = previewPhoto(), src = await previewSource(p);
  const opts = [...simPanel.querySelectorAll('.opt')];
  for (const b of opts) {
    const lut = await lutData(b.dataset.id);
    if (!simOpen) return;
    const c = new OffscreenCanvas(144, 96);
    c.getContext('2d').putImageData(new ImageData(gradePixels(src.data, lut), 144, 96), 0, 0);
    b.querySelector('canvas').getContext('2d').drawImage(c, 0, 0, 288, 192);
  }
  // then each as SpektraLab prints it, the roll's own film first
  opts.sort((a, b) => (b.dataset.id === cur.id) - (a.dataset.id === cur.id));
  for (const b of opts) {
    if (b.dataset.id === 'none') {
      const im = await loadImg(p.demo || store.photoUrls(p).thumbUrl);
      if (im && simOpen) cover(b.querySelector('canvas').getContext('2d'), im);
      continue;
    }
    printOf(p, b.dataset.id, 'p', { prio: 2 }).then(async url => {
      const im = url && await loadImg(url);
      if (im && simOpen && b.isConnected) { b.classList.add('printed'); cover(b.querySelector('canvas').getContext('2d'), im); }
    });
  }
}

function closeSimPanel() {
  if (!simOpen) return;
  simOpen = false;
  simHover = null;
  lutTarget = 0;
  simPanel.classList.remove('on');
  $('#simPick').classList.remove('open');
  setTimeout(() => { if (!simOpen) simPanel.hidden = true; }, 260);
  if (active) developAll(false);
  kick();
}

async function previewSim(id) {
  if (id === simHover) return;
  simHover = id;
  if (!id) { lutTarget = 0; kick(); return; }
  const t = await simTexture(id);
  if (simHover !== id || !active) return;
  active.film.lut.b.value = t;
  lutTarget = 1;
  kick();
}

async function chooseSim(id) {
  const c = active, roll = rolls.get(c.stock.id);
  dropPrints(printGroup(c));
  roll.sim = id;
  store.put('rolls', roll);
  const t = await simTexture(id);
  c.film.lut.a.value = t;
  c.film.lut.t.value = 0;
  lutTarget = 0;
  simHover = null;
  c.film.setStyle(simById(id));
  c.film.setSim(id);
  buildFilm();
  showSim();
  closeSimPanel();
  kick();
}

$('#simPick').addEventListener('click', e => { e.stopPropagation(); simOpen ? closeSimPanel() : openSimPanel(); });
simPanel.addEventListener('pointerover', e => { const b = e.target.closest('.opt'); if (b) previewSim(b.dataset.id); });
simPanel.addEventListener('pointerleave', () => previewSim(null));
simPanel.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('.opt'); if (b) chooseSim(b.dataset.id); });
addEventListener('pointerdown', e => { if (simOpen && !e.target.closest('#simPanel, #simPick')) closeSimPanel(); }, true);

// ---------------------------------------------------------------- lightbox
function frameRect(i) {
  if (!active) return null;
  const seg = active.film.segs.find(s => s.kind === 'frame' && s.index === i);
  if (!seg) return null;
  const pts = active.film.frameCorners(seg).map(toScreen);
  const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
  const y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
  if (x1 < 0 || x0 > innerWidth) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function centerFrame(i) {
  const fr = active.film.frames, seg = fr[clamp(i, 0, fr.length - 1)];
  if (!seg) return;
  pull.target = clamp(seg.u0 + seg.len / 2 + pull.sigCenter, pull.min, pull.max);
  pull.lastInput = clock;
  kick();
}

// the arrow keys step a whole frame, full or half
function stepFrame(d) {
  const f = active.film;
  centerFrame(f.frameAt(pull.target - pull.sigCenter - LEADER) + d);
}

const lightbox = new Lightbox({
  onShow: () => { document.body.classList.add('dark'); window.anhe?.titlebar(true); },
  onHide: () => { document.body.classList.remove('dark'); window.anhe?.titlebar(false); },
  rectFor: i => frameRect(i),
  onIndex: i => centerFrame(i),
  onColor: it => setColor(it.id, it.color),
  onDelete: it => deletePhoto(it.id),
  onClose: () => filmHover(lastPointer.x, lastPointer.y),
  onMedia: v => sound.media(v),
  onAmount: (v, save) => setAmt(v, save),
});

async function openLightbox(seg) {
  const id = active.stock.id, s = active.stock, sim = rollSim(active);
  hoverSeg = null;
  setPreview(null);
  closeSimPanel();
  centerFrame(seg.index);
  const from = frameRect(seg.index), lut = await lutData(sim.id);
  lightbox.open(framesOf(id), seg.index, { name: rolls.get(id).name, stock: `${s.brand} ${s.title} · ${KIND_LABEL[s.kind]}` }, from, {
    muted: !sound.on, lut, film: sim, amount: rollAmt(active), grain: grainOf(sim.id), halation: halationOf(sim.id),
    print: (it, prio) => printOf(photos.get(it.id), sim.id, 'l', { prio }),
  });
}

function setColor(id, color) {
  const p = photos.get(id);
  if (!p) return;
  p.color = color;
  store.put('photos', p);
  sound.develop();
  const seg = active?.film.segs.find(s => s.photo?.id === id);
  if (seg) {
    seg.photo.color = color;
    const u = seg.uniforms.uSat, a = u.value;
    tween(1.0, e => { u.value = lerp(a, color ? 1 : 0, e); }, { ease: ease.sine });
  }
}

let pendingDelete = null;
function finalizeDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timer);
  const { id } = pendingDelete;
  pendingDelete = null;
  store.del('photos', id);
  store.dropUrls(id);
  photos.delete(id);
  forgetPrints(id);
}

async function deletePhoto(id) {
  finalizeDelete();
  const roll = rolls.get(active.stock.id), at = roll.photoIds.indexOf(id);
  if (at < 0) return;
  roll.photoIds.splice(at, 1);
  await store.put('rolls', roll);
  buildFilm();
  pull.target = clamp(pull.target, pull.min, pull.max);
  refreshRoom(); syncNames();
  pendingDelete = { id, roll: roll.id, at, timer: setTimeout(finalizeDelete, 8000) };
  toast(`第 ${String(at + 1).padStart(2, '0')} 张已从胶卷剪下`, '撤销', () => {
    const pd = pendingDelete;
    if (!pd) return;
    clearTimeout(pd.timer);
    pendingDelete = null;
    const r = rolls.get(pd.roll);
    r.photoIds.splice(pd.at, 0, pd.id);
    store.put('rolls', r);
    if (lightbox.isOpen && active?.stock.id === pd.roll) {
      const p = photos.get(pd.id);
      lightbox.items.splice(pd.at, 0, frameItem(p));
      lightbox.label();
    }
    if (active?.stock.id === pd.roll) { buildFilm(); refreshRoom(); centerFrame(pd.at); }
    syncNames();
  });
}

// ---------------------------------------------------------------- loading photos
let toastTimer;
function toast(msg, action, fn, sticky) {
  const t = $('#toast');
  t.querySelector('.msg').textContent = msg;
  const b = t.querySelector('.act');
  b.textContent = action || '';
  b.onclick = () => { t.classList.remove('on'); fn?.(); };
  t.classList.add('on');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => t.classList.remove('on'), action ? 7000 : 3200);
}

async function addFiles(files, id) {
  files = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|hif)$/i.test(f.name) || store.isVideo(f));
  if (!files.length) return toast('没有找到可以装入的照片或视频');
  const roll = rolls.get(id), room = EXPOSURES - roll.photoIds.length;
  if (room <= 0) return toast(`「${roll.name}」${EXPOSURES} 张已经拍满了`);
  const take = files.slice(0, room);
  // decode two at a time (HEIC takes a second or two each), then file them in the order given
  const decoded = new Array(take.length);
  let next = 0, done = 0, ok = 0, clips = 0;
  toast(`冲洗中 1 / ${take.length}`, null, null, true);
  await Promise.all([0, 1].map(async () => {
    while (next < take.length) {
      const i = next++;
      decoded[i] = await store.ingest(take[i]).catch(e => { console.warn('ingest failed', take[i].name, e); return null; });
      toast(`冲洗中 ${Math.min(++done + 1, take.length)} / ${take.length}`, null, null, true);
    }
  }));
  for (let i = 0; i < take.length; i++) {
    const r = decoded[i];
    if (!r) continue;
    try {
      const rec = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), roll: id,
        w: r.w, h: r.h, color: false, full: r.full, thumb: r.thumb, name: take[i].name, added: Date.now(),
      };
      if (r.kind === 'video') Object.assign(rec, { kind: 'video', video: r.video, dur: r.dur });
      await store.put('photos', rec);
      photos.set(rec.id, rec);
      roll.photoIds.push(rec.id);
      ok++;
      if (rec.kind === 'video') clips++;
    } catch (e) { console.warn('save failed', take[i].name, e); }
  }
  await store.put('rolls', roll);
  syncNames();
  if (active?.stock.id === id && mode === 'open') {
    buildFilm();
    refreshRoom();
    pull.target = pull.max;
    pull.lastInput = clock;
    kick();
  } else {
    const c = canisters.find(c => c.stock.id === id);
    c.tag.classList.remove('bump'); void c.tag.offsetWidth; c.tag.classList.add('bump');
    c.lift = 0.6;
    kick();
  }
  const extra = files.length - take.length, bad = take.length - ok;
  if (!ok) return toast(take.length > 1 ? `这 ${take.length} 个文件没能读取` : '这个文件没能读取');
  // "3 张", "2 段视频", "3 张照片、2 段视频"
  const amount = !clips ? `${ok} 张` : clips === ok ? `${clips} 段视频` : `${ok - clips} 张照片、${clips} 段视频`;
  toast(extra > 0 ? `装入 ${amount} · 还有 ${extra} 个超出 ${EXPOSURES} 格，没有装入`
    : bad ? `已装入「${roll.name}」${amount} · ${bad} 个没能读取` : `已装入「${roll.name}」${amount}`);
}

const fileInput = $('#file');
let fileTarget = null;
function pickFiles(id) { fileTarget = id; fileInput.value = ''; fileInput.click(); }
fileInput.addEventListener('change', () => { if (fileTarget && fileInput.files.length) addFiles([...fileInput.files], fileTarget); });
$('#load').addEventListener('click', () => active && pickFiles(active.stock.id));

// drag & drop: onto a can on the shelf, or anywhere while a roll is open
let dragDepth = 0, dropTarget = null;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
function setDrop(on, e) {
  const d = $('#drop');
  if (!on) {
    d.classList.remove('on');
    if (dropTarget && dropTarget !== active) { dropTarget.tLift = 0; dropTarget.tag.classList.remove('drop'); }
    dropTarget = null;
    kick();
    return;
  }
  let c = active;
  if (mode === 'shelf') {
    c = canisterAt(e.clientX, e.clientY);
    if (c !== dropTarget) {
      if (dropTarget) { dropTarget.tLift = 0; dropTarget.tag.classList.remove('drop'); }
      if (c) { c.tLift = 0.5; c.tag.classList.add('drop'); }
      kick();
    }
  }
  dropTarget = c;
  d.classList.toggle('shelf', mode === 'shelf');
  d.classList.add('on');
  const card = d.querySelector('.drop-card');
  card.innerHTML = c ? `松开，装入<b>「${rolls.get(c.stock.id).name}」</b><span>${SHORT[c.stock.id]}</span>` : '拖到一卷胶卷上';
}
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; setDrop(true, e); });
addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDrop(true, e); });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; setDrop(false); } });
addEventListener('drop', e => {
  e.preventDefault();
  const target = dropTarget;
  dragDepth = 0;
  setDrop(false);
  if (!e.dataTransfer?.files.length) return;
  if (mode !== 'shelf' && mode !== 'open') return;
  if (!target) return toast('把照片拖到某一卷胶卷上，就能装进去');
  addFiles([...e.dataTransfer.files], target.stock.id);
});

// ---------------------------------------------------------------- pointer, wheel, keys
const lastPointer = { x: -1, y: -1 };
let down = null;
canvas.addEventListener('pointermove', e => {
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  par.tx = e.clientX / innerWidth - 0.5;
  par.ty = e.clientY / innerHeight - 0.5;
  if (mode === 'shelf') setHover(canisterAt(e.clientX, e.clientY));
  else if (mode === 'open') {
    if (down && Math.abs(e.clientX - down.x) > 4 && !pull.drag) {
      pull.drag = { x: down.x, p: pull.target, vx: 0, t: clock, last: e.clientX };
      canvas.className = 'grabbing';
      hoverSeg = null;
    }
    if (pull.drag) {
      const D = pull.drag, perPx = pull.visW / innerWidth;
      const now = performance.now() / 1000, dtp = Math.max(1e-3, now - (D.tw || now - 0.016));
      D.vx = lerp(D.vx, -(e.clientX - D.last) * perPx / dtp, 0.35);
      D.tw = now; D.last = e.clientX;
      pull.target = D.p + (D.x - e.clientX) * perPx;
      pull.lastInput = clock;
    } else filmHover(e.clientX, e.clientY);
  }
  kick();
});
canvas.addEventListener('pointerleave', () => { par.tx = par.ty = 0; if (mode === 'shelf') setHover(null); hoverSeg = null; kick(); });
canvas.addEventListener('pointerdown', e => {
  sound.ensure();
  if (e.button !== 0) return;
  // a click away from a name being edited only finishes the edit; it doesn't also open a roll
  if (document.activeElement?.isContentEditable) { document.activeElement.blur(); down = null; return; }
  down = { x: e.clientX, y: e.clientY };
  if (mode === 'open') canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', e => {
  const d = down;
  down = null;
  if (!d) return;
  if (pull.drag) {
    pull.target += clamp(pull.drag.vx, -40, 40) * 0.22;
    pull.drag = null;
    pull.lastInput = clock;
    filmHover(e.clientX, e.clientY);
    return;
  }
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
  if (mode === 'shelf') {
    const c = canisterAt(e.clientX, e.clientY);
    if (c) openRoll(c);
  } else if (mode === 'open') {
    filmHover(e.clientX, e.clientY);
    if (hoverSeg?.kind === 'frame') openLightbox(hoverSeg);
    else if (hoverSeg?.kind === 'add') pickFiles(active.stock.id);
    else if (pick(e.clientX, e.clientY, [active.hit]) && !pick(e.clientX, e.clientY, active.film.segs.map(s => s.mesh))) closeRoll();
  }
});
addEventListener('wheel', e => {
  if (mode !== 'open' || lightbox.isOpen) return;
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k;
  pull.target = clamp(pull.target + d * 0.011 * (pull.visW / 16), pull.min - 2.4, pull.max + 2.4);
  pull.lastInput = clock;
  kick();
}, { passive: true });

addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') { e.preventDefault(); toggleRecording(); return; }
  if (simOpen && e.key === 'Escape') { closeSimPanel(); return; }
  if (e.target.isContentEditable || e.target.closest?.('.amt')) return;
  if (lightbox.isOpen) {
    if (e.key === 'Escape') lightbox.close();
    else if (e.key === 'ArrowLeft') lightbox.go(-1);
    else if (e.key === 'ArrowRight') lightbox.go(1);
    else if (e.key === ' ' && lightbox.isVideo) { e.preventDefault(); lightbox.playPause(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); lightbox.toggle(); }
    else if (e.key === 'Delete') lightbox.remove();
    return;
  }
  if (mode === 'open') {
    if (e.key === 'Escape' || e.key === 'Backspace') closeRoll();
    else if (e.key === 'ArrowRight') stepFrame(1);
    else if (e.key === 'ArrowLeft') stepFrame(-1);
  }
});

$('#back').addEventListener('click', () => closeRoll());
bindName($('#rollName'), () => active?.stock.id);
$('#scrub').addEventListener('click', e => {
  if (mode !== 'open') return;
  const r = e.currentTarget.getBoundingClientRect();
  centerFrame(active.film.frameAt(clamp((e.clientX - r.left) / r.width, 0, 1) * pull.span));
});
const soundBtn = $('#sound');
soundBtn.classList.toggle('off', !sound.on);
soundBtn.addEventListener('click', () => { sound.ensure(); soundBtn.classList.toggle('off', !sound.toggle()); });

// screen recording: the ring in the title bar, or Ctrl+Shift+R. While it runs, the ring is hidden from
// the page (so it never shows in the video) and main.js puts a pill window with the time in its place.
const recorder = new Recorder(sound), recBtn = $('#rec');
const PILL_W = 92;
const mmss = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
async function toggleRecording() {
  if (recorder.busy) return;
  if (!recorder.on) {
    const r = recBtn.getBoundingClientRect();
    document.body.classList.add('recording');
    try {
      await recorder.start({ x: r.right - PILL_W, y: r.top, w: PILL_W, h: r.height, dark: document.body.classList.contains('dark') });
    } catch (e) {
      document.body.classList.remove('recording');
      console.warn('recording failed', e);
      toast('录屏没能开始');
    }
    return;
  }
  const r = await recorder.stop();
  document.body.classList.remove('recording');
  if (r?.file) toast(`录屏已保存 · ${mmss(r.seconds)}`, '在文件夹中显示', () => window.anhe.rec.reveal());
}
recorder.onEnded = () => { if (recorder.on) toggleRecording(); };
recBtn.addEventListener('click', toggleRecording);
window.anhe?.rec.onStopRequest(() => { if (recorder.on) toggleRecording(); });
for (const [sel, cls] of [['#back', 'reveal'], ['.roll-head', 'reveal d1'], ['.dock', 'reveal d2'], ['#scrub', 'reveal d3']]) $(sel).className += ' ' + cls;

// ---------------------------------------------------------------- data
async function loadData() {
  const [rs, ps] = await Promise.all([store.all('rolls'), store.all('photos')]);
  for (const r of rs) rolls.set(r.id, r);
  for (const p of ps) photos.set(p.id, p);
  const seeded = await store.getMeta('seeded');
  if (!seeded) {
    const manifest = await fetch('demo/manifest.json').then(r => r.json()).catch(() => []);
    const per = Math.ceil(manifest.length / STOCKS.length);
    const newRolls = [], newPhotos = [];
    STOCKS.forEach((s, i) => {
      const r = rolls.get(s.id) || { id: s.id, name: s.name, photoIds: [] };
      const share = manifest.slice(i * per, i * per + per);
      for (const [file, w, h] of share) {
        const p = { id: 'demo-' + file, roll: s.id, w, h, color: false, demo: 'demo/' + file, added: 0 };
        newPhotos.push(p); photos.set(p.id, p);
        if (!r.photoIds.includes(p.id)) r.photoIds.push(p.id);
      }
      rolls.set(s.id, r); newRolls.push(r);
    });
    await store.putMany('photos', newPhotos);
    await store.putMany('rolls', newRolls);
    await store.setMeta('seeded', 1);
  }
  for (const s of STOCKS) if (!rolls.has(s.id)) { const r = { id: s.id, name: s.name, photoIds: [] }; rolls.set(s.id, r); store.put('rolls', r); }
  // drop photos no roll refers to (for instance a deletion that was still undoable when the app closed)
  const used = new Set([...rolls.values()].flatMap(r => r.photoIds));
  for (const r of rolls.values()) r.photoIds = r.photoIds.filter(id => photos.has(id));
  for (const id of [...photos.keys()]) if (!used.has(id)) { photos.delete(id); store.del('photos', id); }
}

// ---------------------------------------------------------------- boot
function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), d = g.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

async function boot() {
  grain();
  await Promise.all([loadLabelFonts(), document.fonts.ready]);
  canisters = STOCKS.map((s, i) => {
    const c = new Canister(s, i, renderer);
    c.film = new Film(s, c.pivot, renderer);
    c.film.light.copy(SUN_DIR);
    c.tLift = 0; c.tTurn = 0;
    scene.add(c.root);
    return c;
  });
  await loadData();
  buildTags();
  syncNames();
  resize();
  Object.assign(view, shelfView());
  for (const c of canisters) { c.lift = c.tLift = 1.8; c.apply(); }
  veil.visible = true;
  veil.material.uniforms.uAlpha.value = 1;
  camera.position.copy(view.pos); camera.lookAt(view.target);
  await renderer.compileAsync(scene, camera).catch(() => {});
  step(0.001);
  render();
  document.body.classList.remove('booting');
  window.anhe?.ready?.();
  tween(1.4, e => { veil.material.uniforms.uAlpha.value = 1 - e; }, { ease: ease.sine, delay: 0.1 }).then(() => { if (mode === 'shelf') veil.visible = false; });
  await Promise.all(canisters.map(c => tween(1.0, e => { c.lift = c.tLift = 1.8 * (1 - e) ** 3; }, { delay: 0.2 + c.order * 0.07 })));
  for (const c of canisters) c.tLift = 0;
  mode = 'shelf';
  if (lastPointer.x >= 0) setHover(canisterAt(lastPointer.x, lastPointer.y));
  kick();
}

// test hooks: deterministic stepping for screenshots
window.__anhe = {
  freeze() { frozen = true; },
  thaw() { frozen = false; kick(); },
  advance(sec, fps = 60) { let t = sec; while (t > 1e-6) { const d = Math.min(1 / fps, t); step(d); t -= d; } render(); },
  open: i => openRoll(canisters[i]),
  close: () => closeRoll(),
  frame: i => { const s = active?.film.segs.find(x => x.kind === 'frame' && x.index === i); if (s) openLightbox(s); },
  hover: i => setHover(canisters[i] || null),
  add: (i, files) => addFiles(files, canisters[i].stock.id),
  rect: i => frameRect(i),
  sim: id => id ? chooseSim(id) : rollSim(active).id,
  simPanel: on => on ? openSimPanel() : closeSimPanel(),
  simHover: id => previewSim(id),
  amt: v => { if (v != null) setAmt(v, true); return active?.film.lut.amt.value; },
  prints: () => active ? { sim: active.film.sim, n: active.film.prints.size, of: active.film.frameCount, on: active.film.segs.filter(s => s.uniforms.uPrintOn?.value > 0.99).length } : null,
  preview: () => ({ seg: preview.seg?.index ?? -1, playing: !!preview.tex, effects: !!preview.printTex, time: preview.video?.currentTime || 0 }),
  pull: d => { pull.target = clamp(pull.target + d, pull.min, pull.max); pull.lastInput = clock; kick(); },
  state: () => ({ mode, p: active?.film.p, pull: { ...pull, drag: null }, tweens: tweens.size }),
  tune(o) {
    if (o.sun != null) sun.intensity = o.sun;
    if (o.sunColor) sun.color.set(o.sunColor);
    if (o.sky != null) sky.intensity = o.sky;
    if (o.env != null) scene.environmentIntensity = o.env;
    if (o.exposure != null) renderer.toneMappingExposure = o.exposure;
    if (o.wall) wall.material.color.set(o.wall);
    if (o.tone) renderer.toneMapping = THREE[o.tone];
    scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.needsUpdate = true; }); });
    kick();
  },
  gobo: () => sun.map.image.toDataURL(),
  labels() {
    const k = 0.25, c = document.createElement('canvas');
    c.width = 2048 * k * 3; c.height = 1040 * k * 4;
    const g = c.getContext('2d');
    canisters.forEach((can, i) => g.drawImage(can.labelMaterial.map.image, (i % 3) * 2048 * k, Math.floor(i / 3) * 1040 * k, 2048 * k, 1040 * k));
    return c.toDataURL('image/png');
  },
  lightbox,
};

boot();
