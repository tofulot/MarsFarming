// AI-assisted (Claude Code: crops plus building models through one three.js layer)
import * as THREE from 'three';
import { createCropModel, disposeCropModel } from '../assets/crops/index.js';
import { createBuildingModel, disposeBuildingModel, setBuildingModelState } from '../assets/buildings/index.js';

const IDLE_FRAME_MS = 66;
const ANIMATING_FRAME_MS = 33;
const TILT = 0.65;

/** Live Three.js scene composited into Phaser so panels correctly occlude plants and models.
 * One WebGL renderer for everything on the board; a canvas bridge keeps both engines independent.
 *
 * Items passed to sync(), positioned in canvas pixels with the board transform (x, y = base point):
 *   crop:  { key, id: cropId, x, y, size, growth }
 *   model: { key, model: 'commsDish' | 'supplyCrate', x, y, size, state }   (state goes to the model's setState)
 */
export class CropLayer {
  constructor(scene) {
    this.models = new Map();
    this.time = 0;
    this.animating = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 2000);
    this.camera.position.z = 1000;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(1280, 720);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xfff3d8, 0x5d392d, 2.4));
    const sunlight = new THREE.DirectionalLight(0xffe6bf, 3);
    sunlight.position.set(-3, 6, 8);
    this.scene.add(sunlight);
    this.key = `live-crops-${scene.sys.settings.key}`;
    this.texture = scene.textures.createCanvas(this.key, 1280, 720);
    this.image = scene.add.image(0, 0, this.key).setOrigin(0).setDepth(21);
    this.nextFrame = 0;
    scene.events.once('shutdown', () => this.destroy(scene));
  }

  sync(items) {
    const live = new Set();
    for (const item of items) {
      live.add(item.key);
      const kind = item.model ? `model:${item.model}` : item.id;
      let entry = this.models.get(item.key);
      if (entry && entry.kind !== kind) {
        this.remove(item.key);
        entry = null;
      }
      if (!entry) {
        const model = item.model ? createBuildingModel(item.model) : createCropModel(item.id);
        if (!model) continue;
        entry = { kind, id: item.id, building: item.model ?? null, model, state: null, phase: 0 };
        this.models.set(item.key, entry);
        this.scene.add(model);
      }
      entry.model.position.set(item.x - 640, 360 - item.y, 0);
      entry.model.rotation.x = TILT;
      if (entry.building) {
        entry.model.scale.setScalar(item.size);
        entry.state = item.state ?? {};
        if (setBuildingModelState(entry.building, entry.model, entry.state, this.time)) this.animating = true;
        continue;
      }
      const growth = Math.max(0, Math.min(1, item.growth ?? 1));
      entry.model.scale.setScalar(item.size * (0.28 + growth * 0.72));
      entry.model.userData.mature.forEach(mesh => { mesh.visible = growth > 0.6; });
      entry.phase = item.x * 0.1;
    }
    for (const key of this.models.keys()) if (!live.has(key)) this.remove(key);
    this.nextFrame = 0;
  }

  remove(key) {
    const entry = this.models.get(key);
    this.scene.remove(entry.model);
    if (entry.building) disposeBuildingModel(entry.model);
    else disposeCropModel(entry.model);
    this.models.delete(key);
  }

  update(time) {
    this.time = time;
    if (time < this.nextFrame) return;
    let animating = false;
    for (const entry of this.models.values()) {
      if (entry.building) {
        if (setBuildingModelState(entry.building, entry.model, entry.state, time)) animating = true;
      } else {
        entry.model.rotation.z = Math.sin(time / 1700 + entry.phase) * 0.025;
      }
    }
    this.animating = animating;
    this.nextFrame = time + (animating ? ANIMATING_FRAME_MS : IDLE_FRAME_MS);
    this.renderer.render(this.scene, this.camera);
    const context = this.texture.context;
    context.clearRect(0, 0, 1280, 720);
    context.drawImage(this.renderer.domElement, 0, 0);
    this.texture.refresh();
  }

  destroy(scene) {
    for (const key of this.models.keys()) this.remove(key);
    this.image.destroy();
    scene.textures.remove(this.key);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Same layer under a name that says what it now draws; CropLayer stays for existing imports. */
export { CropLayer as BoardModelLayer };
