// AI-assisted (Cursor Grok)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import {
  crossGenotypes,
  formatGenotype,
  mutationChance,
  phenotype,
  wildGenotype,
} from '../src/sim/systems/mutations.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = read('demo-events');
const quiet = { ...data, events: [] };
const rules = data.mutations;

function mission(extra = {}) {
  return new Simulation(quiet, { difficulty: 'easy', siteId: 'gale', ...extra });
}

function seq(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('wild starter is recessive except growth GG', () => {
  const g = wildGenotype(rules);
  assert.deepEqual(g.rad, ['r', 'r']);
  assert.deepEqual(g.perchlorate, ['p', 'p']);
  assert.deepEqual(g.light, ['l', 'l']);
  assert.deepEqual(g.cold, ['c', 'c']);
  assert.deepEqual(g.yield, ['y', 'y']);
  assert.deepEqual(g.growth, ['G', 'G']);
  assert.equal(phenotype(g, rules).yield, 0.85);
  assert.equal(phenotype(g, rules).growth, 1);
  assert.equal(phenotype(g, rules).rad, 0);
});

test('incomplete dominance: Yy is intermediate yield', () => {
  const mid = { ...wildGenotype(rules), yield: ['Y', 'y'] };
  const high = { ...wildGenotype(rules), yield: ['Y', 'Y'] };
  const low = { ...wildGenotype(rules), yield: ['y', 'y'] };
  assert.equal(phenotype(mid, rules).yield, 1.1);
  assert.equal(phenotype(high, rules).yield, 1.5);
  assert.equal(phenotype(low, rules).yield, 0.85);
});

test('YY mother x yy father yields all Yy when mutation is off', () => {
  const mother = { ...wildGenotype(rules), yield: ['Y', 'Y'] };
  const father = { ...wildGenotype(rules), yield: ['y', 'y'] };
  const forced = {
    ...rules,
    baseMutationPerAllele: 0,
    maxMutationPerAllele: 0,
  };
  for (let i = 0; i < 20; i++) {
    const child = crossGenotypes(mother, father, 0, 0, forced, () => 0.99, 'medium');
    assert.deepEqual(child.genotype.yield, ['Y', 'y']);
    assert.equal(child.mutation, null);
    assert.equal(phenotype(child.genotype, rules).yield, 1.1);
  }
});

test('homozygous self-cross is stable with mutation off', () => {
  const parent = wildGenotype(rules);
  const forced = { ...rules, baseMutationPerAllele: 0, maxMutationPerAllele: 0 };
  const child = crossGenotypes(parent, parent, 0, 0, forced, () => 0.5, 'medium');
  assert.deepEqual(child.genotype, parent);
});

test('heterozygote self-cross can segregate under a forced RNG sequence', () => {
  const parent = { ...wildGenotype(rules), yield: ['Y', 'y'] };
  const forced = { ...rules, baseMutationPerAllele: 0, maxMutationPerAllele: 0 };
  // gamete() walks all loci (pick, mut) for the egg, then again for pollen.
  const rollsFor = (eggYieldPick, pollenYieldPick) => {
    const locus = (pick) => [pick, 1];
    const egg = [
      ...locus(0), ...locus(0), ...locus(0), ...locus(0),
      ...locus(eggYieldPick),
      ...locus(0),
    ];
    const pollen = [
      ...locus(0), ...locus(0), ...locus(0), ...locus(0),
      ...locus(pollenYieldPick),
      ...locus(0),
    ];
    return [...egg, ...pollen];
  };
  const yY = crossGenotypes(parent, parent, 0, 0, forced, seq(rollsFor(0, 0.9)), 'medium');
  assert.deepEqual(yY.genotype.yield, ['Y', 'y']);
  const YY = crossGenotypes(parent, parent, 0, 0, forced, seq(rollsFor(0, 0)), 'medium');
  assert.deepEqual(YY.genotype.yield, ['Y', 'Y']);
  const yy = crossGenotypes(parent, parent, 0, 0, forced, seq(rollsFor(0.9, 0.9)), 'medium');
  assert.deepEqual(yy.genotype.yield, ['y', 'y']);
});

test('dose raises gamete flip chance', () => {
  const low = mutationChance(0, rules, 'medium');
  const high = mutationChance(100, rules, 'medium');
  assert.ok(high > low);
  assert.ok(high <= rules.maxMutationPerAllele);
});

test('active solar particle weather multiplies allele-flip chance', () => {
  const quiet = mutationChance(20, rules, 'medium');
  const solar = mutationChance(20, rules, 'medium', { solarActive: true });
  assert.ok(solar > quiet);
  assert.ok(Math.abs(solar / quiet - rules.speMutationMult) < 1e-9
    || solar === rules.maxMutationPerAllele);
});

test('cross under SPE marks solarBoosted allele flips', () => {
  const parent = wildGenotype(rules);
  // random() always 0 → pick first allele and always flip (0 < chance).
  const result = crossGenotypes(parent, parent, 40, 40, rules, () => 0, 'hard', { solarActive: true });
  assert.ok(result.mutation);
  assert.equal(result.solarBoosted, true);
  assert.equal(result.mutation.solarBoosted, true);
  assert.ok(result.mutation.flips.length >= 1);
});

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

test('cross writes the seed vault and removes the mother; harvest does not', () => {
  const stable = {
    ...quiet,
    mutations: { ...rules, baseMutationPerAllele: 0, maxMutationPerAllele: 0 },
  };
  const sim = new Simulation(stable, { difficulty: 'easy', siteId: 'gale' });
  sim.command({ type: 'build', id: 'plot', x: 0, y: 0 });
  sim.command({ type: 'build', id: 'plot', x: 2, y: 0 });
  sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 });
  sim.command({ type: 'plant', id: 'lettuce', x: 2, y: 0 });
  const plot0 = sim.state.buildings.find((u) => u.x === 0);
  const plot2 = sim.state.buildings.find((u) => u.x === 2);
  const a = sim.state.crops.find((crop) => crop.plotUid === plot0.uid);
  const b = sim.state.crops.find((crop) => crop.plotUid === plot2.uid);
  a.growth = 1;
  b.growth = 1;
  const food = sim.state.res.foodKg;
  assert.equal(sim.command({ type: 'harvest', uid: plot0.uid }).ok, true);
  assert.ok(sim.state.res.foodKg > food);
  assert.equal(sim.state.seedVault.lettuce, undefined);

  sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 });
  const mother = sim.state.crops.find((crop) => crop.plotUid === plot0.uid);
  const father = sim.state.crops.find((crop) => crop.plotUid === plot2.uid);
  mother.growth = 1;
  father.growth = 1;
  const crossed = sim.command({ type: 'cross', motherUid: mother.uid, fatherUid: father.uid });
  assert.equal(crossed.ok, true);
  assert.ok(sim.state.seedVault.lettuce);
  assert.equal(sim.state.crops.some((crop) => crop.uid === mother.uid), false);
  assert.equal(sim.state.crops.some((crop) => crop.uid === father.uid), true);
  const child = sim.state.lineages[sim.state.seedVault.lettuce];
  assert.equal(child.generation, 2);
  assert.equal(formatGenotype(child.genotype, rules).includes('GG'), true);

  sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 });
  const replanted = sim.state.crops.find((crop) => crop.plotUid === plot0.uid);
  assert.equal(replanted.lineageId, child.id);
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

  sim.state.lineages[bare.lineageId].genotype.perchlorate = ['P', 'p'];
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
  sim.state.lineages[crop.lineageId].genotype.rad = ['R', 'r'];
  const before = crop.health;
  assert.equal(sim.command({ type: 'triggerEvent', id: 'spe' }).ok, true);
  const hit = spe.effects.unshieldedCropHealth * (1 - 0.6);
  assert.ok(Math.abs(before - crop.health - hit) < 1e-9);
});

