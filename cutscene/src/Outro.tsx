// AI-assisted (Claude): Red Harvest rescue outro. Top-down: the rescue ship lifts off the base, the
// ground shrinks until Mars is a small globe, and the ship heads into the dark. Code-drawn pixel art.
import { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Audio, Composition, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, Ctx, disc, lerp, px, rand } from "./pixel";

export const OUTRO_FPS = 30;
export const OUTRO_DURATION = 8 * OUTRO_FPS; // 240 frames
const W = 320;
const H = 180;
const CX = W / 2;
const CY = H / 2;
const IGNITE = 0.25 * OUTRO_FPS;
const LIFTOFF = 1.2 * OUTRO_FPS;
const DEPART = 6.2 * OUTRO_FPS;
const FADE_FROM = 7.2 * OUTRO_FPS;
const PLANET_R = 3200; // world units; 1 unit = 1 low-res pixel at zoom 1
const LIGHT = (() => {
  const v = [-0.55, -0.6, 0.58];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

const smooth = (t: number) => t * t * (3 - 2 * t);
// Zoom: 1 on the pad, easing out to a small globe.
const zoomAt = (frame: number) => {
  const t = clamp((frame - LIFTOFF) / (6.6 * OUTRO_FPS - LIFTOFF), 0, 1);
  return Math.exp(lerp(0, Math.log(0.0105), smooth(t) ** 1.15));
};

// Value noise for the ground, sampled in world space so the zoom is seamless.
const hash2 = (x: number, y: number, o: number) => rand(x, y, o);
const vnoise = (x: number, y: number, o: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, o);
  const b = hash2(xi + 1, yi, o);
  const c = hash2(xi, yi + 1, o);
  const d = hash2(xi + 1, yi + 1, o);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
};
const OCTAVES = [900, 300, 100, 34, 12, 4];
// Fractal noise with level of detail: octaves smaller than ~2 screen pixels are dropped.
const ground = (wx: number, wy: number, zoom: number) => {
  let sum = 0;
  let weight = 0;
  OCTAVES.forEach((wave, i) => {
    const onScreen = wave * zoom;
    const w = clamp((onScreen - 1.5) / 3, 0, 1) * (1 / (i + 1.5));
    if (!w) return;
    sum += vnoise(wx / wave, wy / wave, i * 7 + 1) * w;
    weight += w;
  });
  return weight ? sum / weight : 0.5;
};

const GROUND_BANDS = [C.groundDeep, C.groundDark, C.ground, "#9a5541", C.pebble];
const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(clamp(v * k, 0, 255)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
};

// Craters scattered over the region around the base (world units).
const CRATERS = Array.from({ length: 90 }, (_, i) => {
  const ring = Math.pow(rand(i, 61), 0.6) * 2600;
  const a = rand(i, 62) * Math.PI * 2;
  const r = 8 * Math.pow(42, rand(i, 63));
  return { x: Math.cos(a) * (ring + 120), y: Math.sin(a) * (ring + 120), r };
}).filter(({ x, y, r }) => Math.hypot(x, y) > r + 150); // keep the base's surroundings clear

function drawPlanet(ctx: Ctx, frame: number, zoom: number) {
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const R = PLANET_R * zoom; // planet radius on screen
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const dx = sx + 0.5 - CX;
      const dy = sy + 0.5 - CY;
      const d2 = dx * dx + dy * dy;
      const i = (sy * W + sx) * 4;
      if (d2 > R * R) {
        // Space with stars.
        const star = rand(sx, sy, 71) > 0.996 ? (rand(sx, sy, frame >> 3) > 0.2 ? 235 : 120) : 0;
        data[i] = 10 + star; data[i + 1] = 6 + star * 0.95; data[i + 2] = 9 + star * 0.9; data[i + 3] = 255;
        continue;
      }
      const wx = dx / zoom;
      const wy = dy / zoom;
      const n = ground(wx, wy, zoom);
      let color = GROUND_BANDS[clamp(Math.floor(n * GROUND_BANDS.length * 1.15 - 0.3), 0, GROUND_BANDS.length - 1)];
      // Polar cap near the top of the globe once it is visible as a globe.
      if (R < 900 && dy < -R * 0.78 + vnoise(dx * 0.2, 0, 81) * R * 0.08) color = "#e9e1d6";
      // Sphere shading: matters only once the globe is small.
      const rr = Math.min(1, Math.sqrt(d2) / R);
      const nz = Math.sqrt(1 - rr * rr);
      const lambert = clamp((dx / R) * LIGHT[0] + (dy / R) * LIGHT[1] + nz * LIGHT[2], 0, 1);
      const sphere = clamp(1 - 1.2 * (R / 2400), 0, 1); // 0 when flat, 1 when small
      const k = lerp(1, 0.25 + 0.95 * lambert, sphere);
      // Stepped (retro) shading.
      const kq = Math.round(k * 6) / 6;
      const n16 = parseInt(color.slice(1), 16);
      data[i] = clamp(((n16 >> 16) & 255) * kq, 0, 255);
      data[i + 1] = clamp(((n16 >> 8) & 255) * kq, 0, 255);
      data[i + 2] = clamp((n16 & 255) * kq, 0, 255);
      data[i + 3] = 255;
      // Thin dusty atmosphere on the limb.
      if (rr > 0.965 && R < 1200) { data[i] = 214; data[i + 1] = 151; data[i + 2] = 106; }
    }
  }
  ctx.putImageData(img, 0, 0);
}

