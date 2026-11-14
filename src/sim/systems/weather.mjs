// AI-assisted (OpenAI Codex).
// Pure weather rules. All physical constants and game balance come from weather.json.
const radians = degrees => degrees * Math.PI / 180;
const wrap = (value, period) => ((value % period) + period) % period;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function latitude(value) {
  finite(value, 'latitude');
  if (Math.abs(value) > 90) throw new RangeError('latitude must be between -90 and 90');
  return value;
}

// Mulberry32 with a stable string hash keeps weather independent of other systems' RNG.
function randomFor(seed, sol) {
  let value = 2166136261;
  for (const char of `${seed}:${sol}`) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function seasonAt(sol, lat, config) {
  finite(sol, 'sol');
  latitude(lat);
  const { yearSols, monthStartSols } = config.calendar;
  const yearSol = wrap(sol, yearSols);
  const month = monthStartSols.findIndex((end, index) => index > 0 && yearSol < end) - 1;
  const start = monthStartSols[month];
  const end = monthStartSols[month + 1];
  const Ls = 30 * (month + (yearSol - start) / (end - start));
  const seasonIdx = (Math.floor(Ls / 90) + (lat < 0 ? 2 : 0)) % 4;
  return { Ls, yearSol, seasonIdx, season: ['Spring', 'Summer', 'Autumn', 'Winter'][seasonIdx] };
}

export function solarAt(Ls, lat, config) {
  finite(Ls, 'Ls');
  latitude(lat);
  const { obliquityDeg, eccentricity, perihelionLs } = config.orbit;
  const declination = Math.asin(Math.sin(radians(obliquityDeg)) * Math.sin(radians(Ls)));
  const noonFactor = Math.max(0, Math.cos(radians(lat) - declination));
  const radiusRatio = (1 - eccentricity ** 2) /
    (1 + eccentricity * Math.cos(radians(Ls - perihelionLs)));
  // README's noon proxy, relative to equatorial noon at mean orbital distance.
  return noonFactor / radiusRatio ** 2;
}

function inStormSeason(Ls, config) {
  return Ls >= config.calendar.stormLsFrom && Ls < config.calendar.stormLsTo;
}

/** Return a new serializable weather snapshot and messages to emit once after commit.
 * The caller owns the game clock. First call can begin at any nonnegative integer sol.
 * Later calls must be consecutive. A repeated sol is an idempotent no-op.
 * Optional observation requires a same-site, quality-screened air temperature summary.
 */
export function stepWeather(previous, input, config) {
  const { sol, site, seed = 42, difficulty = 'medium', observation } = input;
  if (!Number.isSafeInteger(sol) || sol < 0) throw new RangeError('sol must be a nonnegative integer');
  if (!(typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed)))) {
    throw new TypeError('seed must be a finite number or string');
  }
  latitude(site.lat);
  if (!site.id) throw new TypeError('site.id is required');
  const settings = config.difficulties[difficulty];
  if (!settings) throw new RangeError(`Unknown difficulty: ${difficulty}`);
  if (previous) {
    if (previous.siteId !== site.id || previous.seed !== seed || previous.difficulty !== difficulty) {
      throw new Error('Start a new weather state when changing site, seed or difficulty');
    }
    if (previous.sol === sol) return { weather: previous, messages: [] };
    if (sol !== previous.sol + 1) throw new RangeError('Weather must advance one sol at a time');
  }
  const season = seasonAt(sol, site.lat, config);
  const Ls = wrap(finite(input.Ls ?? season.Ls, 'Ls'), 360);
  const seasonIdx = (Math.floor(Ls / 90) + (site.lat < 0 ? 2 : 0)) % 4;
  const rng = randomFor(seed, sol);
  const messages = [];
  const active = [];
  const pending = [];
  const counts = { ...previous?.counts };
  for (const event of previous?.active ?? []) {
    if (sol >= event.endSol) messages.push({ type: 'event:end', event });
    else active.push(event);
  }
  for (const event of previous?.pending ?? []) {
    if (sol >= event.startSol) {
      active.push(event);
      messages.push({ type: 'event:start', event });
    } else pending.push(event);
  }
  for (const definition of config.events) {
    const occupied = [...active, ...pending].some(event => event.group === definition.group);
    if (occupied || !definition.difficulties.includes(difficulty) ||
        (counts[definition.id] ?? 0) >= (definition.maxPerMission ?? Infinity)) continue;
    const seasonMultiplier = inStormSeason(Ls, config) ? definition.seasonMultiplier : 1;
    const chance = clamp(definition.baseChancePerSol * settings.eventMult * seasonMultiplier, 0, 1);
    if (rng() >= chance) continue;
    const [min, max] = definition.durationSols;
    const duration = min + Math.floor(rng() * (max - min + 1));
    const event = {
      id: definition.id, group: definition.group, name: definition.name,
      startSol: sol + settings.warningSols, endSol: sol + settings.warningSols + duration,
      effects: { ...definition.effects }, why: definition.why, _game: true
    };
    counts[event.id] = (counts[event.id] ?? 0) + 1;
    if (settings.warningSols > 0) {
      pending.push(event);
      messages.push({ type: 'weather:warning', event });
    } else {
      active.push(event);
      messages.push({ type: 'event:start', event });
    }
  }
  const model = config.temperatureModel;
  const latFactor = Math.sin(radians(site.lat));
  let outsideTempC = model.baseC - model.latitudeCoolingC * Math.abs(latFactor) +
    model.seasonAmplitudeC * latFactor * Math.sin(radians(Ls)) +
    (rng() * 2 - 1) * model.dailyVariationC;
  let temperatureBasis = 'Synthetic game temperature anchored to NASA global reference';
  let observationSource = null;
  if (observation) {
    if (observation.siteId !== site.id || !observation.sourceUrl || !observation.coverage) {
      throw new TypeError('Observation requires matching siteId, sourceUrl and coverage');
    }
    const low = finite(observation.airTempMinC, 'airTempMinC');
    const high = finite(observation.airTempMaxC, 'airTempMaxC');
    if (low > high) throw new RangeError('airTempMinC exceeds airTempMaxC');
    outsideTempC = (low + high) / 2;
    temperatureBasis = 'Archived air-temperature midpoint approximation';
    observationSource = { ...observation };
  }
  const effects = { solarFactor: 1, heatingFactor: 1, commsFactor: 1 };
  for (const event of active) {
    for (const key of Object.keys(effects)) effects[key] *= event.effects[key];
  }
  const weather = {
    sol, seed, siteId: site.id, difficulty, Ls, seasonIdx,
    season: ['Spring', 'Summer', 'Autumn', 'Winter'][seasonIdx],
    stormSeason: inStormSeason(Ls, config), active, pending, counts,
    outsideTempC, temperatureBasis, observationSource,
    clearSolarFactor: solarAt(Ls, site.lat, config),
    solarFactor: solarAt(Ls, site.lat, config) * effects.solarFactor,
    dustFactor: effects.solarFactor,
    heatingFactor: effects.heatingFactor, commsFactor: effects.commsFactor,
    panelLossPerSol: config.balance.panelLossPerSol,
    label: 'Simulated Mars weather; approximate solar geometry; game event effects'
  };
  return { weather, messages };
}

