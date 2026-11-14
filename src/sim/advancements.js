export const advancements = [
  { id: 'stranded', name: 'Stranded', requires: [], position: [1, 0],
    hint: 'Build two greenhouse plots and a Soil Washer before your rations run out. One plot cannot feed you indefinitely.' },
  { id: 'greenhouse', name: 'First Greenhouse', requires: ['stranded'], position: [0, 1],
    hint: 'Select an empty tile and buy a Greenhouse Plot. Build two plots to grow enough food between harvests.' },
  { id: 'soil', name: 'Ready to Grow', requires: ['greenhouse'], position: [0, 2],
    hint: 'Build a Soil Washer. Queue Treat soil and advance one sol with power and water.' },
  { id: 'botanist', name: 'Botanist', requires: ['soil'], position: [0, 3],
    hint: 'Plant both plots. Radishes mature in 8 healthy sols. Unlocks colony naming and the Ice Drill.' },
  { id: 'harvest', name: 'First Harvest', requires: ['botanist'], position: [0, 4], credits: 70,
    hint: 'Harvest a mature crop to replenish food. Spend the reward on water or power and replant immediately.' },
  { id: 'repeatHarvest', name: 'Second Harvest', requires: ['harvest'], position: [0, 5], credits: 55,
    hint: 'Harvest a second crop. Unlocks Fertilizer Makers and longer-growing crops.' },
  { id: 'farm', name: 'A Growing Farm', requires: ['repeatHarvest'], position: [0, 6], credits: 85,
    hint: 'Harvest from three different plots. Unlocks Hydroponic Bays.' },
  { id: 'water', name: 'Water on Mars', requires: ['botanist'], position: [1, 4], credits: 35,
    hint: 'Power an Ice Drill. Greenhouses recycle irrigation water, but crops and crew still need a steady supply. Unlocks Water Recyclers and Air Harvesters.' },
  { id: 'colony', name: 'Colony Named', requires: ['botanist'], position: [2, 4],
    hint: 'Choose Name colony in Achievements after planting your first crop.' },
  { id: 'power', name: 'Backup Power', requires: ['stranded'], position: [2, 1],
    hint: 'Build a Battery Bank. Extra solar power charges it for dust storms.' },
  { id: 'charged', name: 'Storm Ready', requires: ['power'], position: [2, 2],
    hint: 'Store 10,000 Wh in your batteries. Unlocks Shield Berms and Storm Shelters.' },
  { id: 'downlink', name: 'First Downlink', requires: ['harvest'], position: [1, 5], credits: 30,
    hint: 'Keep the Comms Dish powered to transmit research from a harvest. Unlocks the Science Lab.' },
  { id: 'halfway', name: 'Halfway Home', requires: ['stranded'], position: [3, 1],
    hint: 'Survive until the countdown reaches its halfway point. Unlocks the Fission Unit.' },
  { id: 'rescue', name: 'Rescued', requires: ['halfway'], position: [3, 2],
    hint: 'Stay alive until the countdown ends. Keep planting and harvesting to stretch your rations.' },
];

const rewards = {
  iceDrill: 'botanist',
  fertilizer: 'repeatHarvest',
  tomato: 'repeatHarvest',
  potato: 'repeatHarvest',
  sweetPotato: 'repeatHarvest',
  wheat: 'repeatHarvest',
  soybean: 'repeatHarvest',
  hydroponic: 'farm',
  recycler: 'water',
  harvester: 'water',
  berm: 'charged',
  shelter: 'charged',
  lab: 'downlink',
  nuclear: 'halfway',
};

export function missingAdvancement(rescue, itemId) {
  const id = rewards[itemId];
  if (rescue && id && !Object.hasOwn(rescue.earned, id)) {
    return advancements.find((entry) => entry.id === id).name;
  }
}

export function advancementAvailable(rescue, entry) {
  return entry.requires.every((id) => Object.hasOwn(rescue.earned, id));
}

export function earnAdvancement({ state, emit }, id) {
  const rescue = state.rescue;
  if (!rescue || Object.hasOwn(rescue.earned, id)) return;
  const award = advancements.find((entry) => entry.id === id);
  if (!advancementAvailable(rescue, award)) return;
  rescue.earned[id] = state.sol;
  state.res.credits += award.credits ?? 0;
  emit('advancement', award);
}

export function nextAdvancement(rescue) {
  return advancements.find((entry) => !Object.hasOwn(rescue.earned, entry.id) && advancementAvailable(rescue, entry));
}
