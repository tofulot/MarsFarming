import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { Simulation } from '../src/sim/Simulation.js';
import { landingCalendarSol } from '../src/sim/insolation.js';
import { mulberry32 } from '../src/sim/rng.js';
import { readWeatherArchive } from '../src/weather/archive.js';
import { gameEvents } from '../src/weather/redHarvest.js';

const file = (name) => readFileSync(new URL(`../public/data/${name}`, import.meta.url));
const read = (name) => JSON.parse(file(`${name}.json`));
const index = read('mars/weather-archive');
const bytes = Uint8Array.from(gunzipSync(file('mars/weather-archive.bin.gz'))).buffer;
const weatherArchive = readWeatherArchive(index, bytes);
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty', 'landers', 'objectives',
  'facts', 'balance', 'mutations', 'soils', 'weather'].map((key) => [key, read(key)]));
data.weatherArchive = weatherArchive;
data.events = gameEvents(data.weather, read('demo-events'));
data['neutron-flux'] = read('mars/neutron-flux');

function seedFor(year) {
  for (let seed = 0; ; seed++) {
    if (25 + Math.floor(mulberry32(seed)() * 12) === year) return seed;
  }
}

test('the archive contains complete seasonal dust coverage and three planet-encircling event years', () => {
  const dust = weatherArchive.dustProfile({ lat: -5, lon: 140 });
  assert.throws(() => readWeatherArchive(index, new ArrayBuffer(0)), /archive version or length/);
  assert.deepEqual(index.dust.years.map(({ year }) => year), Array.from({ length: 12 }, (_, i) => i + 25));
  assert.ok(index.dust.years.every(({ angles }) => angles.length >= 668));
  const global = index.dust.years.filter(({ year }) =>
    Array.from({ length: 360 }, (_, Ls) => dust(year - 25, Ls)).some(({ storm }) => storm === 'dustGlobal'));
  assert.deepEqual(global.map(({ year }) => year), [25, 28, 34]);
  assert.ok(index.validation.mdadMY30.overlap > 0);
  // MY34 source CDOD at Ls 204.96652°, interpolated from its four adjacent 3° cells.
  assert.ok(Math.abs(dust(9, 205).dustOpticalDepth - 2.6 * 1.99554) < 0.003);
  assert.deepEqual(weatherArchive.dustProfile({ lat: 15, lon: -180 })(5, 187),
    weatherArchive.dustProfile({ lat: 15, lon: 180 })(5, 187));
  const gale = data.sites.find(({ id }) => id === 'gale');
  const other = weatherArchive.dustProfile({ lat: gale.lat, lon: -68 });
  assert.ok(Array.from({ length: 360 }, (_, Ls) => [dust(11, Ls).storm, other(11, Ls).storm])
    .some(([local, distant]) => ['dustLocal', 'dustRegional'].includes(local) && !distant));
});

test('current and forecast provide the same weather across a calendar wrap without advancing play', () => {
  const seed = seedFor(36);
  const sim = new Simulation({ ...data, events: [] }, { seed, siteId: 'gale', landingLs: 270 });
  assert.equal(sim.state.Ls, 270);
  assert.equal(sim.getWeather().archiveYear, 36);
  const wrapSol = Math.ceil(data.seasons.yearSols - landingCalendarSol(270, data.seasons));
  sim.state.sol = wrapSol - 2;
  sim.step();
  const before = structuredClone(sim.state);
  const forecast = sim.forecastWeather(15);
  assert.equal(forecast.days[0].archiveYear, 25);
  assert.ok(forecast.days[0].Ls < 1);
  assert.deepEqual(sim.state, before);
  forecast.days[0].conditions.storm = 'test';
  assert.notEqual(sim.forecastWeather(1).days[0].conditions.storm, 'test');
  for (const day of sim.forecastWeather(15).days) {
    sim.step();
    assert.deepEqual(sim.getWeather(), day);
  }
});

