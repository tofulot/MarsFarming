// AI-assisted (Claude Code: parachute-dropped supply crate model and its drop-in animation)
// Model units: base at y = 0, about 0.9 units across including the chute; geometry + vertex colours only.
import * as THREE from 'three';
import {
  animateDustPuff, createDustPuff, groundShadow, moundGeometry, noise, paint, palette, part, rod, shared,
  standard, statusLamp, vertexMaterial,
} from './shared.js';

const W = 0.5, H = 0.34, D = 0.38;
const FALL_MS = 760;
const SETTLE_MS = 520;
const PUFF_MS = 900;
const DROP_HEIGHT = 2.6;
const BLINK_MS = 1200;

const CHUTE = new THREE.Color(palette.chute);
const CHUTE_LIGHT = new THREE.Color(palette.chuteLight);

/** Striped canopy (alternating gores). Crumpled: squashed, folded and lumpy, lying on the ground. */
function canopyGeometry(crumpled) {
  return shared(`crate-canopy-${crumpled ? 'c' : 'o'}`, () => {
    const gores = 10;
    const geometry = new THREE.SphereGeometry(1, gores * 2, 5, 0, Math.PI * 2, 0, Math.PI * (crumpled ? 0.5 : 0.42));
    const position = geometry.getAttribute('position');
    if (crumpled) {
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const angle = Math.atan2(z, x);
        const fold = 0.7 + 0.3 * Math.abs(Math.sin(angle * 3.5)) + 0.18 * noise(Math.round(angle * 9), 2);
        position.setXYZ(i, x * fold * (1 + 0.35 * Math.max(0, x)), y * (0.15 + 0.35 * noise(Math.round(angle * 7), Math.round(y * 6))), z * fold * 0.75);
      }
    }
    paint(geometry, (color, x, y, z) => {
      const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * gores + 0.001) % 2;
      color.copy(gore ? CHUTE : CHUTE_LIGHT);
      if (crumpled) color.multiplyScalar(0.8 + 0.2 * Math.min(1, y * 4));
    });
    geometry.computeVertexNormals();
    return geometry;
  });
}

function buildBox() {
  const box = new THREE.Group();
  box.name = 'crate-box';
  const body = standard(0xd8cfbd, { roughness: 0.75 });
  const rib = standard(0x9d8f7b, { roughness: 0.7 });
  const dark = standard(palette.dark);
  part(box, shared('crate-body', () => new THREE.BoxGeometry(W, H, D)), body, [0, H / 2, 0]);
  // Corrugation ribs running around the box, and dark corner posts.
  const ribGeometry = shared('crate-rib', () => new THREE.BoxGeometry(W + 0.025, 0.03, D + 0.025));
  for (const y of [0.04, H - 0.04]) part(box, ribGeometry, rib, [0, y, 0]);
  const post = shared('crate-post', () => new THREE.BoxGeometry(0.045, H + 0.01, 0.045));
  for (const x of [-1, 1]) for (const z of [-1, 1]) part(box, post, dark, [x * W / 2, H / 2, z * D / 2]);
  // Two cargo straps over the lid and down the sides.
  const strap = shared('crate-strap', () => new THREE.BoxGeometry(0.055, H + 0.02, D + 0.03));
  for (const x of [-0.13, 0.13]) part(box, strap, standard(palette.strap, { roughness: 0.7 }), [x, H / 2 + 0.005, 0]);
  // Stencilled label plate on the front face.
  part(box, shared('crate-label', () => new THREE.BoxGeometry(0.13, 0.1, 0.01)), dark, [0, H * 0.52, D / 2 + 0.008]);
  part(box, shared('crate-label-stripe', () => new THREE.BoxGeometry(0.13, 0.025, 0.012)), standard(palette.trim),
    [0, H * 0.52, D / 2 + 0.01]);
  // Beacon on the rear corner of the lid.
  part(box, shared('crate-beacon-base', () => new THREE.CylinderGeometry(0.02, 0.035, 0.12, 6)), dark,
    [-W / 2 + 0.07, H + 0.06, -D / 2 + 0.07]);
  const lamp = statusLamp(box, [-W / 2 + 0.07, H + 0.14, -D / 2 + 0.07], 0.045);
  lamp.core.material.color.set(palette.red);
  lamp.halo.material.color.set(palette.amber);
  box.userData.lamp = lamp;
  return box;
}

