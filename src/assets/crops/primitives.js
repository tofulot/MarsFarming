import * as THREE from 'three';

export const green = 0x658b40;
export function mesh(group, geometry, color, position, scale = [1, 1, 1]) {
  const item = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
  item.position.set(...position);
  item.scale.set(...scale);
  group.add(item);
  return item;
}
export function leaf(group, position, scale, angle = 0, color = green) {
  const item = mesh(group, new THREE.SphereGeometry(1, 8, 5), color, position, scale);
  item.rotation.z = angle;
  item.rotation.y = position[2] * 2;
  return item;
}
export function stem(group, x, height, z, color = 0x63763a) {
  return mesh(group, new THREE.CylinderGeometry(0.025, 0.045, height, 6), color, [x, height / 2, z]);
}
export function fruit(group, color, position, scale) {
  const item = mesh(group, new THREE.SphereGeometry(1, 10, 7), color, position, scale);
  (group.userData.mature ??= []).push(item);
  return item;
}
export function plant() {
  const group = new THREE.Group();
  group.userData.mature = [];
  return group;
}
