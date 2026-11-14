// Stylized regolith, wind-shaped ripples and basalt fragments. Visual only.
export function createMarsTerrain(scene) {
  const key = 'colony-regolith';
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 1280, 720);
    const ctx = texture.context;
    let seed = 1717;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = '#9a6048';
    ctx.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 100; i++) {
      const x = random() * 1280, y = random() * 720, radius = 70 + random() * 200;
      const wash = ctx.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 2 ? '#c28a5e35' : '#552f2730');
      wash.addColorStop(1, '#80513a00');
      ctx.fillStyle = wash;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 140; i++) {
      const x = random() * 1280, y = random() * 720;
      const width = 30 + random() * 100;
      ctx.strokeStyle = '#e0a77418';
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + width * 0.3, y - 12, x + width * 0.7, y - 10, x + width, y - 4);
      ctx.stroke();
    }
    for (let i = 0; i < 18000; i++) {
      ctx.fillStyle = random() > 0.5 ? '#e6af7412' : '#392a2316';
      ctx.fillRect(random() * 1280, random() * 720, 1 + random() * 2, 1);
    }
    for (let i = 0; i < 340; i++) {
      const x = random() * 1280, y = random() * 720, size = 1 + random() ** 3 * 11;
      ctx.fillStyle = '#432f2544';
      ctx.beginPath(); ctx.ellipse(x + size * 0.7, y + size * 0.5, size * 1.6, size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i % 3 ? '#6c5140' : '#514940';
      ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x - size * 0.6, y - size * 0.7);
      ctx.lineTo(x + size * 0.4, y - size); ctx.lineTo(x + size, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b48c6855'; ctx.stroke();
    }
    // Shallow impact hollows, with an illuminated northwest rim.
    for (const [x, y, radius] of [[875, 360, 92], [55, 390, 32], [795, 140, 43], [1140, 460, 62]]) {
      ctx.fillStyle = '#5d3b2e20';
      ctx.beginPath(); ctx.ellipse(x, y, radius, radius * 0.53, -0.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d1a07844'; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = '#5b3c302b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x + 4, y + 5, radius * 0.92, radius * 0.48, -0.15, 0, Math.PI); ctx.stroke();
    }
    texture.refresh();
  }
  scene.add.image(0, 0, key).setOrigin(0).setDepth(-100);
}
