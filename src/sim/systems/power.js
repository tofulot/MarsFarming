// AI-assisted (OpenAI Codex)
import { lineagePhenotype } from './mutations.js';

export function powerSystem({ state, data, buildings, crops, emit }) {
  const { balance } = data;
  const active = state.events.active;
  const dust = active.reduce((factor, event) => Math.min(factor, event.effects.solarFactor ?? 1), 1);
  const heat = active.reduce((factor, event) => Math.max(factor, event.effects.heatFactor ?? 1), 1);
  const hours = data.seasons.orbit.solHours;
  const before = state.power.shed.length;
  state.power.solarFactor = state.power.clearSolarFactor * dust;
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
      unit.dust = Math.min(1 - balance.solarDustFloor, unit.dust + balance.solarDustLoss * (dust < 1 ? 3 : 1));
      state.power.gen += config.powerW * state.power.solarFactor * (1 - unit.dust);
    } else if (config.powerW > 0) {
      state.power.gen += config.powerW;
    } else if (config.powerW < 0) {
      const crop = state.crops.find(({ plotUid }) => plotUid === unit.uid);
      const traits = crops.get(crop?.cropId);
      const mods = lineagePhenotype(state, crop, data.mutations);
      const extra = traits ? Math.max(0, traits.ppf * (mods?.ppf ?? 1) - 28) * balance.wheatExtraWattsPerPpf +
        Math.max(0, traits.tempDayC - state.outsideTempC) * balance.heatWattsPerDegree * (mods?.heat ?? 1) * heat : 0;
      if ((config.plot && !crop) || (unit.id === 'washer' && !unit.pending)) continue;
      loads.push({ unit, watts: -config.powerW + extra });
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