const toScreen = (wx: number, wy: number, zoom: number) => ({ x: CX + wx * zoom, y: CY + wy * zoom });

function drawCraters(ctx: Ctx, zoom: number) {
  const R = PLANET_R * zoom;
  for (const c of CRATERS) {
    const r = c.r * zoom;
    if (r < 1.2) continue;
    const { x, y } = toScreen(c.x, c.y, zoom);
    if (x < -r || x > W + r || y < -r || y > H + r) continue;
    if ((x - CX) ** 2 + (y - CY) ** 2 > (R - r) ** 2) continue;
    disc(ctx, x, y, r * 0.86, shade(C.groundDark, 0.92));
    const steps = Math.max(10, Math.round(r * 6));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const lit = Math.cos(a - Math.PI * 1.25) > 0; // rim catches light from the upper left
      px(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r, lit ? C.rimLit : C.groundDeep);
    }
  }
}

// The base, in world units around the pad at (0, 0).
function drawBase(ctx: Ctx, frame: number, zoom: number) {
  if (zoom < 0.06) return;
  const S = (v: number) => v * zoom;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    const p = toScreen(x, y, zoom);
    if (S(w) < 0.6 || S(h) < 0.6) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(S(w))), Math.max(1, Math.round(S(h))));
  };
  const circle = (x: number, y: number, r: number, color: string) => {
    const p = toScreen(x, y, zoom);
    if (S(r) < 0.6) { px(ctx, p.x, p.y, color); return; }
    disc(ctx, p.x, p.y, S(r), color);
  };
  // Rover tracks between buildings.
  for (const [ax, ay, bx, by] of [[-46, -10, 0, 0], [0, 0, 44, -22], [0, 0, -15, 34], [-46, -10, -82, 42]]) {
    const steps = 40;
    for (let s = 0; s < steps; s += 2) {
      const t = s / steps;
      const p = toScreen(lerp(ax, bx, t), lerp(ay, by, t), zoom);
      px(ctx, p.x, p.y, shade(C.groundDark, 0.85));
    }
  }
  // Old crash site (the intro's wreck), scorched and scrapped.
  circle(-84, 44, 13, C.scorch);
  rect(-91, 41, 13, 5, C.hullDark);
  rect(-87, 42, 4, 2, C.hullShade);
  // Landing pad.
  circle(0, 0, 21, "#7a5a4c");
  circle(0, 0, 18, "#6a4c40");
  for (let a = 0; a < 8; a++) {
    const p = toScreen(Math.cos((a / 8) * Math.PI * 2) * 19.5, Math.sin((a / 8) * Math.PI * 2) * 19.5, zoom);
    px(ctx, p.x, p.y, C.stripe);
  }
  // Hab dome.
  circle(-46, -10, 12, C.hullShade);
  circle(-46, -10, 10, C.hull);
  circle(-49, -13, 3, "#f2ece2");
  rect(-35, -12, 5, 4, C.hullShade); // airlock
  circle(-46, -10, 1.5, C.window);
  // Greenhouse plots: 2 x 3, with crops in rows.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = -40 + col * 17;
      const y = 26 + row * 11;
      rect(x, y, 15, 9, "#4f3224");
      rect(x, y, 15, 1, "#c9bd9d");
      for (let k = 0; k < 3; k++) {
        for (let m = 0; m < 6; m++) {
          const green = (m + k + row + col) % 3 === 0 ? "#9bd06a" : "#6f9a44";
          rect(x + 1.5 + m * 2.2, y + 2 + k * 2.4, 1.2, 1.2, green);
        }
      }
    }
  }
  // Comms dish (top-down): reflector, spokes, feed.
  circle(46, -19, 10, "#5a4a44"); // shadow
  circle(44, -22, 9.5, "#cbbf9f");
  circle(44, -22, 8, "#e8debf");
  for (let a = 0; a < 3; a++) {
    for (let s = 1; s < 8; s++) {
      const ang = (a / 3) * Math.PI * 2 + 0.4;
      const p = toScreen(44 + Math.cos(ang) * s, -22 + Math.sin(ang) * s, zoom);
      px(ctx, p.x, p.y, "#8a7d66");
    }
  }
  circle(44, -22, 1.6, C.window);
  // Solar panels.
  for (let k = 0; k < 3; k++) {
    rect(26 + k * 12, 14, 10, 6, "#263a4b");
    rect(26 + k * 12, 14, 10, 1, "#91afb0");
    rect(31 + k * 12, 14, 1, 6, "#3f5a70");
  }
  // Battery bank and ice drill.
  rect(26, 25, 7, 5, "#3a2623");
  rect(27, 26, 5, 1, "#9bd8ae");
  circle(62, 34, 4, "#5a4a44");
  circle(62, 34, 2, "#9fd3dc");
}

