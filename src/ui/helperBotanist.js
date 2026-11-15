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

export function drawHelperBotanist(scene, x, y, scale = 1) {
  const g = scene.add.graphics().setDepth(13);
  const s = 1.15 * scale;
  const draw = () => {
    g.clear();
    // boots
    g.fillStyle(palette.dark).fillRoundedRect(x - 10 * s, y + 22 * s, 8 * s, 6 * s, 2);
    g.fillStyle(palette.dark).fillRoundedRect(x + 2 * s, y + 22 * s, 8 * s, 6 * s, 2);
    // legs / torso
    g.fillStyle(palette.suit).fillRoundedRect(x - 11 * s, y + 2 * s, 22 * s, 22 * s, 5);
    g.fillStyle(palette.cream).fillRoundedRect(x - 7 * s, y + 6 * s, 14 * s, 10 * s, 3);
    // arms
    g.fillStyle(palette.suit).fillRoundedRect(x - 16 * s, y + 4 * s, 6 * s, 14 * s, 3);
    g.fillStyle(palette.suit).fillRoundedRect(x + 10 * s, y + 4 * s, 6 * s, 14 * s, 3);
    // helmet
    g.fillStyle(palette.trim).fillCircle(x, y - 8 * s, 13 * s);
    g.fillStyle(palette.visor).fillCircle(x, y - 8 * s, 10 * s);
    g.fillStyle(palette.cream).fillCircle(x - 3 * s, y - 9 * s, 2 * s);
    g.fillStyle(palette.cream).fillCircle(x + 4 * s, y - 9 * s, 2 * s);
    g.fillStyle(palette.dark).fillCircle(x - 3 * s, y - 9 * s, 0.9 * s);
    g.fillStyle(palette.dark).fillCircle(x + 4 * s, y - 9 * s, 0.9 * s);
    g.lineStyle(1.5 * s, palette.dark, 0.7).lineBetween(x - 3 * s, y - 4 * s, x + 3 * s, y - 4 * s);
    // sprout badge
    g.fillStyle(palette.leaf).fillTriangle(x - 2 * s, y + 12 * s, x + 2 * s, y + 12 * s, x, y + 6 * s);
    g.lineStyle(1.5 * s, palette.trim).lineBetween(x, y + 12 * s, x, y + 16 * s);
  };
  draw();
  const bob = scene.tweens.add({
    targets: g, y: '+=3', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
  return {
    graphic: g,
    wave() {
      scene.tweens.add({
        targets: g, angle: { from: -6, to: 6 }, duration: 160, yoyo: true, repeat: 2,
        onComplete: () => { g.angle = 0; },
      });
    },
    destroy() {
      bob.stop();
      g.destroy();
    },
  };
}

/** Draw a speech-tail from the helper toward the fact bubble. */
export function drawFactTail(scene, fromX, fromY, toX, toY) {
  const g = scene.add.graphics().setDepth(12);
  g.fillStyle(0x241c1b, 1);
  g.fillTriangle(fromX, fromY, toX, toY - 8, toX, toY + 8);
  g.lineStyle(1, 0xd4a574, 1);
  g.strokeTriangle(fromX, fromY, toX, toY - 8, toX, toY + 8);
  return g;
}
