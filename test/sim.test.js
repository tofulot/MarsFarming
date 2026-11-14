// AI-assisted (OpenAI Codex)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { checkManifest } from '../src/sim/design.js';
import { solarLongitude } from '../src/sim/insolation.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance'].map((key) => [key, read(key)]));
data.events = read('demo-events');
const quietData = { ...data, events: [] };

test('the seasonal calendar matches the source equinoxes and solstices', () => {
  for (const [sol, angle] of [[0, 0], [193.3, 90], [371.9, 180], [514.6, 270], [668.6, 0]]) {
    assert.equal(solarLongitude(sol, data.seasons), angle);
  }
});

test('manifest rejects a payload above the selected lander mass limit', () => {
  const result = checkManifest(data, { landerId: 'sparrow', items: { battery: 6 }, budget: 1600 });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /mass/i);
  assert.equal(result.massKg, 1200);
});

test('build, plant, grow, harvest, and downlink lettuce', () => {
  const sim = new Simulation(quietData, { difficulty: 'easy', siteId: 'gale', manifest: { iceDrill: 1, solar: 1 } });
  const position = { x: 5, y: 5 };
  assert.equal(sim.command({ type: 'build', id: 'plot', ...position }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', ...position }).ok, true);
  for (let sol = 0; sol < 26; sol++) sim.step();
  assert.equal(sim.command({ type: 'harvest', ...position }).ok, false);
  sim.step();
  const credits = sim.state.res.credits;
  assert.equal(sim.command({ type: 'harvest', ...position }).ok, true);
  assert.ok(sim.state.res.credits > credits);
  assert.ok(sim.state.metrics.grownKg > 0);
  assert.equal(sim.state.res.sp, 0);
  assert.equal(sim.state.metrics.packets[0].total, data.balance.harvestResearch);
  sim.step();
  assert.ok(sim.state.res.sp > 0);
});

test('soil treatment requires the washer to run for a sol', () => {
  const sim = new Simulation(quietData, { siteId: 'gale' });
  const plot = { x: 0, y: 0 };
  const washer = { x: 1, y: 0 };
  assert.equal(sim.command({ type: 'build', id: 'plot', ...plot }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'washer', ...washer }).ok, true);
  const plant = { type: 'plant', id: 'lettuce', ...plot };
  assert.equal(sim.command(plant).ok, false);
  assert.equal(sim.command({ type: 'wash', ...washer }).ok, true);
  const unit = sim.state.buildings.find(({ id }) => id === 'washer');
  assert.equal(unit.washStatus, 'queued');
  assert.equal(sim.command({ type: 'wash', ...washer }).ok, false);
  assert.equal(sim.command(plant).ok, false);
  sim.step();
  assert.equal(unit.washStatus, 'complete');
  assert.equal(sim.command(plant).ok, true);
});

test('a regional dust storm sheds greenhouse load before life support', () => {
  const sim = new Simulation({ ...data, events: data.events.filter(({ id }) => id === 'dustRegional') },
    { difficulty: 'easy', siteId: 'gale', demo: true });
  sim.command({ type: 'build', id: 'plot', x: 0, y: 0 });
  sim.command({ type: 'plant', id: 'wheat', x: 0, y: 0 });
  sim.step();
  assert.ok(sim.state.crops[0].growth > 0);
  assert.equal(sim.command({ type: 'triggerEvent', id: 'dustRegional' }).ok, true);
  assert.equal(sim.state.events.active[0].startedSol, sim.state.sol);
  sim.step();
  assert.ok(sim.state.buildings.find(({ id }) => id === 'hab').online);
  assert.ok(sim.state.power.shed.includes(sim.state.crops[0].plotUid));
});

test('all difficulty/site pairs can run 669 sols with the same seeded outcomes', () => {
  for (const difficulty of Object.keys(data.difficulty)) {
    for (const site of data.sites) {
      const mode = data.difficulty[difficulty];
      const fixture = { ...data, difficulty: { ...data.difficulty,
        [difficulty]: { ...mode, startFood: 4000, startWater: 5000 } } };
      const options = { difficulty, siteId: site.id, landerId: 'condor', seed: 42,
        manifest: { nuclear: 1, iceDrill: 2, spares: 4 } };
      const run = () => {
        const sim = new Simulation(fixture, options);
        for (let day = 0; day < 669; day++) {
          for (const event of sim.state.events.active) {
            if (event.targetUid && sim.state.res.spares) sim.command({ type: 'repair', uid: event.targetUid });
          }
          const state = sim.step();
          assert.ok(state.res.credits >= 0 && state.res.waterL >= 0 && state.res.foodKg >= 0);
          assert.ok(Number.isFinite(state.power.gen) && state.Ls >= 0 && state.Ls < 360);
        }
        assert.equal(sim.state.sol, 669, `${site.id} / ${difficulty}`);
        assert.equal(sim.state.status, 'ended');
        assert.equal(sim.step().sol, 669);
        return sim.state.events.log;
      };
      assert.deepEqual(run(), run());
    }
  }
});

test('every demo data number is finite and no fields are null', () => {
  function verify(value) {
    assert.notEqual(value, null);
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    if (typeof value === 'object') Object.values(value).forEach(verify);
  }
  verify(data);
});

test('map landings start with the full base budget and buy equipment on the surface', () => {
  const grid = read('mars/neutron-flux');
  assert.equal(grid.length, 4050);
  const fixture = { ...quietData, 'neutron-flux': grid };
  const polar = new Simulation(fixture, { site: { lat: -88, lon: -178 } });
  const equatorial = new Simulation(fixture, { site: { lat: 0, lon: -178 } });
  assert.ok(polar.state.site.iceFactor > equatorial.state.site.iceFactor);
  assert.ok(polar.state.power.gen < equatorial.state.power.gen);
  assert.equal(polar.state.res.credits, data.difficulty.medium.budget);
  assert.equal(polar.state.buildings.length, data.balance.starter.length);
  assert.equal(polar.command({ type: 'buySpares' }).ok, true);
  assert.equal(polar.state.res.spares, 1);
  assert.equal(polar.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(polar.state.res.credits, data.difficulty.medium.budget - 60);
});