// Ignition dust: radial streaks blown across the ground (world space, so they shrink with it).
function drawDust(ctx: Ctx, frame: number, zoom: number) {
  if (frame < IGNITE || frame > LIFTOFF + 50) return;
  const age = frame - IGNITE;
  const fade = clamp(1 - (frame - LIFTOFF) / 50, 0, 1);
  for (let i = 0; i < 90; i++) {
    const a = rand(i, 91) * Math.PI * 2;
    const speed = 1.3 + rand(i, 92) * 2.2;
    const r0 = 16 + age * speed;
    for (let s = 0; s < 4; s++) {
      if (rand(i, s, age) > fade * 0.9) continue;
      const p = toScreen(Math.cos(a) * (r0 - s * 2.5), Math.sin(a) * (r0 - s * 2.5), zoom);
      px(ctx, p.x, p.y, C.dust[s % 3]);
    }
  }
}

// Rescue ship from above: round hull, ring of panels, struts sticking out, central dome.
function drawShip(ctx: Ctx, frame: number, x: number, y: number, scale: number, thrust: number) {
  const R = 13 * scale;
  const spin = frame * 0.012;
  if (thrust > 0) {
    const flicker = Math.sin(frame * 1.9) * 0.8;
    disc(ctx, x, y, R + 6 * scale + flicker, C.fire[3], 0.6, frame);
    disc(ctx, x, y, R + 3.5 * scale + flicker * 0.5, C.fire[2], 0.3, frame + 1);
    disc(ctx, x, y, R + 1.8 * scale, C.fire[1], 0.1, frame + 2);
  }
  // Struts / antennas (the lines in the mock-up).
  for (let k = 0; k < 4; k++) {
    const a = spin + (k / 4) * Math.PI * 2 + Math.PI / 4;
    for (let s = R - 1; s < R + 7 * scale; s += 0.7) px(ctx, x + Math.cos(a) * s, y + Math.sin(a) * s, C.hullDark);
    px(ctx, x + Math.cos(a) * (R + 7 * scale), y + Math.sin(a) * (R + 7 * scale), C.stripe);
  }
  disc(ctx, x, y, R, C.hullDark);
  disc(ctx, x, y, R - 1, C.hullShade);
  // Lit hull with a ring of panel seams.
  const ring = Math.max(6, Math.round(R * 4));
  for (let yy = -R; yy <= R; yy++) {
    for (let xx = -R; xx <= R; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > R - 1.5) continue;
      const lit = (-xx * 0.6 - yy * 0.7) / R;
      let color = lit > 0.15 ? C.hull : lit > -0.35 ? "#bdb5a9" : C.hullShade;
      const ang = Math.atan2(yy, xx) - spin;
      if (d > R * 0.55 && Math.abs(Math.sin(ang * 4)) < 0.12) color = C.hullDark;
      if (d > R * 0.42 && d < R * 0.5) color = C.stripe;
      if (d < R * 0.32) color = d < R * 0.14 && lit > 0 ? "#bff0f6" : C.window;
      px(ctx, x + xx, y + yy, color);
    }
  }
  void ring;
}

