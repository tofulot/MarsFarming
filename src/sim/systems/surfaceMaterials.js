import { mulberry32 } from '../rng.js';

export function placeSurfaceMaterials(state, surface) {
  const open = [];
  for (let y = 0; y < state.grid.h; y++) {
    for (let x = 0; x < state.grid.w; x++) {
      if (!state.buildings.some((unit) => unit.x === x && unit.y === y)) open.push({ x, y });
    }
  }
  const wreckTile = open.find(({ x, y }) => x === 9 && y === 5) ?? open[0];
  if (wreckTile) state.rocket = {
    ...wreckTile, status: 'burning', burnsUntilSol: surface.rocketBurnSols,
  };
  const rockTiles = open.filter((tile) => tile !== wreckTile && tile.y >= state.grid.h - 3);
  const random = mulberry32(state.seed ^ 0xdc680f3);
  for (let i = rockTiles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rockTiles[i], rockTiles[j]] = [rockTiles[j], rockTiles[i]];
  }
  const definitions = [
    ['regolith', surface.regolithNodes, surface.regolithPerNode],
    ['metal', surface.metalNodes, surface.metalPerNode],
  ];
  for (const [material, count, remaining] of definitions) {
    state.rocks.push(...rockTiles.splice(0, count).map((tile) => ({ ...tile, material, remaining })));
  }
}