test('forced allele flip is recorded on the child lineage', () => {
  const sim = mission({ manifest: { lab: 1 } });
  sim.command({ type: 'build', id: 'plot', x: 3, y: 3 });
  sim.command({ type: 'plant', id: 'lettuce', x: 3, y: 3 });
  const crop = sim.state.crops[0];
  crop.growth = 1;
  crop.stress.dose_mSv = 200;
  const lab = sim.state.buildings.find(({ id }) => id === 'lab');
  if (lab) {
    lab.online = true;
    lab.watered = true;
  }
  // Patch random to force mutations: always pick allele 0, always flip.
  const original = sim._ctx?.random;
  void original;
  // Access private random via successive crosses with high dose rules.
  const hot = {
    ...quiet,
    mutations: {
      ...rules,
      baseMutationPerAllele: 1,
      maxMutationPerAllele: 1,
      difficultyMult: { easy: 1, medium: 1, hard: 1 },
    },
  };
  const hotSim = new Simulation(hot, { difficulty: 'easy', siteId: 'gale' });
  hotSim.command({ type: 'build', id: 'plot', x: 1, y: 1 });
  hotSim.command({ type: 'plant', id: 'lettuce', x: 1, y: 1 });
  const plant = hotSim.state.crops[0];
  plant.growth = 1;
  plant.stress.dose_mSv = 0;
  const result = hotSim.command({ type: 'cross', motherUid: plant.uid, fatherUid: plant.uid });
  assert.equal(result.ok, true);
  const child = hotSim.state.lineages[hotSim.state.seedVault.lettuce];
  assert.ok(child.mutation);
  assert.ok(child.mutation.flips.length > 0);
});
