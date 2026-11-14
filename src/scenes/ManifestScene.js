// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { checkManifest, manifestCatalog } from '../sim/design.js';
import { button, colors, heading, panel, targetBackground, text } from '../ui/controls.js';

export class ManifestScene extends Phaser.Scene {
  constructor() { super('Manifest'); }

  create(options) {
    targetBackground(this);
    const data = this.registry.get('missionData');
    const landerId = options.landerId ?? 'condor';
    const items = options.manifest ?? (options.demo ? { iceDrill: 1, washer: 1, solar: 1, plot: 2, battery: 1 } : {});
    const budget = data.difficulty[options.difficulty].budget;
    const check = checkManifest(data, { landerId, items, budget, siteId: options.siteId });
    const lander = data.landers.find(({ id }) => id === landerId);
    const restart = (changes) => this.scene.restart({ ...options, landerId, manifest: items, ...changes });
    heading(this, 'MISSION DESIGN / CARGO', 'Pack your lander', 'What you spend here comes out of your surface operating budget.');
    data.landers.forEach((entry, i) => button(this, 56 + i * 386, 183, 365, 50,
      `${entry.name}  ·  ${entry.capacityKg} kg  ·  ${entry.cost} cr`, () => restart({ landerId: entry.id }),
      { selected: entry.id === landerId }));
    manifestCatalog(data).forEach((item, i) => {
      const x = 56 + 386 * (i % 3);
      const y = 252 + 49 * Math.floor(i / 3);
      const qty = items[item.id] ?? 0;
      const set = (count) => restart({ manifest: { ...items, [item.id]: count } });
      panel(this, x, y, 365, 41);
      text(this, x + 9, y + 3, item.name, 15);
      text(this, x + 9, y + 22, `${item.massKg} kg  ·  ${item.cost} cr`, 12, { color: colors.muted });
      button(this, x + 245, y + 5, 34, 30, '−', qty > 0 ? () => set(qty - 1) : null);
      text(this, x + 296, y + 9, String(qty), 16).setOrigin(.5, 0);
      button(this, x + 315, y + 5, 37, 30, '+', () => set(qty + 1));
    });
    const status = `${check.massKg}/${lander.capacityKg} kg   ·   ${check.cost}/${budget} cr   ·   ${Math.round(check.startPower)} W starter generation`;
    text(this, 56, 558, status, 20, { color: check.ok ? '#9bd8ae' : '#ff937a' });
    text(this, 56, 588, check.ok ? 'Launch check passed. Values are for gameplay.' : check.reasons.join(' '), 16,
      { color: colors.muted, wordWrap: { width: 1120 } });
    const flight = { ...options, landerId, manifest: items, seed: options.demo ? data.balance.demoSeed : Math.floor(Math.random() * 2 ** 32) };
    button(this, 56, 645, 130, 40, 'Back', () => this.scene.start('Map', { ...options, landerId, manifest: items }));
    button(this, 950, 645, 250, 40, 'Launch mission →', check.ok ? () => this.scene.start('Colony', flight) : null,
      { selected: check.ok });
  }
}
