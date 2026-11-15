// AI-assisted (Cursor Grok)
// Pantry meals: satiety from mass eaten, diet quality from crop nutrition profiles (game values).

export function pantryTotal(pantry) {
  return Object.values(pantry).reduce((sum, kg) => sum + kg, 0);
}

export function syncFoodKg(state) {
  state.res.foodKg = pantryTotal(state.res.pantry);
  return state.res.foodKg;
}

export function addToPantry(state, cropId, kg) {
  if (!(kg > 0)) return;
  state.res.pantry[cropId] = (state.res.pantry[cropId] ?? 0) + kg;
  syncFoodKg(state);
}

export function removeFromPantry(state, kg) {
  const amount = Math.max(0, kg);
  const total = pantryTotal(state.res.pantry);
  if (amount > total + 1e-9) return false;
  for (const [id, stock] of Object.entries(state.res.pantry)) {
    const take = Math.min(stock, total > 0 ? amount * stock / total : 0);
    state.res.pantry[id] = stock - take;
    if (state.res.pantry[id] < 1e-9) delete state.res.pantry[id];
  }
  syncFoodKg(state);
  return true;
}

export function nutritionOf(cropId, data) {
  if (cropId === 'rations') return data.balance.diet.starterRations;
  const crop = data.crops.find(({ id }) => id === cropId);
  return crop?.nutrition ?? { kcal_per_kg: 2500, protein_g_per_kg: 80, micronutrient: 0.4 };
}

// Draw a meal proportional to pantry stocks. Returns intake summary.
export function drawMeal(state, data, needKg) {
  const pantry = state.res.pantry;
  const available = pantryTotal(pantry);
  const target = Math.max(0, needKg);
  const takeTotal = Math.min(target, available);
  const portions = {};
  if (available > 0 && takeTotal > 0) {
    for (const [id, kg] of Object.entries(pantry)) {
      const share = (kg / available) * takeTotal;
      if (share <= 0) continue;
      portions[id] = share;
      pantry[id] = kg - share;
      if (pantry[id] < 1e-9) delete pantry[id];
    }
  }
  syncFoodKg(state);

  let kcal = 0;
  let protein = 0;
  let micro = 0;
  for (const [id, kg] of Object.entries(portions)) {
    const profile = nutritionOf(id, data);
    kcal += kg * profile.kcal_per_kg;
    protein += kg * profile.protein_g_per_kg;
    micro += kg * profile.micronutrient;
  }

  const crew = state.crew.n;
  const diet = data.balance.diet;
  const satiety = target > 0 ? Math.min(1, takeTotal / target) : 1;
  const kcalScore = Math.min(1, kcal / (crew * diet.kcalPerCrew));
  const proteinScore = Math.min(1, protein / (crew * diet.protein_gPerCrew));
  const microScore = takeTotal > 0 ? Math.min(1, (micro / takeTotal) / diet.micronutrientTarget) : 0;
  const nutrition = takeTotal > 0 ? (kcalScore + proteinScore + microScore) / 3 : 0;

  return {
    needKg: target,
    eatenKg: takeTotal,
    portions,
    kcal,
    protein,
    satiety,
    nutrition,
    kcalScore,
    proteinScore,
    microScore,
  };
}
