import { mulberry32 } from '../sim/rng.js';
import { colonyBoardAtZoom } from '../ui/colony/layout.js';

const dustStrength = { dustLocal: 0.38, dustRegional: 0.67, dustGlobal: 1 };
const wrap = (value) => ((value % 1) + 1) % 1;

function weatherAppearance(weather) {
  const conditions = weather.conditions ?? {};
  const storm = conditions.storm ?? weather.active?.find(({ id }) => id in dustStrength)?.id;
  const haze = conditions.haze ? Math.min(0.32, 0.07 + (weather.dustOpticalDepth ?? 0.3) * 0.3) : 0;
  const dust = dustStrength[storm] ?? haze;
  const cloud = Math.min(0.16, 0.045 + (weather.cloudOpticalDepth ?? 0.15) * 0.23);
  return {
    east: (weather.windEastMs ?? 5) / 75,
    north: (weather.windNorthMs ?? 0) / 100,
    dust,
    iceCloud: conditions.waterIceCloud && !conditions.co2Cloud && !conditions.fog ? cloud : 0,
    co2Cloud: conditions.co2Cloud && !conditions.fog ? cloud : 0,
    fog: conditions.fog ? cloud : 0,
    surfaceFrost: conditions.surfaceFrost ? 0.17 : 0,
    overnightFrost: conditions.overnightFrost ? 0.13 : 0,
    blowingDust: dust || conditions.windy ? 0.13 + 0.24 * dust : 0,
    snow: conditions.snow ? 0.31 : 0,
    dustDevil: conditions.dustDevil ? 0.43 : 0,
    dustSparks: conditions.dustSparks ? 0.54 : 0,
  };
}

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
    this.seconds = 0;
    this.driftEast = 0;
    this.driftNorth = 0;
    scene.events.once('shutdown', () => {
      this.graphics.clearMask();
      this.mask.destroy();
      this.clip.destroy();
      this.graphics.destroy();
    });
  }

  setWeather(weather, nextWeather = weather) {
    this.weather = weather;
    this.currentAppearance = weatherAppearance(weather);
    this.nextAppearance = weatherAppearance(nextWeather);
    this.nextFrame = 0;
  }

  update(time, progress = 0, daylight = 0.5) {
    if (!this.weather || time < this.nextFrame) return;
    this.nextFrame = time + 50;
    const { scene, graphics, clip, currentAppearance, nextAppearance } = this;
    const blend = progress * progress * (3 - 2 * progress);
    const appearance = {};
    for (const key of Object.keys(currentAppearance)) {
      appearance[key] = currentAppearance[key] + (nextAppearance[key] - currentAppearance[key]) * blend;
    }
    const { east, north, dust } = appearance;
    const elapsed = this.motion?.matches ? 0 : Math.min(100, time - (this.lastFrame ?? time)) / 1000;
    this.lastFrame = time;
    this.seconds += elapsed;
    this.driftEast += east * elapsed;
    this.driftNorth += north * elapsed;
    const { seconds, driftEast, driftNorth } = this;

    const { x, y, tile, row } = colonyBoardAtZoom(scene.boardZoom);
    const width = tile * scene.sim.state.grid.w;
    const height = row * scene.sim.state.grid.h;
    if (this.lastZoom !== scene.boardZoom) {
      clip.clear().fillStyle(0xffffff).fillRect(x, y, width, height);
      this.lastZoom = scene.boardZoom;
    }
    graphics.clear();

    if (dust) graphics.fillStyle(0xb95526, 0.18 * dust).fillRect(x, y, width, height);
    const cloudBands = [
      { opacity: appearance.iceCloud, tint: 0xd7e5ee, bandY: 0.13 },
      { opacity: appearance.co2Cloud, tint: 0xc6bce3, bandY: 0.13 },
      { opacity: appearance.fog, tint: 0xd7e5ee, bandY: 0.73 },
    ];
    for (const { opacity, tint, bandY } of cloudBands) {
      if (!opacity) continue;
      graphics.fillStyle(tint, opacity);
      for (const particle of this.particles.slice(0, 5)) {
        graphics.fillEllipse(x + wrap(particle.x + driftEast * 0.18) * width,
          y + (bandY + particle.y * 0.15) * height, 110 + 120 * particle.size, 10 + 17 * particle.speed);
      }
    }

    const frost = Math.max(appearance.surfaceFrost, appearance.overnightFrost * (1 - daylight) ** 2);
    if (frost) {
      graphics.fillStyle(0xd3e3ed, frost);
      for (const particle of this.particles.slice(0, 28)) {
        const frostX = x + Math.floor(particle.x * scene.sim.state.grid.w) * tile;
        const frostY = y + Math.floor(particle.y * scene.sim.state.grid.h) * row;
        graphics.fillEllipse(frostX + tile * 0.18, frostY + row * 0.12, 8 + particle.size * 9, 3);
      }
    }

    const particleLayers = [
      { opacity: appearance.blowingDust, snow: false, count: 40 },
      { opacity: appearance.snow, snow: true, count: 25 },
    ];
    for (const { opacity, snow, count } of particleLayers) {
      if (!opacity) continue;
      const fall = snow ? 0.12 * seconds - driftNorth * 0.25 : -driftNorth;
      const horizontal = snow ? east : Math.tanh(12 * east);
      graphics.lineStyle(1, snow ? 0xe7f0f7 : 0xfcc394, opacity);
      for (const particle of this.particles.slice(0, count)) {
        const speed = 0.45 + particle.speed * 0.8;
        const px = x + width * wrap(particle.x + driftEast * speed);
        const py = y + height * wrap(particle.y + fall * speed);
        const length = 3 + particle.size * (snow ? 6 : 14);
        graphics.lineBetween(px, py, px + length * horizontal,
          py + (snow ? length : -length * north));
      }
    }

    if (appearance.dustDevil) {
      const px = x + width * (0.52 + 0.33 * Math.sin(driftEast));
      const py = y + height * (0.56 - 0.21 * Math.sin(driftNorth));
      graphics.lineStyle(1.3, 0xffc68e, appearance.dustDevil * daylight);
      for (let level = 0; level < 7; level++) {
        graphics.strokeEllipse(px + 3 * Math.sin(seconds * 4 + level), py - level * 4, 8 + level * 3, 3.5);
      }
    }
    if (appearance.dustSparks) {
      graphics.fillStyle(0xffd7a0, appearance.dustSparks);
      graphics.fillCircle(x + width * (0.38 + 0.24 * Math.sin(driftEast)), y + height * 0.62, 1.7);
    }
  }
}
