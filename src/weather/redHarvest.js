// Adapt Kelton's weather API to Red Harvest's simulation and event scheduler.
import { createWeatherAPI, configureWeather } from './index.js';
import { clearSolarFactor } from '../sim/insolation.js';

export function gameEvents(weather, existing) {
  const weatherIds = new Set(['dustGlobal', 'dustRegional', 'cold', 'coldSnap']);
  return [...existing.filter(({ id }) => !weatherIds.has(id)), ...weather.events.map((event) => ({
    ...event,
    seasonMultiplier: { LsFrom: weather.calendar.stormLsFrom, LsTo: weather.calendar.stormLsTo, x: event.seasonMultiplier },
    once: event.maxPerMission === 1,
    fact: event.why,
  }))];
}

export function createRedHarvestWeather(data, options = {}) {
  const { seasons, balance } = data;
  const { perihelionMkm: near, aphelionMkm: far } = seasons.orbit;
  const config = data.weather ?? {
    calendar: {
      yearSols: seasons.yearSols,
      monthStartSols: [...seasons.months.map(({ solFrom }) => solFrom), seasons.yearSols],
      stormLsFrom: 180, stormLsTo: 360,
    },
    orbit: { ...seasons.orbit, eccentricity: (far - near) / (far + near) },
    temperatureModel: { ...balance.temperatureModel, latitudeCoolingC: 0, seasonAmplitudeC: 0, dailyVariationC: 0 },
    events: [],
    difficulties: Object.fromEntries(Object.entries(data.difficulty).map(([id, mode]) =>
      [id, { eventMult: mode.eventMult, warningSols: 0 }])),
  };
  const mappedConfig = configureWeather(config, { balance: {
      panelLossPerSol: balance.solarDustLoss,
      minimumPanelCleanliness: balance.solarDustFloor,
      dustMode: 'additive', stormDustMultiplier: balance.stormDustMultiplier ?? 3,
      lightWattsPerPpf: balance.wheatExtraWattsPerPpf,
      heatWattsPerDegree: balance.heatWattsPerDegree,
    } });
  return createWeatherAPI({
    config: mappedConfig, overrides: options.overrides,
    observations: data.weatherObservations?.observations ?? [],
    models: {
      solar: ({ site, Ls }) => clearSolarFactor(site.lat, Ls, seasons.orbit),
      ...(data.weather ? {} : { temperature: ({ site, Ls }) => {
        const model = balance.temperatureModel;
        return model.baseC - Math.abs(site.lat) * model.latitudePenalty +
          model.seasonSwingC * Math.sin(Ls * Math.PI / 180) * (site.lat < 0 ? -1 : 1);
      } }),
      ...options.models,
    },
  });
}

export function gameWeatherInput({ state, site }, forecastEvents = []) {
  return {
    sol: state.sol, Ls: state.Ls, site: { id: 'landing', ...site }, seed: state.seed, difficulty: state.difficulty,
    events: [...state.events.active, ...forecastEvents].map((event) => ({
      ...event, startSol: event.startedSol, endSol: event.until,
      effects: { ...event.effects, heatingFactor: event.effects.heatingFactor ?? event.effects.heatFactor },
    })),
  };
}

// Normalize Kelton's modeled seasonal low between equator and pole.
export function landingWeatherDifficulty(model, latitude) {
  const equatorLow = model.baseC - model.dailyVariationC;
  const coldRange = model.latitudeCoolingC + model.seasonAmplitudeC;
  const seasonalLow = equatorLow - coldRange * Math.abs(Math.sin(latitude * Math.PI / 180));
  return { seasonalLow, severity: coldRange > 0 ? (equatorLow - seasonalLow) / coldRange : 0 };
}
