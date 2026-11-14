export const advancements = [
  { id: 'greenhouse', name: 'First Greenhouse', requires: [], position: [0, 0],
    hint: 'Select an empty tile, then buy a Greenhouse Plot from the base shop.' },
  { id: 'water', name: 'Water on Mars', requires: [], position: [1, 0],
    hint: 'Build an Ice Drill and advance a sol with the drill powered.' },
  { id: 'soil', name: 'Ready to Grow', requires: ['greenhouse'], position: [0, 1],
    hint: 'Build a Soil Washer, select Treat soil, and advance one sol with power and water.' },
  { id: 'power', name: 'Backup Power', requires: [], position: [1, 1],
    hint: 'Build a Battery Bank. Extra solar power charges it for dust storms.' },
  { id: 'botanist', name: 'Botanist', requires: ['soil'], position: [0, 2],
    hint: 'Select a treated plot and plant a crop. Radishes mature in 24 healthy sols.' },
  { id: 'harvest', name: 'First Harvest', requires: ['botanist'], position: [0, 3],
    hint: 'Keep the crop powered and watered. When it is ready, select Harvest and replant.' },
  { id: 'farm', name: 'A Growing Farm', requires: ['harvest'], position: [0, 4],
    hint: 'Harvest from three different plots. Stagger your planting so food arrives between harvests.' },
  { id: 'rescue', name: 'Rescued', requires: [], position: [1, 4],
    hint: 'Stay alive until the rescue countdown ends. Keep planting and harvesting to stretch your rations.' },
];

export function earnAdvancement({ state, emit }, id) {
  if (!state.rescue || Object.hasOwn(state.rescue.earned, id)) return;
  const award = advancements.find((entry) => entry.id === id);
  state.rescue.earned[id] = state.sol;
  emit('advancement', award);
}

export function nextAdvancement(rescue) {
  const ready = advancements.filter(({ id, requires }) => !Object.hasOwn(rescue.earned, id) &&
    requires.every((parent) => Object.hasOwn(rescue.earned, parent)));
  return ready.find(({ position: [column] }) => column === 0) ?? ready[0];
}
