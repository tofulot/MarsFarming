// AI-assisted (OpenAI Codex; comms dish seed orders and supply crates by Claude Code)
import { createRedHarvestWeather, gameWeatherInput } from '../weather/redHarvest.js';
import { earnAdvancement, missingAdvancement } from './advancements.js';
import { createBus } from './bus.js';
import { checkManifest } from './design.js';
import { landingCalendarSol, solarLongitude } from './insolation.js';
import { landingSite } from './marsMap.js';
import { mulberry32 } from './rng.js';
import { createState } from './state.js';
import { seasonSystem } from './systems/season.js';
import { eventSystem, forecastDustEvents, startEvent, syncArchivedStorms } from './systems/events.js';
import { powerSystem } from './systems/power.js';
import { queueSoilWashing, waterSupply, waterSystem } from './systems/water.js';
import {
  cropSolsRemaining, cropSystem, expectedFoodPerSol, harvestCrop, harvestPreview, queueCrossDiscovery,
} from './systems/crops.js';
import {
  crossGenotypes, describeGenetics, emptyStress, formatGenotype, lineageForPlant, storeCrossChild,
} from './systems/mutations.js';
import { createPlotSoil, fertilizeAdjacentPlots } from './systems/soil.js';
import { crewSystem } from './systems/crew.js';
import { economySystem } from './systems/economy.js';
import { rewardSystem } from './systems/rewards.js';
import { placeSurfaceMaterials } from './systems/surfaceMaterials.js';
import { powerLoadGroupFor } from './powerLoads.js';
import { removeFromPantry } from './systems/nutrition.js';
import {
  chooseCrateTile, commsDishOnline, commsThroughput, crateAt, ORDER_MASS_EPSILON, orderMassKg, ownedSeeds, seedsInFlight,
} from './systems/supply.js';

