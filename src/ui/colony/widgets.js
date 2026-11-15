// AI-assisted (Claude Code set the shared body font)
import { colonyTheme as theme } from './layout.js';
import { fontBody, theme as tokens } from '../theme.js';
export function label(scene, group, x, y, copy, size = 13, options = {}) {
  const item = scene.add.text(x, y, copy, { fontFamily: fontBody, fontSize: Math.max(tokens.bodyMinPx, size),
    color: theme.ink, ...options }).setDepth(22);
  group?.add(item);
  return item;
}
export function plate(scene, group, x, y, width, height, fill = theme.panel, alpha = 0.96) {
  const item = scene.add.rectangle(x, y, width, height, fill, alpha).setOrigin(0)
    .setStrokeStyle(1, theme.line, 0.85).setDepth(20);
  group?.add(item);
  return item;
}
export function action(scene, group, x, y, width, height, copy, callback, selected = false) {
  const box = plate(scene, group, x, y, width, height, selected ? 0x80503b : theme.panel);
  label(scene, group, x + width / 2, y + height / 2, copy, 12,
    { color: callback ? theme.ink : theme.muted, align: 'center' }).setOrigin(0.5);
  if (callback) box.setInteractive({ useHandCursor: true }).on('pointerdown', callback)
    .on('pointerover', (pointer) => {
      box.setFillStyle(0x80503b);
      scene.colonyTooltip?.destroy();
      scene.colonyTooltip = scene.add.text(pointer.x + 12, pointer.y + 12, copy.replace(/\n/g, ' · '), {
        fontFamily: fontBody, fontSize: 15, color: '#fff1df', backgroundColor: '#38221d',
        padding: { x: 7, y: 5 },
      }).setDepth(250).setScrollFactor(0);
    })
    .on('pointerout', () => {
      box.setFillStyle(selected ? 0x80503b : theme.panel);
      scene.colonyTooltip?.destroy();
      scene.colonyTooltip = null;
    });
  return box;
}
