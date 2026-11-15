import test from 'node:test';
import assert from 'node:assert/strict';
import { createForecastViewModel } from '../src/ui/colony/forecastViewModel.js';

const weather = (sol, active = [], overrides = {}) => ({ sol, active, dustFactor: 1,
  solarFactor: 0.8, heatingFactor: 1, outsideTempC: -42, ...overrides });

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
  assert.equal(model.basis, 'stored schedule');
});

test('forecast view model carries optional wind only when present and does not mutate source snapshots', () => {
  const today = weather(5);
  const tomorrow = weather(6, [], { windSpeedMps: 3.2 });
  const before = structuredClone([today, tomorrow]);
  const model = createForecastViewModel(today, { days: [tomorrow] }, 5);
  assert.equal(model.cells[0].windSpeedMps, undefined);
  assert.equal(model.cells[1].windSpeedMps, 3.2);
  assert.deepEqual([today, tomorrow], before);
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
  assert.equal(model.chip.text, 'Sandstorm in 2 sols · lasts 1 sol');
  assert.equal(model.basis, projection.basis);
});
