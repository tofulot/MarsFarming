// AI-assisted (OpenAI Codex)
import { clearSolarFactor } from './insolation.js';
import { WORLD_GRID } from './state.js';

export function manifestCatalog(data) {
  return [...data.buildings.filter(({ id, massKg }) => id !== 'hab' && massKg > 0), ...data.balance.kit];
}

export function checkManifest(data, { landerId, items = {}, budget, siteId }) {
  const lander = data.landers.find(({ id }) => id === landerId);
  const site = data.sites.find(({ id }) => id === siteId);
  const catalog = manifestCatalog(data);
  const reasons = [];
  let massKg = 0;
  let cost = lander?.cost ?? 0;
  let count = 0;
  if (!lander) reasons.push('Choose a lander.');
  if (!Number.isFinite(budget) || budget < 0) reasons.push('Invalid mission budget.');
  if (siteId && !site) reasons.push('Choose a landing site.');
  for (const [id, qty] of Object.entries(items)) {
    const item = catalog.find((entry) => entry.id === id);
    if (!item || !Number.isSafeInteger(qty) || qty < 0) {
      reasons.push('Invalid cargo item or quantity.');
      continue;
    }
    count += item.powerW === undefined ? 0 : qty;
    massKg += item.massKg * qty;
    cost += item.cost * qty;
  }
  if (lander && massKg > lander.capacityKg) reasons.push(`Cargo mass exceeds capacity by ${massKg - lander.capacityKg} kg.`);
  if (cost > budget) reasons.push(`Mission costs ${cost - budget} kg of build materials over budget.`);
  if (count > WORLD_GRID.w * WORLD_GRID.h - data.balance.starter.length) reasons.push('The outpost has insufficient space for this payload.');
  const solar = site ? clearSolarFactor(site.lat, 0, data.seasons.orbit) : 1;
  const starterPower = data.balance.starter.reduce((total, starter) => {
    const power = data.buildings.find(({ id }) => id === starter.id).powerW;
    return total + Math.max(0, power) * solar;
  }, 0);
  const packedPower = data.buildings.reduce((total, building) => total +
    Math.max(0, building.powerW) * (items[building.id] ?? 0)
      * (building.id === 'solar' ? solar : 1), 0);
  const startPower = starterPower + packedPower;
  const support = Math.abs(data.buildings.find(({ id }) => id === 'hab').powerW);
  if (startPower < support) reasons.push(`Life support needs ${support} W. Pack more generating capacity.`);
  return { ok: reasons.length === 0, massKg, cost, reasons, startPower };
}
