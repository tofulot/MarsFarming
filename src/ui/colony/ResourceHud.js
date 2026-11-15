// AI-assisted (OpenAI Codex; Claude Code for tabs, achievement card hooks, the naming gate and the one-strip top bar)
import { selectColonyUiState } from './selectors.js';
import { shopCategories } from './catalog.js';
import { surfaceFeatureAt } from '../surfaceActions.js';
import { boardZoomRange, colonyLayout, stepBoardZoom } from './layout.js';
import { achievementCardCss } from '../achievementToasts.js';
import { cropSolsRemaining } from '../../sim/systems/crops.js';
import { fontBody, fontDisplay, theme } from '../theme.js';

const LOW_AMBER = theme.amber;
const PANEL_BG = theme.panel;
const RAISED = theme.raised;
const SUNKEN = theme.sunken;
const ACCENT = theme.accent;
const MUTED = theme.muted;

function setText(node, value) {
  if (node.textContent !== String(value)) node.textContent = String(value);
}

function style(node, values) { Object.assign(node.style, values); return node; }

function makeButton(label, onClick, { className = '', title = '', disabled = false } = {}) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.className = className;
  node.title = title;
  node.disabled = disabled;
  node.addEventListener('click', (event) => { event.stopPropagation(); onClick?.(); });
  return node;
}

function createRadishSeedIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Radish with leafy green tops');
  svg.innerHTML = `
    <defs>
      <linearGradient id="radish-skin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fa7181"/><stop offset=".58" stop-color="#d73553"/><stop offset="1" stop-color="#9f1f3b"/>
      </linearGradient>
      <linearGradient id="radish-tip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff5dc"/><stop offset="1" stop-color="#dfcaa9"/>
      </linearGradient>
    </defs>
    <ellipse cx="33" cy="56" rx="13" ry="3" fill="#100b0a" opacity=".38"/>
    <path d="M29 27C19 21 17 12 20 7c7 2 12 9 13 19C32 14 39 6 46 7c2 9-3 17-12 22 8-6 16-5 21-1-4 8-12 10-23 6Z" fill="#4f7835"/>
    <path d="M32 40c-6-8-14-10-20-7 1 8 8 13 18 12M34 38c5-9 13-12 20-9-1 8-8 13-18 14" fill="none" stroke="#82a84d" stroke-width="3" stroke-linecap="round"/>
    <path d="M19 29c1-8 8-13 16-12 9 0 14 6 13 14-1 8-8 14-16 21-8-7-14-14-13-23Z" fill="url(#radish-skin)"/>
    <path d="M19 34c7 4 21 5 29-1-2 8-9 14-16 20-7-6-12-11-13-19Z" fill="url(#radish-tip)"/>
    <path d="M25 24c3-4 8-5 12-4" fill="none" stroke="#ffb2ad" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
    <path d="M31 51c0 3 1 5 1 6" fill="none" stroke="#d7c19c" stroke-width="2" stroke-linecap="round"/>`;
  return svg;
}

// Tab glyphs drawn as inline SVG so they render the same without emoji fonts.
const TAB_ICONS = {
  base: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 19h18"/><path d="M5 19v-5a7 7 0 0 1 14 0v5"/><path d="M10 19v-4h4v4"/><path d="M12 7V4"/></svg>',
  ops: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  goals: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.7l-5.8 3.4 1.5-6.4-4.9-4.3 6.5-.6z"/></svg>',
};

// Resource chip glyphs (24×24, stroke = currentColor so the urgent state recolours them).
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CHIP_ICONS = {
  // Strapped cargo crate: build materials salvaged from the lander.
  materials: `${SVG_OPEN}<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"/><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"/><path d="m7.8 6.2 8.5 4.6v3.4"/></svg>`,
  power: `${SVG_OPEN}<path d="M13.5 2.5 5.5 13.5h5.8l-1 8 8.2-11.2h-5.8z"/></svg>`,
  // The battery's inner bar is resized to the charge in refresh().
  battery: `${SVG_OPEN}<rect x="2.5" y="7" width="17" height="10" rx="2.2"/><path d="M22 10.5v3"/><rect data-charge x="5" y="9.5" width="0" height="5" rx=".8" fill="currentColor" stroke="none"/></svg>`,
  water: `${SVG_OPEN}<path d="M12 3c3.6 4.6 6 7.9 6 11a6 6 0 0 1-12 0c0-3.1 2.4-6.4 6-11z"/><path d="M9.2 14.6a3 3 0 0 0 2.4 2.8"/></svg>`,
  // Radish: the colony's first crop stands for rations.
  food: `${SVG_OPEN}<path d="M12 9.5c-3.6 0-5.8 2.4-5.4 5.4.4 2.6 2.8 4.4 5.4 6.6 2.6-2.2 5-4 5.4-6.6.4-3-1.8-5.4-5.4-5.4z"/><path d="M12 9.5V5.5M12 7.2C10.8 4.6 8.6 3.4 6.4 3.6c.2 2.4 2 4 4.4 4.4M12 7.2c1.2-2.6 3.4-3.8 5.6-3.6-.2 2.4-2 4-4.4 4.4"/></svg>`,
};
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="3.6" height="11" rx="1" fill="currentColor"/><rect x="9.4" y="2.5" width="3.6" height="11" rx="1" fill="currentColor"/></svg>';
const DIAL_R = 17;
const DIAL_C = 2 * Math.PI * DIAL_R;

function formatPower(watts) { return `${(watts / 1000).toFixed(1)} kW`; }

