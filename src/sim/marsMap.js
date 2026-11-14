const columns = 90;
const rows = 45;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (a, b, t) => a + (b - a) * t;

export function normalizedNeutronFlux(grid, lat, lon) {
  const col = (lon + 178) / 4;
  const row = clamp((88 - lat) / 4, 0, rows - 1);
  const x = Math.floor(col);
  const y = Math.floor(row);
  const cell = (offset, r) => grid[r * columns + ((x + offset) % columns + columns) % columns] / 1000;
  const next = Math.min(y + 1, rows - 1);
  return mix(mix(cell(0, y), cell(1, y), col - x),
    mix(cell(0, next), cell(1, next), col - x), row - y);
}

export function landingSite(lat, lon, grid) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Invalid landing coordinates.');
  }
  const flux = normalizedNeutronFlux(grid, lat, lon);
  // Fit the orbital signal to the drill's existing in-game production range.
  const iceFactor = clamp((0.85 - flux) / 0.65, 0.15, 1);
  return { name: 'Mars outpost', lat, lon, iceFactor };
}
