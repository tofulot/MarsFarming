import { plant, stem, leaf, fruit } from './primitives.js';
export function createTomato() {
  const group = plant();
  stem(group, 0, 1.25, 0);
  stem(group, 0.14, 1.4, 0.1, 0xb19a75);
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    leaf(group, [side * 0.21, 0.4 + i * 0.12, Math.sin(i) * 0.16], [0.24, 0.09, 0.12], side * 0.35, 0x507e43);
  }
  for (const [x, y, z] of [[-0.26, 0.48, 0.16], [0.24, 0.7, 0.1], [-0.17, 1.03, 0.12], [0.26, 0.37, -0.1]]) {
    fruit(group, 0xd75e39, [x, y, z], [0.15, 0.14, 0.15]);
  }
  return group;
}
