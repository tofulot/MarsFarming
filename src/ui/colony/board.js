// AI-assisted (Cursor)
import { drawBuildingSprite } from '../../rendering/buildingSprites.js';
import { colonyBoardAtZoom } from './layout.js';

/** Individual building silhouettes are presentation-only; IDs come from building data. */
function building(scene, group, unit, x, y, size, model) {
  const graphic = scene.add.graphics().setDepth(5);
  const color = unit.online ? 0xd8c6a6 : 0x83796e;
  graphic.fillStyle(0x38291f, 0.35).fillRoundedRect(x + 4, y + 10, size - 4, size - 9, 4);
  if (model.plot) {
    graphic.fillStyle(0x4f3224).fillRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(2, unit.id === 'hydroponic' ? 0x83bab6 : 0xc9bd9d);
    graphic.strokeRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(1, 0xa97e52, 0.55);
    for (let row = 1; row < 3; row++) graphic.lineBetween(x + 6, y + 4 + row * ((size - 8) / 3), x + size - 6, y + 4 + row * ((size - 8) / 3));
    for (let col = 1; col < 3; col++) graphic.lineBetween(x + 3 + col * ((size - 6) / 3), y + 6, x + 3 + col * ((size - 6) / 3), y + size - 6);
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
  } else if (!drawBuildingSprite(graphic, unit.id, x, y, size, unit.online)) {
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

function ghostBuilding(scene, group, x, y, size) {
  const graphic = scene.add.graphics().setDepth(8);
  graphic.lineStyle(2, 0x9bd8ae, 0.85);
  graphic.strokeRoundedRect(x + 4, y + 4, size - 8, size - 8, 5);
  graphic.fillStyle(0x9bd8ae, 0.18);
  graphic.fillRoundedRect(x + 4, y + 4, size - 8, size - 8, 5);
  group.add(graphic);
  group.add(scene.add.text(x + size / 2, y + size / 2, '＋', {
    fontFamily: 'Arial', fontSize: 16, color: '#cfeeda', fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(9).setAlpha(0.9));
}

function slotOffset(slot, size) {
  const col = slot % 3;
  const row = Math.floor(slot / 3);
  const cell = size / 3;
  return { x: col * cell + cell / 2, y: row * cell + cell / 2 };
}

export function drawColonyBoard(scene) {
  scene.tileLayer.clear(true, true);
  const { x: left, y: top, tile, row } = colonyBoardAtZoom(scene.boardZoom);
  const { buildings, crops, grid, rocks, rocket } = scene.sim.state;
  const definitions = new Map(scene.dataSet.buildings.map(item => [item.id, item]));
  const plants = [];
  const blocked = (x, y) => rocks?.some((rock) => rock.x === x && rock.y === y && rock.remaining > 0)
    || (rocket && rocket.x === x && rocket.y === y && rocket.status !== 'scrapped');

  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const px = left + x * tile, py = top + y * row;
      const unit = buildings.find(item => item.x === x && item.y === y);
      const plotCrops = unit ? crops.filter(item => item.plotUid === unit.uid) : [];
      const selected = scene.selected?.x === x && scene.selected?.y === y;
      const canGhost = Boolean(scene.tool) && !unit && !blocked(x, y);
      const baseAlpha = selected ? 0.2 : canGhost ? 0.08 : 0.025;
      const hit = scene.add.rectangle(px, py, tile - 1, row - 1, 0xc9a179, baseAlpha)
        .setOrigin(0).setDepth(2).setStrokeStyle(1, selected ? 0xf1d6a6 : canGhost ? 0x9bd8ae : 0xdbab7d,
          selected ? 0.9 : canGhost ? 0.55 : 0.11);
      hit.setInteractive({ useHandCursor: true }).on('pointerdown', () => scene.select(x, y))
        .on('pointerover', () => {
          hit.setFillStyle(canGhost ? 0x9bd8ae : 0xe6bd8b, canGhost ? 0.22 : 0.15);
          if (canGhost && !hit.getData('ghost')) {
            const ghost = scene.add.container(0, 0);
            ghostBuilding(scene, ghost, px + (tile - row) / 2, py, row - 1);
            scene.tileLayer.add(ghost);
            hit.setData('ghost', ghost);
          }
        })
        .on('pointerout', () => {
          hit.setFillStyle(0xc9a179, baseAlpha);
          const ghost = hit.getData('ghost');
          if (ghost) {
            ghost.destroy(true);
            hit.setData('ghost', null);
          }
        });
      scene.tileLayer.add(hit);
      if (canGhost && selected) ghostBuilding(scene, scene.tileLayer, px + (tile - row) / 2, py, row - 1);
      if (unit) {
        const bx = px + (tile - row) / 2;
        building(scene, scene.tileLayer, unit, bx, py, row - 1, definitions.get(unit.id));
        if (definitions.get(unit.id)?.plot) {
          for (const crop of plotCrops) {
            const slot = crop.slot ?? 0;
            const { x: ox, y: oy } = slotOffset(slot, row - 8);
            const cx = bx + 4 + ox;
            const cy = py + 4 + oy;
            plants.push({
              key: `crop-${crop.uid}`, id: crop.cropId, x: cx, y: cy + 2,
              size: 12 * (scene.boardZoom ?? 1), growth: crop.growth,
            });
            scene.tileLayer.add(scene.add.circle(cx, cy, 3.2, crop.growth >= 1 ? 0x8fca6d : 0xe0b36e).setDepth(19));
          }
        }
      }
    }
  }
  scene.presentation?.setPlants(plants);
}
