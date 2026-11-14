// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { button, colors, heading, panel, targetBackground, text } from '../ui/controls.js';

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  create(options) {
    targetBackground(this);
    const data = this.registry.get('missionData');
    const selected = data.sites.find(({ id }) => id === options.siteId) ?? data.sites[0];
    heading(this, 'MISSION DESIGN / LANDING SITE', 'Pick a site on Mars', 'Compare access to ice, sunlight, temperature and soil.');
    const map = { x: 56, y: 195, w: 720, h: 386 };
    panel(this, map.x, map.y, map.w, map.h, 0x351d24);
    const grid = this.add.graphics().lineStyle(1, 0x65414b, .65);
    for (let i = 1; i < 12; i++) grid.lineBetween(map.x + i * 60, map.y, map.x + i * 60, map.y + map.h);
    for (let i = 1; i < 6; i++) grid.lineBetween(map.x, map.y + i * map.h / 6, map.x + map.w, map.y + i * map.h / 6);
    text(this, map.x + 18, map.y + 14, 'COORDINATE MAP', 14, { color: '#eaaa95' });
    data.sites.forEach((site, i) => {
      const x = map.x + site.mapX * map.w;
      const y = map.y + site.mapY * map.h;
      const pin = this.add.circle(x, y, 7, selected.id === site.id ? colors.accent : colors.mint);
      const rowY = 202 + i * 39;
      button(this, 807, rowY, 393, 34, site.name, () => this.scene.restart({ ...options, siteId: site.id }),
        { selected: selected.id === site.id });
      pin.setInteractive({ useHandCursor: true }).on('pointerup', () => this.scene.restart({ ...options, siteId: site.id }));
    });
    panel(this, 807, 445, 393, 136);
    const lon = selected.lon < 0 ? 'W' : 'E';
    const lat = selected.lat < 0 ? 'S' : 'N';
    const coordLabel = selected._game_location ? 'Demo location' : selected._src_coords;
    text(this, 821, 456, `${Math.abs(selected.lat)}°${lat}, ${Math.abs(selected.lon)}°${lon}   ·   ${coordLabel}`, 16);
    const ratings = Object.entries(selected.stars).map(([name, rating]) => `${name} ${rating}/5`).join('  ·  ');
    text(this, 821, 484, ratings, 15, { color: '#9bd8ae' });
    text(this, 821, 515, selected.why, 15, { color: colors.muted, wordWrap: { width: 357 } });
    text(this, 821, 557, 'Site ratings are game values.', 12, { color: colors.muted });
    button(this, 56, 628, 130, 43, 'Back', () => this.scene.start('Brief', options));
    button(this, 950, 628, 250, 43, 'Pack lander →', () => this.scene.start('Manifest', { ...options, siteId: selected.id }), { selected: true });
  }
}
