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

export function waterSupply({ state, data: { balance }, site, buildings }) {
  const live = state.buildings.filter(({ online }) => online);
  const production = live.reduce((sum, unit) =>
    sum + waterOutput(buildings.get(unit.id), site, balance, state.rescue), 0);
  const crewWater = -buildings.get('hab').waterLPerSol * state.crew.n / balance.crew;
  const recycled = live.some(({ id }) => id === 'recycler') ? balance.recycleFraction : 0;
  return { production, crewDemand: crewWater * (1 - recycled) };
}

export function queueSoilWashing({ state, data: { balance } }) {
  const plots = state.buildings.filter(({ id, treated }) => id === 'plot' && !treated).length;
  let batches = Math.ceil(plots / balance.washerBatchPlots);
  for (const washer of state.buildings.filter(({ id }) => id === 'washer')) {
    const failed = state.events.active.some(({ targetUid }) => targetUid === washer.uid);
    if (failed) continue;
    if (batches > 0) {
      if (!washer.pending) washer.washStatus = 'queued';
      washer.pending = true;
      batches--;
    } else if (washer.pending) {
      washer.pending = false;
      washer.washStatus = 'idle';
    }
  }
}

export function waterSystem(ctx) {
  const { state, data: { balance }, buildings, emit } = ctx;
  const { production, crewDemand } = waterSupply(ctx);
  state.water = { production, demand: 0 };
  state.res.waterL = Math.min(balance.waterCapacity, state.res.waterL + production);
  const draw = (liters) => {
    state.water.demand += liters;
    if (state.res.waterL < liters) return false;
    state.res.waterL -= liters;
    return true;
  };
  state.crew.hydrated = draw(crewDemand);
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