/** "+12 / sol", "−4 / sol"; '' when the trend is missing. */
function formatRate(value) {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '+'}${Math.abs(rounded).toLocaleString('en-US')} / sol`;
}

export function createResourceHud(scene, sim, foodPerCrew) {
  const game = () => scene.scene.get('Colony');
  const data = () => game().dataSet;
  const host = scene.game.canvas.parentElement;
  host.style.position ||= 'relative';
  let root = host.querySelector('[data-colony-hud]');
  if (!root) {
    root = document.createElement('div');
    root.dataset.colonyHud = '';
    host.append(root);
  }
  let styleTag = document.querySelector('#colony-hud-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'colony-hud-style';
    styleTag.textContent = `
      .colony-hud-root { position:absolute; inset:0; pointer-events:none; z-index:30; color:${theme.ink}; font-family:${fontBody}; font-size:17px; line-height:1.25; }
      .colony-hud-root button { font:inherit; }
      .colony-hud-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
      .colony-hud-panel,.colony-hud-bar,.colony-hud-zoom,.colony-hud-toast { box-sizing:border-box; background:${PANEL_BG}; border:1px solid ${theme.border}; border-radius:10px; box-shadow:0 4px 18px #140b0b55; }
      .colony-hud-bar { position:absolute; display:flex; align-items:center; gap:8px; padding:0 8px; background:${PANEL_BG}f2; pointer-events:auto; }
      .colony-hud-bar button,.colony-hud-zoom button,.colony-hud-panel button { color:${theme.ink}; background:${RAISED}; border:1px solid ${theme.border}; border-radius:6px; cursor:pointer; }
      .colony-hud-bar button:hover,.colony-hud-zoom button:hover,.colony-hud-panel button:hover { border-color:${ACCENT}; }
      .colony-hud-bar button:focus-visible,.colony-hud-zoom button:focus-visible,.colony-hud-panel button:focus-visible { outline:2px solid #ffe9b8; outline-offset:1px; }
      .colony-hud-bar button[aria-pressed=true],.colony-hud-panel button[aria-pressed=true] { color:${SUNKEN}; background:${ACCENT}; border-color:${ACCENT}; }
      .colony-hud-bar button:disabled,.colony-hud-zoom button:disabled,.colony-hud-panel button:disabled { opacity:.45; cursor:not-allowed; }
      .colony-hud-clock { flex:0 0 auto; display:flex; align-items:center; gap:8px; height:100%; padding-right:10px; border-right:1px solid ${theme.divider}; min-width:0; }
      .colony-hud-dial { position:relative; flex:0 0 42px; width:42px; height:42px; }
      .colony-hud-dial svg { display:block; }
      .colony-hud-dial-sol { position:absolute; inset:0; display:grid; place-items:center; font-size:17px; line-height:1; color:#fff; }
      .colony-hud-clock-copy { display:flex; flex-direction:column; align-items:flex-start; min-width:0; }
      .colony-hud-bar .colony-hud-name { max-width:160px; padding:0 2px; margin:-1px 0 0 -2px; background:none; border:1px solid transparent; font:700 23px/1.05 ${fontDisplay}; letter-spacing:${theme.displayTracking}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left; }
      .colony-hud-bar .colony-hud-name.is-locked { color:${MUTED}; }
      .colony-hud-bar .colony-hud-name.is-locked:hover { border-color:transparent; border-bottom:1px dashed ${theme.border}; }
      .colony-hud-rescue { font-size:15px; line-height:1.1; color:${MUTED}; white-space:nowrap; }
      .colony-hud-rescue b { font-weight:400; color:#fff; display:inline-block; min-width:1.4em; text-align:right; }
      .colony-hud-chips { flex:1 1 auto; display:flex; gap:5px; min-width:0; }
      .colony-hud-chip { flex:1 1 0; display:flex; align-items:center; gap:6px; min-width:0; height:44px; box-sizing:border-box; padding:2px 8px 2px 7px; background:${SUNKEN}; border:1px solid ${theme.divider}; border-radius:8px; }
      .colony-hud-chip[data-chip=power],.colony-hud-chip[data-chip=food] { flex-grow:1.3; }
      .colony-hud-chip-icon { flex:0 0 20px; display:grid; place-items:center; color:${ACCENT}; }
      .colony-hud-chip-copy { min-width:0; line-height:1; white-space:nowrap; }
      .colony-hud-chip-value { display:flex; align-items:baseline; gap:3px; }
      .colony-hud-num { display:inline-block; text-align:right; font-size:21px; color:#fff; }
      .colony-hud-num.is-small { font-size:15px; color:${MUTED}; }
      .colony-hud-unit { font-size:15px; color:${MUTED}; }
      .colony-hud-trend { display:block; min-height:15px; margin-top:2px; font-size:15px; color:#a99389; overflow:hidden; text-overflow:ellipsis; }
      .colony-hud-chip.is-good .colony-hud-trend { color:${theme.mint}; }
      .colony-hud-chip.is-urgent { border-color:${LOW_AMBER}; box-shadow:inset 0 0 0 1px ${LOW_AMBER}55; }
      .colony-hud-chip.is-urgent .colony-hud-chip-icon,.colony-hud-chip.is-urgent .colony-hud-trend,.colony-hud-chip.is-urgent .colony-hud-num { color:${LOW_AMBER}; }
      .colony-hud-speed { flex:0 0 auto; display:flex; gap:3px; }
      .colony-hud-speed button { height:32px; min-width:30px; padding:0 6px; font-size:16px; display:inline-grid; place-items:center; }
      .colony-hud-speed .colony-hud-step { padding:0 7px; }
      .colony-hud-tabs { flex:0 0 auto; display:flex; gap:5px; height:100%; align-items:center; padding-left:8px; border-left:1px solid ${theme.divider}; }
      .colony-hud-bar .colony-hud-tab { height:40px; min-width:76px; display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:0 11px 0 9px; font:700 24px/1 ${fontDisplay}; letter-spacing:${theme.displayTracking}; border-radius:8px; }
      .colony-hud-tab-icon { display:inline-grid; place-items:center; width:18px; height:18px; color:${ACCENT}; }
      .colony-hud-tab-icon svg { width:18px; height:18px; }
      .colony-hud-bar .colony-hud-tab[aria-pressed=true] { box-shadow:inset 0 -3px 0 #1b111055, 0 0 12px #f0886a66; }
      .colony-hud-bar .colony-hud-tab[aria-pressed=true] .colony-hud-tab-icon { color:${SUNKEN}; }
      .colony-hud-zoom { position:absolute; display:flex; align-items:center; gap:4px; padding:3px 4px; background:${PANEL_BG}e6; pointer-events:auto; }
      .colony-hud-zoom button { width:28px; height:26px; padding:0; font-size:19px; line-height:1; display:grid; place-items:center; }
      .colony-hud-zoom-value { display:inline-block; min-width:3em; text-align:center; font-size:15px; color:${MUTED}; }
      .colony-hud-panel { position:absolute; display:flex; flex-direction:column; pointer-events:auto; overflow:hidden; }
      .colony-hud-panel[hidden] { display:none; }
      .colony-hud-panel-head { padding:14px 16px 8px; border-bottom:1px solid #4a3330; }
      .colony-hud-panel-title { margin:0; font:700 34px/1 ${fontDisplay}; letter-spacing:${theme.displayTracking}; }
      .colony-hud-subtitle { margin:5px 0 0; color:${MUTED}; }
      .colony-hud-panel-close { position:absolute; top:10px; right:12px; padding:3px 10px; font-size:16px!important; }
      .colony-hud-panel-content { min-height:0; overflow:auto; padding:10px 14px; flex:1 1 auto; }
      .colony-hud-categories { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px; margin:0 0 10px; }
      .colony-hud-categories button { min-height:32px; padding:4px 2px; }
      .colony-hud-item-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
      .colony-hud-item { min-height:70px; padding:7px; display:grid; grid-template-columns:56px minmax(0,1fr); gap:9px; text-align:left; align-items:center; background:${RAISED}!important; }
      .colony-hud-item.is-locked { background:${SUNKEN}!important; color:#9b857c!important; }
      .colony-hud-icon { width:56px; height:56px; box-sizing:border-box; display:grid; place-items:center; border:1px dashed #806158; border-radius:8px; font-size:30px; line-height:1; background:#1b111066; }
      .colony-hud-icon svg { width:50px; height:50px; overflow:visible; }
      .colony-hud-item-copy { min-width:0; }
      .colony-hud-item-name,.colony-hud-item-meta { display:block; overflow-wrap:anywhere; }
      .colony-hud-item-name { font-size:18px; line-height:1.1; color:#fff; }
      .colony-hud-item-meta { margin-top:3px; color:${MUTED}; font-size:15px; line-height:1.15; }
      .colony-hud-footer { display:flex; justify-content:space-between; gap:8px; padding:10px 14px; border-top:1px solid #4a3330; color:${MUTED}; }
      .colony-hud-section { margin:0 0 14px; padding:10px; border:1px solid #4a3330; border-radius:8px; background:${SUNKEN}; }
      .colony-hud-section-title { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin:0 0 8px; font:700 23px/1 ${fontDisplay}; letter-spacing:${theme.displayTracking}; color:${ACCENT}; }
      .colony-hud-section-title > span + span { font:400 16px/1 ${fontBody}!important; letter-spacing:0!important; color:${MUTED}; }
      .colony-hud-segment { display:flex; gap:5px; }
      .colony-hud-segment button { flex:1; min-height:34px; }
      .colony-hud-load { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:8px; align-items:center; padding:8px 0; border-top:1px solid #4a3330; }
      .colony-hud-switch { min-width:54px; min-height:30px; }
      .colony-hud-help { color:${MUTED}; margin:7px 0 0; }
      .colony-hud-danger { border-color:#8c4038!important; color:#ff9a8a!important; background:#351c1a!important; }
      .colony-hud-goal { margin:0 0 8px; padding:10px; border:1px solid #4a3330; border-radius:8px; background:${RAISED}; }
      .colony-hud-goal.is-done { border-color:#7faa83; }
      .colony-hud-goal-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
      .colony-hud-goal-head > span:first-child { font:700 23px/1 ${fontDisplay}; letter-spacing:${theme.displayTracking}; color:#fff; }
      .colony-hud-goal-head > span:last-child { font-size:16px; color:${MUTED}; white-space:nowrap; }
      .colony-hud-progress { height:7px; margin:8px 0 5px; overflow:hidden; background:#120d0c; border-radius:9px; }
      .colony-hud-progress > span { display:block; height:100%; background:${ACCENT}; transform-origin:left; }
      .colony-hud-toast { position:absolute; pointer-events:none; max-width:600px; padding:10px 40px 10px 14px; color:#f5e9e2; background:#231615ed; }
      .colony-hud-toast[hidden] { display:none; }
      .colony-hud-toast-close { position:absolute; right:7px; top:6px; width:28px; height:28px; pointer-events:auto; }
      .colony-hud-tabs button.is-pulsing { animation:colony-tab-pulse .8s ease-in-out 3; }
      @keyframes colony-tab-pulse { 0%,100% { box-shadow:0 0 0 0 #f0b45a00; border-color:#6e4b42; }
        50% { box-shadow:0 0 0 4px #f0b45a88, 0 0 18px #f0b45acc; border-color:#ffd27a; color:#ffd27a; } }
      ${achievementCardCss}
      .colony-hud-root .colony-award-name { font-family:${fontDisplay}; font-size:34px; font-weight:700; letter-spacing:${theme.displayTracking}; }
      .colony-hud-root .colony-award-kicker,.colony-hud-root .colony-award-sol { font-size:15px; font-weight:400; }
      .colony-hud-root .colony-award-unlock { font-size:15px; font-weight:400; }
    `;
    document.head.append(styleTag);
  }
  root.className = 'colony-hud-root';
  root.replaceChildren();

  // One strip: sol dial + colony | resource chips | speed | panel tabs (docs/DESIGN_HUD_COMMS.md WP-T).
  const bar = document.createElement('header');
  bar.className = 'colony-hud-bar';
  bar.setAttribute('aria-label', 'Colony status and controls');

  const clock = document.createElement('div');
  clock.className = 'colony-hud-clock';
  const dial = document.createElement('div');
  dial.className = 'colony-hud-dial';
  dial.setAttribute('role', 'img');
  dial.innerHTML = `<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
    <circle cx="21" cy="21" r="${DIAL_R}" fill="${SUNKEN}" stroke="${theme.divider}" stroke-width="4.5"/>
    <circle data-progress cx="21" cy="21" r="${DIAL_R}" fill="none" stroke="${ACCENT}" stroke-width="4.5" stroke-linecap="round"
      stroke-dasharray="0 ${DIAL_C.toFixed(2)}" transform="rotate(-90 21 21)"/></svg>`;
  const dialArc = dial.querySelector('[data-progress]');
  const dialSol = document.createElement('span');
  dialSol.className = 'colony-hud-dial-sol';
  dialSol.setAttribute('aria-hidden', 'true');
  dial.append(dialSol);
  const clockCopy = document.createElement('div');
  clockCopy.className = 'colony-hud-clock-copy';
  const namingUnlocked = () => Boolean(sim.state.rescue && Object.hasOwn(sim.state.rescue.earned, 'halfway'));
  const halfwaySol = () => Math.ceil((sim.state.rescue?.arrivalSol ?? 0) / 2);
  const nameNode = makeButton('', () => {
    const current = game();
    if (!current.sim.state.rescue) return;
    if (namingUnlocked()) current.openNameDialog();
    else current.notify(`Colony naming unlocks at Halfway Home (sol ${halfwaySol()}).`);
  }, { className: 'colony-hud-name' });
  nameNode.setAttribute('aria-label', 'Colony name. Rename when unlocked.');
  const rescueLine = document.createElement('div');
  rescueLine.className = 'colony-hud-rescue';
  clockCopy.append(nameNode, rescueLine);
  clock.append(dial, clockCopy);

  const chips = document.createElement('div');
  chips.className = 'colony-hud-chips';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', 'Colony resources');
  const chipNodes = new Map();
  for (const [id, name, numberWidth] of [['materials', 'Materials', '1.9em'], ['power', 'Power', '1.35em'],
    ['battery', 'Battery', '1.35em'], ['water', 'Water', '1.9em'], ['food', 'Food', '1.3em']]) {
    const chip = document.createElement('div');
    chip.className = 'colony-hud-chip';
    chip.dataset.chip = id;
    const icon = document.createElement('span');
    icon.className = 'colony-hud-chip-icon';
    icon.innerHTML = CHIP_ICONS[id];
    const copy = document.createElement('span');
    copy.className = 'colony-hud-chip-copy';
    const srName = document.createElement('span');
    srName.className = 'colony-hud-sr';
    srName.textContent = `${name}: `;
    const value = document.createElement('span');
    value.className = 'colony-hud-chip-value';
    const number = document.createElement('span');
    number.className = 'colony-hud-num';
    number.style.minWidth = numberWidth;
    const unit = document.createElement('span');
    unit.className = 'colony-hud-unit';
    value.append(number, unit);
    // Power shows generation / use: a second, smaller fixed-width number before the unit.
    let second = null;
    if (id === 'power') {
      second = document.createElement('span');
      second.className = 'colony-hud-num is-small';
      second.style.minWidth = '1.3em';
      const slash = document.createElement('span');
      slash.className = 'colony-hud-unit';
      slash.textContent = '/';
      value.insertBefore(second, unit);
      value.insertBefore(slash, second);
    }
    const trend = document.createElement('span');
    trend.className = 'colony-hud-trend';
    copy.append(srName, value, trend);
    chip.append(icon, copy);
    chips.append(chip);
    chipNodes.set(id, { chip, number, second, unit, trend, charge: icon.querySelector('[data-charge]') });
  }

  const speedGroup = document.createElement('div');
  speedGroup.className = 'colony-hud-speed';
  speedGroup.setAttribute('role', 'group');
  speedGroup.setAttribute('aria-label', 'Simulation speed');
  const speeds = new Map();
  for (const [speed, label] of [[0, 'Pause'], [1, '1×'], [2, '2×'], [4, '4×']]) {
    const button = makeButton(speed ? label : '', () => { game().run({ type: 'setSpeed', speed }, false); refresh(); });
    if (!speed) {
      button.innerHTML = PAUSE_ICON;
      button.setAttribute('aria-label', 'Pause');
    }
    button.title = speed ? `Set simulation speed to ${speed}×` : 'Pause the simulation';
    button.setAttribute('aria-pressed', 'false');
    speeds.set(speed, button);
    speedGroup.append(button);
  }
  const stepButton = makeButton('+1 sol', () => {
    const current = game();
    current.acc = 0;
    current.run({ type: 'setSpeed', speed: 0 }, false);
    current.sim.step();
    current.acc = 0;
    current.refreshGrid();
    current.drawSide();
  }, { title: 'Advance one sol and remain paused', className: 'colony-hud-step' });
  speedGroup.append(stepButton);

  const tabs = document.createElement('div');
  tabs.className = 'colony-hud-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Colony panels');
  const panelTabs = new Map();
  for (const [id, label] of [['base', 'Base'], ['ops', 'Ops'], ['goals', 'Goals']]) {
    const button = makeButton('', () => openPanel(id), { className: 'colony-hud-tab' });
    const glyph = document.createElement('span');
    glyph.className = 'colony-hud-tab-icon';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.innerHTML = TAB_ICONS[id];
    const text = document.createElement('span');
    text.textContent = label;
    button.append(glyph, text);
    button.id = `colony-tab-${id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'colony-side-panel');
    button.setAttribute('aria-selected', 'false');
    panelTabs.set(id, button);
    tabs.append(button);
  }
  tabs.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const ids = [...panelTabs.keys()];
    const index = ids.findIndex(id => panelTabs.get(id) === document.activeElement);
    if (index < 0) return;
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    panelTabs.get(ids[(index + delta + ids.length) % ids.length])?.focus();
    event.preventDefault();
  });
  bar.append(clock, chips, speedGroup, tabs);
  root.append(bar);

  // Map zoom: a small control at the bottom-right of the visible map, above the weather bar.
  const zoom = document.createElement('div');
  zoom.className = 'colony-hud-zoom';
  zoom.setAttribute('role', 'group');
  zoom.setAttribute('aria-label', 'Map zoom');
  const zoomOut = makeButton('−', () => { stepBoardZoom(game(), -1); game().refreshGrid(); refresh(); }, { title: 'Zoom out (−)' });
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn = makeButton('+', () => { stepBoardZoom(game(), 1); game().refreshGrid(); refresh(); }, { title: 'Zoom in (+)' });
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const zoomValue = document.createElement('span');
  zoomValue.className = 'colony-hud-zoom-value';
  zoom.append(zoomOut, zoomValue, zoomIn);
  root.append(zoom);

  const panel = document.createElement('aside');
  panel.id = 'colony-side-panel';
  panel.className = 'colony-hud-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closePanel(); panelTabs.get(game().activePanel)?.focus(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const ids = [...panelTabs.keys()];
      const current = ids.indexOf(game().activePanel);
      const next = ids[(current + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      panelTabs.get(next)?.focus();
      event.preventDefault();
    }
  });
  panel.addEventListener('click', event => event.stopPropagation());
  root.append(panel);

  const toast = document.createElement('div');
  toast.className = 'colony-hud-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  const toastText = document.createElement('span');
  const dismissToast = makeButton('×', () => { toast.hidden = true; }, { className: 'colony-hud-toast-close', title: 'Dismiss message' });
  dismissToast.setAttribute('aria-label', 'Dismiss message');
  toast.append(toastText, dismissToast);
  root.append(toast);

  let activeCategory = 'Farming';
  const categoryNames = ['Farming', 'Power', 'Water', 'Support', 'Seeds'];

  function openPanel(id) {
    const current = game();
    current.activePanel = current.activePanel === id ? null : id;
    current.selected = null;
    current.showShopDetails = current.activePanel === 'base';
    current.showTimers = current.activePanel === 'ops';
    current.showAdvancements = current.activePanel === 'goals';
    current.drawSide();
    current.refreshGrid();
    if (current.activePanel) panel.querySelector('h2')?.focus();
    refresh();
  }

  function closePanel() {
    const current = game();
    const previous = current.activePanel;
    current.activePanel = null;
    current.showShopDetails = false;
    current.showTimers = false;
    current.showAdvancements = false;
    current.drawSide();
    current.refreshGrid();
    refresh();
    panelTabs.get(previous)?.focus();
  }

  function card(item, { locked = false, selected = false, icon = '▧', meta = '', onClick, title = '' } = {}) {
    const button = makeButton('', onClick, { className: `colony-hud-item${locked ? ' is-locked' : ''}`, title, disabled: locked });
    button.setAttribute('aria-pressed', String(selected));
    const iconNode = document.createElement('span');
    iconNode.className = 'colony-hud-icon';
    iconNode.setAttribute('aria-hidden', 'true');
    if (icon instanceof Node) iconNode.append(icon);
    else iconNode.textContent = icon;
    const copy = document.createElement('span');
    copy.className = 'colony-hud-item-copy';
    const titleNode = document.createElement('span');
    titleNode.className = 'colony-hud-item-name';
    titleNode.textContent = item.name;
    const metaNode = document.createElement('span');
    metaNode.className = 'colony-hud-item-meta';
    metaNode.textContent = meta;
    copy.append(titleNode, metaNode);
    button.append(iconNode, copy);
    return button;
  }

  function renderBase(content, subtitle) {
    const current = game();
    const definitions = data();
    const categoryList = shopCategories;
    const tabsNode = document.createElement('div');
    tabsNode.className = 'colony-hud-categories';
    for (const category of categoryList) {
      const button = makeButton(category.name, () => { activeCategory = category.name; renderPanel(); });
      button.setAttribute('aria-pressed', String(activeCategory === category.name));
      tabsNode.append(button);
    }
    content.append(tabsNode);
    const grid = document.createElement('div');
    grid.className = 'colony-hud-item-grid';
    const category = categoryList.find(entry => entry.name === activeCategory) ?? categoryList[0];
    if (!category) return;
    if (category.seeds) {
      for (const crop of definitions.crops) {
        const requirement = current.sim.unlockRequirement(crop);
        const foodCost = current.sim.plantingFoodCost(crop.id);
        // Use the simulation's traits so rescue-mode growth overrides (e.g. radish 8 sols) are shown.
        const growth = cropSolsRemaining(current.sim.cropTraits(crop.id) ?? crop, { id: 'plot' }, definitions.balance);
        const selected = current.seedTool === crop.id;
        const icon = crop.id === 'radish' ? createRadishSeedIcon() : (crop.emoji ?? '🌱');
        const meta = requirement ? `LOCKED · ${requirement}`
          : `${growth} sols · ${foodCost.toFixed(1)} kg food`;
        grid.append(card(crop, { locked: Boolean(requirement), selected, icon, meta,
          title: requirement ? `Unlock requirement: ${requirement}` : `Plant ${crop.name}`,
          onClick: () => {
            const selectedUnit = current.selected && current.sim.state.buildings.find(({ x, y }) =>
              x === current.selected.x && y === current.selected.y);
            const selectedBuilding = selectedUnit && definitions.buildings.find(({ id }) => id === selectedUnit.id);
            if (selectedUnit && selectedBuilding?.plot) {
              current.run({ type: 'plant', id: crop.id, uid: selectedUnit.uid });
            } else {
              current.seedTool = crop.id;
              current.tool = null;
              current.notify(`Select a greenhouse plot to plant ${crop.name}${foodCost ? ` · ${foodCost.toFixed(1)} kg food` : ''}.`);
              renderPanel();
            }
          } }));
      }
    } else {
      for (const id of category.items) {
        const item = definitions.buildings.find(entry => entry.id === id);
        if (!item) continue;
        const requirement = current.sim.unlockRequirement(item);
        const price = current.sim.purchasePrice(item);
        const meta = [`${price.toLocaleString()} kg`, item.why].filter(Boolean).join(' · ');
        const selected = current.tool === id;
        const icon = item.icon ?? ({ plot: '♧', washer: '≋', autoHarvester: '⚙', fertilizer: '✳',
          hydroponic: '♧', solar: '☀', battery: '▣', nuclear: '☢', iceDrill: '❄',
          recycler: '↻', harvester: '≋', berm: '⬟', shelter: '⌂', comms: '⌁', lab: '⚗', rockProp: '◆' })[id] ?? '▧';
        grid.append(card(item, { locked: Boolean(requirement), selected, icon,
          meta: requirement ? `LOCKED · ${requirement}` : meta,
          title: requirement ? `Unlock requirement: ${requirement}` : item.why,
          onClick: () => {
            current.tool = selected ? null : id;
            current.seedTool = null;
            current.selected = null;
            current.notify(current.tool ? `Select an empty tile for ${item.name}.` : 'Build selection cleared.');
            current.refreshGrid();
            renderPanel();
          } }));
      }
    }
    if (!grid.childElementCount) grid.textContent = 'Nothing available yet.';
    content.append(grid);
    const footer = document.createElement('footer');
    footer.className = 'colony-hud-footer';
    footer.style.alignItems = 'center';
    const balance = document.createElement('span');
    balance.textContent = `Build materials ${Math.floor(current.sim.state.res.credits).toLocaleString()} kg`;
    Object.assign(balance.style, { fontSize: '20px', fontWeight: '800', color: '#fff' });
    const selection = document.createElement('span');
    const chosen = current.dataSet.buildings.find(item => item.id === current.tool);
    const seed = current.dataSet.crops.find(item => item.id === current.seedTool);
    selection.textContent = chosen ? `${chosen.name} · ${current.sim.purchasePrice(chosen)} kg`
      : seed ? `Plant ${seed.name}` : 'Nothing selected';
    footer.append(balance, selection);
    panel.append(footer);
    void subtitle;
  }

  function renderOps(content) {
    const current = game();
    const snapshot = selectColonyUiState(current.sim, current.dataSet, foodPerCrew);
    const ration = document.createElement('section');
    ration.className = 'colony-hud-section';
    const rationHeading = document.createElement('h3');
    rationHeading.className = 'colony-hud-section-title';
    rationHeading.innerHTML = `<span>RATIONING</span><span style="color:${snapshot.foodLow ? LOW_AMBER : MUTED};font-weight:700;letter-spacing:0;text-transform:none">Food left ${snapshot.foodSols} sols</span>`;
    ration.append(rationHeading);
    const segment = document.createElement('div');
    segment.className = 'colony-hud-segment';
    segment.setAttribute('role', 'radiogroup');
    segment.setAttribute('aria-label', 'Rationing level');
    const rationLabels = { normal: 'Normal', reduced: 'Reduced', emergency: 'Emergency' };
    for (const level of Object.keys(current.dataSet.balance.rationing ?? { normal: 1, reduced: .75, emergency: .5 })) {
      const button = makeButton(rationLabels[level] ?? level, () => current.run({ type: 'setRationing', level }, false));
      button.dataset.hudFocus = `ration-${level}`;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(snapshot.rationing === level));
      const factor = current.dataSet.balance.rationing?.[level] ?? 1;
      button.title = `${Math.round(factor * 100)}% of standard food per sol`;
      segment.append(button);
    }
    segment.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const buttons = [...segment.querySelectorAll('[role="radio"]')];
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      next?.focus();
      next?.click();
      event.preventDefault();
    });
    ration.append(segment);
    const rationHelp = document.createElement('p');
    rationHelp.className = 'colony-hud-help';
    rationHelp.textContent = 'Lower rations stretch supplies but reduce dietary energy and can harm crew health.';
    ration.append(rationHelp);
    content.append(ration);

    const power = document.createElement('section');
    power.className = 'colony-hud-section';
    const powerHeading = document.createElement('h3');
    powerHeading.className = 'colony-hud-section-title';
    powerHeading.innerHTML = `<span>POWER ALLOCATION</span><span>Using ${formatPower(snapshot.power.useW)} of ${formatPower(snapshot.power.genW)}</span>`;
    power.append(powerHeading);
    if (!snapshot.loads.length) {
      const empty = document.createElement('p');
      empty.className = 'colony-hud-help';
      empty.textContent = 'No power loads yet.';
      power.append(empty);
    }
    for (const load of snapshot.loads) {
      const row = document.createElement('div');
      row.className = 'colony-hud-load';
      const name = document.createElement('span');
      name.textContent = `${load.label}${load.count > 1 ? ` · ${load.count}` : ''}`;
      const watts = document.createElement('strong');
      watts.textContent = formatPower(load.useW);
      const toggle = makeButton(load.essential ? 'ON' : load.enabled ? 'ON' : 'OFF',
        () => current.run({ type: 'setLoadEnabled', id: load.id, enabled: !load.enabled }, false),
        { className: 'colony-hud-switch', disabled: load.essential, title: load.essential ? 'Essential life support cannot be disabled' : `Toggle ${load.label}` });
      toggle.setAttribute('role', 'switch');
      toggle.dataset.hudFocus = `load-${load.id}`;
      toggle.setAttribute('aria-label', `${load.label} power`);
      toggle.setAttribute('aria-checked', String(load.essential || load.enabled));
      row.append(name, watts, toggle);
      power.append(row);
    }
    if (snapshot.power.useW > snapshot.power.genW) {
      const warning = document.createElement('p');
      warning.className = 'colony-hud-help';
      warning.style.color = LOW_AMBER;
      warning.textContent = 'Demand exceeds generation.';
      power.append(warning);
    }
    content.append(power);

    const waterFirst = current.sim.state.power.priority[0] === 'iceDrill';
    const powerOrder = makeButton(`Power order · ${waterFirst ? 'Water first' : 'Farm first'}`, () =>
      current.run({ type: 'setPriority', priority: waterFirst
        ? ['plot', 'hydroponic', 'iceDrill'] : ['iceDrill', 'recycler', 'plot', 'hydroponic'] }, false));
    powerOrder.dataset.hudFocus = 'power-order';
    content.append(powerOrder);

    const operations = document.createElement('section');
    operations.className = 'colony-hud-section';
    const operationsHeading = document.createElement('h3');
    operationsHeading.className = 'colony-hud-section-title';
    operationsHeading.textContent = 'ACTIVE OPERATIONS';
    operations.append(operationsHeading);
    const timers = current.sim.state.events.active.map(event =>
      `${event.name} · ${Math.max(0, event.until - current.sim.state.sol)} sols remaining`);
    if (current.sim.state.metrics.packets.length) {
      timers.push(`${current.sim.state.res.data} research packets queued for downlink`);
    }
    const operationText = document.createElement('p');
    operationText.className = 'colony-hud-help';
    operationText.textContent = timers.join(' · ') || 'Weather, outages and research downlinks appear here.';
    operations.append(operationText);
    content.append(operations);

    const spare = current.dataSet.balance.kit.find(item => item.id === 'spares');
    if (spare && current.sim.state.rescue) {
      const price = current.sim.purchasePrice(spare);
      const buy = makeButton(`Buy spare part · ${price} kg`, () => current.run({ type: 'buySpares' }),
        { disabled: current.sim.state.res.credits < price });
      buy.dataset.hudFocus = 'buy-spare';
      content.append(buy);
    }
    const danger = document.createElement('section');
    danger.className = 'colony-hud-section';
    const title = document.createElement('h3');
    title.className = 'colony-hud-section-title';
    title.textContent = 'DANGER ZONE';
    const abandon = makeButton(current.sim.state.rescue ? 'Abandon colony' : 'End mission', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'colony-name-dialog';
      const actionLabel = current.sim.state.rescue ? 'Abandon' : 'End mission';
      dialog.innerHTML = `<form method="dialog"><h2>${actionLabel}?</h2><p>This ends the current run.</p><div><button value="cancel" autofocus>Cancel</button><button class="colony-hud-danger" value="confirm">${actionLabel}</button></div></form>`;
      dialog.addEventListener('submit', event => {
        if (event.submitter?.value === 'confirm') {
          dialog.close();
          current.run({ type: 'endMission' });
        }
      });
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[value="cancel"]')?.focus();
    }, { className: 'colony-hud-danger' });
    abandon.dataset.hudFocus = 'abandon';
    danger.append(title, abandon);
    content.append(danger);
  }

  function renderGoals(content) {
    const goals = selectColonyUiState(game().sim, data(), foodPerCrew).goals;
    if (!goals.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Goals are available in survival missions.';
      content.append(empty);
      return;
    }
    const completed = goals.filter(goal => goal.done).length;
    for (const goal of [...goals.filter(item => item.done), ...goals.filter(item => !item.done)]) {
      const card = document.createElement('article');
      card.className = `colony-hud-goal${goal.done ? ' is-done' : ''}`;
      const heading = document.createElement('div');
      heading.className = 'colony-hud-goal-head';
      const title = document.createElement('span');
      title.textContent = `${goal.done ? '✓ ' : ''}${goal.title}`;
      const progress = document.createElement('span');
      progress.textContent = goal.done ? 'Done'
        : `${goal.progress} / ${goal.target}${goal.unit ? ` ${goal.unit}` : ''}`;
      heading.append(title, progress);
      const description = document.createElement('p');
      description.className = 'colony-hud-help';
      const missingUnlocks = goal.unlocks.filter(name => !goal.description.toLowerCase().includes(name.toLowerCase()));
      const unlocks = missingUnlocks.length ? ` Unlocks ${missingUnlocks.join(', ')}.` : '';
      description.textContent = `${goal.description}${unlocks}`;
      const bar = document.createElement('div');
      bar.className = 'colony-hud-progress';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', `${goal.title} progress`);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(goal.target));
      bar.setAttribute('aria-valuenow', String(goal.progress));
      const fill = document.createElement('span');
      fill.style.transform = `scaleX(${Math.min(1, goal.progress / Math.max(1, goal.target))})`;
      bar.append(fill);
      card.append(heading, description, bar);
      content.append(card);
    }
    panel.querySelector('.colony-hud-subtitle').textContent = `${completed} of ${goals.length} completed.`;
  }

  function renderPanel() {
    const current = game();
    const focusedId = panel.contains(document.activeElement) ? document.activeElement.dataset.hudFocus : null;
    panel.replaceChildren();
    panel.hidden = !current.activePanel;
    panel.style.display = current.activePanel ? 'flex' : 'none';
    for (const [id, button] of panelTabs) {
      const active = current.activePanel === id;
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('aria-pressed', String(active));
    }
    panel.setAttribute('aria-labelledby', `colony-tab-${current.activePanel ?? 'base'}`);
    if (!current.activePanel) return;
    const hasBuildingSelection = current.selected && current.sim.state.buildings.some(({ x, y }) =>
      x === current.selected.x && y === current.selected.y);
    const hasFeatureSelection = current.selected && surfaceFeatureAt(current.sim.state, current.selected);
    const isSelection = current.activePanel === 'base' && !current.showShopDetails &&
      (hasBuildingSelection || hasFeatureSelection);
    const content = document.createElement('div');
    content.className = 'colony-hud-panel-content';
    const head = document.createElement('header');
    head.className = 'colony-hud-panel-head';
    const title = document.createElement('h2');
    title.className = 'colony-hud-panel-title';
    title.tabIndex = -1;
    title.textContent = current.activePanel === 'base' ? 'Base shop' : current.activePanel === 'ops' ? 'Ops' : 'Goals';
    const subtitle = document.createElement('p');
    subtitle.className = 'colony-hud-subtitle';
    subtitle.textContent = current.activePanel === 'base' ? current.selected
      ? `Tile ${current.selected.x + 1}, ${current.selected.y + 1} selected. Choose what to build.`
      : 'Select an empty tile or choose what to build.'
      : current.activePanel === 'ops' ? 'Run the colony day to day.' : '';
    const close = makeButton('Close', closePanel, { className: 'colony-hud-panel-close' });
    close.setAttribute('aria-label', 'Close panel');
    head.append(title, subtitle, close);
    panel.append(head, content);
    if (current.activePanel === 'base') {
      if (isSelection) {
        panel.hidden = true;
        panel.style.display = 'none';
        return;
      }
      renderBase(content, subtitle.textContent);
    } else if (current.activePanel === 'ops') renderOps(content);
    else renderGoals(content);
    if (focusedId) panel.querySelector(`[data-hud-focus="${CSS.escape(focusedId)}"]`)?.focus();
  }

  function position() {
    const canvas = scene.game.canvas;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const box = canvas.getBoundingClientRect();
    const parentBox = parent.getBoundingClientRect();
    const sx = box.width / 1280;
    const sy = box.height / 720;
    Object.assign(root.style, { left: `${box.left - parentBox.left}px`, top: `${box.top - parentBox.top}px`,
      width: '1280px', height: '720px', right: 'auto', bottom: 'auto', transform: `scale(${sx},${sy})`, transformOrigin: 'top left' });
    const { hudBar, sidePanel, zoomControl } = colonyLayout;
    Object.assign(bar.style, { left: `${hudBar.x}px`, top: `${hudBar.y}px`, width: `${hudBar.width}px`, height: `${hudBar.height}px` });
    Object.assign(panel.style, { left: `${sidePanel.x}px`, top: `${sidePanel.y}px`, width: `${sidePanel.width}px`,
      height: `${sidePanel.bottom - sidePanel.y}px` });
    // Keep the zoom control on the visible map: left of the side panel while it is open.
    const zoomRight = panel.hidden ? zoomControl.right : sidePanel.x - zoomControl.gapToPanel;
    Object.assign(zoom.style, { right: `${1280 - zoomRight}px`, top: `${zoomControl.top}px`, height: `${zoomControl.height}px` });
    Object.assign(toast.style, { left: '24px', top: '566px', maxWidth: `${Math.min(600, currentMapWidth() - 48)}px` });
  }

  function currentMapWidth() { return game().activePanel ? 1272 - Math.min(460, 1280 * .37) : 1272; }

  let dialKey = '';
  function refreshClock(snapshot) {
    const current = game();
    const tick = current.dataSet?.balance?.solMs ?? 1;
    const fraction = Math.min(1, Math.max(0, (current.acc ?? 0) / tick));
    const key = `${snapshot.sol}:${Math.round(fraction * 200)}`;
    if (key === dialKey) return;
    dialKey = key;
    dialArc.setAttribute('stroke-dasharray', `${(fraction * DIAL_C).toFixed(2)} ${DIAL_C.toFixed(2)}`);
    setText(dialSol, snapshot.sol);
    const label = `Sol ${snapshot.sol}`;
    if (dial.getAttribute('aria-label') !== label) dial.setAttribute('aria-label', label);
  }

  function setChip(id, { value, second, unit, trend = '', state = '', title = '' }) {
    const node = chipNodes.get(id);
    setText(node.number, value);
    if (node.second) setText(node.second, second ?? '');
    setText(node.unit, unit);
    setText(node.trend, trend);
    node.chip.classList.toggle('is-urgent', state === 'urgent');
    node.chip.classList.toggle('is-good', state === 'good');
    if (node.chip.title !== title) node.chip.title = title;
  }

  function refreshChips(snapshot) {
    // Lane 1 adds snapshot.trends; until then, show only what the current snapshot supports.
    const trends = snapshot.trends ?? {};
    const materialsRate = formatRate(trends.materialsPerSol);
    setChip('materials', { value: Math.floor(snapshot.credits).toLocaleString('en-US'), unit: 'kg', trend: materialsRate,
      title: `Build materials${materialsRate ? ` · ${materialsRate}` : ''}` });

    const { genW, useW } = snapshot.power;
    const surplusW = trends.powerSurplusW ?? (genW - useW);
    const short = useW > genW || surplusW < 0;
    setChip('power', { value: (genW / 1000).toFixed(1), second: (useW / 1000).toFixed(1), unit: 'kW',
      trend: short ? `short ${Math.abs(surplusW / 1000).toFixed(1)} kW` : `surplus ${(surplusW / 1000).toFixed(1)} kW`,
      state: short ? 'urgent' : 'good', title: `Power · generating ${formatPower(genW)}, using ${formatPower(useW)}` });

    const { currentWh, capacityWh } = snapshot.battery;
    const hasBattery = capacityWh > 0;
    const empty = hasBattery && currentWh <= 0;
    const charge = hasBattery ? Math.min(1, Math.max(0, currentWh / capacityWh)) : 0;
    setChip('battery', { value: hasBattery ? (currentWh / 1000).toFixed(1) : '—', unit: hasBattery ? 'kWh' : '',
      trend: !hasBattery ? 'none yet' : empty ? 'empty' : `${Math.round(charge * 100)}% full`,
      state: empty ? 'urgent' : '', title: hasBattery ? `Battery · ${(currentWh / 1000).toFixed(1)} of ${(capacityWh / 1000).toFixed(1)} kWh` : 'Battery · build one to store solar power' });
    chipNodes.get('battery').charge?.setAttribute('width', (12 * charge).toFixed(1));

    const waterRate = formatRate(trends.waterPerSol);
    setChip('water', { value: Math.round(snapshot.waterL).toLocaleString('en-US'), unit: 'L', trend: waterRate,
      title: `Water${waterRate ? ` · ${waterRate}` : ''}` });

    const arrival = sim.state.rescue?.arrivalSol;
    const runsOut = 'foodRunsOutSol' in trends ? trends.foodRunsOutSol : snapshot.sol + snapshot.foodSols;
    const lasts = runsOut == null || (arrival != null && runsOut >= arrival);
    setChip('food', { value: snapshot.foodSols, unit: snapshot.foodSols === 1 ? 'sol' : 'sols',
      trend: lasts ? (arrival != null ? 'lasts to rescue' : '') : `runs out sol ${runsOut}`,
      state: snapshot.foodLow ? 'urgent' : lasts ? 'good' : '',
      title: `Food · ${snapshot.foodSols} sols of rations at the current ration level` });
  }

  function refresh() {
    if (!game()?.sim) return;
    const snapshot = selectColonyUiState(sim, data(), foodPerCrew);
    refreshClock(snapshot);
    refreshChips(snapshot);
    setText(nameNode, snapshot.colonyName || sim.state.site.name);
    nameNode.title = !sim.state.rescue ? '' : namingUnlocked() ? 'Rename colony'
      : `Colony naming unlocks at Halfway Home (sol ${halfwaySol()})`;
    nameNode.classList.toggle('is-locked', Boolean(sim.state.rescue) && !namingUnlocked());
    const season = snapshot.season ? ` · ${snapshot.season[0].toUpperCase()}${snapshot.season.slice(1)}` : '';
    const rescueHtml = snapshot.rescueIn == null
      ? `Sol <b>${snapshot.sol}</b> of ${sim.state.solLimit}${season}`
      : `Rescue in <b>${snapshot.rescueIn}</b> ${snapshot.rescueIn === 1 ? 'sol' : 'sols'}${season}`;
    if (rescueLine.innerHTML !== rescueHtml) rescueLine.innerHTML = rescueHtml;
    zoomOut.disabled = game().boardZoom <= boardZoomRange.min + 1e-6;
    zoomIn.disabled = game().boardZoom >= boardZoomRange.max - 1e-6;
    setText(zoomValue, `${Math.round((game().boardZoom ?? 1) * 100)}%`);
    speeds.forEach((button, speed) => {
      button.setAttribute('aria-pressed', String(snapshot.speed === speed));
      button.disabled = sim.state.status !== 'active';
    });
    stepButton.disabled = sim.state.status !== 'active';
    const message = game().message;
    if (message && toastText.textContent !== message) {
      setText(toastText, message);
      toast.hidden = false;
    }
    position();
  }

  const resize = () => position();
  scene.scale.on('resize', resize);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', resize);
    root.remove();
  });
  renderPanel();
  refresh();
  function pulseTab(id) {
    const tab = panelTabs.get(id);
    if (!tab) return;
    tab.classList.remove('is-pulsing');
    void tab.offsetWidth;
    tab.classList.add('is-pulsing');
    tab.addEventListener('animationend', () => tab.classList.remove('is-pulsing'), { once: true });
  }

  return { root, refresh, renderPanel, openPanel, pulseTab };
}
