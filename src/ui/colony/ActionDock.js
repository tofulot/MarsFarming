import { action, label, plate } from './widgets.js';
import { cropSolsRemaining } from '../../sim/systems/crops.js';

export function drawActionDock(scene, group) {
  const { sim } = scene;
  const previews = [];
  plate(scene, group, 20, 607, 1240, 98, 0x38221d);
  const cell = scene.selected;
  const unit = cell && sim.state.buildings.find(item => item.x === cell.x && item.y === cell.y);
  scene.dataSet.crops.forEach(({ id }, index) => {
    const crop = sim.cropTraits(id);
    const requirement = sim.unlockRequirement(crop);
    const foodCost = sim.plantingFoodCost(id);
    const x = 32 + index * 122;
    const card = plate(scene, group, x, 615, 112, 82, requirement ? 0x513c31 : 0x9b7858);
    card.setDepth(20);
    label(scene, group, x + 56, 674, crop.name, 11, { fontStyle: 'bold' }).setOrigin(0.5);
    const growthSols = cropSolsRemaining(crop, unit ?? { id: 'plot' }, scene.dataSet.balance);
    label(scene, group, x + 56, 689, requirement ? 'LOCKED'
      : `${growthSols} sols${foodCost ? ` · ${foodCost.toFixed(1)} kg food` : ''}`, 9).setOrigin(0.5);
    previews.push({ key: `preview-${id}`, id, x: x + 56, y: 666, size: 30, growth: 1 });
    card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (requirement) { scene.notify(`${crop.name} requires ${requirement}.`); return; }
      const plot = unit && scene.dataSet.buildings.find(item => item.id === unit.id)?.plot;
      if (plot) {
        if (sim.state.res.foodKg + 1e-9 < foodCost) {
          scene.notify(`Planting ${crop.name} needs ${foodCost.toFixed(1)} kg of food.`);
          return;
        }
        scene.run({ type: 'plant', id, uid: unit.uid });
      } else {
        scene.seedTool = id;
        scene.tool = null;
        const cost = foodCost ? ` · ${foodCost.toFixed(1)} kg food` : '';
        scene.notify(`Select an empty, treated greenhouse to plant ${crop.name}${cost}.`);
      }
    });
  });
  label(scene, group, 922, 620, `SOL ${sim.state.sol} · ${sim.state.season.toUpperCase()}`, 12, { fontStyle: 'bold' });
  [0, 1, 2, 4].forEach((speed, index) => action(scene, group, 920 + index * 61, 650, 55, 30,
    speed ? `${speed}×` : 'Pause', () => scene.run({ type: 'setSpeed', speed }, false), sim.state.speed === speed));
  action(scene, group, 1164, 650, 82, 30, '+1 sol', () => { scene.acc = 0; sim.step(); });
  return previews;
}
