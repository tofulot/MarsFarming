// AI-assisted (Claude): Red Harvest intro cutscene. Code-drawn pixel art, no image assets.
// Drawn at 320x180 and scaled 4x with nearest-neighbour so it matches the game's chunky sprites.
import { useLayoutEffect, useRef } from "react";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Composition,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, clamp, Ctx, disc, lerp, px, rand } from "./pixel";

type Props = { aiLabel: boolean };

export const FPS = 30;
export const DURATION = 7 * FPS; // 210 frames
const W = 320;
const H = 180;
const IMPACT = Math.round(4.5 * FPS); // frame 135
const FADE_FROM = 6 * FPS; // frame 180
const IMPACT_X = 150;
const IMPACT_Y = 142;

// Camera: the ground rises as we fall toward it (parallax by layer depth).
const descentEase = (frame: number) => {
  const t = clamp(frame / IMPACT, 0, 1);
  return t * t;
};
const rocketAt = (frame: number) => {
  const e = descentEase(frame);
  const wobble = frame < IMPACT ? Math.sin(frame * 0.9) * 0.8 : 0;
  return { x: lerp(330, IMPACT_X, e) + wobble, y: lerp(-40, IMPACT_Y - 6, e) - wobble * 0.5 };
};

function drawSky(ctx: Ctx, frame: number, lift: number) {
  ctx.fillStyle = C.skyTop;
  ctx.fillRect(0, 0, W, H);
  // Banded, dithered gradient (retro), shifting with the camera.
  const horizon = 112 + lift * 0.5;
  const band = horizon / C.sky.length;
  C.sky.forEach((color, i) => {
    const top = Math.round(i * band);
    ctx.fillStyle = color;
    ctx.fillRect(0, top, W, Math.ceil(band) + 1);
    if (i < C.sky.length - 1) {
      for (let x = 0; x < W; x += 2) px(ctx, x + (top % 2), top + Math.ceil(band) - 1, C.sky[i + 1]);
    }
  });
  // Faint stars that fade as the dust thickens.
  const starAlpha = 1 - clamp(frame / 70, 0, 1);
  for (let i = 0; i < 46; i++) {
    const sx = rand(i, 1) * W;
    const sy = rand(i, 2) * 70 + lift * 0.15;
    if (rand(i, 3) > starAlpha || sy > horizon - 20) continue;
    px(ctx, sx, sy, rand(i, frame >> 3) > 0.85 ? C.sky[3] : C.star);
  }
  // Small, pale Martian sun low in the west.
  const sunY = 64 + lift * 0.25;
  disc(ctx, 52, sunY, 5, "#3e2523", 0.5, 7);
  disc(ctx, 52, sunY, 3, "#e9e3d6");
  disc(ctx, 52, sunY, 1.5, "#fffaf0");
}

function drawTerrain(ctx: Ctx, lift: number) {
  const horizon = 112 + lift * 0.5;
  // Distant mesas.
  for (let x = 0; x < W; x++) {
    const h = 6 + Math.round(5 * Math.sin(x * 0.045) + 4 * Math.sin(x * 0.11 + 2) + (rand(x >> 3, 9) * 3));
    const top = horizon - Math.max(1, h);
    ctx.fillStyle = C.mesa;
    ctx.fillRect(x, top, 1, H);
    if (rand(x, 4) > 0.7) px(ctx, x, top, C.mesaLit);
  }
  // Near ridge.
  const ridgeBase = 124 + lift * 0.75;
  for (let x = 0; x < W; x++) {
    const h = 3 + Math.round(3 * Math.sin(x * 0.07 + 1) + 2 * Math.sin(x * 0.19));
    ctx.fillStyle = C.ridge;
    ctx.fillRect(x, ridgeBase - h, 1, H);
  }
  // Ground plane with dithered bands.
  const groundTop = 128 + lift;
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, groundTop, W, H);
  for (let y = Math.round(groundTop); y < H; y++) {
    const depth = (y - groundTop) / 52;
    for (let x = (y % 2); x < W; x += 2) {
      if (rand(x, y, 5) < depth * 0.55) px(ctx, x, y, depth > 0.6 ? C.groundDeep : C.groundDark);
    }
  }
  // Crater rims and pebbles (perspective: larger near the bottom).
  const crater = (cx: number, cy: number, rx: number) => {
    const ry = rx * 0.32;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = cx + Math.cos(a) * rx;
      const y = cy + lift + Math.sin(a) * ry;
      px(ctx, x, y, Math.sin(a) < 0 ? C.pebbleShade : C.rimLit);
    }
  };
  crater(250, 150, 22);
  crater(60, 165, 30);
  crater(205, 136, 9);
  for (let i = 0; i < 70; i++) {
    const x = rand(i, 11) * W;
    const y = 130 + rand(i, 12) * 50 + lift;
    if (y < groundTop + 1) continue;
    const s = y > 160 ? 2 : 1;
    px(ctx, x, y, C.pebble, s, 1);
    px(ctx, x, y + 1, C.pebbleShade, s, 1);
  }
}

