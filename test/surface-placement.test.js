// AI-assisted (Claude Code)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { BASE_CLEAR_RADIUS, reliefScale, surfaceSeed } from '../src/sim/systems/surfaceMaterials.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];
data['neutron-flux'] = read('mars/neutron-flux');

const layout = (options) => {
  const { state } = new Simulation(data, { rescue: true, ...options });
  return { rocket: { x: state.rocket.x, y: state.rocket.y }, rocks: state.rocks.map(({ x, y, material }) => `${material}@${x},${y}`),
    hab: state.buildings.find(({ id }) => id === 'hab'), buildings: state.buildings, grid: state.grid };
};

test('the same site and seed reproduce the surface exactly', () => {
  assert.deepEqual(layout({ siteId: 'gale', seed: 7 }), layout({ siteId: 'gale', seed: 7 }));
  assert.deepEqual(layout({ site: { lat: 12.3, lon: -45.6 }, seed: 99, relief: 0.6 }),
    layout({ site: { lat: 12.3, lon: -45.6 }, seed: 99, relief: 0.6 }));
  assert.equal(surfaceSeed(1, 2, 3), surfaceSeed(1, 2, 3));
});

test('different sites (and seeds) give different layouts', () => {
  const gale = layout({ siteId: 'gale', seed: 7 });
  assert.notDeepEqual(gale.rocks, layout({ siteId: 'utopia', seed: 7 }).rocks);
  assert.notDeepEqual(gale.rocks, layout({ siteId: 'gale', seed: 8 }).rocks);
});

test('wreck lies 3–6 tiles from the hab; deposits avoid buildings and a clear ring round the base', () => {
  for (const siteId of data.sites.map(({ id }) => id)) {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const { rocket, rocks, hab, buildings, grid } = layout({ siteId, seed });
      const distance = Math.hypot(rocket.x - hab.x, rocket.y - hab.y);
      assert.ok(distance >= 3 && distance <= 6.5, `${siteId}/${seed} wreck at ${distance}`);
      const taken = new Set(buildings.map(({ x, y }) => `${x},${y}`));
      assert.ok(!taken.has(`${rocket.x},${rocket.y}`));
      for (const rock of rocks) {
        const [x, y] = rock.split('@')[1].split(',').map(Number);
        assert.ok(!taken.has(`${x},${y}`) && x >= 0 && y >= 0 && x < grid.w && y < grid.h);
        assert.ok(Math.max(Math.abs(x - hab.x), Math.abs(y - hab.y)) > BASE_CLEAR_RADIUS);
        assert.ok(x !== rocket.x || y !== rocket.y);
      }
    }
  }
});

test('MOLA relief scales the deposit count; the default keeps the balance counts', () => {
  const { surface } = data.balance.rescue;
  assert.equal(layout({ siteId: 'gale' }).rocks.length, surface.regolithNodes + surface.metalNodes);
  const flat = layout({ siteId: 'gale', relief: 0 }).rocks.length;
  const rugged = layout({ siteId: 'gale', relief: 1 }).rocks.length;
  assert.ok(flat < rugged);
  assert.equal(reliefScale(Number.NaN), reliefScale());
});
