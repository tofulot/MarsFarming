import { plant, stem, leaf, fruit } from './primitives.js';
export function createSoybean() {
  const group = plant();
  stem(group, 0, 0.95, 0);
  for (let level = 0; level < 3; level++) {
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + level;
      leaf(group, [Math.cos(angle) * 0.22, 0.35 + level * 0.25, Math.sin(angle) * 0.22], [0.18, 0.1, 0.2], 0, 0x76934d);
    }
    fruit(group, 0xb6a969, [0.12, 0.27 + level * 0.22, 0.14], [0.06, 0.17, 0.055]);
  }
  return group;
}
