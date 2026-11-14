import { colonyLayout } from './colony/layout.js';
import { button, colors, panel, text } from './controls.js';

export function surfaceFeatureAt(state, cell) {
  if (!cell) return null;
  const matchesCell = ({ x, y }) => x === cell.x && y === cell.y;
  if (state.rocket?.status !== 'scrapped' && state.rocket && matchesCell(state.rocket)) return state.rocket;
  return state.rocks.find((rock) => rock.remaining > 0 && matchesCell(rock)) ?? null;
}

export function formatMaterials(materials) {
  return Object.entries(materials ?? {}).map(([material, amount]) => `${amount} ${material}`).join(' + ');
}

export function drawSurfaceDetails(scene, feature) {
  const { rocket, res, sol } = scene.sim.state;
  const wreck = feature === rocket;
  const title = wreck ? 'Crashed rocket' : feature.material === 'metal' ? 'Metal deposit' : 'Regolith deposit';
  const add = (item) => scene.sideLayer.add(item);
  add(panel(scene, 675, 154, 550, 449, 0x3b231f).setInteractive());
  add(text(scene, 695, 169, title, 24, { fontStyle: 'bold' }));
  add(text(scene, 695, 221, `In storage · ${formatMaterials(res.materials)}`, 16, { color: colors.muted }));

  if (wreck && rocket.status === 'burning') {
    const remaining = rocket.burnsUntilSol - sol;
    add(text(scene, 695, 278, `Fire clears in ${remaining} ${remaining === 1 ? 'sol' : 'sols'}.`, 18));
    return;
  }

  const description = wreck ? 'Recover the wreck’s usable materials.' : `${feature.remaining} ${feature.material} left in this deposit.`;
  add(text(scene, 695, 278, description, 18));
  const { box, copy } = button(scene, 695, 321, 220, 42, wreck ? 'Scrap rocket' : 'Mine deposit', () => {
    scene.run(wreck ? { type: 'scrapRocket' } : { type: 'mine', x: feature.x, y: feature.y });
  });
  scene.sideLayer.addMultiple([box, copy]);
}

export function drawSurfaceObjects(scene) {
  const { rocks, rocket } = scene.sim.state;
  if (!rocks.length && !rocket) return;
  const { x: left, y: top, tile, row } = colonyLayout.board;
  const graphic = scene.add.graphics().setDepth(7);
  const position = ({ x, y }) => [left + (x + 0.5) * tile, top + (y + 0.5) * row];
  for (const rock of rocks) {
    if (!rock.remaining) continue;
    const [x, y] = position(rock);
    const metal = rock.material === 'metal';
    graphic.fillStyle(0x3b2721, 0.7).fillEllipse(x + 2, y + 6, 26, 12);
    graphic.fillStyle(metal ? 0x6b7277 : 0x9a6346).fillTriangle(x - 12, y + 6, x - 3, y - 9, x + 13, y + 6);
    graphic.lineStyle(2, metal ? 0xe2b591 : 0xd09f72).lineBetween(x - 11, y + 5, x - 3, y - 8);
  }
  if (rocket && rocket.status !== 'scrapped') {
    const [x, y] = position(rocket);
    graphic.fillStyle(0x291d19, 0.75).fillEllipse(x, y + 8, 32, 10);
    graphic.fillStyle(0x73615b).fillRoundedRect(x - 16, y - 3, 28, 14, 3);
    graphic.fillStyle(0xc2a79a).fillTriangle(x + 12, y - 3, x + 18, y + 4, x + 12, y + 11);
    graphic.lineStyle(2, 0x352521).lineBetween(x - 8, y - 2, x - 3, y + 10);
    if (rocket.status === 'burning') {
      graphic.fillStyle(0xe45f34).fillTriangle(x - 12, y + 2, x - 8, y - 15, x + 2, y + 2);
      graphic.fillStyle(0xffbf59).fillTriangle(x - 6, y + 2, x - 3, y - 9, x + 3, y + 2);
    }
  }
  scene.tileLayer.add(graphic);
}
