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
    text(this, 68, 117, 'MARS SURVIVAL', 18, { color: '#ff805a', fontStyle: 'bold' });
    text(this, 65, 152, 'Red\nHarvest', 112, { fontStyle: 'bold', lineSpacing: -22 });
    text(this, 69, 412, 'You’re stranded on Mars.\nGrow enough food to make it to rescue.', 25,
      { color: colors.muted, lineSpacing: 7 });
    const demo = new URLSearchParams(location.search).get('demo') === '1';
    const options = { demo, difficulty: 'medium', rescue: true };
    button(this, 69, 532, 243, 55, 'Start survival', () => {
      const data = this.registry.get('missionData');
      const seed = demo ? data.balance.demoSeed : Math.floor(Math.random() * 2 ** 32);
      this.scene.start('Colony', { ...options, siteId: 'gale', seed });
    }, { selected: true });
    button(this, 327, 532, 215, 55, 'Choose landing site', () => this.scene.start('Map', options));
  }
}
