// AI-assisted (Claude Code: comms dish model, broken and repaired states)
// Built from primitives with vertex colours, in the same spirit as src/assets/crops/radish.js. Model units:
// base at y = 0, about one unit across; the render layer scales it to the board tile.
import * as THREE from 'three';
import {
  animateDustPuff, createDustPuff, groundShadow, moundGeometry, noise, paint, palette, part, rod, shared,
  standard, statusLamp, vertexMaterial,
} from './shared.js';

const RADIUS = 0.41;
const DEPTH = 0.16;
const FOCUS = (RADIUS * RADIUS) / (4 * DEPTH);
const PANELS = 6;
const PANEL_ARC = (Math.PI * 2) / PANELS;
const POP_MS = 520;
const RING_MS = 1500;

const SHELL = new THREE.Color(palette.shell);
const SHADE = new THREE.Color(palette.shade);
const SCORCH = new THREE.Color(palette.scorch);

/** One reflector panel: a slice of a paraboloid, lit a little differently from its neighbours. */
function panelGeometry(index, scorched) {
  return shared(`dish-panel-${index}-${scorched ? 's' : 'c'}`, () => {
    const profile = [];
    for (let i = 0; i <= 4; i++) {
      const r = (RADIUS * i) / 4;
      profile.push(new THREE.Vector2(Math.max(0.001, r), (r * r) / (4 * FOCUS)));
    }
    const geometry = new THREE.LatheGeometry(profile, 3, index * PANEL_ARC + 0.012, PANEL_ARC - 0.024);
    const tone = index % 2 === 0 ? 0.12 : 0.38;
    paint(geometry, (color, x, y, z) => {
      const r = Math.hypot(x, z) / RADIUS;
      color.copy(SHELL).lerp(SHADE, Math.min(1, tone + (1 - r) * 0.45));
      if (scorched) {
        const burn = noise(Math.round(x * 30), Math.round(z * 30), index) * (0.5 + r * 0.7);
        if (burn > 0.55) color.lerp(SCORCH, Math.min(0.85, (burn - 0.45) * 1.6));
      }
    });
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** Reflector whose opening faces +y; `missing` leaves one panel out. */
function reflector(scorched, missing = -1, rimColor = palette.trim) {
  const dish = new THREE.Group();
  const shellMaterial = vertexMaterial(0.7, THREE.DoubleSide);
  for (let i = 0; i < PANELS; i++) if (i !== missing) part(dish, panelGeometry(i, scorched), shellMaterial);
  const arc = missing < 0 ? Math.PI * 2 : Math.PI * 2 - PANEL_ARC;
  const rim = part(dish, shared(`dish-rim-${missing < 0}`, () => new THREE.TorusGeometry(RADIUS, 0.026, 3, 18, arc)),
    standard(rimColor, { roughness: 0.6 }), [0, DEPTH, 0], [Math.PI / 2, 0, 0]);
  // Lathe angle phi sits at (sin phi, cos phi) in xz; torus angle a lands at phi = pi/2 - a. Turn the gap onto `missing`.
  if (missing >= 0) rim.rotation.z = Math.PI / 2 - missing * PANEL_ARC;
  // Hub on the back of the bowl.
  part(dish, shared('dish-hub', () => new THREE.CylinderGeometry(0.075, 0.1, 0.1, 8)), standard(palette.shade),
    [0, -0.03, 0]);
  return dish;
}

function feedHorn(group, position) {
  return part(group, shared('dish-feed', () => new THREE.CylinderGeometry(0.035, 0.065, 0.11, 8)),
    standard(palette.trim, { roughness: 0.55 }), position);
}

function buildRepaired() {
  const group = new THREE.Group();
  group.name = 'repaired';
  const dark = standard(palette.dark);
  const shade = standard(palette.shade);
  // Base pad, tripod and mast.
  part(group, shared('dish-pad', () => new THREE.CylinderGeometry(0.3, 0.34, 0.07, 8)), dark, [0, 0.035, 0]);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    rod(group, [Math.sin(angle) * 0.26, 0.06, Math.cos(angle) * 0.26], [0, 0.34, 0], 0.018, shade);
  }
  part(group, shared('dish-mast', () => new THREE.CylinderGeometry(0.04, 0.055, 0.5, 8)), shade, [0, 0.3, 0]);
  // Electronics box with the status lamp on its front face.
  part(group, shared('dish-box', () => new THREE.BoxGeometry(0.17, 0.12, 0.11)), standard(palette.darker),
    [0.2, 0.13, 0.17]);
  part(group, shared('dish-box-trim', () => new THREE.BoxGeometry(0.175, 0.025, 0.115)), standard(palette.trim),
    [0.2, 0.2, 0.17]);
  const lamp = statusLamp(group, [0.2, 0.12, 0.23], 0.045);

  // Yaw (tracking sway) -> elevation -> reflector + feed.
  const yaw = new THREE.Group();
  yaw.position.set(0, 0.5, 0);
  group.add(yaw);
  part(yaw, shared('dish-yoke', () => new THREE.BoxGeometry(0.14, 0.08, 0.1)), dark, [0, -0.02, 0]);
  const tilt = new THREE.Group();
  tilt.rotation.set(0.1, 0, 0.5);
  yaw.add(tilt);
  const dish = reflector(false);
  dish.position.y = 0.04;
  tilt.add(dish);
  const strut = standard(palette.shade, { roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.5;
    rod(dish, [Math.cos(angle) * RADIUS * 0.94, DEPTH, Math.sin(angle) * RADIUS * 0.94], [0, FOCUS - 0.04, 0], 0.012, strut, 4);
  }
  feedHorn(dish, [0, FOCUS, 0]).rotation.x = Math.PI;
  // Transmission rings at the feed (order in flight). Each ring has its own material so they fade independently.
  const ringGeometry = shared('dish-ring', () => new THREE.TorusGeometry(0.09, 0.012, 3, 12));
  const rings = [0, 1].map(() => {
    const ring = part(dish, ringGeometry, new THREE.MeshBasicMaterial({ color: palette.amber, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), [0, FOCUS + 0.04, 0], [Math.PI / 2, 0, 0]);
    ring.visible = false;
    return ring;
  });
  groundShadow(group, 0.42, 0.3);
  Object.assign(group.userData, { yaw, tilt, lamp, rings });
  return group;
}

function buildBroken() {
  const group = new THREE.Group();
  group.name = 'broken';
  const dark = standard(palette.dark);
  const shade = standard(palette.shade);
  groundShadow(group, 0.5, 0.34, 0.26);
  // Scorched ground under the wreck.
  const scorch = shared('dish-scorch-mat', () => new THREE.MeshBasicMaterial({ color: palette.scorch, transparent: true,
    opacity: 0.55, depthWrite: false }));
  const blot = shared('dish-scorch', () => new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2));
  part(group, blot, scorch, [0.05, 0.006, 0.02], [0, 0.4, 0], [0.4, 1, 0.24]).renderOrder = -1;
  part(group, blot, scorch, [-0.3, 0.006, 0.12], [0, 1.1, 0], [0.16, 1, 0.1]).renderOrder = -1;

  // Snapped mast stump leaning out of the pad.
  part(group, shared('dish-pad-broken', () => new THREE.CylinderGeometry(0.22, 0.26, 0.06, 7)), dark, [0.22, 0.03, -0.1],
    [0.12, 0, -0.1]);
  const stump = part(group, shared('dish-stump', () => new THREE.CylinderGeometry(0.04, 0.055, 0.2, 7)), shade,
    [0.24, 0.14, -0.1], [0, 0, -0.28]);
  part(stump, shared('dish-stump-break', () => new THREE.ConeGeometry(0.042, 0.07, 5)), shade, [0, 0.12, 0], [0, 0, 0.5]);

  // Regolith drifted over the dish's lower edge.
  part(group, moundGeometry('dish', 3, 0.46, 0.12, 0.26), vertexMaterial(0.95), [-0.08, 0, 0.1]);

  // Reflector on its side, half buried, panel 4 torn out (the gap faces the viewer).
  const dish = reflector(true, 4, 0x4f857c);
  dish.position.set(-0.1, 0.16, -0.06);
  dish.rotation.set(0.45, 0.2, 0.8);
  dish.scale.setScalar(0.92);
  group.add(dish);
  // The torn panel lies in the dust beside it, upside down.
  part(group, panelGeometry(4, true), vertexMaterial(0.7, THREE.DoubleSide), [0.36, 0.05, 0.16], [Math.PI - 0.15, 0.6, 0.12],
    [0.8, 0.8, 0.8]);

  // Snapped feed arm: one strut still bolted to the rim, kinked, with the horn hanging into the dirt.
  const strut = standard(palette.shade, { roughness: 0.6 });
  rod(dish, [RADIUS * 0.94, DEPTH, 0], [0.1, FOCUS * 0.85, 0.02], 0.014, strut, 4);
  rod(dish, [0.1, FOCUS * 0.85, 0.02], [0.24, FOCUS * 0.95, 0.28], 0.014, strut, 4);
  rod(dish, [-RADIUS * 0.5, DEPTH * 0.3, RADIUS * 0.8], [-0.18, 0.2, 0.42], 0.012, strut, 4);
  feedHorn(group, [0.12, 0.05, 0.3]).rotation.set(1.3, 0, 0.6);

  // Loose cable from the stump snaking over the ground.
  const cable = shared('dish-cable', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.22, 0.2, -0.08), new THREE.Vector3(0.32, 0.12, 0.02), new THREE.Vector3(0.28, 0.02, 0.16),
    new THREE.Vector3(0.1, 0.02, 0.24), new THREE.Vector3(-0.04, 0.03, 0.34), new THREE.Vector3(-0.2, 0.01, 0.3),
  ]), 14, 0.014, 3));
  part(group, cable, standard(0x2b2420, { roughness: 0.6 }));
  part(group, shared('dish-cable-end', () => new THREE.BoxGeometry(0.04, 0.03, 0.05)), standard(palette.strap),
    [-0.21, 0.015, 0.3], [0, 0.4, 0]);
  // Dead lamp on the stump: dark, no glow.
  part(group, shared('lamp-core', () => new THREE.SphereGeometry(1, 6, 4)), standard(palette.dead), [0.3, 0.09, -0.02],
    [0, 0, 0], [0.035, 0.035, 0.035]);
  return group;
}

