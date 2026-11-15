// AI-assisted (OpenAI Codex)
import { lineagePhenotype } from './mutations.js';

export function powerSystem({ state, data, buildings, crops, emit, weather }) {
  const active = state.events.active;
  const hours = data.seasons.orbit.solHours;
  const before = state.power.shed.length;
  state.power.solarFactor = state.weather.solarFactor;
  state.power.gen = 0;
  state.power.demand = 0;
  state.power.shed = [];
  let capacityWh = 0;
  const loads = [];
  for (const unit of state.buildings) {
    const config = buildings.get(unit.id);
    unit.online = !active.some(({ targetUid }) => targetUid === unit.uid);
    if (!unit.online) continue;
    if (config.capacityWh) capacityWh += config.capacityWh;
    if (unit.id === 'solar') {
      const { generationW, dust } = weather.powerEffects({ weather: state.weather, ratedW: config.powerW,
        dust: unit.dust, advanceDust: true });
      unit.dust = dust;
      state.power.gen += generationW;
    } else if (config.powerW > 0) {
      state.power.gen += config.powerW;
    } else if (config.powerW < 0) {
      const crop = state.crops.find(({ plotUid }) => plotUid === unit.uid);
      const traits = crops.get(crop?.cropId);
      const mods = lineagePhenotype(state, crop, data.mutations);
      const adjusted = traits ? {
        ...traits,
        ppf: traits.ppf * (mods?.ppf ?? 1),
        tempDayC: traits.tempDayC,
      } : null;
      const heatScale = mods?.heat ?? 1;
      const watts = adjusted
        ? (() => {
          const effect = weather.cropEffects(adjusted, state.weather,
            { basePowerW: -config.powerW, includedPpf: 28 });
          return effect.baseW + effect.lightW + effect.heatW * heatScale;
        })()
        : -config.powerW + (unit.id === 'hab' ? state.weather.habitatHeatW ?? 0 : 0);
      if ((config.plot && !crop) || (unit.id === 'washer' && !unit.pending)) continue;
      loads.push({ unit, watts });
    }
  }
  const priority = (unit) => {
    if (unit.id === 'hab') return -2;
    const rank = state.power.priority.indexOf(unit.id);
    return rank < 0 ? state.power.priority.length : rank;
  };
  loads.sort((a, b) => priority(a.unit) - priority(b.unit));
  state.res.batteryWh = Math.min(capacityWh, state.res.batteryWh);
  let available = state.power.gen + state.res.batteryWh / hours;
  let allocated = 0;
  for (const { unit, watts } of loads) {
    state.power.demand += watts;
    unit.online = available + 1e-9 >= watts;
    if (unit.online) {
      available -= watts;
      allocated += watts;
    } else state.power.shed.push(unit.uid);
  }
  state.res.batteryWh = Math.max(0, Math.min(capacityWh, state.res.batteryWh + (state.power.gen - allocated) * hours));
  if (state.power.shed.length) state.metrics.shortages++;
  if (!before && state.power.shed.length) emit('power:shortage', { shed: state.power.shed });
}
