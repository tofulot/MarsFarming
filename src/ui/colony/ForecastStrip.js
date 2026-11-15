import { label, plate } from './widgets.js';
import { createForecastViewModel } from './forecastViewModel.js';

const palette = {
  frame: 0x6e4034, panel: 0x231614, inset: 0x44312d,
  clear: 0x3f5a70, cold: 0x607c86, space: 0x73568c, unknown: 0x6c625c,
  storm: [0, 0x9a5a1a, 0x8c4a16, 0x7a3512],
  text: '#f3e6dc', muted: '#cdb8aa', label: '#e8d5c8', outline: 0xffe1a0,
  clearIcon: 0xffd98a, stormIcon: 0xffe1a0, stormReadout: '#ffb766', clearReadout: '#9fd0f2',
};
const left = 100;
const cellWidth = 49;
const cellGap = 2;
const step = cellWidth + cellGap;
const cellTop = 81;
const cellHeight = 52;

function cellColor(cell) {
  if (cell.tone === 'storm') return palette.storm[cell.intensity] ?? palette.storm[1];
  return palette[cell.tone] ?? palette.unknown;
}

function drawHatch(scene, group, x, y, width, height, color = 0xffffff, alpha = 0.18) {
  const graphics = scene.add.graphics().setDepth(22);
  graphics.lineStyle(4, color, alpha);
  for (let offset = -height; offset < width; offset += 12) {
    const startX = Math.max(0, offset);
    const endX = Math.min(width, offset + height);
    if (endX <= startX) continue;
    const startY = height - (startX - offset);
    const endY = height - (endX - offset);
    graphics.lineBetween(x + startX, y + startY, x + endX, y + endY);
  }
  group.add(graphics);
}

function addIcon(scene, group, key, x, y, size, tint) {
  if (!scene.textures.exists(key)) return null;
  const icon = scene.add.image(x, y, key).setDisplaySize(size, size).setTint(tint).setDepth(23);
  group.add(icon);
  return icon;
}

