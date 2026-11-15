// AI-assisted (Claude): shared pixel-art helpers and palette for the Red Harvest cutscenes.

// Game palette (src/ui/theme.js and the colony terrain).
export const C = {
  skyTop: "#120a0d",
  sky: ["#160c10", "#1f1014", "#2b1517", "#3a1c1a", "#4c241d", "#5e2c21", "#723625", "#844129"],
  mesa: "#4a2620",
  mesaLit: "#5a2e24",
  ridge: "#6b3226",
  ground: "#8a4a3a",
  groundDark: "#6e3a2c",
  groundDeep: "#5e2a1c",
  pebble: "#a75e43",
  pebbleShade: "#4a2620",
  rimLit: "#b06a4c",
  hull: "#d8d2c6",
  hullShade: "#9a8f86",
  hullDark: "#5a4a44",
  scorch: "#3a2c28",
  window: "#5fb7c7",
  stripe: "#f0886a",
  fire: ["#fff6d0", "#ffd27a", "#ff9a3c", "#e2451e", "#a3301a", "#7a2416"],
  smoke: ["#5a4640", "#4a3833", "#3a2c28", "#2e2320"],
  dust: ["#d6976a", "#c27a52", "#a4502f"],
  flash: "#fff2d8",
  star: "#f5e9e2",
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Deterministic hash -> [0, 1). Every frame is a pure function of its frame number.
export const rand = (...n: number[]) => {
  let h = 2166136261;
  for (const x of n) h = Math.imul(h ^ Math.floor(x * 1000 + 17), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export type Ctx = CanvasRenderingContext2D;
export const px = (ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};
export const disc = (ctx: Ctx, cx: number, cy: number, r: number, color: string, dither = 0, seed = 0) => {
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      if (x * x + y * y > r * r) continue;
      if (dither && rand(seed, x, y) < dither) continue;
      px(ctx, cx + x, cy + y, color);
    }
  }
};

