// AI-assisted (Claude Code): Comms Dish HUD panel (repair, seed orders, supply drop countdown, crate).
// Codes against the docs/DESIGN_HUD_COMMS.md section 0 contract. Sim helpers (seedCatalog, commsStatus)
// are feature-detected; when absent the same view is derived from state.comms and balance.rescue.comms.
import { boardView, panBoard } from './layout.js';
import { fontDisplay, theme } from '../theme.js';

const EMPTY_COMMS = Object.freeze({ repaired: false, order: null, delivered: [], crate: null });

const fmtKg = (kg) => `${(Math.round(kg * 100) / 100).toFixed(2)} kg`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function commsConfig(data) { return data?.balance?.rescue?.comms ?? {}; }
function commsState(sim) { return sim?.state?.comms ?? EMPTY_COMMS; }
function cropName(data, id) { return data?.crops?.find((crop) => crop.id === id)?.name ?? id; }
export function commsDish(sim) { return sim?.state?.buildings?.find(({ id }) => id === 'comms') ?? null; }

/** True when the comms panel replaces the generic building detail (rescue missions only). */
export function usesCommsPanel(sim) { return Boolean(sim?.state?.rescue); }

/** [{ id, name, packetKg, owned, inFlight, orderable }] — sim.seedCatalog() when available. */
export function seedCatalogView(sim, data) {
  if (typeof sim?.seedCatalog === 'function') {
    const comms = commsState(sim);
    return sim.seedCatalog().map((entry) => {
      // A crop sitting in an uncollected crate is not orderable either.
      const inCrate = Boolean(comms.crate?.items?.includes(entry.id));
      const inFlight = Boolean(entry.inFlight ?? comms.order?.items?.includes(entry.id)) || inCrate;
      return { ...entry, inFlight, orderable: Boolean(entry.orderable) && !inFlight && !entry.owned };
    });
  }
  const config = commsConfig(data);
  const comms = commsState(sim);
  const starter = config.starterSeeds ?? [];
  return (data?.crops ?? []).filter(({ id }) => config.packetKg?.[id] != null).map(({ id, name }) => {
    const owned = starter.includes(id) || comms.delivered?.includes(id);
    const inFlight = Boolean(comms.order?.items?.includes(id) || comms.crate?.items?.includes(id));
    return { id, name, packetKg: config.packetKg[id], owned, inFlight, orderable: !owned && !inFlight };
  });
}

/** { repaired, online, repairCost, capacityKg, deliverySols, order, solsRemaining, crate } */
export function commsStatusView(sim, data) {
  const config = commsConfig(data);
  const comms = commsState(sim);
  const dish = commsDish(sim);
  const base = typeof sim?.commsStatus === 'function' ? sim.commsStatus() : {};
  const repaired = base.repaired ?? comms.repaired;
  const order = base.order !== undefined ? base.order : comms.order;
  const sol = sim?.state?.sol ?? 0;
  return {
    repaired,
    online: base.online ?? Boolean(repaired && dish?.online),
    repairCost: base.repairCost ?? config.repairCost ?? 0,
    capacityKg: base.capacityKg ?? config.orderCapacityKg ?? 0,
    deliverySols: config.deliverySols ?? 20,
    order,
    solsRemaining: base.solsRemaining ?? (order ? Math.max(0, order.arrivalSol - sol) : null),
    crate: base.crate !== undefined ? base.crate : comms.crate,
  };
}

/** Short note for a Seeds-tab crop that comes from the dish, or null when it is not a dish crop. */
export function commsSeedNote(sim, data, cropId) {
  if (!usesCommsPanel(sim)) return null;
  const entry = seedCatalogView(sim, data).find(({ id }) => id === cropId);
  if (!entry || entry.owned) return null;
  const { order, crate } = commsStatusView(sim, data);
  if (crate?.items?.includes(cropId)) return 'In the supply crate · collect it';
  if (order?.items?.includes(cropId)) return `On its way · lands sol ${order.arrivalSol}`;
  return 'Order from the Comms Dish';
}

