// AI-assisted (OpenAI Codex; title screen redesigned with Claude)
// Quiet, text-led title: drifting procedural regolith, heavy vignette, short keyboard-first menu.
import Phaser from 'phaser';
import { colors, targetBackground, text } from '../ui/controls.js';
import { introEnabled, startMission } from '../ui/startMission.js';
import { introSources } from './CutsceneScene.js';

// Warm the cache for the intro clip while the player reads the title screen.
function prefetchIntro() {
  if (!introEnabled() || document.querySelector('link[data-intro-prefetch]')) return;
  const probe = document.createElement('video');
  const { src } = introSources().find(({ type }) => probe.canPlayType(type)) ?? introSources()[1];
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = src;
  link.dataset.introPrefetch = '';
  document.head.append(link);
}

// Power-of-two size: WebGL tiles it directly instead of resampling (which caused banding).
const GROUND = { key: 'title-ground', w: 512, h: 512, scale: 2 };
const VIGNETTE = 'title-vignette';
const LEFT = 112;
const MENU_Y = 560;
const ROW = 40;
const WIND = { x: -7, y: -3 }; // px per second, shared by ground drift and dust motes

// Seeded RNG so the ground looks the same every visit.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise: lattice values wrap at the texture edge, so the TileSprite has no seams.
function tileNoise(random, w, h, cell) {
  const gx = Math.round(w / cell), gy = Math.round(h / cell);
  const grid = Array.from({ length: gx * gy }, random);
  const at = (i, j) => grid[((j % gy) * gx) + (i % gx)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / w) * gx, fy = (y / h) * gy;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = smooth(fx - i), v = smooth(fy - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return top + (bottom - top) * v;
  };
}

export function paintGround(canvas) {
  const { w, h } = GROUND;
  const ctx = canvas.getContext('2d');
  const random = rng(0x5eed);
  const octaves = [[tileNoise(random, w, h, 96), .4], [tileNoise(random, w, h, 20), .25],
    [tileNoise(random, w, h, 9), .14], [tileNoise(random, w, h, 4), .08]];
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (const [noise, weight] of octaves) n += noise(x, y) * weight;
      // Faint wind ripples; integer frequencies keep them tileable.
      const ripple = Math.sin(2 * Math.PI * (60 * x / w + 17 * y / h) + 6 * octaves[1][0](x, y));
      n += .05 * ripple * octaves[0][0](x, y) + .13 * random();
      const k = (y * w + x) * 4;
      image.data[k] = 22 + n * 34;
      image.data[k + 1] = 13 + n * 17;
      image.data[k + 2] = 11 + n * 11;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // Draw a feature at all wrapped offsets so it stays seamless across the tile edge.
  const wrapped = (draw) => {
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) draw(ox, oy);
  };
  for (let i = 0; i < 9; i++) {
    const cx = random() * w, cy = random() * h, r = 4 + random() * 9;
    wrapped((ox, oy) => {
      ctx.fillStyle = 'rgba(8, 4, 3, 0.22)';
      ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, r, r * .8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120, 72, 56, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, r + 1, r * .8 + 1, 0, Math.PI * 1.05, Math.PI * 1.85); ctx.stroke();
      ctx.strokeStyle = 'rgba(120, 72, 56, 0.18)';
      ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, r - 1, r * .8 - 1, 0, Math.PI * .05, Math.PI * .85); ctx.stroke();
    });
  }
  for (let i = 0; i < 420; i++) {
    const px = Math.floor(random() * w), py = Math.floor(random() * h);
    const light = random() < .5;
    ctx.fillStyle = 'rgba(6, 3, 2, 0.5)';
    ctx.fillRect(px + 1, py + 1, light ? 2 : 1, 1);
    ctx.fillStyle = light ? 'rgba(122, 78, 62, 0.55)' : 'rgba(84, 52, 42, 0.6)';
    ctx.fillRect(px, py, light ? 2 : 1, light && random() < .4 ? 2 : 1);
  }
}

function paintVignette(canvas) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(700, 300, 90, 640, 360, 860);
  gradient.addColorStop(0, 'rgba(12, 7, 6, 0)');
  gradient.addColorStop(.45, 'rgba(12, 7, 6, .45)');
  gradient.addColorStop(1, 'rgba(10, 6, 5, .97)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1280, 720);
  // Extra shade under the text block keeps the copy legible over the grain.
  const low = ctx.createLinearGradient(0, 360, 0, 720);
  low.addColorStop(0, 'rgba(12, 7, 6, 0)');
  low.addColorStop(1, 'rgba(12, 7, 6, .7)');
  ctx.fillStyle = low;
  ctx.fillRect(0, 360, 1280, 360);
}

function ensureTextures(scene) {
  if (!scene.textures.exists(GROUND.key)) {
    paintGround(scene.textures.createCanvas(GROUND.key, GROUND.w, GROUND.h).getSourceImage());
    scene.textures.get(GROUND.key).refresh();
  }
  if (!scene.textures.exists(VIGNETTE)) {
    paintVignette(scene.textures.createCanvas(VIGNETTE, 1280, 720).getSourceImage());
    scene.textures.get(VIGNETTE).refresh();
  }
}

