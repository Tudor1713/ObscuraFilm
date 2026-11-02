// The lightbox picture, drawn with WebGL2: a photo or the current frame of a video in the roll's film, with
// the develop done per pixel: black and white outside a circle, the film inside it (or the other way round),
// the circle growing out from where you touched. The film is SpektraLab's print of the photo once the
// darkroom has made it; until then, and for a playing video, it is the film's LUT with the film's grain
// (measured from SpektraLab) laid on, a new grain every video frame. `amount` is how strongly the film is
// laid over the picture.
import { LUT_N } from './sims.js';

const N = LUT_N.toFixed(1);
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler3D uLut;
uniform sampler2D uPrint;
uniform sampler2D uNoise;
uniform vec2 uSize;
uniform vec2 uC;
uniform float uR, uFeather, uFrom, uTo, uPrintOn, uAmt, uMono;
uniform vec3 uGrain;
uniform vec2 uGrainShape, uSeed;
uniform vec2 uSourceSize, uHaloRadii;
uniform vec3 uHaloNear, uHaloFar;
uniform float uHaloHeadroom, uHaloThreshold, uHaloGamma;
in vec2 vUv;
out vec4 o;
vec3 decode(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 encode(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
vec3 exposure(vec2 uv, float lod) {
  vec3 e = decode(textureLod(uSrc, uv, lod).rgb);
  float y = dot(e, vec3(.2126, .7152, .0722));
  return e * exp2(uHaloHeadroom * 4.0 * pow(clamp((y-uHaloThreshold)/(1.0-uHaloThreshold), 0.0, 1.0), uHaloGamma));
}
// Two broad, mip-filtered kernels scatter exposure before the film LUT. This is a real-time
// approximation; still photographs are replaced by the engine's actual print below.
vec3 scatter(float radius) {
  float px = max(uSourceSize.x, uSourceSize.y) * radius;
  vec2 d = vec2(px) / uSourceSize;
  float lod = max(0.0, log2(max(1.0, px * .65)));
  vec3 b = exposure(vUv, lod) * 4.0;
  b += 2.0 * (exposure(vUv+vec2(d.x,0),lod)+exposure(vUv-vec2(d.x,0),lod)+exposure(vUv+vec2(0,d.y),lod)+exposure(vUv-vec2(0,d.y),lod));
  b += exposure(vUv+d,lod)+exposure(vUv-d,lod)+exposure(vUv+vec2(d.x,-d.y),lod)+exposure(vUv+vec2(-d.x,d.y),lod);
  return b / 16.0;
}
void main() {
  vec3 s = texture(uSrc, vUv).rgb;
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  vec3 mono = vec3(clamp((l - 0.5) * 1.04 + 0.5, 0.0, 1.0));      // the strip's grayscale(1) contrast(1.04)
  vec3 graded = s;
  if (uPrintOn < 1.0 && any(greaterThan(uHaloNear+uHaloFar,vec3(0.0)))) {
    vec3 e = decode(s) * (vec3(1.0)-uHaloNear-uHaloFar);
    e += uHaloNear * scatter(uHaloRadii.x) + uHaloFar * scatter(uHaloRadii.y);
    graded = encode(e);
  }
  vec3 film = texture(uLut, clamp(graded, 0.0, 1.0) * (${N} - 1.0) / ${N} + 0.5 / ${N}).rgb;
  // grain: unit gaussian noise per pixel, three layers partly shared (one for black and white film),
  // scaled by how grainy the film is at this output level
  vec4 n = (texture(uNoise, (gl_FragCoord.xy + uSeed) / 256.0) - 0.5) * 8.0;
  vec3 g = uMono > 0.5 ? vec3(n.a) : n.rgb * 0.866 + n.a * 0.5;
  vec3 d = (film - uGrainShape.x) / uGrainShape.y;
  film = clamp(film + g * uGrain * exp(-d * d), 0.0, 1.0);
  film = mix(film, texture(uPrint, vUv).rgb, uPrintOn);
  film = mix(s, film, uAmt);
  float m = 1.0 - smoothstep(uR - uFeather, uR, distance(vUv * uSize, uC));
  o = vec4(mix(mono, film, mix(uFrom, uTo, m)), 1.0);
}`;

// 256 x 256 of independent unit gaussians, four to a texel, stored as 0.5 + n / 8
function noise() {
  const d = new Uint8Array(256 * 256 * 4);
  let seed = 0x2545f491;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) + 0.5) / 4294967296;
  for (let i = 0; i < d.length; i += 2) {
    const r = Math.sqrt(-2 * Math.log(rnd())), t = 2 * Math.PI * rnd();
    d[i] = Math.max(0, Math.min(255, Math.round((0.5 + r * Math.cos(t) / 8) * 255)));
    d[i + 1] = Math.max(0, Math.min(255, Math.round((0.5 + r * Math.sin(t) / 8) * 255)));
  }
  return d;
}

export class Grader {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(['uSrc', 'uLut', 'uPrint', 'uNoise', 'uSize', 'uC', 'uR', 'uFeather', 'uFrom', 'uTo', 'uPrintOn', 'uAmt', 'uMono', 'uGrain', 'uGrainShape', 'uSeed', 'uSourceSize', 'uHaloRadii', 'uHaloNear', 'uHaloFar', 'uHaloHeadroom', 'uHaloThreshold', 'uHaloGamma']
      .map(n => [n, gl.getUniformLocation(p, n)]));
    gl.uniform1i(this.u.uSrc, 0);
    gl.uniform1i(this.u.uLut, 1);
    gl.uniform1i(this.u.uPrint, 2);
    gl.uniform1i(this.u.uNoise, 3);
    const tex2d = (unit, filter, wrap) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter === gl.LINEAR ? gl.LINEAR_MIPMAP_LINEAR : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    };
    this.src = tex2d(0, gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.print = tex2d(2, gl.LINEAR, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.noise = tex2d(3, gl.NEAREST, gl.REPEAT);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise());
    this.lut = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_3D, k, v);
    // develop state: `from` outside the circle, `to` inside it (0 = black and white, 1 = the film's colour)
    this.dev = { from: 0, to: 0, x: 0, y: 0, r: 0 };
    this.el = null;
    this.printOn = 0;     // how far SpektraLab's print has faded in over the LUT
    this.amount = 1;
    this.grain = null;
    this.halation = null;
    this.seed = [0, 0];
  }

  setLut(data) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, LUT_N, LUT_N, LUT_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  // { amp: [r, g, b], mu, w, mono } from sims.js, or null for none
  setGrain(g) { this.grain = g; }

  setHalation(h) { this.halation = h; }

  // the print of the photo now showing, or null while there is none
  setPrint(im) {
    this.printOn = 0;
    if (!im) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.print);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  // a decoded <img> or a playing <video>; a video is re-read on every draw
  setSource(el) {
    this.el = el;
    this.seed = [Math.random() * 256, Math.random() * 256];
    this.upload();
  }

  upload() {
    const gl = this.gl, el = this.el;
    if (!el || (el.tagName === 'VIDEO' && el.readyState < 2)) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.generateMipmap(gl.TEXTURE_2D);
    return true;
  }

  size(w, h) {
    const c = this.canvas;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  draw() {
    const gl = this.gl, c = this.canvas, d = this.dev, g = this.grain, h = this.halation;
    if (this.el?.tagName === 'VIDEO' && this.upload()) this.seed = [Math.random() * 256, Math.random() * 256];
    gl.viewport(0, 0, c.width, c.height);
    gl.uniform2f(this.u.uSize, c.width, c.height);
    gl.uniform2f(this.u.uC, d.x, d.y);
    gl.uniform1f(this.u.uR, d.r);
    gl.uniform1f(this.u.uFeather, 110 * (c.width / Math.max(1, c.clientWidth || c.width)));
    gl.uniform1f(this.u.uFrom, d.from);
    gl.uniform1f(this.u.uTo, d.to);
    gl.uniform1f(this.u.uPrintOn, this.printOn);
    gl.uniform1f(this.u.uAmt, this.amount);
    gl.uniform3fv(this.u.uGrain, g ? g.amp : [0, 0, 0]);
    gl.uniform2f(this.u.uGrainShape, g ? g.mu : 0.5, g ? g.w : 1);
    gl.uniform1f(this.u.uMono, g?.mono ? 1 : 0);
    gl.uniform2f(this.u.uSeed, this.seed[0], this.seed[1]);
    gl.uniform2f(this.u.uSourceSize, this.el?.videoWidth || this.el?.naturalWidth || this.el?.width || 1, this.el?.videoHeight || this.el?.naturalHeight || this.el?.height || 1);
    gl.uniform3fv(this.u.uHaloNear, h?.near || [0,0,0]);
    gl.uniform3fv(this.u.uHaloFar, h?.far || [0,0,0]);
    gl.uniform2fv(this.u.uHaloRadii, h?.radii || [0,0]);
    gl.uniform1f(this.u.uHaloHeadroom, h?.headroom ? 1 : 0);
    gl.uniform1f(this.u.uHaloThreshold, h?.threshold ?? .5);
    gl.uniform1f(this.u.uHaloGamma, h?.gamma ?? 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
