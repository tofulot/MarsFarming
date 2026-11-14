// AI-assisted (Cursor Grok)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { resolveChild } from '../src/sim/systems/mutations.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations'].map((key) => [key, read(key)]));
data.events = read('demo-events');
const quiet = { ...data, events: [] };

function mission(extra = {}) {
  return new Simulation(quiet, { difficulty: 'easy', siteId: 'gale', ...extra });
}

test('a berm lowers the crop dose counter', () => {
  const sim = mission();
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'berm', x: 1, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 5, y: 5 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', x: 5, y: 5 }).ok, true);
  sim.step();
  const covered = sim.state.crops.find((crop) => crop.plotUid === sim.state.buildings.find((unit) => unit.x === 0).uid);
  const open = sim.state.crops.find((crop) => crop.plotUid === sim.state.buildings.find((unit) => unit.x === 5).uid);
  const base = data.balance.crewRadiationPerSol;
  assert.equal(open.stress.dose_mSv, base);
  assert.equal(covered.stress.dose_mSv, base * data.mutations.bermDoseFactor);
});

test('generation advances only when seed is saved, and the next planting uses that child', () => {
  const sim = mission();
  const plot = { x: 5, y: 5 };
  sim.command({ type: 'build', id: 'plot', ...plot });
  sim.command({ type: 'plant', id: 'lettuce', ...plot });
  const parentId = sim.state.crops[0].lineageId;
  for (let sol = 0; sol < 30; sol++) sim.step();
  assert.equal(sim.state.lineages[parentId].generation, 1);
  sim.state.crops[0].growth = 1;
  const eaten = sim.command({ type: 'harvest', ...plot, saveSeed: false });
  assert.equal(eaten.ok, true);
  assert.equal(sim.state.seedVault.lettuce, undefined);
  assert.equal(sim.state.lineages[parentId].generation, 1);

  sim.command({ type: 'plant', id: 'lettuce', ...plot });
  const crop = sim.state.crops[0];
  crop.growth = 1;
  crop.health = 1;
  crop.stress.dose_mSv = 10;
  const before = sim.state.res.foodKg;
  const saved = sim.command({ type: 'harvest', ...plot, saveSeed: true });
  const firstGain = sim.state.res.foodKg - before;
  const child = sim.state.lineages[sim.state.seedVault.lettuce];
  assert.match(saved.reason, /generation 2/);
  assert.equal(sim.state.lineages[parentId].generation, 1);
  assert.equal(child.generation, 2);
  assert.ok(child.mods.yield < 1);
  for (let sol = 0; sol < 5; sol++) sim.step();
  assert.equal(child.generation, 2);

  sim.command({ type: 'plant', id: 'lettuce', ...plot });
  const next = sim.state.crops[0];
  assert.equal(next.lineageId, child.id);
  next.growth = 1;
  next.health = 1;
  next.stress = { dose_mSv: 0, lowPowerSols: 0, coldSols: 0, drySols: 0, perchlorateSols: 0 };
  const mid = sim.state.res.foodKg;
  sim.command({ type: 'harvest', ...plot, saveSeed: false });
  assert.ok(sim.state.res.foodKg - mid < firstGain);
  assert.equal(data.crops.find(({ id }) => id === 'lettuce').growthSols, 27);
});

test('mutation science points wait for the dish', () => {
  const forced = {
    ...quiet,
    mutations: { ...data.mutations, baseChancePerGeneration: 1, deleteriousFraction: 1, maxChance: 1 },
  };
  const sim = new Simulation(forced, { difficulty: 'easy', siteId: 'gale', manifest: { lab: 1 } });
  const plot = { x: 5, y: 5 };
  sim.command({ type: 'build', id: 'plot', ...plot });
  sim.command({ type: 'plant', id: 'lettuce', ...plot });
  const crop = sim.state.crops[0];
  crop.growth = 1;
  crop.stress.dose_mSv = 10;
  const lab = sim.state.buildings.find(({ id }) => id === 'lab');
  lab.online = true;
  lab.watered = true;
  const harvested = sim.command({ type: 'harvest', ...plot, saveSeed: true });
  assert.equal(harvested.ok, true);
  const key = Object.keys(sim.state.journal).find((entry) => entry.split(':').length === 3);
  assert.ok(key);
  assert.equal(sim.state.journal[key].transmitted, false);
  assert.equal(sim.state.res.sp, 0);
  for (let sol = 0; sol < 30 && !sim.state.journal[key].transmitted; sol++) sim.step();
  assert.equal(sim.state.journal[key].transmitted, true);
  assert.ok(sim.state.res.sp >= data.mutations.sciencePointsOnDownlink);
});

test('perchlorate tolerance keeps the plant growing and the harvest inedible', () => {
  const sim = mission();
  const plot = { x: 5, y: 5 };
  sim.command({ type: 'build', id: 'plot', ...plot });
  sim.command({ type: 'plant', id: 'lettuce', ...plot });
  const bare = sim.state.crops[0];
  const soil = sim.state.buildings.find(({ id }) => id === 'plot');
  soil.treated = false;
  const stalled = bare.growth;
  sim.step();
  assert.equal(bare.growth, stalled);

  sim.state.lineages[bare.lineageId].mods.perchlorate = 0.1;
  sim.step();
  assert.ok(bare.growth > stalled);
  bare.growth = 1;
  const food = sim.state.res.foodKg;
  const harvested = sim.command({ type: 'harvest', ...plot });
  assert.equal(harvested.ok, true);
  assert.match(harvested.reason, /unsafe/);
  assert.equal(sim.state.res.foodKg, food);
});

test('a shielded lineage takes a smaller particle-event hit', () => {
  const spe = { ...data.events.find(({ id }) => id === 'spe'), baseChancePerSol: 0 };
  const sim = new Simulation(
    { ...quiet, events: [spe] },
    { difficulty: 'medium', siteId: 'gale', demo: true, manifest: { washer: 1 } },
  );
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'washer', x: 1, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'wash', x: 1, y: 0 }).ok, true);
  sim.step();
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 }).ok, true);
  const crop = sim.state.crops[0];
  sim.state.lineages[crop.lineageId].mods.rad = 0.1;
  const before = crop.health;
  assert.equal(sim.command({ type: 'triggerEvent', id: 'spe' }).ok, true);
  const hit = spe.effects.unshieldedCropHealth * 0.9;
  assert.ok(Math.abs(before - crop.health - hit) < 1e-9);
});

test('repeated harmful alleles stay inside the clamps', () => {
  const state = {
    sol: 0,
    difficulty: 'hard',
    nextLineageId: 2,
    lineages: {},
    seedVault: {},
  };
  let parent = {
    id: 'L1', cropId: 'lettuce', generation: 1, parentId: null,
    mods: { ppf: 1, heat: 1, yield: 1, growth: 1, rad: 0, perchlorate: 0 }, log: [],
  };
  const crop = {
    health: 1,
    stress: { dose_mSv: 80, lowPowerSols: 0, coldSols: 0, drySols: 0, perchlorateSols: 0 },
  };
  const ctx = { state, data, random: () => 0 };
  for (let i = 0; i < 40; i++) parent = resolveChild(parent, crop, ctx);
  for (const [key, value] of Object.entries(parent.mods)) {
    const [lo, hi] = data.mutations.clamps[key];
    assert.ok(Number.isFinite(value) && value >= lo && value <= hi);
  }
  assert.equal(parent.mods.yield, data.mutations.clamps.yield[0]);
});
