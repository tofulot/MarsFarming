// AI-assisted (OpenAI Codex)
const growthPerSol = (traits, plot, balance) =>
  (plot.id === 'hydroponic' ? balance.hydroGrowth : 1) / traits.growthSols;

export function cropSolsRemaining(traits, plot, balance, growth = 0) {
  return Math.max(0, Math.ceil((1 - growth) / growthPerSol(traits, plot, balance) - 1e-9));
}

export function cropSystem({ state, data, crops, emit }) {
  const mode = data.difficulty[state.difficulty];
  for (const crop of state.crops) {
    const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
    const traits = crops.get(crop.cropId);
    if (plot.online && plot.watered && plot.treated) {
      crop.growth = Math.min(1, crop.growth + growthPerSol(traits, plot, data.balance) + 1e-12);
      crop.health = Math.min(1, crop.health + .01);
    } else if (mode.cropDeath) {
      crop.health = Math.max(0, crop.health - mode.stressDamage);
    }
    if (crop.health <= 0) emit('crop:died', { ...crop, name: traits.name });
  }
  state.crops = state.crops.filter(({ health }) => health > 0);
}

function harvestYield(ctx, crop, plot) {
  const { data: { balance }, crops } = ctx;
  const traits = crops.get(crop.cropId);
  const fertilized = ctx.near(plot, 'fertilizer', (building) => building.online && building.watered);
  const multiplier = fertilized ? balance.fertilizerYield : 1;
  const fullYieldKg = traits.harvestKg ?? traits.yieldDry_g_m2_d * traits.growthDays * balance.plotAreaM2 / 1000;
  return fullYieldKg * crop.health * multiplier;
}

export function harvestPreview(ctx, crop, plot) {
  const kg = harvestYield(ctx, crop, plot);
  const credits = Math.round(kg * ctx.crops.get(crop.cropId).value_cr_per_kg);
  return { kg, credits };
}

export function expectedFoodPerSol(ctx) {
  const { state, crops, data: { balance } } = ctx;
  return state.crops.reduce((supply, crop) => {
    const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
    if (!plot.online || (!plot.watered && crop.plantedSol < state.sol)) return supply;
    return supply + harvestYield(ctx, crop, plot) / cropSolsRemaining(crops.get(crop.cropId), plot, balance);
  }, 0);
}

export function harvestCrop(ctx, crop, plot) {
  const { state, data, crops, emit } = ctx;
  const traits = crops.get(crop.cropId);
  const { kg, credits } = harvestPreview(ctx, crop, plot);
  state.res.foodKg += kg;
  state.res.credits += credits;
  state.metrics.grownKg += kg;
  const journalKey = `${crop.cropId}:${state.seasonIdx}`;
  let research = data.balance.harvestResearch;
  let discovery;
  if (!state.journal[journalKey] && state.buildings.some((unit) => unit.id === 'lab' && unit.online && unit.watered)) {
    discovery = journalKey;
    state.journal[discovery] = { name: traits.name, season: state.season, transmitted: false };
    research += data.balance.discoveryResearch;
  }
  state.res.data += research;
  state.metrics.packets.push({ amount: research, total: research, discovery });
  state.crops = state.crops.filter(({ uid }) => uid !== crop.uid);
  emit('harvest', { name: traits.name, kg, credits });
  return `Harvested ${kg.toFixed(1)} kg of ${traits.name} (+${credits} cr).`;
}
