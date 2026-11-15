// AI-assisted (Cursor)
/** Once-per-mission fact cards tied to survival / progress milestones. */

import { progressFactByMilestone } from '../data/gameProgressFacts.js';

export function factByMilestone(facts, milestone) {
  return progressFactByMilestone(milestone)
    ?? (facts ?? []).find((fact) => fact.milestone === milestone)
    ?? null;
}

export function revealMilestoneFact(ctx, milestone, extra = {}) {
  const { state, data, emit } = ctx;
  if (!milestone) return null;
  state.metrics.seenFacts ??= {};
  if (Object.hasOwn(state.metrics.seenFacts, milestone)) return null;
  const fact = factByMilestone(data?.facts, milestone);
  if (!fact) return null;
  state.metrics.seenFacts[milestone] = state.sol;
  const card = {
    id: fact.id,
    milestone,
    title: fact.title ?? 'Mission fact',
    text: fact.text,
    survival: fact.survival ?? '',
    source: fact.source,
    url: fact.url,
    sol: state.sol,
    ...extra,
  };
  emit('fact:card', card);
  return card;
}

export function revealCropPlantFact(ctx, cropId, cropName) {
  const species = revealMilestoneFact(ctx, `first_plant_${cropId}`, { cropId, cropName });
  const first = revealMilestoneFact(ctx, 'first_plant', { cropId, cropName });
  return species ?? first;
}

export function revealCropHarvestFact(ctx, cropId, cropName) {
  const species = revealMilestoneFact(ctx, `first_harvest_${cropId}`, { cropId, cropName });
  const first = revealMilestoneFact(ctx, 'first_harvest', { cropId, cropName });
  return species ?? first;
}
