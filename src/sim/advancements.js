export const advancements = [
  { id: 'stranded', name: 'Stranded', requires: [], position: [1, 0],
    hint: 'Rescue is on its way. Build a greenhouse before your rations run out.' },
  { id: 'greenhouse', name: 'First Greenhouse', requires: ['stranded'], position: [0, 1],
    hint: 'Select an empty tile, then buy a Greenhouse Plot from the base shop.' },
  { id: 'soil', name: 'Ready to Grow', requires: ['greenhouse'], position: [0, 2],
    hint: 'Build a Soil Washer, select Treat soil, and advance one sol with power and water.' },
  { id: 'botanist', name: 'Botanist', requires: ['soil'], position: [0, 3],
    hint: 'Plant a crop in a treated plot. Radishes mature in 24 healthy sols. Botanist unlocks colony naming.' },
  { id: 'harvest', name: 'First Harvest', requires: ['botanist'], position: [0, 4],
    hint: 'Keep the crop powered and watered. When it is ready, select Harvest and replant.' },
  { id: 'farm', name: 'A Growing Farm', requires: ['harvest'], position: [0, 5],
    hint: 'Harvest from three different plots. Stagger your planting so food arrives between harvests.' },
  { id: 'water', name: 'Water on Mars', requires: ['stranded'], position: [1, 1],
    hint: 'Build an Ice Drill and advance a sol with the drill powered.' },
  { id: 'power', name: 'Backup Power', requires: ['stranded'], position: [2, 1],
    hint: 'Build a Battery Bank. Extra solar power charges it for dust storms.' },
  { id: 'halfway', name: 'Halfway Home', requires: ['stranded'], position: [3, 1],
    hint: 'Survive until the rescue countdown reaches its halfway point.' },
  { id: 'rescue', name: 'Rescued', requires: ['halfway'], position: [3, 2],
    hint: 'Stay alive until the countdown ends. Keep planting and harvesting to stretch your rations.' },
];

export function advancementAvailable(rescue, entry) {
  return entry.requires.every((id) => Object.hasOwn(rescue.earned, id));
}

export function earnAdvancement({ state, emit }, id) {
  const rescue = state.rescue;
  if (!rescue || Object.hasOwn(rescue.earned, id)) return;
  const award = advancements.find((entry) => entry.id === id);
  if (!advancementAvailable(rescue, award)) return;
  rescue.earned[id] = state.sol;
  emit('advancement', award);
}

export function nextAdvancement(rescue) {
  return advancements.find((entry) => !Object.hasOwn(rescue.earned, entry.id) && advancementAvailable(rescue, entry));
}
