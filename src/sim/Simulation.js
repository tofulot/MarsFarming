// AI-assisted (OpenAI Codex)
import { createRedHarvestWeather, gameWeatherInput } from '../weather/redHarvest.js';
import { earnAdvancement } from './advancements.js';
import { createBus } from './bus.js';
import { checkManifest } from './design.js';
import { landingSite } from './marsMap.js';
import { mulberry32 } from './rng.js';
import { createState } from './state.js';
import { seasonSystem } from './systems/season.js';
import { eventSystem, startEvent } from './systems/events.js';
import { powerSystem } from './systems/power.js';
import { waterSystem } from './systems/water.js';
import { cropSolsRemaining, cropSystem, harvestCrop } from './systems/crops.js';
import { crewSystem } from './systems/crew.js';
import { economySystem } from './systems/economy.js';
import { rewardSystem } from './systems/rewards.js';

const ok = (reason) => ({ ok: true, reason });
const fail = (reason) => ({ ok: false, reason });
export const playbackSpeeds = [0, 1, 2, 4, 8];

export class Simulation {
  #ctx;
  #bus = createBus();
  #uid = 0;
  #demo;

  constructor(data, options = {}) {
    const { seed = 42, difficulty = 'medium', objectiveId = data.objectives[0].id,
      siteId = data.sites[0].id, landerId, manifest = {}, demo = false } = options;
    const mode = data.difficulty[difficulty];
    if (!mode || !data.objectives.some(({ id }) => id === objectiveId)) throw new Error('Invalid mission options.');
    const site = options.site
      ? landingSite(options.site.lat, options.site.lon, data['neutron-flux'])
      : data.sites.find(({ id }) => id === siteId);
    if (!site) throw new Error('Invalid landing site.');
    // Existing scripted missions can still supply a validated payload.
    const packed = landerId || Object.keys(manifest).length;
    const launch = packed
      ? checkManifest(data, { landerId: landerId ?? data.landers[0].id, items: manifest, budget: mode.budget, siteId })
      : { ok: true, cost: 0, massKg: 0 };
    if (!launch.ok) throw new Error(launch.reasons.join(' '));
    const state = createState(data, { seed, difficulty, objectiveId,
      siteId: options.site ? undefined : siteId, landerId, manifest }, launch);
    state.site = site;
    if (options.rescue) {
      const { arrivalSol, rationSols } = data.balance.rescue;
      state.rescue = { arrivalSol, colonyName: '', earned: {}, harvestedPlots: [], outcome: 'waiting' };
      state.solLimit = arrivalSol;
      state.crew.n = 1;
      state.res.foodKg = rationSols * data.balance.foodPerCrew;
    }
    this.#demo = demo;
    this.#ctx = {
      state, data, site, weather: createRedHarvestWeather(data), buildings: new Map(data.buildings.map((item) => [item.id, item])),
      crops: new Map(data.crops.map((item) => [item.id, item])),
      random: mulberry32(seed), emit: this.#bus.emit,
      near: (plot, id, predicate = () => true) => state.buildings.some((unit) =>
        unit.id === id && Math.abs(unit.x - plot.x) + Math.abs(unit.y - plot.y) === 1 && predicate(unit)),
    };
    for (const { id, x, y } of data.balance.starter) this.#place(id, x, y);
    if (packed) this.#unpack(manifest);
    seasonSystem(state, data, site);
    state.weather = this.getWeather();
    state.outsideTempC = state.weather.outsideTempC;
    state.power.clearSolarFactor = state.weather.clearSolarFactor;
    state.power.solarFactor = state.weather.solarFactor;
    state.power.gen = launch.startPower ?? state.buildings.reduce((total, unit) => {
      const power = this.#ctx.buildings.get(unit.id).powerW;
      const factor = unit.id === 'solar' ? state.power.clearSolarFactor : 1;
      return total + Math.max(0, power) * factor;
    }, 0);
    state.power.demand = state.buildings.reduce((load, unit) => {
      const model = this.#ctx.buildings.get(unit.id);
      return unit.id === 'washer' || model.plot ? load : load + Math.max(0, -model.powerW);
    }, 0);
    rewardSystem(this.#ctx);
    const location = options.site ? `${site.lat.toFixed(1)}°, ${site.lon.toFixed(1)}°` : site.name;
    this.#record(`Landed at ${location}.`, `Started surface operations with ${state.res.credits} credits.`);
  }

