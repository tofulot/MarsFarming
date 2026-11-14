// AI-assisted (OpenAI Codex)
export function irrigationMakeup(grossLiters, balance, rescue) {
  return grossLiters * (rescue ? 1 - balance.rescue.greenhouseRecovery : 1);
}

export function waterOutput(building, site, balance, rescue) {
  const output = Math.max(0, building.waterLPerSol);
  if (building.scalesWith !== 'site.iceFactor') return output;
  const richness = Math.max(0, (site.iceFactor - 0.5) / 0.5);
  const bonus = rescue ? balance.rescue.richIceBonus * richness : 0;
  return output * site.iceFactor * (1 + bonus);
}

export function waterSystem({ state, data, site, buildings, emit }) {
  const { balance } = data;
  const live = state.buildings.filter(({ online }) => online);
  const production = live.reduce((sum, unit) =>
    sum + waterOutput(buildings.get(unit.id), site, balance, state.rescue), 0);
  state.res.waterL = Math.min(balance.waterCapacity, state.res.waterL + production);
  const draw = (liters) => {
    if (state.res.waterL < liters) return false;
    state.res.waterL -= liters;
    return true;
  };
  const crewWater = -buildings.get('hab').waterLPerSol * state.crew.n / balance.crew;
  const recycled = live.some(({ id }) => id === 'recycler') ? balance.recycleFraction : 0;
  state.crew.hydrated = draw(crewWater * (1 - recycled));
  if (!state.crew.hydrated) state.metrics.lowWaterSols++;
  for (const unit of state.buildings) {
    unit.watered = false;
    if (unit.id === 'washer') {
      if (!unit.pending) continue;
      const plots = state.buildings.filter((plot) => plot.id === 'plot' && !plot.treated)
        .slice(0, balance.washerBatchPlots);
      if (!plots.length) {
        unit.pending = false;
        unit.washStatus = 'idle';
        continue;
      }
      if (!unit.online || !draw(balance.washerBatchWaterL)) {
        unit.washStatus = unit.online ? 'water' : 'power';
        continue;
      }
      plots.forEach((plot) => { plot.treated = true; });
      unit.pending = false;
      unit.washStatus = 'complete';
      emit('wash:complete', { plots: plots.length });
      continue;
    }
    if (!unit.online || unit.id === 'hab') continue;
    const config = buildings.get(unit.id);
    if (!config.plot || state.crops.some(({ plotUid }) => plotUid === unit.uid)) {
      const liters = Math.max(0, -config.waterLPerSol);
      unit.watered = draw(config.plot ? irrigationMakeup(liters, balance, state.rescue) : liters);
    }
  }
}
