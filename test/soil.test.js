// AI-assisted (Cursor)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import {
  createPlotSoil, resolveSoilProfile, soilYieldMultiplier, washPlotSoil,
} from '../src/sim/systems/soil.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];

test('each landing site maps to a NASA soil analog', () => {
  for (const site of data.sites) {
    const profile = resolveSoilProfile(site, data);
    assert.ok(profile, site.id);
    assert.equal(profile.id, site.soilProfileId);
    assert.ok(profile.perchlorate_wt_pct > data.soils.safePerchlorate_wt_pct);
    assert.ok(profile._src === 'S10' || profile._src === 'S28');
  }
});

test('freeform landings inherit the nearest site soil profile', () => {
  const nearPhoenix = resolveSoilProfile({ lat: 67, lon: -126 }, data);
  assert.equal(nearPhoenix.id, 'phoenix_hecht2009');
  const nearGale = resolveSoilProfile({ lat: -5, lon: 137 }, data);
  assert.equal(nearGale.id, 'gale_rocknest');
});

test('washer clears perchlorate and marks the plot treated', () => {
  const site = data.sites.find(({ id }) => id === 'phoenix');
  const plot = { id: 'plot', treated: false, soil: createPlotSoil(site, data) };
  assert.equal(plot.treated, false);
  assert.ok(plot.soil.perchlorate_wt_pct > data.soils.safePerchlorate_wt_pct);
  washPlotSoil(plot, data.soils);
  assert.equal(plot.treated, true);
  assert.ok(plot.soil.perchlorate_wt_pct <= data.soils.safePerchlorate_wt_pct);
});

test('fertilizer raises adjacent plot fertility and harvest yield', () => {
  const sim = new Simulation(data, { difficulty: 'medium', siteId: 'gale' });
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'fertilizer', x: 1, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'washer', x: 0, y: 1 }).ok, true);
  const plot = sim.state.buildings.find(({ id }) => id === 'plot');
  const before = plot.soil.fertility;
  assert.equal(sim.command({ type: 'wash', x: 0, y: 1 }).ok, true);
  sim.step();
  assert.equal(plot.treated, true);
  assert.ok(plot.soil.fertility > before);
  assert.equal(sim.command({ type: 'plant', id: 'radish', x: 0, y: 0 }).ok, true);
  for (let i = 0; i < 40; i++) sim.step();
  const fertilized = soilYieldMultiplier(plot, data, true);
  const bare = soilYieldMultiplier({ soil: { fertility: data.soils.profiles.find(({ id }) => id === 'gale_rocknest').fertility } }, data, false);
  assert.ok(fertilized > bare);
  const credits = sim.state.res.credits;
  assert.equal(sim.command({ type: 'harvest', x: 0, y: 0 }).ok, true);
  assert.ok(sim.state.res.credits > credits);
});

test('phoenix soil starts harder than gale soil', () => {
  const phoenix = createPlotSoil(data.sites.find(({ id }) => id === 'phoenix'), data);
  const gale = createPlotSoil(data.sites.find(({ id }) => id === 'gale'), data);
  assert.ok(phoenix.perchlorate_wt_pct > gale.perchlorate_wt_pct);
  assert.ok(phoenix.fertility < gale.fertility);
  assert.ok(soilYieldMultiplier({ soil: phoenix }, data, false)
    < soilYieldMultiplier({ soil: gale }, data, false));
});
