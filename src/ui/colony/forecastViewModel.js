// AI-assisted (Claude): maps archive weather (day.primary / day.conditions) to forecast-strip cells.
const stormIds = new Set(['dustLocal', 'dustRegional', 'dustGlobal']);
const stormNames = { dustLocal: 'Local dust storm', dustRegional: 'Regional dust storm', dustGlobal: 'Global dust storm' };
const stormBase = { dustLocal: 1, dustRegional: 2, dustGlobal: 3 };
const knownWeatherIds = new Set([...stormIds, 'cold', 'coldSnap', 'spe']);
const warnedUnknown = new Set();

/** Archive `primary` names (src/weather/archive.js describeConditions) to strip tones. */
const primaryConditions = {
  Clear: { id: 'clear', tone: 'clear' },
  'Dust haze': { id: 'haze', tone: 'haze' },
  'Ice clouds': { id: 'iceClouds', tone: 'cloud' },
  Windy: { id: 'windy', tone: 'wind' },
  'Dust devil': { id: 'dustDevil', tone: 'devil' },
  'Ice fog': { id: 'iceFog', tone: 'fog' },
  'Water-ice snow': { id: 'snowWater', tone: 'snow' },
  'Dry-ice snow': { id: 'snowCo2', tone: 'snow' },
  'Severe cold': { id: 'cold', tone: 'cold' },
};

const condition = (label, extra = {}) => ({ label, ...(primaryConditions[label] ?? {}), intensity: 0, ...extra });

/** Same precedence as archive.js describeConditions, for days that carry conditions but no primary. */
function primaryFromConditions(conditions = {}, dustOpticalDepth = 0) {
  if (conditions.snow) return conditions.snow === 'co2' ? 'Dry-ice snow' : 'Water-ice snow';
  if (conditions.cold) return 'Severe cold';
  if (conditions.fog) return 'Ice fog';
  if (conditions.dustDevil) return 'Dust devil';
  if (conditions.windy) return 'Windy';
  if (conditions.haze && dustOpticalDepth >= 0.4) return 'Dust haze';
  if (conditions.waterIceCloud || conditions.co2Cloud) return 'Ice clouds';
  return conditions.haze ? 'Dust haze' : 'Clear';
}

function stormIntensity(id, day, event) {
  const factor = Number.isFinite(day.atmosphereFactor) ? day.atmosphereFactor
    : Number.isFinite(day.dustFactor) ? day.dustFactor : event?.effects?.solarFactor ?? 0.4;
  const byFactor = factor >= 0.6 ? 1 : factor >= 0.25 ? 2 : 3;
  return Math.min(3, Math.max(stormBase[id] ?? 1, byFactor));
}

function conditionFor(day, futureUncertain = false) {
  const events = day.active ?? [];
  const conditions = day.conditions;
  const stormEvent = events.find(event => event.id === 'dustGlobal') ?? events.find(event => stormIds.has(event.id));
  const stormId = stormEvent?.id ?? (stormIds.has(conditions?.storm) ? conditions.storm : null);
  const spaceWeather = events.find(event => event.id === 'spe');
  const coldEvent = events.find(event => event.group === 'cold' || event.id === 'cold' || event.id === 'coldSnap');
  const cold = Boolean(conditions?.cold || coldEvent || day.heatingFactor > 1);
  const unknown = events.find(event => !knownWeatherIds.has(event.id) &&
    (event.group === 'weather' || event.effects?.solarFactor !== undefined ||
      event.effects?.heatingFactor !== undefined || event.effects?.heatFactor !== undefined));
  if (unknown) {
    if (!warnedUnknown.has(unknown.id)) {
      warnedUnknown.add(unknown.id);
      console.warn(`Forecast strip does not recognize weather event "${unknown.id}"; showing a neutral marker.`);
    }
    return { id: unknown.id, label: 'Unknown weather event', tone: 'unknown', intensity: 0 };
  }
  if (spaceWeather) return { id: 'spe', label: spaceWeather.name ?? 'Solar particle event', tone: 'space', intensity: 0 };
  if (stormId) {
    const name = stormEvent?.name ?? stormNames[stormId];
    const intensity = stormIntensity(stormId, day, stormEvent);
    if (cold && !conditions?.snow) return { id: 'storm-cold', stormId, label: `${name} + cold snap`, tone: 'storm', intensity: 3 };
    return { id: stormId, stormId, label: name, tone: 'storm', intensity };
  }
  if (conditions) {
    const primary = primaryConditions[day.primary] ? day.primary : primaryFromConditions(conditions, day.dustOpticalDepth);
    // A scripted (non-archive) cold event is not reflected in `primary`; let it win over mild weather.
    if (coldEvent && !coldEvent.archive && !conditions.snow) return condition('Severe cold', { label: coldEvent.name ?? 'Cold snap' });
    return condition(primary);
  }
  if (cold) return { id: 'cold', label: coldEvent?.name ?? 'Cold snap', tone: 'cold', intensity: 0 };
  if (primaryConditions[day.primary]) return condition(day.primary);
  if (futureUncertain) return { id: 'unknown', label: 'Forecast uncertain', tone: 'unknown', intensity: 0 };
  return condition('Clear');
}

/** Daylight conditions present on a day besides its headline condition (same set the old main tooltip showed). */
function secondaryConditions(day, label) {
  const conditions = day.conditions;
  if (!conditions) return [];
  return [
    conditions.dustDevil && 'Dust devil',
    (conditions.waterIceCloud || conditions.co2Cloud) && 'Ice clouds',
    conditions.haze && 'Dust haze',
    conditions.windy && 'Windy',
  ].filter(name => name && !label.startsWith(name));
}

