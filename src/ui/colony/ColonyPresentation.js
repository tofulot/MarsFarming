import { CropLayer } from '../../rendering/CropLayer.js';
import { createMarsTerrain } from '../../rendering/marsTerrain.js';
import { drawActionDock } from './ActionDock.js';
import { drawForecastStrip } from './ForecastStrip.js';
import { action } from './widgets.js';

export class ColonyPresentation {
  constructor(scene) {
    this.scene = scene;
    this.plants = [];
    this.previews = [];
    createMarsTerrain(scene);
    this.group = scene.add.group();
    this.cropLayer = new CropLayer(scene);
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
    drawForecastStrip(this.scene, this.group);
    this.cropLayer.sync([...this.plants, ...this.previews]);
  }
  finishDetails() {
    const scene = this.scene;
    if (!scene.sideLayer.getLength()) return;
    const close = action(scene, scene.sideLayer, 675, 126, 115, 25, 'Close details', () => {
      scene.selected = null;
      scene.showTimers = false;
      scene.showAdvancements = false;
      scene.showShopDetails = false;
      scene.drawSide();
      scene.refreshGrid();
    });
    close.setDepth(100);
    scene.sideLayer.children.iterate(child => child.setDepth(100));
  }
  update(time) { this.cropLayer.update(time); }
}
