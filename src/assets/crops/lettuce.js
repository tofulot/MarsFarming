import { plant, leaf } from './primitives.js';
export function createLettuce() {
  const group = plant();
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.4;
    const radius = i < 8 ? 0.32 : 0.15;
    const item = leaf(group, [Math.cos(angle) * radius, 0.22 + i * 0.014, Math.sin(angle) * radius],
      [0.25, i < 8 ? 0.13 : 0.23, 0.32], 0, i < 8 ? 0x547f35 : 0x9db958);
    item.rotation.y = -angle;
    item.rotation.z = Math.cos(angle) * 0.35;
  }
  return group;
}
