// AI-assisted (Claude Code)
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardTransform, boardZoomRange, playArea, stepBoardZoom, tileAtPoint, visibleTiles, zoomBoard } from '../src/ui/colony/layout.js';
import { WORLD_GRID } from '../src/sim/state.js';

const fakeScene = (zoom = 1) => ({
  boardZoom: zoom, boardPan: { x: 0, y: 0 },
  sim: { state: { grid: { ...WORLD_GRID }, buildings: [{ id: 'hab', x: 17, y: 9 }] } },
});

test('the hab sits in the middle of the play area and clicks map back to tiles', () => {
  const scene = fakeScene();
  const t = boardTransform(scene);
  assert.equal(t.x + 17.5 * t.tile, playArea.centerX);
  assert.equal(t.y + 9.5 * t.row, playArea.centerY);
  assert.deepEqual(tileAtPoint(t, scene.sim.state.grid, playArea.centerX, playArea.centerY), { x: 17, y: 9 });
  assert.equal(tileAtPoint(t, scene.sim.state.grid, playArea.centerX, playArea.top - 1), null, 'nothing under the HUD');
});

test('the world fills the play area at minimum zoom and zooming in shows fewer tiles', () => {
  const scene = fakeScene(boardZoomRange.min);
  const t = boardTransform(scene);
  assert.ok(WORLD_GRID.w * t.tile >= playArea.width - t.tile);
  assert.ok(WORLD_GRID.h * t.row >= playArea.height - t.row);
  const wide = visibleTiles(t, WORLD_GRID);
  scene.boardZoom = boardZoomRange.max;
  const close = visibleTiles(boardTransform(scene), WORLD_GRID);
  assert.ok(close.x1 - close.x0 < wide.x1 - wide.x0);
  assert.ok(close.y1 - close.y0 < wide.y1 - wide.y0);
});

test('zooming keeps the point under the cursor and respects the range', () => {
  const scene = fakeScene();
  const before = boardTransform(scene);
  const [px, py] = [500, 300];
  const world = [(px - before.x) / before.tile, (py - before.y) / before.row];
  zoomBoard(scene, 1.25, px, py);
  const after = boardTransform(scene);
  assert.ok(Math.abs((px - after.x) / after.tile - world[0]) < 1e-9);
  assert.ok(Math.abs((py - after.y) / after.row - world[1]) < 1e-9);
  for (let i = 0; i < 20; i++) stepBoardZoom(scene, 1);
  assert.equal(scene.boardZoom, boardZoomRange.max);
  for (let i = 0; i < 20; i++) stepBoardZoom(scene, -1);
  assert.equal(scene.boardZoom, boardZoomRange.min);
});
