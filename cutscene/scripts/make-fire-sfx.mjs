// AI-assisted (Claude): synthesises the intro's fire soundtrack (original, procedural, no samples).
// 0–4.5 s rocket fire roar that swells as it nears the ground, 4.5 s impact, then a crackling wreck fire
// that fades with the picture. Run: node scripts/make-fire-sfx.mjs  ->  public/sfx/fire.wav
import { writeFileSync } from 'node:fs';

const RATE = 44100;
const SECONDS = 7;
const N = RATE * SECONDS;
const IMPACT = 4.5;
const out = new Float32Array(N);

let seed = 0x1234567;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;

// One-pole filters.
const lowpass = (alpha) => { let y = 0; return (x) => (y += alpha * (x - y)); };
const roarLP = lowpass(0.035);
const roarLP2 = lowpass(0.08);
const hissLP = lowpass(0.5);
const wreckLP = lowpass(0.05);
let brown = 0;

// Crackles: short bright noise bursts at random times (more dense in the wreck fire).
const crackles = [];
for (let t = 0; t < SECONDS; ) {
  const density = t < IMPACT ? 9 + t * 4 : 26;
  t += -Math.log(1 - rnd()) / density;
  crackles.push({ start: Math.floor(t * RATE), len: Math.floor((0.004 + rnd() * 0.02) * RATE), amp: 0.15 + rnd() * 0.5 });
}

for (let i = 0; i < N; i++) {
  const t = i / RATE;
  const n = noise();
  brown = Math.max(-1, Math.min(1, brown + n * 0.02)) * 0.998;
  let s = 0;
  if (t < IMPACT) {
    // Roar: low rumble + mid flutter, swelling (and a doppler-ish brightening) as it falls.
    const p = t / IMPACT;
    const swell = 0.25 + 0.75 * p * p;
    const flutter = 0.75 + 0.25 * Math.sin(2 * Math.PI * (9 + 6 * p) * t);
    s += (roarLP(n) * 6 + brown * 1.5) * swell * flutter;
    s += roarLP2(n) * 1.6 * swell * p; // brightening hiss
    s += hissLP(n) * 0.06 * swell;
    // Fade in from silence.
    s *= Math.min(1, t / 0.35);
  } else {
    const a = t - IMPACT;
    // Impact: sub thump sweeping down + noise burst.
    const thumpEnv = Math.exp(-a * 7);
    const freq = 70 * Math.exp(-a * 2.5) + 28;
    s += Math.sin(2 * Math.PI * freq * a) * thumpEnv * 1.4;
    s += noise() * Math.exp(-a * 14) * 0.9;
    // Wreck fire bed: softer, lower roar.
    s += (wreckLP(n) * 4.5 + brown * 1.2) * Math.min(1, a * 3) * 0.6;
  }
  out[i] = s;
}

for (const c of crackles) {
  for (let j = 0; j < c.len && c.start + j < N; j++) {
    const env = Math.exp(-j / (c.len * 0.25));
    out[c.start + j] += noise() * env * c.amp * (c.start / RATE < IMPACT ? 0.6 : 1);
  }
}

// Fade out with the picture (6–7 s) and normalise to -1 dBFS.
for (let i = 0; i < N; i++) {
  const t = i / RATE;
  if (t > 6) out[i] *= Math.max(0, 1 - (t - 6) / 0.95);
}
let peak = 0;
for (const v of out) peak = Math.max(peak, Math.abs(v));
const gain = 0.89 / peak;

const data = Buffer.alloc(44 + N * 2);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 2, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * gain)) * 32767), 44 + i * 2);
writeFileSync(new URL('../public/sfx/fire.wav', import.meta.url), data);
console.log('wrote public/sfx/fire.wav', (data.length / 1024).toFixed(0), 'KB');
