// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { dustOpacity } from '../weather/dustClimatology.js';
import { landingWeatherDifficulty } from '../weather/redHarvest.js';
import { button, colors, panel, text, targetBackground } from '../ui/controls.js';
import { clearSolarFactor } from '../sim/insolation.js';
import { landingSite, normalizedNeutronFlux } from '../sim/marsMap.js';

const map = { x: 76, y: 173, w: 864, h: 432 };
const hydrogen = [[32, 52, 78], [37, 130, 163], [95, 231, 244]];
const sunlight = 0xffd88a;
const features = [
  ['Arcadia Planitia', 44, -151], ['Olympus Mons', 19, -132], ['Valles Marineris', -13, -61],
  ['Hellas Planitia', -43, 70], ['Utopia Planitia', 49, 121], ['Elysium Planitia', 4, 151],
  ['Arabia Terra', 25, 32], ['Noachis Terra', -51, 16],
];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const angle = (n, positive, negative) => n === 0 ? '0°' : `${Math.abs(n)}°${n > 0 ? positive : negative}`;
const coordinates = ({ lat, lon }) =>
  `${angle(Number(lat.toFixed(1)), 'N', 'S')}  /  ${angle(Number(lon.toFixed(1)), 'E', 'W')}`;

function hydrogenColor(flux) {
  const colorIndex = 2 * clamp((1 - flux) / 0.85, 0, 1);
  const low = Math.min(1, Math.floor(colorIndex));
  return hydrogen[low].map((value, i) => Math.round(value
    + (hydrogen[low + 1][i] - value) * (colorIndex - low)));
}

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create(options) {
    targetBackground(this);
    this.dataSet = this.registry.get('missionData');
    this.flux = this.dataSet['neutron-flux'];
    this.dustSeason = 2;
    this.layers = { hydrogen: false, solar: false, weather: false };
    this.view = { zoom: 1, x: .5, y: .5 };
    this.site = options.site ?? null;
    this.drag = null;

    text(this, 56, 33, 'RED HARVEST  /  LANDING SITE', 14, { color: '#ff9f7c', fontStyle: 'bold' });
    text(this, 53, 58, 'Choose your landing site', 43, { fontStyle: 'bold' });
    text(this, 56, 121, 'Click anywhere to land. Drag to pan and scroll to zoom.', 17, { color: colors.muted });
    panel(this, 74, 171, 868, 436, 0x291d20);
    const texture = this.textures.createCanvas('mars-map-view', map.w, map.h);
    this.events.once('shutdown', () => this.textures.remove('mars-map-view'));
    this.atlas = this.add.image(map.x, map.y, texture.key).setOrigin(0).setInteractive({ useHandCursor: true });
    this.overlay = document.createElement('canvas');
    this.overlay.width = 360;
    this.overlay.height = 180;
    const ctx = this.overlay.getContext('2d');
    const rgba = ctx.createImageData(360, 180);
    for (let y = 0; y < 180; y++) {
      for (let x = 0; x < 360; x++) {
        const rgb = hydrogenColor(normalizedNeutronFlux(this.flux, 89.5 - y, x - 179.5));
        rgba.data.set([...rgb, 199], (y * 360 + x) * 4);
      }
    }
    ctx.putImageData(rgba, 0, 0);

    this.atlas.on('pointerdown', (p) => {
      this.drag = { x: p.x, y: p.y, viewX: this.view.x, viewY: this.view.y, moved: false };
    });
    this.input.on('pointermove', (p) => {
      if (!p.isDown || !this.drag) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (Math.hypot(dx, dy) > 5) this.drag.moved = true;
      if (!this.drag.moved || this.view.zoom === 1) return;
      this.view.x = this.drag.viewX - dx / (map.w * this.view.zoom);
      this.view.y = this.drag.viewY - dy / (map.h * this.view.zoom);
      this.drawMap();
    });
    this.input.on('pointerup', (p) => {
      if (this.drag && !this.drag.moved && Phaser.Geom.Rectangle.Contains(
        new Phaser.Geom.Rectangle(map.x, map.y, map.w, map.h), p.x, p.y)) {
        const { zoom, x, y } = this.view;
        const lat = 90 - 180 * (y + ((p.y - map.y) / map.h - .5) / zoom);
        const lon = 360 * (x + ((p.x - map.x) / map.w - .5) / zoom) - 180;
        this.site = landingSite(clamp(lat, -90, 90), clamp(lon, -180, 180), this.flux);
        this.drawMap();
        this.drawSite(options);
      }
      this.drag = null;
    });
    this.input.on('pointerupoutside', () => { this.drag = null; });
    this.atlas.on('wheel', (p, dx, dy) => this.zoomBy(dy < 0 ? 1.4 : 1 / 1.4, p.x, p.y));
    button(this, 804, 120, 39, 34, '−', () => this.zoomBy(1 / 1.4));
    button(this, 850, 120, 39, 34, '+', () => this.zoomBy(1.4));
    button(this, 896, 120, 46, 34, '1×', () => {
      this.view = { zoom: 1, x: .5, y: .5 };
      this.drawMap();
    });

    panel(this, 964, 171, 260, 436, 0x22191e);
    this.layerUi = this.add.group();
    this.siteUi = this.add.group();
    this.drawLayers(options);
    this.drawSite(options);
    this.drawMap();
    button(this, 56, 645, 116, 40, 'Back', () => this.scene.start('Brief', { ...options, site: this.site }));
    text(this, 192, 655, 'Terrain: NASA MOLA · Hydrogen: NASA HEND · Dust: LMD / Montabone et al. (CC BY-SA 3.0)',
      13, { color: colors.muted });
  }

  zoomBy(multiplier, screenX = map.x + map.w / 2, screenY = map.y + map.h / 2) {
    const { view } = this;
    const before = view.zoom;
    view.zoom = clamp(before * multiplier, 1, 5);
    view.x += ((screenX - map.x) / map.w - .5) * (1 / before - 1 / view.zoom);
    view.y += ((screenY - map.y) / map.h - .5) * (1 / before - 1 / view.zoom);
    this.drawMap();
  }

  drawMap() {
    const { view, atlas } = this;
    const half = .5 / view.zoom;
    view.x = clamp(view.x, half, 1 - half);
    view.y = clamp(view.y, half, 1 - half);
    const left = view.x - half;
    const top = view.y - half;
    const xAt = (lon) => ((lon + 180) / 360 - left) * view.zoom * map.w;
    const yAt = (lat) => ((90 - lat) / 180 - top) * view.zoom * map.h;
    const ctx = atlas.texture.getContext();
    const draw = (img) => ctx.drawImage(img, left * img.width, top * img.height,
      img.width / view.zoom, img.height / view.zoom, 0, 0, map.w, map.h);
    draw(this.textures.get('mars-terrain').getSourceImage());
    if (this.layers.hydrogen) draw(this.overlay);
    if (this.layers.solar) {
      // Dot coverage communicates relative solar potential while leaving the heatmap visible.
      ctx.fillStyle = '#ffd88a';
      for (let y = 4; y < map.h; y += 8) {
        const lat = 90 - (top + y / (map.h * view.zoom)) * 180;
        const size = Math.cos(lat * Math.PI / 180) * 2.5;
        for (let x = y % 16 ? 4 : 0; x < map.w; x += 8) ctx.fillRect(x, y, size, size);
      }
    }
    if (this.layers.weather) {
      const frame = this.dataSet.dustClimatology.frames[this.dustSeason];
      ctx.strokeStyle = '#ffb3eb';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      for (let y = 7; y < map.h - 7; y += 12) {
        const lat = 90 - (top + y / (map.h * view.zoom)) * 180;
        for (let x = 7; x < map.w - 7; x += 12) {
          const lon = (left + x / (map.w * view.zoom)) * 360 - 180;
          const opacity = dustOpacity(frame, lat, lon);
          const size = 0.7 + 4.5 * clamp((opacity - 0.05) / 0.35, 0, 1);
          ctx.moveTo(x - size, y + size);
          ctx.lineTo(x + size, y - size);
        }
      }
      ctx.stroke();
    }
    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffe8d4';
    ctx.strokeStyle = '#ffe8d442';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spacing = view.zoom >= 2.6 ? 15 : 30;
    for (let lon = -180 + spacing; lon < 180; lon += spacing) {
      const x = xAt(lon);
      if (x < 8 || x > map.w - 37) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.h);
      ctx.fillText(angle(lon, 'E', 'W'), x + 4, map.h - 9);
    }
    for (let lat = -90 + spacing; lat < 90; lat += spacing) {
      const y = yAt(lat);
      if (y < 6 || y > map.h - 18) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(map.w, y);
      ctx.fillText(angle(lat, 'N', 'S'), 6, y - 4);
    }
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '600 14px system-ui';
    ctx.strokeStyle = '#21171c';
    ctx.lineWidth = 3;
    for (const [label, lat, lon] of features) {
      const x = xAt(lon), y = yAt(lat);
      if (x < 56 || x > map.w - 56 || y < 16 || y > map.h - 24) continue;
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    }
    ctx.textAlign = 'left';

    if (this.site) {
      const x = xAt(this.site.lon), y = yAt(this.site.lat);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff8e4';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, 2 * Math.PI);
      ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
      ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
      ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
      ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
      ctx.stroke();
    }
    atlas.texture.refresh();
  }

  drawLayers(options) {
    const group = this.layerUi;
    group.clear(true, true);
    const say = (...args) => {
      const label = text(this, ...args);
      group.add(label);
      return label;
    };
    say(984, 188, 'MAP LAYERS & KEY', 14, { color: '#ff9f7c', fontStyle: 'bold' });
    const toggle = (id, label, y) => {
      const on = this.layers[id];
      const control = button(this, 984, y, 220, 33, `${label} · ${on ? 'ON' : 'OFF'}`, () => {
        this.layers[id] = !on;
        this.drawLayers(options);
        this.drawMap();
      }, { selected: on, size: id === 'hydrogen' ? 13 : 14 });
      group.addMultiple([control.box, control.copy]);
    };
    toggle('hydrogen', 'Hydrogen (possible water)', 214);
    for (let i = 0; i < 44; i++) {
      const [r, g, b] = hydrogenColor(1 - .85 * i / 43);
      group.add(this.add.rectangle(984 + 5 * i, 253, 5, 7, (r << 16) | (g << 8) | b).setOrigin(0));
    }
    say(984, 266, 'Bright cyan · Stronger hydrogen signal', 12, { color: colors.muted });

    toggle('solar', 'Solar potential', 295);
    for (let i = 0; i < 28; i++) {
      const size = .4 + 2.1 * i / 27;
      group.add(this.add.rectangle(986 + 8 * i, 337, size, size, sunlight));
    }
    say(984, 346, 'Denser gold · More equinox sunlight', 12, { color: colors.muted });

    toggle('weather', 'Weather difficulty', 374);
    say(984, 413, 'Longer marks · More dust, less sunlight', 12, { color: colors.muted });
    say(984, 435, 'North', 11, { color: colors.muted, fontStyle: 'bold' });
    say(984, 449, 'South', 11, { color: colors.muted, fontStyle: 'bold' });
    const seasons = this.dataSet.seasons.seasonNamesNorth;
    this.dataSet.dustClimatology.frames.forEach((_, i) => {
      const label = `${seasons[i]}\n${seasons[(i + 2) % 4]}`;
      const control = button(this, 1021 + i * 47, 431, 44, 35, label, () => {
        this.dustSeason = i;
        this.layers.weather = true;
        this.drawLayers(options);
        this.drawMap();
        this.drawSite(options);
      }, { selected: this.layers.weather && i === this.dustSeason, size: 11 });
      group.addMultiple([control.box, control.copy]);
    });
    say(984, 469, 'Each column shows both seasons at once.', 11, { color: colors.muted });
    group.add(this.add.rectangle(984, 485, 220, 1, colors.line).setOrigin(0));
  }

  drawSite(options) {
    const group = this.siteUi;
    group.clear(true, true);
    group.add(text(this, 984, 494, 'LANDING TARGET', 14, { color: '#ff9f7c', fontStyle: 'bold' }));
    group.add(text(this, 984, 517, this.site ? coordinates(this.site) : 'Select a point on Mars', 18, { fontStyle: 'bold' }));
    if (this.site) {
      const flux = normalizedNeutronFlux(this.flux, this.site.lat, this.site.lon);
      const sun = clearSolarFactor(this.site.lat, 0, this.dataSet.seasons.orbit);
      const equator = clearSolarFactor(0, 0, this.dataSet.seasons.orbit);
      const { seasonalLow } = landingWeatherDifficulty(this.dataSet.weather.temperatureModel, this.site.lat);
      const frame = this.dataSet.dustClimatology.frames[this.dustSeason];
      const opacity = dustOpacity(frame, this.site.lat, this.site.lon);
      const season = this.dataSet.seasons.seasonNamesNorth[(this.dustSeason + (this.site.lat < 0 ? 2 : 0)) % 4];
      group.add(text(this, 984, 541, `Neutron flux    ${(flux * .26).toFixed(3)} counts/s\nSun ${Math.round(100 * sun / equator)}% of equator · Cold low ~${Math.round(seasonalLow)} °C\n${season} dust · ${opacity.toFixed(2)} IR optical depth`, 13,
        { color: colors.muted, lineSpacing: 5 }));
    }
    const action = button(this, 964, 645, 260, 40, 'Land and establish base →', this.site ? () => {
      const seed = options.demo ? this.dataSet.balance.demoSeed : Math.floor(Math.random() * 2 ** 32);
      this.scene.start('Colony', { ...options, seed, site: this.site });
    } : null, { selected: Boolean(this.site), size: 16 });
    group.addMultiple([action.box, action.copy]);
  }
}
