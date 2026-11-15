// AI-assisted (Claude): routes into and out of the cutscenes.
// ?intro=0 skips the landing cutscene and ?outro=0 the rescue cutscene (handy while testing).
const param = (name) => new URLSearchParams(location.search).get(name);
export const introEnabled = () => param('intro') !== '0';
export const outroEnabled = () => param('outro') !== '0';

/** Every "land" button goes through here so the intro plays first. */
export function startMission(scene, options) {
  if (!introEnabled()) {
    scene.scene.start('Colony', options);
    return;
  }
  scene.scene.start('Cutscene', { clip: 'intro', next: 'Colony', nextData: { ...options, fromCutscene: true } });
}

/** Mission over: a successful rescue plays the liftoff before the report. */
export function finishMission(scene, report) {
  const { state } = report;
  if (state.rescue?.outcome !== 'rescued' || !outroEnabled()) {
    scene.scene.start('Report', report);
    return;
  }
  const name = state.rescue.colonyName || state.site?.name || 'Your colony';
  scene.scene.start('Cutscene', {
    clip: 'outro',
    next: 'Report',
    nextData: { ...report, fromCutscene: true },
    card: { title: 'Rescued', subtitle: `${name} · Sol ${state.sol}`, at: 5.3, hideAt: 7.5 },
  });
}
