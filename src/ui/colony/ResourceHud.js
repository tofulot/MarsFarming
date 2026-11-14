import { label, plate } from './widgets.js';

export function createResourceHud(scene, sim, foodPerCrew) {
  const group = scene.add.group();
  plate(scene, group, 970, 16, 290, 128, 0x422a24, 0.94);
  const values = [];
  const fields = [
    [sim.state.rescue ? 'RESCUE IN' : 'MISSION', s => sim.state.rescue ? `${Math.max(0, s.rescue.arrivalSol - s.sol)} sols` : `${s.sol} / ${s.solLimit}`],
    ['CREDITS', s => Math.round(s.res.credits).toLocaleString()],
    ['POWER', s => `${(s.power.gen / 1000).toFixed(1)} / ${(s.power.demand / 1000).toFixed(1)} kW`],
    ['BATTERY', s => `${(s.res.batteryWh / 1000).toFixed(1)} kWh`],
    ['WATER', s => `${Math.round(s.res.waterL)} L`],
    ['FOOD', s => `${Math.floor(s.res.foodKg / (foodPerCrew * s.crew.n))} sols`],
    ['SCIENCE / LINK', s => `${Math.round(s.res.sp)} SP · ${s.power.comms} /sol`],
    ['HEALTH / DOSE', s => `${Math.round(s.crew.health * 100)}% · ${Math.round(s.crew.dose_mSv)} mSv`]
  ];
  fields.forEach(([title], index) => {
    const x = 982 + (index % 2) * 142, y = 24 + Math.floor(index / 2) * 30;
    label(scene, group, x, y, title, 9, { color: '#d5ad8d', fontStyle: 'bold' });
    values.push(label(scene, group, x, y + 11, '', 14));
  });
  const refresh = () => fields.forEach(([, get], index) => values[index].setText(get(sim.state)));
  refresh();
  return { refresh };
}