function sprout(scene) {
  // Small seedling cursor drawn in code: stem plus two leaves.
  const stem = scene.add.rectangle(0, 4, 2, 10, colors.accent);
  const left = scene.add.ellipse(-4.5, -2, 10, 5, colors.accent).setAngle(28);
  const right = scene.add.ellipse(5, -4, 11, 5.5, colors.accent).setAngle(-32);
  return scene.add.container(0, 0, [stem, left, right]);
}

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    targetBackground(this);
    ensureTextures(this);
    this.leaving = false;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.calm = calm;

    this.ground = this.add.tileSprite(0, 0, 1280 / GROUND.scale, 720 / GROUND.scale, GROUND.key)
      .setOrigin(0).setScale(GROUND.scale);
    const random = rng(7);
    this.motes = Array.from({ length: 38 }, () => ({
      x: random() * 1280, y: random() * 720, size: .8 + random() * 1.6,
      speed: .6 + random() * 1.1, alpha: .12 + random() * .28, phase: random() * Math.PI * 2,
    }));
    this.dust = this.add.graphics();
    this.add.image(0, 0, VIGNETTE).setOrigin(0);

    const data = this.registry.get('missionData');
    prefetchIntro();
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    const options = { demo, difficulty: 'medium', rescue: true };
    const arrival = data?.balance?.rescue?.arrivalSol;

    text(this, LEFT - 3, 418, 'RED HARVEST', 46, { fontStyle: '800', letterSpacing: 7 });
    text(this, LEFT, 484, 'Stranded on Mars. Grow enough food to survive until rescue.', 18, { color: colors.muted });

    this.items = [
      { label: 'Start survival',
        hint: `Land at Gale Crater${arrival ? `. Rescue arrives in ${arrival} sols.` : '.'}`,
        go: () => {
          const seed = demo ? data.balance.demoSeed : Math.floor(Math.random() * 2 ** 32);
          startMission(this, { ...options, siteId: 'gale', seed });
        } },
      { label: 'Choose landing site', hint: 'Compare ice, sunlight and dust across Mars before you land.',
        go: () => this.scene.start('Map', options) },
    ];
    this.items.forEach((item, i) => {
      const y = MENU_Y + i * ROW;
      item.copy = text(this, LEFT + 28, y, item.label, 22, { fontStyle: '700' }).setOrigin(0, .5);
      // A Zone is the hit area: wide enough for the old quick-start click at (190, 560).
      item.zone = this.add.zone(LEFT - 16, y - ROW / 2, 340, ROW).setOrigin(0)
        .setInteractive({ useHandCursor: true });
      item.zone.on('pointerover', () => this.select(i));
      item.zone.on('pointerdown', () => { this.select(i); this.confirm(); });
    });
    this.cursor = sprout(this);
    this.hint = text(this, LEFT + 28, MENU_Y + ROW * 2 - 2, '', 14, { color: colors.muted }).setAlpha(.8);

    text(this, LEFT, 682, '↑↓ select · Enter confirm', 12, { color: colors.muted }).setAlpha(.6);
    text(this, 1280 - LEFT, 682, 'Mars data: NASA MOLA, Mars Odyssey HEND · Dust: LMD Mars Climate Database', 12,
      { color: colors.muted }).setOrigin(1, 0).setAlpha(.6);

    const keys = this.input.keyboard;
    keys.on('keydown-UP', () => this.select(this.index - 1));
    keys.on('keydown-W', () => this.select(this.index - 1));
    keys.on('keydown-DOWN', () => this.select(this.index + 1));
    keys.on('keydown-S', () => this.select(this.index + 1));
    keys.on('keydown-ENTER', () => this.confirm());
    keys.on('keydown-SPACE', () => this.confirm());
    this.select(0);
  }

  select(index) {
    if (this.leaving) return;
    const count = this.items.length;
    this.index = ((index % count) + count) % count;
    this.items.forEach((item, i) => {
      const on = i === this.index;
      item.copy.setColor(on ? colors.ink : colors.muted).setAlpha(on ? 1 : .62);
    });
    const { copy, hint } = this.items[this.index];
    this.cursor.setPosition(LEFT + 6, copy.y);
    this.hint.setText(hint);
  }

  confirm() {
    if (this.leaving) return;
    this.leaving = true;
    const item = this.items[this.index];
    if (this.calm) return item.go();
    item.copy.setColor(colors.accentText);
    // Leave on whichever comes first: the fade finishing, or a real-time fallback for slow frames.
    let gone = false;
    const leave = () => { if (!gone) { gone = true; item.go(); } };
    this.cameras.main.fadeOut(220, 12, 7, 6);
    this.cameras.main.once('camerafadeoutcomplete', leave);
    setTimeout(() => { if (this.sys.isActive()) leave(); }, 320);
  }

  update(time, delta) {
    if (this.calm) return;
    const dt = delta / 1000;
    this.ground.tilePositionX -= WIND.x * dt / GROUND.scale;
    this.ground.tilePositionY -= WIND.y * dt / GROUND.scale;
    this.cursor.y = this.items[this.index].copy.y + Math.sin(time / 420) * 1.5;
    const g = this.dust.clear();
    for (const mote of this.motes) {
      mote.x += WIND.x * mote.speed * 2.2 * dt;
      mote.y += (WIND.y * mote.speed * 2.2 + Math.sin(time / 1300 + mote.phase) * 3) * dt;
      if (mote.x < -4) mote.x += 1288;
      if (mote.y < -4) mote.y += 728;
      if (mote.y > 724) mote.y -= 728;
      g.fillStyle(0xe8b8a0, mote.alpha * (.7 + .3 * Math.sin(time / 900 + mote.phase)));
      g.fillCircle(mote.x, mote.y, mote.size);
    }
  }
}
