import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { selectColonyUiState } from '../src/ui/colony/selectors.js';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty', 'landers',
  'objectives', 'facts', 'balance', 'mutations', 'soils'].map(key => [key, read(key)]));
data.events = [];

test('rationing changes food runway and actual meal consumption', () => {
  const expected = { normal: 0.8, reduced: 0.6, emergency: 0.4 };
  for (const [level, eaten] of Object.entries(expected)) {
    const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale', rescue: true });
    assert.equal(sim.command({ type: 'setRationing', level }).ok, true);
    const selectors = selectColonyUiState(sim, data);
    assert.equal(selectors.rationing, level);
    assert.equal(selectors.foodSols, Math.floor(sim.state.res.foodKg / eaten));
    sim.step();
    assert.ok(Math.abs(sim.state.crew.meal.eatenKg - eaten) < 1e-9);
  }
});

test('power load groups are selectable, live, and protect essential habitat', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale', rescue: true });
  const plot = { x: 4, y: 4 };
  assert.equal(sim.command({ type: 'build', id: 'plot', ...plot }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', ...plot }).ok, true);
  sim.step();
  const before = selectColonyUiState(sim, data);
  const greenhouse = before.loads.find(({ id }) => id === 'greenhouses');
  assert.ok(greenhouse.useW > 0);
  const wattsBefore = sim.state.power.demand;
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'greenhouses', enabled: false }).ok, true);
  const after = selectColonyUiState(sim, data);
  assert.equal(after.loads.find(({ id }) => id === 'greenhouses').enabled, false);
  assert.equal(after.loads.find(({ id }) => id === 'greenhouses').useW, 0);
  assert.ok(sim.state.power.demand < wattsBefore);
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'habitat', enabled: false }).ok, false);
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'greenhouses', enabled: true }).ok, true);
  assert.equal(selectColonyUiState(sim, data).loads.find(({ id }) => id === 'greenhouses').enabled, true);
});

test('goal selector includes live progress and real unlock names', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale', rescue: true });
  const goals = selectColonyUiState(sim, data).goals;
  const repeatHarvest = goals.find(({ id }) => id === 'repeatHarvest');
  assert.equal(repeatHarvest.title, 'Second Harvest');
  assert.equal(repeatHarvest.progress, 0);
  assert.equal(repeatHarvest.target, 2);
  assert.deepEqual(repeatHarvest.unlocks, ['Fertilizer Maker', 'Auto-Harvester']);
  const phoneHome = goals.find(({ id }) => id === 'phoneHome');
  assert.equal(phoneHome.title, 'Phone Home');
  assert.deepEqual([phoneHome.progress, phoneHome.target, phoneHome.done], [0, 1, false]);
  assert.ok(phoneHome.unlocks.includes('Seed orders'));
  assert.ok(phoneHome.unlocked.includes('Special Delivery'));
  assert.ok(phoneHome.unlocked.includes('First Downlink'));
  const delivery = goals.find(({ id }) => id === 'delivery');
  assert.equal(delivery.title, 'Special Delivery');
  assert.equal(delivery.progress, 0);
  for (const goal of goals) assert.doesNotMatch(goal.description, /supply drop|longer-growing/i);
});
