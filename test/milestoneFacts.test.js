// AI-assisted (Cursor)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];

test('milestone facts include survival copy and NASA sources', () => {
  const milestones = data.facts.filter((fact) => fact.milestone);
  assert.ok(milestones.length >= 8);
  for (const fact of milestones) {
    assert.ok(fact.survival?.length > 20, fact.id);
    assert.ok(fact.source, fact.id);
    assert.ok(fact.title, fact.id);
  }
});

test('first plant emits a once-per-mission fact card', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale' });
  const cards = [];
  sim.on('fact:card', (card) => cards.push(card));
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'lettuce', x: 0, y: 0 }).ok, true);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].milestone, 'first_plant');
  assert.match(cards[0].survival, /ration|plant|calor/i);
  assert.equal(sim.command({ type: 'build', id: 'plot', x: 1, y: 0 }).ok, true);
  assert.equal(sim.command({ type: 'plant', id: 'radish', x: 1, y: 0 }).ok, true);
  assert.equal(cards.length, 1);
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
  assert.equal(sim.command({ type: 'wash', x: 1, y: 0 }).ok, true);
  sim.step();
  const soil = cards.find((card) => card.milestone === 'soil_treated');
  assert.ok(soil);
  assert.match(soil.survival, /wash|hydro|eat|discard/i);
  sim.step();
  assert.equal(cards.filter((card) => card.milestone === 'soil_treated').length, 1);
});