/** Supply crate: THREE.Group; drive it with setSupplyCrateState (drop-in on first `drop`, beacon blink). */
export function createSupplyCrate() {
  const group = new THREE.Group();
  group.name = 'supplyCrate';
  const shadow = groundShadow(group, 0.42, 0.3);
  // Dust kicked into a low ring around the impact.
  const skirt = part(group, moundGeometry('crate-skirt', 7, 0.36, 0.05, 0.28), vertexMaterial(0.95), [0, 0, 0.02]);
  const box = buildBox();
  box.rotation.y = -0.22;
  group.add(box);

  // Crumpled chute beside the crate, cords back to the lid.
  const crumpled = new THREE.Group();
  crumpled.position.set(-0.44, 0, 0.08);
  group.add(crumpled);
  part(crumpled, canopyGeometry(true), vertexMaterial(0.9, THREE.DoubleSide), [0, 0, 0], [0, 0.35, 0], [0.3, 0.32, 0.26]);
  const cord = standard(0xe9dcc4, { roughness: 0.8 });
  for (const [x, z] of [[0.12, -0.1], [0.18, 0.04], [0.14, 0.14]]) rod(crumpled, [x, 0.03, z], [0.26, 0.2, -0.02 + z * 0.3], 0.006, cord, 3);

  // Open chute, only seen while falling.
  const open = new THREE.Group();
  open.position.y = H + 0.7;
  part(open, canopyGeometry(false), vertexMaterial(0.85, THREE.DoubleSide), [0, 0, 0], [0, 0, 0], [0.5, 0.36, 0.5]);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    rod(open, [Math.cos(angle) * 0.4, 0.1, Math.sin(angle) * 0.4], [Math.cos(angle) * 0.12, -0.68, Math.sin(angle) * 0.1], 0.006, cord, 3);
  }
  open.visible = false;
  box.add(open);

  const puff = createDustPuff(group, 8, 0.48);
  Object.assign(group.userData, { box, open, crumpled, shadow, skirt, puff, dropAt: null });
  setSupplyCrateState(group, {}, 0);
  return group;
}

/**
 * state: { drop } — `drop: true` starts the drop-in the first time it is seen (later calls never restart it).
 * Call every frame with the current time in ms; no allocations. Returns true while the drop-in is playing.
 */
export function setSupplyCrateState(group, state = {}, time = state.time ?? 0) {
  const data = group.userData;
  if (state.drop && data.dropAt === null) data.dropAt = time;
  const elapsed = data.dropAt === null ? Infinity : time - data.dropAt;
  const { box, open, crumpled, shadow, skirt, puff } = data;

  let height = 0, squash = 0, chuteScale = 1;
  if (elapsed < FALL_MS) {
    const t = elapsed / FALL_MS;
    // Under canopy: near-constant descent, a touch faster at the end.
    height = DROP_HEIGHT * (1 - (t * 0.75 + t * t * 0.25));
    box.rotation.z = Math.sin(elapsed / 120) * 0.08 * (1 - t);
    chuteScale = 0;
  } else if (elapsed < FALL_MS + SETTLE_MS) {
    const t = (elapsed - FALL_MS) / SETTLE_MS;
    // Two shrinking hops, with a squash on each touchdown.
    height = t < 0.6 ? Math.sin((t / 0.6) * Math.PI) * 0.13 : Math.sin(((t - 0.6) / 0.4) * Math.PI) * 0.035;
    squash = Math.max(0, 1 - t * 8) * 0.22 + (t > 0.58 && t < 0.66 ? 0.08 : 0);
    box.rotation.z = 0;
    chuteScale = THREE.MathUtils.smoothstep(t, 0.1, 0.9);
  } else {
    box.rotation.z = 0;
  }
  const falling = elapsed < FALL_MS;
  box.position.y = height;
  box.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
  open.visible = falling;
  crumpled.visible = chuteScale > 0.01;
  crumpled.scale.setScalar(Math.max(0.01, chuteScale));
  skirt.visible = !falling;
  const shadowScale = 1 / (1 + height * 0.9);
  shadow.scale.set(0.42 * shadowScale, 1, 0.3 * shadowScale);
  animateDustPuff(puff, falling ? 0 : (elapsed - FALL_MS) / PUFF_MS);

  // Beacon: two quick flashes per cycle.
  const phase = time % BLINK_MS;
  const lit = phase < 110 || (phase > 240 && phase < 350);
  const { lamp } = box.userData;
  lamp.core.material.color.set(lit ? palette.amber : palette.red).multiplyScalar(lit ? 1 : 0.55);
  lamp.halo.material.opacity = lit ? 0.85 : 0;
  return elapsed < FALL_MS + Math.max(SETTLE_MS, PUFF_MS);
}
