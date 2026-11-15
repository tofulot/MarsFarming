// AI-assisted (Claude Code: comms dish repair, seed orders and supply crates; docs/DESIGN_HUD_COMMS.md WP-C)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Simulation } from '../src/sim/Simulation.js';
import { powerLoadSnapshot } from '../src/sim/powerLoads.js';
import { CRATE_MAX_DISTANCE, CRATE_MIN_DISTANCE } from '../src/sim/systems/supply.js';
import { selectColonyUiState } from '../src/ui/colony/selectors.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'mutations', 'soils'].map((key) => [key, read(key)]));
data.events = [];
const comms = data.balance.rescue.comms;

const rescueSim = (options = {}) => new Simulation(data, { siteId: 'gale', rescue: true, ...options });
const dish = (sim) => sim.state.buildings.find(({ id }) => id === 'comms');
const hab = (sim) => sim.state.buildings.find(({ id }) => id === 'hab');
function repaired(options) {
  const sim = rescueSim(options);
  sim.state.res.credits = comms.repairCost;
  assert.ok(sim.command({ type: 'repairComms' }).ok);
  return sim;
}
function stepUntil(sim, sol) { while (sim.state.sol < sol) sim.step(); }

test('the starter dish is broken in rescue mode: no power draw, no downlink, no orders', () => {
  const sim = rescueSim();
  const unit = dish(sim);
  assert.equal(unit.broken, true);
  assert.equal(unit.online, false);
  assert.equal(sim.state.comms.repaired, false);
  assert.deepEqual(sim.commsStatus(), { repaired: false, online: false, repairCost: comms.repairCost,
    capacityKg: comms.orderCapacityKg, order: null, solsRemaining: null, crate: null });
  assert.equal(sim.command({ type: 'orderSeeds', items: ['tomato'] }).reason, 'Repair the Comms Dish first.');
  assert.equal(sim.command({ type: 'demolish', uid: unit.uid }).ok, false);
  assert.match(sim.command({ type: 'build', id: 'comms', x: 15, y: 7 }).reason, /Phone Home/);
  sim.step();
  assert.equal(unit.online, false);
  assert.equal(unit.requestedW, 0);
  assert.equal(sim.state.power.comms, 0);
  assert.ok(!powerLoadSnapshot(sim.state, data).some(({ id }) => id === 'comms'));
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'comms', enabled: false }).ok, false);
  assert.equal(sim.unlockRequirement(sim.cropTraits('tomato')), 'a seed order from the Comms Dish');
  assert.equal(sim.unlockRequirement(sim.cropTraits('radish')), null);
  assert.ok(sim.seedCatalog().every(({ id, owned, orderable }) => owned === comms.starterSeeds.includes(id) && orderable === !owned));
});

test('repair is refused when short of build materials and brings the dish online at the full cost', () => {
  const sim = rescueSim();
  const events = [];
  sim.on('comms:repaired', (state) => events.push(state));
  sim.state.res.credits = comms.repairCost - 1;
  const short = sim.command({ type: 'repairComms' });
  assert.deepEqual(short, { ok: false, reason: `Not enough build materials — repair needs ${comms.repairCost} kg.` });
  assert.equal(sim.state.res.credits, comms.repairCost - 1);
  assert.equal(sim.state.comms.repaired, false);
  sim.state.res.credits = comms.repairCost;
  const demand = sim.state.power.demand;
  assert.deepEqual(sim.command({ type: 'repairComms' }), { ok: true, reason: 'Comms Dish repaired and online.' });
  assert.equal(sim.state.res.credits, 0);
  assert.equal(dish(sim).broken, false);
  assert.equal(dish(sim).online, true);
  assert.equal(sim.state.comms.repaired, true);
  assert.ok(sim.state.power.demand >= demand - data.buildings.find(({ id }) => id === 'comms').powerW);
  assert.ok(sim.state.power.comms > 0);
  assert.equal(sim.state.rescue.earned.phoneHome, 0);
  assert.equal(events.length, 1);
  assert.equal(sim.commsStatus().online, true);
  assert.equal(sim.command({ type: 'repairComms' }).ok, false);
  sim.step();
  assert.ok(sim.state.power.comms > 0);
  assert.ok(powerLoadSnapshot(sim.state, data).some(({ id }) => id === 'comms'));
});

