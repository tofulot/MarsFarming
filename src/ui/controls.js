// AI-assisted (OpenAI Codex; restyled with Claude to match the colony DOM HUD tokens)
// Tokens mirror src/ui/colony/ResourceHud.js so Phaser screens and the DOM HUD read as one product.
export const colors = {
  background: 0x150d0c, // page backdrop for menu screens, a shade below the sunken panel
  panel: 0x231615, raised: 0x3a2623, sunken: 0x1b1110, line: 0x6e4b42, divider: 0x4a3330,
  accent: 0xf0886a, accentHover: 0xf7a68c, mint: 0x9bd8ae,
  ink: '#f5e9e2', muted: '#c9b3a8', label: '#d6b4a1', accentText: '#f0886a', onAccent: '#1b1110',
  font: 'Inter, system-ui, sans-serif',
};
export const radii = { panel: 10, button: 6 };

export function text(scene, x, y, copy, size = 18, options = {}) {
  return scene.add.text(x, y, copy, {
    fontFamily: colors.font, fontSize: size, color: colors.ink, ...options,
  });
}

/** Small uppercase, letter-spaced label, the HUD's section-title treatment. */
export function label(scene, x, y, copy, options = {}) {
  return text(scene, x, y, copy.toUpperCase(), options.size ?? 13, {
    color: colors.accentText, fontStyle: '800', letterSpacing: 1.4, ...options,
  });
}

// Phaser 3.90 rounds with radius / 5 segments, which turns small radii into chamfers. Use more.
function smoothArc(path, centerX, centerY, radius, startAngle, endAngle) {
  const segments = Math.max(4, Math.ceil(radius / 1.5));
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (endAngle - startAngle) * i / segments;
    path.push(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
  }
}

// A rounded Phaser rectangle keeps setStrokeStyle / setFillStyle / setInteractive for every caller.
export function panel(scene, x, y, width, height, fill = colors.panel, radius = radii.panel) {
  const box = scene.add.rectangle(x, y, width, height, fill).setOrigin(0).setStrokeStyle(1, colors.line);
  const r = Math.min(radius, width / 2, height / 2);
  if (r > 0 && box.setRounded) {
    box.arcTo = smoothArc;
    box.setRounded(r);
  }
  return box;
}

export function progressBar(scene, group, x, y, width, height, fraction, color = colors.accent) {
  const track = scene.add.rectangle(x, y, width, height, 0x120d0c).setOrigin(0);
  const fill = scene.add.rectangle(x, y, width, height, color).setOrigin(0);
  fill.scaleX = Math.min(1, Math.max(0, fraction));
  if (group) group.addMultiple([track, fill]);
  return fill;
}

export function button(scene, x, y, width, height, label, callback, { selected = false, size = 17 } = {}) {
  const enabled = Boolean(callback);
  const fill = selected ? colors.accent : enabled ? colors.raised : colors.sunken;
  const stroke = selected ? colors.accent : enabled ? colors.line : colors.divider;
  const box = panel(scene, x, y, width, height, fill, radii.button).setStrokeStyle(1, stroke);
  const copy = text(scene, x + width / 2, y + height / 2, label, size, {
    color: selected ? colors.onAccent : enabled ? colors.ink : colors.muted,
    fontStyle: selected ? '700' : '600', align: 'center',
  }).setOrigin(.5);
  if (!enabled) copy.setAlpha(.7);
  if (enabled) {
    box.setInteractive({ useHandCursor: true });
    box.on('pointerover', () => (selected ? box.setFillStyle(colors.accentHover) : box.setStrokeStyle(1, colors.accent)));
    box.on('pointerout', () => box.setFillStyle(fill).setStrokeStyle(1, stroke));
    box.on('pointerdown', callback);
  }
  return { box, copy };
}

export function heading(scene, phase, title, description) {
  label(scene, 56, 38, phase);
  text(scene, 55, 62, title, 44, { fontStyle: '800' });
  text(scene, 57, 128, description, 18, { color: colors.muted });
}

export function targetBackground(scene) {
  scene.cameras.main.setBackgroundColor(colors.background);
}

export function formatUnits(value, kind, difficulty) {
  const amount = Math.round(value);
  const unit = { credits: 'cr', mass: 'kg', power: 'W', water: 'L', food: 'kg',
    dose: 'mSv', data: 'packets', comms: 'pkt/sol', battery: 'Wh' }[kind];
  if (difficulty === 'easy') return amount.toLocaleString('en-US');
  return [amount.toLocaleString('en-US'), unit].filter(Boolean).join(' ');
}
