import { plant, stem, leaf, fruit } from './primitives.js';
export function createPotato() {
  const group = plant();
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 - 0.5) * 0.4;
    const z = (Math.floor(i / 2) - 0.5) * 0.3;
    stem(group, x, 0.7, z);
    for (let side = -1; side <= 1; side += 2) leaf(group, [x + side * 0.1, 0.45, z], [0.19, 0.25, 0.13], side * 0.5, 0x608247);
    fruit(group, 0xb8a5ce, [x, 0.77, z], [0.075, 0.06, 0.075]);
  }
  return group;
}
