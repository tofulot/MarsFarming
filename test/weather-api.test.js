// AI-assisted (OpenAI Codex).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWeatherAPI } from '../src/weather/index.js';
import { createRedHarvestWeather } from '../src/weather/redHarvest.js';
import { Simulation } from '../src/sim/Simulation.js';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const config = read('weather');
const site = { id: 'jezero', lat: 18.44 };
const input = { sol: 371, seed: 42, difficulty: 'medium', site };
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'weather'].map(key => [key, read(key)]));
data.events = read('demo-events');
data.weatherObservations = read('weather-observations');

test('shared API returns independent data and accepts sectional overrides', () => {
  const options = { config: structuredClone(config), overrides: { balance: { heatWattsPerDegree: 9 } },
    observations: read('weather-observations').observations };
  const api = createWeatherAPI(options);
  options.config.balance.lightWattsPerPpf = 999;
  options.overrides.balance.heatWattsPerDegree = 999;
  assert.equal(api.getConfig().balance.heatWattsPerDegree, 9);
  assert.equal(api.getConfig().balance.lightWattsPerPpf, 8);
  const records = api.getObservations('jezero');
  assert.equal(records.length, 3);
  records[0].pressurePa = 0;
  assert.equal(api.getObservations('jezero')[0].pressurePa, 718);
  const weather = api.current(input);
  weather.outsideTempC = 999;
  assert.notEqual(api.current(input).outsideTempC, 999);
});

test('forecast expires known storms and begins on the next sol without changing inputs', () => {
  const api = createWeatherAPI({ config });
  const args = { ...input, sol: 0, events: [{ id: 'storm', startSol: 1, endSol: 3, effects: { solarFactor: 0.4 } }] };
  const before = structuredClone(args);
  const projection = api.forecast(args, { sols: 4 });
  assert.equal(projection.kind, 'projection');
  assert.deepEqual(projection.days.map(day => day.sol), [1, 2, 3, 4]);
  assert.deepEqual(projection.days.map(day => day.dustFactor), [0.4, 0.4, 1, 1]);
  assert.deepEqual(args, before);
  assert.equal(api.forecast(input, { sols: 0 }).days.length, 0);
  assert.throws(() => api.forecast(input, { sols: 1.5 }));
});

test('forecast respects external solar longitude and wraps seasons', () => {
  const api = createWeatherAPI({ config });
  const result = api.forecast({ ...input, sol: 0, Ls: 359.8 }, { sols: 2 });
  assert.ok(result.days[0].Ls < 1);
  assert.equal(result.days[0].season, 'Spring');
});

test('configuration errors fail early and disabled weather has zero planting risk', () => {
  assert.throws(() => createWeatherAPI({ config, overrides: { balance: { heatWattsPerDegree: NaN } } }));
  assert.throws(() => createWeatherAPI({ config, overrides: { calendar: { yearSols: 0 } } }));
  assert.throws(() => createWeatherAPI({ config, overrides: { events: [{ ...config.events[0], durationSols: [5, 1] }] } }));
  const api = createWeatherAPI({ config, overrides: { events: [] } });
  assert.equal(api.plantingAdvice(data.crops[0], api.current(input), 1000).regionalStormRisk, 0);
});

test('custom models, modified crop traits and game baseline loads are supported', () => {
  const models = { temperature: () => -40, solar: () => 0.8 };
  const api = createWeatherAPI({ config, models });
  models.temperature = () => 999;
  const weather = api.current(input);
  assert.equal(weather.outsideTempC, -40);
  assert.equal(weather.solarFactor, 0.8);
  const traits = { ...data.crops[0], ppf: 40, tempDayC: 25 };
  const demand = api.cropEffects(traits, weather, { basePowerW: 800, includedPpf: 28 });
  assert.equal(demand.totalW, 800 + 12 * 8 + 65 * 5);
  assert.equal(api.plantingAdvice(traits, weather, 900, { basePowerW: 800, includedPpf: 28 }).powerSufficientNow, false);
  assert.equal(api.advance(undefined, input).weather.outsideTempC, -40);
});

