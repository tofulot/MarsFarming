// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
// Bundled fonts (SIL OFL 1.1, see README credits): display + body pair from src/ui/theme.js.
import '@fontsource/amatic-sc/400.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/patrick-hand/400.css';
import { fontBody, fontDisplay } from './ui/theme.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { MapScene } from './scenes/MapScene.js';
import { ColonyScene } from './scenes/ColonyScene.js';
import { UIScene } from './scenes/UIScene.js';
import { ReportScene } from './scenes/ReportScene.js';
import { CutsceneScene } from './scenes/CutsceneScene.js';

// Static CSS (index.html dialogs) reads the same stacks through custom properties.
document.documentElement.style.setProperty('--font-display', fontDisplay);
document.documentElement.style.setProperty('--font-body', fontBody);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#150d0c', // matches colors.background in src/ui/controls.js
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, MapScene, CutsceneScene, ColonyScene, UIScene, ReportScene],
});
