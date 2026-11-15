import { colonyBoardAtZoom } from './colony/layout.js';
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
  if (!rocks.length && !rocket) return;
  const { x: left, y: top, tile, row } = colonyBoardAtZoom(scene.boardZoom);
  const graphic = scene.add.graphics().setDepth(7);
  const scale = scene.boardZoom ?? 1;
  const position = ({ x, y }) => [left + (x + 0.5) * tile, top + (y + 0.5) * row];
  for (const rock of rocks) {
    if (!rock.remaining) continue;
    const [x, y] = position(rock);
    const metal = rock.material === 'metal';
    graphic.save().translateCanvas(x, y).scaleCanvas(scale, scale);
    graphic.fillStyle(0x3b2721, 0.7).fillEllipse(2, 6, 26, 12);
    graphic.fillStyle(metal ? 0x6b7277 : 0x9a6346).fillTriangle(-12, 6, -3, -9, 13, 6);
    graphic.lineStyle(2, metal ? 0xe2b591 : 0xd09f72).lineBetween(-11, 5, -3, -8);
    graphic.restore();
  }
  if (rocket && rocket.status !== 'scrapped') {
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
  scene.tileLayer.add(graphic);
}
