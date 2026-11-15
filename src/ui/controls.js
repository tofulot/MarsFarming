// AI-assisted (OpenAI Codex)
export const colors = { background: 0x140f13, panel: 0x251b22, line: 0x60404a,
  accent: 0xff805a, mint: 0x9bd8ae, ink: '#fff2dd', muted: '#c2aab0' };

export function text(scene, x, y, copy, size = 18, options = {}) {
  return scene.add.text(x, y, copy, {
    fontFamily: 'system-ui, sans-serif', fontSize: size, color: colors.ink, ...options,
  });
}

export function panel(scene, x, y, width, height, fill = colors.panel) {
  return scene.add.rectangle(x, y, width, height, fill).setOrigin(0).setStrokeStyle(1, colors.line);
}

export function progressBar(scene, group, x, y, width, height, fraction, color = colors.accent) {
  const track = scene.add.rectangle(x, y, width, height, 0x422f37).setOrigin(0);
  const fill = scene.add.rectangle(x, y, width, height, color).setOrigin(0);
  fill.scaleX = Math.min(1, Math.max(0, fraction));
  if (group) group.addMultiple([track, fill]);
  return fill;
}

export function button(scene, x, y, width, height, label, callback, { selected = false, size = 17 } = {}) {
  const enabled = Boolean(callback);
  const base = selected ? colors.accent : enabled ? 0x3b2932 : 0x201a1f;
  const box = panel(scene, x, y, width, height, base);
  const copy = text(scene, x + width / 2, y + height / 2, label, size, {
    color: selected ? '#1b1011' : enabled ? colors.ink : colors.muted, align: 'center',
  }).setOrigin(.5);
  if (enabled) {
    box.setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setFillStyle(selected ? 0xffa689 : 0x63404a));
    box.on('pointerout', () => box.setFillStyle(base));
    box.on('pointerdown', callback);
  }
  return { box, copy };
}

export function heading(scene, phase, title, description) {
  text(scene, 56, 38, phase, 15, { color: '#ff805a', fontStyle: 'bold' });
  text(scene, 55, 66, title, 48, { fontStyle: 'bold' });
  text(scene, 57, 132, description, 19, { color: colors.muted });
}

export function targetBackground(scene) {
  scene.cameras.main.setBackgroundColor(colors.background);
}

export function formatUnits(value, kind, difficulty) {
  const amount = Math.round(value);
  const unit = { credits: 'kg', mass: 'kg', power: 'W', water: 'L', food: 'kg',
    dose: 'mSv', data: 'packets', comms: 'pkt/sol', battery: 'Wh' }[kind];
  if (difficulty === 'easy') return amount.toLocaleString('en-US');
  return [amount.toLocaleString('en-US'), unit].filter(Boolean).join(' ');
}
