// AI-assisted (Cursor)
/** Procedural colony helper mascot — swap for a PNG later without changing callers. */

const palette = {
  suit: 0xc9956e,
  cream: 0xf5dfbd,
  trim: 0x86b1a7,
  dark: 0x51463e,
  visor: 0xe8c48a,
  leaf: 0x9bd8ae,
};

/** Safe colony slot: left of the board, above the action dock, clear of the right HUD. */
export const helperSlot = Object.freeze({ x: 58, y: 468 });

export function drawHelperBotanist(scene, x = helperSlot.x, y = helperSlot.y, scale = 1) {
  const root = scene.add.container(x, y).setDepth(28);
  const g = scene.add.graphics();
  const s = 1.2 * scale;
  // Local coords around (0,0) so the container can move/hit-test cleanly.
  g.fillStyle(palette.dark).fillRoundedRect(-10 * s, 22 * s, 8 * s, 6 * s, 2);
  g.fillStyle(palette.dark).fillRoundedRect(2 * s, 22 * s, 8 * s, 6 * s, 2);
  g.fillStyle(palette.suit).fillRoundedRect(-11 * s, 2 * s, 22 * s, 22 * s, 5);
  g.fillStyle(palette.cream).fillRoundedRect(-7 * s, 6 * s, 14 * s, 10 * s, 3);
  g.fillStyle(palette.suit).fillRoundedRect(-16 * s, 4 * s, 6 * s, 14 * s, 3);
  g.fillStyle(palette.suit).fillRoundedRect(10 * s, 4 * s, 6 * s, 14 * s, 3);
  g.fillStyle(palette.trim).fillCircle(0, -8 * s, 13 * s);
  g.fillStyle(palette.visor).fillCircle(0, -8 * s, 10 * s);
  g.fillStyle(palette.cream).fillCircle(-3 * s, -9 * s, 2 * s);
  g.fillStyle(palette.cream).fillCircle(4 * s, -9 * s, 2 * s);
  g.fillStyle(palette.dark).fillCircle(-3 * s, -9 * s, 0.9 * s);
  g.fillStyle(palette.dark).fillCircle(4 * s, -9 * s, 0.9 * s);
  g.lineStyle(1.5 * s, palette.dark, 0.7).lineBetween(-3 * s, -4 * s, 3 * s, -4 * s);
  g.fillStyle(palette.leaf).fillTriangle(-2 * s, 12 * s, 2 * s, 12 * s, 0, 6 * s);
  g.lineStyle(1.5 * s, palette.trim).lineBetween(0, 12 * s, 0, 16 * s);

  const hit = scene.add.rectangle(0, 4 * s, 40 * s, 56 * s, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true });
  const hint = scene.add.text(0, 34 * s, 'Tap for a space fact', {
    fontFamily: 'Arial', fontSize: 10, color: '#cba58c',
  }).setOrigin(0.5, 0).setAlpha(0.9);

  root.add([g, hit, hint]);

  const bob = scene.tweens.add({
    targets: root, y: y + 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });

  return {
    root,
    hit,
    wave() {
      scene.tweens.add({
        targets: root, angle: { from: -6, to: 6 }, duration: 160, yoyo: true, repeat: 2,
        onComplete: () => { root.angle = 0; },
      });
    },
    onClick(handler) {
      hit.on('pointerdown', handler);
      return this;
    },
    destroy() {
      bob.stop();
      root.destroy();
    },
  };
}

/** Draw a speech-tail from the helper toward the fact bubble. */
export function drawFactTail(scene, fromX, fromY, toX, toY) {
  const g = scene.add.graphics().setDepth(27);
  g.fillStyle(0x241c1b, 1);
  g.fillTriangle(fromX, fromY, toX, toY - 8, toX, toY + 8);
  g.lineStyle(1, 0xd4a574, 1);
  g.strokeTriangle(fromX, fromY, toX, toY - 8, toX, toY + 8);
  return g;
}

/** Pick a general space/NASA fact (prefer non-milestone encyclopedia cards). */
export function pickSpaceFact(facts, random = Math.random) {
  const general = (facts ?? []).filter((fact) => !fact.milestone);
  const pool = general.length ? general : (facts ?? []);
  if (!pool.length) {
    return {
      title: 'Space fact',
      text: 'A sol on Mars is about 24 hours 40 minutes long.',
      source: 'S4',
      survival: '',
    };
  }
  const fact = pool[Math.floor(random() * pool.length)];
  return {
    id: fact.id,
    milestone: 'click_space_fact',
    title: fact.title ?? 'Space fact',
    text: fact.text,
    survival: fact.survival ?? 'Useful background for planning the outpost.',
    source: fact.source,
    url: fact.url,
  };
}