/** One line for Ops > Active operations, or null. */
export function commsCountdownLine(sim, data) {
  if (!usesCommsPanel(sim)) return null;
  const { order, solsRemaining, crate } = commsStatusView(sim, data);
  if (order) return `Supply drop · lands in ${plural(solsRemaining, 'sol')} (sol ${order.arrivalSol})`;
  if (crate) return 'Supply crate on the ground · click it to collect';
  return null;
}

/** Select the dish tile and show the comms panel. */
export function focusCommsDish(scene) {
  const dish = commsDish(scene.sim);
  scene.activePanel = 'comms';
  scene.selected = dish ? { x: dish.x, y: dish.y } : null;
  scene.showShopDetails = false;
  scene.showTimers = false;
  scene.showAdvancements = false;
  scene.seedTool = null;
  scene.tool = null;
  scene.refreshGrid();
  scene.drawSide();
}

/** Pan the board so the crate is centred, then select its tile (opens the crate detail). */
export function locateCrate(scene) {
  const crate = commsState(scene.sim).crate;
  if (!crate) return false;
  const centre = boardView(scene);
  panBoard(scene, crate.x + 0.5 - centre.x, crate.y + 0.5 - centre.y);
  scene.select(crate.x, crate.y);
  return true;
}

const STYLE_ID = 'colony-comms-style';
const css = `
  .colony-comms { display:flex; flex-direction:column; gap:12px; }
  .colony-comms h3 { margin:0 0 6px; font-family:${fontDisplay}; font-size:22px; letter-spacing:.06em; font-weight:700; color:${theme.ink}; }
  .colony-comms p { margin:0; color:${theme.muted}; line-height:1.35; }
  .colony-comms ul { margin:6px 0 0; padding-left:18px; color:${theme.ink}; line-height:1.35; }
  .colony-comms li + li { margin-top:4px; }
  .colony-comms-block { padding:10px 12px; border:1px solid ${theme.divider}; border-radius:8px; background:${theme.sunken}; }
  .colony-comms-block.is-alert { border-color:${theme.amber}; box-shadow:0 0 0 2px ${theme.amber}33; }
  .colony-comms-block.is-alert h3 { color:${theme.amber}; }
  .colony-comms-lead { margin-top:8px!important; }
  .colony-comms .colony-hud-item[aria-pressed=true] { color:${theme.ink}!important; border:2px solid ${theme.accent}!important;
    box-shadow:inset 0 0 0 1px ${theme.accent}55, 0 0 10px ${theme.accent}44; }
  .colony-comms .colony-hud-item[aria-pressed=true] .colony-hud-item-meta { color:${theme.accent}; font-weight:700; }
  .colony-comms-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; align-items:center; }
  .colony-comms-row button { min-height:36px; padding:4px 14px; font-weight:750; }
  .colony-comms-primary { color:${theme.sunken}!important; background:${theme.accent}!important; border-color:${theme.accent}!important; }
  .colony-comms-primary:disabled { color:${theme.muted}!important; background:${theme.raised}!important; border-color:${theme.border}!important; }
  .colony-comms-cost { display:flex; justify-content:space-between; gap:8px; margin-top:8px; color:${theme.ink}; font-weight:700; }
  .colony-comms-short { color:${theme.amber}; font-weight:700; }
  .colony-comms-warn { color:${theme.amber}!important; font-weight:700; }
  .colony-comms-ok { color:${theme.mint}!important; font-weight:700; }
  .colony-comms-flight { display:grid; grid-template-columns:96px minmax(0,1fr); gap:14px; align-items:center; }
  .colony-comms-ring { width:96px; height:96px; }
  .colony-comms-ring text { font-weight:800; }
  .colony-comms-big { font-size:20px; font-weight:800; color:${theme.ink}; line-height:1.15; }
  .colony-comms-contents { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .colony-comms-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 8px 3px 4px; border:1px solid ${theme.border};
    border-radius:999px; background:${theme.raised}; color:${theme.ink}; font-size:14px; }
  .colony-comms-chip-icon { display:inline-grid; place-items:center; width:24px; height:24px; font-size:16px; line-height:1; }
  .colony-comms-chip-icon svg { width:24px; height:24px; }
  .colony-comms-footer { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:center; padding:10px 14px;
    border-top:1px solid ${theme.divider}; }
  .colony-comms-meter-label { display:flex; justify-content:space-between; gap:8px; color:${theme.muted}; font-weight:700; }
  .colony-comms-meter-value { color:${theme.ink}; min-width:96px; text-align:right; }
  .colony-comms-meter { height:9px; margin-top:5px; overflow:hidden; background:${theme.sunken}; border:1px solid ${theme.divider}; border-radius:9px; }
  .colony-comms-meter > span { display:block; height:100%; background:${theme.mint}; transform-origin:left; transition:transform .18s ease-out; }
  .colony-comms-footer.is-full .colony-comms-meter > span { background:${theme.amber}; }
  .colony-comms-footer.is-full .colony-comms-meter-value { color:${theme.amber}; }
  .colony-comms-footer button { min-height:40px; padding:4px 16px; font-weight:800; }
  @media (prefers-reduced-motion: reduce) { .colony-comms-meter > span { transition:none; } }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.append(tag);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function ring(remaining, total) {
  const r = 40;
  const length = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('class', 'colony-comms-ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${plural(remaining, 'sol')} of ${total} remaining`);
  svg.innerHTML = `
    <circle cx="48" cy="48" r="${r}" fill="${theme.sunken}" stroke="${theme.divider}" stroke-width="8"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="${theme.amber}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${length.toFixed(2)}" stroke-dashoffset="${(length * (1 - fraction)).toFixed(2)}"
      transform="rotate(-90 48 48)"/>
    <text x="48" y="50" text-anchor="middle" font-size="28" fill="${theme.ink}">${remaining}</text>
    <text x="48" y="68" text-anchor="middle" font-size="12" fill="${theme.muted}">${remaining === 1 ? 'sol' : 'sols'}</text>`;
  return svg;
}

