// AI-assisted (Cursor Grok)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { drawMeal, pantryTotal } from '../src/sim/systems/nutrition.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations'].map((key) => [key, read(key)]));
data.events = [];

test('every crop has finite nutrition game values', () => {
  for (const crop of data.crops) {
    assert.ok(crop.nutrition, crop.id);
    assert.ok(Number.isFinite(crop.nutrition.kcal_per_kg) && crop.nutrition.kcal_per_kg > 0);
    assert.ok(Number.isFinite(crop.nutrition.protein_g_per_kg) && crop.nutrition.protein_g_per_kg > 0);
    assert.ok(Number.isFinite(crop.nutrition.micronutrient));
  }
});

test('harvest stores crop mass in the pantry', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale' });
  sim.command({ type: 'build', id: 'plot', x: 4, y: 4 });
  sim.command({ type: 'plant', id: 'lettuce', x: 4, y: 4 });
  const crop = sim.state.crops[0];
  crop.growth = 1;
  const before = sim.state.res.pantry.lettuce ?? 0;
  assert.equal(sim.command({ type: 'harvest', x: 4, y: 4 }).ok, true);
  assert.ok((sim.state.res.pantry.lettuce ?? 0) > before);
  assert.ok(Math.abs(sim.state.res.foodKg - pantryTotal(sim.state.res.pantry)) < 1e-9);
});

test('satiety falls when the pantry is empty and health declines', () => {
  const sim = new Simulation(data, { difficulty: 'medium', siteId: 'gale' });
  sim.state.res.pantry = {};
  sim.state.res.foodKg = 0;
  const health = sim.state.crew.health;
  sim.step();
  assert.equal(sim.state.crew.satiety, 0);
  assert.equal(sim.state.crew.nutrition, 0);
  assert.ok(sim.state.crew.health < health);
});

test('a calorie-and-protein mix scores higher nutrition than lettuce alone', () => {
  const need = data.balance.crew * data.balance.foodPerCrew;
  const leafy = {
    crew: { n: data.balance.crew },
    res: { pantry: { lettuce: need }, foodKg: need },
  };
  const mixed = {
    crew: { n: data.balance.crew },
    res: { pantry: { lettuce: need * 0.25, potato: need * 0.5, soybean: need * 0.25 }, foodKg: need },
  };
  const leafMeal = drawMeal(leafy, data, need);
  const mixMeal = drawMeal(mixed, data, need);
  assert.equal(leafMeal.satiety, 1);
  assert.equal(mixMeal.satiety, 1);
  assert.ok(mixMeal.nutrition > leafMeal.nutrition);
});

test('well-fed balanced meals recover health when life support is fine', () => {
  const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale' });
  sim.state.crew.health = 0.7;
  sim.state.res.pantry = {
    potato: 20,
    soybean: 10,
    tomato: 10,
    lettuce: 5,
  };
  sim.state.res.foodKg = pantryTotal(sim.state.res.pantry);
  for (const unit of sim.state.buildings) {
    if (unit.id === 'hab') unit.online = true;
  }
  sim.state.crew.hydrated = true;
  const before = sim.state.crew.health;
  // Skip water/power disruption: run only crew by stepping with plenty of resources
  for (let i = 0; i < 5; i++) sim.step();
  assert.ok(sim.state.crew.satiety > 0.9);
  assert.ok(sim.state.crew.nutrition >= data.balance.diet.wellFedNutrition
    || sim.state.crew.health >= before);
  assert.ok(sim.state.crew.health >= before);
});
