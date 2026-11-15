const groups = [
  { id: 'habitat', label: 'Habitat', buildingIds: ['hab'], essential: true },
  { id: 'greenhouses', label: 'Greenhouses', buildingIds: ['plot', 'hydroponic', 'washer', 'autoHarvester', 'fertilizer'] },
  { id: 'water', label: 'Water systems', buildingIds: ['iceDrill', 'recycler', 'harvester'] },
  { id: 'comms', label: 'Comms & science', buildingIds: ['comms', 'lab'] },
  { id: 'support', label: 'Support', buildingIds: ['shelter'] },
];

export function powerLoadGroupFor(buildingId) {
  return groups.find(({ id, buildingIds }) => id === buildingId || buildingIds.includes(buildingId)) ?? null;
}

export function powerLoadSnapshot(state, data) {
  const definitions = new Map(data.buildings.map(item => [item.id, item]));
  return groups.map(group => {
    // A crashed, unrepaired Comms Dish is not a load until it is repaired.
    const buildings = state.buildings.filter(unit => group.buildingIds.includes(unit.id) && !unit.broken);
    const units = buildings.filter(unit => definitions.get(unit.id)?.powerW < 0);
    return {
      id: group.id,
      label: group.label,
      essential: Boolean(group.essential),
      count: units.length,
      enabled: units.length > 0 && units.every(unit => unit.loadEnabled !== false),
      useW: units.reduce((sum, unit) => {
        if (unit.loadEnabled === false) return sum;
        if (Number.isFinite(unit.requestedW)) return sum + unit.requestedW;
        if (unit.online === false) return sum;
        const model = definitions.get(unit.id);
        if ((model.plot && !state.crops.some(crop => crop.plotUid === unit.uid)) ||
            (unit.id === 'washer' && !unit.pending)) return sum;
        return sum + Math.max(0, -model.powerW);
      }, 0),
    };
  }).filter(group => group.count > 0);
}
