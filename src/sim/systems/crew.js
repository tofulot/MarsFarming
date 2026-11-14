// AI-assisted (OpenAI Codex)
// Satiety + diet quality health: AI-assisted (Cursor Grok)
import { drawMeal } from './nutrition.js';

export function crewSystem({ state, data }) {
  const { balance } = data;
  const diet = balance.diet;
  const crew = state.crew;
  const foodNeeded = crew.n * balance.foodPerCrew;
  const meal = drawMeal(state, data, foodNeeded);
  crew.meal = meal;
  crew.satiety = meal.satiety;
  crew.nutrition = meal.nutrition;
  state.metrics.consumedKg += meal.eatenKg;
  const fed = meal.satiety >= 0.999;
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

  const hunger = 1 - meal.satiety;
  const poorDiet = meal.satiety > 0 ? Math.max(0, 1 - meal.nutrition) : 1;
  const lifeSupportStress = Number(!crew.hydrated) + Number(!powered);
  const radiationStress = state.difficulty === 'easy' ? 0 : radiation * (shelter ? 0.0002 : 0.001);
  const hungerLoss = state.rescue
    ? balance.rescue.starvationDamage * hunger
    : diet.healthLossHunger * hunger;

  let delta = -balance.healthLoss * lifeSupportStress
    - hungerLoss
    - diet.healthLossPoorDiet * poorDiet
    - radiationStress;
  if (meal.satiety >= diet.wellFedSatiety && meal.nutrition >= diet.wellFedNutrition && powered && crew.hydrated) {
    delta += diet.healthRecoveryWellFed;
  } else if (!hunger && !poorDiet && !lifeSupportStress) {
    delta += balance.healthRecovery;
  }

  crew.health = Math.max(0, Math.min(1, crew.health + delta));
  crew.morale = Math.max(0, Math.min(1, crew.morale
    + (fed ? .01 : -.02)
    + (meal.nutrition >= diet.wellFedNutrition ? .005 : -.01)));
}
