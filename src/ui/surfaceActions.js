import { boardTransform, visibleTiles } from './colony/layout.js';
import { button, colors, panel, text } from './controls.js';

export function surfaceFeatureAt(state, cell) {
  if (!cell) return null;
  const matchesCell = ({ x, y }) => x === cell.x && y === cell.y;
  if (state.rocket?.status !== 'scrapped' && state.rocket && matchesCell(state.rocket)) return state.rocket;
  return state.rocks.find((rock) => rock.remaining > 0 && matchesCell(rock)) ?? null;
}

export function drawSurfaceDetails(scene, feature) {
  const { rocket, res, sol } = scene.sim.state;
  const wreck = feature === rocket;
  const title = wreck ? 'Crashed rocket' : feature.material === 'metal' ? 'Metal deposit' : 'Regolith deposit';
  const add = (item) => scene.sideLayer.add(item);
  add(panel(scene, 675, 154, 550, 449, 0x3b231f).setInteractive());
  add(text(scene, 695, 169, title, 24, { fontStyle: 'bold' }));
  add(text(scene, 695, 221, `Build materials · ${Math.floor(res.credits).toLocaleString('en-US')} kg`, 16, { color: colors.muted }));

  if (wreck && rocket.status === 'burning') {
    const remaining = rocket.burnsUntilSol - sol;
    add(text(scene, 695, 278, `Fire clears in ${remaining} ${remaining === 1 ? 'sol' : 'sols'}.`, 18));
    return;
  }

  const { miningBatch, rocketSalvage } = scene.dataSet?.balance?.rescue?.surface ?? {};
  const salvageKg = Object.values(rocketSalvage ?? {}).reduce((sum, kg) => sum + kg, 0);
  const description = wreck
    ? `Recover ${salvageKg ? `${salvageKg} kg of ` : ''}usable metal from the wreck.`
    : `${feature.remaining} kg of ${feature.material} left in this deposit.`;
  add(text(scene, 695, 278, description, 18));
  if (!wreck) {
    const dig = Math.min(miningBatch ?? feature.remaining, feature.remaining);
    add(text(scene, 695, 304, `Each dig adds up to ${dig} kg to build materials.`, 15, { color: colors.muted }));
  }
  const { box, copy } = button(scene, 695, wreck ? 321 : 336, 220, 42, wreck ? 'Scrap rocket' : 'Mine deposit', () => {
    scene.run(wreck ? { type: 'scrapRocket' } : { type: 'mine', x: feature.x, y: feature.y });
  });
  scene.sideLayer.addMultiple([box, copy]);
}

export function drawSurfaceObjects(scene) {
  const { rocks, rocket } = scene.sim.state;
  const crate = scene.sim.state.comms?.crate;
  if (!rocks.length && !rocket && !crate) return;
  const transform = boardTransform(scene);
  const { x: left, y: top, tile, row } = transform;
  const view = visibleTiles(transform, scene.sim.state.grid);
  const visible = ({ x, y }) => x >= view.x0 && x <= view.x1 && y >= view.y0 && y <= view.y1;
  const graphic = scene.add.graphics().setDepth(7);
  if (scene.boardMask) graphic.setMask(scene.boardMask);
  const scale = transform.zoom;
  const position = ({ x, y }) => [left + (x + 0.5) * tile, top + (y + 0.5) * row];
  for (const rock of rocks) {
    if (!rock.remaining || !visible(rock)) continue;
    const [x, y] = position(rock);
    const metal = rock.material === 'metal';
    graphic.save().translateCanvas(x, y).scaleCanvas(scale, scale);
    // Irregular boulder, stable per tile; lit from the upper left like the ground.
    const points = [];
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI * 2 * i / 7;
      const wobble = 0.78 + 0.22 * Math.abs(Math.sin(rock.x * 12.9898 + rock.y * 78.233 + i * 3.7));
      points.push({ x: Math.cos(angle) * 14 * wobble, y: Math.sin(angle) * 9 * wobble - 2 });
    }
    graphic.fillStyle(0x2a1a15, 0.55).fillEllipse(3, 7, 32, 12);
    graphic.fillStyle(metal ? 0x5b6266 : 0x8a563d).fillPoints(points, true);
    graphic.fillStyle(metal ? 0x899297 : 0xb67a57).fillPoints(points.map(({ x: px, y: py }) => ({
      x: px * 0.72 - 3, y: py * 0.62 - 3 })), true);
    graphic.fillStyle(metal ? 0x3c4246 : 0x5e3626, 0.8).fillTriangle(points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y);
    if (metal) {
      graphic.fillStyle(0xe8d2b8, 0.95).fillCircle(-4, -6, 1.6).fillCircle(3, -3, 1.2).fillCircle(-8, -1, 1);
      graphic.lineStyle(1.5, 0xd7b48f, 0.9).lineBetween(-6, -7, 1, -4);
    }
    graphic.restore();
  }
  if (rocket && rocket.status !== 'scrapped' && visible(rocket)) {
    const [x, y] = position(rocket);
    graphic.save().translateCanvas(x, y).scaleCanvas(scale, scale);
    graphic.fillStyle(0x291d19, 0.75).fillEllipse(0, 8, 32, 10);
    graphic.fillStyle(0x73615b).fillRoundedRect(-16, -3, 28, 14, 3);
    graphic.fillStyle(0xc2a79a).fillTriangle(12, -3, 18, 4, 12, 11);
    graphic.lineStyle(2, 0x352521).lineBetween(-8, -2, -3, 10);
    if (rocket.status === 'burning') {
      graphic.fillStyle(0xe45f34).fillTriangle(-12, 2, -8, -15, 2, 2);
      graphic.fillStyle(0xffbf59).fillTriangle(-6, 2, -3, -9, 3, 2);
    }
    graphic.restore();
  }
  // AI-assisted (Claude Code): the supply crate itself is a three.js model sent by board.js through the model
  // layer; here only a drop-zone ring marks its tile so it stays easy to find and click at low zoom.
  if (crate && visible(crate)) {
    const [x, y] = position(crate);
    graphic.lineStyle(1.5, 0xffb05a, 0.55).strokeEllipse(x, y + row * 0.22, tile * 0.82, row * 0.5);
    graphic.lineStyle(1, 0xffb05a, 0.25).strokeEllipse(x, y + row * 0.22, tile * 0.98, row * 0.62);
  }
  scene.tileLayer.add(graphic);
}
