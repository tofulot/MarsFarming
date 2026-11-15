// AI-assisted (Claude Code: world-space ground texture, seeded detail layer)
// Surface ground built once per scene in world-tile space and positioned by the board transform.
// Base layer: the bundled NASA Ames MOLA shaded-relief atlas around the landing site, smoothed.
// Detail layer (drawn, seeded by mission seed + site): regolith grain, pebbles, small craters,
// wind ripples and icy patches whose amount follows the site's HEND-derived iceFactor.
// Shaded relief is not elevation: everything here is game-scaled.
import Phaser from 'phaser';
import { mulberry32 } from '../sim/rng.js';
import { WORLD_GRID } from '../sim/state.js';
import { DEFAULT_RELIEF, surfaceHab, surfaceSeed } from '../sim/systems/surfaceMaterials.js';

/** Tiles of ground drawn beyond each edge of the grid, so panning never shows a hard edge. */
export const TERRAIN_MARGIN = 2;
/** Fraction of the atlas width that the world (grid + margin) spans. Game scale, not geographic. */
const WINDOW_FRACTION = 0.08;
const MAX_TEXTURE = 2040;
export const TERRAIN_CREDIT = 'Terrain: game-scaled from NASA MOLA relief · Ice: NASA Mars Odyssey HEND';

const worldAspect = (grid = WORLD_GRID) =>
  (grid.w + TERRAIN_MARGIN * 2) / ((grid.h + TERRAIN_MARGIN * 2) * 0.75);

/** Atlas pixel window (may wrap in longitude) for a site and a world aspect ratio. */
export function molaWindow(atlas, lat, lon, aspect = worldAspect()) {
  const width = Math.round(atlas.width * WINDOW_FRACTION);
  const height = Math.max(4, Math.round(width / aspect));
  const centerX = (lon + 180) * atlas.width / 360;
  const centerY = (90 - lat) * atlas.height / 180;
  const x = ((centerX - width / 2) % atlas.width + atlas.width) % atlas.width;
  const y = Math.max(0, Math.min(atlas.height - height, centerY - height / 2));
  return { x, y, width, height };
}

/** Copy the (possibly longitude-wrapped) window into a small canvas at native resolution. */
function sampleWindow(atlas, window) {
  const canvas = document.createElement('canvas');
  canvas.width = window.width;
  canvas.height = window.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const first = Math.min(window.width, atlas.width - Math.floor(window.x));
  context.drawImage(atlas, Math.floor(window.x), window.y, first, window.height, 0, 0, first, window.height);
  if (first < window.width) {
    context.drawImage(atlas, 0, window.y, window.width - first, window.height, first, 0, window.width - first, window.height);
  }
  return canvas;
}

/**
 * Relief proxy (0–1): standard deviation of brightness in the MOLA shaded-relief window around the
 * site. Rugged, cratered ground has strong light/shadow contrast; smooth plains do not.
 * Measured on the bundled atlas: Utopia/Arcadia ≈ 0.1, Elysium ≈ 0.3, Gale ≈ 0.8, Jezero ≈ 1.
 */
export function siteRelief(atlas, lat, lon) {
  if (!atlas?.width || typeof document === 'undefined') return undefined;
  const canvas = sampleWindow(atlas, molaWindow(atlas, lat, lon));
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0, squares = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += luma;
    squares += luma * luma;
  }
  const std = Math.sqrt(Math.max(0, squares / count - (sum / count) ** 2));
  return Math.min(1, Math.max(0, (std - 2) / 20));
}

/** Upscale in halving steps so bilinear filtering never stretches one sample across many pixels. */
function smoothUpscale(source, width) {
  let current = source;
  while (current.width * 2 < width) {
    const next = document.createElement('canvas');
    next.width = current.width * 2;
    next.height = current.height * 2;
    const context = next.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  return current;
}

/** Small seeded noise tile used as a repeating fine regolith grain. */
function grainPattern(context, random) {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const tile = canvas.getContext('2d');
  const image = tile.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const fine = random() * 2 - 1;
    const value = 128 + fine * 46 + (random() < 0.035 ? (random() < 0.5 ? -60 : 50) : 0);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, value));
    image.data[i + 3] = 255;
  }
  tile.putImageData(image, 0, 0);
  return context.createPattern(canvas, 'repeat');
}

