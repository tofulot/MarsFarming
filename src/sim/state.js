// AI-assisted (OpenAI Codex)
export function createState(data, options, launch) {
  const { seed, difficulty, objectiveId, siteId, landerId, manifest } = options;
  const mode = data.difficulty[difficulty];
  return {
    seed, difficulty, objectiveId, siteId, landerId, manifest: { ...manifest },
    sol: 0, Ls: 0, seasonIdx: 0, solLimit: Math.ceil(data.seasons.yearSols), speed: 1,
    status: 'active', endReason: '', grid: { w: 16, h: 12 },
    res: { credits: mode.budget - launch.cost, sp: 0, data: 0, waterL: mode.startWater,
      foodKg: mode.startFood, pantry: { rations: mode.startFood },
      batteryWh: 0, massUsed: launch.massKg, spares: manifest.spares ?? 0,
      materials: { regolith: 0, metal: 0 } },
    power: { gen: 0, demand: 0, solarFactor: 1, priority: [], shed: [], comms: 0 },
    crew: {
      n: data.balance.crew, health: 1, morale: 1, dose_mSv: 0, fedStreak: 0,
      satiety: 1, nutrition: 1, meal: null, rationing: 'normal',
    },
    buildings: [], crops: [], lineages: {}, seedVault: {}, nextLineageId: 1,
    rocks: [], rocket: null, events: { active: [], log: [] }, journal: {}, objectives: {},
    badges: [], decisions: [], score: { total: 0, parts: {} },
    metrics: { grownKg: 0, consumedKg: 0, transmitted: 0, packets: [],
      stormSols: 0, stormSafe: 0, powerSafe: 0, lowWaterSols: 0, shortages: 0 },
  };
}