test('orders are validated: capacity, owned seeds, power and one drop at a time', () => {
  const sim = repaired();
  const order = (items) => sim.command({ type: 'orderSeeds', items });
  assert.equal(order(['potato', 'wheat', 'soybean']).reason, `The order is over ${comms.orderCapacityKg} kg.`);
  assert.equal(order(['radish']).reason, 'You already have Radish seeds — replant from your harvest.');
  assert.equal(order([]).ok, false);
  assert.equal(order(['moonberry']).ok, false);
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'comms', enabled: false }).ok, true);
  assert.equal(order(['tomato']).reason, 'The Comms Dish needs power to send an order.');
  assert.equal(sim.command({ type: 'setLoadEnabled', id: 'comms', enabled: true }).ok, true);
  const placed = [];
  sim.on('supply:ordered', (entry) => placed.push(entry));
  sim.step();
  const result = order(['potato', 'wheat']);
  assert.ok(result.ok, result.reason);
  const expected = { items: ['potato', 'wheat'], massKg: Math.round((comms.packetKg.potato + comms.packetKg.wheat) * 1000) / 1000,
    placedSol: 1, arrivalSol: 1 + comms.deliverySols };
  assert.deepEqual(sim.state.comms.order, expected);
  assert.deepEqual(placed, [expected]);
  assert.equal(sim.commsStatus().solsRemaining, comms.deliverySols);
  const potato = sim.seedCatalog().find(({ id }) => id === 'potato');
  assert.deepEqual([potato.owned, potato.inFlight, potato.orderable], [false, true, false]);
  assert.equal(order(['tomato']).reason, 'A supply drop is already on its way.');
  assert.equal(sim.unlockRequirement(sim.cropTraits('potato')), 'a seed order from the Comms Dish');
});

test('a crate lands on the arrival sol on a legal tile, blocks building, and unlocks seeds when collected', () => {
  const sim = repaired({ difficulty: 'easy' });
  sim.state.rocket.status = 'burning'; // keep the wreck on the board for the tile check
  assert.ok(sim.command({ type: 'orderSeeds', items: ['tomato', 'soybean'] }).ok);
  // Transit is not interrupted when the dish loses power.
  assert.ok(sim.command({ type: 'setLoadEnabled', id: 'comms', enabled: false }).ok);
  const landed = [];
  const seeds = [];
  sim.on('supply:landed', (crate) => landed.push({ ...crate }));
  sim.on('supply:seeds', (drop) => seeds.push(drop));
  const { arrivalSol } = sim.state.comms.order;
  stepUntil(sim, arrivalSol - 1);
  assert.equal(sim.state.comms.crate, null);
  assert.equal(sim.commsStatus().solsRemaining, 1);
  sim.step();
  const { crate } = sim.state.comms;
  assert.ok(crate);
  assert.deepEqual(crate, { x: crate.x, y: crate.y, items: ['tomato', 'soybean'], landedSol: arrivalSol });
  assert.deepEqual(landed, [crate]);
  assert.equal(sim.state.comms.order, null);
  assert.deepEqual(seeds, [], 'seeds unlock on collection, not on landing');
  const { x, y } = crate;
  const ring = Math.max(Math.abs(x - hab(sim).x), Math.abs(y - hab(sim).y));
  assert.ok(ring >= CRATE_MIN_DISTANCE && ring <= CRATE_MAX_DISTANCE, `crate ${ring} tiles from the hab`);
  assert.ok(!sim.state.buildings.some((unit) => unit.x === x && unit.y === y));
  assert.ok(!sim.state.rocks.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0));
  assert.ok(!(sim.state.rocket.x === x && sim.state.rocket.y === y));
  assert.equal(sim.unlockRequirement(sim.cropTraits('tomato')), 'a seed order from the Comms Dish');

  sim.state.res.credits = 500;
  assert.equal(sim.command({ type: 'build', id: 'plot', x, y }).reason, 'Collect the supply crate first.');
  assert.ok(sim.command({ type: 'setLoadEnabled', id: 'comms', enabled: true }).ok);
  sim.step();
  assert.equal(sim.command({ type: 'orderSeeds', items: ['potato'] }).reason, 'Collect the supply crate first.');

  const credits = sim.state.res.credits;
  const collected = sim.command({ type: 'collectCrate' });
  assert.ok(collected.ok, collected.reason);
  assert.equal(sim.state.comms.crate, null);
  assert.deepEqual(sim.state.comms.delivered, ['tomato', 'soybean']);
  assert.deepEqual(seeds, [{ sol: sim.state.sol, crops: ['Tomato', 'Soybean'] }]);
  assert.ok(Object.hasOwn(sim.state.rescue.earned, 'delivery'));
  assert.equal(sim.state.res.credits, credits + 30);
  assert.ok(sim.state.decisions.some(({ text }) => text === 'Collected a supply crate.'));
  assert.equal(sim.command({ type: 'collectCrate' }).ok, false);
  assert.equal(sim.unlockRequirement(sim.cropTraits('tomato')), null);
  assert.equal(sim.command({ type: 'orderSeeds', items: ['tomato'] }).reason,
    'You already have Tomato seeds — replant from your harvest.');
  assert.ok(sim.command({ type: 'build', id: 'plot', x, y }).ok);
  sim.state.res.foodKg = sim.state.res.pantry.rations = 10; // the test never harvested, so top up the 0.2 kg planting cost
  const planted = sim.command({ type: 'plant', id: 'tomato', x, y });
  assert.ok(planted.ok, planted.reason);
  assert.ok(sim.command({ type: 'orderSeeds', items: ['potato'] }).ok);
});

