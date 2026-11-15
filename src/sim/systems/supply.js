// AI-assisted (Claude Code: comms dish repair, seed orders and supply crates; see docs/DESIGN_HUD_COMMS.md WP-C)
import { mulberry32 } from '../rng.js';
import { surfaceHab, surfaceSeed } from './surfaceMaterials.js';

/** Order mass is compared to the cap with this tolerance so 0.1 + 0.2 style sums are not refused. */
export const ORDER_MASS_EPSILON = 1e-9;
/** Crates land this many tiles (Chebyshev distance) from the hab: close enough to see, not on the doorstep. */
export const CRATE_MIN_DISTANCE = 2;
export const CRATE_MAX_DISTANCE = 5;

/** True for a Comms Dish that is repaired (or newly built) and powered this sol. */
export function commsDishOnline(state) {
  return state.buildings.some((unit) => unit.id === 'comms' && !unit.broken && unit.online);
}

/** Downlink capacity per sol from working, powered dishes. A broken dish contributes nothing. */
export function commsThroughput(state, data) {
  const dishes = state.buildings.filter((unit) => unit.id === 'comms' && !unit.broken && unit.online).length;
  return dishes * data.balance.commsThroughput * (state.weather?.commsFactor ?? 1);
}

export function orderMassKg(items, packetKg) {
  return items.reduce((sum, id) => sum + (packetKg[id] ?? 0), 0);
}

/** Crops whose seeds the player holds for good: the starter set plus every collected crate. */
export function ownedSeeds(state, comms) {
  return new Set([...(comms?.starterSeeds ?? []), ...state.comms.delivered]);
}

/** Crops already ordered but not yet collected (in transit, or sitting in a crate on the ground). */
export function seedsInFlight(state) {
  return new Set([...(state.comms.order?.items ?? []), ...(state.comms.crate?.items ?? [])]);
}

export function crateAt(state, x, y) {
  const crate = state.comms?.crate;
  return crate && crate.x === x && crate.y === y ? crate : null;
}

/** A tile a crate may land on: inside the grid, no building, no rock with ore left, no unscrapped wreck. */
export function crateTileFree(state, x, y) {
  const { grid } = state;
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return false;
  if (state.buildings.some((unit) => unit.x === x && unit.y === y)) return false;
  if (state.rocks.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0)) return false;
  return !(state.rocket && state.rocket.x === x && state.rocket.y === y && state.rocket.status !== 'scrapped');
}

/**
 * Pick the landing tile for a supply crate. Seeded by (mission seed, site, arrival sol) with its own
 * generator, so a drop never disturbs the event dice. Prefers a free tile 2–5 tiles (Chebyshev) from the
 * hab; falls back to the nearest free tile anywhere. Returns null only when the board is full.
 */
export function chooseCrateTile(state, arrivalSol) {
  const hab = surfaceHab(state);
  const ring = (x, y) => Math.max(Math.abs(x - hab.x), Math.abs(y - hab.y));
  const free = [];
  for (let y = 0; y < state.grid.h; y++) {
    for (let x = 0; x < state.grid.w; x++) if (crateTileFree(state, x, y)) free.push({ x, y });
  }
  if (!free.length) return null;
  const near = free.filter(({ x, y }) => ring(x, y) >= CRATE_MIN_DISTANCE && ring(x, y) <= CRATE_MAX_DISTANCE);
  if (near.length) {
    const random = mulberry32(surfaceSeed((state.seed ^ Math.imul(arrivalSol + 1, 0x9e3779b1)) >>> 0,
      state.site?.lat, state.site?.lon));
    return near[Math.floor(random() * near.length)];
  }
  free.sort((a, b) => ring(a.x, a.y) - ring(b.x, b.y) || a.y - b.y || a.x - b.x);
  return free[0];
}