function renderNarrowForecast(root, scene, model, scaleX, scaleY, canvasBox, parentBox) {
  const hadFocus = root.contains(document.activeElement);
  root.replaceChildren();
  Object.assign(root.style, { pointerEvents: 'none' });
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Weather forecast strip');
  Object.assign(panel.style, {
    position: 'absolute', left: `${canvasBox.left - parentBox.left + 20 * scaleX}px`,
    top: `${canvasBox.top - parentBox.top + 43 * scaleY}px`,
    width: `${Math.min(930 * scaleX, scene.game.canvas.parentElement.clientWidth - 32)}px`,
    boxSizing: 'border-box', padding: '5px', color: '#f3e6dc', background: '#231614',
    border: '2px solid #3f5a70', borderRadius: '7px', font: '600 12px system-ui, sans-serif',
    pointerEvents: 'auto', zIndex: '6',
  });
  const row = (display = 'flex') => {
    const element = document.createElement('div');
    Object.assign(element.style, { display, alignItems: 'center', gap: '6px' });
    return element;
  };
  const header = row();
  const title = document.createElement('strong');
  title.textContent = 'WEATHER';
  title.style.letterSpacing = '1.2px';
  header.append(title);
  const chip = document.createElement('span');
  Object.assign(chip.style, { marginLeft: '4px', padding: '3px 7px', borderRadius: '999px',
    display: 'inline-flex', alignItems: 'center', gap: '5px', background: model.chip.storm ? '#8c4a16' : '#3f5a70', color: '#fff', fontWeight: '700' });
  const chipIcon = document.createElement('img');
  chipIcon.src = `${import.meta.env.BASE_URL}assets/weather/${model.chip.storm ? 'sandstorm' : 'sun'}.svg`;
  Object.assign(chipIcon.style, { width: '14px', height: '14px', filter: 'brightness(0) invert(1)' });
  chip.append(chipIcon, document.createTextNode(model.chip.text));
  header.append(chip);
  const legend = row();
  Object.assign(legend.style, { marginLeft: 'auto', color: '#e8d5c8', gap: '7px' });
  for (const [asset, name] of [['sun.svg', 'Clear'], ['sandstorm.svg', 'Sandstorm']]) {
    const item = row();
    const icon = document.createElement('img');
    icon.src = `${import.meta.env.BASE_URL}assets/weather/${asset}`;
    Object.assign(icon.style, { width: '16px', height: '16px', filter: 'brightness(0) saturate(100%) invert(91%) sepia(27%) saturate(727%) hue-rotate(322deg) brightness(104%)' });
    item.append(icon, document.createTextNode(name));
    legend.append(item);
  }
  const intensity = row();
  const pipsLegend = row();
  for (let i = 0; i < 3; i++) {
    const pip = document.createElement('i');
    Object.assign(pip.style, { width: '8px', height: '4px', display: 'block', borderRadius: '2px', background: i < 2 ? '#ffe1a0' : '#ffffff47' });
    pipsLegend.append(pip);
  }
  intensity.append(pipsLegend, document.createTextNode('Intensity'));
  legend.append(intensity);
  header.append(legend);

  const scroll = document.createElement('div');
  Object.assign(scroll.style, { overflowX: 'auto', marginTop: '4px', paddingBottom: '0', width: '100%' });
  const rows = document.createElement('div');
  Object.assign(rows.style, { display: 'grid', gridTemplateColumns: '42px repeat(16, 44px)', gap: '3px', width: 'max-content' });
  const dayLabel = document.createElement('span');
  dayLabel.textContent = 'DAY';
  dayLabel.style.color = '#cdb8aa';
  rows.append(dayLabel);
  model.cells.forEach(cell => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', cell.ariaLabel);
    button.setAttribute('aria-pressed', String((scene.forecastSelectedSol ?? scene.sim.state.sol) === cell.sol));
    Object.assign(button.style, {
      width: '44px', height: '40px', padding: '2px', border: (scene.forecastSelectedSol ?? scene.sim.state.sol) === cell.sol ? '2px solid #ffe1a0' : '0',
      borderRadius: '6px', color: '#fff', backgroundColor: cellColor(cell) === palette.clear ? '#3f5a70' : `#${cellColor(cell).toString(16).padStart(6, '0')}`,
      backgroundImage: cell.tone === 'storm' ? 'repeating-linear-gradient(135deg, #ffffff18 0 6px, transparent 6px 12px)' : 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      font: '700 11px system-ui, sans-serif', cursor: 'pointer', flexShrink: '0',
    });
    const day = document.createElement('span');
    day.textContent = cell.slotLabel;
    const icon = cell.tone === 'clear' || cell.tone === 'storm' ? document.createElement('img') : document.createElement('span');
    if (icon.tagName === 'IMG') {
      icon.src = `${import.meta.env.BASE_URL}assets/weather/${cell.tone === 'clear' ? 'sun' : 'sandstorm'}.svg`;
      Object.assign(icon.style, { width: '16px', height: '16px', filter: 'brightness(0) saturate(100%) invert(89%) sepia(45%) saturate(612%) hue-rotate(319deg) brightness(106%)' });
    } else icon.textContent = cell.icon;
    const pips = row();
    for (let index = 1; index <= 3; index++) {
      const pip = document.createElement('i');
      Object.assign(pip.style, { display: 'block', width: '5px', height: '3px', borderRadius: '2px',
        background: cell.tone === 'storm' && cell.intensity >= index ? '#ffe1a0' : '#ffffff47' });
      pips.append(pip);
    }
    button.append(day, icon, pips);
    button.addEventListener('click', () => selectCell(scene, cell));
    rows.append(button);
  });
  scroll.append(rows);

  const ribbon = document.createElement('div');
  Object.assign(ribbon.style, { display: 'grid', gridTemplateColumns: '42px repeat(16, 44px)', gap: '3px',
    width: 'max-content', marginTop: '2px', height: '18px', alignItems: 'center' });
  const eventsLabel = document.createElement('span');
  eventsLabel.textContent = 'EVENTS';
  eventsLabel.style.color = '#cdb8aa';
  ribbon.append(eventsLabel);
  for (const span of model.spans) {
    const segment = document.createElement('span');
    const copy = span.tone === 'storm'
      ? span.len >= 3 ? `Sandstorm · ${span.len} sols` : span.len === 1 ? 'Storm' : 'Sandstorm'
      : span.tone === 'clear' ? (span.len >= 2 ? 'Clear' : '') : span.tone === 'cold' ? 'Cold' : span.tone === 'space' ? 'SPE' : '?';
    segment.textContent = copy;
    Object.assign(segment.style, { gridColumn: `${span.start + 2} / span ${span.len}`, height: '16px',
      minWidth: '0', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'center',
      borderRadius: '15px', color: span.tone === 'storm' ? '#fff' : '#cdb8aa',
      border: span.tone === 'clear' ? '1px dashed #e8d5c855' : '1px solid transparent',
      backgroundColor: span.tone === 'storm' ? `#${palette.storm[span.peak].toString(16)}` : 'transparent',
      backgroundImage: span.tone === 'storm' ? 'repeating-linear-gradient(135deg, #ffffff18 0 6px, transparent 6px 12px)' : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center' });
    ribbon.append(segment);
  }
  const updateRibbonLabels = () => {
    const bounds = scroll.getBoundingClientRect();
    for (const segment of ribbon.children) {
      const box = segment.getBoundingClientRect();
      const center = box.left + box.width / 2;
      segment.style.visibility = center >= bounds.left + 4 && center <= bounds.right - 4 ? 'visible' : 'hidden';
    }
  };
  scroll.addEventListener('scroll', updateRibbonLabels);

  const selected = model.cells.find(cell => cell.sol === (scene.forecastSelectedSol ?? scene.sim.state.sol)) ?? model.cells[0];
  const readout = row();
  Object.assign(readout.style, { marginTop: '3px', height: '20px', padding: '0 7px', borderRadius: '6px', background: '#ffffff12' });
  readout.setAttribute('aria-live', 'polite');
  const when = document.createElement('strong');
  when.textContent = selected.offset ? `In ${selected.offset} ${selected.offset === 1 ? 'sol' : 'sols'}` : 'Now';
  const condition = document.createElement('strong');
  condition.textContent = selected.label;
  condition.style.color = selected.tone === 'storm' ? '#ffb766' : '#9fd0f2';
  readout.append(when, condition);
  if (Number.isFinite(selected.windSpeedMps)) readout.append(document.createTextNode(`Wind ${selected.windSpeedMps.toFixed(0)} m/s`));
  if (Number.isFinite(selected.solarOutputPct)) readout.append(document.createTextNode(`Solar availability ${selected.solarOutputPct}%`));
  scroll.append(ribbon);
  panel.append(header, scroll, readout);
  root.append(panel);
  updateRibbonLabels();
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '15 sol weather forecast');
  if (hadFocus) panel.querySelector(`button[aria-label="${CSS.escape(selected.ariaLabel)}"]`)?.focus();
}