/** Low-frequency seeded mottling (value noise upscaled smoothly). */
function mottle(random, columns, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext('2d');
  const image = context.createImageData(columns, rows);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 100 + random() * 56;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawCrater(context, x, y, radius) {
  // Light comes from the upper left: the far (lower-right) inner wall is lit, the near wall shaded.
  const ejecta = context.createRadialGradient(x, y, radius * 0.9, x, y, radius * 1.75);
  ejecta.addColorStop(0, 'rgba(236, 178, 140, 0.16)');
  ejecta.addColorStop(1, 'rgba(236, 178, 140, 0)');
  context.fillStyle = ejecta;
  context.beginPath();
  context.arc(x, y, radius * 1.75, 0, Math.PI * 2);
  context.fill();
  const bowl = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  bowl.addColorStop(0, 'rgba(48, 22, 16, 0.5)');
  bowl.addColorStop(0.55, 'rgba(92, 46, 32, 0.22)');
  bowl.addColorStop(1, 'rgba(255, 210, 170, 0.28)');
  context.fillStyle = bowl;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  const rim = context.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  rim.addColorStop(0, 'rgba(255, 216, 182, 0.55)');
  rim.addColorStop(0.5, 'rgba(200, 130, 96, 0.15)');
  rim.addColorStop(1, 'rgba(46, 20, 14, 0.5)');
  context.strokeStyle = rim;
  context.lineWidth = Math.max(1.5, radius * 0.14);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawPebble(context, random, x, y, size) {
  const rx = size * (0.7 + random() * 0.6), ry = size * (0.5 + random() * 0.4);
  const angle = random() * Math.PI;
  const tone = random();
  context.fillStyle = 'rgba(38, 18, 12, 0.38)';
  context.beginPath();
  context.ellipse(x + size * 0.45, y + size * 0.4, rx, ry, angle, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = tone < 0.5 ? `rgba(${118 + tone * 60 | 0}, ${66 + tone * 30 | 0}, ${48 + tone * 20 | 0}, 0.92)`
    : `rgba(${150 + tone * 40 | 0}, ${92 + tone * 30 | 0}, ${66 + tone * 20 | 0}, 0.9)`;
  context.beginPath();
  context.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(255, 220, 190, 0.35)';
  context.beginPath();
  context.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.42, ry * 0.36, angle, 0, Math.PI * 2);
  context.fill();
}

/** Draw the seeded detail layer onto the ground canvas. */
function drawDetail(context, { width, height, tilePx, random, site, relief, toPx, clear }) {
  const rowPx = tilePx * 0.75;
  // Mottling and grain.
  context.globalCompositeOperation = 'overlay';
  context.globalAlpha = 0.45;
  context.imageSmoothingEnabled = true;
  context.drawImage(smoothUpscale(mottle(random, Math.ceil(width / tilePx) * 2, Math.ceil(height / rowPx) * 2), width),
    0, 0, width, height);
  context.globalAlpha = 0.22;
  context.fillStyle = grainPattern(context, random);
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';

  // Wind ripples: fields of short parallel crests, perpendicular to one seeded wind direction.
  const wind = random() * Math.PI;
  const crest = wind + Math.PI / 2;
  const [cx, cy] = [Math.cos(crest), Math.sin(crest)];
  const [nx, ny] = [Math.cos(wind), Math.sin(wind)];
  const fields = Math.round(width * height / 26000);
  context.lineCap = 'round';
  context.lineWidth = 1.2;
  for (let field = 0; field < fields; field++) {
    const fx = random() * width, fy = random() * height;
    const crests = 4 + Math.floor(random() * 6);
    const spacing = 4.5 + random() * 2.5;
    const span = tilePx * (0.3 + random() * 0.6);
    for (let i = 0; i < crests; i++) {
      const offset = (i - crests / 2) * spacing;
      const length = span * (0.55 + 0.45 * Math.sin(Math.PI * (i + 0.5) / crests));
      const x = fx + nx * offset + (random() - 0.5) * 3, y = fy + ny * offset + (random() - 0.5) * 3;
      const bend = (random() - 0.3) * length * 0.25;
      const path = (shift) => {
        context.beginPath();
        context.moveTo(x - cx * length / 2 + shift * nx, y - cy * length / 2 + shift * ny);
        context.quadraticCurveTo(x + nx * (bend + shift), y + ny * (bend + shift),
          x + cx * length / 2 + shift * nx, y + cy * length / 2 + shift * ny);
        context.stroke();
      };
      context.strokeStyle = 'rgba(52, 24, 16, 0.10)';
      path(1.3);
      context.strokeStyle = 'rgba(255, 214, 178, 0.10)';
      path(0);
    }
  }

  // Craters (more on rugged ground), kept off the starter base.
  const craters = 3 + Math.round(relief * 7 + random() * 2);
  for (let placed = 0, attempts = 0; placed < craters && attempts < 200; attempts++) {
    const radius = tilePx * (0.35 + random() ** 2 * 1.9);
    const x = random() * width, y = random() * height;
    if (clear(x, y, radius + tilePx * 1.2)) continue;
    drawCrater(context, x, y, radius);
    placed++;
  }

  // Icy regolith patches: amount follows site.iceFactor (from NASA Mars Odyssey HEND neutron data).
  const ice = Math.max(0, Math.min(1, site.iceFactor ?? 0.3));
  const patches = Math.round(1 + ice * 14);
  for (let i = 0; i < patches; i++) {
    const px = random() * width, py = random() * height;
    if (clear(px, py, tilePx * 1.5)) continue;
    const spread = tilePx * (0.6 + random() * 1.8);
    for (let blob = 0; blob < 7; blob++) {
      const bx = px + (random() - 0.5) * spread * 1.6, by = py + (random() - 0.5) * spread;
      const radius = spread * (0.3 + random() * 0.5);
      const frost = context.createRadialGradient(bx, by, 0, bx, by, radius);
      frost.addColorStop(0, `rgba(228, 236, 242, ${0.1 + ice * 0.16})`);
      frost.addColorStop(1, 'rgba(228, 236, 242, 0)');
      context.fillStyle = frost;
      context.beginPath();
      context.arc(bx, by, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = 'rgba(245, 250, 255, 0.35)';
    for (let speck = 0; speck < 26; speck++) {
      context.fillRect(px + (random() - 0.5) * spread * 1.8, py + (random() - 0.5) * spread, 1.5, 1.5);
    }
  }

  // Pebbles everywhere, a few larger stones on rugged ground.
  const pebbles = Math.round(width * height / (640 - relief * 260));
  for (let i = 0; i < pebbles; i++) drawPebble(context, random, random() * width, random() * height, 0.8 + random() ** 4 * 2.4);
  const stones = Math.round(12 + relief * 46);
  for (let i = 0; i < stones; i++) {
    const x = random() * width, y = random() * height;
    if (!clear(x, y, tilePx)) drawPebble(context, random, x, y, 3.5 + random() * 4.5);
  }

  // A slightly swept pad under the starter base.
  const [hx, hy] = toPx(0.5, 0.5);
  const pad = context.createRadialGradient(hx, hy, tilePx, hx, hy, tilePx * 3.4);
  pad.addColorStop(0, 'rgba(226, 160, 120, 0.16)');
  pad.addColorStop(1, 'rgba(226, 160, 120, 0)');
  context.fillStyle = pad;
  context.fillRect(hx - tilePx * 4, hy - tilePx * 4, tilePx * 8, tilePx * 8);
}

export function createMarsTerrain(scene) {
  const { grid, site, seed } = scene.sim.state;
  const columns = grid.w + TERRAIN_MARGIN * 2;
  const rows = grid.h + TERRAIN_MARGIN * 2;
  // Texture pixels per tile; tiles keep the board's 4:3 shape so one uniform scale fits both axes.
  const tilePx = Math.floor(Math.min(MAX_TEXTURE / columns, MAX_TEXTURE / (rows * 0.75)));
  const width = columns * tilePx;
  const height = Math.round(rows * tilePx * 0.75);
  const key = 'colony-regolith';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, width, height);
  const context = texture.context;
  const atlas = scene.textures.get('mars-terrain').getSourceImage();
  const window = molaWindow(atlas, site.lat, site.lon, width / height);
  const sample = sampleWindow(atlas, window);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const soft = smoothUpscale(sample, width);
  if ('filter' in context) context.filter = `blur(${Math.round(tilePx * 0.35)}px)`;
  context.drawImage(soft, -tilePx, -tilePx, width + tilePx * 2, height + tilePx * 2);
  if ('filter' in context) context.filter = 'none';
  context.fillStyle = 'rgba(57, 30, 26, 0.16)';
  context.fillRect(0, 0, width, height);

  const hab = surfaceHab(scene.sim.state);
  const toPx = (dx, dy, x = hab.x, y = hab.y) =>
    [(x + dx + TERRAIN_MARGIN) * tilePx, (y + dy + TERRAIN_MARGIN) * tilePx * 0.75];
  const [hx, hy] = toPx(0.5, 0.5);
  const clear = (x, y, reach) => Math.abs(x - hx) < tilePx * 2 + reach && Math.abs(y - hy) < tilePx * 1.6 + reach;
  const relief = scene.surfaceRelief ?? DEFAULT_RELIEF;
  drawDetail(context, { width, height, tilePx, site, relief, toPx, clear,
    random: mulberry32(surfaceSeed(seed, site.lat, site.lon) ^ 0x9e3779b9) });
  texture.refresh();
  // The game runs with pixelArt (nearest filtering); the ground must filter smoothly when scaled.
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

  const image = scene.add.image(0, 0, key).setOrigin(0).setDepth(-100);
  const credit = scene.add.text(1262, 651, TERRAIN_CREDIT, {
    fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10, color: '#e3cfc4',
    stroke: '#1b1110', strokeThickness: 3,
  }).setOrigin(1, 0).setAlpha(0.85).setDepth(150);
  const terrain = {
    image, credit, tilePx,
    /** Place and scale the ground for a board transform (cheap; the texture is never rebuilt). */
    layout(transform) {
      image.setScale(transform.tile / tilePx);
      image.setPosition(transform.x - TERRAIN_MARGIN * transform.tile, transform.y - TERRAIN_MARGIN * transform.row);
    },
  };
  scene.boardTerrain = terrain;
  scene.events.once('shutdown', () => {
    scene.boardTerrain = null;
    scene.textures.remove(key);
  });
  return terrain;
}
