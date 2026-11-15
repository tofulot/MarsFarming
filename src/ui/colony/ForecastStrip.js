// AI-assisted (Claude): DOM forecast strip with code-drawn weather icons and a selected-sol detail card.
import { createForecastViewModel, forecastDetailLines } from './forecastViewModel.js';

/** 24x24 stroke icons drawn in code; `currentColor` picks up the cell's icon colour. */
const iconPaths = {
  clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  haze: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2v1.5M2 9h1.5M4 4l1 1M14 4l-1 1M16 9h1.5"/><path d="M3 15h11M17 15h4M5 19h4M12 19h9"/>',
  cloud: '<path d="M7 17h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.8 10.4 3.3 3.3 0 0 0 7 17z"/><path d="M9 21h.01M13 21h.01M17 21h.01"/>',
  wind: '<path d="M9.8 4.4A2 2 0 1 1 11 8H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/>',
  devil: '<path d="M3 4h18M5 8h14M8 12h10M10 16h6M11 20h3"/>',
  fog: '<path d="M7 11h10a3.5 3.5 0 0 0 .3-7A4.6 4.6 0 0 0 8.4 5.2 3 3 0 0 0 7 11z"/><path d="M3 15h18M5 18.5h14M8 22h8"/>',
  snowWater: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5 12 5l2.5-1.5M9.5 20.5 12 19l2.5 1.5"/>',
  snowCo2: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M12 8.5l3 1.75v3.5L12 15.5l-3-1.75v-3.5z" fill="currentColor"/>',
  cold: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 11v7"/><path d="M17.5 5h3M17.5 9h3"/>',
  storm: '<path d="M4.5 13.5a3.5 3.5 0 0 1 2.7-5.9A5.5 5.5 0 0 1 17.6 8a3 3 0 0 1 2.4 5.5z"/><path d="M2.5 17.5h9M14.5 17.5h7M5 21h13"/><path d="M8 10.5h.01M13 11h.01" stroke-width="2.6"/>',
  space: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/><path d="M5.6 5.6h.01M18.4 5.6h.01M5.6 18.4h.01M18.4 18.4h.01" stroke-width="3"/>',
  unknown: '<path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15"/><path d="M12 19h.01"/>',
};
const iconKey = cell => (cell.tone === 'snow' ? cell.id : cell.tone);
function iconSvg(cell, size) {
  const paths = iconPaths[iconKey(cell)] ?? iconPaths.unknown;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const toneColors = {
  clear: '#3f5a70', haze: '#6e5340', cloud: '#4c6488', wind: '#3c6a66', devil: '#8a5833', fog: '#5b6f78',
  snow: '#6f879c', cold: '#38597e', space: '#6c4f88', unknown: '#6c625c',
};
const stormColors = ['#9a5a1a', '#9a5a1a', '#8c4416', '#742f10'];
const cellColor = cell => (cell.tone === 'storm' ? stormColors[cell.intensity] ?? stormColors[1] : toneColors[cell.tone] ?? toneColors.unknown);
const iconColor = cell => (cell.tone === 'storm' ? '#ffe1a0' : '#fff3e8');
const FROST = '#cfe3ff';

const selectedSol = scene => scene.forecastSelectedSol ?? scene.sim.state.sol;

function selectCell(scene, cell) {
  const pinned = scene.forecastPinnedSol === cell.sol;
  scene.forecastSelectedSol = cell.sol;
  scene.forecastPinnedSol = pinned ? null : cell.sol;
  scene.presentation?.refresh();
}

function el(tag, style = {}, text) {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function pipRow(cell, width = 6) {
  const pips = el('span', { display: 'flex', gap: '2px', height: '3px', flex: '0 0 auto' });
  if (cell.tone !== 'storm') return pips;
  for (let pipIndex = 1; pipIndex <= 3; pipIndex++) {
    pips.append(el('i', { display: 'block', width: `${width}px`, height: '3px', borderRadius: '2px',
      background: cell.intensity >= pipIndex ? '#ffe1a0' : '#ffffff40' }));
  }
  return pips;
}

/** Detail card for one sol, shown above the strip on hover or when a cell is clicked (pinned). */
function detailCard(scene, cell, { pinned, anchorX, rootWidth, gap }) {
  const width = 300;
  const card = el('div', {
    position: 'absolute', bottom: `calc(100% + ${gap}px)`, left: `${Math.max(0, Math.min(rootWidth - width, anchorX - width / 2))}px`,
    width: `${width}px`, boxSizing: 'border-box', padding: '9px 11px 10px', borderRadius: '8px',
    background: '#231614f2', border: `2px solid ${pinned ? '#ffe1a0' : '#6e4034'}`, boxShadow: '0 6px 18px #0009',
    color: '#f3e6dc', font: '600 12px system-ui, sans-serif', pointerEvents: pinned ? 'auto' : 'none',
  });
  card.dataset.weatherDetail = '';
  card.setAttribute('role', 'tooltip');

  const head = el('div', { display: 'flex', alignItems: 'center', gap: '9px' });
  const badge = el('span', { display: 'grid', placeItems: 'center', width: '34px', height: '34px', flex: '0 0 auto',
    borderRadius: '7px', background: cellColor(cell), color: iconColor(cell),
    backgroundImage: cell.tone === 'storm' ? 'repeating-linear-gradient(135deg, #ffffff18 0 5px, transparent 5px 10px)' : 'none' });
  badge.innerHTML = iconSvg(cell, 22);
  head.append(badge);
  const titles = el('div', { minWidth: '0', flex: '1 1 auto' });
  titles.append(el('div', { fontSize: '10px', letterSpacing: '1px', color: '#cdb8aa', textTransform: 'uppercase' },
    `Sol ${cell.sol} · ${cell.offset ? `in ${cell.offset} ${cell.offset === 1 ? 'sol' : 'sols'}` : 'today'}`));
  titles.append(el('div', { fontSize: '15px', fontWeight: '800', color: '#fff', lineHeight: '1.2' }, cell.label));
  head.append(titles);
  if (cell.tone === 'storm') head.append(pipRow(cell, 8));
  if (pinned) {
    const close = el('button', { pointerEvents: 'auto', alignSelf: 'flex-start', marginLeft: '2px', padding: '0 6px', height: '22px',
      border: '1px solid #6e4034', borderRadius: '5px', background: '#3a2623', color: '#f3e6dc', font: '700 13px system-ui', cursor: 'pointer' }, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close weather details');
    close.addEventListener('click', () => { scene.forecastPinnedSol = null; scene.presentation?.refresh(); });
    head.append(close);
  }
  card.append(head);

  const notes = [cell.secondary.length ? `Also ${cell.secondary.join(', ').toLowerCase()}` : null].filter(Boolean);
  for (const note of notes) card.append(el('div', { marginTop: '6px', color: '#cdb8aa', fontSize: '11px' }, note));
  if (cell.frostLabel) {
    const frost = el('div', { marginTop: '5px', display: 'flex', alignItems: 'center', gap: '5px', color: FROST, fontSize: '11px' });
    const flake = el('span', { display: 'inline-flex', color: FROST });
    flake.innerHTML = iconSvg({ tone: 'snow', id: 'snowWater' }, 12);
    frost.append(flake, cell.frostLabel);
    card.append(frost);
  }

  const { lines, effects } = forecastDetailLines(cell);
  if (lines.length) {
    const table = el('div', { display: 'grid', gridTemplateColumns: '64px 1fr', gap: '2px 8px', marginTop: '8px', fontSize: '12px' });
    for (const { key, value } of lines) {
      table.append(el('span', { color: '#cdb8aa', fontWeight: '600' }, key), el('span', { color: '#fff', fontWeight: '700' }, value));
    }
    card.append(table);
  }
  if (effects.length) {
    card.append(el('div', { marginTop: '8px', fontSize: '9px', letterSpacing: '1px', color: '#cdb8aa', textTransform: 'uppercase' },
      'Effect on the colony'));
    const row = el('div', { display: 'grid', gridTemplateColumns: `repeat(${effects.length}, 1fr)`, gap: '5px', marginTop: '4px' });
    for (const { key, value } of effects) {
      const tile = el('div', { padding: '4px 6px', borderRadius: '6px', background: '#1b1110', border: '1px solid #4a3330' });
      tile.append(el('div', { fontSize: '10px', color: '#cdb8aa' }, key), el('div', { fontSize: '14px', fontWeight: '800', color: '#fff' }, value));
      row.append(tile);
    }
    card.append(row);
  }
  if (!lines.length && !effects.length) {
    card.append(el('div', { marginTop: '6px', color: '#cdb8aa', fontSize: '11px' }, 'No detailed readings for this sol.'));
  }
  return card;
}

function syncWeatherBar(scene, model) {
  const canvas = scene.game.canvas;
  const parent = canvas?.parentElement;
  if (!canvas || !parent || typeof document === 'undefined') return;
  let root = parent.querySelector('[data-weather-forecast]');
  if (!root) {
    root = document.createElement('div');
    root.dataset.weatherForecast = '';
    root.setAttribute('role', 'group');
    parent.style.position = parent.style.position || 'relative';
    parent.append(root);
    const resize = () => scene.forecastModel && syncWeatherBar(scene, scene.forecastModel);
    scene.scale.on('resize', resize);
    scene.events.once('shutdown', () => { scene.scale.off('resize', resize); root.remove(); });
  }

  const active = root.querySelector('button:focus');
  const focusedSol = active?.dataset.sol;
  root.replaceChildren();
  root.setAttribute('aria-label', `${model.cells.length - 1} sol weather forecast`);

  const canvasBox = canvas.getBoundingClientRect();
  const parentBox = parent.getBoundingClientRect();
  const scaleX = canvasBox.width / 1280;
  const scaleY = canvasBox.height / 720;
  const left = canvasBox.left - parentBox.left + 20 * scaleX;
  const top = canvasBox.top - parentBox.top + 664 * scaleY;
  const width = Math.min(1240 * scaleX, parent.clientWidth - left - 12);
  const height = Math.max(36, 39 * scaleY);
  // Above the colony HUD root (z-index 30) so the detail card is never hidden under a panel or toast.
  Object.assign(root.style, {
    position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
    boxSizing: 'border-box', zIndex: '32', pointerEvents: 'none',
  });

  const bar = el('section', {
    display: 'flex', alignItems: 'center', gap: '6px', width: '100%', height: '100%',
    boxSizing: 'border-box', padding: '3px 6px', overflow: 'hidden', color: '#f3e6dc',
    background: '#231614', border: '2px solid #6e4034', borderRadius: '6px',
    font: '600 12px system-ui, sans-serif', pointerEvents: 'auto',
  });
  bar.setAttribute('aria-label', 'Weather forecast strip');

  const info = el('div', { display: 'flex', flex: '0 0 auto', alignItems: 'center', gap: '6px', minWidth: '0' });
  info.append(el('strong', { fontSize: '11px', letterSpacing: '1px', color: '#e8d5c8' }, 'WEATHER'));
  const chip = el('span', {
    display: 'block', minWidth: '0', maxWidth: `${Math.max(150, 214 * scaleX)}px`, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px',
    background: model.chip.storm ? '#8c4a16' : '#3f5a70', color: '#fff', fontWeight: '700', fontSize: '11px',
  }, model.chip.text);
  chip.dataset.weatherChip = '';
  chip.title = model.chip.text;
  info.append(chip);
  bar.append(info);

  const selected = model.cells.find(cell => cell.sol === selectedSol(scene)) ?? model.cells[0];
  const readout = el('span', {
    display: 'block', flex: '0 1 200px', minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', color: '#cdb8aa', fontSize: '11px',
  }, [selected.slotLabel, selected.label,
    selected.outsideTempC !== undefined ? `${Math.round(selected.outsideTempC)} °C` : null,
    selected.sunPct !== undefined ? `sun ${selected.sunPct}%` : null].filter(Boolean).join(' · '));
  readout.setAttribute('aria-live', 'polite');
  bar.append(readout);

  const timeline = el('div', {
    display: 'flex', flex: '1 1 auto', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', minWidth: '0',
    height: '100%', overflow: 'hidden',
  });
  const cellWidth = Math.max(36, 47 * scaleX);
  const cellHeight = Math.max(28, height - 8);
  const iconSize = Math.max(13, Math.min(18, cellHeight - 13));
  const buttons = new Map();
  for (const cell of model.cells) {
    const isSelected = cell.sol === selectedSol(scene);
    const button = el('button', {
      // Cells shrink to fit so the current sol never scrolls out of view when the chip is long.
      flex: '1 1 0', minWidth: '0', maxWidth: `${cellWidth}px`, height: `${cellHeight}px`, boxSizing: 'border-box',
      padding: '1px 1px 4px', borderRadius: '4px', position: 'relative',
      border: isSelected ? '2px solid #ffe1a0' : '1px solid #ffffff25',
      backgroundColor: cellColor(cell),
      backgroundImage: [
        cell.overnightFrost ? `linear-gradient(225deg, ${FROST} 0 4px, transparent 4px)` : null,
        cell.tone === 'storm' ? 'repeating-linear-gradient(135deg, #ffffff18 0 5px, transparent 5px 10px)' : null,
      ].filter(Boolean).join(', ') || 'none',
      color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      font: '700 10px system-ui, sans-serif', lineHeight: '10px', cursor: 'pointer', overflow: 'hidden',
    });
    button.type = 'button';
    button.dataset.sol = String(cell.sol);
    button.dataset.tone = cell.tone;
    button.setAttribute('aria-label', `${cell.ariaLabel}${cell.frostLabel ? `, ${cell.frostLabel.toLowerCase()}` : ''}`);
    button.setAttribute('aria-pressed', String(isSelected));
    button.append(el('span', {}, cell.slotLabel));
    const size = cell.tone === 'storm' ? iconSize - 4 : iconSize;
    const icon = el('span', { display: 'flex', color: iconColor(cell), height: `${size}px`, marginTop: '1px' });
    icon.innerHTML = iconSvg(cell, size);
    const pips = pipRow(cell);
    Object.assign(pips.style, { position: 'absolute', bottom: '2px', left: '50%', transform: 'translateX(-50%)' });
    button.append(icon, pips);
    button.addEventListener('click', () => selectCell(scene, cell));
    timeline.append(button);
    buttons.set(cell.sol, button);
  }
  bar.append(timeline);
  root.append(bar);

  let card = null;
  const showDetail = (sol, pinned) => {
    card?.remove();
    card = null;
    const cell = model.cells.find(item => item.sol === sol);
    const button = buttons.get(sol);
    if (!cell || !button) return;
    const buttonBox = button.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    card = detailCard(scene, cell, { pinned, anchorX: buttonBox.left - rootBox.left + buttonBox.width / 2,
      rootWidth: rootBox.width, gap: 6 });
    root.append(card);
  };
  const restore = () => {
    const pinnedSol = model.cells.some(cell => cell.sol === scene.forecastPinnedSol) ? scene.forecastPinnedSol : null;
    if (scene.forecastHoverSol !== undefined && scene.forecastHoverSol !== null) showDetail(scene.forecastHoverSol, scene.forecastHoverSol === pinnedSol);
    else if (pinnedSol !== null) showDetail(pinnedSol, true);
    else { card?.remove(); card = null; }
  };
  const hover = (sol) => {
    if (scene.forecastHoverSol === sol) return;
    scene.forecastHoverSol = sol;
    restore();
  };
  timeline.addEventListener('pointerover', event => {
    const button = event.target.closest?.('button[data-sol]');
    if (button) hover(Number(button.dataset.sol));
  });
  timeline.addEventListener('focusin', event => {
    const button = event.target.closest?.('button[data-sol]');
    if (button) hover(Number(button.dataset.sol));
  });
  timeline.addEventListener('pointerleave', () => hover(null));
  timeline.addEventListener('focusout', () => hover(null));
  restore();

  scene.forecastModel = model;
  if (focusedSol !== undefined) timeline.querySelector(`button[data-sol="${CSS.escape(focusedSol)}"]`)?.focus();
}

export function drawForecastStrip(scene) {
  const model = createForecastViewModel(scene.sim.getWeather(), scene.sim.forecastWeather(15), scene.sim.state.sol);
  syncWeatherBar(scene, model);
}
