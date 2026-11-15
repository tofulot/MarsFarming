import { createForecastViewModel } from './forecastViewModel.js';

const stormColors = ['#3f5a70', '#9a5a1a', '#8c4a16', '#7a3512'];
const iconUrl = (name) => `${import.meta.env.BASE_URL}assets/weather/${name}.svg`;

function cellColor(cell) {
  if (cell.tone === 'storm') return stormColors[cell.intensity] ?? stormColors[1];
  if (cell.tone === 'clear') return '#3f5a70';
  if (cell.tone === 'cold') return '#607c86';
  if (cell.tone === 'space') return '#73568c';
  return '#6c625c';
}

function selectCell(scene, cell) {
  scene.forecastSelectedSol = cell.sol;
  scene.presentation?.refresh();
}

function addIcon(parent, name, size, tone = 'sun') {
  const image = document.createElement('img');
  image.src = iconUrl(name);
  image.alt = '';
  Object.assign(image.style, {
    width: `${size}px`, height: `${size}px`, flex: '0 0 auto',
    filter: tone === 'storm'
      ? 'brightness(0) saturate(100%) invert(89%) sepia(45%) saturate(612%) hue-rotate(319deg) brightness(106%)'
      : 'brightness(0) saturate(100%) invert(91%) sepia(27%) saturate(727%) hue-rotate(322deg) brightness(104%)',
  });
  parent.append(image);
  return image;
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
  root.setAttribute('aria-label', '15 sol weather forecast');

  const canvasBox = canvas.getBoundingClientRect();
  const parentBox = parent.getBoundingClientRect();
  const scaleX = canvasBox.width / 1280;
  const scaleY = canvasBox.height / 720;
  const left = canvasBox.left - parentBox.left + 20 * scaleX;
  const top = canvasBox.top - parentBox.top + 664 * scaleY;
  const width = Math.min(1240 * scaleX, parent.clientWidth - left - 12);
  const height = Math.max(36, 39 * scaleY);
  Object.assign(root.style, {
    position: 'absolute', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
    boxSizing: 'border-box', zIndex: '18', pointerEvents: 'none',
  });

  const bar = document.createElement('section');
  bar.setAttribute('aria-label', 'Weather forecast strip');
  Object.assign(bar.style, {
    display: 'flex', alignItems: 'center', gap: '6px', width: '100%', height: '100%',
    boxSizing: 'border-box', padding: '3px 6px', overflow: 'hidden', color: '#f3e6dc',
    background: '#231614', border: '2px solid #6e4034', borderRadius: '6px',
    font: '600 12px system-ui, sans-serif', pointerEvents: 'auto',
  });

  const info = document.createElement('div');
  Object.assign(info.style, { display: 'flex', flex: '0 0 auto', alignItems: 'center', gap: '6px', minWidth: '0', maxWidth: `${Math.max(152, 206 * scaleX)}px` });
  const title = document.createElement('strong');
  title.textContent = 'WEATHER';
  Object.assign(title.style, { fontSize: '11px', letterSpacing: '1px', color: '#e8d5c8' });
  info.append(title);
  const chip = document.createElement('span');
  const chipText = model.chip.storm ? model.chip.text : model.chip.text.toLowerCase().includes('uncertain')
    ? 'Forecast uncertain' : model.chip.text;
  chip.textContent = chipText;
  Object.assign(chip.style, {
    display: 'block', minWidth: '0', maxWidth: `${Math.max(110, 146 * scaleX)}px`, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 7px', borderRadius: '999px',
    background: model.chip.storm ? '#8c4a16' : '#3f5a70', color: '#fff', fontWeight: '700', fontSize: '11px',
  });
  info.append(chip);
  bar.append(info);

  const selected = model.cells.find(cell => cell.sol === (scene.forecastSelectedSol ?? scene.sim.state.sol)) ?? model.cells[0];
  const readout = document.createElement('span');
  readout.setAttribute('aria-live', 'polite');
  readout.textContent = `${selected.slotLabel} · ${selected.label}${Number.isFinite(selected.solarOutputPct) ? ` · ${selected.solarOutputPct}% solar` : ''}`;
  Object.assign(readout.style, {
    display: 'block', flex: '0 1 190px', minWidth: '86px', overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', color: '#cdb8aa', fontSize: '11px',
  });
  bar.append(readout);

  const timeline = document.createElement('div');
  Object.assign(timeline.style, {
    display: 'flex', flex: '1 1 auto', alignItems: 'center', gap: '3px', minWidth: '0',
    height: '100%', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin',
  });
  const cellWidth = Math.max(39, 54 * scaleX);
  const cellHeight = Math.max(28, height - 8);
  for (const cell of model.cells) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sol = String(cell.sol);
    button.setAttribute('aria-label', cell.ariaLabel);
    button.setAttribute('aria-pressed', String(cell.sol === (scene.forecastSelectedSol ?? scene.sim.state.sol)));
    button.title = `${cell.ariaLabel}. ${cell.label}${Number.isFinite(cell.solarOutputPct) ? ` · solar availability ${cell.solarOutputPct}%` : ''}.`;
    Object.assign(button.style, {
      flex: `0 0 ${cellWidth}px`, width: `${cellWidth}px`, height: `${cellHeight}px`, boxSizing: 'border-box',
      padding: '2px 1px', borderRadius: '4px',
      border: cell.sol === (scene.forecastSelectedSol ?? scene.sim.state.sol) ? '2px solid #ffe1a0' : '1px solid #ffffff25',
      backgroundColor: cellColor(cell),
      backgroundImage: cell.tone === 'storm' ? 'repeating-linear-gradient(135deg, #ffffff18 0 5px, transparent 5px 10px)' : 'none',
      color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      font: '700 10px system-ui, sans-serif', cursor: 'pointer',
    });
    const day = document.createElement('span');
    day.textContent = cell.slotLabel;
    button.append(day);
    if (cell.tone === 'clear' || cell.tone === 'storm') {
      addIcon(button, cell.tone === 'clear' ? 'sun' : 'sandstorm', Math.max(12, Math.min(17, cellHeight - 13)), cell.tone);
    } else {
      const marker = document.createElement('span');
      marker.textContent = cell.icon;
      Object.assign(marker.style, { fontSize: '9px', lineHeight: '10px' });
      button.append(marker);
    }
    const pips = document.createElement('span');
    Object.assign(pips.style, { display: 'flex', gap: '2px', height: '3px' });
    for (let pipIndex = 1; pipIndex <= 3; pipIndex++) {
      const pip = document.createElement('i');
      Object.assign(pip.style, {
        display: 'block', width: '6px', height: '3px', borderRadius: '2px',
        background: cell.tone === 'storm' && cell.intensity >= pipIndex ? '#ffe1a0' : '#ffffff40',
      });
      pips.append(pip);
    }
    button.append(pips);
    button.addEventListener('click', () => selectCell(scene, cell));
    timeline.append(button);
  }
  bar.append(timeline);
  root.append(bar);
  scene.forecastModel = model;
  if (focusedSol !== undefined) timeline.querySelector(`button[data-sol="${CSS.escape(focusedSol)}"]`)?.focus();
}

export function drawForecastStrip(scene) {
  const model = createForecastViewModel(scene.sim.getWeather(), scene.sim.forecastWeather(15), scene.sim.state.sol);
  syncWeatherBar(scene, model);
}
