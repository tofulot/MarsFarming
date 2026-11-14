// AI-assisted (OpenAI Codex)
import { createBus } from './bus.js';
import { checkManifest } from './design.js';
import { mulberry32 } from './rng.js';
import { createState } from './state.js';
import { seasonSystem } from './systems/season.js';
import { eventSystem, startEvent } from './systems/events.js';
import { powerSystem } from './systems/power.js';
import { waterSystem } from './systems/water.js';
import { cropSystem, harvestCrop, queueCrossDiscovery } from './systems/crops.js';
import {
  crossGenotypes, emptyStress, formatGenotype, lineageForPlant, storeCrossChild,
} from './systems/mutations.js';
import { crewSystem } from './systems/crew.js';
import { economySystem } from './systems/economy.js';
import { rewardSystem } from './systems/rewards.js';

const ok = (reason) => ({ ok: true, reason });
const fail = (reason) => ({ ok: false, reason });

export class Simulation {
  #ctx;
  #bus = createBus();
  #uid = 0;
  #demo;

  constructor(data, options = {}) {
    const { seed = 42, difficulty = 'medium', objectiveId = data.objectives[0].id,
      siteId = data.sites[0].id, landerId = data.landers[0].id, manifest = {}, demo = false } = options;
    const mode = data.difficulty[difficulty];
    if (!mode || !data.objectives.some(({ id }) => id === objectiveId)) throw new Error('Invalid mission options.');
    const launch = checkManifest(data, { landerId, items: manifest, budget: mode.budget, siteId });
    if (!launch.ok) throw new Error(launch.reasons.join(' '));
    const state = createState(data, { seed, difficulty, objectiveId, siteId, landerId, manifest }, launch);
    const site = data.sites.find(({ id }) => id === siteId);
    this.#demo = demo;
    this.#ctx = {
      state, data, site, buildings: new Map(data.buildings.map((item) => [item.id, item])),
      crops: new Map(data.crops.map((item) => [item.id, item])),
      random: mulberry32(seed), emit: this.#bus.emit,
      near: (plot, id, predicate = () => true) => state.buildings.some((unit) =>
        unit.id === id && Math.abs(unit.x - plot.x) + Math.abs(unit.y - plot.y) === 1 && predicate(unit)),
    };
    for (const { id, x, y } of data.balance.starter) this.#place(id, x, y);
    const open = [];
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        if (!state.buildings.some((unit) => unit.x === x && unit.y === y)) open.push({ x, y });
      }
    }
    open.sort((a, b) => Math.abs(a.x - 7) + Math.abs(a.y - 5) - Math.abs(b.x - 7) - Math.abs(b.y - 5));
    for (const [id, count] of Object.entries(manifest)) {
      if (!this.#ctx.buildings.has(id)) continue;
      for (let i = 0; i < count; i++) {
        const tile = open.shift();
        this.#place(id, tile.x, tile.y);
      }
    }
    seasonSystem(state, data, site);
    state.power.gen = launch.startPower;
    state.power.demand = state.buildings.reduce((load, unit) => {
      const model = this.#ctx.buildings.get(unit.id);
      return unit.id === 'washer' || model.plot ? load : load + Math.max(0, -model.powerW);
    }, 0);
    rewardSystem(this.#ctx);
    this.#record(`Landed at ${site.name} on ${data.landers.find(({ id }) => id === landerId).name}.`,
      `Packed ${launch.massKg} kg and kept ${state.res.credits} credits for surface operations.`);
  }

  get state() { return this.#ctx.state; }
  on(event, fn) { return this.#bus.on(event, fn); }
  off(event, fn) { this.#bus.off(event, fn); }

  #record(text, effect = '') {
    this.state.decisions.push({ sol: this.state.sol, text, effect });
  }

  #place(id, x, y) {
    const unit = { uid: ++this.#uid, id, x, y, online: true, dust: 0, watered: false,
      treated: id !== 'plot' || this.state.difficulty === 'easy' };
    this.state.buildings.push(unit);
    return unit;
  }

  #finish(reason) {
    this.state.endReason = reason;
    this.state.status = 'ended';
    this.#bus.emit('mission:end', this.state);
  }

  step() {
    const { state, data, site } = this.#ctx;
    if (state.status !== 'active') return state;
    state.sol++;
    seasonSystem(state, data, site);
    eventSystem(this.#ctx);
    powerSystem(this.#ctx);
    waterSystem(this.#ctx);
    cropSystem(this.#ctx);
    crewSystem(this.#ctx);
    economySystem(this.#ctx);
    rewardSystem(this.#ctx);
    this.#bus.emit('sol', state);
    if (!state.crew.health) this.#finish('Crew health fell to zero.');
    else if (state.sol >= state.solLimit) this.#finish('One Mars year completed.');
    return state;
  }

  command(cmd) {
    const { state, buildings, crops, data } = this.#ctx;
    if (state.status !== 'active') return fail('This mission has ended.');
    const { type, id, x, y } = cmd;
    const unit = state.buildings.find((entry) => cmd.uid != null ? entry.uid === cmd.uid : entry.x === x && entry.y === y);
    const crop = unit && state.crops.find(({ plotUid }) => plotUid === unit.uid);
    switch (type) {
      case 'build': {
        const model = buildings.get(id);
        if (!model || id === 'hab') return fail('Choose a buildable structure.');
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= state.grid.w ||
            y < 0 || y >= state.grid.h || state.buildings.some((entry) => entry.x === x && entry.y === y)) return fail('Choose an empty tile inside the colony.');
        if (state.res.sp < model.unlockSP) return fail(`Requires ${model.unlockSP} science points.`);
        if (state.res.credits < model.cost) return fail('Insufficient credits.');
        state.res.credits -= model.cost;
        this.#place(id, x, y);
        this.#record(`Built ${model.name}.`, model.why);
        return ok(`Built ${model.name}.`);
      }
      case 'plant': {
        const traits = crops.get(id);
        if (!unit || !buildings.get(unit.id).plot || crop) return fail('Choose an empty greenhouse or hydroponic bay.');
        if (!traits || state.res.sp < traits.unlockSP) return fail('This crop is unavailable.');
        if (!unit.treated) return fail('Treat this plot with a Soil Washer before planting.');
        const lineage = data.mutations ? lineageForPlant(state, id, data.mutations) : null;
        state.crops.push({
          uid: ++this.#uid, plotUid: unit.uid, cropId: id, plantedSol: state.sol, health: 1, growth: 0,
          ...(lineage ? { lineageId: lineage.id, stress: emptyStress() } : {}),
        });
        this.#record(`Planted ${traits.name}.`, `Requires around ${traits.growthSols} healthy sols to mature.`);
        return ok(`Planted ${traits.name}.`);
      }
      case 'harvest': {
        if (!crop || crop.growth < 1) return fail('The plot has no mature crop.');
        const result = harvestCrop(this.#ctx, crop, unit);
        this.#record(result, 'Harvest added food and research.');
        rewardSystem(this.#ctx);
        return ok(result);
      }
      case 'cross': {
        if (!data.mutations) return fail('Breeding is unavailable.');
        const mother = state.crops.find(({ uid }) => uid === cmd.motherUid);
        const father = state.crops.find(({ uid }) => uid === (cmd.fatherUid ?? cmd.motherUid));
        if (!mother || !father) return fail('Select two mature crops of the same kind.');
        if (mother.growth < 1 || father.growth < 1) return fail('Both parents must be mature.');
        if (mother.cropId !== father.cropId) return fail('Crosses require the same crop.');
        const motherPlot = state.buildings.find(({ uid }) => uid === mother.plotUid);
        const traits = crops.get(mother.cropId);
        const motherLine = state.lineages[mother.lineageId];
        const fatherLine = state.lineages[father.lineageId];
        if (!motherPlot || !traits || !motherLine || !fatherLine) return fail('Missing crop lineage.');
        const result = crossGenotypes(
          motherLine.genotype,
          fatherLine.genotype,
          mother.stress?.dose_mSv ?? 0,
          father.stress?.dose_mSv ?? 0,
          data.mutations,
          this.#ctx.random,
          state.difficulty,
        );
        const child = storeCrossChild(
          state, mother.cropId, motherLine.id, fatherLine.id, result, data.mutations, state.sol,
        );
        const lab = state.buildings.some((entry) => entry.id === 'lab' && entry.online && entry.watered);
        queueCrossDiscovery(this.#ctx, mother, traits, child, lab);
        state.crops = state.crops.filter(({ uid }) => uid !== mother.uid);
        const label = formatGenotype(child.genotype, data.mutations);
        const note = result.mutation
          ? ` New allele flip under dose (game).`
          : '';
        const text = `Crossed ${traits.name}. Seed vault holds generation ${child.generation}: ${label}.${note}`;
        this.#record(text, 'Mendelian cross; mother harvested for seed.');
        rewardSystem(this.#ctx);
        return ok(text);
      }
      case 'wash':
        if (unit?.id !== 'washer') return fail('Select a Soil Washer.');
        if (!state.buildings.some((entry) => entry.id === 'plot' && !entry.treated)) return fail('No plots need treatment.');
        unit.pending = true;
        this.#record('Started a soil treatment batch.', 'Requires power and water next sol.');
        return ok('Soil treatment queued.');
      case 'clean':
        if (unit?.id !== 'solar') return fail('Select a solar array.');
        unit.dust = 0;
        this.#record('Cleaned a solar array.', 'Removing dust restored panel output.');
        return ok('Panels cleaned.');
      case 'repair': {
        const failure = unit && state.events.active.find(({ targetUid }) => targetUid === unit.uid);
        if (!failure) return fail('Select failed equipment.');
        if (!state.res.spares) return fail('No spare parts. The equipment recovers when its outage expires.');
        state.res.spares--;
        state.events.active = state.events.active.filter((event) => event !== failure);
        this.#bus.emit('event:end', failure);
        this.#record('Repaired failed equipment.', 'Used one spare part.');
        return ok('Equipment repaired.');
      }
      case 'demolish':
        if (!unit || unit.id === 'hab') return fail('Choose a removable structure.');
        state.crops = state.crops.filter((entry) => entry.plotUid !== unit.uid);
        state.buildings = state.buildings.filter((entry) => entry.uid !== unit.uid);
        this.#record(`Removed ${buildings.get(unit.id).name}.`);
        return ok('Structure removed.');
      case 'setPriority':
        if (!Array.isArray(cmd.priority) || cmd.priority.some((key) => !buildings.has(key))) return fail('Invalid power priorities.');
        state.power.priority = [...new Set(cmd.priority)];
        this.#record('Changed load-shedding priorities.', 'Life support always gets first allocation.');
        return ok('Power priorities updated.');
      case 'setSpeed':
        if (![0, 1, 2, 4].includes(cmd.speed)) return fail('Invalid playback speed.');
        state.speed = cmd.speed;
        return ok('Speed updated.');
      case 'triggerEvent':
        return this.#demo && startEvent(this.#ctx, id) ? ok('Demo event started.') : fail('Event unavailable.');
      case 'endMission':
        this.#finish('Mission ended by the player.');
        return ok('Report ready.');
      default:
        return fail('Unknown mission command.');
    }
  }
}
