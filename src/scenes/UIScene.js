// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { colors, formatUnits, panel, text } from '../ui/controls.js';

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create({ sim }) {
    panel(this, 0, 0, 1280, 78, 0x21161d);
    const cards = [
      ['SOL / SEASON', (s) => `${s.sol}/${s.solLimit} · ${s.season} · ${Math.floor(s.Ls)}°`],
      ['CREDITS / CARGO', (s) => `${fmt(s.res.credits, 'credits')} / ${fmt(s.res.massUsed, 'mass')}`],
      ['POWER IN / NEEDED', (s) => `${fmt(s.power.gen)} / ${fmt(s.power.demand, 'power')}`],
      ['WATER / FOOD', (s) => `${fmt(s.res.waterL, 'water')} / ${fmt(s.res.foodKg, 'food')}`],
      ['SATIETY / DIET', (s) => `${Math.round((s.crew.satiety ?? 0) * 100)}% / ${Math.round((s.crew.nutrition ?? 0) * 100)}%`],
      ['CREW / DOSE', (s) => `${Math.round(s.crew.health * 100)}% / ${fmt(s.crew.dose_mSv, 'dose')}`],
    ];
    const fmt = (value, kind) => formatUnits(value, kind, sim.state.difficulty);
    const labels = cards.map(([label], i) => {
      const x = 25 + 210 * i;
      text(this, x, 14, label, 12, { color: colors.muted, fontStyle: 'bold' });
      return text(this, x, 36, '', 18, { fontStyle: 'bold' });
    });
    const extra = text(this, 735, 92, '', 14, { color: colors.muted });
    const refresh = (state) => {
      cards.forEach(([, get], i) => labels[i].setText(get(state)));
      const kinds = Object.keys(state.res.pantry ?? {}).length;
      extra.setText(`Battery ${fmt(state.res.batteryWh, 'battery')}  ·  Pantry crops ${kinds}  ·  SP ${state.res.sp}  ·  Shed ${state.power.shed.length}`);
    };
    refresh(sim.state);
    const unsubscribe = [sim.on('sol', refresh), sim.on('harvest', () => refresh(sim.state))];
    this.events.once('shutdown', () => unsubscribe.forEach((fn) => fn()));
  }
}
