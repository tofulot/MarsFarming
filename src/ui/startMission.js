// AI-assisted (Claude): every "land" button goes through here so the intro cutscene plays first.
// Add ?intro=0 to the URL to skip straight to the colony (handy while testing).
export function introEnabled() {
  return new URLSearchParams(location.search).get('intro') !== '0';
}

export function startMission(scene, options) {
  scene.scene.start(introEnabled() ? 'Cutscene' : 'Colony', options);
}
