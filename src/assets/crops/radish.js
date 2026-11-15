import * as THREE from 'three';
import { plant, mesh } from './primitives.js';

const WHITE = new THREE.Color(0xf1e4ca);
const BLUSH = new THREE.Color(0xe94d68);
const RED = new THREE.Color(0xb9234b);

function createRootGeometry() {
  // A rounded shoulder tapering into the radish's characteristic white root.
  const profile = [
    [0.008, 0.015], [0.035, 0.06], [0.075, 0.11], [0.14, 0.16],
    [0.205, 0.23], [0.245, 0.31], [0.248, 0.38], [0.218, 0.45],
    [0.158, 0.505], [0.085, 0.525], [0.025, 0.51], [0, 0.49]
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  const geometry = new THREE.LatheGeometry(profile, 16);
  const colors = [];
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const color = y < 0.12
      ? WHITE.clone().lerp(BLUSH, THREE.MathUtils.smoothstep(y, 0.035, 0.12))
      : BLUSH.clone().lerp(RED, THREE.MathUtils.smoothstep(y, 0.25, 0.5) * 0.42);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createLeafGeometry(length, width, lobes = 4) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= lobes * 2; i++) {
    const t = i / (lobes * 2);
    const center = length * t;
    const taper = Math.sin(Math.PI * (0.12 + t * 0.82));
    const lobe = i % 2 === 0 ? 0.68 : 1;
    const halfWidth = width * taper * lobe;
    shape.lineTo(halfWidth, center);
  }
  shape.lineTo(0, length * 1.08);
  for (let i = lobes * 2; i >= 0; i--) {
    const t = i / (lobes * 2);
    const center = length * t;
    const taper = Math.sin(Math.PI * (0.12 + t * 0.82));
    const lobe = i % 2 === 0 ? 0.68 : 1;
    shape.lineTo(-width * taper * lobe, center);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

function addVein(group, angle, length, color) {
  const direction = new THREE.Vector3(Math.sin(angle), 0.78, Math.cos(angle)).normalize();
  const start = new THREE.Vector3(Math.sin(angle) * 0.035, 0.47, Math.cos(angle) * 0.035);
  const end = start.clone().addScaledVector(direction, length * 0.88);
  const vein = mesh(group, new THREE.CylinderGeometry(0.006, 0.012, start.distanceTo(end), 5), color, [0, 0, 0]);
  vein.position.copy(start).add(end).multiplyScalar(0.5);
  vein.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
}

export function createRadish() {
  const group = plant();

  const root = new THREE.Mesh(createRootGeometry(), new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72
  }));
  root.name = 'radish-root';
  group.add(root);

  // Leaf rosette with separate jagged blades makes the crop readable at game scale.
  const leafColors = [0x547b39, 0x668d43, 0x72984b, 0x5e853d, 0x789d50, 0x52783a, 0x6b9044];
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.16;
    const length = i % 2 === 0 ? 0.56 : 0.47;
    const blade = new THREE.Mesh(createLeafGeometry(length, i % 2 === 0 ? 0.145 : 0.125),
      new THREE.MeshStandardMaterial({ color: leafColors[i], roughness: 0.9, side: THREE.DoubleSide }));
    blade.name = `radish-leaf-${i + 1}`;
    blade.position.set(Math.sin(angle) * 0.03, 0.46, Math.cos(angle) * 0.03);
    blade.rotation.set(-0.3, angle, Math.sin(angle) * 0.17);
    group.add(blade);
    addVein(group, angle, length, i % 2 === 0 ? 0xa2b76c : 0x93aa60);
  }

  // Short crown at the point where the leaves emerge from the bulb.
  mesh(group, new THREE.CylinderGeometry(0.035, 0.045, 0.075, 8), 0x638744, [0, 0.505, 0]);
  return group;
}
