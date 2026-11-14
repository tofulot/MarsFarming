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
