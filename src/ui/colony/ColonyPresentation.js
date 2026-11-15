import { CropLayer } from '../../rendering/CropLayer.js';
import { WeatherLayer } from '../../rendering/WeatherLayer.js';
import { createMarsTerrain } from '../../rendering/marsTerrain.js';
import { drawActionDock } from './ActionDock.js';
import { drawForecastStrip } from './ForecastStrip.js';
import { colonyLayout } from './layout.js';
import { action } from './widgets.js';

export class ColonyPresentation {
  constructor(scene) {
    this.scene = scene;
    this.plants = [];
    this.previews = [];
    createMarsTerrain(scene);
    this.group = scene.add.group();
    const { width, height } = colonyLayout;
    this.nightShade = scene.add.rectangle(0, 0, width, height, 0x24263d).setOrigin(0).setDepth(17).setAlpha(0);
    this.dayGlow = scene.add.rectangle(0, 0, width, height, 0xffc58d).setOrigin(0).setDepth(17).setAlpha(0);
    this.cropLayer = new CropLayer(scene);
    this.weatherLayer = new WeatherLayer(scene);
    scene.add.rectangle(10, 10, 1260, 702).setOrigin(0).setFillStyle(0, 0)
      .setStrokeStyle(2, 0xd19d7d, 0.65).setDepth(200);
  }
  setPlants(plants) {
    this.plants = plants;
    this.cropLayer.sync([...this.plants, ...this.previews]);
  }
  refresh() {
    this.group.clear(true, true);
    this.previews = drawActionDock(this.scene, this.group);
    const { sim } = this.scene;
    const weather = sim.getWeather();
    drawForecastStrip(this.scene, this.group, weather);
    this.weatherLayer.setWeather(weather, sim.forecastWeather(1).days[0]);
    this.cropLayer.sync([...this.plants, ...this.previews]);
  }
  finishDetails() {
    const scene = this.scene;
    if (!scene.sideLayer.getLength()) return;
    const layout = scene.detailsLayout ?? { x: 800, y: 188, width: 460 };
    const close = action(scene, scene.sideLayer, layout.x + layout.width - 106, layout.y + 9, 96, 23, 'Close', () => {
      scene.selected = null;
      scene.activePanel = null;
      scene.showTimers = false;
      scene.showAdvancements = false;
      scene.showShopDetails = false;
      scene.drawSide();
      scene.refreshGrid();
    });
    close.setDepth(100);
    scene.sideLayer.children.iterate(child => child.setDepth(100));
  }
  update(time, progress = 0) {
    const daylight = (1 + Math.sin(2 * Math.PI * progress)) / 2;
    this.nightShade.setAlpha(0.16 * (1 - daylight) ** 2);
    this.dayGlow.setAlpha(0.055 * daylight ** 2);
    this.cropLayer.update(time);
    this.weatherLayer.update(time, progress, daylight);
  }
}