// 45-degree rocket, nose pointing down-left, sampled per pixel so the edges stay crisp.
function drawRocket(ctx: Ctx, cx: number, cy: number, frame: number) {
  const k = Math.SQRT1_2;
  const S = 2; // rocket scale
  for (let y = -9 * S; y <= 9 * S; y++) {
    for (let x = -9 * S; x <= 9 * S; x++) {
      const u = ((-x + y) * k) / S; // along the nose direction
      const v = ((x + y) * k) / S; // across
      const nose = u > 4 ? 1 - (u - 4) / 3.2 : 1;
      const bodyHalf = 1.9 * nose;
      const inBody = u > -6 && u < 7.2 && Math.abs(v) < bodyHalf;
      const inFin = u > -6.5 && u < -3.4 && Math.abs(v) < 3.6 - (u + 6.5) * 0.4;
      if (!inBody && !inFin) continue;
      let color = v > 0.5 ? C.hullShade : C.hull;
      if (inFin && !inBody) color = C.hullDark;
      if (inBody && u > 1.2 && u < 2.6 && Math.abs(v) < 0.9) color = C.window;
      if (inBody && u > -2.6 && u < -1.6) color = C.stripe;
      if (inBody && u < -3.5 && rand(x, y, frame >> 2) < 0.45) color = C.scorch; // burning hull
      if (inBody && Math.abs(v) > bodyHalf - 0.45 && v < 0) color = "#f2ece2"; // rim light
      px(ctx, cx + x, cy + y, color);
    }
  }
}

function fireColor(age: number) {
  if (age < 3) return C.fire[0];
  if (age < 6) return C.fire[1];
  if (age < 10) return C.fire[2];
  if (age < 14) return C.fire[3];
  if (age < 17) return C.fire[4];
  if (age < 19) return C.fire[5];
  return C.smoke[Math.min(C.smoke.length - 1, Math.floor((age - 19) / 5))];
}