function syncAccessibleControls(scene, model) {
  const canvas = scene.game.canvas;
  const parent = canvas?.parentElement;
  if (!canvas || !parent || typeof document === 'undefined') return;
  let root = parent.querySelector('[data-forecast-controls]');
  if (!root) {
    root = document.createElement('div');
    root.dataset.forecastControls = '';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', '15 sol weather forecast');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '5' });
    parent.style.position = parent.style.position || 'relative';
    parent.append(root);
    const resize = () => scene.forecastModel && syncAccessibleControls(scene, scene.forecastModel);
    scene.scale.on('resize', resize);
    scene.events.once('shutdown', () => { scene.scale.off('resize', resize); root.remove(); });
  }
  const canvasBox = canvas.getBoundingClientRect();
  const parentBox = parent.getBoundingClientRect();
  const scaleX = canvasBox.width / 1280;
  const scaleY = canvasBox.height / 720;
  if (canvasBox.width < 900) {
    renderNarrowForecast(root, scene, model, scaleX, scaleY, canvasBox, parentBox);
    return;
  }
  const hadFocus = root.contains(document.activeElement);
  root.replaceChildren();
  model.cells.forEach(cell => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = cell.slotLabel;
    button.setAttribute('aria-label', cell.ariaLabel);
    button.setAttribute('aria-pressed', String((scene.forecastSelectedSol ?? scene.sim.state.sol) === cell.sol));
    button.title = `${cell.ariaLabel}. ${cell.label}. Solar availability ${cell.solarOutputPct ?? 'unavailable'} percent.`;
    Object.assign(button.style, {
      position: 'absolute', boxSizing: 'border-box', left: `${canvasBox.left - parentBox.left + (left + cell.offset * step) * scaleX}px`,
      top: `${canvasBox.top - parentBox.top + cellTop * scaleY}px`, width: `${cellWidth * scaleX}px`, height: `${cellHeight * scaleY}px`,
      minWidth: '12px', minHeight: '12px', padding: '0', border: '0', background: 'transparent',
      color: 'transparent', font: '12px Arial, sans-serif', cursor: 'pointer', pointerEvents: 'none',
    });
    button.addEventListener('focus', () => {
      button.style.pointerEvents = 'auto';
      button.style.color = '#fff1df';
      button.style.background = '#3f5a70';
      button.style.outline = '2px solid #ffd17a';
      button.style.zIndex = '2';
    });
    button.addEventListener('blur', () => {
      button.style.pointerEvents = 'none';
      button.style.color = 'transparent';
      button.style.background = 'transparent';
      button.style.outline = 'none';
    });
    button.addEventListener('click', () => selectCell(scene, cell));
    root.append(button);
  });
  let live = root.querySelector('[aria-live]');
  if (!live) {
    live = document.createElement('span');
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
    root.append(live);
  }
  const selected = model.cells.find(cell => cell.sol === (scene.forecastSelectedSol ?? scene.sim.state.sol)) ?? model.cells[0];
  live.textContent = `${selected.ariaLabel}. ${selected.label}. Solar availability ${selected.solarOutputPct ?? 'unavailable'} percent.`;
  if (hadFocus) [...root.querySelectorAll('button')].find(button =>
    button.getAttribute('aria-label') === selected.ariaLabel)?.focus();
}

