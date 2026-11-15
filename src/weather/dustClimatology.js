const columns = 72;
const rows = 36;
const mix = (a, b, t) => a + (b - a) * t;

export function hasDustClimatology(data) {
  return data?.frames?.length === 4 && data.frames.every((frame) =>
    Number.isFinite(frame.ls) && Array.isArray(frame.opacityMilli) &&
    frame.opacityMilli.length === columns * rows &&
    frame.opacityMilli.every((value) => Number.isInteger(value) && value >= 0));
}

export function dustOpacity(frame, lat, lon) {
  const col = ((lon + 180) % 360 + 360) % 360 / 5;
  const row = Math.max(0, Math.min(rows - 1, (87.5 - lat) / 5));
  const x = Math.floor(col);
  const y = Math.floor(row);
  const next = Math.min(y + 1, rows - 1);
  const cell = (offset, r) => frame.opacityMilli[r * columns + ((x + offset) % columns)];
  return mix(mix(cell(0, y), cell(1, y), col - x),
    mix(cell(0, next), cell(1, next), col - x), row - y) / 1000;
}
