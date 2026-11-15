// Resource HUD kept separate from the colony board and interaction panels.
import Phaser from 'phaser';
import { createResourceHud } from '../ui/colony/ResourceHud.js';

export class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }
  create({ sim, foodPerCrew }) {
    const hud = createResourceHud(this, sim, foodPerCrew);
    const unsubscribe = ['sol', 'purchase', 'harvest', 'advancement', 'crop:plant'].map(event => sim.on(event, hud.refresh));
    this.events.once('shutdown', () => {
      unsubscribe.forEach(stop => stop());
    });
  }
}
