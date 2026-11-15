// AI-assisted (Claude): full-screen black veil shared by the intro cutscene and the colony fade-in.
// It sits above the DOM HUD so the HUD fades in with the game instead of popping over a black canvas.
const VEIL_ID = 'red-harvest-veil';

function canvasBox(canvas) {
  const parent = canvas.parentElement;
  const box = canvas.getBoundingClientRect();
  const parentBox = parent.getBoundingClientRect();
  return { left: box.left - parentBox.left, top: box.top - parentBox.top, width: box.width, height: box.height };
}

/** Fit a DOM element exactly over the game canvas. Returns a function that re-fits it. */
export function fitOverCanvas(canvas, node) {
  const fit = () => {
    const { left, top, width, height } = canvasBox(canvas);
    Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  };
  fit();
  return fit;
}

export function showVeil(canvas, { fadeMs = 0 } = {}) {
  const host = canvas.parentElement;
  host.style.position ||= 'relative';
  let veil = document.getElementById(VEIL_ID);
  if (!veil) {
    veil = document.createElement('div');
    veil.id = VEIL_ID;
    veil.setAttribute('aria-hidden', 'true');
    Object.assign(veil.style, { position: 'absolute', zIndex: '60', background: '#000', pointerEvents: 'none', opacity: '0' });
    host.append(veil);
  }
  fitOverCanvas(canvas, veil);
  veil.style.transition = fadeMs ? `opacity ${fadeMs}ms linear` : 'none';
  void veil.offsetWidth; // apply the start opacity before transitioning
  veil.style.opacity = '1';
  return veil;
}

/** Fade the veil out (if present) and remove it. Returns the delay until it is gone, in ms. */
export function liftVeil({ delayMs = 150, fadeMs = 700 } = {}) {
  const veil = document.getElementById(VEIL_ID);
  if (!veil) return 0;
  const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const fade = reduced ? 0 : fadeMs;
  setTimeout(() => {
    veil.style.transition = fade ? `opacity ${fade}ms ease-out` : 'none';
    veil.style.opacity = '0';
    setTimeout(() => veil.remove(), fade + 50);
  }, delayMs);
  return delayMs + fade;
}
