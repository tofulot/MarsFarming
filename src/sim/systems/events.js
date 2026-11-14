// AI-assisted (OpenAI Codex)
export function startEvent(ctx, id) {
  const { state, data, random, emit } = ctx;
  const event = data.events.find((entry) => entry.id === id);
  if (!event || state.events.active.some((entry) => entry.id === id)) return false;
  const [min, max] = event.durationSols;
  const active = { ...event, startedSol: state.sol, until: state.sol + min + Math.floor(random() * (max - min + 1)) };
  if (event.effects.equipmentFailure) {
    const machines = state.buildings.filter((b) => !['hab', 'berm'].includes(b.id) &&
      !state.events.active.some((other) => other.targetUid === b.uid));
    if (!machines.length) return false;
    active.targetUid = machines[Math.floor(random() * machines.length)].uid;
    if (state.res.spares > 0) {
      state.res.spares--;
      active.until = state.sol + 1;
    }
  }
  if (event.effects.unshieldedCropHealth && data.difficulty[state.difficulty].cropDeath) {
    for (const crop of state.crops) {
      const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
      if (!ctx.near(plot, 'berm')) crop.health = Math.max(0, crop.health - event.effects.unshieldedCropHealth);
    }
  }
  state.events.active.push(active);
  state.events.log.push({ id, name: event.name, sol: state.sol, fact: event.fact });
  emit('event:start', active);
  return true;
}

export function eventSystem(ctx) {
  const { state, data, random, emit } = ctx;
  for (const event of state.events.active.filter(({ until }) => until <= state.sol)) emit('event:end', event);
  state.events.active = state.events.active.filter(({ until }) => until > state.sol);
  for (const event of data.events) {
    if (event.hardOnly && state.difficulty !== 'hard') continue;
    if (event.once && state.events.log.some(({ id }) => id === event.id)) continue;
    const season = event.seasonMultiplier;
    const factor = season && state.Ls >= season.LsFrom && state.Ls < season.LsTo ? season.x : 1;
    if (random() < event.baseChancePerSol * factor * data.difficulty[state.difficulty].eventMult) {
      startEvent(ctx, event.id);
    }
  }
}