test('the forecast exposes recognized event IDs, measured fields and difficulty effects', () => {
  const options = { seed: seedFor(34), siteId: 'gale', landingLs: 180 };
  const easy = new Simulation(data, { ...options, difficulty: 'easy' });
  const medium = new Simulation(data, { ...options, difficulty: 'medium' });
  const hard = new Simulation(data, { ...options, difficulty: 'hard' });
  const outlook = [easy, medium, hard].map((sim) => sim.forecastWeather(60).days);
  const stormIndex = outlook[1].findIndex(({ active }) => active.some(({ id }) => id === 'dustGlobal'));
  assert.ok(stormIndex >= 0);
  const [mild, normal, harsh] = outlook.map((days) => days[stormIndex]);
  assert.equal(normal.conditions.storm, 'dustGlobal');
  assert.equal(normal.active.find(({ id }) => id === 'dustGlobal').startSol, normal.sol);
  assert.equal(normal.dustOpticalDepth, harsh.dustOpticalDepth);
  assert.ok(mild.atmosphereFactor >= normal.atmosphereFactor && normal.atmosphereFactor >= harsh.atmosphereFactor);
  assert.ok(normal.atmosphereFactor >= 0.55 && normal.atmosphereFactor < 1);
  assert.ok(normal.airMinC < normal.outsideTempC && normal.outsideTempC < normal.airMaxC);
  assert.ok(normal.pressurePa > 400 && normal.pressurePa < 1000);
  assert.ok(normal.windSpeedMs >= Math.hypot(normal.windEastMs, normal.windNorthMs) - 0.15);
  assert.ok(normal.habitatHeatW >= 0 && normal.iceDrillFactor >= 0.8);
});

test('snow follows its observed latitude and season constraints', () => {
  const south = new Simulation(data, { site: { lat: -78, lon: 0 }, landingLs: 90 });
  const north = new Simulation(data, { siteId: 'phoenix', landingLs: 90 });
  const equator = new Simulation(data, { siteId: 'gale', landingLs: 90 });
  const snow = (sim) => sim.forecastWeather(120).days.filter(({ conditions }) => conditions.snow);
  assert.ok(snow(south).some(({ conditions }) => conditions.snow === 'co2'));
  assert.ok(snow(north).some(({ conditions }) => conditions.snow === 'water'));
  assert.ok(snow(north).every(({ conditions, Ls }) => conditions.snow === 'water' && Ls >= 110 && Ls < 150));
  assert.deepEqual(snow(equator), []);
});

test('a powered, watered greenhouse keeps growing through global dust', () => {
  const options = { seed: seedFor(34), siteId: 'gale', landingLs: 180, difficulty: 'easy', demo: true, landerId: 'condor',
    manifest: { nuclear: 1, iceDrill: 1, battery: 1 } };
  const sim = new Simulation({ ...data, events: data.events.filter(({ id }) => id === 'dustRegional') }, options);
  assert.ok(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok);
  assert.ok(sim.command({ type: 'plant', id: 'radish', x: 0, y: 0 }).ok);
  const panel = sim.state.buildings.find(({ id }) => id === 'solar');
  for (let i = 0; i < 50; i++) {
    sim.step();
    if (sim.state.weather.conditions.storm === 'dustGlobal') break;
  }
  const { weather, water, crops, power, events } = sim.state;
  assert.equal(weather.conditions.storm, 'dustGlobal');
  assert.ok(events.active.some(({ id, archive }) => id === 'dustGlobal' && archive));
  assert.ok(Math.abs(water.production - 13.2 * weather.iceDrillFactor) < 1e-9);
  assert.ok(crops[0].growth > 0 && crops[0].health === 1);
  assert.deepEqual(power.shed, []);
  assert.ok(panel.dust > 0);
  assert.ok(sim.command({ type: 'clean', uid: panel.uid }).ok);
  assert.equal(panel.dust, 0);
});

