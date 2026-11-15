// AI-assisted (OpenAI Codex; Claude Code for tabs, achievement card hooks and the naming gate)
import { selectColonyUiState } from './selectors.js';
import { shopCategories } from './catalog.js';
import { surfaceFeatureAt } from '../surfaceActions.js';
import { boardZoomRange, stepBoardZoom } from './layout.js';
import { achievementCardCss } from '../achievementToasts.js';
import { cropSolsRemaining } from '../../sim/systems/crops.js';

const LOW_AMBER = '#ffb05a';
const PANEL_BG = '#231615';
const RAISED = '#3a2623';
const SUNKEN = '#1b1110';
const ACCENT = '#f0886a';
const MUTED = '#c9b3a8';

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

// Tab glyphs drawn as inline SVG so they render the same without emoji fonts.
const TAB_ICONS = {
  base: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 19h18"/><path d="M5 19v-5a7 7 0 0 1 14 0v5"/><path d="M10 19v-4h4v4"/><path d="M12 7V4"/></svg>',
  ops: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  goals: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.8l2.7 6 6.5.6-4.9 4.3 1.5 6.4L12 16.7l-5.8 3.4 1.5-6.4-4.9-4.3 6.5-.6z"/></svg>',
};

function formatPower(watts) { return `${(watts / 1000).toFixed(1)} kW`; }

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
      .colony-hud-root { position:absolute; inset:0; pointer-events:none; z-index:30; color:#f5e9e2; font-family:Inter,system-ui,sans-serif; }
      .colony-hud-panel,.colony-hud-stats,.colony-hud-controls,.colony-hud-toast { box-sizing:border-box; background:${PANEL_BG}; border:1px solid #6e4b42; border-radius:10px; box-shadow:0 4px 18px #140b0b55; }
      .colony-hud-stats { position:absolute; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:center; padding:5px 10px; pointer-events:auto; }
      .colony-hud-stat { min-width:0; padding:1px 10px; border-left:1px solid #4a3330; }
      .colony-hud-stat:first-child { border-left:0; padding-left:2px; }
      .colony-hud-label { color:#d6b4a1; font-weight:700; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; }
      .colony-hud-value { font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .colony-hud-warning { color:${LOW_AMBER}; font-weight:800; letter-spacing:.06em; margin-left:5px; }
      .colony-hud-controls { position:absolute; display:flex; align-items:center; gap:6px; padding:5px 8px; pointer-events:auto; }
      .colony-hud-controls button,.colony-hud-panel button { color:#f5e9e2; background:${RAISED}; border:1px solid #6e4b42; border-radius:6px; cursor:pointer; }
      .colony-hud-controls button { min-width:32px; }
      .colony-hud-controls button:hover,.colony-hud-panel button:hover { border-color:${ACCENT}; }
      .colony-hud-controls button:focus-visible,.colony-hud-panel button:focus-visible { outline:2px solid #ffe9b8; outline-offset:1px; }
      .colony-hud-controls button[aria-pressed=true],.colony-hud-panel button[aria-pressed=true] { color:#1b1110; background:${ACCENT}; border-color:${ACCENT}; }
      .colony-hud-controls button:disabled,.colony-hud-panel button:disabled { opacity:.45; cursor:not-allowed; }
      .colony-hud-left,.colony-hud-right,.colony-hud-group { display:flex; align-items:center; gap:5px; min-width:0; }
      .colony-hud-left { flex:1 1 auto; }
      .colony-hud-right { flex:0 0 auto; margin-left:auto; }
      .colony-hud-name { max-width:210px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
      .colony-hud-name.is-locked { color:${MUTED}; border-style:dashed!important; }
      .colony-hud-terrain { color:${MUTED}; white-space:nowrap; }
      .colony-hud-sol { font-weight:800; white-space:nowrap; }
      .colony-hud-divider { width:1px; align-self:stretch; background:#6e4b42; margin:0 4px; }
      .colony-hud-tabs { display:flex; gap:6px; }
      .colony-hud-controls .colony-hud-tab { height:40px; min-width:92px; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:0 14px 0 11px; font-size:15px; font-weight:800; letter-spacing:.02em; border-radius:8px; }
      .colony-hud-tab-icon { display:inline-grid; place-items:center; width:20px; height:20px; color:${ACCENT}; }
      .colony-hud-controls .colony-hud-tab[aria-pressed=true] { box-shadow:inset 0 -3px 0 #1b111055, 0 0 12px #f0886a66; }
      .colony-hud-controls .colony-hud-tab[aria-pressed=true] .colony-hud-tab-icon { color:#1b1110; }
      .colony-hud-panel { position:absolute; display:flex; flex-direction:column; pointer-events:auto; overflow:hidden; }
      .colony-hud-panel[hidden] { display:none; }
      .colony-hud-panel-head { padding:14px 16px 8px; border-bottom:1px solid #4a3330; }
      .colony-hud-panel-title { margin:0; font-weight:800; line-height:1.1; }
      .colony-hud-subtitle { margin:5px 0 0; color:${MUTED}; }
      .colony-hud-panel-close { position:absolute; top:10px; right:12px; padding:5px 10px; }
      .colony-hud-panel-content { min-height:0; overflow:auto; padding:10px 14px; flex:1 1 auto; }
      .colony-hud-categories { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:5px; margin:0 0 10px; }
      .colony-hud-categories button { min-height:32px; padding:4px 2px; }
      .colony-hud-item-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
      .colony-hud-item { min-height:70px; padding:7px; display:grid; grid-template-columns:56px minmax(0,1fr); gap:9px; text-align:left; align-items:center; background:${RAISED}!important; }
      .colony-hud-item.is-locked { background:${SUNKEN}!important; color:#9b857c!important; }
      .colony-hud-icon { width:56px; height:56px; box-sizing:border-box; display:grid; place-items:center; border:1px dashed #806158; border-radius:8px; font-size:30px; line-height:1; background:#1b111066; }
      .colony-hud-item-copy { min-width:0; }
      .colony-hud-item-name,.colony-hud-item-meta { display:block; overflow-wrap:anywhere; }
      .colony-hud-item-name { font-weight:750; }
      .colony-hud-item-meta { margin-top:3px; color:${MUTED}; line-height:1.2; }
      .colony-hud-footer { display:flex; justify-content:space-between; gap:8px; padding:10px 14px; border-top:1px solid #4a3330; color:${MUTED}; }
      .colony-hud-section { margin:0 0 14px; padding:10px; border:1px solid #4a3330; border-radius:8px; background:${SUNKEN}; }
      .colony-hud-section-title { display:flex; justify-content:space-between; gap:8px; margin:0 0 8px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
      .colony-hud-segment { display:flex; gap:5px; }
      .colony-hud-segment button { flex:1; min-height:34px; }
      .colony-hud-load { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:8px; align-items:center; padding:8px 0; border-top:1px solid #4a3330; }
      .colony-hud-switch { min-width:54px; min-height:30px; }
      .colony-hud-help { color:${MUTED}; margin:7px 0 0; }
      .colony-hud-danger { border-color:#8c4038!important; color:#ff9a8a!important; background:#351c1a!important; }
      .colony-hud-goal { margin:0 0 8px; padding:10px; border:1px solid #4a3330; border-radius:8px; background:${RAISED}; }
      .colony-hud-goal.is-done { border-color:#7faa83; }
      .colony-hud-goal-head { display:flex; justify-content:space-between; gap:8px; font-weight:750; }
      .colony-hud-progress { height:7px; margin:8px 0 5px; overflow:hidden; background:#120d0c; border-radius:9px; }
      .colony-hud-progress > span { display:block; height:100%; background:${ACCENT}; transform-origin:left; }
      .colony-hud-toast { position:absolute; pointer-events:none; max-width:600px; padding:10px 40px 10px 14px; color:#f5e9e2; background:#231615ed; }
      .colony-hud-toast[hidden] { display:none; }
      .colony-hud-toast-close { position:absolute; right:7px; top:6px; width:28px; height:28px; pointer-events:auto; }
      .colony-hud-tabs button.is-pulsing { animation:colony-tab-pulse .8s ease-in-out 3; }
      @keyframes colony-tab-pulse { 0%,100% { box-shadow:0 0 0 0 #f0b45a00; border-color:#6e4b42; }
        50% { box-shadow:0 0 0 4px #f0b45a88, 0 0 18px #f0b45acc; border-color:#ffd27a; color:#ffd27a; } }
      ${achievementCardCss}
      @media (max-width: 920px) { .colony-hud-terrain,.colony-hud-zoom-label { display:none; } }
    `;
    document.head.append(styleTag);
  }
  root.className = 'colony-hud-root';
  root.replaceChildren();

  const statsBar = document.createElement('header');
  statsBar.className = 'colony-hud-stats';
  statsBar.setAttribute('role', 'group');
  statsBar.setAttribute('aria-label', 'Colony status');
  const statNodes = new Map();
  const statNames = ['RESCUE IN', 'MATERIALS', 'POWER', 'BATTERY', 'WATER', 'FOOD'];
  for (const name of statNames) {
    const cell = document.createElement('div');
    cell.className = 'colony-hud-stat';
    const label = document.createElement('div');
    label.className = 'colony-hud-label';
    const value = document.createElement('span');
    value.className = 'colony-hud-value';
    const tag = document.createElement('span');
    tag.className = 'colony-hud-warning';
    tag.setAttribute('aria-live', 'polite');
    cell.append(label, value, tag);
    statsBar.append(cell);
    statNodes.set(name, { label, value, tag });
  }
  root.append(statsBar);

  const controls = document.createElement('div');
  controls.className = 'colony-hud-controls';
  controls.setAttribute('aria-label', 'Colony controls');
  const left = document.createElement('div');
  left.className = 'colony-hud-left';
  const namingUnlocked = () => Boolean(sim.state.rescue && Object.hasOwn(sim.state.rescue.earned, 'halfway'));
  const halfwaySol = () => Math.ceil((sim.state.rescue?.arrivalSol ?? 0) / 2);
  const nameNode = makeButton('', () => {
    const current = game();
    if (!current.sim.state.rescue) return;
    if (namingUnlocked()) current.openNameDialog();
    else current.notify(`Colony naming unlocks at Halfway Home (sol ${halfwaySol()}).`);
  }, { className: 'colony-hud-name' });
  nameNode.setAttribute('aria-label', 'Colony name. Rename when unlocked.');
  left.append(nameNode);
  const zoomOut = makeButton('−', () => { stepBoardZoom(game(), -1); game().refreshGrid(); refresh(); });
  zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn = makeButton('+', () => { stepBoardZoom(game(), 1); game().refreshGrid(); refresh(); });
  zoomIn.setAttribute('aria-label', 'Zoom in');
  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'colony-hud-zoom-label';
  zoomLabel.textContent = 'Colony zoom';
  const terrain = document.createElement('span');
  terrain.className = 'colony-hud-terrain';
  left.append(zoomOut, zoomIn, zoomLabel, terrain);

  const right = document.createElement('div');
  right.className = 'colony-hud-right';
  const solLabel = document.createElement('span');
  solLabel.className = 'colony-hud-sol';
  const speedGroup = document.createElement('div');
  speedGroup.className = 'colony-hud-group';
  const speeds = new Map();
  for (const [speed, label] of [[0, 'Pause'], [1, '1×'], [2, '2×'], [4, '4×']]) {
    const button = makeButton(label, () => { game().run({ type: 'setSpeed', speed }, false); refresh(); });
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
  }, { title: 'Advance one sol and remain paused' });
  const divider = document.createElement('span');
  divider.className = 'colony-hud-divider';
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
  right.append(solLabel, speedGroup, stepButton, divider, tabs);
  controls.append(left, right);
  root.append(controls);

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
    iconNode.textContent = icon;
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
        const icon = crop.emoji ?? '🌱';
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
    Object.assign(statsBar.style, { left: '8px', top: '8px', width: '1264px', height: '56px' });
    Object.assign(controls.style, { left: '8px', top: '72px', width: '1264px', height: '52px' });
    Object.assign(panel.style, { left: '812px', top: '132px', width: '460px', height: '516px' });
    Object.assign(toast.style, { left: '24px', top: '566px', maxWidth: `${Math.min(600, currentMapWidth() - 48)}px` });
  }

  function currentMapWidth() { return game().activePanel ? 1272 - Math.min(460, 1280 * .37) : 1272; }

  function refresh() {
    if (!game()?.sim) return;
    const snapshot = selectColonyUiState(sim, data(), foodPerCrew);
    const values = {
      'RESCUE IN': snapshot.rescueIn == null ? `${snapshot.sol} / ${sim.state.solLimit}` : `${snapshot.rescueIn} ${snapshot.rescueIn === 1 ? 'sol' : 'sols'}`,
      MATERIALS: `${Math.floor(snapshot.credits).toLocaleString()} kg`,
      POWER: `${(snapshot.power.genW / 1000).toFixed(1)} / ${(snapshot.power.useW / 1000).toFixed(1)} kW`,
      BATTERY: snapshot.battery.capacityWh > 0 ? `${(snapshot.battery.currentWh / 1000).toFixed(1)} kWh` : '—',
      WATER: `${Math.round(snapshot.waterL).toLocaleString()} L`,
      FOOD: `${snapshot.foodSols} ${snapshot.foodSols === 1 ? 'sol' : 'sols'}`,
    };
    for (const [name, value] of Object.entries(values)) {
      const node = statNodes.get(name);
      setText(node.value, value);
      const label = name === 'RESCUE IN' && snapshot.rescueIn == null ? 'MISSION' : name;
      setText(node.label, label);
      const warning = name === 'BATTERY' && snapshot.battery.capacityWh > 0 && snapshot.battery.currentWh <= 0 ? 'EMPTY'
        : name === 'FOOD' && snapshot.foodLow ? 'LOW' : '';
      setText(node.tag, warning);
      node.tag.hidden = !warning;
      node.value.style.color = warning ? LOW_AMBER : '';
    }
    setText(nameNode, snapshot.colonyName || sim.state.site.name);
    nameNode.title = !sim.state.rescue ? '' : namingUnlocked() ? 'Rename colony'
      : `Colony naming unlocks at Halfway Home (sol ${halfwaySol()})`;
    nameNode.classList.toggle('is-locked', Boolean(sim.state.rescue) && !namingUnlocked());
    terrain.textContent = `Terrain · ${snapshot.terrain}`;
    solLabel.textContent = `SOL ${snapshot.sol} · ${String(snapshot.season ?? '').toUpperCase()}`;
    zoomOut.disabled = game().boardZoom <= boardZoomRange.min + 1e-6;
    zoomIn.disabled = game().boardZoom >= boardZoomRange.max - 1e-6;
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