function drawFrame(ctx: Ctx, frame: number) {
  ctx.imageSmoothingEnabled = false;
  const zoom = zoomAt(frame);
  drawPlanet(ctx, frame, zoom);
  drawCraters(ctx, zoom);
  drawBase(ctx, frame, zoom);
  drawDust(ctx, frame, zoom);

  // Ship: camera follows it while it climbs, then it leaves toward the upper right.
  const leave = smooth(clamp((frame - DEPART) / (FADE_FROM + 12 - DEPART), 0, 1));
  const shipX = lerp(CX, W + 30, leave * leave);
  const shipY = lerp(CY, -26, leave * leave);
  const climb = smooth(clamp((frame - LIFTOFF) / (DEPART - LIFTOFF), 0, 1));
  const shipScale = lerp(lerp(1, 0.6, climb), 0.25, leave);
  const thrust = frame >= IGNITE ? 1 : 0;
  // Shadow on the ground: offset grows with altitude, shrinks with the zoom, fades out.
  if (frame < LIFTOFF + 60) {
    const alt = Math.max(0, frame - LIFTOFF) * 0.7;
    const sp = toScreen(4 + alt, 4 + alt * 0.8, zoom);
    const sr = 13 * Math.max(zoom, 0.05) * (frame < LIFTOFF ? 1 : 1 + alt * 0.01);
    const fade = clamp(1 - (frame - LIFTOFF) / 60, 0, 1);
    if (fade > 0.15) {
      // Ordered (checkerboard) dither reads as a soft shadow in pixel art.
      const R = Math.ceil(sr);
      for (let yy = -R; yy <= R; yy++) {
        for (let xx = -R; xx <= R; xx++) {
          if (xx * xx + yy * yy > sr * sr) continue;
          const x = Math.round(sp.x + xx);
          const y = Math.round(sp.y + yy);
          if (fade < 0.6 ? (x + y) % 4 !== 0 : (x + y) % 2 !== 0) continue;
          px(ctx, x, y, "#2e1a15");
        }
      }
    }
  }
  // A little lift wobble at ignition.
  const wob = frame > IGNITE && frame < LIFTOFF ? Math.sin(frame * 3.1) * 0.6 : 0;
  drawShip(ctx, frame, shipX + wob, shipY, shipScale, thrust);
  // Exhaust trail once departing.
  if (leave > 0) {
    for (let k = 1; k < 18; k++) {
      const tl = smooth(clamp((frame - k * 1.5 - DEPART) / (FADE_FROM + 12 - DEPART), 0, 1));
      if (tl <= 0) continue;
      px(ctx, lerp(CX, W + 30, tl * tl), lerp(CY, -26, tl * tl), k < 5 ? C.fire[1] : k < 10 ? C.fire[2] : C.fire[4]);
    }
  }
  // Stepped fade to black.
  if (frame >= FADE_FROM) {
    const steps = 6;
    ctx.globalAlpha = Math.min(1, Math.ceil(((frame - FADE_FROM + 1) / (OUTRO_DURATION - FADE_FROM - 2)) * steps) / steps);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

export const OutroComposition = () => (
  <Composition id="OutroRescue" component={OutroRescue} durationInFrames={OUTRO_DURATION} fps={OUTRO_FPS} width={1280} height={720} />
);

export const OutroRescue: React.FC = () => {
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFrame(ctx, frame);
  }, [frame]);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <canvas ref={canvas} width={W} height={H} style={{ width: 1280, height: 720, imageRendering: "pixelated" }} />
      <Audio src={staticFile("sfx/liftoff.wav")} />
    </AbsoluteFill>
  );
};
