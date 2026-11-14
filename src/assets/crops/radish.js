import * as THREE from 'three';
import { plant, mesh, leaf } from './primitives.js';
export function createRadish() {
  const group = plant();
  mesh(group, new THREE.SphereGeometry(0.23, 12, 8), 0xc44855, [0, 0.16, 0], [1, 1.1, 1]);
  mesh(group, new THREE.ConeGeometry(0.08, 0.27, 8), 0xe4d4ae, [0, -0.08, 0]).rotation.z = Math.PI;
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    leaf(group, [Math.cos(angle) * 0.19, 0.55, Math.sin(angle) * 0.16], [0.1, 0.36, 0.09], -Math.cos(angle) * 0.5, 0x73954a);
  }
  return group;
}
