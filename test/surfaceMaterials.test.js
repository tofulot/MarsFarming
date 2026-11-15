// AI-assisted (Cursor)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { respawnSurfaceMaterials } from '../src/sim/systems/surfaceMaterials.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];

test('mined rocks can respawn up to the node cap and inventory is clamped', () => {
  const sim = new Simulation(data, { difficulty: 'medium', siteId: 'gale', rescue: true });
  const surface = data.balance.rescue.surface;
  const before = sim.state.rocks.length;
  assert.ok(before > 0);
  sim.state.rocks[0].remaining = 0;
  sim.state.rocks = sim.state.rocks.filter((rock) => rock.remaining > 0);
  assert.equal(sim.state.rocks.length, before - 1);

  const spawned = respawnSurfaceMaterials(sim.state, surface, () => 0);
  assert.ok(spawned);
  assert.ok(sim.state.rocks.length <= (surface.maxRegolithNodes + surface.maxMetalNodes));

  sim.state.res.materials.regolith = 999;
  respawnSurfaceMaterials(sim.state, surface, () => 1);
  assert.equal(sim.state.res.materials.regolith, surface.inventoryCap.regolith);
});
