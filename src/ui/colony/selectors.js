import { advancements, advancementUnlocks } from '../../sim/advancements.js';
import { powerLoadSnapshot } from '../../sim/powerLoads.js';

export const LOW_FOOD_SOL_THRESHOLD = 5;

export function selectFoodRunway(state, balance) {
  const factor = balance.rationing?.[state.crew.rationing] ?? 1;
  const perSol = state.crew.n * balance.foodPerCrew * factor;
  return perSol > 0 ? Math.floor(state.res.foodKg / perSol) : 0;
}

function goalProgress(id, state) {
  const earned = state.rescue?.earned ?? {};
  const built = (buildingId) => state.buildings.some(unit => unit.id === buildingId);
  const treatedPlots = state.buildings.filter(unit => unit.id === 'plot' && unit.treated).length;
  const targetSols = state.rescue?.arrivalSol ?? state.solLimit;
  const values = {
    stranded: [Number(Boolean(state.rescue)), 1, ''],
    greenhouse: [Number(built('plot')), 1, ''],
    soil: [Math.min(1, treatedPlots), 1, 'plots'],
    botanist: [Number(Boolean(earned.botanist)), 1, ''],
    harvest: [Math.min(1, state.rescue?.harvests ?? Number(Boolean(earned.harvest))), 1, 'harvests'],
    repeatHarvest: [Math.min(2, state.rescue?.harvests ?? 0), 2, 'harvests'],
    farm: [Math.min(3, state.rescue?.harvestedPlots?.length ?? 0), 3, 'plots'],
    water: [Number(Boolean(earned.water)), 1, ''],
    colony: [Number(Boolean(state.rescue?.colonyName)), 1, ''],
    power: [Number(built('battery')), 1, ''],
    charged: [Math.min(10000, state.res.batteryWh), 10000, 'Wh'],
    downlink: [Math.min(5, state.metrics.transmitted), 5, 'packets'],
    halfway: [Math.min(Math.ceil(targetSols / 2), state.sol), Math.ceil(targetSols / 2), 'sols'],
    rescue: [Math.min(targetSols, state.sol), targetSols, 'sols'],
  };
  return values[id] ?? [Number(Boolean(earned[id])), 1, ''];
}

export function selectGoals(state, data) {
  if (!state.rescue) return [];
  return advancements.map(entry => {
    const [progress, target, unit] = goalProgress(entry.id, state);
    const done = Object.hasOwn(state.rescue.earned, entry.id);
    return {
      id: entry.id,
      title: entry.name,
      description: entry.hint,
      progress: done ? target : Math.min(target, progress),
      target,
      unit,
      done,
      unlocked: advancements.filter(candidate => candidate.requires.includes(entry.id)).map(candidate => candidate.name),
      unlocks: advancementUnlocks(entry.id, data),
      earnedSol: state.rescue.earned[entry.id] ?? null,
    };
  });
}

export function selectColonyUiState(sim, data, foodPerCrew = data.balance.foodPerCrew) {
  const state = sim.state;
  const foodSols = selectFoodRunway(state, data.balance);
  const batteryCapacityWh = state.buildings.reduce((sum, unit) => {
    const model = data.buildings.find(item => item.id === unit.id);
    return sum + (model?.capacityWh ?? 0);
  }, 0);
  return {
    sol: state.sol,
    season: state.season,
    rescueIn: state.rescue ? Math.max(0, state.rescue.arrivalSol - state.sol) : null,
    credits: state.res.credits,
    power: { genW: state.power.gen, useW: state.power.demand },
    battery: { currentWh: state.res.batteryWh, capacityWh: batteryCapacityWh },
    waterL: state.res.waterL,
    foodSols,
    foodLow: foodSols <= LOW_FOOD_SOL_THRESHOLD,
    speed: state.speed,
    colonyName: state.rescue?.colonyName || 'Unnamed colony',
    terrain: 'NASA MOLA relief',
    loads: powerLoadSnapshot(state, data),
    rationing: state.crew.rationing ?? 'normal',
    goals: selectGoals(state, data),
  };
}
