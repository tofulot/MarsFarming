// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { button, colors, heading, panel, targetBackground, text } from '../ui/controls.js';

export class BriefScene extends Phaser.Scene {
  constructor() { super('Brief'); }

  create(options) {
    targetBackground(this);
    const data = this.registry.get('missionData');
    heading(this, 'MISSION BRIEF', 'Choose your objective', 'Your objective determines how the mission is scored.');
    data.objectives.forEach((item, i) => {
      const x = 56 + 390 * i;
      panel(this, x, 202, 365, 238);
      text(this, x + 18, 227, item.name, 26, { fontStyle: 'bold' });
      text(this, x + 18, 282, item.description, 18, { wordWrap: { width: 320 }, color: colors.muted });
      const weights = Object.entries(item.weights).map(([name, value]) => `${name} ${value}%`).join('  ·  ');
      text(this, x + 18, 345, weights, 14, { color: colors.muted, wordWrap: { width: 320 } });
      button(this, x + 18, 390, 329, 34, options.objectiveId === item.id ? 'Selected' : 'Select objective',
        () => this.scene.restart({ ...options, objectiveId: item.id }), { selected: options.objectiveId === item.id });
    });
    text(this, 56, 478, 'Difficulty', 21, { fontStyle: 'bold' });
    Object.entries(data.difficulty).forEach(([id, value], i) => {
      button(this, 56 + i * 196, 516, 182, 46, `${id.toUpperCase()} · ${value.budget} kg`,
        options.demo ? null : () => this.scene.restart({ ...options, difficulty: id }), { selected: options.difficulty === id });
    });
    button(this, 56, 628, 130, 43, 'Back', () => this.scene.start('Title'));
    button(this, 950, 628, 250, 43, 'Choose landing site →', () => this.scene.start('Map', options), { selected: true });
  }
}
