// AI-assisted (OpenAI Codex)
import { solarLongitude } from '../insolation.js';
import { mulberry32 } from '../rng.js';
import { lineagePhenotype } from './mutations.js';

const isDust = ({ id }) => ['dustLocal', 'dustRegional', 'dustGlobal'].includes(id);
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
    const Ls = solarLongitude(sol + (state.landingCalendarSol ?? 0), data.seasons);
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

export function startEvent(ctx, id, until) {
  const { state, data, random, emit } = ctx;
  const event = data.events.find((entry) => entry.id === id);
  if (!event || state.events.active.some((entry) => entry.id === id && !entry.archive)) return false;
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

export function syncArchivedStorms({ state, emit }) {
  for (const event of state.weather.active.filter((item) => item.archive && isDust(item))) {
    const { id, name, startSol, endSol } = event;
    if (state.events.active.some((entry) => entry.archive && entry.id === id && entry.startedSol === startSol)) continue;
    const duration = endSol - startSol;
    const active = { id, name, startedSol: startSol, until: endSol, archive: true, effects: {},
      durationSols: [duration, duration] };
    state.events.active.push(active);
    state.events.log.push({ id, name, sol: state.sol });
    emit('event:start', active);
  }
}

export function eventSystem(ctx) {
  const { state, data, random, emit } = ctx;
  for (const event of state.events.active.filter(({ until }) => until <= state.sol)) emit('event:end', event);
  state.events.active = state.events.active.filter(({ until }) => until > state.sol);
  if (state.rescue && state.sol <= data.balance.rescue.rationSols) return;
  if (!ctx.weather?.usesArchive) {
    const [dust] = forecastDustEvents(ctx, state.sol, state.sol);
    if (dust) startEvent(ctx, dust.id, dust.until);
  }
  const history = new Set(state.events.log.map(({ id }) => id));
  for (const event of data.events) {
    if (isDust(event) || (ctx.weather?.usesArchive && ['cold', 'coldSnap'].includes(event.id)) ||
        !available(event, state, history)) continue;
    if (random() < eventChance(event, state.Ls, data.difficulty[state.difficulty])) {
      startEvent(ctx, event.id);
    }
  }
}
