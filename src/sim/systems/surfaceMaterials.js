// AI-assisted (Claude Code: site-seeded surface placement)
import { mulberry32 } from '../rng.js';

/** Relief index (0–1) assumed when the scene supplies none, e.g. headless tests. Gives the balance.json counts. */
export const DEFAULT_RELIEF = 1 / 3;
/** Tiles (Chebyshev distance from the hab) kept free of deposits around the starter base. */
export const BASE_CLEAR_RADIUS = 3;

/** Deterministic 32-bit seed from the mission seed and the landing site. Same inputs, same ground. */
export function surfaceSeed(seed, lat = 0, lon = 0) {
  let h = 0x811c9dc5 ^ (seed >>> 0);
  for (const value of [Math.round(lat * 100), Math.round(lon * 100)]) {
    h = Math.imul(h ^ (value & 0xffff), 0x01000193);
    h = Math.imul(h ^ (value >>> 16), 0x01000193);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deposit count multiplier from the MOLA relief index: flat plains 0.75×, rugged ground 1.5× (game value). */
export function reliefScale(relief = DEFAULT_RELIEF) {
  const value = Number.isFinite(relief) ? Math.min(1, Math.max(0, relief)) : DEFAULT_RELIEF;
  return 0.75 + 0.75 * value;
}

export function surfaceHab(state) {
  return state.buildings.find(({ id }) => id === 'hab') ?? { x: state.grid.w >> 1, y: state.grid.h >> 1 };
}

/**
 * Place the crashed rocket and the mineable deposits. Seeded by hash(seed, lat, lon): the wreck lies
 * 3–6 tiles from the hab at a seeded bearing; deposits are scattered over the whole grid outside a clear
 * ring around the base, never on buildings. `relief` (0–1, from the MOLA window) scales the count.
 */
export function placeSurfaceMaterials(state, surface, { relief = DEFAULT_RELIEF } = {}) {
  const { grid, site } = state;
  const random = mulberry32(surfaceSeed(state.seed, site?.lat, site?.lon));
  const hab = surfaceHab(state);
  const occupied = new Set(state.buildings.map(({ x, y }) => `${x},${y}`));
  const free = (x, y) => x >= 0 && y >= 0 && x < grid.w && y < grid.h && !occupied.has(`${x},${y}`);
  const ring = (x, y) => Math.max(Math.abs(x - hab.x), Math.abs(y - hab.y));

  let wreckTile = null;
  for (let attempt = 0; attempt < 40 && !wreckTile; attempt++) {
    const bearing = random() * Math.PI * 2;
    const distance = 3 + random() * 3;
    const x = Math.round(hab.x + Math.cos(bearing) * distance);
    const y = Math.round(hab.y + Math.sin(bearing) * distance * 0.75);
    if (free(x, y) && ring(x, y) >= 3 && Math.hypot(x - hab.x, y - hab.y) <= 6.5) wreckTile = { x, y };
  }
  if (!wreckTile) {
    for (let y = 0; y < grid.h && !wreckTile; y++) {
      for (let x = 0; x < grid.w && !wreckTile; x++) if (free(x, y) && ring(x, y) === 3) wreckTile = { x, y };
    }
  }
  if (wreckTile) {
    occupied.add(`${wreckTile.x},${wreckTile.y}`);
    state.rocket = { ...wreckTile, status: 'burning', burnsUntilSol: surface.rocketBurnSols };
  }

  const candidates = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) if (free(x, y) && ring(x, y) > BASE_CLEAR_RADIUS) candidates.push({ x, y });
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const scale = reliefScale(relief);
  const definitions = [
    ['regolith', Math.max(1, Math.round(surface.regolithNodes * scale)), surface.regolithPerNode],
    ['metal', Math.max(1, Math.round(surface.metalNodes * scale)), surface.metalPerNode],
  ];
  // Prefer spread-out deposits (no two touching); relax the spacing only if the grid runs short.
  const taken = [];
  const pick = () => {
    for (const spacing of [2, 1, 0]) {
      const index = candidates.findIndex((tile) => taken.every((other) =>
        Math.max(Math.abs(other.x - tile.x), Math.abs(other.y - tile.y)) > spacing));
      if (index >= 0) return candidates.splice(index, 1)[0];
    }
    return null;
  };
  for (const [material, count, remaining] of definitions) {
    for (let i = 0; i < count; i++) {
      const tile = pick();
      if (!tile) break;
      taken.push(tile);
      state.rocks.push({ ...tile, material, remaining });
    }
  }
}