function drawTrail(ctx: Ctx, frame: number) {
  const LIFE = 36;
  for (let f0 = Math.max(0, frame - LIFE); f0 <= Math.min(frame, IMPACT - 1); f0++) {
    const age = frame - f0;
    const emit = rocketAt(f0);
    const perFrame = 5 + Math.round(7 * descentEase(f0));
    for (let i = 0; i < perFrame; i++) {
      const r1 = rand(f0, i, 1);
      const r2 = rand(f0, i, 2);
      // Tail sits up-right of the body; air pushes flame back along the path, smoke drifts up.
      const spread = (r2 - 0.5) * (3 + age * 0.6);
      const x = emit.x + 10 + age * (0.4 + r1 * 0.55) + spread;
      const y = emit.y - 10 - age * (0.3 + r2 * 0.4) - Math.max(0, age - 14) * 0.22 + spread * 0.4;
      const smoke = age >= 19;
      if (smoke && rand(f0, i, age) < (age - 19) / 18) continue; // dissolve
      const size = smoke ? 3 + Math.floor((age - 19) / 4) : age < 7 ? 3 : age < 14 ? 2 : 1;
      px(ctx, x - size / 2, y - size / 2, fireColor(age + r1 * 2), size, size);
    }
  }
  if (frame < IMPACT) {
    const r = rocketAt(frame);
    const flicker = 1 + Math.sin(frame * 1.7) * 0.6;
    disc(ctx, r.x + 10, r.y - 10, 11 + flicker * 1.5, C.fire[4], 0.6, frame);
    disc(ctx, r.x + 9, r.y - 9, 8 + flicker, C.fire[3], 0.3, frame + 1);
    disc(ctx, r.x + 8, r.y - 8, 5 + flicker * 0.6, C.fire[2], 0.1, frame + 2);
    disc(ctx, r.x + 7, r.y - 7, 2.6, C.fire[1]);
    disc(ctx, r.x + 6, r.y - 6, 1.2, C.fire[0]);
    // Re-entry heat on the leading edge and along the hull.
    disc(ctx, r.x - 8, r.y + 8, 5, C.fire[3], 0.55, frame + 3);
    disc(ctx, r.x - 9, r.y + 9, 3, C.fire[2], 0.35, frame + 4);
    // Sparks shed from the hull.
    for (let i = 0; i < 12; i++) {
      const born = frame - Math.floor(rand(frame >> 2, i) * 10);
      const a = rocketAt(Math.max(0, born));
      const age = frame - born;
      px(ctx, a.x + 6 + age * (rand(i, born) * 2.4 - 0.2), a.y - 6 - age * 0.5 + age * age * 0.04, i % 2 ? C.fire[0] : C.fire[1]);
    }
  }
}

function drawImpact(ctx: Ctx, frame: number) {
  const age = frame - IMPACT;
  if (age < 0) return;
  // Crater scar.
  for (let x = -26; x <= 26; x++) {
    const depth = Math.round(5 * Math.sqrt(Math.max(0, 1 - (x / 26) ** 2)));
    for (let y = -depth; y <= depth; y++) px(ctx, IMPACT_X + x, IMPACT_Y + 3 + y * 0.6, y < 0 ? C.groundDeep : C.scorch);
  }
  // Expanding dust ring.
  if (age < 26) {
    const rx = 6 + age * 3.4;
    const ry = rx * 0.3;
    const sparse = age / 26;
    for (let a = 0; a < Math.PI * 2; a += 0.025) {
      if (rand(a * 100, age) < sparse) continue;
      px(ctx, IMPACT_X + Math.cos(a) * rx, IMPACT_Y + 2 + Math.sin(a) * ry, C.dust[age < 8 ? 0 : 1]);
    }
  }
  // Dust plume and debris thrown up with gravity.
  for (let i = 0; i < 60; i++) {
    const vx = (rand(i, 21) - 0.5) * 3.2;
    const vy = -(0.8 + rand(i, 22) * 2.6);
    const g = 0.09;
    const t = Math.min(age, 40);
    const x = IMPACT_X + vx * t;
    const y = IMPACT_Y + vy * t + g * t * t;
    if (y > IMPACT_Y + 4) continue;
    if (rand(i, age) < age / 46) continue;
    const debris = i < 10;
    px(ctx, x, y, debris ? C.hullDark : C.dust[i % 3], debris ? 2 : 1, debris ? 2 : 1);
  }
  // Wreck lying on its side, tilted, nose buried.
  const WS = 1.7; // wreck scale
  for (let y = -7; y <= 7; y++) {
    for (let x = -21; x <= 21; x++) {
      const u = (x * 0.97 + y * 0.24) / WS;
      const v = (-x * 0.24 + y * 0.97) / WS;
      if (Math.abs(v) > 2.3 || u < -11 || u > 10) continue;
      let color = v > 0.6 ? C.hullShade : C.hull;
      if (u > 7) color = C.hullDark;
      if (u > -4 && u < -3) color = C.stripe;
      if (rand(x, y, 31) < 0.5) color = C.scorch;
      px(ctx, IMPACT_X + 2 + x, IMPACT_Y - 2 + y, color);
    }
  }
  // Wreck fire: flickering tongues.
  for (let x = -17; x <= 14; x++) {
    const base = IMPACT_Y - 5 - x * 0.24;
    const h = Math.max(0, 5 + 11 * rand(x, frame >> 1) * (1 - Math.abs(x) / 19) + Math.sin(frame * 0.6 + x * 0.7) * 3);
    for (let y = 0; y < h; y++) {
      const f = y / Math.max(1, h);
      const color = f < 0.25 ? C.fire[1] : f < 0.55 ? C.fire[2] : f < 0.8 ? C.fire[3] : C.fire[5];
      px(ctx, IMPACT_X + 2 + x, base - y, color);
    }
  }
  // Smoke column drifting with the wind.
  for (let f0 = Math.max(IMPACT, frame - 60); f0 <= frame; f0++) {
    const a = frame - f0;
    for (let i = 0; i < 3; i++) {
      const x = IMPACT_X + (rand(f0, i, 41) - 0.5) * 18 + a * (0.25 + rand(f0, i, 42) * 0.2);
      const y = IMPACT_Y - 14 - a * 0.8;
      if (rand(f0, i, a) < a / 70) continue;
      const s = 3 + Math.floor(a / 9);
      px(ctx, x, y, C.smoke[Math.min(3, Math.floor(a / 15))], s, s);
    }
  }
  // Embers.
  for (let i = 0; i < 8; i++) {
    const born = frame - Math.floor(rand(frame >> 3, i, 51) * 24);
    if (born < IMPACT) continue;
    const a = frame - born;
    px(ctx, IMPACT_X + (rand(i, born) - 0.5) * 18 + a * 0.3, IMPACT_Y - 6 - a * 0.9, C.fire[1]);
  }
}

