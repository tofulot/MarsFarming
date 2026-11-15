// AI-assisted (OpenAI Codex; comms goals by Claude Code)
export const advancements = [
  { id: 'stranded', name: 'Stranded', requires: [], position: [1, 0],
    hint: 'Build two greenhouse plots and a Soil Washer before your rations run out. One plot cannot feed you indefinitely.' },
  { id: 'greenhouse', name: 'First Greenhouse', requires: ['stranded'], position: [0, 1],
    hint: 'Select an empty tile and buy a Greenhouse Plot. Build two plots to grow enough food between harvests.' },
  { id: 'soil', name: 'Ready to Grow', requires: ['greenhouse'], position: [0, 2],
    hint: 'Build a Soil Washer and advance one sol. It treats soil automatically with power and water.' },
  { id: 'botanist', name: 'Botanist', requires: ['soil'], position: [0, 3],
    hint: 'Plant both plots. Radishes mature in 8 healthy sols. Unlocks the Ice Drill.' },
  { id: 'harvest', name: 'First Harvest', requires: ['botanist'], position: [0, 4], credits: 70,
    hint: 'Harvest a mature crop to replenish food. Spend the reward on water or power and replant immediately.' },
  { id: 'repeatHarvest', name: 'Second Harvest', requires: ['harvest'], position: [0, 5], credits: 55,
    hint: 'Harvest a second crop. Unlocks Fertilizer Makers and Auto-Harvesters.' },
  { id: 'farm', name: 'A Growing Farm', requires: ['repeatHarvest'], position: [0, 6], credits: 85,
    hint: 'Harvest from three different plots. Unlocks Hydroponic Bays.' },
  { id: 'water', name: 'Water on Mars', requires: ['botanist'], position: [1, 4], credits: 35,
    hint: 'Power an Ice Drill for one sol. Dry sites may need several drills. Unlocks Water Recyclers and Air Harvesters.' },
  { id: 'colony', name: 'Colony Named', requires: ['halfway'], position: [3, 3],
    hint: 'Reach Halfway Home, then click the colony name in the top bar to name your colony.' },
  { id: 'power', name: 'Backup Power', requires: ['stranded'], position: [2, 1],
    hint: 'Build a Battery Bank. Extra solar power charges it for dust storms.' },
  { id: 'charged', name: 'Storm Ready', requires: ['power'], position: [2, 2],
    hint: 'Store 10,000 Wh in your batteries. Unlocks Shield Berms and Storm Shelters.' },
  { id: 'phoneHome', name: 'Phone Home', requires: ['stranded'], position: [1, 1],
    hint: 'Select the crashed Comms Dish and repair it with build materials. Once powered it can order seeds and downlink research.' },
  { id: 'delivery', name: 'Special Delivery', requires: ['phoneHome'], position: [1, 2], credits: 30,
    hint: 'Order seeds from the repaired, powered Comms Dish. When the supply crate lands near the base, select it and collect it.' },
  { id: 'downlink', name: 'First Downlink', requires: ['harvest', 'phoneHome'], position: [2, 5], credits: 30,
    hint: 'Keep the repaired Comms Dish powered to transmit research from a harvest. Unlocks the Science Lab.' },
  { id: 'halfway', name: 'Halfway Home', requires: ['stranded'], position: [3, 1],
    hint: 'Survive until the countdown reaches its halfway point. Unlocks the Fission Unit and colony naming.' },
  { id: 'rescue', name: 'Rescued', requires: ['halfway'], position: [3, 2],
    hint: 'Stay alive until the countdown ends. Keep planting and harvesting to stretch your rations.' },
];

const rewards = {
  iceDrill: 'botanist',
  fertilizer: 'repeatHarvest',
  autoHarvester: 'repeatHarvest',
  // Later crops are no longer milestone rewards: they arrive by seed order (see Simulation.unlockRequirement).
  // Extra dishes unlock once the crashed one is repaired, so building one never undercuts the repair.
  comms: 'phoneHome',
  hydroponic: 'farm',
  recycler: 'water',
  harvester: 'water',
  berm: 'charged',
  shelter: 'charged',
  lab: 'downlink',
  nuclear: 'halfway',
};

// Unlocks that are features rather than shop items.
const featureUnlocks = {
  halfway: ['Colony naming'],
  phoneHome: ['Seed orders', 'Research downlink'],
};

export function missingAdvancement(rescue, itemId) {
  const id = rewards[itemId];
  if (rescue && id && !Object.hasOwn(rescue.earned, id)) {
    return advancements.find((entry) => entry.id === id).name;
  }
}

export function advancementUnlocks(id, data) {
  const names = new Map([...data.buildings, ...data.crops].map(item => [item.id, item.name]));
  return Object.entries(rewards).filter(([, advancementId]) => advancementId === id)
    .map(([itemId]) => names.get(itemId)).filter(Boolean)
    .concat(featureUnlocks[id] ?? []);
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
