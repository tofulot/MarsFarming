// AI-assisted (OpenAI Codex)
// Lineage growth and stress log: AI-assisted (Cursor Grok)
import { accumulateStress, resolveChild } from './mutations.js';

export function cropSystem(ctx) {
  const { state, data, crops, emit } = ctx;
  const mode = data.difficulty[state.difficulty];
  for (const crop of state.crops) {
    const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
    const traits = crops.get(crop.cropId);
    const mods = state.lineages[crop.lineageId]?.mods;
    const growthSols = traits.growthSols * (mods?.growth ?? 1);
    const soilOk = plot.treated || (mods?.perchlorate ?? 0) > 0;
    if (plot.online && plot.watered && soilOk) {
      const multiplier = plot.id === 'hydroponic' ? data.balance.hydroGrowth : 1;
      crop.growth = Math.min(1, crop.growth + multiplier / growthSols + 1e-12);
      crop.health = Math.min(1, crop.health + .01);
    } else if (mode.cropDeath) {
      crop.health = Math.max(0, crop.health - mode.stressDamage);
    }
    if (data.mutations && crop.stress) accumulateStress(crop, plot, ctx);
    if (crop.health <= 0) emit('crop:died', { ...crop, name: traits.name });
  }
  state.crops = state.crops.filter(({ health }) => health > 0);
}

export function harvestCrop(ctx, crop, plot, { saveSeed = false } = {}) {
  const { state, data, crops, emit } = ctx;
  const traits = crops.get(crop.cropId);
  const mods = state.lineages[crop.lineageId]?.mods;
  const fertilized = ctx.near(plot, 'fertilizer', (building) => building.online && building.watered);
  const multiplier = fertilized ? data.balance.fertilizerYield : 1;
  const unsafe = !plot.treated;
  const kg = unsafe ? 0 : traits.yieldDry_g_m2_d * (mods?.yield ?? 1) * traits.growthDays
    * data.balance.plotAreaM2 * crop.health * multiplier / 1000;
  const credits = Math.round(kg * traits.value_cr_per_kg);
  state.res.foodKg += kg;
  state.res.credits += credits;
  state.metrics.grownKg += kg;
  const lab = state.buildings.some((unit) => unit.id === 'lab' && unit.online && unit.watered);
  const journalKey = `${crop.cropId}:${state.seasonIdx}`;
  let research = data.balance.harvestResearch;
  let discovery;
  if (!unsafe && !state.journal[journalKey] && lab) {
    discovery = journalKey;
    state.journal[discovery] = { name: traits.name, season: state.season, transmitted: false };
    research += data.balance.discoveryResearch;
  }
  state.res.data += research;
  state.metrics.packets.push({ amount: research, discovery });
  let saved = '';
  const parent = state.lineages[crop.lineageId];
  if (saveSeed && parent && data.mutations) {
    const child = resolveChild(parent, crop, ctx);
    saved = ` Saved seed, generation ${child.generation}.`;
    queueMutation(ctx, crop, traits, child.mutation, lab);
  } else if (state.seedVault[crop.cropId] === crop.lineageId) {
    delete state.seedVault[crop.cropId];
  }
  state.crops = state.crops.filter(({ uid }) => uid !== crop.uid);
  emit('harvest', { name: traits.name, kg, credits, unsafe });
  if (unsafe) return `Harvested ${traits.name}, flagged unsafe until the soil is treated.${saved}`;
  return `Harvested ${kg.toFixed(1)} kg of ${traits.name} (+${credits} cr).${saved}`;
}

function queueMutation(ctx, crop, traits, mutation, lab) {
  if (!mutation || !lab) return;
  const { state, data } = ctx;
  const key = `${crop.cropId}:${state.seasonIdx}:${mutation.trait}`;
  if (state.journal[key]) return;
  state.journal[key] = {
    name: `${traits.name} ${mutation.trait}`, season: state.season, transmitted: false, mutation: mutation.kind,
  };
  const points = data.mutations.sciencePointsOnDownlink;
  state.res.data += points;
  state.metrics.packets.push({ amount: points, discovery: key });
}
