// AI-assisted (Claude Code: world-sized board, shared transform, single input zone)
import { drawBuildingSprite } from '../../rendering/buildingSprites.js';
import { boardTransform, panBoard, playArea, tileAtPoint, tileFullyVisible, visibleTiles, zoomBoard } from './layout.js';

/** Individual building silhouettes are presentation-only; IDs come from building data. */
function building(scene, group, unit, x, y, size, model, labels) {
  const graphic = scene.add.graphics().setDepth(5).setMask(scene.boardMask);
  const color = unit.online ? 0xd8c6a6 : 0x83796e;
  // Drawn sprites carry their own ground shadow; only plots and solar keep the pad.
  if (model.plot || unit.id === 'solar') graphic.fillStyle(0x38291f, 0.35).fillRoundedRect(x + 4, y + 10, size - 4, size - 9, 4);
  if (model.plot) {
    graphic.fillStyle(0x4f3224).fillRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(2, unit.id === 'hydroponic' ? 0x83bab6 : 0xc9bd9d);
    graphic.strokeRoundedRect(x + 3, y + 4, size - 6, size - 8, 4);
    graphic.lineStyle(1, 0xa97e52, 0.6);
    for (let row = 1; row < 4; row++) graphic.lineBetween(x + 6, y + row * size / 4.5, x + size - 6, y + row * size / 4.5);
  } else if (unit.id === 'solar') {
    graphic.fillStyle(0x263a4b).fillRect(x + 3, y + 5, size - 6, size - 12);
    graphic.lineStyle(1, 0x91afb0);
    graphic.strokeRect(x + 3, y + 5, size - 6, size - 12);
    for (let i = 1; i < 3; i++) graphic.lineBetween(x + 3 + i * (size - 6) / 3, y + 5, x + 3 + i * (size - 6) / 3, y + size - 7);
    graphic.lineBetween(x + 3, y + size / 2, x + size - 3, y + size / 2);
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
    if (labels) {
      group.add(scene.add.text(x + size / 2, y + size * 0.6, model.sprite, {
        fontFamily: 'Arial', fontSize: Math.max(7, Math.round(size / 4.5)), fontStyle: 'bold', color: '#403a31'
      }).setOrigin(0.5).setDepth(6));
    }
  }
  group.add(graphic);
}

/** One-time setup: shared play-area mask, hover outline, and a single input zone for the board. */
function ensureBoardInput(scene) {
  if (scene.boardInput) return;
  const clip = scene.make.graphics({ add: false });
  clip.fillStyle(0xffffff).fillRect(playArea.left, playArea.top, playArea.width, playArea.height);
  scene.boardMask = clip.createGeometryMask();
  scene.presentation?.cropLayer?.image?.setMask(scene.boardMask);
  const hover = scene.add.graphics().setDepth(4).setMask(scene.boardMask);
  const zone = scene.add.zone(playArea.left, playArea.top, playArea.width, playArea.height)
    .setOrigin(0).setDepth(1).setInteractive({ useHandCursor: true });
  const drag = { active: false, moved: false, x: 0, y: 0, panX: 0, panY: 0 };
  const cellAt = (pointer) => tileAtPoint(boardTransform(scene), scene.sim.state.grid, pointer.x, pointer.y);
  const showHover = (pointer) => {
    hover.clear();
    const cell = !drag.moved && cellAt(pointer);
    if (!cell) return;
    const t = boardTransform(scene);
    hover.fillStyle(0xe6bd8b, 0.15).fillRect(t.x + cell.x * t.tile, t.y + cell.y * t.row, t.tile - 1, t.row - 1);
    hover.lineStyle(1, 0xf1d6a6, 0.5).strokeRect(t.x + cell.x * t.tile, t.y + cell.y * t.row, t.tile - 1, t.row - 1);
  };
  // Phaser also hears mouse events that land on the DOM HUD above the canvas; ignore those.
  const onCanvas = (pointer) => !pointer.event || pointer.event.target === scene.game.canvas;
  zone.on('pointerdown', (pointer) => {
    if (!onCanvas(pointer)) return;
    Object.assign(drag, { active: true, moved: false, x: pointer.x, y: pointer.y });
    drag.panX = scene.boardPan?.x ?? 0;
    drag.panY = scene.boardPan?.y ?? 0;
  });
  zone.on('pointermove', (pointer) => (onCanvas(pointer) ? showHover(pointer) : hover.clear()));
  zone.on('pointerout', () => hover.clear());
  const onMove = (pointer) => {
    if (!drag.active || !pointer.isDown) return;
    const dx = pointer.x - drag.x, dy = pointer.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const t = boardTransform(scene);
    scene.boardPan = { x: drag.panX - dx / t.tile, y: drag.panY - dy / t.row };
    panBoard(scene, 0, 0);
    scene.refreshGrid();
  };
  const onUp = (pointer) => {
    if (!drag.active) return;
    drag.active = false;
    if (drag.moved) { drag.moved = false; return; }
    if (!onCanvas(pointer)) return;
    const cell = cellAt(pointer);
    if (cell && pointer.button === 0) scene.select(cell.x, cell.y);
  };
  const onWheel = (pointer, over, dx, dy) => {
    if (!dy || !onCanvas(pointer) || pointer.x < playArea.left || pointer.x > playArea.right
      || pointer.y < playArea.top || pointer.y > playArea.bottom) return;
    zoomBoard(scene, (scene.boardZoom ?? 1) * (dy < 0 ? 1.1 : 1 / 1.1), pointer.x, pointer.y);
    scene.refreshGrid();
    scene.hud?.refresh();
  };
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('pointerupoutside', onUp);
  scene.input.on('wheel', onWheel);
  scene.boardInput = { zone, hover, clip, showHover };
  scene.events.once('shutdown', () => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('pointerupoutside', onUp);
    scene.input.off('wheel', onWheel);
    scene.boardMask?.destroy();
    clip.destroy();
    scene.boardInput = null;
  });
}

