// AI-assisted (Claude): synthesises the outro's liftoff sound (original, procedural, no samples).
// Ignition crackle, a full engine roar on liftoff, then the roar thins (closing low-pass, falling level)
// toward near-silence as the ship leaves. Run: node scripts/make-liftoff-sfx.mjs -> public/sfx/liftoff.wav
import { writeFileSync } from 'node:fs';

const RATE = 44100;
const SECONDS = 8;
const N = RATE * SECONDS;
const IGNITE = 0.25;
const LIFTOFF = 1.2;
const out = new Float32Array(N);

let seed = 0x5eed1;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noise = () => rnd() * 2 - 1;
let lp1 = 0; let lp2 = 0; let hp = 0; let brown = 0;

for (let i = 0; i < N; i++) {
  const t = i / RATE;
  const n = noise();
  brown = Math.max(-1, Math.min(1, brown + n * 0.02)) * 0.998;
  let level = 0;
  let alpha = 0.06; // low-pass amount (lower = darker)
  if (t < IGNITE) level = 0;
  else if (t < LIFTOFF) { const p = (t - IGNITE) / (LIFTOFF - IGNITE); level = 0.2 + 0.8 * p * p; alpha = 0.04 + 0.05 * p; }
  else {
    const a = t - LIFTOFF;
    level = Math.exp(-a * 0.62); // roar thins out with altitude
    alpha = 0.09 * Math.exp(-a * 0.45) + 0.008;
  }
  lp1 += alpha * (n - lp1);
  lp2 += alpha * 0.6 * (lp1 - lp2);
  const rumble = lp2 * 9 + brown * 1.4 * Math.min(1, level * 1.5);
  const flutter = 0.8 + 0.2 * Math.sin(2 * Math.PI * 11 * t) * Math.sin(2 * Math.PI * 0.7 * t);
  let s = rumble * level * flutter;
  // Ignition pops.
  if (t > IGNITE && t < LIFTOFF + 0.3 && rnd() < 0.0009) {
    for (let j = 0; j < 400 && i + j < N; j++) out[i + j] += noise() * Math.exp(-j / 80) * 0.5;
  }
  // Faint high hiss of the distant engine, then near-silence.
  hp += 0.5 * (n - hp);
  s += hp * 0.012 * Math.exp(-Math.max(0, t - 3) * 0.5) * (t > IGNITE ? 1 : 0);
  out[i] += s;
}
// Fade with the picture (7.2–8 s) and normalise to -1 dBFS.
for (let i = 0; i < N; i++) { const t = i / RATE; if (t > 7.0) out[i] *= Math.max(0, 1 - (t - 7.0) / 0.95); }
let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
const gain = 0.89 / peak;
const data = Buffer.alloc(44 + N * 2);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 2, 4); data.write('WAVE', 8);
data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * gain)) * 32767), 44 + i * 2);
writeFileSync(new URL('../public/sfx/liftoff.wav', import.meta.url), data);
console.log('wrote public/sfx/liftoff.wav', (data.length / 1024).toFixed(0), 'KB');
