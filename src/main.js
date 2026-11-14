// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { BriefScene } from './scenes/BriefScene.js';
import { MapScene } from './scenes/MapScene.js';
import { ManifestScene } from './scenes/ManifestScene.js';
import { ColonyScene } from './scenes/ColonyScene.js';
import { UIScene } from './scenes/UIScene.js';
import { ReportScene } from './scenes/ReportScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#140f13',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, BriefScene, MapScene, ManifestScene, ColonyScene, UIScene, ReportScene],
});
