import { action, label, plate } from './widgets.js';

export function drawActionDock(scene, group) {
  const { sim } = scene;
  plate(scene, group, 20, 607, 1240, 53, 0x38221d);
  label(scene, group, 34, 625, `SOL ${sim.state.sol} · ${sim.state.season.toUpperCase()}`, 14, { fontStyle: 'bold' });
  if (scene.seedTool) {
    const crop = sim.cropTraits(scene.seedTool);
    label(scene, group, 252, 625, `PLANTING TOOL · ${crop?.name ?? scene.seedTool} · select a greenhouse plot`, 12,
      { color: '#f3c58a' });
  }
  [0, 1, 2, 4].forEach((speed, index) => action(scene, group, 900 + index * 61, 618, 55, 30,
    speed ? `${speed}×` : 'Pause', () => scene.run({ type: 'setSpeed', speed }, false), sim.state.speed === speed));
  action(scene, group, 1150, 618, 94, 30, '+1 sol', () => { scene.acc = 0; sim.step(); });
  return [];
}
