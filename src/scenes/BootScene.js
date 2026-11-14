// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import achievementChime from '../assets/achievement.wav';
import { hasDustClimatology } from '../weather/dustClimatology.js';
import { gameEvents } from '../weather/redHarvest.js';

const keys = ['sites', 'crops', 'buildings', 'demo-events', 'seasons', 'difficulty', 'landers',
  'objectives', 'facts', 'balance', 'weather', 'weather-observations'];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.audio('achievement-chime', achievementChime);
    const path = `${import.meta.env.BASE_URL}data/`;
    this.load.image('mars-terrain', `${path}mars/terrain.jpg`);
    this.load.json('dust-climatology', `${path}mars/dust-climatology.json`);
    this.load.json('neutron-flux', `${path}mars/neutron-flux.json`);
    for (const key of keys) this.load.json(key, `${path}${key}.json`);
  }

  async create() {
    const message = document.querySelector('#error');
    const missing = keys.filter((key) => !this.cache.json.exists(key));
    if (!this.textures.exists('mars-terrain')) missing.push('Mars terrain');
    if (this.cache.json.get('neutron-flux')?.length !== 4050) missing.push('neutron flux');
    const dust = this.cache.json.get('dust-climatology');
    if (!hasDustClimatology(dust)) missing.push('dust climatology');
    if (missing.length) {
      message.textContent = `Could not load mission data: ${missing.join(', ')}.`;
      message.style.position = 'fixed';
      message.style.zIndex = 1;
      return;
    }
    const data = Object.fromEntries(keys.map((key) => [key, this.cache.json.get(key)]));
    data.dustClimatology = dust;
    data['neutron-flux'] = this.cache.json.get('neutron-flux');
    const events = await fetch(import.meta.env.BASE_URL + 'data/events.json')
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    const hasEventData = Array.isArray(events) && events.length > 0 && events.every((event) =>
      typeof event?.id === 'string' && Array.isArray(event.durationSols) && event.durationSols.length === 2 &&
      event.durationSols.every((sols) => Number.isInteger(sols) && sols > 0) &&
      event.durationSols[0] <= event.durationSols[1] && event.effects && typeof event.name === 'string');
    data.weatherObservations = data['weather-observations'];
    data.events = gameEvents(data.weather, hasEventData ? events : data['demo-events']);
    message.remove();
    this.registry.set('missionData', data);
    this.scene.start('Title');
  }
}
