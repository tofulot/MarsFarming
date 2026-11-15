// AI-assisted (Claude Code: world-space ground texture)
// Surface ground sampled from the bundled NASA Ames MOLA shaded-relief atlas, built once per scene in
// world-tile space and positioned by the board transform.
import Phaser from 'phaser';

/** Tiles of ground drawn beyond each edge of the grid, so panning never shows a hard edge. */
export const TERRAIN_MARGIN = 2;
/** Fraction of the atlas width that the world (grid + margin) spans. Game scale, not geographic. */
const WINDOW_FRACTION = 0.08;
const MAX_TEXTURE = 2040;

/** Atlas pixel window (may wrap in longitude) for a site and a world aspect ratio. */
export function molaWindow(atlas, lat, lon, aspect) {
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
  const context = canvas.getContext('2d');
  const first = Math.min(window.width, atlas.width - Math.floor(window.x));
  context.drawImage(atlas, Math.floor(window.x), window.y, first, window.height, 0, 0, first, window.height);
  if (first < window.width) {
    context.drawImage(atlas, 0, window.y, window.width - first, window.height, first, 0, window.width - first, window.height);
  }
  return canvas;
}

/** Upscale in halving steps so bilinear filtering never stretches one sample across many pixels. */
function smoothUpscale(source, width, height) {
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

export function createMarsTerrain(scene) {
  const { grid, site } = scene.sim.state;
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
  const soft = smoothUpscale(sample, width, height);
  if ('filter' in context) context.filter = `blur(${Math.round(tilePx * 0.35)}px)`;
  context.drawImage(soft, -tilePx, -tilePx, width + tilePx * 2, height + tilePx * 2);
  if ('filter' in context) context.filter = 'none';
  context.fillStyle = 'rgba(57, 30, 26, 0.20)';
  context.fillRect(0, 0, width, height);
  texture.refresh();
  // The game runs with pixelArt (nearest filtering); the ground must filter smoothly when scaled.
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

  const image = scene.add.image(0, 0, key).setOrigin(0).setDepth(-100);
  const terrain = {
    image, tilePx,
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
