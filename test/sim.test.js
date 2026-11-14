// AI-assisted (OpenAI Codex)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { dustOpacity, hasDustClimatology } from '../src/weather/dustClimatology.js';
import { gameEvents, landingWeatherDifficulty } from '../src/weather/redHarvest.js';
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

test('Kelton weather drives the forecast and live storm penalties', () => {
  const weather = read('weather');
  const events = gameEvents(weather, data.events).map((event) => ({ ...event, baseChancePerSol: 0 }));
  assert.ok(events.some(({ id }) => id === 'spe'));
  assert.ok(events.some(({ id }) => id === 'coldSnap'));
  const sim = new Simulation({ ...data, weather, events, weatherObservations: read('weather-observations') },
    { siteId: 'gale', demo: true });
  assert.equal(sim.weather.getObservations('jezero')[0].pressurePa, 718);
  assert.equal(sim.command({ type: 'triggerEvent', id: 'dustRegional' }).ok, true);
  const snapshot = structuredClone(sim.state);
  const days = sim.forecastWeather(65).days;
  assert.deepEqual(sim.state, snapshot);
  assert.equal(days[0].dustFactor, 0.4);
  assert.equal(days[0].commsFactor, 0.75);
  assert.equal(days.at(-1).dustFactor, 1);
  sim.step();
  assert.equal(sim.state.outsideTempC, days[0].outsideTempC);
  assert.equal(sim.state.power.solarFactor, days[0].solarFactor);
  assert.ok(landingWeatherDifficulty(weather.temperatureModel, 80).seasonalLow <
    landingWeatherDifficulty(weather.temperatureModel, 0).seasonalLow);
});

test('the dust climatology varies across longitude and season and wraps at the map seam', () => {
  const data = read('mars/dust-climatology');
  assert.ok(hasDustClimatology(data));
  const [spring, , autumn] = data.frames;
  assert.equal(dustOpacity(autumn, -2.5, 0), 0.298);
  assert.equal(dustOpacity(autumn, -2.5, -100), 0.278);
  assert.equal(dustOpacity(autumn, -2.5, -45), 0.402);
  assert.ok(dustOpacity(autumn, -2.5, 0) > 2 * dustOpacity(spring, -2.5, 0));
  assert.equal(dustOpacity(autumn, 35, -180), dustOpacity(autumn, 35, 180));
});

test('a stranded farmer can plant, name their colony, harvest and survive until rescue', () => {
  const sim = new Simulation(quietData, { rescue: true, siteId: 'gale' });
  const build = (id, x, y) => sim.command({ type: 'build', id, x, y });
  const plot = { x: 0, y: 0 };
  assert.equal(sim.state.crew.n, 1);
  assert.equal(sim.state.rescue.arrivalSol, 120);
  assert.equal(sim.command({ type: 'nameColony', name: 'Ares' }).ok, false);
  assert.ok(build('plot', 0, 0).ok);
  assert.ok(build('washer', 1, 0).ok);
  assert.ok(build('iceDrill', 2, 0).ok);
  assert.ok(sim.command({ type: 'wash', x: 1, y: 0 }).ok);
  sim.step();
  assert.ok(sim.command({ type: 'plant', id: 'lettuce', ...plot }).ok);
  assert.equal(sim.state.rescue.earned.botanist, 1);
  assert.ok(sim.command({ type: 'nameColony', name: ' Ares ' }).ok);
  assert.equal(sim.state.rescue.colonyName, 'Ares');
  for (let sol = 2; sol <= sim.state.solLimit; sol++) {
    sim.step();
    if (sim.state.crops[0]?.growth === 1) {
      assert.ok(sim.command({ type: 'harvest', ...plot }).ok);
      assert.ok(sim.command({ type: 'plant', id: 'lettuce', ...plot }).ok);
    }
  }
  assert.equal(sim.state.rescue.outcome, 'rescued');
  assert.equal(sim.state.rescue.earned.rescue, 120);
  assert.equal(sim.state.rescue.earned.botanist, 1);
  assert.ok(sim.state.metrics.grownKg > 0);
});

test('running out of rations can end survival before the rescue deadline', () => {
  const sim = new Simulation(quietData, { rescue: true, siteId: 'gale' });
  while (sim.state.status === 'active') sim.step();
  assert.equal(sim.state.rescue.outcome, 'lost');
  assert.ok(sim.state.sol < sim.state.rescue.arrivalSol);
  assert.equal(Object.hasOwn(sim.state.rescue.earned, 'rescue'), false);
});
