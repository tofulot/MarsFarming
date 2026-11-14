// AI-assisted (OpenAI Codex)
export function waterSystem({ state, data, site, buildings }) {
  const { balance } = data;
  const live = state.buildings.filter(({ online }) => online);
  const production = live.reduce((sum, unit) => {
    const config = buildings.get(unit.id);
    return sum + Math.max(0, config.waterLPerSol) * (config.scalesWith ? site.iceFactor : 1);
  }, 0);
  state.res.waterL = Math.min(balance.waterCapacity, state.res.waterL + production);
  const draw = (liters) => {
    if (state.res.waterL < liters) return false;
    state.res.waterL -= liters;
    return true;
  };
  const crewWater = -buildings.get('hab').waterLPerSol;
  const recycled = live.some(({ id }) => id === 'recycler') ? balance.recycleFraction : 0;
  state.crew.hydrated = draw(crewWater * (1 - recycled));
  if (!state.crew.hydrated) state.metrics.lowWaterSols++;
  for (const unit of state.buildings) {
    unit.watered = false;
    if (!unit.online || unit.id === 'hab') continue;
    const config = buildings.get(unit.id);
    if (unit.id === 'washer') {
      if (!unit.pending || !draw(balance.washerBatchWaterL)) continue;
      state.buildings.filter((plot) => plot.id === 'plot' && !plot.treated)
        .slice(0, balance.washerBatchPlots).forEach((plot) => { plot.treated = true; });
      unit.pending = false;
    } else if (!config.plot || state.crops.some(({ plotUid }) => plotUid === unit.uid)) {
      unit.watered = draw(Math.max(0, -config.waterLPerSol));
    }
  }
}