test('storm power priorities and batteries let the player protect water and crop growth', () => {
  const setup = (priority, batteryWh = 0) => {
    const sim = new Simulation({ ...data, events: [] }, {
      siteId: 'gale', seed: seedFor(34), landingLs: 180, landerId: 'condor',
      manifest: { battery: 2, iceDrill: 1, hydroponic: 1 },
    });
    const plot = sim.state.buildings.find(({ id }) => id === 'hydroponic');
    assert.ok(sim.command({ type: 'plant', uid: plot.uid, id: 'radish' }).ok);
    const day = sim.forecastWeather(105).days.find(({ atmosphereFactor, conditions }) =>
      conditions.storm === 'dustGlobal' && atmosphereFactor <= 0.56);
    assert.ok(day);
    sim.state.sol = day.sol - 1;
    sim.state.res.batteryWh = batteryWh;
    assert.ok(sim.command({ type: 'setPriority', priority }).ok);
    sim.step();
    const drill = sim.state.buildings.find(({ id }) => id === 'iceDrill');
    return { sim, farm: plot.online, water: drill.online };
  };

  const prioritizeWater = setup(['iceDrill', 'hydroponic']);
  const prioritizeFarm = setup(['hydroponic', 'iceDrill']);
  assert.equal(prioritizeWater.water, true);
  assert.equal(prioritizeWater.farm, false);
  assert.equal(prioritizeFarm.water, false);
  assert.equal(prioritizeFarm.farm, true);
  const charge = 40000;
  const withStorage = setup(['iceDrill', 'hydroponic'], charge);
  assert.ok(withStorage.water && withStorage.farm);
  assert.ok(withStorage.sim.state.res.batteryWh < charge);
});

test('a powered drill recovers yield as seasonal cold lifts', () => {
  const sim = new Simulation({ ...data, events: [] }, {
    siteId: 'phoenix', landingLs: 270, landerId: 'condor', manifest: { nuclear: 1, iceDrill: 1 },
  });
  sim.step();
  const coldWater = sim.state.water.production;
  const coldHeat = sim.state.weather.habitatHeatW;
  assert.ok(coldWater >= 48 && coldWater < 60);
  assert.ok(coldHeat > 0);
  const nextSummer = data.seasons.yearSols + landingCalendarSol(90, data.seasons) - landingCalendarSol(270, data.seasons);
  sim.state.sol = Math.floor(nextSummer) - 1;
  sim.step();
  assert.ok(sim.state.water.production > coldWater);
  assert.ok(sim.state.weather.habitatHeatW < coldHeat);
});

test('the Gale quick-start can harvest and complete its full 120-sol rescue with archived weather', () => {
  const quiet = { ...data, events: [] };
  for (const { year } of index.dust.years) {
    const sim = new Simulation(quiet, { seed: seedFor(year), siteId: 'gale', rescue: true });
    const plots = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const build = (id, x, y) => assert.ok(sim.command({ type: 'build', id, x, y }).ok, `${year}: ${id}`);
    const plant = (plot) => assert.ok(sim.command({ type: 'plant', id: 'radish', ...plot }).ok, `${year}: plant`);
    for (const { x, y } of plots) build('plot', x, y);
    build('washer', 0, 1);
    sim.step();
    for (const plot of plots) plant(plot);
    while (sim.state.status === 'active') {
      sim.step();
      if (sim.state.status !== 'active') break;
      for (const plot of plots) {
        if (sim.command({ type: 'harvest', ...plot }).ok) plant(plot);
      }
      if (sim.state.rescue.earned.repeatHarvest === sim.state.sol) {
        build('iceDrill', 2, 0);
        build('solar', 3, 0);
      }
    }
    const firstHarvest = sim.state.rescue.earned.harvest;
    assert.ok(firstHarvest <= 11, `${year}: first harvest at ${firstHarvest}`);
    assert.equal(sim.state.rescue.outcome, 'rescued', `${year}: ${sim.state.endReason}`);
    assert.equal(sim.state.sol, 120);
  }
});