const finite = value => (Number.isFinite(value) ? value : undefined);
const pct = value => (Number.isFinite(value) ? Math.round(value * 100) : undefined);

/** Pure adapter from Simulation.forecastWeather to HUD-ready cells. */
export function createForecastViewModel(current, projection, sol, count = 15) {
  const days = [current, ...(projection?.days ?? [])].slice(0, count + 1);
  const randomEventsUncertain = /uncertain/i.test(projection?.basis ?? '');
  const cells = days.map((day, index) => {
    const condition = conditionFor(day, index > 0 && randomEventsUncertain);
    const offset = index;
    const windSpeedMs = finite(day.windSpeedMs ?? day.windSpeedMps);
    const windPeakMs = finite(day.windPeakMs);
    const overnightFrost = day.conditions?.overnightFrost ?? null;
    return {
      sol: day.sol,
      offset,
      ...condition,
      slotLabel: offset === 0 ? 'Now' : `+${offset}`,
      secondary: secondaryConditions(day, condition.label),
      overnightFrost,
      frostLabel: overnightFrost === 'co2' ? 'Overnight dry-ice frost' : overnightFrost ? 'Overnight water-ice frost' : null,
      dustFactor: day.dustFactor,
      solarFactor: day.solarFactor,
      heatingFactor: day.heatingFactor,
      outsideTempC: finite(day.outsideTempC),
      airMinC: finite(day.airMinC),
      airMaxC: finite(day.airMaxC),
      windSpeedMs,
      windPeakMs: windPeakMs !== undefined && windSpeedMs !== undefined && windPeakMs > windSpeedMs ? windPeakMs : undefined,
      pressurePa: finite(day.pressurePa),
      sunPct: pct(day.atmosphereFactor ?? day.solarFactor),
      solarOutputPct: pct(day.solarFactor),
      habitatHeatW: finite(day.habitatHeatW),
      iceDrillPct: pct(day.iceDrillFactor),
      active: structuredClone(day.active ?? []),
      ariaLabel: `Sol ${day.sol}, ${condition.label}${offset ? `, ${offset} ${offset === 1 ? 'sol' : 'sols'} ahead` : ', current sol'}`,
    };
  });
  const stormIndex = cells.findIndex(cell => cell.tone === 'storm');
  let stormLength = 0;
  let openEnded = false;
  if (stormIndex >= 0) {
    const first = cells[stormIndex];
    const event = first.active.find(item => item.id === first.stormId);
    if (Number.isFinite(event?.endSol) && event.endSol > first.sol) stormLength = event.endSol - first.sol;
    else {
      for (let index = stormIndex; index < cells.length && cells[index].tone === 'storm'; index++) stormLength++;
      openEnded = stormIndex + stormLength === cells.length;
    }
  }
  const lasts = `lasts ${stormLength}${openEnded ? '+' : ''} ${stormLength === 1 && !openEnded ? 'sol' : 'sols'}`;
  const stormWord = stormIndex < 0 ? '' : cells[stormIndex].stormId === 'dustLocal' ? 'Local storm'
    : cells[stormIndex].stormId === 'dustGlobal' ? 'Global storm' : 'Dust storm';
  const incomingStorm = stormIndex > 0 && stormIndex <= 10 ? cells[stormIndex] : null;
  const chip = stormIndex < 0
    ? randomEventsUncertain ? { text: 'Future weather uncertain', storm: false }
      : { text: `No storms in ${Math.max(0, cells.length - 1)} sols`, storm: false }
    : stormIndex === 0
      ? { text: `${stormWord} now · ${lasts}`, storm: true }
      : { text: `${stormWord} in ${stormIndex} ${stormIndex === 1 ? 'sol' : 'sols'} · ${lasts}`, storm: true };
  return {
    cells,
    warning: incomingStorm ? { sol: incomingStorm.sol, offset: incomingStorm.offset } : null,
    spans: cells.reduce((spans, cell, index) => {
      const previous = spans.at(-1);
      if (previous?.id === cell.id) {
        previous.len++;
        previous.peak = Math.max(previous.peak, cell.intensity);
      } else spans.push({ id: cell.id, tone: cell.tone, label: cell.label, start: index, len: 1, peak: cell.intensity });
      return spans;
    }, []),
    chip,
    selected: cells[0],
    unit: 'sols',
    basis: projection?.basis ?? 'Current simulation weather schedule',
  };
}

/** Plain-text lines for the selected-sol detail card (shared by the strip and tests). */
export function forecastDetailLines(cell) {
  const round = value => Math.round(value);
  const lines = [];
  const peak = cell.windPeakMs !== undefined ? `, gusts ${cell.windPeakMs.toFixed(1)} m/s` : '';
  const air = [
    cell.outsideTempC !== undefined && `${round(cell.outsideTempC)} °C`,
    cell.airMinC !== undefined && cell.airMaxC !== undefined && `(${round(cell.airMinC)} to ${round(cell.airMaxC)})`,
  ].filter(Boolean).join(' ');
  if (air) lines.push({ key: 'Air', value: air });
  if (cell.windSpeedMs !== undefined) lines.push({ key: 'Wind', value: `${cell.windSpeedMs.toFixed(1)} m/s${peak}` });
  if (cell.pressurePa !== undefined) lines.push({ key: 'Pressure', value: `${round(cell.pressurePa)} Pa` });
  const effects = [];
  if (cell.sunPct !== undefined) effects.push({ key: 'Sun', value: `${cell.sunPct}%` });
  if (cell.habitatHeatW !== undefined) effects.push({ key: 'Hab heat', value: `+${round(cell.habitatHeatW)} W` });
  if (cell.iceDrillPct !== undefined) effects.push({ key: 'Ice yield', value: `${cell.iceDrillPct}%` });
  return { lines, effects };
}
