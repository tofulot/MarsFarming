import { plant, stem, leaf, fruit } from './primitives.js';
export function createWheat() {
  const group = plant();
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.13;
    const height = 0.85 + (i % 3) * 0.15;
    const z = Math.sin(i * 3) * 0.15;
    stem(group, x, height, z, 0xb29c54);
    leaf(group, [x + 0.08, height * 0.5, z], [0.035, 0.32, 0.03], -0.4, 0x8d994b);
    for (let j = 0; j < 5; j++) {
      fruit(group, 0xd9ba72, [x + (j % 2 ? 0.035 : -0.035), height + j * 0.055, z], [0.055, 0.09, 0.045]);
    }
  }
  return group;
}
