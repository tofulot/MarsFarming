// AI-assisted (Cursor)
/**
 * Procedural colony helper — cute alien dog mascot.
 * Inspired by simple rounded alien-pup silhouettes (big eyes, short snout, wagging tail).
 * Swap for a PNG later without changing callers.
 */

const palette = {
  fur: 0x9bd8ae,
  furDeep: 0x6fad8f,
  belly: 0xe8f6ee,
  earIn: 0xf0c9a0,
  nose: 0x3d342f,
  eye: 0x1f1a18,
  shine: 0xffffff,
  collar: 0xe0b07a,
  tag: 0xff805a,
  antenna: 0x86b1a7,
};

/** Safe colony slot: left of the board, above the action dock, clear of the right HUD. */
export const helperSlot = Object.freeze({ x: 58, y: 468 });

export function drawHelperBotanist(scene, x = helperSlot.x, y = helperSlot.y, scale = 1) {
  const root = scene.add.container(x, y).setDepth(28);
  const body = scene.add.graphics();
  const tail = scene.add.graphics();
  const s = 1.25 * scale;

  drawAlienDog(body, s);
  drawTail(tail, s);
  tail.x = 14 * s;
  tail.y = 6 * s;

  const hit = scene.add.rectangle(0, 2 * s, 46 * s, 52 * s, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true });

  root.add([tail, body, hit]);

  const bob = scene.tweens.add({
    targets: root, y: y + 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
  const wag = scene.tweens.add({
    targets: tail,
    angle: { from: -18, to: 22 },
    duration: 320,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  return {
    root,
    hit,
    wave() {
      wag.pause();
      scene.tweens.add({
        targets: root, angle: { from: -8, to: 8 }, duration: 140, yoyo: true, repeat: 2,
        onComplete: () => {
          root.angle = 0;
          wag.resume();
        },
      });
      scene.tweens.add({
        targets: tail, angle: { from: -28, to: 32 }, duration: 90, yoyo: true, repeat: 4,
      });
    },
    onClick(handler) {
      hit.on('pointerdown', handler);
      return this;
    },
    destroy() {
      bob.stop();
      wag.stop();
      root.destroy();
    },
  };
}

function drawTail(g, s) {
  g.clear();
  g.fillStyle(palette.furDeep, 1);
  g.fillEllipse(0, 0, 10 * s, 16 * s);
  g.fillStyle(palette.fur, 1);
  g.fillCircle(0, -7 * s, 5 * s);
}

function drawAlienDog(g, s) {
  g.clear();

  // Hind / front paws
  g.fillStyle(palette.furDeep, 1);
  g.fillRoundedRect(-12 * s, 16 * s, 8 * s, 7 * s, 3 * s);
  g.fillRoundedRect(3 * s, 16 * s, 8 * s, 7 * s, 3 * s);

  // Body
  g.fillStyle(palette.fur, 1);
  g.fillEllipse(0, 8 * s, 28 * s, 22 * s);
  g.fillStyle(palette.belly, 1);
  g.fillEllipse(0, 10 * s, 16 * s, 14 * s);

  // Collar + colony tag
  g.fillStyle(palette.collar, 1);
  g.fillRoundedRect(-10 * s, 1 * s, 20 * s, 4 * s, 2 * s);
  g.fillStyle(palette.tag, 1);
  g.fillCircle(0, 5.5 * s, 3.2 * s);
  g.fillStyle(palette.shine, 0.85);
  g.fillCircle(-0.8 * s, 4.6 * s, 0.9 * s);

  // Head (big & round — alien-pup read)
  g.fillStyle(palette.fur, 1);
  g.fillCircle(0, -10 * s, 15 * s);

  // Ears (soft rounded alien flaps)
  g.fillStyle(palette.furDeep, 1);
  g.fillEllipse(-12 * s, -18 * s, 10 * s, 14 * s);
  g.fillEllipse(12 * s, -18 * s, 10 * s, 14 * s);
  g.fillStyle(palette.earIn, 1);
  g.fillEllipse(-12 * s, -17 * s, 5 * s, 8 * s);
  g.fillEllipse(12 * s, -17 * s, 5 * s, 8 * s);

  // Cheek fluff
  g.fillStyle(palette.belly, 1);
  g.fillCircle(-9 * s, -6 * s, 4.5 * s);
  g.fillCircle(9 * s, -6 * s, 4.5 * s);

  // Snout
  g.fillStyle(palette.belly, 1);
  g.fillEllipse(0, -5 * s, 12 * s, 9 * s);
  g.fillStyle(palette.nose, 1);
  g.fillEllipse(0, -7 * s, 4.5 * s, 3.2 * s);
  g.fillStyle(palette.shine, 0.7);
  g.fillCircle(-0.9 * s, -7.8 * s, 0.9 * s);

  // Smile
  g.lineStyle(1.4 * s, palette.nose, 0.75);
  g.beginPath();
  g.arc(0, -4.2 * s, 3.2 * s, 0.15 * Math.PI, 0.85 * Math.PI, false);
  g.strokePath();

  // Oversized shiny eyes
  g.fillStyle(palette.shine, 1);
  g.fillEllipse(-5.2 * s, -12 * s, 7.5 * s, 8.5 * s);
  g.fillEllipse(5.2 * s, -12 * s, 7.5 * s, 8.5 * s);
  g.fillStyle(palette.eye, 1);
  g.fillCircle(-5.2 * s, -11.5 * s, 2.6 * s);
  g.fillCircle(5.2 * s, -11.5 * s, 2.6 * s);
  g.fillStyle(palette.shine, 1);
  g.fillCircle(-6.2 * s, -13 * s, 1.2 * s);
  g.fillCircle(4.2 * s, -13 * s, 1.2 * s);
  g.fillCircle(-4.4 * s, -10.4 * s, 0.6 * s);
  g.fillCircle(6 * s, -10.4 * s, 0.6 * s);

  // Tiny antenna (alien cue) with soft tip
  g.lineStyle(1.6 * s, palette.antenna, 1);
  g.lineBetween(0, -24 * s, 0, -30 * s);
  g.fillStyle(palette.tag, 1);
  g.fillCircle(0, -31.5 * s, 2.4 * s);
  g.fillStyle(palette.shine, 0.8);
  g.fillCircle(-0.5 * s, -32.2 * s, 0.8 * s);
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
