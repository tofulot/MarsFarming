// AI-assisted (OpenAI Codex).
import {
  stepWeather, seasonAt, plantingAdvice
} from '../sim/systems/weather.mjs';

function number(value, name, minimum = -Infinity) {
  if (!Number.isFinite(value) || value < minimum) throw new TypeError(`${name} must be a finite number >= ${minimum}`);
  return value;
}

/** Merge named configuration sections; arrays (including events) replace the whole list. */
export function configureWeather(base, overrides = {}) {
  const config = structuredClone({ ...base, ...overrides });
  for (const key of ['calendar', 'orbit', 'temperatureModel', 'balance', 'sources']) {
    config[key] = structuredClone({ ...base[key], ...overrides[key] });
  }
  config.difficulties = structuredClone(base.difficulties);
  for (const [id, mode] of Object.entries(overrides.difficulties ?? {})) {
    config.difficulties[id] = { ...config.difficulties[id], ...mode };
  }
  return config;
}

function validateConfig(config) {
  const starts = config.calendar.monthStartSols;
  if (!Array.isArray(starts) || starts.length !== 13 || starts[0] !== 0 ||
      starts.at(-1) !== config.calendar.yearSols ||
      starts.some((value, index) => !Number.isFinite(value) || (index > 0 && value <= starts[index - 1]))) {
    throw new TypeError('calendar requires 13 increasing month boundaries ending at yearSols');
  }
  for (const key of ['obliquityDeg', 'eccentricity', 'perihelionLs', 'solHours']) number(config.orbit[key], `orbit.${key}`);
  if (config.orbit.eccentricity < 0 || config.orbit.eccentricity >= 1) throw new RangeError('eccentricity must be in [0, 1)');
  for (const key of ['baseC', 'latitudeCoolingC', 'seasonAmplitudeC', 'dailyVariationC']) number(config.temperatureModel[key], `temperatureModel.${key}`);
  for (const key of ['panelLossPerSol', 'minimumPanelCleanliness', 'lightWattsPerPpf', 'heatWattsPerDegree']) number(config.balance[key], `balance.${key}`, 0);
  if (config.balance.panelLossPerSol > 1 || config.balance.minimumPanelCleanliness > 1) throw new RangeError('Panel fractions must be in [0, 1]');
  number(config.balance.stormDustMultiplier ?? 1, 'stormDustMultiplier', 0);
  if (!['additive', 'multiplicative'].includes(config.balance.dustMode ?? 'multiplicative')) throw new TypeError('Unknown dustMode');
  if (!Array.isArray(config.events)) throw new TypeError('events must be an array');
  const ids = new Set();
  for (const event of config.events) {
    if (!event.id || ids.has(event.id)) throw new TypeError('Event IDs must be present and unique');
    ids.add(event.id);
    number(event.baseChancePerSol, `${event.id}.baseChancePerSol`, 0);
    number(event.seasonMultiplier, `${event.id}.seasonMultiplier`, 0);
    if (!Array.isArray(event.durationSols) || event.durationSols.length !== 2 ||
        event.durationSols.some(value => !Number.isSafeInteger(value) || value <= 0) ||
        event.durationSols[0] > event.durationSols[1]) throw new TypeError(`Invalid duration for ${event.id}`);
    for (const key of ['solarFactor', 'heatingFactor', 'commsFactor']) number(event.effects?.[key], `${event.id}.${key}`, 0);
    if (!Array.isArray(event.difficulties)) throw new TypeError(`Missing difficulties for ${event.id}`);
  }
  for (const [id, mode] of Object.entries(config.difficulties)) {
    number(mode.eventMult, `${id}.eventMult`, 0);
    if (!Number.isSafeInteger(mode.warningSols) || mode.warningSols < 0) throw new TypeError(`Invalid warningSols for ${id}`);
  }
}

/** Browser/Node API v1. Inputs and returned snapshots belong to the caller.
 * models.temperature(context) and models.solar(context) are optional pure functions.
 * External-event mode uses current()/forecast(); standalone mode uses advance().
 */