function drawFrame(ctx: Ctx, frame: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const lift = 34 * (1 - descentEase(frame)); // ground starts lower, rises into view
  // Impact shake.
  const shakeAge = frame - IMPACT;
  if (shakeAge >= 0 && shakeAge < 24) {
    const k = 1 - shakeAge / 24;
    ctx.setTransform(1, 0, 0, 1, Math.round(Math.sin(frame * 2.7) * 3 * k), Math.round(Math.cos(frame * 3.3) * 2 * k));
  }
  drawSky(ctx, frame, lift);
  drawTerrain(ctx, lift);
  drawImpact(ctx, frame);
  drawTrail(ctx, frame);
  if (frame < IMPACT) {
    const r = rocketAt(frame);
    drawRocket(ctx, r.x, r.y, frame);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Flash.
  if (shakeAge >= 0 && shakeAge < 16) {
    ctx.globalAlpha = shakeAge < 2 ? 1 : 1 - (shakeAge - 2) / 14;
    ctx.fillStyle = C.flash;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  // Fade to black (stepped, for a retro feel).
  if (frame >= FADE_FROM) {
    const steps = 6;
    ctx.globalAlpha = Math.min(1, Math.ceil(((frame - FADE_FROM + 1) / (DURATION - FADE_FROM - 2)) * steps) / steps);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

const calculateMetadata: CalculateMetadataFunction<Props> = () => ({});

export const MyComposition = () => (
  <Composition
    id="IntroCrash"
    component={IntroCrash}
    durationInFrames={DURATION}
    fps={FPS}
    width={1280}
    height={720}
    defaultProps={{ aiLabel: false }}
    calculateMetadata={calculateMetadata}
  />
);

export const IntroCrash: React.FC<Props> = ({ aiLabel }) => {
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawFrame(ctx, frame);
  }, [frame]);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <canvas ref={canvas} width={W} height={H} style={{ width: 1280, height: 720, imageRendering: "pixelated" }} />
      <Audio src={staticFile("sfx/fire.wav")} />
      {aiLabel && (
        <div style={{ position: "absolute", right: 14, bottom: 10, font: "14px system-ui", color: "#ffffff99" }}>
          Contains AI-generated imagery
        </div>
      )}
    </AbsoluteFill>
  );
};
