// AI-assisted (OpenAI Codex)
import { solarLongitude } from '../insolation.js';
import { mulberry32 } from '../rng.js';
import { lineagePhenotype } from './mutations.js';

const isDust = ({ id }) => id === 'dustGlobal' || id === 'dustRegional';
// Weather events are forecastable and stored in GameState. Keep narrative and
// equipment events on the ordinary simulation RNG stream.
const isWeather = (event) => isDust(event) || event.group === 'cold' ||
  event.effects?.heatingFactor > 1 || event.effects?.heatFactor > 1 ||
  event.effects?.crewDose_mSv > 0;
const available = (event, state, history) =>
  (!event.difficulties || event.difficulties.includes(state.difficulty))
  && (!event.hardOnly || state.difficulty === 'hard')
  && (!event.once || !history.has(event.id));

function eventChance(event, Ls, mode) {
  const season = event.seasonMultiplier;
  const factor = season && Ls >= season.LsFrom && Ls < season.LsTo ? season.x : 1;
  return event.baseChancePerSol * factor * mode.eventMult;
}

export function forecastDustEvents({ state, data }, from, through) {
  const dustEvents = data.events.filter(isDust);
  const history = new Set(state.events.log.map(({ id }) => id));
  const forecast = [];
  let clearSol = Math.max(0, ...state.events.active.filter(isDust).map(({ until }) => until));
  const firstStormSol = state.rescue ? data.balance.rescue.rationSols + 1 : 1;
  for (let sol = Math.max(from, clearSol, firstStormSol); sol <= Math.min(through, state.solLimit); sol++) {
    if (sol < clearSol) continue;
    const random = mulberry32(state.seed ^ Math.imul(sol, 0x9e3779b1));
    const Ls = solarLongitude(sol, data.seasons);
    const event = dustEvents.find((candidate) =>
      available(candidate, state, history) && random() < eventChance(candidate, Ls, data.difficulty[state.difficulty]));
    if (!event) continue;
    const [min, max] = event.durationSols;
    clearSol = sol + min + Math.floor(random() * (max - min + 1));
    history.add(event.id);
    forecast.push({ ...event, startedSol: sol, until: clearSol });
  }
  return forecast;
}

function weatherRandom(seed, sol) {
  return mulberry32(seed ^ Math.imul(sol, 0x9e3779b1) ^ 0x6d2b79f5);
}

/** Pre-generate weather events into state so the HUD and simulation use one schedule. */
export function initializeWeatherSchedule(ctx) {
  const { state, data } = ctx;
  const scheduled = {};
  const dust = forecastDustEvents(ctx, state.sol + 1, state.solLimit);
  for (const event of dust) (scheduled[event.startedSol] ??= []).push(event);

  const history = new Set(state.events.log.map(({ id }) => id));
  const activeUntil = new Map(state.events.active.filter(isWeather).map(event => [event.id, event.until]));
  const coldEvents = data.events.filter(event => isWeather(event) && !isDust(event));
  const firstWeatherSol = state.rescue ? data.balance.rescue.rationSols + 1 : 1;
  for (let sol = Math.max(state.sol + 1, firstWeatherSol); sol <= state.solLimit; sol++) {
    const random = weatherRandom(state.seed, sol);
    const Ls = solarLongitude(sol, data.seasons);
    for (const event of coldEvents) {
      if (!available(event, state, history) || sol < (activeUntil.get(event.id) ?? 0)) continue;
      if (random() >= eventChance(event, Ls, data.difficulty[state.difficulty])) continue;
      const [min, max] = event.durationSols;
      const active = { ...event, startedSol: sol,
        until: sol + min + Math.floor(random() * (max - min + 1)) };
      (scheduled[sol] ??= []).push(active);
      activeUntil.set(event.id, active.until);
      history.add(event.id);
    }
  }
  state.events.weatherSchedule = scheduled;
}

export function startEvent(ctx, id, until) {
  const { state, data, random, emit } = ctx;
  const event = data.events.find((entry) => entry.id === id);
  if (!event || state.events.active.some((entry) => entry.id === id)) return false;
  const [min, max] = event.durationSols;
  const active = { ...event, startedSol: state.sol,
    until: until ?? state.sol + min + Math.floor(random() * (max - min + 1)) };
  if (event.effects.equipmentFailure) {
    const machines = state.buildings.filter((b) => !['hab', 'berm'].includes(b.id) && !ctx.buildings.get(b.id)?.decorative &&
      !state.events.active.some((other) => other.targetUid === b.uid));
    if (!machines.length) return false;
    active.targetUid = machines[Math.floor(random() * machines.length)].uid;
    if (state.res.spares > 0) {
      state.res.spares--;
      active.until = state.sol + 1;
    }
  }
  if (event.effects.unshieldedCropHealth && data.difficulty[state.difficulty].cropDeath) {
    for (const crop of state.crops) {
      const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
      if (!ctx.near(plot, 'berm')) {
        const rad = lineagePhenotype(state, crop, data.mutations).rad;
        crop.health = Math.max(0, crop.health - event.effects.unshieldedCropHealth * (1 - rad));
      }
    }
  }
  state.events.active.push(active);
  state.events.log.push({ id, name: event.name, sol: state.sol, fact: event.fact });
  emit('event:start', active);
  return true;
}

export function eventSystem(ctx) {
  const { state, data, random, emit } = ctx;
  for (const event of state.events.active.filter(({ until }) => until <= state.sol)) emit('event:end', event);
  state.events.active = state.events.active.filter(({ until }) => until > state.sol);
  if (state.rescue && state.sol <= data.balance.rescue.rationSols) return;
  const scheduled = state.events.weatherSchedule?.[state.sol] ?? [];
  const history = new Set(state.events.log.map(({ id }) => id));
  for (const event of data.events) {
    if (!available(event, state, history)) continue;
    if (isDust(event)) {
      const dust = scheduled.find(candidate => candidate.id === event.id);
      if (dust) startEvent(ctx, dust.id, dust.until);
      continue;
    }
    if (isWeather(event)) {
      // Preserve the simulation RNG stream's previous draw count while weather
      // itself comes from the stored forecast schedule.
      random();
      const forecast = scheduled.find(candidate => candidate.id === event.id);
      if (forecast) {
        random();
        startEvent(ctx, forecast.id, forecast.until);
      }
      continue;
    }
    if (random() < eventChance(event, state.Ls, data.difficulty[state.difficulty])) {
      startEvent(ctx, event.id);
    }
  }
  delete state.events.weatherSchedule?.[state.sol];
}