const ok = (reason) => ({ ok: true, reason });
const fail = (reason) => ({ ok: false, reason });
export const playbackSpeeds = [0, 1, 2, 4];
/** Sol-end samples kept in `state.history` for the top bar's per-sol trends. */
export const HISTORY_SOLS = 8;

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
    const budget = options.rescue ? data.balance.rescue.startingCredits : mode.budget;
    const launch = packed
      ? checkManifest(data, { landerId: landerId ?? data.landers[0].id, items: manifest, budget, siteId })
      : { ok: true, cost: 0, massKg: 0 };
    if (!launch.ok) throw new Error(launch.reasons.join(' '));
    const state = createState(data, { seed, difficulty, objectiveId,
      siteId: options.site ? undefined : siteId, landerId, manifest }, launch);
    state.site = site;
    state.landingCalendarSol = landingCalendarSol(options.landingLs ?? 0, data.seasons);
    if (options.rescue) {
      const { arrivalSol, rationSols } = data.balance.rescue;
      state.rescue = { arrivalSol, colonyName: '', earned: { stranded: state.sol }, harvestedPlots: [],
        harvests: 0, purchases: {}, outcome: 'waiting' };
      state.solLimit = arrivalSol;
      state.crew.n = 1;
      state.res.foodKg = rationSols * data.balance.foodPerCrew;
      state.res.pantry = { rations: state.res.foodKg };
      state.res.credits = budget - launch.cost;
      state.res.waterL = data.balance.rescue.startingWaterL;
    }
    state.plannedStormSeasonSols = 0;
    for (let sol = 1; sol <= state.solLimit; sol++) {
      if (solarLongitude(state.landingCalendarSol + sol, data.seasons) >= 180) state.plannedStormSeasonSols++;
    }
    this.#demo = demo;
    this.#ctx = {
      state, data, site, weather: createRedHarvestWeather(data, options.weather), buildings: new Map(data.buildings.map((item) => [item.id, item])),
      crops: new Map(data.crops.map((item) => [item.id, options.rescue
        ? { ...item, ...data.balance.rescue.crops[item.id] } : item])),
      random: mulberry32(seed), emit: this.#bus.emit,
      near: (plot, id, predicate = () => true) => state.buildings.some((unit) =>
        unit.id === id && Math.abs(unit.x - plot.x) + Math.abs(unit.y - plot.y) === 1 && predicate(unit)),
    };
    for (const { id, x, y } of data.balance.starter) this.#place(id, x, y);
    if (packed) this.#unpack(manifest);
    if (state.rescue && data.balance.rescue.surface) placeSurfaceMaterials(state, data.balance.rescue.surface, { relief: options.relief });
    if (state.rescue) {
      // The starter dish survived the landing as wreckage: no power draw, no downlink, until repaired.
      for (const unit of state.buildings) {
        if (unit.id === 'comms') Object.assign(unit, { broken: true, online: false });
      }
    } else state.comms.repaired = true; // classic missions start with a working dish
    if (state.rescue) {
      if (state.buildings.some(({ id }) => id === 'plot')) earnAdvancement(this.#ctx, 'greenhouse');
      if (state.buildings.some(({ id }) => id === 'battery')) earnAdvancement(this.#ctx, 'power');
    }
    seasonSystem(state, data, site);
    state.weather = this.getWeather();
    if (this.weather.usesArchive) syncArchivedStorms(this.#ctx);
    state.outsideTempC = state.weather.outsideTempC;
    state.power.clearSolarFactor = state.weather.clearSolarFactor;
    state.power.solarFactor = state.weather.solarFactor;
    state.power.gen = state.buildings.reduce((total, unit) => {
      const power = this.#ctx.buildings.get(unit.id).powerW;
      const factor = unit.id === 'solar' ? state.power.solarFactor : 1;
      return total + Math.max(0, power) * factor;
    }, 0);
    state.power.demand = state.buildings.reduce((load, unit) => {
      const model = this.#ctx.buildings.get(unit.id);
      return unit.id === 'washer' || model.plot || unit.broken ? load : load + Math.max(0, -model.powerW)
        + (unit.id === 'hab' ? state.weather.habitatHeatW ?? 0 : 0);
    }, 0);
    const { production, crewDemand } = waterSupply(this.#ctx);
    state.water = { production, demand: crewDemand };
    rewardSystem(this.#ctx);
    state.history = [];
    this.#sample();
    const location = options.site ? `${site.lat.toFixed(1)}°, ${site.lon.toFixed(1)}°` : site.name;
    this.#record(`Landed at ${location}.`, `Started surface operations with ${state.res.credits} kg of build materials.`);
  }

  #unpack(manifest) {
    const state = this.state;
    const open = [];
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        if (!state.buildings.some((unit) => unit.x === x && unit.y === y)) open.push({ x, y });
      }
    }
    const hab = state.buildings.find(({ id }) => id === 'hab') ?? { x: state.grid.w >> 1, y: state.grid.h >> 1 };
    const distance = ({ x, y }) => Math.abs(x - hab.x) + Math.abs(y - hab.y);
    open.sort((a, b) => distance(a) - distance(b));
    for (const [id, count] of Object.entries(manifest)) {
      if (!this.#ctx.buildings.has(id)) continue;
      for (let i = 0; i < count; i++) {
        const tile = open.shift();
        this.#place(id, tile.x, tile.y);
      }
    }
  }

  get state() { return this.#ctx.state; }
  get expectedFoodPerSol() { return expectedFoodPerSol(this.#ctx); }
  cropTraits(id) { return this.#ctx.crops.get(id); }
  cropGenetics(crop) {
    const rules = this.#ctx.data.mutations;
    const lineage = this.state.lineages[crop?.lineageId];
    if (!rules || !lineage?.genotype) return [];
    return describeGenetics(lineage.genotype, rules, lineage.mutation?.flips);
  }
  plantingFoodCost(id) {
    return this.state.rescue && this.#ctx.crops.has(id)
      ? this.#ctx.data.balance.rescue.plantingFoodKg ?? 0 : 0;
  }
  harvestPreview(plot, cropId, health = 1) {
    return harvestPreview(this.#ctx, { cropId, health }, plot);
  }
  purchasePrice({ id, cost }) {
    const { rescue } = this.state;
    if (!rescue) return cost;
    const multiplier = this.#ctx.data.balance.rescue.priceMultiplier;
    return Math.round(cost * multiplier ** (rescue.purchases[id] ?? 0));
  }

  unlockRequirement(item) {
    const milestone = missingAdvancement(this.state.rescue, item.id);
    if (milestone) return milestone;
    const comms = this.#ctx.data.balance.rescue?.comms;
    if (this.state.rescue && comms && this.#ctx.crops.has(item.id) && !ownedSeeds(this.state, comms).has(item.id)) {
      return 'a seed order from the Comms Dish';
    }
    return this.state.res.sp < item.unlockSP ? `${item.unlockSP} SP` : null;
  }

  /** Every orderable crop with its packet mass and whether it is owned, on its way, or orderable now. */
  seedCatalog() {
    const { state, data } = this.#ctx;
    const comms = data.balance.rescue?.comms ?? {};
    const packetKg = comms.packetKg ?? {};
    const owned = ownedSeeds(state, comms);
    const inFlight = seedsInFlight(state);
    return data.crops.filter(({ id }) => Object.hasOwn(packetKg, id)).map(({ id }) => {
      const has = !state.rescue || owned.has(id);
      const coming = inFlight.has(id);
      return { id, name: this.cropTraits(id).name, packetKg: packetKg[id], owned: has, inFlight: coming,
        orderable: Boolean(state.rescue) && !has && !coming };
    });
  }

  commsStatus() {
    const { state, data } = this.#ctx;
    const comms = data.balance.rescue?.comms ?? {};
    const { order, crate } = state.comms;
    return {
      repaired: state.comms.repaired, online: state.comms.repaired && commsDishOnline(state),
      repairCost: comms.repairCost, capacityKg: comms.orderCapacityKg,
      order, solsRemaining: order ? Math.max(0, order.arrivalSol - state.sol) : null, crate,
    };
  }

  /** Snapshot sol-end resources into the small ring buffer the trend selectors read. */
  #sample() {
    const { state } = this.#ctx;
    state.history.push({ sol: state.sol, credits: state.res.credits, waterL: state.res.waterL, foodKg: state.res.foodKg });
    if (state.history.length > HISTORY_SOLS) state.history.shift();
  }

  #landSupplyDrop() {
    const { state } = this.#ctx;
    const { order } = state.comms;
    if (!order || state.sol < order.arrivalSol) return;
    state.comms.order = null;
    const tile = chooseCrateTile(state, order.arrivalSol);
    if (!tile) { // board completely full: hand the seeds over directly rather than lose them
      state.comms.crate = { x: -1, y: -1, items: [...order.items], landedSol: state.sol };
      this.command({ type: 'collectCrate' });
      return;
    }
    state.comms.crate = { ...tile, items: [...order.items], landedSol: state.sol };
    const names = order.items.map((id) => this.cropTraits(id).name).join(', ');
    this.#record('A supply crate landed near the base.', names);
    this.#bus.emit('supply:landed', state.comms.crate);
  }

  #buy(item) {
    const price = this.purchasePrice(item);
    this.state.res.credits -= price;
    const { rescue } = this.state;
    if (rescue) rescue.purchases[item.id] = (rescue.purchases[item.id] ?? 0) + 1;
    this.#bus.emit('credits:spent', price);
  }
  get weather() { return this.#ctx.weather; }
  getWeather() { return this.weather.current(gameWeatherInput(this.#ctx)); }
  forecastWeather(sols = 7) {
    if (!Number.isSafeInteger(sols) || sols < 0) throw new RangeError('sols must be a nonnegative integer');
    const { sol } = this.state;
    const knownStorms = this.weather.usesArchive ? [] : forecastDustEvents(this.#ctx, sol + 1, sol + sols);
    return this.weather.forecast(gameWeatherInput(this.#ctx, knownStorms), { sols });
  }
  on(event, fn) { return this.#bus.on(event, fn); }
  off(event, fn) { this.#bus.off(event, fn); }

  #record(text, effect = '') {
    this.state.decisions.push({ sol: this.state.sol, text, effect });
  }

  #place(id, x, y) {
    const treated = id !== 'plot' || this.state.difficulty === 'easy';
    const unit = { uid: ++this.#uid, id, x, y, online: true, loadEnabled: true, dust: 0, watered: false, treated };
    if (id === 'plot') unit.soil = createPlotSoil(this.#ctx.site, this.#ctx.data, { treated });
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
    if (state.rocket?.status === 'burning' && state.sol >= state.rocket.burnsUntilSol) {
      state.rocket.status = 'salvageable';
    }
    this.#landSupplyDrop();
    seasonSystem(state, data, site);
    eventSystem(this.#ctx);
    state.weather = this.getWeather();
    if (this.weather.usesArchive) syncArchivedStorms(this.#ctx);
    state.outsideTempC = state.weather.outsideTempC;
    state.power.clearSolarFactor = state.weather.clearSolarFactor;
    queueSoilWashing(this.#ctx);
    powerSystem(this.#ctx);
    waterSystem(this.#ctx);
    fertilizeAdjacentPlots(this.#ctx);
    if (state.rescue) {
      if (state.buildings.some(({ id, online }) => id === 'iceDrill' && online)) earnAdvancement(this.#ctx, 'water');
      if (state.buildings.some(({ id, treated }) => id === 'plot' && treated)) earnAdvancement(this.#ctx, 'soil');
    }
    cropSystem(this.#ctx);
    for (const plot of state.buildings) {
      if (!this.#ctx.near(plot, 'autoHarvester', (unit) => unit.online)) continue;
      if (state.crops.some(({ plotUid, growth }) => plotUid === plot.uid && growth >= 1)) {
        this.command({ type: 'harvest', uid: plot.uid });
      }
    }
    crewSystem(this.#ctx);
    economySystem(this.#ctx);
    rewardSystem(this.#ctx);
    if (state.res.batteryWh >= 10000) earnAdvancement(this.#ctx, 'charged');
    if (state.metrics.transmitted >= 5) earnAdvancement(this.#ctx, 'downlink');
    if (state.crew.health > 0 && state.rescue && state.sol >= Math.ceil(state.rescue.arrivalSol / 2)) {
      earnAdvancement(this.#ctx, 'halfway');
    }
    this.#sample();
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
        const requirement = this.unlockRequirement(model);
        if (requirement) return fail(`Requires ${requirement}.`);
        if (state.rocks.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0)) return fail('Mine this rock before building here.');
        if (state.rocket?.x === x && state.rocket.y === y && state.rocket.status !== 'scrapped') {
          return fail('Scrap the wreck before building here.');
        }
        if (crateAt(state, x, y)) return fail('Collect the supply crate first.');
        if (state.res.credits < this.purchasePrice(model)) return fail('Not enough build materials.');
        this.#buy(model);
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
      case 'mine': {
        const rock = state.rocks.find((entry) => entry.x === x && entry.y === y && entry.remaining > 0);
        if (!rock) return fail('Select a rock with materials left to mine.');
        const amount = Math.min(rock.remaining, data.balance.rescue.surface.miningBatch);
        rock.remaining -= amount;
        state.res.credits += amount; // 1 kg of ore = 1 kg of build materials (game value)
        const message = `Mined ${amount} kg of ${rock.material}.`;
        this.#record(message);
        return ok(message);
      }
      case 'scrapRocket': {
        if (state.rocket?.status === 'burning') return fail(`The wreck is burning until sol ${state.rocket.burnsUntilSol}.`);
        if (state.rocket?.status !== 'salvageable') return fail('There is no wreck left to scrap.');
        const recovered = Object.entries(data.balance.rescue.surface.rocketSalvage)
          .filter(([, amount]) => amount > 0);
        for (const [, amount] of recovered) state.res.credits += amount;
        state.rocket.status = 'scrapped';
        const message = `Scrapped the wreck for ${recovered.map(([material, amount]) => `${amount} kg of ${material}`).join(' and ')}.`;
        this.#record(message);
        return ok(message);
      }
      case 'buySpares': {
        const parts = data.balance.kit.find(({ id }) => id === 'spares');
        if (state.res.credits < this.purchasePrice(parts)) return fail('Not enough build materials for a spare part.');
        this.#buy(parts);
        state.res.spares++;
        this.#record('Bought a spare part.');
        this.#bus.emit('purchase', state);
        return ok('Bought a spare part.');
      }
      case 'plant': {
        const traits = crops.get(id);
        if (!unit || !buildings.get(unit.id).plot || crop) return fail('Choose an empty greenhouse or hydroponic bay.');
        if (!traits) return fail('This crop is unavailable.');
        const requirement = this.unlockRequirement(traits);
        if (requirement) return fail(`Requires ${requirement}.`);
        if (!unit.treated) return fail('Treat this plot with a Soil Washer before planting.');
        const foodCost = this.plantingFoodCost(id);
        if (state.res.foodKg + 1e-9 < foodCost) return fail(`Planting requires ${foodCost} kg of food.`);
        removeFromPantry(state, foodCost);
        const lineage = data.mutations ? lineageForPlant(state, id, data.mutations) : null;
        state.crops.push({
          uid: ++this.#uid, plotUid: unit.uid, cropId: id, plantedSol: state.sol, health: 1, growth: 0,
          ...(lineage ? { lineageId: lineage.id, stress: emptyStress() } : {}),
        });
        if (state.rescue) {
          earnAdvancement(this.#ctx, 'greenhouse');
          earnAdvancement(this.#ctx, 'soil');
          earnAdvancement(this.#ctx, 'botanist');
        }
        const sols = cropSolsRemaining(traits, unit, data.balance);
        this.#record(`Planted ${traits.name}.`, `Requires ${sols} healthy sols to mature.`);
        this.#bus.emit('crop:plant', state);
        return ok(`Planted ${traits.name}.`);
      }
      case 'harvest': {
        if (!crop || crop.growth < 1) return fail('The plot has no mature crop.');
        const result = harvestCrop(this.#ctx, crop, unit);
        earnAdvancement(this.#ctx, 'harvest');
        if (state.rescue) {
          const rescue = state.rescue;
          rescue.harvests++;
          if (rescue.harvests === 2) earnAdvancement(this.#ctx, 'repeatHarvest');
          if (!rescue.harvestedPlots.includes(unit.uid)) rescue.harvestedPlots.push(unit.uid);
          if (rescue.harvestedPlots.length >= 3) earnAdvancement(this.#ctx, 'farm');
        }
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
        const solarActive = state.events.active.some((event) => event.id === 'spe');
        const result = crossGenotypes(
          motherLine.genotype,
          fatherLine.genotype,
          mother.stress?.dose_mSv ?? 0,
          father.stress?.dose_mSv ?? 0,
          data.mutations,
          this.#ctx.random,
          state.difficulty,
          { solarActive },
        );
        const child = storeCrossChild(
          state, mother.cropId, motherLine.id, fatherLine.id, result, data.mutations, state.sol,
        );
        const lab = state.buildings.some((entry) => entry.id === 'lab' && entry.online && entry.watered);
        queueCrossDiscovery(this.#ctx, mother, traits, child, lab);
        state.crops = state.crops.filter(({ uid }) => uid !== mother.uid);
        const label = formatGenotype(child.genotype, data.mutations);
        if (result.mutation) {
          this.#bus.emit('mutation:alleleFlip', {
            cropId: mother.cropId,
            name: traits.name,
            flips: result.mutation.flips,
            solarBoosted: result.solarBoosted,
            genetics: describeGenetics(child.genotype, data.mutations, result.mutation.flips),
            plotUid: motherPlot.uid,
          });
        }
        const note = result.mutation
          ? (result.solarBoosted
            ? ' Solar particle event boosted allele flips (game).'
            : ' New allele flip under dose (game).')
          : '';
        const text = `Crossed ${traits.name}. Seed vault holds generation ${child.generation}: ${label}.${note}`;
        this.#record(text, 'Mendelian cross; mother harvested for seed.');
        rewardSystem(this.#ctx);
        return ok(text);
      }
      case 'nameColony': {
        const rescue = state.rescue;
        if (!rescue || !Object.hasOwn(rescue.earned, 'halfway')) return fail('Colony naming unlocks at Halfway Home.');
        const name = typeof cmd.name === 'string' ? cmd.name.trim() : '';
        if (!name || name.length > 28 || /[\u0000-\u001f\u007f]/.test(name)) return fail('Enter a colony name of 1–28 characters.');
        rescue.colonyName = name;
        earnAdvancement(this.#ctx, 'colony');
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
        if (unit.broken) return fail('The crashed Comms Dish can be repaired, not removed.');
        state.crops = state.crops.filter((entry) => entry.plotUid !== unit.uid);
        state.buildings = state.buildings.filter((entry) => entry.uid !== unit.uid);
        this.#record(`Removed ${buildings.get(unit.id).name}.`);
        if (crop) this.#bus.emit('crop:remove', state);
        return ok('Structure removed.');
      case 'setPriority':
        if (!Array.isArray(cmd.priority) || cmd.priority.some((key) => !buildings.has(key))) return fail('Invalid power priorities.');
        state.power.priority = [...new Set(cmd.priority)];
        this.#record('Changed load-shedding priorities.', 'Life support always gets first allocation.');
        return ok('Power priorities updated.');
      case 'setRationing': {
        const levels = data.balance.rationing ?? { normal: 1, reduced: 0.75, emergency: 0.5 };
        if (!Object.hasOwn(levels, cmd.level)) return fail('Choose Normal, Reduced or Emergency rationing.');
        state.crew.rationing = cmd.level;
        this.#record(`Set rationing to ${cmd.level}.`);
        this.#bus.emit('rationing:change', state.crew.rationing);
        return ok(`Rationing set to ${cmd.level}.`);
      }
      case 'setLoadEnabled': {
        const group = powerLoadGroupFor(cmd.id);
        if (!group) return fail('Unknown power load group.');
        if (group.essential) return fail(`${group.label} is essential and cannot be switched off.`);
        const units = state.buildings.filter(unit => group.buildingIds.includes(unit.id) && !unit.broken);
        if (!units.length) return fail(`There are no ${group.label.toLowerCase()} loads in this colony.`);
        const enabled = cmd.enabled !== false;
        units.forEach(unit => { unit.loadEnabled = enabled; });
        powerSystem(this.#ctx, { elapsed: false });
        state.power.comms = commsThroughput(state, data);
        state.water.production = waterSupply(this.#ctx).production;
        this.#record(`${enabled ? 'Enabled' : 'Disabled'} ${group.label.toLowerCase()} power.`);
        this.#bus.emit('power:loads', state);
        return ok(`${group.label} ${enabled ? 'enabled' : 'disabled'}.`);
      }
      case 'repairComms': {
        const comms = data.balance.rescue?.comms;
        if (state.comms.repaired) return fail('The Comms Dish is already repaired.');
        const dish = state.buildings.find((entry) => entry.id === 'comms' && entry.broken);
        if (!state.rescue || !comms || !dish) return fail('There is no broken Comms Dish to repair.');
        if (state.res.credits < comms.repairCost) {
          return fail(`Not enough build materials — repair needs ${comms.repairCost} kg.`);
        }
        state.res.credits -= comms.repairCost;
        this.#bus.emit('credits:spent', comms.repairCost);
        dish.broken = false;
        state.comms.repaired = true;
        powerSystem(this.#ctx, { elapsed: false });
        state.power.comms = commsThroughput(state, data);
        earnAdvancement(this.#ctx, 'phoneHome');
        this.#record('Repaired the Comms Dish.', 'Seed orders and research downlink work while it has power.');
        this.#bus.emit('comms:repaired', state.comms);
        return ok(dish.online ? 'Comms Dish repaired and online.' : 'Comms Dish repaired. It needs power to come online.');
      }
      case 'orderSeeds': {
        const comms = data.balance.rescue?.comms;
        if (!state.rescue || !comms) return fail('Seed orders are part of the rescue mission only.');
        if (!state.comms.repaired) return fail('Repair the Comms Dish first.');
        if (!commsDishOnline(state)) return fail('The Comms Dish needs power to send an order.');
        if (state.comms.order) return fail('A supply drop is already on its way.');
        if (state.comms.crate) return fail('Collect the supply crate first.');
        const items = Array.isArray(cmd.items) ? [...new Set(cmd.items)] : [];
        if (!items.length) return fail('Choose at least one seed packet.');
        const catalog = new Map(this.seedCatalog().map((entry) => [entry.id, entry]));
        for (const item of items) {
          const entry = catalog.get(item);
          if (!entry) return fail('That seed is not in the catalogue.');
          if (entry.owned) return fail(`You already have ${entry.name} seeds — replant from your harvest.`);
          if (!entry.orderable) return fail(`${entry.name} seeds are already on their way.`);
        }
        const massKg = orderMassKg(items, comms.packetKg);
        if (massKg > comms.orderCapacityKg + ORDER_MASS_EPSILON) return fail(`The order is over ${comms.orderCapacityKg} kg.`);
        const order = { items, massKg: Math.round(massKg * 1000) / 1000, placedSol: state.sol,
          arrivalSol: state.sol + comms.deliverySols };
        state.comms.order = order;
        const names = items.map((item) => catalog.get(item).name).join(', ');
        this.#record('Sent a seed order.', `${names} · lands on sol ${order.arrivalSol}.`);
        this.#bus.emit('supply:ordered', order);
        return ok(`Order sent. The supply drop lands on sol ${order.arrivalSol}.`);
      }
      case 'collectCrate': {
        const { crate } = state.comms;
        if (!crate) return fail('There is no supply crate to collect.');
        state.comms.crate = null;
        for (const item of crate.items) if (!state.comms.delivered.includes(item)) state.comms.delivered.push(item);
        const names = crate.items.map((item) => this.cropTraits(item).name);
        earnAdvancement(this.#ctx, 'delivery');
        this.#record('Collected a supply crate.', `New seeds: ${names.join(', ')}.`);
        this.#bus.emit('supply:seeds', { sol: state.sol, crops: names });
        return ok(`Collected the supply crate · new seeds: ${names.join(', ')}.`);
      }
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
