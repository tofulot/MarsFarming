// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { button, colors, targetBackground, text } from '../ui/controls.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    targetBackground(this);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1d131a).fillCircle(1030, 320, 283);
    graphics.fillStyle(0x51262b).fillCircle(1030, 320, 238);
    graphics.fillStyle(0xbe5945).fillCircle(1030, 320, 209);
    graphics.fillStyle(0x823b37, .7).fillEllipse(990, 250, 290, 94);
    graphics.fillEllipse(1126, 385, 189, 70);
    graphics.fillStyle(0xe27f5a, .55).fillEllipse(960, 376, 215, 91);
    graphics.lineStyle(1, colors.line).lineBetween(68, 628, 1210, 628);
    text(this, 68, 117, 'MARS GREENHOUSE MISSION', 18, { color: '#ff805a', fontStyle: 'bold' });
    text(this, 65, 152, 'Red\nHarvest', 112, { fontStyle: 'bold', lineSpacing: -22 });
    text(this, 69, 412, 'Pack a lander. Grow food on Mars.\nKeep four crew alive through dust season.', 25,
      { color: colors.muted, lineSpacing: 7 });
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    button(this, 69, 532, 243, 55, demo ? 'Launch demo' : 'Design a mission',
      () => this.scene.start('Brief', { demo, difficulty: 'medium', objectiveId: 'feed' }), { selected: true });
    text(this, 69, 650, 'MISSION DESIGN  /  SURFACE OPERATIONS  /  DEBRIEF', 14, { color: colors.muted });
  }
}
