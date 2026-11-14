// AI-assisted (OpenAI Codex).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  seasonAt, solarAt, stepWeather, accumulatePanelDust, cleanPanel,
  panelOutputW, cropWeatherDemand, plantingAdvice
} from '../src/sim/systems/weather.mjs';

const config = JSON.parse(await readFile(new URL('../public/data/weather.json', import.meta.url)));
const site = { id: 'jezero', lat: 18.44 };
const input = (sol, extra = {}) => ({ sol, site, seed: 42, difficulty: 'medium', ...extra });
const noEvents = () => ({ ...structuredClone(config), events: [] });
function forced(id, difficulty = 'hard') {
  const data = structuredClone(config);
  data.events = data.events.filter(event => event.id === id);
  data.events[0].baseChancePerSol = 1;
  data.events[0].durationSols = [2, 2];
  data.events[0].maxPerMission = 1;
  data.difficulties[difficulty].eventMult = 1;
  return data;
}

test('season boundaries, year wrap and southern seasons match the source table', () => {
  for (const [sol, expected] of [[0, 0], [193.3, 90], [371.9, 180], [514.6, 270], [668.6, 0]]) {
    assert.ok(Math.abs(seasonAt(sol, 18.44, config).Ls - expected) < 1e-9);
  }
  assert.equal(seasonAt(0, -4.59, config).season, 'Autumn');
  assert.equal(seasonAt(0, 18.44, config).season, 'Spring');
});

test('solar proxy handles polar night and inverse-square orbital distance', () => {
  assert.equal(solarAt(270, 90, config), 0);
  assert.ok(solarAt(90, 90, config) > 0);
  const ratio = solarAt(251, 0, config) / solarAt(71, 0, config);
  assert.ok(Math.abs(ratio - 1.455) < 0.01);
});

test('669 sols for six site latitudes and all difficulties stay finite and replay exactly', () => {
  // Arcadia's latitude is an explicit test fixture until its site coordinates are chosen.
  for (const lat of [18.44, -4.59, 4.5, 48.27, 45, 68.22]) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      let weather;
      let restored;
      let dust = 0;
      for (let sol = 0; sol < 669; sol++) {
        const args = input(sol, { site: { id: String(lat), lat }, difficulty });
        const result = stepWeather(weather, args, config);
        const replay = stepWeather(restored, args, config);
        assert.deepEqual(result, replay);
        weather = result.weather;
        restored = JSON.parse(JSON.stringify(weather));
        dust = accumulatePanelDust(dust, config);
        for (const value of [weather.outsideTempC, weather.solarFactor,
          weather.heatingFactor, panelOutputW(3000, dust, weather)]) {
          assert.ok(Number.isFinite(value));
        }
        assert.ok(weather.solarFactor >= 0);
        assert.ok(dust >= 0 && dust <= 0.95);
        assert.ok((weather.counts.dustGlobal ?? 0) <= 1);
        assert.ok(weather.active.filter(event => event.group === 'dust').length <= 1);
      }
    }
  }
});

test('warning, exact duration, expiry, and duplicate calls are consistent', () => {
  const data = forced('dustRegional', 'easy');
  const first = stepWeather(undefined, input(0, { difficulty: 'easy' }), data);
  assert.equal(first.weather.dustFactor, 1);
  assert.equal(first.messages[0].type, 'weather:warning');
  const duplicate = stepWeather(first.weather, input(0, { difficulty: 'easy' }), data);
  assert.deepEqual(duplicate.messages, []);
  assert.deepEqual(first.weather, duplicate.weather);
  const second = stepWeather(first.weather, input(1, { difficulty: 'easy' }), data);
  assert.equal(second.weather.dustFactor, 0.4);
  assert.equal(second.messages[0].type, 'event:start');
  const third = stepWeather(second.weather, input(2, { difficulty: 'easy' }), data);
  assert.equal(third.weather.dustFactor, 0.4);
  const fourth = stepWeather(third.weather, input(3, { difficulty: 'easy' }), data);
  assert.equal(fourth.weather.dustFactor, 1);
  assert.equal(fourth.messages[0].type, 'event:end');
});

test('hard mode starts immediately and global storms occur at most once', () => {
  const data = forced('dustGlobal');
  let weather;
  let starts = 0;
  for (let sol = 0; sol < 20; sol++) {
    const result = stepWeather(weather, input(sol, { difficulty: 'hard' }), data);
    starts += result.messages.filter(message => message.type === 'event:start').length;
    weather = result.weather;
    if (sol === 0) assert.equal(weather.dustFactor, 0.05);
  }
  assert.equal(starts, 1);
});

test('cold raises heating only and weather leaves crop state to its owner', () => {
  const crop = Object.freeze({ ppf: 17, tempDayC: 23, growthSols: 27, health: 1 });
  const clear = stepWeather(undefined, input(0), noEvents()).weather;
  const cold = { ...clear, heatingFactor: 1.5 };
  const normalDemand = cropWeatherDemand(crop, clear, config);
  const coldDemand = cropWeatherDemand(crop, cold, config);
  assert.equal(coldDemand.lightW, normalDemand.lightW);
  assert.equal(coldDemand.heatW, normalDemand.heatW * 1.5);
  assert.equal(crop.health, 1);
  assert.throws(() => cropWeatherDemand({ ...crop, tempDayC: null }, clear, config));
});