test('Red Harvest mapping preserves power, dust and greenhouse demand formulas', () => {
  const api = createRedHarvestWeather(data);
  const context = { ...input, sol: 1, events: [{ id: 'storm', endSol: 10, effects: { solarFactor: 0.4, heatingFactor: 1.5 } }] };
  const weather = api.current(context);
  const power = api.powerEffects({ weather, ratedW: 3000, dust: 0.1, advanceDust: true });
  assert.equal(power.dust, 0.1 + data.balance.solarDustLoss * data.balance.stormDustMultiplier);
  assert.equal(power.generationW, 3000 * weather.solarFactor * (1 - power.dust));
  const wheat = data.crops.find(crop => crop.id === 'wheat');
  const load = api.cropEffects(wheat, weather, { basePowerW: 800, includedPpf: 28 });
  assert.equal(load.totalW, 800 + (wheat.ppf - 28) * data.balance.wheatExtraWattsPerPpf +
    (wheat.tempDayC - weather.outsideTempC) * data.balance.heatWattsPerDegree * 1.5);
  const custom = createRedHarvestWeather(data, { overrides: { temperatureModel: { baseC: -90 } } });
  assert.ok(custom.current(input).outsideTempC < weather.outsideTempC);
});

test('live game forecast and effect queries leave RNG, resources and future play unchanged', () => {
  const options = { difficulty: 'easy', siteId: 'gale', demo: true };
  const sim = new Simulation(data, options);
  const reference = new Simulation(data, options);
  const snapshot = JSON.stringify(sim.state);
  assert.equal(sim.weather.version, 1);
  assert.equal(sim.forecastWeather(30).days.length, 30);
  assert.equal(JSON.stringify(sim.state), snapshot);
  sim.getWeather().active.push({ id: 'fake' });
  for (let day = 0; day < 30; day++) {
    sim.forecastWeather(7);
    sim.step();
    reference.step();
  }
  assert.deepEqual(sim.state, reference.state);
  assert.equal(sim.command({ type: 'triggerEvent', id: 'cold' }).ok, true);
  assert.equal(sim.getWeather().heatingFactor, 1.5);
  assert.equal(sim.forecastWeather(6).days.at(-1).heatingFactor, 1);
});

test('stored weather forecast matches live weather over multiple seeds without query side effects', () => {
  const cold = read('demo-events').find(event => event.id === 'cold');
  const storm = read('demo-events').find(event => event.id === 'dustRegional');
  const spaceWeather = read('demo-events').find(event => event.id === 'spe');
  const scenario = { ...data, events: [
    { ...cold, baseChancePerSol: 0.18, durationSols: [2, 4] },
    { ...storm, baseChancePerSol: 0.12, durationSols: [2, 5] },
    { ...spaceWeather, baseChancePerSol: 0.08, durationSols: [2, 3] },
  ] };
  for (const seed of [7, 42, 2026]) {
    const sim = new Simulation(scenario, { difficulty: 'easy', siteId: 'gale', seed });
    for (let offset = 0; offset < 36 && sim.state.status === 'active'; offset++) {
      const before = JSON.stringify(sim.state);
      const forecast = sim.forecastWeather(15).days[0];
      assert.equal(JSON.stringify(sim.state), before, 'forecast query must be read-only');
      sim.step();
      const live = sim.getWeather();
      assert.equal(live.sol, forecast.sol);
      assert.equal(live.dustFactor, forecast.dustFactor, `dust mismatch for seed ${seed}, sol ${live.sol}`);
      assert.equal(live.heatingFactor, forecast.heatingFactor, `cold mismatch for seed ${seed}, sol ${live.sol}`);
      assert.equal(live.commsFactor, forecast.commsFactor);
    }
  }
});

test('rescue ration protection keeps pre-generated weather inactive until the first eligible sol', () => {
  const storm = read('demo-events').find(event => event.id === 'dustRegional');
  const scenario = { ...data, events: [{ ...storm, baseChancePerSol: 10, durationSols: [2, 2] }] };
  const sim = new Simulation(scenario, { difficulty: 'easy', siteId: 'gale', seed: 5, rescue: true });
  assert.equal(sim.forecastWeather(11).days.every(day => day.dustFactor === 1), true);
  for (let sol = 0; sol < data.balance.rescue.rationSols; sol++) sim.step();
  assert.equal(sim.state.events.active.some(event => event.id === 'dustRegional'), false);
  sim.step();
  assert.equal(sim.state.events.active.some(event => event.id === 'dustRegional'), true);
});

test('live crop load consumes shared API outputs and changes when configured', () => {
  const sim = new Simulation({ ...data, events: [] }, {
    difficulty: 'easy', siteId: 'gale', weather: { overrides: { balance: { heatWattsPerDegree: 100 } } }
  });
  sim.command({ type: 'build', id: 'plot', x: 0, y: 0 });
  sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 });
  sim.step();
  assert.ok(sim.state.power.demand > 8000);
  assert.ok(sim.state.power.shed.includes(sim.state.crops[0].plotUid));
  assert.equal(sim.state.crops[0].growth, 0);
});
