// AI-assisted (Claude): forecast strip view-model cases for legacy events and archive conditions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createForecastViewModel, forecastDetailLines } from '../src/ui/colony/forecastViewModel.js';

const weather = (sol, active = [], overrides = {}) => ({ sol, active, dustFactor: 1,
  solarFactor: 0.8, heatingFactor: 1, outsideTempC: -42, ...overrides });

const quiet = { storm: null, haze: false, windy: false, cold: false, waterIceCloud: false, co2Cloud: false, fog: false,
  frost: null, surfaceFrost: null, overnightFrost: null, snow: null, dustDevil: false, dustSparks: false };
/** A day shaped like src/weather/archive.js output. */
const archived = (sol, primary, conditions = {}, overrides = {}) => weather(sol, [], {
  primary, conditions: { ...quiet, ...conditions }, atmosphereFactor: 0.92, solarFactor: 0.85, pressurePa: 640,
  windSpeedMs: 4.2, windPeakMs: 6.8, habitatHeatW: 30, iceDrillFactor: 0.97, airMinC: -80, airMaxC: -15, ...overrides });
const archiveBasis = 'Archived dust replay, OpenMARS meteorology, and known events';

test('forecast view model labels clear, dust, cold and combined weather with sol offsets', () => {
  const model = createForecastViewModel(weather(10), { basis: 'stored schedule', days: [
    weather(11, [{ id: 'dustRegional', name: 'Regional dust storm', effects: { solarFactor: 0.4 } }], { dustFactor: 0.4, solarFactor: 0.32 }),
    weather(12, [{ id: 'cold', name: 'Cold snap', effects: { heatFactor: 1.5 } }], { heatingFactor: 1.5 }),
    weather(13, [{ id: 'dustGlobal' }, { id: 'coldSnap' }], { dustFactor: 0.05, heatingFactor: 1.5 }),
  ] }, 10);
  assert.deepEqual(model.cells.map(({ slotLabel, id }) => [slotLabel, id]), [
    ['Now', 'clear'], ['+1', 'dustRegional'], ['+2', 'cold'], ['+3', 'storm-cold'],
  ]);
  assert.deepEqual(model.warning, { sol: 11, offset: 1 });
  assert.equal(model.cells[1].ariaLabel, 'Sol 11, Regional dust storm, 1 sol ahead');
  assert.equal(model.cells[2].label, 'Cold snap');
  assert.equal(model.basis, 'stored schedule');
});

test('forecast view model reads windSpeedMs and windPeakMs and does not mutate source snapshots', () => {
  const today = weather(5);
  const tomorrow = weather(6, [], { windSpeedMs: 3.2, windPeakMs: 7.5 });
  const calm = weather(7, [], { windSpeedMs: 2, windPeakMs: 2 });
  const legacy = weather(8, [], { windSpeedMps: 1.5 });
  const before = structuredClone([today, tomorrow, calm, legacy]);
  const model = createForecastViewModel(today, { days: [tomorrow, calm, legacy] }, 5);
  assert.equal(model.cells[0].windSpeedMs, undefined);
  assert.equal(model.cells[1].windSpeedMs, 3.2);
  assert.equal(model.cells[1].windPeakMs, 7.5);
  assert.equal(model.cells[2].windPeakMs, undefined, 'peak is only reported when it exceeds the mean');
  assert.equal(model.cells[3].windSpeedMs, 1.5, 'older snapshots with windSpeedMps still read');
  assert.deepEqual(forecastDetailLines(model.cells[1]).lines.find(({ key }) => key === 'Wind'),
    { key: 'Wind', value: '3.2 m/s, gusts 7.5 m/s' });
  assert.deepEqual([today, tomorrow, calm, legacy], before);
});

test('future event uncertainty stays neutral unless the weather API supplies a known event', () => {
  const projection = {
    basis: 'Seasonal model and known events; future random events are uncertain',
    days: [weather(21), weather(22, [{ id: 'dustRegional', name: 'Regional dust storm' }],
      { dustFactor: 0.4, solarFactor: 0.32 }), weather(23)],
  };
  const model = createForecastViewModel(weather(20), projection, 20);
  assert.equal(model.cells[1].tone, 'unknown');
  assert.equal(model.cells[2].id, 'dustRegional');
  assert.equal(model.cells[3].tone, 'unknown');
  assert.equal(model.chip.text, 'Dust storm in 2 sols · lasts 1 sol');
  assert.equal(model.basis, projection.basis);
});