/**
 * Panel renderer. Helpers come from ResourceHud so the cards match the Base shop:
 *   button(label, onClick, { className, title, disabled }) · card(item, opts) · seedIcon(crop)
 */
export function createCommsPanel({ game, button, card, seedIcon }) {
  ensureStyles();
  const draft = new Set();

  function chip(data, id) {
    const crop = data.crops.find((entry) => entry.id === id) ?? { id, name: id };
    const node = el('span', 'colony-comms-chip');
    const icon = el('span', 'colony-comms-chip-icon');
    icon.setAttribute('aria-hidden', 'true');
    const glyph = seedIcon(crop);
    if (glyph instanceof Node) icon.append(glyph); else icon.textContent = glyph;
    node.append(icon, crop.name);
    return node;
  }

  function contents(data, items) {
    const list = el('div', 'colony-comms-contents');
    for (const id of items ?? []) list.append(chip(data, id));
    return list;
  }

  function action(label, onClick, opts = {}) {
    const node = button(label, onClick, opts);
    if (opts.focus) node.dataset.hudFocus = opts.focus;
    return node;
  }

  function crateBlock(scene, status) {
    const block = el('section', 'colony-comms-block is-alert');
    block.append(el('h3', '', 'Supply crate landed — collect it'));
    const landed = status.crate.landedSol != null ? ` on sol ${status.crate.landedSol}` : '';
    block.append(el('p', '', `It came down${landed} near the base. Collect it to add these seeds to your vault.`));
    block.append(contents(scene.dataSet, status.crate.items));
    const row = el('div', 'colony-comms-row');
    row.append(action('Show crate on map', () => locateCrate(scene), { focus: 'comms-locate', title: 'Centre the map on the crate and select it' }));
    row.append(action('Collect crate', () => scene.run({ type: 'collectCrate' }, false),
      { className: 'colony-comms-primary', focus: 'comms-collect' }));
    block.append(row);
    return block;
  }

  function outageBlock(scene, dish) {
    const { state } = scene.sim;
    const failure = dish && state.events.active.find(({ targetUid }) => targetUid === dish.uid);
    if (!failure) return null;
    const block = el('section', 'colony-comms-block is-alert');
    block.append(el('h3', '', 'Equipment outage'));
    block.append(el('p', '', `${failure.name ?? 'Outage'} · ${plural(Math.max(0, failure.until - state.sol), 'sol')} remaining. Orders wait until the dish is back.`));
    const row = el('div', 'colony-comms-row');
    row.append(action(`Repair with a spare part · ${state.res.spares} left`, () => scene.run({ type: 'repair', uid: dish.uid }),
      { disabled: !state.res.spares, focus: 'comms-outage' }));
    block.append(row);
    return block;
  }

  function brokenBlock(scene, status) {
    const { res } = scene.sim.state;
    const capacity = fmtKg(status.capacityKg);
    const powerW = Math.abs(scene.dataSet.buildings.find(({ id }) => id === 'comms')?.powerW ?? 0);
    const block = el('section', 'colony-comms-block');
    block.append(el('h3', '', 'Wrecked in the landing'));
    block.append(el('p', '', 'The dish took the worst of the crash. Until it is fixed, nothing gets to Earth and nothing comes back.'));
    const list = el('ul');
    list.append(el('li', '', `Seed orders: radio for up to ${capacity} of new seed. The drop lands ${status.deliverySols} sols later.`));
    list.append(el('li', '', 'Research downlink: send lab data home for science points.'));
    block.append(el('p', 'colony-comms-ok colony-comms-lead', 'Repairing it unlocks'), list);
    const credits = Math.floor(res.credits);
    const shortfall = Math.max(0, Math.ceil(status.repairCost - res.credits));
    const cost = el('div', 'colony-comms-cost');
    cost.append(el('span', '', `Repair · ${status.repairCost} kg build materials`), el('span', shortfall ? 'colony-comms-short' : '', `You have ${credits} kg`));
    block.append(cost);
    if (powerW) block.append(el('p', '', `Once repaired it draws ${powerW} W while online.`));
    const row = el('div', 'colony-comms-row');
    row.append(action(shortfall ? `Need ${shortfall} kg more` : `Repair dish · ${status.repairCost} kg`,
      () => scene.run({ type: 'repairComms' }, false),
      { className: 'colony-comms-primary', disabled: shortfall > 0, focus: 'comms-repair',
        title: shortfall ? `${shortfall} kg short of the ${status.repairCost} kg repair` : 'Spend build materials to repair the dish' }));
    block.append(row);
    return block;
  }

  function flightBlock(scene, status) {
    const { order, solsRemaining } = status;
    const block = el('section', 'colony-comms-block');
    const grid = el('div', 'colony-comms-flight');
    const copy = el('div');
    copy.append(el('div', 'colony-comms-big', `Supply drop in ${plural(solsRemaining, 'sol')}`));
    const mass = order.massKg != null ? ` · ${fmtKg(order.massKg)}` : '';
    copy.append(el('p', '', `Lands on sol ${order.arrivalSol}${mass}. Sent on sol ${order.placedSol ?? '?'}.`));
    copy.append(contents(scene.dataSet, order.items));
    grid.append(ring(solsRemaining, status.deliverySols), copy);
    block.append(grid);
    block.append(el('p', '', 'One order at a time. Storms do not delay a drop already in transit.'));
    block.lastChild.style.marginTop = '10px';
    return block;
  }

  function orderBlock(scene, status, catalog, panelNode) {
    const data = scene.dataSet;
    const orderable = catalog.filter((entry) => entry.orderable);
    for (const id of [...draft]) if (!orderable.some((entry) => entry.id === id)) draft.delete(id);
    const used = orderable.filter(({ id }) => draft.has(id)).reduce((sum, { packetKg }) => sum + packetKg, 0);
    const left = status.capacityKg - used + 1e-9;
    const fits = (entry) => entry.packetKg <= left;
    const full = used > 0 && !orderable.some((entry) => !draft.has(entry.id) && fits(entry));

    const block = el('section', 'colony-comms-block');
    block.append(el('h3', '', 'Seed order'));
    block.append(el('p', '', `Pick packets up to ${fmtKg(status.capacityKg)}. They land ${status.deliverySols} sols after you send. Orders are free.`));
    if (!status.online) {
      const note = el('p', 'colony-comms-warn', 'The dish is unpowered. Turn on Comms & science in Ops, or add power, before sending.');
      note.style.marginTop = '6px';
      block.append(note);
    }
    const owned = catalog.filter((entry) => entry.owned).map((entry) => entry.name);
    if (owned.length) block.append(el('p', 'colony-comms-lead', `Already in your vault (replant from harvest): ${owned.join(', ')}.`));
    const grid = el('div', 'colony-hud-item-grid');
    grid.style.marginTop = '10px';
    for (const entry of orderable) {
      const crop = data.crops.find(({ id }) => id === entry.id) ?? entry;
      const selected = draft.has(entry.id);
      const tooHeavy = !selected && !fits(entry);
      const meta = `${fmtKg(entry.packetKg)} packet · ${selected ? 'In order' : tooHeavy ? 'Will not fit' : 'Add'}`;
      const node = card({ ...crop, name: entry.name ?? crop.name }, { selected, locked: tooHeavy, icon: seedIcon(crop), meta,
        title: selected ? `Remove ${entry.name} from the order` : tooHeavy ? `${entry.name} does not fit in what is left` : `Add ${entry.name} to the order`,
        onClick: () => { if (draft.has(entry.id)) draft.delete(entry.id); else draft.add(entry.id); game().drawSide(); } });
      node.dataset.hudFocus = `comms-seed-${entry.id}`;
      grid.append(node);
    }
    block.append(grid);

    const footer = el('footer', `colony-comms-footer${full ? ' is-full' : ''}`);
    const meterBox = el('div');
    const label = el('div', 'colony-comms-meter-label');
    const value = el('span', 'colony-comms-meter-value', `${used.toFixed(2)} / ${status.capacityKg.toFixed(2)} kg`);
    label.append(el('span', '', full ? 'Order full' : 'Order mass'), value);
    const meter = el('div', 'colony-comms-meter');
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', 'Order mass');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', String(status.capacityKg));
    meter.setAttribute('aria-valuenow', used.toFixed(2));
    const fill = el('span');
    fill.style.transform = `scaleX(${status.capacityKg ? Math.min(1, used / status.capacityKg) : 0})`;
    meter.append(fill);
    meterBox.append(label, meter);
    const count = draft.size;
    const send = action(count ? `Send order · ${plural(count, 'packet')}` : 'Send order', () => {
      const items = orderable.filter(({ id }) => draft.has(id)).map(({ id }) => id);
      const result = scene.run({ type: 'orderSeeds', items }, false);
      if (result?.ok) draft.clear();
      scene.drawSide();
    }, { className: 'colony-comms-primary', disabled: !count || !status.online, focus: 'comms-send',
      title: !status.online ? 'The dish must be powered to send' : count ? 'Radio the order to Earth' : 'Add at least one packet' });
    footer.append(meterBox, send);
    panelNode.append(footer);
    return block;
  }

  /** Fill `content` (the panel body) and append any footer to `panelNode`. Returns the subtitle. */
  function render(content, panelNode) {
    const scene = game();
    const { sim, dataSet: data } = scene;
    const wrap = el('div', 'colony-comms');
    content.append(wrap);
    const dish = commsDish(sim);
    if (!dish) {
      wrap.append(el('p', '', 'There is no comms dish in the colony. Build one from Base › Support to order seeds.'));
      return 'No dish';
    }
    const status = commsStatusView(sim, data);
    const catalog = seedCatalogView(sim, data);
    if (status.crate) wrap.append(crateBlock(scene, status));
    const outage = outageBlock(scene, dish);
    if (outage) wrap.append(outage);
    if (!status.repaired) {
      wrap.append(brokenBlock(scene, status));
      return 'Broken · no link to Earth';
    }
    if (status.order) wrap.append(flightBlock(scene, status));
    else if (status.crate) {
      // The sim refuses a new order while a crate is still on the ground.
      wrap.append(el('p', '', 'Collect the crate, then you can radio the next order.'));
    } else if (!catalog.some((entry) => entry.orderable)) {
      const block = el('section', 'colony-comms-block');
      block.append(el('h3', '', 'Vault complete'));
      block.append(el('p', '', 'Every seed is in your vault. Replant from your harvests.'));
      wrap.append(block);
    } else wrap.append(orderBlock(scene, status, catalog, panelNode));
    const link = status.online ? 'Online · linked to Earth' : 'Repaired · unpowered';
    return status.order ? `${link} · drop in transit` : link;
  }

  return { render, clearDraft: () => draft.clear() };
}