function selectCell(scene, cell) {
  scene.forecastSelectedSol = cell.sol;
  scene.presentation?.refresh();
}

function drawLegend(scene, group) {
  addIcon(scene, group, 'weather-sun', 702, 61, 15, palette.clearIcon);
  label(scene, group, 714, 55, 'Clear', 14, { color: palette.label });
  addIcon(scene, group, 'weather-sandstorm', 764, 61, 16, palette.stormIcon);
  label(scene, group, 778, 55, 'Sandstorm', 14, { color: palette.label });
  for (let pip = 0; pip < 3; pip++) {
    const pipGraphic = scene.add.rectangle(853 + pip * 10, 61, 8, 4,
      pip < 2 ? palette.outline : 0xffffff, pip < 2 ? 1 : 0.28).setOrigin(0.5).setDepth(23);
    group.add(pipGraphic);
  }
  label(scene, group, 883, 55, 'Intensity', 14, { color: palette.label });
}

function drawRibbon(scene, group, spans) {
  label(scene, group, 34, 138, 'EVENTS', 13, { color: palette.muted, fontStyle: 'bold' });
  for (const span of spans) {
    const x = left + span.start * step;
    const width = span.len * step - cellGap;
    const fill = span.tone === 'storm' ? palette.storm[span.peak] : span.tone === 'clear' ? palette.panel : cellColor(span);
    const box = scene.add.rectangle(x + width / 2, 145, width, 23, fill).setOrigin(0.5).setDepth(21);
    if (span.tone === 'clear') box.setStrokeStyle(1, 0xe8d5c8, 0.35, 1, true);
    else box.setStrokeStyle(1, fill, 1, 1, true);
    group.add(box);
    if (span.tone === 'storm') drawHatch(scene, group, x + 1, 134, width - 2, 22, 0xffffff, 0.13);
    const copy = span.tone === 'storm'
      ? span.len >= 3 ? `Sandstorm · ${span.len} sols` : span.len === 1 ? 'Storm' : 'Sandstorm'
      : span.tone === 'clear' ? (span.len >= 2 ? 'Clear' : '')
        : span.tone === 'cold' ? 'Cold' : span.tone === 'space' ? 'SPE' : '?';
    if (copy) label(scene, group, x + width / 2, 140, copy, 13, {
      align: 'center', color: span.tone === 'storm' ? '#ffffff' : palette.muted, fontStyle: 'bold',
    }).setOrigin(0.5, 0);
  }
}