test('archive conditions map to distinct tones instead of collapsing to Clear', () => {
  const days = [
    archived(31, 'Dust haze', { haze: true }, { dustOpticalDepth: 0.5 }),
    archived(32, 'Ice clouds', { waterIceCloud: true }),
    archived(33, 'Windy', { windy: true }, { windSpeedMs: 10.4, windPeakMs: 15.1 }),
    archived(34, 'Dust devil', { dustDevil: true, haze: true }),
    archived(35, 'Ice fog', { fog: true, overnightFrost: 'water', frost: 'water' }),
    archived(36, 'Water-ice snow', { snow: 'water' }),
    archived(37, 'Dry-ice snow', { snow: 'co2', cold: true }),
    archived(38, 'Severe cold', { cold: true }, { active: [{ id: 'coldSnap', name: 'Severe cold', archive: true }] }),
    archived(39, undefined, { haze: true }),
  ];
  const model = createForecastViewModel(archived(30, 'Clear'), { basis: archiveBasis, days }, 30);
  assert.deepEqual(model.cells.map(({ id, tone }) => `${id}:${tone}`), [
    'clear:clear', 'haze:haze', 'iceClouds:cloud', 'windy:wind', 'dustDevil:devil', 'iceFog:fog',
    'snowWater:snow', 'snowCo2:snow', 'cold:cold', 'haze:haze',
  ]);
  assert.equal(model.cells[1].label, 'Dust haze');
  assert.deepEqual(model.cells[4].secondary, ['Dust haze'], 'secondary daylight conditions are listed');
  assert.equal(model.chip.text, 'No storms in 9 sols');
});

test('overnight frost is flagged on the cell without changing the headline condition', () => {
  const model = createForecastViewModel(archived(40, 'Ice clouds', { waterIceCloud: true, overnightFrost: 'co2', frost: 'co2' }),
    { basis: archiveBasis, days: [archived(41, 'Clear')] }, 40);
  assert.equal(model.cells[0].tone, 'cloud');
  assert.equal(model.cells[0].overnightFrost, 'co2');
  assert.equal(model.cells[0].frostLabel, 'Overnight dry-ice frost');
  assert.equal(model.cells[1].overnightFrost, null);
  assert.equal(model.cells[1].frostLabel, null);
});

test('a local dust storm from the archive counts as a storm and the chip counts down to it', () => {
  const storm = { id: 'dustLocal', name: 'Local dust storm', startSol: 52, endSol: 56, archive: true,
    effects: { solarFactor: 0.7 } };
  const days = [archived(51, 'Windy', { windy: true }),
    archived(52, 'Local dust storm', { storm: 'dustLocal', haze: true }, { active: [storm], atmosphereFactor: 0.7 }),
    archived(53, 'Local dust storm', { storm: 'dustLocal', haze: true }, { active: [storm], atmosphereFactor: 0.5 })];
  const model = createForecastViewModel(archived(50, 'Clear'), { basis: archiveBasis, days }, 50);
  assert.equal(model.cells[2].tone, 'storm');
  assert.equal(model.cells[2].id, 'dustLocal');
  assert.equal(model.cells[2].intensity, 1);
  assert.equal(model.cells[3].intensity, 2, 'intensity rises as sunlight drops');
  assert.deepEqual(model.warning, { sol: 52, offset: 2 });
  assert.equal(model.chip.text, 'Local storm in 2 sols · lasts 4 sols', 'length comes from the event, not the visible window');
  assert.equal(model.chip.storm, true);
});

test('detail lines carry the archive readings and colony effects for the selected sol', () => {
  const model = createForecastViewModel(archived(60, 'Dust haze', { haze: true }, { outsideTempC: -51.6 }),
    { basis: archiveBasis, days: [] }, 60);
  const { lines, effects } = forecastDetailLines(model.cells[0]);
  assert.deepEqual(lines, [
    { key: 'Air', value: '-52 °C (-80 to -15)' },
    { key: 'Wind', value: '4.2 m/s, gusts 6.8 m/s' },
    { key: 'Pressure', value: '640 Pa' },
  ]);
  assert.deepEqual(effects, [
    { key: 'Sun', value: '92%' }, { key: 'Hab heat', value: '+30 W' }, { key: 'Ice yield', value: '97%' },
  ]);
});

test('solar particle events keep their own tone even on archive days', () => {
  const model = createForecastViewModel(archived(70, 'Clear', {}, { active: [{ id: 'spe', name: 'Solar particle event' }] }),
    { basis: archiveBasis, days: [] }, 70);
  assert.equal(model.cells[0].tone, 'space');
  assert.equal(model.cells[0].label, 'Solar particle event');
});
