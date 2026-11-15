// AI-assisted (Claude): code-drawn building sprites on a 36x36 unit canvas, one visual language for every building.
// Dark base, light shell, teal trim, one status light (green online, dim red offline), soft ground shadow, no text.
const spriteTypes = new Set(['hab', 'battery', 'washer', 'autoHarvester', 'fertilizer', 'iceDrill', 'harvester',
  'recycler', 'rockProp', 'berm', 'shelter', 'comms', 'lab', 'nuclear']);

export const buildingSpriteIds = Object.freeze([...spriteTypes]);

const DARK = 0x3d322c;
const DARKER = 0x2a211d;
const REGOLITH = 0x8d5c40;
const REGOLITH_LIT = 0xb07652;

function palette(online) {
  return {
    shell: online ? 0xe4d5ba : 0x9b8c7f,
    shade: online ? 0xbcab8f : 0x7c6f65,
    trim: online ? 0x5fb3a6 : 0x66706c,
    glass: online ? 0x9fe3ea : 0x4a5559,
    glow: online ? 0xf0b659 : 0x6a5c50,
  };
}

function shadow(g, width = 28, cy = 31) {
  g.fillStyle(0x1c120e, 0.32).fillEllipse(18, cy, width, 6);
}

function statusLight(g, x, y, online) {
  if (online) g.fillStyle(0x86ef8c, 0.3).fillCircle(x, y, 3.4);
  g.fillStyle(DARKER).fillCircle(x, y, 2.2);
  g.fillStyle(online ? 0x86ef8c : 0xa9453a).fillCircle(x, y, 1.5);
}

function dome(g, cx, cy, r, color) {
  g.fillStyle(color).beginPath().slice(cx, cy, r, Math.PI, 0, false).closePath().fillPath();
}

function arcLine(g, cx, cy, r, from, to, width, color, alpha = 1) {
  g.lineStyle(width, color, alpha).beginPath().arc(cx, cy, r, from, to, false).strokePath();
}

