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
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
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

test('a powered washer treats new plots without a manual command', () => {
  const sim = new Simulation(quietData, { siteId: 'gale' });
  assert.ok(sim.command({ type: 'build', id: 'washer', x: 1, y: 0 }).ok);
  sim.step();
  assert.ok(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok);
  const plot = sim.state.buildings.find(({ id }) => id === 'plot');
  assert.equal(plot.treated, false);
  sim.step();
  assert.equal(plot.treated, true);
  assert.equal(sim.state.buildings.find(({ id }) => id === 'washer').washStatus, 'complete');
});

test('two auto-harvesters collect each adjacent mature crop only once', () => {
  const sim = new Simulation(quietData, { siteId: 'gale', difficulty: 'easy' });
  assert.ok(sim.command({ type: 'build', id: 'plot', x: 1, y: 0 }).ok);
  for (const x of [0, 2]) {
    assert.ok(sim.command({ type: 'build', id: 'autoHarvester', x, y: 0 }).ok);
  }
  assert.ok(sim.command({ type: 'plant', id: 'lettuce', x: 1, y: 0 }).ok);
  const harvests = [];
  sim.on('harvest', (result) => harvests.push(result));
  sim.state.crops[0].growth = 0.999;
  sim.step();
  assert.equal(harvests.length, 1);
  assert.equal(sim.state.crops.length, 0);
  assert.equal(sim.state.metrics.grownKg, harvests[0].kg);
  sim.step();
  assert.equal(harvests.length, 1);
});

test('Survival planting charges food only on success and supply drops unlock seeds on schedule', () => {
  const sim = new Simulation(quietData, { siteId: 'gale', difficulty: 'easy', rescue: true });
  const location = { x: 0, y: 0 };
  assert.ok(sim.command({ type: 'build', id: 'plot', ...location }).ok);
  const plant = { type: 'plant', id: 'radish', ...location };
  const startingFood = sim.state.res.foodKg;
  const cost = sim.plantingFoodCost('radish');
  sim.state.res.foodKg = cost / 2;
  assert.match(sim.command(plant).reason, /kg of food/);
  assert.equal(sim.state.res.foodKg, cost / 2);
  sim.state.res.foodKg = startingFood;
  assert.ok(sim.command(plant).ok);
  assert.equal(sim.state.res.foodKg, startingFood - cost);
  assert.equal(sim.command(plant).ok, false);
  assert.equal(sim.state.res.foodKg, startingFood - cost);

  sim.state.rescue.earned.repeatHarvest = 9;
  const crop = sim.cropTraits('tomato');
  const dropSol = data.balance.rescue.seedDropIntervalSols;
  assert.equal(sim.unlockRequirement(crop), `seed supply drop on sol ${dropSol}`);
  sim.state.sol = dropSol - 1;
  const drops = [];
  sim.on('supply:seeds', (drop) => drops.push(drop));
  sim.step();
  assert.equal(sim.unlockRequirement(crop), null);
  assert.deepEqual(drops, [{ sol: dropSol, crops: ['Tomato', 'Soybean'] }]);
});

test('forecast storm timing agrees with the simulation and accelerates panel dust', () => {
  const regional = data.events.find(({ id }) => id === 'dustRegional');
  const scenario = { ...quietData, events: [{ ...regional, baseChancePerSol: 1, durationSols: [2, 2] }] };
  const sim = new Simulation(scenario, { siteId: 'gale' });
  const clear = new Simulation(quietData, { siteId: 'gale' });
  const forecast = sim.forecastWeather(2);
  assert.equal(forecast.days[0].active[0].id, 'dustRegional');
  assert.equal(forecast.days[0].active[0].endSol, 3);
  assert.equal(sim.state.events.active.length, 0);
  sim.step();
  clear.step();
  assert.equal(sim.state.weather.active[0].id, forecast.days[0].active[0].id);
  const panel = (run) => run.state.buildings.find(({ id }) => id === 'solar');
  assert.ok(panel(clear).dust > 0);
  assert.equal(panel(sim).dust, panel(clear).dust * data.balance.stormDustMultiplier);
});