/** dust is fractional output loss, 0 = clean. Call once per sol for each solar array. */
export function accumulatePanelDust(dust = 0, config) {
  finite(dust, 'dust');
  if (dust < 0 || dust > 1) throw new RangeError('dust must be between 0 and 1');
  const cleanliness = (1 - dust) * (1 - config.balance.panelLossPerSol);
  return 1 - Math.min(1 - dust, Math.max(config.balance.minimumPanelCleanliness, cleanliness));
}

/** Return an updated panel after the command layer has validated the cleaning cost. */
export function cleanPanel(panel) {
  return { ...panel, dust: 0 };
}

export function panelOutputW(ratedW, dust, weather) {
  finite(ratedW, 'ratedW');
  finite(dust, 'dust');
  if (ratedW < 0 || dust < 0 || dust > 1) throw new RangeError('Invalid solar panel inputs');
  return ratedW * weather.solarFactor * (1 - dust);
}

/** Per-slot climate demand. The power system allocates watts, then crops handle growth. */
export function cropWeatherDemand(crop, weather, config) {
  const ppf = finite(crop.ppf, 'crop.ppf');
  const targetC = finite(crop.tempDayC, 'crop.tempDayC');
  if (ppf < 0) throw new RangeError('crop.ppf must be nonnegative');
  const lightW = ppf * config.balance.lightWattsPerPpf;
  const heatW = Math.max(0, targetC - weather.outsideTempC) *
    config.balance.heatWattsPerDegree * weather.heatingFactor;
  return { lightW, heatW, totalW: lightW + heatW, _game: true };
}

/** Conditional planting advice. Exposure covers the full crop horizon, including wrap. */
export function plantingAdvice(crop, weather, config, availableClimateW) {
  finite(availableClimateW, 'availableClimateW');
  const duration = finite(crop.growthSols, 'crop.growthSols');
  if (duration <= 0 || availableClimateW < 0) throw new RangeError('Invalid planting inputs');
  const demand = cropWeatherDemand(crop, weather, config);
  // Preserve an externally supplied starting Ls by finding its calendar sol.
  const month = Math.floor(weather.Ls / 30);
  const starts = config.calendar.monthStartSols;
  const startSol = starts[month] + (weather.Ls / 30 - month) * (starts[month + 1] - starts[month]);
  const days = Math.ceil(duration);
  let exposed = 0;
  let logSurvival = 0;
  const regional = config.events.find(event => event.id === 'dustRegional');
  for (let day = 0; day < days; day++) {
    const Ls = seasonAt(startSol + day, 0, config).Ls;
    const stormSeason = inStormSeason(Ls, config);
    if (stormSeason) exposed++;
    const chance = clamp(regional.baseChancePerSol * config.difficulties[weather.difficulty].eventMult *
      (stormSeason ? regional.seasonMultiplier : 1), 0, 1);
    logSurvival += Math.log1p(-chance);
  }
  return {
    ...demand,
    powerFit: demand.totalW === 0 ? 1 : availableClimateW / demand.totalW,
    powerSufficientNow: availableClimateW >= demand.totalW,
    stormSeasonSols: exposed,
    regionalStormRisk: 1 - Math.exp(logSurvival),
    activeDustStorm: weather.dustFactor < 1,
    label: 'Game estimate of regional-storm exposure; independent daily rolls; future power must be planned'
  };
}
