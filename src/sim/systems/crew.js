// AI-assisted (OpenAI Codex)
export function crewSystem({ state, data }) {
  const { balance } = data;
  const crew = state.crew;
  const foodNeeded = crew.n * balance.foodPerCrew;
  const fed = state.res.foodKg >= foodNeeded;
  const consumed = Math.min(foodNeeded, state.res.foodKg);
  state.res.foodKg -= consumed;
  state.metrics.consumedKg += consumed;
  crew.fedStreak = fed ? crew.fedStreak + 1 : 0;
  const powered = state.buildings.some(({ id, online }) => id === 'hab' && online);
  if (powered) state.metrics.powerSafe++;
  if (state.Ls >= 180) {
    state.metrics.stormSols++;
    if (powered && fed && crew.hydrated) state.metrics.stormSafe++;
  }
  const shelter = state.buildings.some(({ id, online }) => id === 'shelter' && online);
  const radiation = state.events.active.reduce((dose, event) =>
    dose + (event.effects.crewDose_mSv ?? 0) / (event.durationSols[1] || 1), 0);
  crew.dose_mSv += balance.crewRadiationPerSol + radiation * (shelter ? balance.shelterDoseMultiplier : 1);
  const stress = Number(!fed) + Number(!crew.hydrated) + Number(!powered);
  const radiationStress = state.difficulty === 'easy' ? 0 : radiation * (shelter ? 0.0002 : 0.001);
  crew.health = Math.max(0, Math.min(1, crew.health +
    (stress ? -balance.healthLoss * stress : balance.healthRecovery) - radiationStress));
  crew.morale = Math.max(0, Math.min(1, crew.morale + (fed ? .01 : -.02)));
}