  #unpack(manifest) {
    const state = this.state;
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
  }

  get state() { return this.#ctx.state; }
  get weather() { return this.#ctx.weather; }
  getWeather() { return this.weather.current(gameWeatherInput(this.#ctx)); }
  forecastWeather(sols = 7) { return this.weather.forecast(gameWeatherInput(this.#ctx), { sols }); }
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
    if (this.state.rescue && this.state.rescue.outcome === 'waiting') this.state.rescue.outcome = 'lost';
    this.#bus.emit('mission:end', this.state);
  }

  step() {
    const { state, data, site } = this.#ctx;
    if (state.status !== 'active') return state;
    state.sol++;
    seasonSystem(state, data, site);
    eventSystem(this.#ctx);
    state.weather = this.getWeather();
    state.outsideTempC = state.weather.outsideTempC;
    state.power.clearSolarFactor = state.weather.clearSolarFactor;
    powerSystem(this.#ctx);
    waterSystem(this.#ctx);
    if (state.rescue) {
      if (state.buildings.some(({ id, online }) => id === 'iceDrill' && online)) earnAdvancement(this.#ctx, 'water');
      if (state.buildings.some(({ id, treated }) => id === 'plot' && treated)) earnAdvancement(this.#ctx, 'soil');
    }
    cropSystem(this.#ctx);
    crewSystem(this.#ctx);
    economySystem(this.#ctx);
    rewardSystem(this.#ctx);
    this.#bus.emit('sol', state);
    if (!state.crew.health) this.#finish(state.rescue ? 'You died before rescue arrived.' : 'Crew health fell to zero.');
    else if (state.sol >= state.solLimit) {
      if (state.rescue) {
        state.rescue.outcome = 'rescued';
        earnAdvancement(this.#ctx, 'rescue');
        this.#finish('The rescue crew arrived and brought you home.');
      } else this.#finish('One Mars year completed.');
    }
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
        if (id === 'plot') {
          earnAdvancement(this.#ctx, 'greenhouse');
          if (state.difficulty === 'easy') earnAdvancement(this.#ctx, 'soil');
        }
        if (id === 'battery') earnAdvancement(this.#ctx, 'power');
        this.#record(`Built ${model.name}.`, model.why);
        this.#bus.emit('purchase', state);
        return ok(`Built ${model.name}.`);
      }
      case 'buySpares': {
        const parts = data.balance.kit.find(({ id }) => id === 'spares');
        if (state.res.credits < parts.cost) return fail('Insufficient credits for spare parts.');
        state.res.credits -= parts.cost;
        state.res.spares++;
        this.#record('Bought a spare part.');
        this.#bus.emit('purchase', state);
        return ok('Bought a spare part.');
      }
      case 'plant': {
        const traits = crops.get(id);
        if (!unit || !buildings.get(unit.id).plot || crop) return fail('Choose an empty greenhouse or hydroponic bay.');
        if (!traits || state.res.sp < traits.unlockSP) return fail('This crop is unavailable.');
        if (!unit.treated) return fail('Treat this plot with a Soil Washer before planting.');
        state.crops.push({ uid: ++this.#uid, plotUid: unit.uid, cropId: id, plantedSol: state.sol, health: 1, growth: 0 });
        if (state.rescue) {
          earnAdvancement(this.#ctx, 'greenhouse');
          earnAdvancement(this.#ctx, 'soil');
          earnAdvancement(this.#ctx, 'botanist');
        }
        const sols = cropSolsRemaining(traits, unit, data.balance);
        this.#record(`Planted ${traits.name}.`, `Requires ${sols} healthy sols to mature.`);
        return ok(`Planted ${traits.name}.`);
      }
      case 'harvest': {
        if (!crop || crop.growth < 1) return fail('The plot has no mature crop.');
        const result = harvestCrop(this.#ctx, crop, unit);
        earnAdvancement(this.#ctx, 'harvest');
        if (state.rescue && !state.rescue.harvestedPlots.includes(unit.uid)) {
          state.rescue.harvestedPlots.push(unit.uid);
          if (state.rescue.harvestedPlots.length >= 3) earnAdvancement(this.#ctx, 'farm');
        }
        this.#record(result, 'Harvest added food and research.');
        rewardSystem(this.#ctx);
        return ok(result);
      }
      case 'nameColony': {
        const rescue = state.rescue;
        if (!rescue || !Object.hasOwn(rescue.earned, 'botanist')) return fail('Plant your first crop to unlock colony naming.');
        const name = typeof cmd.name === 'string' ? cmd.name.trim() : '';
        if (!name || name.length > 28 || /[\u0000-\u001f\u007f]/.test(name)) return fail('Enter a colony name of 1–28 characters.');
        rescue.colonyName = name;
        this.#record(`Named the colony ${name}.`);
        return ok(`Colony named ${name}.`);
      }
      case 'wash':
        if (unit?.id !== 'washer') return fail('Select a Soil Washer.');
        if (unit.pending) return fail('A soil treatment batch is already queued.');
        if (!state.buildings.some((entry) => entry.id === 'plot' && !entry.treated)) return fail('No plots need treatment.');
        unit.pending = true;
        unit.washStatus = 'queued';
        this.#record('Started a soil treatment batch.', 'Requires power and water next sol.');
        return ok('Soil treatment takes 1 sol with power and water. Press +1 sol to run it now.');
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
        if (!playbackSpeeds.includes(cmd.speed)) return fail('Invalid playback speed.');
        state.speed = cmd.speed;
        return ok('Speed updated.');
      case 'triggerEvent':
        return this.#demo && startEvent(this.#ctx, id) ? ok('Demo event started.') : fail('Event unavailable.');
      case 'endMission':
        if (state.rescue) state.rescue.outcome = 'abandoned';
        this.#finish(state.rescue ? 'You ended the mission before rescue arrived.' : 'Mission ended by the player.');
        return ok('Report ready.');
      default:
        return fail('Unknown mission command.');
    }
  }
}
