// AI-assisted (Cursor Grok)
// Lineages change when harvested seed is saved. Each sol only adds stress.
// Dose uses balance.crewRadiationPerSol (S11). Chances and clamps live in mutations.json.

export function identityMods() {
  return { ppf: 1, heat: 1, yield: 1, growth: 1, rad: 0, perchlorate: 0 };
}

export function emptyStress() {
  return { dose_mSv: 0, lowPowerSols: 0, coldSols: 0, drySols: 0, perchlorateSols: 0 };
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function createLineage(state, cropId) {
  const id = `L${state.nextLineageId++}`;
  state.lineages[id] = { id, cropId, generation: 1, parentId: null, mods: identityMods(), log: [] };
  return state.lineages[id];
}

export function lineageForPlant(state, cropId) {
  return state.lineages[state.seedVault[cropId]] ?? createLineage(state, cropId);
}

export function dominantStress(stress, rules, dosePerSol) {
  const scores = {
    dose: dosePerSol > 0 ? stress.dose_mSv / dosePerSol : 0,
    cold: stress.coldSols,
    lowPower: stress.lowPowerSols,
    dry: stress.drySols,
    perchlorate: stress.perchlorateSols,
  };
  let bestKey = rules.stressPriority[0];
  let best = -Infinity;
  for (const key of rules.stressPriority) {
    const score = scores[key] ?? 0;
    if (score > best) {
      best = score;
      bestKey = key;
    }
  }
  return { key: bestKey, score: best };
}

export function accumulateStress(crop, plot, ctx) {
  const rules = ctx.data.mutations;
  const dosePerSol = ctx.data.balance.crewRadiationPerSol;
  const bermed = ctx.near(plot, 'berm');
  const active = ctx.state.events.active;
  let dose = dosePerSol;
  if (bermed) dose *= rules.bermDoseFactor;
  if (active.some((event) => event.id === 'spe')) dose *= rules.speDoseMultiplier;
  crop.stress.dose_mSv += dose;
  if (!plot.online) crop.stress.lowPowerSols += 1;
  if (active.some((event) => (event.effects.heatFactor ?? 1) > 1)) crop.stress.coldSols += 1;
  if (!plot.watered) crop.stress.drySols += 1;
  if (!plot.treated) crop.stress.perchlorateSols += 1;
}

function shiftMod(mods, key, delta, clamps) {
  const [lo, hi] = clamps[key];
  const before = mods[key];
  mods[key] = clamp(before + delta, lo, hi);
  return mods[key] - before;
}

export function resolveChild(parent, crop, ctx) {
  const { state, data, random } = ctx;
  const rules = data.mutations;
  const mods = { ...parent.mods };
  const born = [];
  const dominant = dominantStress(crop.stress, rules, data.balance.crewRadiationPerSol);
  const push = (key, delta, kind) => {
    const applied = shiftMod(mods, key, delta, rules.clamps);
    if (applied !== 0) born.push({ sol: state.sol, kind, trait: key, delta: applied });
    return applied;
  };
  if (crop.health >= rules.selectionMinHealth && dominant.score > 0) {
    const spec = rules.traits[dominant.key];
    push(spec.mod, spec.beneficial * rules.selectionNudge, 'selection');
    if (spec.mod !== rules.selectionYieldPrice.mod) {
      push(rules.selectionYieldPrice.mod, rules.selectionYieldPrice.sign * rules.selectionNudge, 'selection');
    }
  }
  let chance = rules.baseChancePerGeneration * rules.difficultyMult[state.difficulty]
    * (1 + crop.stress.dose_mSv / rules.doseScale_mSv);
  chance = clamp(chance, 0, rules.maxChance);
  let mutation = null;
  if (random() < chance) {
    if (random() < rules.deleteriousFraction) {
      const pick = rules.deleteriousMods[Math.floor(random() * rules.deleteriousMods.length)];
      const applied = push(pick.mod, pick.sign * rules.deleteriousDelta, 'deleterious');
      if (applied !== 0) mutation = { kind: 'deleterious', trait: pick.mod, delta: applied };
    } else {
      const spec = rules.traits[dominant.key];
      const applied = push(spec.mod, spec.beneficial * rules.beneficialDelta, 'beneficial');
      if (applied !== 0) mutation = { kind: 'beneficial', trait: spec.mod, delta: applied };
    }
  }
  const child = {
    id: `L${state.nextLineageId++}`,
    cropId: parent.cropId,
    generation: parent.generation + 1,
    parentId: parent.id,
    mods,
    log: parent.log.concat(born),
    mutation,
  };
  state.lineages[child.id] = child;
  state.seedVault[parent.cropId] = child.id;
  return child;
}
