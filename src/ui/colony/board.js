import { colonyLayout } from './layout.js';

/** Individual building silhouettes are presentation-only; IDs come from building data. */
function building(scene, group, unit, x, y, size, model) {
  const graphic = scene.add.graphics().setDepth(5);
  const color = unit.online ? 0xd8c6a6 : 0x83796e;
  graphic.fillStyle(0x38291f, 0.35).fillRoundedRect(x + 4, y + 10, size - 4, size - 9, 4);
  if (model.plot) {
    graphic.fillStyle(0x4f3224).fillRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(2, unit.id === 'hydroponic' ? 0x83bab6 : 0xc9bd9d);
    graphic.strokeRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(1, 0xa97e52, 0.6);
    for (let row = 1; row < 4; row++) graphic.lineBetween(x + 6, y + row * 8, x + size - 6, y + row * 8);
  } else if (unit.id === 'solar') {
    graphic.fillStyle(0x263a4b).fillRect(x + 3, y + 5, size - 6, size - 12);
    graphic.lineStyle(1, 0x91afb0);
    graphic.strokeRect(x + 3, y + 5, size - 6, size - 12);
    for (let i = 1; i < 3; i++) graphic.lineBetween(x + 3 + i * (size - 6) / 3, y + 5, x + 3 + i * (size - 6) / 3, y + size - 7);
    graphic.lineBetween(x + 3, y + 18, x + size - 3, y + 18);
    graphic.lineBetween(x + 8, y + size - 7, x + 6, y + size - 2);
    graphic.lineBetween(x + size - 8, y + size - 7, x + size - 6, y + size - 2);
    if ((unit.dust ?? 0) > 0.01) {
      const dustAlpha = Math.min(0.72, unit.dust * 0.8);
      graphic.fillStyle(0xd4a16a, dustAlpha).fillRect(x + 4, y + 6, (size - 8) * Math.min(1, unit.dust * 1.6), size - 15);
      graphic.lineStyle(1, 0xf0c180, Math.min(0.7, unit.dust));
      for (let mark = 0; mark < 3; mark++) {
        const sx = x + 7 + mark * (size - 14) / 3;
        graphic.lineBetween(sx, y + 9, sx + 3, y + 15);
      }
    }
  } else {
    graphic.fillStyle(color).fillRoundedRect(x + 7, y + 4, size - 14, size - 10, unit.id === 'hab' ? 10 : 4);
    graphic.fillStyle(0x78968d).fillRect(x + 11, y + 9, size - 22, 6);
    graphic.lineStyle(2, 0x6d6757).lineBetween(x + 10, y + size - 9, x + size - 10, y + size - 9);
    if (unit.id === 'comms') {
      graphic.fillStyle(0xe8debf).fillEllipse(x + size / 2, y + 6, size - 12, 12);
      graphic.lineStyle(2, 0x847c67).lineBetween(x + size / 2, y + 6, x + size / 2 + 6, y - 1);
    }
    group.add(scene.add.text(x + size / 2, y + 22, model.sprite, {
      fontFamily: 'Arial', fontSize: 8, fontStyle: 'bold', color: '#403a31'
    }).setOrigin(0.5).setDepth(6));
  }
  group.add(graphic);
}

export function drawColonyBoard(scene) {
  scene.tileLayer.clear(true, true);
  const { x: left, y: top, tile, row } = colonyLayout.board;
  const { buildings, crops, grid } = scene.sim.state;
  const definitions = new Map(scene.dataSet.buildings.map(item => [item.id, item]));
  const plants = [];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const px = left + x * tile, py = top + y * row;
      const unit = buildings.find(item => item.x === x && item.y === y);
      const crop = unit && crops.find(item => item.plotUid === unit.uid);
      const selected = scene.selected?.x === x && scene.selected?.y === y;
      const hit = scene.add.rectangle(px, py, tile - 1, row - 1, 0xc9a179, selected ? 0.2 : 0.025)
        .setOrigin(0).setDepth(2).setStrokeStyle(1, selected ? 0xf1d6a6 : 0xdbab7d, selected ? 0.9 : 0.11);
      hit.setInteractive({ useHandCursor: true }).on('pointerdown', () => scene.select(x, y))
        .on('pointerover', () => hit.setFillStyle(0xe6bd8b, 0.15))
        .on('pointerout', () => hit.setFillStyle(0xc9a179, selected ? 0.2 : 0.025));
      scene.tileLayer.add(hit);
      if (unit) building(scene, scene.tileLayer, unit, px + (tile - row) / 2, py, row - 1, definitions.get(unit.id));
      if (crop) {
        plants.push({ key: `crop-${crop.uid}`, id: crop.cropId, x: px + tile / 2, y: py + row - 7, size: 26, growth: crop.growth });
        scene.tileLayer.add(scene.add.rectangle(px + 5, py + row - 4, tile - 10, 4, 0x37251c, 0.9).setOrigin(0).setDepth(18));
        scene.tileLayer.add(scene.add.rectangle(px + 5, py + row - 4, (tile - 10) * crop.growth, 4,
          crop.growth >= 1 ? 0x9ed27c : 0xe0b36e).setOrigin(0).setDepth(19));
        if (crop.growth >= 1) {
          scene.tileLayer.add(scene.add.circle(px + tile - 7, py + 5, 5, 0x8fca6d).setDepth(19));
          scene.tileLayer.add(scene.add.text(px + tile - 7, py + 5, '✓', { fontSize: 8, color: '#26351f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(20));
        }
      }
    }
  }
  scene.presentation?.setPlants(plants);
}
