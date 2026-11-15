// Surface backdrop sampled from the bundled NASA Ames MOLA shaded-relief atlas.
export function createMarsTerrain(scene) {
  const width = 1280;
  const height = 720;
  const key = 'colony-regolith';
  const texture = scene.textures.createCanvas(key, width, height);
  const context = texture.context;
  const atlas = scene.textures.get('mars-terrain').getSourceImage();
  const { lat, lon } = scene.sim.state.site;
  const sampleWidth = Math.round(atlas.width * 0.08);
  const sampleHeight = Math.round(sampleWidth * height / width);
  const centerX = (lon + 180) * atlas.width / 360;
  const centerY = (90 - lat) * atlas.height / 180;
  const startX = ((centerX - sampleWidth / 2) % atlas.width + atlas.width) % atlas.width;
  const startY = Math.max(0, Math.min(atlas.height - sampleHeight, centerY - sampleHeight / 2));
  const firstWidth = Math.min(sampleWidth, atlas.width - startX);
  const firstDisplayWidth = width * firstWidth / sampleWidth;

  context.drawImage(atlas, startX, startY, firstWidth, sampleHeight, 0, 0, firstDisplayWidth, height);
  if (firstWidth < sampleWidth) {
    context.drawImage(atlas, 0, startY, sampleWidth - firstWidth, sampleHeight,
      firstDisplayWidth, 0, width - firstDisplayWidth, height);
  }
  context.fillStyle = 'rgba(57, 30, 26, 0.20)';
  context.fillRect(0, 0, width, height);
  texture.refresh();

  scene.add.image(0, 0, key).setOrigin(0).setDepth(-100);
  scene.events.once('shutdown', () => scene.textures.remove(key));
}
