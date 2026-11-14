import { action, label, plate } from './widgets.js';
import { cropSolsRemaining } from '../../sim/systems/crops.js';
import { waterOutput } from '../../sim/systems/water.js';
import { shopCategories } from './catalog.js';

export function drawActionDock(scene, group) {
  const { sim } = scene;
  const previews = [];
  plate(scene, group, 20, 548, 1240, 112, 0x38221d);
  const tab = scene.dockTab ?? 'seeds';
  const cell = scene.selected;
  const unit = cell && sim.state.buildings.find(item => item.x === cell.x && item.y === cell.y);
  if (tab === 'seeds') {
    scene.dataSet.crops.forEach(({ id }, index) => {
      const crop = sim.cropTraits(id);
      const requirement = sim.unlockRequirement(crop);
      const foodCost = sim.plantingFoodCost?.(id);
      const x = 32 + index * 122;
      const card = plate(scene, group, x, 556, 112, 72, requirement ? 0x513c31 : 0x9b7858);
      card.setDepth(20);
      label(scene, group, x + 56, 611, crop.name, 11, { fontStyle: 'bold' }).setOrigin(0.5);
      const growthSols = cropSolsRemaining(crop, unit ?? { id: 'plot' }, scene.dataSet.balance);
      label(scene, group, x + 56, 623, requirement ? 'LOCKED'
        : `${growthSols} sols${Number.isFinite(foodCost) ? ` · ${foodCost.toFixed(1)} kg food` : ''}`, 9).setOrigin(0.5);
      previews.push({ key: `preview-${id}`, id, x: x + 56, y: 603, size: 30, growth: 1 });
      card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (requirement) { scene.notify(`${crop.name} requires ${requirement}.`); return; }
        const plot = unit && scene.dataSet.buildings.find(item => item.id === unit.id)?.plot;
        if (plot) {
          if (Number.isFinite(foodCost) && sim.state.res.foodKg < foodCost) {
            scene.notify(`Planting ${crop.name} needs ${foodCost.toFixed(1)} kg of food.`);
            return;
          }
          scene.run({ type: 'plant', id, uid: unit.uid });
        } else {
          scene.seedTool = id;
          scene.tool = null;
          scene.notify(`Select an empty, treated greenhouse to plant ${crop.name}${Number.isFinite(foodCost) ? ` · ${foodCost.toFixed(1)} kg food` : ''}.`);
        }
      });
    });
  } else {
    shopCategories.forEach((category, index) => action(scene, group, 32 + index * 210, 556, 200, 22, category.name, () => {
      scene.shopCategory = category;
      scene.tool = null;
      scene.drawSide();
    }, scene.shopCategory.name === category.name));
    scene.shopCategory.items.forEach((id, index) => {
      const item = scene.dataSet.buildings.find(building => building.id === id);
      if (!item) return;
      const price = sim.purchasePrice(item);
      const requirement = sim.unlockRequirement(item);
      const detail = requirement ? `Requires ${requirement}` : `${price} cr`;
      const { site, rescue } = sim.state;
      const name = id === 'iceDrill'
        ? `${item.name} · ${waterOutput(item, site, scene.dataSet.balance, rescue).toFixed(1)} L/sol` : item.name;
      action(scene, group, 32 + index * 210, 585, 200, 43,
        `${name}\n${detail}`, () => {
          if (requirement) { scene.notify(`${item.name} requires ${requirement}.`); return; }
          if (sim.state.res.credits < price) { scene.notify(`Need ${price - sim.state.res.credits} more credits.`); return; }
          scene.seedTool = null;
          if (cell && !unit) scene.placeStructure(id, cell);
          else {
            scene.tool = scene.tool === id ? null : id;
            scene.notify(`Select an empty tile for ${item.name}.`);
            scene.drawSide();
          }
        }, scene.tool === id);
    });
  }
  const tabs = [
    ['Seeds', () => { scene.dockTab = 'seeds'; }],
    ['Buildings', () => { scene.dockTab = 'buildings'; }],
    ['Base shop', () => {
      scene.showShopDetails = !scene.showShopDetails || scene.showWeather || scene.showTimers || scene.showAdvancements;
      scene.selected = null;
      scene.showWeather = false; scene.showTimers = false; scene.showAdvancements = false;
    }],
    ['Weather', () => { scene.showWeather = !scene.showWeather; scene.showTimers = false; scene.showAdvancements = false; }],
    ['Timers', () => { scene.showTimers = !scene.showTimers; scene.showWeather = false; scene.showAdvancements = false; }]
  ];
  if (sim.state.rescue) tabs.push(['Achievements', () => {
    scene.showAdvancements = !scene.showAdvancements; scene.showTimers = false; scene.showWeather = false;
  }]);
  tabs.forEach(([name, callback], index) => action(scene, group, 32 + index * 138, 636, 130, 19, name.toUpperCase(), () => {
    callback(); scene.drawSide();
  }, name.toLowerCase() === tab));
  label(scene, group, 922, 557, `SOL ${sim.state.sol}  ·  ${sim.state.season.toUpperCase()}`, 12, { fontStyle: 'bold' });
  label(scene, group, 922, 579, `Queued data ${sim.state.res.data}  ·  Shed loads ${sim.state.power.shed.length}`, 11);
  [0, 1, 2, 4].forEach((speed, index) => action(scene, group, 920 + index * 61, 636, 55, 19,
    speed ? `${speed}×` : 'Pause', () => scene.run({ type: 'setSpeed', speed }, false), sim.state.speed === speed));
  action(scene, group, 1164, 636, 82, 19, '+1 sol', () => { scene.acc = 0; sim.step(); });
  return previews;
}