export function drawForecastStrip(scene, group) {
  const { sim } = scene;
  const model = createForecastViewModel(sim.getWeather(), sim.forecastWeather(15), sim.state.sol);
  syncAccessibleControls(scene, model);
  if (scene.game.canvas.getBoundingClientRect().width < 900) {
    scene.forecastModel = model;
    return;
  }

  plate(scene, group, 20, 43, 930, 143, palette.frame, 1);
  plate(scene, group, 26, 49, 918, 131, palette.panel, 1);
  label(scene, group, 35, 54, 'WEATHER', 15, { color: palette.label, fontStyle: 'bold', letterSpacing: 1.5 });

  const chip = scene.add.rectangle(267, 61, Math.min(270, 93 + model.chip.text.length * 5.1), 20,
    model.chip.storm ? 0x8c4a16 : palette.clear).setOrigin(0.5).setDepth(22);
  chip.setStrokeStyle(1, model.chip.storm ? 0xb76a27 : 0x557895, 0.7);
  group.add(chip);
  const chipIconKey = model.chip.storm ? 'weather-sandstorm' : 'weather-sun';
  addIcon(scene, group, chipIconKey, chip.x - chip.width / 2 + 13, chip.y, 13, palette.stormIcon);
  label(scene, group, chip.x - chip.width / 2 + 24, chip.y - 7, model.chip.text, 13, {
    color: '#ffffff', fontStyle: 'bold',
  });
  drawLegend(scene, group);

  label(scene, group, 34, 89, 'DAY', 13, { color: palette.muted, fontStyle: 'bold', letterSpacing: 1 });
  model.cells.forEach(cell => {
    const x = left + cell.offset * step;
    const selected = (scene.forecastSelectedSol ?? sim.state.sol) === cell.sol;
    const box = scene.add.rectangle(x + cellWidth / 2, cellTop + cellHeight / 2, cellWidth, cellHeight,
      cellColor(cell)).setOrigin(0.5).setDepth(21);
    box.setStrokeStyle(selected ? 2 : 0, palette.outline, selected ? 1 : 0);
    group.add(box);
    if (cell.tone === 'storm' || cell.tone === 'space') drawHatch(scene, group, x + 1, cellTop + 1, cellWidth - 2, cellHeight - 2, 0xffffff, 0.16);
    label(scene, group, x + cellWidth / 2, cellTop + 4, cell.slotLabel, 14, {
      align: 'center', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5, 0);
    if (cell.tone === 'clear') addIcon(scene, group, 'weather-sun', x + cellWidth / 2, cellTop + 29, 23, palette.clearIcon);
    else if (cell.tone === 'storm') addIcon(scene, group, 'weather-sandstorm', x + cellWidth / 2, cellTop + 29, 23, palette.stormIcon);
    else label(scene, group, x + cellWidth / 2, cellTop + 23, cell.icon, 11, {
      align: 'center', color: '#ffe1a0', fontStyle: 'bold',
    }).setOrigin(0.5);
    for (let pip = 1; pip <= 3; pip++) {
      const on = cell.tone === 'storm' && cell.intensity >= pip;
      const marker = scene.add.rectangle(x + 11 + (pip - 1) * 10, cellTop + 47, 8, 3,
        on ? palette.outline : 0xffffff, on ? 1 : 0.28).setOrigin(0.5).setDepth(23);
      group.add(marker);
    }
    box.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => selectCell(scene, cell))
      .on('pointerover', (pointer) => {
        scene.colonyTooltip?.destroy();
        scene.colonyTooltip = scene.add.text(pointer.x + 10, pointer.y + 10,
          `${cell.ariaLabel}\n${cell.label} · solar availability ${cell.solarOutputPct ?? 'n/a'}%`, {
            fontFamily: 'Arial', fontSize: 12, color: '#fff1df', backgroundColor: '#38221d',
            padding: { x: 7, y: 5 },
          }).setDepth(250).setScrollFactor(0);
      })
      .on('pointerout', () => { scene.colonyTooltip?.destroy(); scene.colonyTooltip = null; });
  });

  drawRibbon(scene, group, model.spans);
  const selected = model.cells.find(cell => cell.sol === (scene.forecastSelectedSol ?? sim.state.sol)) ?? model.cells[0];
  const readout = scene.add.rectangle(488, 167, 884, 25, palette.inset).setDepth(21);
  group.add(readout);
  const when = selected.offset === 0 ? 'Now' : `In ${selected.offset} ${selected.offset === 1 ? 'sol' : 'sols'}`;
  label(scene, group, 43, 160, when, 14, { color: palette.text, fontStyle: 'bold' });
  label(scene, group, 123, 160, selected.label, 14, {
    color: selected.tone === 'storm' ? palette.stormReadout : palette.clearReadout, fontStyle: 'bold',
  });
  let detailX = 123 + Math.max(100, selected.label.length * 7.3);
  if (Number.isFinite(selected.windSpeedMps)) {
    label(scene, group, detailX, 160, `Wind ${selected.windSpeedMps.toFixed(0)} m/s`, 14, { color: palette.muted });
    detailX += 135;
  }
  if (Number.isFinite(selected.solarOutputPct)) {
    label(scene, group, detailX, 160, `Solar availability ${selected.solarOutputPct}%`, 14, { color: palette.muted });
  }

  scene.forecastModel = model;
}
