import * as THREE from '../vendor/three.module.js';
import { paintLabel } from './stocks.js';

// Canister geometry in scene units (1 unit = 1 cm). Origin at the centre of the bottom cap; the felt lip
// sits on +x and the film leaves it heading right-and-back, like the reference can.
export const R = 1.25;
export const BODY_Y0 = 0.25, BODY_Y1 = 4.25;
export const FILM_YC = 2.25;
export const MOUTH = new THREE.Vector2(1.36, -0.34);    // (x, z) of the slit
export const EXIT_HEADING = 0.6;                        // radians, turning from +x towards -z
export const TOP_Y = 5.2;

let shared;
function sharedParts() {
  if (shared) return shared;
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x0b0b0c, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide,
  });
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0x121213, metalness: 0, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.35,
  });
  const plasticInner = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8, side: THREE.BackSide });
  const notch = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.55 });
  const felt = new THREE.MeshPhysicalMaterial({
    color: 0x060606, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0x5a5550), sheenRoughness: 0.75,
  });

  // pressed end caps with a rolled rim
  const bottomProfile = [
    [0.33, 0.07], [0.95, 0.07], [1.03, 0.04], [1.11, 0.0], [1.24, 0.0], [1.3, 0.018], [1.325, 0.06],
    [1.332, 0.13], [1.318, 0.195], [1.285, 0.235], [1.25, 0.252],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bottomCap = new THREE.LatheGeometry(bottomProfile, 128);
  const topCap = new THREE.LatheGeometry(bottomProfile.map(v => new THREE.Vector2(v.x < 0.4 ? 0.47 : v.x, 4.5 - v.y)).reverse(), 128);

  // spool post through the top cap, hollow with a keyed rim
  const post = new THREE.CylinderGeometry(0.42, 0.42, 0.86, 64, 1, true);
  post.translate(0, 4.34 + 0.43, 0);
  const rim = new THREE.RingGeometry(0.3, 0.42, 64);
  rim.rotateX(-Math.PI / 2); rim.translate(0, TOP_Y, 0);
  const bore = new THREE.CylinderGeometry(0.3, 0.3, 0.42, 48, 1, true);
  bore.translate(0, TOP_Y - 0.21, 0);
  const boreFloor = new THREE.CircleGeometry(0.3, 48);
  boreFloor.rotateX(-Math.PI / 2); boreFloor.translate(0, TOP_Y - 0.4, 0);
  const keyBar = new THREE.BoxGeometry(0.58, 0.12, 0.09);
  keyBar.translate(0, TOP_Y - 0.34, 0);
  const rimNotch = new THREE.BoxGeometry(0.1, 0.035, 0.13);
  const hub = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 48);
  hub.translate(0, 0.04, 0);

  // felt-lined light trap: the shell folds out into a spout around the slit
  const nOut = new THREE.Vector2(Math.sin(EXIT_HEADING), Math.cos(EXIT_HEADING)); // outward normal of the film path (x, z)
  const dir = new THREE.Vector2(Math.cos(EXIT_HEADING), -Math.sin(EXIT_HEADING));
  const P = (x, z) => new THREE.Vector2(x, -z);
  const outer = MOUTH.clone().addScaledVector(nOut, 0.1).addScaledVector(dir, 0.04);
  const inner = MOUTH.clone().addScaledVector(nOut, -0.1).addScaledVector(dir, 0.02);
  const shape = new THREE.Shape();
  shape.moveTo(...P(R * Math.cos(0.26) * 0.96, R * Math.sin(0.26) * 0.96).toArray());
  shape.bezierCurveTo(...P(1.31, 0.22).toArray(), ...P(1.45, 0.02).toArray(), ...P(outer.x, outer.y).toArray());
  shape.quadraticCurveTo(...P(outer.x - 0.02, outer.y - 0.1).toArray(), ...P(MOUTH.x + 0.02, MOUTH.y - 0.02).toArray());
  shape.quadraticCurveTo(...P(inner.x + 0.04, inner.y - 0.02).toArray(), ...P(inner.x, inner.y).toArray());
  shape.bezierCurveTo(...P(1.2, -0.55).toArray(), ...P(1.12, -0.56).toArray(), ...P(R * Math.cos(-0.46) * 0.96, R * Math.sin(-0.46) * 0.96).toArray());
  shape.closePath();
  const lip = new THREE.ExtrudeGeometry(shape, {
    depth: 4.02, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24,
  });
  lip.rotateX(-Math.PI / 2);
  lip.translate(0, 0.24, 0);
  const feltGeo = new THREE.BoxGeometry(0.24, 3.86, 0.16);
  feltGeo.rotateY(EXIT_HEADING);
  feltGeo.translate(MOUTH.x - dir.x * 0.1, FILM_YC, MOUTH.y - dir.y * 0.1);

  const hit = new THREE.CylinderGeometry(1.75, 1.75, 5.8, 16);
  hit.translate(0.2, 2.7, 0);

  shared = { lacquer, plastic, plasticInner, notch, felt, bottomCap, topCap, post, rim, bore, boreFloor, keyBar, rimNotch, hub, lip, feltGeo, hit };
  return shared;
}