test('crate placement is seeded and always legal across many missions', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const tiles = [];
    for (let run = 0; run < 2; run++) {
      const sim = repaired({ seed });
      assert.ok(sim.command({ type: 'orderSeeds', items: ['wheat'] }).ok);
      stepUntil(sim, sim.state.comms.order.arrivalSol);
      const { x, y } = sim.state.comms.crate;
      const ring = Math.max(Math.abs(x - hab(sim).x), Math.abs(y - hab(sim).y));
      assert.ok(ring >= CRATE_MIN_DISTANCE && ring <= CRATE_MAX_DISTANCE);
      assert.ok(!sim.state.buildings.some((unit) => unit.x === x && unit.y === y));
      assert.ok(!sim.state.rocks.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0));
      const { rocket } = sim.state;
      assert.ok(!(rocket && rocket.x === x && rocket.y === y && rocket.status !== 'scrapped'));
      tiles.push(`${x},${y}`);
    }
    assert.equal(tiles[0], tiles[1], `seed ${seed} places the crate deterministically`);
  }
});

test('extra Comms Dishes unlock with Phone Home and work at once', () => {
  const sim = repaired();
  sim.state.res.credits = 500;
  assert.ok(sim.command({ type: 'build', id: 'comms', x: 15, y: 7 }).ok);
  const built = sim.state.buildings.at(-1);
  assert.equal(built.broken, undefined);
  sim.step();
  assert.equal(sim.state.power.comms, 2 * data.balance.commsThroughput * (sim.state.weather.commsFactor ?? 1));
  assert.ok(sim.command({ type: 'demolish', uid: dish(sim).uid }).ok);
});

test('classic (non-rescue) missions keep a working dish and every crop', () => {
  const sim = new Simulation(data, { siteId: 'gale', difficulty: 'easy' });
  assert.equal(dish(sim).broken, undefined);
  assert.equal(sim.state.comms.repaired, true);
  assert.equal(sim.unlockRequirement(sim.cropTraits('tomato')), null);
  assert.ok(sim.seedCatalog().every(({ owned, orderable }) => owned && !orderable));
  assert.equal(sim.command({ type: 'repairComms' }).ok, false);
  assert.equal(sim.command({ type: 'orderSeeds', items: ['tomato'] }).ok, false);
  assert.ok(sim.command({ type: 'build', id: 'plot', x: 0, y: 0 }).ok);
  assert.ok(sim.command({ type: 'plant', id: 'wheat', x: 0, y: 0 }).ok);
  sim.step();
  assert.equal(dish(sim).online, true);
  assert.ok(sim.state.power.comms > 0);
  assert.ok(powerLoadSnapshot(sim.state, data).some(({ id }) => id === 'comms'));
});

test('the colony selector reports per-sol trends for the top bar', () => {
  const sim = rescueSim();
  const before = selectColonyUiState(sim, data).trends;
  assert.deepEqual(Object.keys(before), ['materialsPerSol', 'waterPerSol', 'foodRunsOutSol', 'powerSurplusW']);
  assert.equal(before.materialsPerSol, 0);
  assert.equal(before.foodRunsOutSol, data.balance.rescue.rationSols);
  assert.equal(before.waterPerSol, sim.state.water.production - sim.state.water.demand);
  assert.equal(before.powerSurplusW, sim.state.power.gen - sim.state.power.demand);
  assert.ok(sim.command({ type: 'build', id: 'plot', x: 15, y: 7 }).ok);
  const spent = 180 - sim.state.res.credits;
  sim.step();
  const after = selectColonyUiState(sim, data);
  assert.equal(after.trends.materialsPerSol, -spent);
  assert.ok(after.trends.waterPerSol < 0);
  assert.equal(after.trends.foodRunsOutSol, sim.state.sol + after.foodSols);
  sim.step();
  assert.equal(selectColonyUiState(sim, data).trends.materialsPerSol, 0);
  assert.ok(sim.state.history.length <= 8);
  assert.deepEqual(Object.keys(after).filter((key) => key !== 'trends').slice(0, 3), ['sol', 'season', 'rescueIn']);
});