export function createWeatherAPI({ config: base, overrides = {}, models = {}, observations = [] }) {
  const config = configureWeather(base, overrides);
  validateConfig(config);
  const records = structuredClone(observations);
  const modelFns = { ...models };
  const quiet = { ...config, events: [] };
  const contextFor = input => ({ ...structuredClone(input), config: structuredClone(config) });

  function current(input) {
    const weather = stepWeather(undefined, input, quiet).weather;
    weather.apiVersion = 1;
    if (modelFns.temperature && !input.observation) {
      weather.outsideTempC = number(modelFns.temperature(contextFor({ ...input, Ls: weather.Ls })), 'temperature model');
      weather.temperatureBasis = 'Configured game temperature model';
    }
    if (modelFns.solar) weather.clearSolarFactor = number(modelFns.solar(contextFor({ ...input, Ls: weather.Ls })), 'solar model', 0);
    weather.active = structuredClone(input.events ?? []).filter(event =>
      (event.startSol ?? 0) <= input.sol && (event.endSol ?? Infinity) > input.sol);
    for (const event of weather.active) {
      const effects = event.effects ?? {};
      // Most severe event wins, matching Red Harvest's existing event composition.
      weather.dustFactor = Math.min(weather.dustFactor, number(effects.solarFactor ?? 1, 'solarFactor', 0));
      weather.heatingFactor = Math.max(weather.heatingFactor, number(effects.heatingFactor ?? 1, 'heatingFactor', 0));
      weather.commsFactor = Math.min(weather.commsFactor, number(effects.commsFactor ?? 1, 'commsFactor', 0));
    }
    weather.solarFactor = weather.clearSolarFactor * weather.dustFactor;
    return weather;
  }

  function forecast(input, { sols = 7 } = {}) {
    if (!Number.isSafeInteger(sols) || sols < 0) throw new RangeError('sols must be a nonnegative integer');
    const now = current(input);
    const month = Math.floor(now.Ls / 30);
    const starts = config.calendar.monthStartSols;
    const calendarSol = starts[month] + (now.Ls / 30 - month) * (starts[month + 1] - starts[month]);
    const days = [];
    for (let offset = 1; offset <= sols; offset++) {
      // Historical observations apply to their supplied sol only.
      days.push(current({ ...input, observation: undefined, sol: input.sol + offset,
        Ls: seasonAt(calendarSol + offset, input.site.lat, config).Ls }));
    }
    return { kind: 'projection', basis: 'Seasonal model and known events; future random events are uncertain', days };
  }

  function powerEffects({ weather, ratedW, dust = 0, advanceDust = false }) {
    number(weather.solarFactor, 'weather.solarFactor', 0);
    number(ratedW, 'ratedW', 0);
    number(dust, 'dust', 0);
    if (dust > 1) throw new RangeError('dust must be <= 1');
    let nextDust = dust;
    if (advanceDust) {
      const loss = config.balance.panelLossPerSol * (weather.dustFactor < 1 ? (config.balance.stormDustMultiplier ?? 1) : 1);
      const increase = config.balance.dustMode === 'additive' ? loss : (1 - dust) * loss;
      nextDust = Math.max(dust, Math.min(1 - config.balance.minimumPanelCleanliness, dust + increase));
    }
    return { generationW: ratedW * weather.solarFactor * (1 - nextDust), dust: nextDust,
      solarFactor: weather.solarFactor, _game: true };
  }

  function cropEffects(crop, weather, { basePowerW = 0, includedPpf = 0 } = {}) {
    number(weather.outsideTempC, 'weather.outsideTempC');
    number(weather.heatingFactor, 'weather.heatingFactor', 0);
    number(basePowerW, 'basePowerW', 0);
    number(includedPpf, 'includedPpf', 0);
    number(crop.ppf, 'crop.ppf', 0);
    number(crop.tempDayC, 'crop.tempDayC');
    const lightW = Math.max(0, crop.ppf - includedPpf) * config.balance.lightWattsPerPpf;
    const heatW = Math.max(0, crop.tempDayC - weather.outsideTempC) * config.balance.heatWattsPerDegree * weather.heatingFactor;
    return { baseW: basePowerW, lightW, heatW, totalW: basePowerW + lightW + heatW, _game: true };
  }

  return Object.freeze({
    version: 1,
    current,
    forecast,
    powerEffects,
    cropEffects,
    plantingAdvice(crop, weather, availableClimateW, load = {}) {
      const advice = plantingAdvice(crop, weather, config, availableClimateW);
      const demand = cropEffects(crop, weather, load);
      return { ...advice, ...demand, powerSufficientNow: availableClimateW >= demand.totalW,
        powerFit: demand.totalW === 0 ? 1 : availableClimateW / demand.totalW };
    },
    advance(previous, input) {
      const result = structuredClone(stepWeather(previous, input, config));
      if (previous?.sol === input.sol) return result;
      const projected = current({ ...input, events: result.weather.active });
      result.weather = { ...result.weather, ...projected,
        pending: result.weather.pending, counts: result.weather.counts };
      return result;
    },
    getConfig() { return structuredClone(config); },
    getSources() { return structuredClone(config.sources); },
    getObservations(siteId) { return structuredClone(records.filter(item => siteId === undefined || item.siteId === siteId)); }
  });
}