const draw = {
  hab(g, p, online) {
    shadow(g, 32);
    g.fillStyle(DARK).fillRoundedRect(4, 24, 28, 6, 2);
    dome(g, 16, 25, 12, p.shell);
    arcLine(g, 16, 25, 9, Math.PI * 1.15, Math.PI * 1.55, 2, 0xffffff, online ? 0.45 : 0.15);
    g.fillStyle(p.trim).fillRect(4, 22, 24, 2.5);
    g.fillStyle(p.glass).fillRoundedRect(10, 16, 5, 4, 1).fillRoundedRect(17, 16, 5, 4, 1);
    // Airlock tube with hatch.
    g.fillStyle(p.shade).fillRoundedRect(25, 17, 9, 9, 2);
    g.fillStyle(DARK).fillRoundedRect(29, 19, 3.5, 6, 1);
    g.fillStyle(p.trim).fillRect(25, 17, 9, 1.6);
    statusLight(g, 16, 10, online);
  },
  comms(g, p, online) {
    shadow(g, 20);
    g.fillStyle(DARK).fillRoundedRect(11, 25, 14, 5, 2);
    g.lineStyle(3, p.shade).lineBetween(18, 26, 18, 14);
    g.lineStyle(1.5, p.shade).lineBetween(13, 26, 18, 18).lineBetween(23, 26, 18, 18);
    // Dish tilted up and to the left, with a feed horn on a boom.
    g.fillStyle(p.shell).fillEllipse(15, 11, 22, 11);
    g.fillStyle(p.shade).fillEllipse(15, 11.5, 15, 6.5);
    g.lineStyle(2, p.trim).strokeEllipse(15, 11, 22, 11);
    g.lineStyle(1.5, p.shade).lineBetween(15, 11, 24, 4);
    g.fillStyle(p.trim).fillCircle(24, 4, 2);
    statusLight(g, 22, 27.5, online);
  },
  battery(g, p, online) {
    shadow(g, 30);
    g.fillStyle(DARK).fillRoundedRect(4, 25, 28, 5, 2);
    for (const x of [6, 14.5, 23]) {
      g.fillStyle(DARKER).fillRect(x + 2, 6, 3, 3);
      g.fillStyle(p.shell).fillRoundedRect(x, 8, 7, 18, 2);
      g.fillStyle(DARKER).fillRoundedRect(x + 1.5, 10, 4, 14, 1);
      const charge = online ? 11 : 3;
      g.fillStyle(online ? p.trim : 0x8a4a3c).fillRect(x + 2, 23.5 - charge, 3, charge);
    }
    statusLight(g, 30, 6, online);
  },
  recycler(g, p, online) {
    shadow(g, 30);
    g.fillStyle(DARK).fillRoundedRect(4, 25, 28, 5, 2);
    // Pipe loop from the tank through a pump.
    g.lineStyle(3, p.trim).lineBetween(17, 11, 29, 11).lineBetween(29, 11, 29, 23).lineBetween(17, 23, 24, 23);
    g.fillStyle(p.shade).fillRoundedRect(22, 18, 9, 8, 2);
    g.fillStyle(DARK).fillCircle(26.5, 22, 2.2);
    g.fillStyle(p.shell).fillRoundedRect(5, 6, 13, 21, 6);
    g.fillStyle(p.trim).fillRect(5, 13, 13, 2.5);
    g.fillStyle(p.glass).fillRoundedRect(8.5, 17, 6, 6, 2);
    g.fillStyle(0xffffff, online ? 0.35 : 0.1).fillRect(7, 8, 2, 4);
    statusLight(g, 11.5, 3.8, online);
  },
  harvester(g, p, online) {
    shadow(g, 30);
    g.fillStyle(DARK).fillRoundedRect(4, 25, 28, 5, 2);
    g.fillStyle(p.shell).fillRoundedRect(5, 7, 26, 19, 3);
    g.fillStyle(p.trim).fillRect(5, 7, 26, 2.5);
    // Intake fan.
    g.fillStyle(DARKER).fillCircle(15, 17, 7.5);
    g.lineStyle(2.2, p.trim);
    for (let blade = 0; blade < 4; blade++) {
      const angle = blade * Math.PI / 2 + Math.PI / 8;
      g.lineBetween(15, 17, 15 + Math.cos(angle) * 6, 17 + Math.sin(angle) * 6);
    }
    g.fillStyle(p.shade).fillCircle(15, 17, 2);
    g.lineStyle(1.5, p.shade).strokeCircle(15, 17, 7.5);
    // Exhaust louvres.
    g.lineStyle(1.5, p.shade).lineBetween(25, 13, 29, 13).lineBetween(25, 17, 29, 17).lineBetween(25, 21, 29, 21);
    statusLight(g, 27, 4.5, online);
  },
  fertilizer(g, p, online) {
    shadow(g, 28);
    g.fillStyle(DARK).fillRoundedRect(5, 25, 26, 5, 2);
    g.lineStyle(2, p.shade).lineBetween(9, 25, 11, 15).lineBetween(27, 25, 25, 15);
    // Hopper funnel feeding a mixing vat.
    g.fillStyle(p.shell).fillPoints([{ x: 7, y: 5 }, { x: 29, y: 5 }, { x: 22, y: 16 }, { x: 14, y: 16 }], true);
    g.fillStyle(p.trim).fillRect(7, 5, 22, 2.5);
    g.fillStyle(p.shade).fillRect(16, 16, 4, 3);
    g.fillStyle(p.shell).fillRoundedRect(11, 18, 14, 8, 3);
    g.fillStyle(online ? 0x7fae5c : 0x5d6650).fillRoundedRect(13, 20, 10, 3, 1);
    statusLight(g, 18, 10.5, online);
  },
  berm(g, p, online) {
    shadow(g, 34);
    dome(g, 18, 29, 15, REGOLITH);
    g.fillStyle(REGOLITH_LIT).beginPath().slice(15, 29, 10, Math.PI * 1.05, Math.PI * 1.7, false).closePath().fillPath();
    g.fillStyle(DARK);
    for (const [x, y, r] of [[10, 26, 1.6], [16, 21, 1.3], [23, 24, 1.8], [27, 27, 1.2], [19, 27, 1]]) g.fillCircle(x, y, r);
    // Survey marker post on the crest.
    g.lineStyle(1.8, p.shade).lineBetween(26, 18, 26, 9);
    g.fillStyle(p.trim).fillRect(26, 9, 5, 3);
    statusLight(g, 26, 7, online);
  },
  shelter(g, p, online) {
    shadow(g, 34);
    // Sandbag ring.
    g.fillStyle(REGOLITH);
    for (const x of [5, 11, 17, 23, 29]) g.fillEllipse(x + 1, 27, 7, 5);
    dome(g, 18, 25, 13, p.shade);
    dome(g, 18, 25, 9.5, p.shell);
    // Reinforcing ribs across the thick outer shell.
    g.lineStyle(2, DARK);
    for (const angle of [Math.PI * 1.17, Math.PI * 1.39, Math.PI * 1.61, Math.PI * 1.83]) {
      g.lineBetween(18 + Math.cos(angle) * 9.5, 25 + Math.sin(angle) * 9.5, 18 + Math.cos(angle) * 13, 25 + Math.sin(angle) * 13);
    }
    arcLine(g, 18, 25, 13, Math.PI, Math.PI * 2, 2, p.trim);
    arcLine(g, 18, 25, 6.5, Math.PI * 1.2, Math.PI * 1.5, 1.5, 0xffffff, online ? 0.4 : 0.12);
    g.fillStyle(DARKER).fillRoundedRect(15.5, 20, 5, 6, { tl: 2.5, tr: 2.5, bl: 0, br: 0 });
    statusLight(g, 18, 9.5, online);
  },
  lab(g, p, online) {
    shadow(g, 32);
    g.fillStyle(DARK).fillRoundedRect(4, 25, 28, 5, 2);
    g.fillStyle(p.shell).fillRoundedRect(3, 12, 30, 14, 6);
    g.fillStyle(p.trim).fillRect(3, 21, 30, 2.2);
    g.fillStyle(p.glass).fillRoundedRect(7, 14.5, 11, 5, 2);
    g.fillStyle(0xffffff, online ? 0.4 : 0.1).fillRect(8.5, 15.5, 3, 1.5);
    g.fillStyle(DARK).fillRoundedRect(23, 15, 6, 8, 1.5);
    // Sensor mast with a small sample arm.
    g.lineStyle(1.8, p.shade).lineBetween(12, 12, 12, 5);
    g.fillStyle(p.trim).fillEllipse(12, 4.5, 7, 3);
    g.lineStyle(1.8, p.shade).lineBetween(26, 12, 30, 7);
    statusLight(g, 26, 9.5, online);
  },
  washer(g, p, online) {
    shadow(g, 30);
    g.fillStyle(DARK).fillRoundedRect(4, 25, 28, 5, 2);
    // Intake hopper on the left, washing drum housing on the right.
    g.fillStyle(p.shade).fillPoints([{ x: 4, y: 8 }, { x: 13, y: 8 }, { x: 11, y: 17 }, { x: 6, y: 17 }], true);
    g.fillStyle(REGOLITH_LIT).fillRect(5, 8, 7, 2.5);
    g.fillStyle(p.shell).fillRoundedRect(10, 7, 21, 19, 3);
    g.fillStyle(p.trim).fillRect(10, 7, 21, 2.5);
    g.fillStyle(DARKER).fillCircle(20.5, 17.5, 6);
    g.fillStyle(online ? 0x6fb7c4 : 0x4b5658).fillCircle(20.5, 18.5, 4.5);
    g.lineStyle(1.8, p.trim).strokeCircle(20.5, 17.5, 6);
    statusLight(g, 28, 12, online);
  },
  autoHarvester(g, p, online) {
    shadow(g, 32);
    g.fillStyle(DARKER).fillCircle(9, 25, 4.2).fillCircle(21, 25, 4.2);
    g.fillStyle(p.shade).fillCircle(9, 25, 1.6).fillCircle(21, 25, 1.6);
    g.fillStyle(p.shell).fillRoundedRect(4, 13, 22, 9, 3);
    g.fillStyle(p.trim).fillRect(4, 17, 22, 2);
    g.fillStyle(DARK).fillRoundedRect(7, 8, 9, 6, 2);
    g.fillStyle(p.glass).fillRect(8.5, 9.5, 6, 2.5);
    // Picking arm and claw reaching to the right.
    g.lineStyle(2.4, p.shade).lineBetween(24, 14, 30, 9).lineBetween(30, 9, 33, 17);
    g.lineStyle(2, p.trim).lineBetween(33, 17, 30, 21).lineBetween(33, 17, 35, 21);
    statusLight(g, 20, 10, online);
  },
  iceDrill(g, p, online) {
    shadow(g, 28);
    g.fillStyle(DARK).fillRoundedRect(5, 24, 26, 6, 2);
    // Ice core spoil next to the rig.
    g.fillStyle(online ? 0xc8e6f0 : 0x8e9ca2).fillPoints([{ x: 25, y: 24 }, { x: 28, y: 20 }, { x: 32, y: 21 }, { x: 33, y: 24 }], true);
    g.lineStyle(3, p.shell).lineBetween(8, 24, 16, 4).lineBetween(16, 4, 24, 24);
    g.lineStyle(1.5, p.shade).lineBetween(10.5, 18, 21.5, 18).lineBetween(12.5, 12, 19.5, 12);
    g.lineStyle(2.4, p.trim).lineBetween(16, 6, 16, 31);
    g.fillStyle(p.shade).fillRoundedRect(13, 14, 6, 6, 1.5);
    statusLight(g, 16, 3, online);
  },
  nuclear(g, p, online) {
    shadow(g, 28);
    g.fillStyle(DARK).fillRoundedRect(7, 25, 22, 5, 2);
    g.fillStyle(p.shell).fillRoundedRect(13, 13, 10, 13, 2);
    g.fillStyle(p.glow).fillRoundedRect(15.5, 17, 5, 5, 1);
    // Umbrella radiator with fins.
    g.fillStyle(p.shade).fillPoints([{ x: 4, y: 5 }, { x: 32, y: 5 }, { x: 22, y: 14 }, { x: 14, y: 14 }], true);
    g.lineStyle(1.3, DARK);
    for (const x of [9, 14, 18, 22, 27]) g.lineBetween(x, 5.5, 18 + (x - 18) * 0.4, 13.5);
    g.fillStyle(p.trim).fillRect(4, 4, 28, 2);
    statusLight(g, 26, 22, online);
  },
  rockProp(g) {
    shadow(g, 30);
    g.fillStyle(0x4a3c35).fillPoints([{ x: 4, y: 29 }, { x: 8, y: 17 }, { x: 15, y: 9 }, { x: 24, y: 11 }, { x: 31, y: 21 }, { x: 32, y: 29 }], true);
    g.fillStyle(0x6b574b).fillPoints([{ x: 8, y: 17 }, { x: 15, y: 9 }, { x: 19, y: 13 }, { x: 13, y: 22 }], true);
    g.fillStyle(0x362b26).fillPoints([{ x: 19, y: 13 }, { x: 24, y: 11 }, { x: 31, y: 21 }, { x: 22, y: 22 }], true);
    g.fillStyle(0x2e2420).fillCircle(24, 25, 1.2).fillCircle(11, 25, 1);
  },
};

export function drawBuildingSprite(graphic, id, x, y, size, online) {
  if (!spriteTypes.has(id)) return false;
  graphic.save().translateCanvas(x, y).scaleCanvas(size / 36, size / 36);
  draw[id](graphic, palette(online !== false), online !== false);
  graphic.restore();
  return true;
}