/** Comms dish: a THREE.Group with child groups `broken` and `repaired`. Drive it with setCommsDishState. */
export function createCommsDish() {
  const group = new THREE.Group();
  group.name = 'commsDish';
  const broken = buildBroken();
  const repaired = buildRepaired();
  group.add(broken, repaired);
  const puff = createDustPuff(group, 6, 0.5);
  Object.assign(group.userData, { broken, repaired, puff, lastRepaired: undefined, popAt: -Infinity });
  setCommsDishState(group, { repaired: false, online: false, ordering: false, time: 0 });
  group.userData.lastRepaired = undefined;
  return group;
}

const LAMP = { green: new THREE.Color(palette.green), amber: new THREE.Color(palette.amber),
  red: new THREE.Color(palette.red), dead: new THREE.Color(palette.dead) };

/**
 * Show the dish for the given state. `time` is in ms (any monotonic clock). Safe to call every frame: no
 * allocations. Returns true while a transient animation (the repair pop) is playing.
 */
export function setCommsDishState(group, state = {}, time = state.time ?? 0) {
  const data = group.userData;
  const repaired = Boolean(state.repaired);
  const online = state.online !== false;
  const ordering = Boolean(state.ordering) && repaired && online;
  // Broken -> repaired swap pops, but only for a change seen live (not on first display).
  if (data.lastRepaired === false && repaired) data.popAt = time;
  data.lastRepaired = repaired;
  data.broken.visible = !repaired;
  data.repaired.visible = repaired;

  const pop = (time - data.popAt) / POP_MS;
  const popping = pop >= 0 && pop < 1;
  const scale = popping ? 1 + Math.sin(pop * Math.PI) * 0.22 * (1 - pop) - (pop < 0.15 ? (0.15 - pop) * 2 : 0) : 1;
  data.repaired.scale.set(scale, popping ? 2 - scale : 1, scale);
  animateDustPuff(data.puff, popping ? pop * 0.9 + 0.05 : 0);
  if (!repaired) return popping;

  const { yaw, lamp, rings } = data.repaired.userData;
  const active = online;
  yaw.rotation.y = 0.55 + (active ? Math.sin(time / 2600) * 0.32 : 0);
  if (!online) {
    lamp.core.material.color.copy(LAMP.red);
    lamp.halo.material.color.copy(LAMP.red);
    lamp.halo.material.opacity = 0.35;
  } else if (ordering) {
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    lamp.core.material.color.copy(LAMP.dead).lerp(LAMP.amber, 0.45 + pulse * 0.55);
    lamp.halo.material.color.copy(LAMP.amber);
    lamp.halo.material.opacity = 0.2 + pulse * 0.6;
  } else {
    lamp.core.material.color.copy(LAMP.green);
    lamp.halo.material.color.copy(LAMP.green);
    lamp.halo.material.opacity = 0.4;
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    ring.visible = ordering;
    if (!ordering) continue;
    const t = ((time / RING_MS) + i / rings.length) % 1;
    const size = 0.8 + t * 1.9;
    ring.scale.set(size, size, size);
    ring.position.y = FOCUS + 0.03 + t * 0.12;
    ring.material.opacity = 0.75 * Math.sin(t * Math.PI) * (1 - t * 0.5);
  }
  return popping;
}
