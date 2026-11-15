// AI-assisted (Cursor)
import Phaser from 'phaser';
import { button, colors, targetBackground, text } from '../ui/controls.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    targetBackground(this);
    const g = this.add.graphics();

    // Layered Mars sky / ground atmosphere
    g.fillStyle(0x140f13).fillRect(0, 0, 1280, 720);
    g.fillStyle(0x2a1718, 0.9).fillRect(0, 0, 1280, 360);
    g.fillStyle(0x3d1f1c, 0.55).fillEllipse(640, 420, 1400, 280);
    g.fillStyle(0x4a2420, 0.5).fillEllipse(200, 650, 560, 200);
    g.fillStyle(0x5c2e28, 0.4).fillEllipse(700, 700, 980, 240);
    g.fillStyle(0x3d1c1a, 0.48).fillEllipse(1100, 660, 520, 180);

    // Distant Mars disc
    const mars = this.add.container(1040, 300);
    const disc = this.add.graphics();
    disc.fillStyle(0x2a1518).fillCircle(0, 0, 250);
    disc.fillStyle(0x6b322c).fillCircle(0, 0, 220);
    disc.fillStyle(0xc45a42).fillCircle(0, 0, 198);
    disc.fillStyle(0x8a3d35, 0.65).fillEllipse(-40, -55, 260, 90);
    disc.fillStyle(0x8a3d35, 0.5).fillEllipse(70, 40, 170, 70);
    disc.fillStyle(0xe27f5a, 0.4).fillEllipse(-55, 50, 200, 85);
    disc.fillStyle(0xf0c9a0, 0.12).fillCircle(-70, -80, 40);
    mars.add(disc);
    this.tweens.add({
      targets: mars, y: 308, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    for (let i = 0; i < 18; i++) {
      const mote = this.add.circle(
        80 + Math.random() * 700,
        120 + Math.random() * 400,
        1 + Math.random() * 1.8,
        0xf5dfbd,
        0.15 + Math.random() * 0.25,
      );
      this.tweens.add({
        targets: mote,
        x: mote.x + 30 + Math.random() * 40,
        alpha: { from: mote.alpha, to: 0.05 },
        duration: 2800 + Math.random() * 2200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    g.lineStyle(1, 0x7a4a40, 0.35).lineBetween(68, 500, 560, 500);

    const brand = text(this, 68, 108, 'RED HARVEST', 18, {
      color: '#e8a07a', fontStyle: 'bold',
    }).setAlpha(0);
    const title = text(this, 64, 138, 'Grow the\noutpost.', 78, {
      fontStyle: 'bold', lineSpacing: -10, color: '#fff2dd',
    }).setAlpha(0);
    const blurb = text(this, 69, 340, 'Stranded on Mars. Plant, power, and breed\nyour way to rescue — one sol at a time.', 22, {
      color: colors.muted, lineSpacing: 6,
    }).setAlpha(0);

    this.tweens.add({ targets: brand, alpha: 1, duration: 500, delay: 80 });
    this.tweens.add({ targets: title, alpha: 1, y: 148, duration: 650, delay: 160, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: blurb, alpha: 1, duration: 550, delay: 320 });

    const demo = new URLSearchParams(location.search).get('demo') === '1';
    const options = { demo, difficulty: 'medium', rescue: true };
    const start = button(this, 69, 532, 243, 55, 'Start survival', () => {
      const data = this.registry.get('missionData');
      const seed = demo ? data.balance.demoSeed : Math.floor(Math.random() * 2 ** 32);
      this.scene.start('Colony', { ...options, siteId: 'gale', seed });
    }, { selected: true });
    const map = button(this, 327, 532, 215, 55, 'Choose landing site', () => this.scene.start('Map', options));
    for (const part of [start.box, start.copy, map.box, map.copy]) part.setAlpha(0);
    this.tweens.add({ targets: [start.box, start.copy, map.box, map.copy], alpha: 1, duration: 450, delay: 480 });
  }
}
