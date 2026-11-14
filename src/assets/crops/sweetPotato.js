import { plant, stem, leaf } from './primitives.js';
export function createSweetPotato() {
  const group = plant();
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const x = Math.cos(angle) * 0.3;
    const z = Math.sin(angle) * 0.3;
    stem(group, x, 0.35, z, 0x905c69);
    leaf(group, [x, 0.38, z], [0.24, 0.08, 0.26], 0, i % 2 ? 0x8b8052 : 0x677843);
  }
  return group;
}
