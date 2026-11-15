// AI-assisted (Claude Code: board transform, zoom and pan)
// Shared presentation coordinates. Simulation grid coordinates remain independent.
export const colonyLayout = Object.freeze({
  width: 1280, height: 720,
  board: { x: 32, y: 60, tile: 48, row: 36 },
  dock: { x: 20, y: 548, width: 1240, height: 112 },
  forecast: { x: 20, y: 672, width: 1240, height: 32 },
  hud: { x: 1000, y: 20, width: 260 }
});
export const colonyTheme = Object.freeze({
  panel: 0x3b231f, line: 0xb47762, light: 0xd7aa8b,
  ink: '#f5dfbd', muted: '#cba58c', mint: 0xa7cba1, accent: 0xd69562
});

/**
 * Canvas region the DOM HUD does not cover (design pixels). The control bars cover y 0–128 and the
 * forecast strip y ~660–720. Retune these if the HUD changes size.
 */
export const PLAY_AREA_LEFT = 12;
export const PLAY_AREA_TOP = 128;
export const PLAY_AREA_RIGHT = 1268;
export const PLAY_AREA_BOTTOM = 656;
export const playArea = Object.freeze({
  left: PLAY_AREA_LEFT, top: PLAY_AREA_TOP, right: PLAY_AREA_RIGHT, bottom: PLAY_AREA_BOTTOM,
  width: PLAY_AREA_RIGHT - PLAY_AREA_LEFT, height: PLAY_AREA_BOTTOM - PLAY_AREA_TOP,
  centerX: (PLAY_AREA_LEFT + PLAY_AREA_RIGHT) / 2, centerY: (PLAY_AREA_TOP + PLAY_AREA_BOTTOM) / 2,
});

/** At the minimum zoom a 35×19 world (36×27 px tiles) fills the 1256×528 play area. */
export const boardZoomRange = Object.freeze({ min: 0.75, max: 1.5, step: 0.125, initial: 1 });
/** Grid centre used when no scene is supplied (matches balance.json starter hab). */
const defaultCentre = Object.freeze({ x: 17.5, y: 9.5 });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Board transform: tile size for the zoom, with the origin chosen so that world-tile point
 * `centre` (in tile units) sits in the middle of the play area.
 */
export function colonyBoardAtZoom(zoom = 1, centre = defaultCentre) {
  const { tile, row } = colonyLayout.board;
  const size = { tile: tile * zoom, row: row * zoom };
  return {
    x: playArea.centerX - centre.x * size.tile,
    y: playArea.centerY - centre.y * size.row,
    ...size, zoom,
  };
}

function habCentre(state) {
  const hab = state?.buildings?.find(({ id }) => id === 'hab');
  if (hab) return { x: hab.x + 0.5, y: hab.y + 0.5 };
  return state?.grid ? { x: state.grid.w / 2, y: state.grid.h / 2 } : defaultCentre;
}

/** Allowed range for the view centre on one axis: never scroll the board off the play area. */
function centreRange(cells, viewPx, cellPx) {
  const half = viewPx / (2 * cellPx);
  return [Math.min(half, cells - half) - 0.5, Math.max(half, cells - half) + 0.5];
}

/** Clamp scene.boardPan (tile units, relative to the hab) and return the view centre. */
export function boardView(scene) {
  const zoom = scene.boardZoom ?? 1;
  const state = scene.sim?.state;
  const grid = state?.grid ?? { w: 35, h: 19 };
  const base = habCentre(state);
  const pan = scene.boardPan ?? { x: 0, y: 0 };
  const { tile, row } = colonyLayout.board;
  const [x0, x1] = centreRange(grid.w, playArea.width, tile * zoom);
  const [y0, y1] = centreRange(grid.h, playArea.height, row * zoom);
  const centre = { x: clamp(base.x + pan.x, x0, x1), y: clamp(base.y + pan.y, y0, y1) };
  scene.boardPan = { x: centre.x - base.x, y: centre.y - base.y };
  return centre;
}

/** The one transform every board element uses (tiles, buildings, crops, rocks, terrain, effects). */
export function boardTransform(scene) {
  return colonyBoardAtZoom(scene.boardZoom ?? 1, boardView(scene));
}

/** Grid cell under a canvas point, or null if outside the grid or the play area. */
export function tileAtPoint(transform, grid, px, py) {
  if (px < playArea.left || px >= playArea.right || py < playArea.top || py >= playArea.bottom) return null;
  const x = Math.floor((px - transform.x) / transform.tile);
  const y = Math.floor((py - transform.y) / transform.row);
  return x >= 0 && y >= 0 && x < grid.w && y < grid.h ? { x, y } : null;
}

/** Inclusive tile index range intersecting the play area. */
export function visibleTiles(transform, grid) {
  return {
    x0: Math.max(0, Math.floor((playArea.left - transform.x) / transform.tile)),
    x1: Math.min(grid.w - 1, Math.floor((playArea.right - 1 - transform.x) / transform.tile)),
    y0: Math.max(0, Math.floor((playArea.top - transform.y) / transform.row)),
    y1: Math.min(grid.h - 1, Math.floor((playArea.bottom - 1 - transform.y) / transform.row)),
  };
}

/** True when the whole tile lies inside the play area. */
export function tileFullyVisible(transform, x, y) {
  const left = transform.x + x * transform.tile, top = transform.y + y * transform.row;
  return left >= playArea.left - 0.5 && top >= playArea.top - 0.5
    && left + transform.tile <= playArea.right + 0.5 && top + transform.row <= playArea.bottom + 0.5;
}

/** Set the zoom, keeping the world point under (px, py) fixed (defaults to the play-area centre). */
export function zoomBoard(scene, zoom, px = playArea.centerX, py = playArea.centerY) {
  const before = boardTransform(scene);
  const next = clamp(zoom, boardZoomRange.min, boardZoomRange.max);
  const worldX = (px - before.x) / before.tile;
  const worldY = (py - before.y) / before.row;
  scene.boardZoom = next;
  const { tile, row } = colonyLayout.board;
  const base = habCentre(scene.sim?.state);
  scene.boardPan = {
    x: worldX - (px - playArea.centerX) / (tile * next) - base.x,
    y: worldY - (py - playArea.centerY) / (row * next) - base.y,
  };
  boardView(scene);
  return next;
}

/** Step zoom to the next notch of boardZoomRange.step in the given direction (+1 / -1). */
export function stepBoardZoom(scene, direction) {
  const { step } = boardZoomRange;
  const current = scene.boardZoom ?? 1;
  const notch = Math.round(current / step) * step;
  const target = direction > 0 ? (notch > current + 1e-6 ? notch : notch + step)
    : (notch < current - 1e-6 ? notch : notch - step);
  return zoomBoard(scene, target);
}

/** Pan by a distance in tiles. */
export function panBoard(scene, dx, dy) {
  const pan = scene.boardPan ?? { x: 0, y: 0 };
  scene.boardPan = { x: pan.x + dx, y: pan.y + dy };
  boardView(scene);
}
