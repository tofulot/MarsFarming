// AI-assisted (Claude Code: shared parts for the three.js building models)
// Geometry + vertex colours only (no textures). Static geometries and materials are cached per module and
// flagged `userData.shared` so disposing one model never frees parts another model is still using.
import * as THREE from 'three';

/** Building palette, matching src/rendering/buildingSprites.js so 3D and 2D buildings read as one set. */
export const palette = Object.freeze({
  shell: 0xe4d5ba, shade: 0xbcab8f, trim: 0x5fb3a6, dark: 0x3d322c, darker: 0x2a211d,
  regolith: 0x8d5c40, regolithLit: 0xb07652, scorch: 0x23140f,
  // Lit 3D dust: darker than the 2D regolith so it sits on the terrain once the layer's lights brighten it.
  dust: 0x5c382b, dustLit: 0x7a4a36,
  green: 0x86ef8c, amber: 0xffb05a, red: 0xe0573f, dead: 0x3a302b,
  strap: 0xd9772f, chute: 0xe36a35, chuteLight: 0xf1e6d2,
});

const cache = new Map();
/** Build once, then reuse: geometries and static materials shared by every instance. */
export function shared(key, make) {
  let value = cache.get(key);
  if (!value) {
    value = make();
    value.userData.shared = true;
    cache.set(key, value);
  }
  return value;
}

export function standard(color, options = {}) {
  return shared(`std-${color.toString(16)}-${options.roughness ?? 0.85}-${options.side ?? 0}-${options.metalness ?? 0}`,
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...options }));
}
export function vertexMaterial(roughness = 0.82, side = THREE.FrontSide) {
  return shared(`vertex-${roughness}-${side}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness, side }));
}

export function part(group, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.scale.set(...scale);
  group.add(item);
  return item;
}

const UP = new THREE.Vector3(0, 1, 0);
/** A cylinder from point a to point b (model units). */
export function rod(group, a, b, radius, material, sides = 5) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const geometry = shared(`rod-${radius}-${sides}`, () => new THREE.CylinderGeometry(radius, radius, 1, sides, 1, true));
  const item = new THREE.Mesh(geometry, material);
  item.scale.set(1, length, 1);
  item.position.copy(start).add(end).multiplyScalar(0.5);
  item.quaternion.setFromUnitVectors(UP, end.sub(start).normalize());
  group.add(item);
  return item;
}

/** Deterministic pseudo-noise so hand-placed irregularity is identical every run. */
export function noise(x, y = 0, z = 0) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/** Write per-vertex colours from a function of the vertex position. */
export function paint(geometry, colorAt) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    colorAt(color, position.getX(i), position.getY(i), position.getZ(i), i);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Flattened, lumpy regolith mound (y >= 0 half of a squashed sphere). */
export function moundGeometry(key, seed, width, height, depth) {
  return shared(`mound-${key}`, () => {
    const geometry = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const lump = 0.82 + 0.3 * noise(Math.round(x * 50) + seed, Math.round(z * 50));
      position.setXYZ(i, x * width * (y < 0.05 ? 1 : lump), y * height * lump, z * depth * (y < 0.05 ? 1 : lump));
    }
    const low = new THREE.Color(palette.dust);
    const high = new THREE.Color(palette.dustLit);
    paint(geometry, (color, x, y) => color.copy(low).lerp(high, Math.min(1, y / height) * 0.8));
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** Soft ground shadow, like the 2D sprites' shadow ellipse. */
export function groundShadow(group, width, depth, opacity = 0.3) {
  const geometry = shared('shadow-disc', () => new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2));
  const material = shared(`shadow-${opacity}`, () => new THREE.MeshBasicMaterial({
    color: 0x1c120e, transparent: true, opacity, depthWrite: false }));
  const item = part(group, geometry, material, [0, 0.004, 0], [0, 0, 0], [width, 1, depth]);
  item.renderOrder = -1;
  return item;
}

/** A status lamp: unlit core plus a camera-facing glow disc. Materials are per instance (they animate). */
export function statusLamp(group, position, radius = 0.05) {
  const core = part(group, shared('lamp-core', () => new THREE.SphereGeometry(1, 6, 4)),
    new THREE.MeshBasicMaterial({ color: palette.dead }), position, [0, 0, 0], [radius, radius, radius]);
  const halo = part(group, shared('lamp-halo', () => new THREE.CircleGeometry(1, 16)),
    new THREE.MeshBasicMaterial({ color: palette.green, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending }),
    [position[0], position[1], position[2] + radius * 0.6], [-0.65, 0, 0], [radius * 2.1, radius * 2.1, 1]);
  halo.renderOrder = 2;
  return { core, halo };
}

/** Puff of dust blobs used for landings and the repair pop. Hidden until animated. */
export function createDustPuff(group, count = 7, spread = 0.42) {
  const puff = new THREE.Group();
  puff.name = 'dust-puff';
  const material = new THREE.MeshStandardMaterial({ color: 0xd8b48f, roughness: 1, transparent: true, opacity: 0,
    depthWrite: false });
  const geometry = shared('dust-blob', () => new THREE.IcosahedronGeometry(1, 0));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const blob = part(puff, geometry, material);
    blob.userData.dir = [Math.cos(angle) * spread * (0.8 + noise(i) * 0.4), Math.sin(angle) * spread * 0.7];
    blob.userData.size = 0.09 + noise(i, 3) * 0.06;
  }
  puff.visible = false;
  group.add(puff);
  return puff;
}

/** t in [0, 1]: blobs drift outward and up, grow, and fade. */
export function animateDustPuff(puff, t) {
  if (t <= 0 || t >= 1) { puff.visible = false; return; }
  puff.visible = true;
  const ease = 1 - (1 - t) ** 3;
  for (const blob of puff.children) {
    const [dx, dz] = blob.userData.dir;
    const size = blob.userData.size * (0.6 + ease * 1.3);
    blob.position.set(dx * ease, 0.04 + ease * 0.12, dz * ease);
    blob.scale.set(size, size * 0.7, size);
  }
  puff.children[0].material.opacity = 0.75 * (1 - t) ** 1.5;
}

export function countTriangles(object) {
  let total = 0;
  object.traverse((child) => {
    const geometry = child.geometry;
    if (!geometry) return;
    total += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  });
  return total;
}

export function disposeModel(model) {
  model.traverse((object) => {
    if (object.geometry && !object.geometry.userData.shared) object.geometry.dispose();
    if (object.material && !object.material.userData.shared) object.material.dispose();
  });
}