export function drawColonyBoard(scene) {
  ensureBoardInput(scene);
  scene.tileLayer.clear(true, true);
  const transform = boardTransform(scene);
  const { x: left, y: top, tile, row } = transform;
  const { buildings, crops, grid } = scene.sim.state;
  scene.boardTerrain?.layout(transform);
  const definitions = new Map(scene.dataSet.buildings.map(item => [item.id, item]));
  const { x0, x1, y0, y1 } = visibleTiles(transform, grid);
  const plants = [];

  // Faint grid lines over the visible part of the world only.
  const lines = scene.add.graphics().setDepth(2).setMask(scene.boardMask);
  lines.lineStyle(1, 0xdbab7d, 0.11);
  for (let x = x0; x <= x1 + 1; x++) lines.lineBetween(left + x * tile - 0.5, top + y0 * row, left + x * tile - 0.5, top + (y1 + 1) * row);
  for (let y = y0; y <= y1 + 1; y++) lines.lineBetween(left + x0 * tile, top + y * row - 0.5, left + (x1 + 1) * tile, top + y * row - 0.5);
  lines.lineStyle(1, 0xdbab7d, 0.28).strokeRect(left - 0.5, top - 0.5, grid.w * tile, grid.h * row);
  const selected = scene.selected;
  if (selected) {
    lines.fillStyle(0xc9a179, 0.2).fillRect(left + selected.x * tile, top + selected.y * row, tile - 1, row - 1);
    lines.lineStyle(1, 0xf1d6a6, 0.9).strokeRect(left + selected.x * tile, top + selected.y * row, tile - 1, row - 1);
  }
  scene.tileLayer.add(lines);

  const bars = scene.add.graphics().setDepth(18).setMask(scene.boardMask);
  scene.tileLayer.add(bars);
  for (const unit of buildings) {
    if (unit.x < x0 || unit.x > x1 || unit.y < y0 || unit.y > y1) continue;
    const px = left + unit.x * tile, py = top + unit.y * row;
    const whole = tileFullyVisible(transform, unit.x, unit.y);
    building(scene, scene.tileLayer, unit, px + (tile - row) / 2, py, row - 1, definitions.get(unit.id), whole);
    const crop = crops.find(item => item.plotUid === unit.uid);
    if (!crop) continue;
    plants.push({ key: `crop-${crop.uid}`, id: crop.cropId, x: px + tile / 2, y: py + row - 7 * transform.zoom,
      size: 26 * transform.zoom, growth: crop.growth });
    bars.fillStyle(0x37251c, 0.9).fillRect(px + 5, py + row - 4, tile - 10, 4);
    bars.fillStyle(crop.growth >= 1 ? 0x9ed27c : 0xe0b36e).fillRect(px + 5, py + row - 4, (tile - 10) * crop.growth, 4);
    if (crop.growth >= 1 && whole) {
      bars.fillStyle(0x8fca6d).fillCircle(px + tile - 7, py + 5, 5);
      scene.tileLayer.add(scene.add.text(px + tile - 7, py + 5, '✓', { fontSize: 8, color: '#26351f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(20));
    }
  }
  scene.presentation?.setPlants(plants);
}
