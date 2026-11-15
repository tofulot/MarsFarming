import Phaser from 'phaser';
import { createResourceHud } from '../ui/colony/ResourceHud.js';

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }
  create({ sim, foodPerCrew }) {
    const game = this.scene.get('Colony');
    this.hud = createResourceHud(this, sim, foodPerCrew);
    game.hud = this.hud;
    game.drawSide();
    game.onHudReady?.();
    game.onHudReady = null;
    const updatePanel = () => {
      this.hud.refresh();
      if (game.activePanel === 'goals' || game.activePanel === 'ops') this.hud.renderPanel();
    };
    const unsubscribe = ['sol', 'purchase', 'harvest', 'advancement', 'crop:plant', 'rationing:change', 'power:loads']
      .map(event => sim.on(event, updatePanel));
    this.events.once('shutdown', () => {
      unsubscribe.forEach(stop => stop());
      if (game.hud === this.hud) game.hud = null;
    });
  }
  update() { this.hud?.refresh(); }
}
