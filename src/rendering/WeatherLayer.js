import { mulberry32 } from '../sim/rng.js';
import { colonyBoardAtZoom } from '../ui/colony/layout.js';

const dustStrength = { dustLocal: 0.38, dustRegional: 0.67, dustGlobal: 1 };
const wrap = (value) => ((value % 1) + 1) % 1;

export class WeatherLayer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics().setDepth(8);
    this.clip = scene.make.graphics({ add: false });
    this.mask = this.clip.createGeometryMask();
    this.graphics.setMask(this.mask);
    this.motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const random = mulberry32(127);
    this.particles = Array.from({ length: 64 }, () => ({ x: random(), y: random(), speed: random(), size: random() }));
    this.nextFrame = 0;
    scene.events.once('shutdown', () => {
      this.graphics.clearMask();
      this.mask.destroy();
      this.clip.destroy();
      this.graphics.destroy();
    });
  }

  setWeather(weather) {
    this.weather = weather;
    this.nextFrame = 0;
  }

  update(time) {
    if (!this.weather || time < this.nextFrame) return;
    this.nextFrame = time + 50;
    const { scene, graphics, clip, weather } = this;
    const { x, y, tile, row } = colonyBoardAtZoom(scene.boardZoom);
    const width = tile * scene.sim.state.grid.w;
    const height = row * scene.sim.state.grid.h;
    if (this.lastZoom !== scene.boardZoom) {
      clip.clear().fillStyle(0xffffff).fillRect(x, y, width, height);
      this.lastZoom = scene.boardZoom;
    }
    graphics.clear();
    const conditions = weather.conditions ?? {};
    const storm = conditions.storm ?? weather.active.find(({ id }) => id in dustStrength)?.id;
    const haze = conditions.haze ? Math.min(0.32, 0.07 + (weather.dustOpticalDepth ?? 0.3) * 0.3) : 0;
    const dust = dustStrength[storm] ?? haze;
    const seconds = this.motion?.matches ? 0 : time / 1000;
    const east = (weather.windEastMs ?? 5) / 75;
    const north = (weather.windNorthMs ?? 0) / 100;

    if (dust) graphics.fillStyle(0xb95526, 0.18 * dust).fillRect(x, y, width, height);
    if (conditions.waterIceCloud || conditions.co2Cloud || conditions.fog) {
      const bandY = conditions.fog ? 0.73 : 0.13;
      const tint = conditions.co2Cloud ? 0xc6bce3 : 0xd7e5ee;
      const opacity = Math.min(0.16, 0.045 + (weather.cloudOpticalDepth ?? 0.15) * 0.23);
      graphics.fillStyle(tint, opacity);
      for (const particle of this.particles.slice(0, 5)) {
        graphics.fillEllipse(x + wrap(particle.x + east * seconds * 0.18) * width,
          y + (bandY + particle.y * 0.15) * height, 110 + 120 * particle.size, 10 + 17 * particle.speed);
      }
    }

    if (conditions.surfaceFrost) {
      graphics.fillStyle(0xd3e3ed, 0.17);
      for (const particle of this.particles.slice(0, 28)) {
        const frostX = x + Math.floor(particle.x * scene.sim.state.grid.w) * tile;
        const frostY = y + Math.floor(particle.y * scene.sim.state.grid.h) * row;
        graphics.fillEllipse(frostX + tile * 0.18, frostY + row * 0.12, 8 + particle.size * 9, 3);
      }
    }

    if (dust || conditions.windy || conditions.snow) {
      const snow = Boolean(conditions.snow);
      const count = snow ? 25 : Math.floor(15 + 40 * dust);
      graphics.lineStyle(1, snow ? 0xe7f0f7 : 0xfcc394, snow ? 0.31 : 0.13 + 0.24 * dust);
      for (const particle of this.particles.slice(0, count)) {
        const speed = 0.45 + particle.speed * 0.8;
        const px = x + width * wrap(particle.x + seconds * east * speed);
        const py = y + height * wrap(particle.y + seconds * (snow ? 0.12 - north * 0.25 : -north) * speed);
        const length = 3 + particle.size * (snow ? 6 : 14);
        graphics.lineBetween(px, py, px + (snow ? length * east : length * Math.sign(east)),
          py + (snow ? length : -length * north));
      }
    }

    if (conditions.dustDevil) {
      const px = x + width * (0.14 + 0.72 * wrap(weather.sol * 0.53 + seconds * east * 0.22));
      const py = y + height * (0.32 + 0.45 * wrap(weather.sol * 0.67 + seconds * -north * 0.25));
      graphics.lineStyle(1.3, 0xffc68e, 0.43);
      for (let level = 0; level < 7; level++) {
        graphics.strokeEllipse(px + 3 * Math.sin(seconds * 4 + level), py - level * 4, 8 + level * 3, 3.5);
      }
    }
    if (conditions.dustSparks) {
      graphics.fillStyle(0xffd7a0, 0.54);
      graphics.fillCircle(x + width * wrap(weather.sol * 0.71), y + height * wrap(weather.sol * 0.27), 1.7);
    }
  }
}
