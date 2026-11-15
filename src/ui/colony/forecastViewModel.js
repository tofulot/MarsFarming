const stormIds = new Set(['dustGlobal', 'dustRegional']);
const knownWeatherIds = new Set(['dustGlobal', 'dustRegional', 'cold', 'coldSnap', 'spe']);
const warnedUnknown = new Set();

function conditionFor(day, futureUncertain = false) {
  const events = day.active ?? [];
  const storm = events.find(event => stormIds.has(event.id));
  const spaceWeather = events.find(event => event.id === 'spe');
  const cold = day.heatingFactor > 1 || events.some(event => event.group === 'cold' || event.id === 'cold' || event.id === 'coldSnap');
  const unknown = events.find(event => !knownWeatherIds.has(event.id) &&
    (event.group === 'weather' || event.effects?.solarFactor !== undefined ||
      event.effects?.heatingFactor !== undefined || event.effects?.heatFactor !== undefined));
  if (unknown) {
    if (!warnedUnknown.has(unknown.id)) {
      warnedUnknown.add(unknown.id);
      console.warn(`Forecast strip does not recognize weather event "${unknown.id}"; showing a neutral marker.`);
    }
    return { id: unknown.id, label: 'Unknown weather event', icon: '?', tone: 'unknown', intensity: 0 };
  }
  if (spaceWeather) return { id: spaceWeather.id, label: spaceWeather.name ?? 'Solar particle event', icon: 'SPE', tone: 'space', intensity: 0 };
  if (storm && cold) return { id: 'storm-cold', label: `${storm.name ?? 'Dust storm'} + cold snap`, icon: '≋', tone: 'storm', intensity: 3 };
  if (storm) {
    const factor = Number.isFinite(day.dustFactor) ? day.dustFactor : storm.effects?.solarFactor ?? 0.4;
    const intensity = factor >= 0.6 ? 1 : factor >= 0.25 ? 2 : 3;
    return { id: storm.id, label: storm.name ?? (storm.id === 'dustGlobal' ? 'Global dust storm' : 'Regional dust storm'),
      icon: '≋', tone: 'storm', intensity };
  }
  if (cold) return { id: 'cold', label: 'Cold snap', icon: 'COLD', tone: 'cold', intensity: 0 };
  if (futureUncertain) return { id: 'unknown', label: 'Forecast uncertain', icon: '?', tone: 'unknown', intensity: 0 };
  return { id: 'clear', label: 'Clear', icon: 'sun', tone: 'clear', intensity: 0 };
}

/** Pure adapter from Simulation.forecastWeather to HUD-ready cells. */
export function createForecastViewModel(current, projection, sol, count = 15) {
  const days = [current, ...(projection?.days ?? [])].slice(0, count + 1);
  const randomEventsUncertain = /future random events are uncertain/i.test(projection?.basis ?? '');
  const cells = days.map((day, index) => {
    const condition = conditionFor(day, index > 0 && randomEventsUncertain);
    const offset = index;
    return {
      sol: day.sol,
      offset,
      ...condition,
      slotLabel: offset === 0 ? 'Now' : `+${offset}`,
      dustFactor: day.dustFactor,
      solarFactor: day.solarFactor,
      heatingFactor: day.heatingFactor,
      outsideTempC: day.outsideTempC,
      windSpeedMps: day.windSpeedMps,
      active: structuredClone(day.active ?? []),
      solarOutputPct: Number.isFinite(day.solarFactor) ? Math.round(day.solarFactor * 100) : undefined,
      ariaLabel: `Sol ${day.sol}, ${condition.label}${offset ? `, ${offset} ${offset === 1 ? 'sol' : 'sols'} ahead` : ', current sol'}`,
    };
  });
  const stormIndex = cells.findIndex(cell => cell.tone === 'storm');
  let stormLength = 0;
  if (stormIndex >= 0) {
    for (let index = stormIndex; index < cells.length && cells[index].tone === 'storm'; index++) stormLength++;
  }
  const incomingStorm = stormIndex > 0 && stormIndex <= 10 ? cells[stormIndex] : null;
  const chip = stormIndex < 0
    ? randomEventsUncertain ? { text: 'Future weather uncertain', storm: false }
      : { text: `No storms in ${Math.max(0, cells.length - 1)} sols`, storm: false }
    : stormIndex === 0
      ? { text: `Sandstorm now · lasts ${stormLength} ${stormLength === 1 ? 'sol' : 'sols'}`, storm: true }
      : { text: `Sandstorm in ${stormIndex} ${stormIndex === 1 ? 'sol' : 'sols'} · lasts ${stormLength} ${stormLength === 1 ? 'sol' : 'sols'}`, storm: true };
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
