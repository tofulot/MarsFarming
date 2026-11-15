// AI-assisted (Cursor)
import { mulberry32 } from '../rng.js';

function openTiles(state) {
  const open = [];
  for (let y = 0; y < state.grid.h; y++) {
    for (let x = 0; x < state.grid.w; x++) {
      if (state.buildings.some((unit) => unit.x === x && unit.y === y)) continue;
      if (state.rocks.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0)) continue;
      if (state.rocket && state.rocket.x === x && state.rocket.y === y && state.rocket.status !== 'scrapped') continue;
      open.push({ x, y });
    }
  }
  return open;
}

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

/** Respawn depleted rock nodes up to map caps; clamp carried inventory to caps. */
export function respawnSurfaceMaterials(state, surface, random = Math.random) {
  if (!surface) return null;
  const caps = surface.inventoryCap ?? {};
  for (const [material, cap] of Object.entries(caps)) {
    if (state.res.materials[material] > cap) state.res.materials[material] = cap;
  }
  state.rocks = state.rocks.filter((rock) => rock.remaining > 0);
  const chance = surface.respawnChancePerSol ?? 0;
  if (chance <= 0 || random() > chance) return null;

  const counts = {
    regolith: state.rocks.filter((rock) => rock.material === 'regolith').length,
    metal: state.rocks.filter((rock) => rock.material === 'metal').length,
  };
  const limits = {
    regolith: surface.maxRegolithNodes ?? surface.regolithNodes ?? 0,
    metal: surface.maxMetalNodes ?? surface.metalNodes ?? 0,
  };
  const stock = {
    regolith: surface.regolithPerNode ?? 30,
    metal: surface.metalPerNode ?? 16,
  };
  const candidates = Object.keys(limits).filter((material) => counts[material] < limits[material]);
  if (!candidates.length) return null;
  const open = openTiles(state).filter((tile) => tile.y >= state.grid.h - 4);
  if (!open.length) return null;
  const material = candidates[Math.floor(random() * candidates.length)];
  const tile = open[Math.floor(random() * open.length)];
  const rock = { ...tile, material, remaining: stock[material] };
  state.rocks.push(rock);
  return rock;
}