let blobTex;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)');
  grd.addColorStop(0.42, 'rgba(0,0,0,0.5)');
  grd.addColorStop(0.62, 'rgba(0,0,0,0.16)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

export class Canister {
  constructor(stock, index, renderer) {
    const s = sharedParts();
    this.stock = stock;
    this.index = index;

    this.root = new THREE.Group();          // sits on the shelf / stage
    this.pivot = new THREE.Group();         // lift, tilt and turn
    this.root.add(this.pivot);

    const art = paintLabel(stock, index + 1);
    const map = new THREE.CanvasTexture(art.color);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const roughnessMap = new THREE.CanvasTexture(art.rough);
    this.labelMaterial = new THREE.MeshPhysicalMaterial({
      map, roughnessMap, roughness: 1, metalness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.12,
    });
    const labelGeo = new THREE.CylinderGeometry(R, R, BODY_Y1 - BODY_Y0, 160, 1, true, Math.PI / 2, Math.PI * 2);
    labelGeo.translate(0, (BODY_Y0 + BODY_Y1) / 2, 0);

    const meshes = [
      new THREE.Mesh(labelGeo, this.labelMaterial),
      new THREE.Mesh(s.bottomCap, s.lacquer),
      new THREE.Mesh(s.topCap, s.lacquer),
      new THREE.Mesh(s.lip, s.lacquer),
      new THREE.Mesh(s.feltGeo, s.felt),
      new THREE.Mesh(s.hub, s.plastic),
    ];
    for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; this.pivot.add(m); }

    this.spool = new THREE.Group();
    for (const [g, mat] of [[s.post, s.plastic], [s.rim, s.plastic], [s.bore, s.plasticInner], [s.boreFloor, s.plasticInner], [s.keyBar, s.plastic]]) {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      this.spool.add(m);
    }
    for (const a of [0, Math.PI]) {
      const n = new THREE.Mesh(s.rimNotch, s.notch);
      n.position.set(Math.cos(a) * 0.36, TOP_Y + 0.005, Math.sin(a) * 0.36);
      n.rotation.y = -a;
      this.spool.add(n);
    }
    this.pivot.add(this.spool);

    this.hit = new THREE.Mesh(s.hit, new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.userData.canister = this;
    this.root.add(this.hit);

    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({
        map: blobTexture(), transparent: false, depthWrite: false, color: 0xffffff,
        blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        opacity: 0.8,
      }),
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.set(0.1, 0.004, 0);
    this.blob.renderOrder = 0.8;
    this.root.add(this.blob);

    this.meshes = [...meshes, ...this.spool.children];
    this.lift = 0; this.tilt = 0; this.turn = 0; this.spin = 0;
    this.grounded = 1;   // fades the contact shadow while the can is carried through the air
  }

  setStage(on) {
    for (const m of this.meshes) m.renderOrder = on ? 10 : 0;
    this.blob.renderOrder = on ? 10.5 : 0.8;
  }

  apply() {
    this.pivot.position.y = this.lift;
    this.pivot.rotation.set(0, this.turn, this.tilt, 'YXZ');
    this.spool.rotation.y = this.spin;
    const k = Math.max(0, 1 - this.lift / 2.2);
    this.blob.scale.setScalar(1 + this.lift * 0.35);
    this.blob.material.opacity = 0.8 * k * k * this.grounded;
  }

  dispose() {
    this.labelMaterial.map.dispose();
    this.labelMaterial.roughnessMap.dispose();
    this.labelMaterial.dispose();
  }
}