test('dust persists after storms, cleaning restores output, other panel fields survive', () => {
  const weather = stepWeather(undefined, input(0), noEvents()).weather;
  const dust = accumulatePanelDust(0, config);
  assert.ok(Math.abs(dust - 0.003) < 1e-12);
  const panel = { uid: 'p1', dust, online: true };
  const cleaned = cleanPanel(panel);
  assert.equal(cleaned.uid, 'p1');
  assert.equal(cleaned.dust, 0);
  assert.equal(panel.dust, dust);
  assert.ok(panelOutputW(3000, cleaned.dust, weather) > panelOutputW(3000, dust, weather));
});

test('planting advice considers long crop exposure, year wrap and current power', () => {
  const weather = stepWeather(undefined, input(300), config).weather;
  const lettuce = { ppf: 17, tempDayC: 23, growthSols: 27 };
  const potato = { ppf: 28, tempDayC: 20, growthSols: 128 };
  const short = plantingAdvice(lettuce, weather, config, 1000);
  const long = plantingAdvice(potato, weather, config, 1000);
  assert.equal(short.stormSeasonSols, 0);
  assert.ok(long.stormSeasonSols > 0);
  assert.ok(long.regionalStormRisk > short.regionalStormRisk);
  assert.equal(plantingAdvice(lettuce, weather, config, 0).powerSufficientNow, false);
  const end = stepWeather(undefined, input(660), config).weather;
  const wrapped = plantingAdvice(lettuce, end, config, 1000);
  assert.ok(wrapped.stormSeasonSols > 0 && wrapped.stormSeasonSols < 27);
});

test('archived temperature input checks site and missing data; snapshots stay immutable', () => {
  const observation = {
    siteId: 'jezero', airTempMinC: -80, airTempMaxC: -20,
    sourceUrl: 'https://example.test/fixture', coverage: 'Synthetic test fixture'
  };
  const args = input(0, { observation });
  const first = stepWeather(undefined, args, config);
  assert.equal(first.weather.outsideTempC, -50);
  const before = JSON.stringify(first.weather);
  stepWeather(first.weather, input(1), config);
  assert.equal(JSON.stringify(first.weather), before);
  assert.throws(() => stepWeather(undefined, input(0, { observation: { ...observation, siteId: 'gale' } }), config));
  assert.throws(() => stepWeather(undefined, input(0, { observation: { ...observation, airTempMinC: null } }), config));
  assert.throws(() => stepWeather(first.weather, input(3), config));
  assert.throws(() => stepWeather(undefined, input(0, { site: { id: 'bad', lat: NaN } }), config));
  assert.throws(() => stepWeather(undefined, input(0, { difficulty: 'unknown' }), config));
});

test('adapter applies weather to README GameState once and supports old saves and clean command', async () => {
  const { applyWeather, cleanWeatherPanel } = await import('../src/sim/weatherAdapter.mjs');
  const state = {
    sol: 0, seed: 42, difficulty: 'medium', power: { gen: 123 },
    buildings: [{ uid: 'solar-1', id: 'solarArray' }, { uid: 'hab', id: 'habCore' }]
  };
  applyWeather(state, site, config);
  const snapshot = JSON.stringify(state);
  assert.deepEqual(applyWeather(state, site, config), []);
  assert.equal(JSON.stringify(state), snapshot);
  assert.ok(state.buildings[0].dust > 0);
  assert.equal(state.buildings[1].dust, undefined);
  assert.equal(state.power.gen, 123);
  assert.equal(state.power.solarFactor, state.weather.solarFactor);
  assert.equal(cleanWeatherPanel(state, 'hab').ok, false);
  assert.equal(cleanWeatherPanel(state, 'missing').ok, false);
  assert.equal(cleanWeatherPanel(state, 'solar-1').ok, true);
  assert.equal(state.buildings[0].dust, 0);
  state.sol++;
  state.buildings[0].dust = NaN;
  const before = structuredClone(state);
  assert.throws(() => applyWeather(state, site, config));
  assert.deepEqual(state, before);
  assert.equal(accumulatePanelDust(1, config), 1);
});

test('weather data retains source URLs, temporal coverage and numeric measurements', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/weather-observations.json', import.meta.url)));
  assert.equal(data.observations.length, 4);
  for (const observation of data.observations) {
    assert.match(observation.sourceUrl, /^https:\/\//);
    for (const value of Object.values(observation)) {
      assert.notEqual(value, null);
      if (typeof value === 'number') assert.ok(Number.isFinite(value));
    }
  }
  assert.equal(data.observations.find(item => item.id === 'jezero-meda-first-pressure').pressurePa, 718);
});
