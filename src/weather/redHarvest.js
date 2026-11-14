// AI-assisted (OpenAI Codex).
// All Red Harvest schema translation lives here. The public API uses plain value objects.
import { createWeatherAPI } from './index.js';

export function normalizeGameEvent(event) {
  return {
    ...event,
    startSol: event.startSol ?? 0,
    endSol: event.endSol ?? event.until,
    effects: {
      solarFactor: event.effects?.solarFactor ?? 1,
      heatingFactor: event.effects?.heatingFactor ?? event.effects?.heatFactor ?? 1,
      commsFactor: event.effects?.commsFactor ?? 1
    }
  };
}

/** Existing seasons, balance, difficulty and events stay authoritative for this game.
 * Explicit API overrides win last. A new game schema only needs a new mapping here.
 */
export function createRedHarvestWeather(data, options = {}) {
  const { seasons, balance } = data;
  const near = seasons.orbit.perihelionMkm;
  const far = seasons.orbit.aphelionMkm;
  const events = data.events.filter(event => event.effects?.solarFactor !== undefined ||
    event.effects?.heatFactor !== undefined || event.effects?.heatingFactor !== undefined ||
    event.effects?.commsFactor !== undefined).map(event => ({
      ...normalizeGameEvent(event),
      group: event.effects.solarFactor !== undefined ? 'dust' : 'cold',
      baseChancePerSol: event.baseChancePerSol ?? 0,
      seasonMultiplier: event.seasonMultiplier?.x ?? 1,
      difficulties: event.hardOnly ? ['hard'] : Object.keys(data.difficulty),
      ...(event.once ? { maxPerMission: 1 } : {})
    }));
  const config = {
    ...data.weather,
    calendar: {
      yearSols: seasons.yearSols,
      monthStartSols: [...seasons.months.map(month => month.solFrom), seasons.yearSols],
      stormLsFrom: 180, stormLsTo: 360
    },
    orbit: { ...seasons.orbit, eccentricity: (far - near) / (far + near) },
    temperatureModel: { ...balance.temperatureModel, latitudeCoolingC: 0, seasonAmplitudeC: 0, dailyVariationC: 0 },
    balance: {
      ...data.weather?.balance,
      panelLossPerSol: balance.solarDustLoss,
      minimumPanelCleanliness: balance.solarDustFloor,
      dustMode: 'additive', stormDustMultiplier: 3,
      lightWattsPerPpf: balance.wheatExtraWattsPerPpf,
      heatWattsPerDegree: balance.heatWattsPerDegree
    },
    difficulties: Object.fromEntries(Object.entries(data.difficulty).map(([id, mode]) =>
      [id, { eventMult: mode.eventMult, warningSols: 0 }])),
    events
  };
  return createWeatherAPI({
    config, overrides: options.overrides,
    observations: data.weatherObservations?.observations ?? [],
    models: {
      temperature: ({ site, Ls, config }) => {
        const model = config.temperatureModel;
        return model.baseC - Math.abs(site.lat) * model.latitudePenalty +
          model.seasonSwingC * Math.sin(Ls * Math.PI / 180) * (site.lat < 0 ? -1 : 1);
      },
      ...options.models
    }
  });
}

export function gameWeatherInput({ state, site }) {
  return {
    sol: state.sol, Ls: state.Ls, site, seed: state.seed, difficulty: state.difficulty,
    events: state.events.active.map(normalizeGameEvent)
  };
}

export function refreshGameWeather(ctx) {
  const weather = ctx.weather.current(gameWeatherInput(ctx));
  ctx.state.weather = weather;
  ctx.state.outsideTempC = weather.outsideTempC;
  ctx.state.power.clearSolarFactor = weather.clearSolarFactor;
  ctx.state.power.solarFactor = weather.solarFactor;
}
