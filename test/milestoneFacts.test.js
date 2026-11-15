// AI-assisted (Cursor)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  GAME_PROGRESS_FACTS, NASA_SOURCE_URLS, allProgressMilestones,
} from '../src/sim/data/gameProgressFacts.js';
import { Simulation } from '../src/sim/Simulation.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];

test('hard-coded progress facts cite NASA sources with survival copy', () => {
  const milestones = allProgressMilestones();
  assert.ok(milestones.length >= 20);
  for (const milestone of milestones) {
    const fact = GAME_PROGRESS_FACTS[milestone];
    assert.ok(fact.survival?.length > 20, milestone);
    assert.ok(fact.source, milestone);
    assert.ok(fact.title, milestone);
    assert.ok(fact.text?.length > 40, milestone);
    assert.ok(NASA_SOURCE_URLS[fact.source], `${milestone} unknown source ${fact.source}`);
    assert.equal(fact.url, NASA_SOURCE_URLS[fact.source]);
  }
});

test('click helper can pick a general space fact without a milestone id', async () => {
  const { pickSpaceFact } = await import('../src/ui/helperBotanist.js');
  const card = pickSpaceFact(data.facts, () => 0);
  assert.ok(card.text);
  assert.ok(card.source);
  assert.equal(data.facts.some((fact) => !fact.milestone && fact.text === card.text), true);
});

test('building a greenhouse and planting emit once-per-mission progress facts', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale' });
  const cards = [];
  sim.on('fact:card', (card) => cards.push(card));
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'first_plot'));
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'first_plant'));
  assert.ok(cards.some((card) => card.milestone === 'first_plant_lettuce'));
  assert.match(cards.find((card) => card.milestone === 'first_plant').survival, /ration|plant|calor/i);
  const before = cards.length;
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 1, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'radish', x: 1, y: 0 }).ok, true);
  assert.equal(cards.filter((card) => card.milestone === 'first_plant').length, 1);
  assert.ok(cards.some((card) => card.milestone === 'first_plant_radish'));
  assert.ok(cards.length > before);
});

test('first harvest unlocks general and crop-specific fact cards', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale' });
  const cards = [];
  sim.on('fact:card', (card) => cards.push(card));
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'radish', x: 0, y: 0 }).ok, true);
  sim.state.crops[0].growth = 1;
  assert.equal(sim.command({ type: 'harvest', x: 0, y: 0 }).ok, true);
  const milestones = new Set(cards.map((card) => card.milestone));
  assert.ok(milestones.has('first_plant'));
  assert.ok(milestones.has('first_harvest_radish'));
  assert.ok(milestones.has('first_harvest'));
});

test('treated soil reveals the perchlorate survival fact once', () => {
  const sim = new Simulation(data, {
    difficulty: 'medium', siteId: 'phoenix', manifest: { solar: 2, battery: 1 },
  });
  const cards = [];
  sim.on('fact:card', (card) => cards.push(card));
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'build', id: 'washer', x: 1, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'first_washer'));
  assert.equal(sim.command({ type: 'wash', x: 1, y: 0 }).ok, true);
  sim.step();
  const soil = cards.find((card) => card.milestone === 'soil_treated');
  assert.ok(soil);
  assert.match(soil.survival, /wash|hydro|eat|discard/i);
  sim.step();
  assert.equal(cards.filter((card) => card.milestone === 'soil_treated').length, 1);
});

test('major build milestones spout NASA-backed helper facts', () => {
  const sim = new Simulation(data, {
    difficulty: 'easy', siteId: 'gale', manifest: { solar: 2, battery: 1 },
  });
  const cards = [];
  sim.on('fact:card', (card) => cards.push(card));
  assert.equal(sim.command({ type: 'build', id: 'solar', x: 2, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'first_solar' && card.source === 'S8'));
  assert.equal(sim.command({ type: 'build', id: 'battery', x: 3, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'backup_power'));
  assert.equal(sim.command({ type: 'clean', x: 2, y: 0 }).ok, true);
  assert.ok(cards.some((card) => card.milestone === 'first_clean'));
});