test('mining and rocket salvage fund a build exactly once', () => {
  const sim = new Simulation(quietData, { siteId: 'gale', rescue: true });
  const { state } = sim;
  const metal = state.rocks.find(({ material }) => material === 'metal');
  const mine = () => sim.command({ type: 'mine', x: metal.x, y: metal.y });
  assert.match(sim.command({ type: 'build', id: 'plot', x: metal.x, y: metal.y }).reason, /Mine this rock/);
  assert.match(sim.command({ type: 'scrapRocket' }).reason, /burning/);
  assert.ok(mine().ok);
  assert.equal(state.res.materials.metal, data.balance.rescue.surface.miningBatch);
  while (metal.remaining > 0) assert.ok(mine().ok);
  assert.equal(mine().ok, false);
  assert.equal(state.res.materials.metal, data.balance.rescue.surface.metalPerNode);
  while (state.sol < state.rocket.burnsUntilSol) sim.step();
  assert.equal(state.rocket.status, 'salvageable');
  assert.ok(sim.command({ type: 'scrapRocket' }).ok);
  assert.equal(state.rocket.status, 'scrapped');
  assert.equal(sim.command({ type: 'scrapRocket' }).ok, false);
  const mined = data.balance.rescue.surface.metalPerNode + data.balance.rescue.surface.rocketSalvage.metal;
  assert.equal(state.res.materials.metal, mined);
  state.rescue.earned.repeatHarvest = state.sol;
  assert.ok(sim.command({ type: 'build', id: 'autoHarvester', x: state.rocket.x, y: state.rocket.y }).ok);
  assert.equal(state.res.materials.metal, mined - 4);
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

test('a stranded farmer can fund upgrades with harvests and survive until rescue', () => {
  const sim = new Simulation(quietData, { rescue: true, siteId: 'gale' });
  const build = (id, x, y) => sim.command({ type: 'build', id, x, y });
  const plots = [{ x: 0, y: 0 }, { x: 0, y: 1 }];
  const plant = (plot, id = 'radish') => sim.command({ type: 'plant', id, ...plot });
  const harvest = (plot) => sim.command({ type: 'harvest', ...plot });
  const greenhouse = data.buildings.find(({ id }) => id === 'plot');
  const spending = [];
  sim.on('credits:spent', (credits) => spending.push(credits));

  assert.equal(sim.state.crew.n, 1);
  assert.equal(sim.state.rescue.arrivalSol, 120);
  assert.equal(sim.state.res.foodKg, 11 * data.balance.foodPerCrew);
  assert.equal(sim.state.res.waterL, 500);
  assert.equal(sim.state.res.credits, 180);
  assert.deepEqual(sim.state.water, { production: 0, demand: 3.25 });
  assert.equal(sim.expectedFoodPerSol, 0);
  assert.deepEqual(sim.state.rescue.earned, { stranded: 0 });
  assert.equal(sim.command({ type: 'setSpeed', speed: 4 }).ok, true);
  assert.equal(sim.command({ type: 'setSpeed', speed: 8 }).ok, false);
  assert.equal(sim.command({ type: 'setSpeed', speed: 16 }).ok, false);
  assert.equal(sim.state.speed, 4);
  assert.equal(sim.command({ type: 'nameColony', name: 'Ares' }).ok, false);
  assert.match(build('iceDrill', 2, 0).reason, /Botanist/);
  assert.ok(build('plot', 0, 0).ok);
  assert.equal(sim.purchasePrice(greenhouse), 46);
  assert.equal(build('plot', 0, 0).ok, false);
  assert.equal(sim.purchasePrice(greenhouse), 46);
  assert.ok(build('plot', 0, 1).ok);
  assert.equal(sim.purchasePrice(greenhouse), 53);
  assert.ok(build('washer', 1, 0).ok);
  assert.equal(sim.state.res.credits, 24);
  assert.deepEqual(spending, [40, 46, 70]);

  assert.ok(sim.command({ type: 'wash', x: 1, y: 0 }).ok);
  sim.step();
  assert.match(plant(plots[0], 'potato').reason, /Second Harvest/);
  const firstPlot = sim.state.buildings.find(({ x, y }) => x === 0 && y === 0);
  // Gale Rocknest fertility after wash scales yield (NASA-analog soil game values).
  assert.deepEqual(sim.harvestPreview(firstPlot, 'radish'), { kg: 4.464, credits: 22, unsafe: false });
  assert.deepEqual(sim.harvestPreview(firstPlot, 'radish', 0.5), { kg: 2.232, credits: 11, unsafe: false });
  for (const plot of plots) assert.ok(plant(plot).ok);
  assert.ok(Math.abs(sim.expectedFoodPerSol - 0.9486) < 1e-9);
  assert.equal(sim.state.rescue.earned.botanist, 1);
  assert.match(sim.command({ type: 'nameColony', name: 'Ares' }).reason, /Halfway Home/);
  assert.equal(sim.state.rescue.colonyName, '');

  while (sim.state.sol < 8) sim.step();
  assert.ok(Math.abs(sim.state.water.demand - 11.25) < 1e-9);
  assert.equal(harvest(plots[0]).ok, false);
  sim.step();
  assert.ok(harvest(plots[0]).ok);
  // Soil fertility × wild-type yy (0.85) → 19 cr; First Harvest award +70.
  assert.equal(sim.state.res.credits, 24 + 19 + 70);
  assert.ok(harvest(plots[1]).ok);
  assert.equal(sim.state.res.credits, 24 + 38 + 70 + 55);
  assert.equal(sim.state.rescue.earned.repeatHarvest, 9);
  assert.ok(build('iceDrill', 2, 0).ok);
  assert.ok(build('solar', 3, 0).ok);
  for (const plot of plots) assert.ok(plant(plot).ok);

  while (sim.state.status === 'active') {
    sim.step();
    if (sim.state.status !== 'active') break;
    if (sim.state.sol === 59) assert.equal(sim.command({ type: 'nameColony', name: 'Ares' }).ok, false);
    if (sim.state.sol === 60) {
      assert.ok(sim.command({ type: 'nameColony', name: ' Ares ' }).ok);
      assert.equal(sim.state.rescue.colonyName, 'Ares');
      assert.equal(sim.state.rescue.earned.colony, 60);
    }
    for (const plot of plots) {
      const unit = sim.state.buildings.find(({ x, y }) => plot.x === x && plot.y === y);
      if (sim.state.crops.some((crop) => crop.plotUid === unit.uid && crop.growth === 1)) {
        assert.ok(harvest(plot).ok);
        assert.ok(plant(plot).ok);
      }
    }
  }
  assert.equal(sim.state.rescue.outcome, 'rescued');
  assert.equal(sim.state.rescue.earned.halfway, 60);
  assert.equal(sim.state.rescue.earned.rescue, 120);
  assert.equal(sim.state.rescue.earned.water, 10);
  assert.ok(sim.state.rescue.earned.downlink > 9);
  // Full 120×0.8 kg diet mass; site soil fertility + yy yield change grown kg, not daily draw.
  assert.equal(sim.state.metrics.consumedKg.toFixed(1), '96.0');
  assert.equal(sim.state.metrics.lowWaterSols, 0);
  assert.ok(sim.state.water.production > sim.state.water.demand);
  assert.ok(sim.state.res.waterL > 500);
});

test('running out of rations can end survival before the rescue deadline', () => {
  const sim = new Simulation(quietData, { rescue: true, siteId: 'gale' });
  for (let i = 0; i < 11; i++) sim.step();
  assert.equal(sim.state.crew.health, 1);
  assert.ok(sim.state.res.foodKg < 1e-9);
  sim.step();
  assert.ok(sim.state.crew.health < 1);
  while (sim.state.status === 'active') sim.step();
  assert.equal(sim.state.rescue.outcome, 'lost');
  assert.ok(sim.state.sol < sim.state.rescue.arrivalSol);
  assert.equal(Object.hasOwn(sim.state.rescue.earned, 'rescue'), false);
});

test('ice-rich sites produce more water per powered drill', () => {
  for (const [siteId, expected] of [['gale', 13.2], ['utopia', 46.0512]]) {
    const sim = new Simulation(quietData, { rescue: true, siteId, difficulty: 'easy' });
    assert.ok(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok);
    assert.ok(sim.command({ type: 'plant', id: 'radish', x: 0, y: 0 }).ok);
    assert.ok(sim.command({ type: 'build', id: 'iceDrill', x: 1, y: 0 }).ok);
    assert.ok(sim.command({ type: 'demolish', x: 0, y: 0 }).ok);
    sim.step();
    assert.ok(Math.abs(sim.state.water.production - expected) < 1e-9);
  }
});

test('colony naming is refused before Halfway Home and works after it', () => {
  const sim = new Simulation(quietData, { rescue: true, siteId: 'gale' });
  sim.state.rescue.earned.botanist = 0;
  const refused = sim.command({ type: 'nameColony', name: 'Fort Radish' });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'Colony naming unlocks at Halfway Home.');
  assert.equal(sim.state.rescue.colonyName, '');
  sim.state.rescue.earned.halfway = 60;
  assert.ok(sim.command({ type: 'nameColony', name: 'Fort Radish' }).ok);
  assert.equal(sim.state.rescue.colonyName, 'Fort Radish');
  assert.ok(Object.hasOwn(sim.state.rescue.earned, 'colony'));
  assert.ok(sim.command({ type: 'nameColony', name: 'Red Farm' }).ok);
  assert.equal(sim.state.rescue.colonyName, 'Red Farm');
  assert.equal(sim.command({ type: 'nameColony', name: '   ' }).ok, false);
});
