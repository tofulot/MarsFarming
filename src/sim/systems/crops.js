// AI-assisted (OpenAI Codex)
// Lineage phenotype from Mendelian genotype: AI-assisted (Cursor Grok)
import { accumulateStress, lineagePhenotype } from './mutations.js';
import { addToPantry } from './nutrition.js';
import { soilYieldMultiplier } from './soil.js';

const growthPerSol = (traits, plot, balance, growthMod = 1) =>
  (plot.id === 'hydroponic' ? balance.hydroGrowth : 1) / (traits.growthSols * growthMod);

export function cropSolsRemaining(traits, plot, balance, growth = 0, growthMod = 1) {
  return Math.max(0, Math.ceil((1 - growth) / growthPerSol(traits, plot, balance, growthMod) - 1e-9));
}

export function cropSystem(ctx) {
  const { state, data, crops, emit } = ctx;
  const mode = data.difficulty[state.difficulty];
  for (const crop of state.crops) {
    const plot = state.buildings.find(({ uid }) => uid === crop.plotUid);
    const traits = crops.get(crop.cropId);
    const pheno = lineagePhenotype(state, crop, data.mutations);
    const soilOk = plot.treated || pheno.perchlorate > 0;
    if (plot.online && plot.watered && soilOk) {
      crop.growth = Math.min(1, crop.growth + growthPerSol(traits, plot, data.balance, pheno.growth) + 1e-12);
      crop.health = Math.min(1, crop.health + .01);
    } else if (mode.cropDeath) {
      crop.health = Math.max(0, crop.health - mode.stressDamage);
    }
    if (data.mutations && crop.stress) accumulateStress(crop, plot, ctx);
    if (crop.health <= 0) emit('crop:died', { ...crop, name: traits.name });
  }
  state.crops = state.crops.filter(({ health }) => health > 0);
}

function harvestYield(ctx, crop, plot) {
  const { state, data, crops } = ctx;
  const traits = crops.get(crop.cropId);
  const pheno = lineagePhenotype(state, crop, data.mutations);
  const fertilized = ctx.near(plot, 'fertilizer', (building) => building.online && building.watered);
  const multiplier = plot.id === 'hydroponic'
    ? (fertilized ? data.balance.fertilizerYield : 1)
    : soilYieldMultiplier(plot, data, fertilized);
  if (!plot.treated) return 0;
  const fullYieldKg = traits.harvestKg ?? traits.yieldDry_g_m2_d * traits.growthDays * data.balance.plotAreaM2 / 1000;
  return fullYieldKg * pheno.yield * crop.health * multiplier;
}

export function harvestPreview(ctx, crop, plot) {
  const kg = harvestYield(ctx, crop, plot);
  const credits = Math.round(kg * ctx.crops.get(crop.cropId).value_cr_per_kg);
  return { kg, credits, unsafe: !plot.treated };
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
  const { kg, credits, unsafe } = harvestPreview(ctx, crop, plot);
  if (kg > 0) addToPantry(state, crop.cropId, kg);
  else state.res.foodKg += kg;
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
  state.metrics.packets.push({ amount: research, total: research, discovery });
  state.crops = state.crops.filter(({ uid }) => uid !== crop.uid);
  emit('harvest', { name: traits.name, kg, credits, unsafe });
  if (unsafe) return `Harvested ${traits.name}, flagged unsafe until the soil is treated.`;
  return `Harvested ${kg.toFixed(1)} kg of ${traits.name} (+${credits} cr).`;
}

export function queueCrossDiscovery(ctx, crop, traits, child, lab) {
  if (!lab || !child.mutation) return;
  const { state, data } = ctx;
  const trait = child.mutation.flips[0]?.locus ?? 'allele';
  const key = `${crop.cropId}:${state.seasonIdx}:${trait}`;
  if (state.journal[key]) return;
  state.journal[key] = {
    name: `${traits.name} ${trait}`, season: state.season, transmitted: false, mutation: child.mutation.kind,
  };
  const points = data.mutations.sciencePointsOnDownlink;
  state.res.data += points;
  state.metrics.packets.push({ amount: points, total: points, discovery: key });
}
