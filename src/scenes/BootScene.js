// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';

const keys = ['sites', 'crops', 'buildings', 'demo-events', 'seasons', 'difficulty', 'landers',
  'objectives', 'facts', 'balance'];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const path = `${import.meta.env.BASE_URL}data/`;
    for (const key of keys) this.load.json(key, `${path}${key}.json`);
  }

  async create() {
    const message = document.querySelector('#error');
    const missing = keys.filter((key) => !this.cache.json.exists(key));
    if (missing.length) {
      message.textContent = `Could not load mission data: ${missing.join(', ')}.`;
      message.style.position = 'fixed';
      message.style.zIndex = 1;
      return;
    }
    const data = Object.fromEntries(keys.map((key) => [key, this.cache.json.get(key)]));
    const events = await fetch(import.meta.env.BASE_URL + 'data/events.json')
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    const hasEventData = Array.isArray(events) && events.length > 0 && events.every((event) =>
      typeof event?.id === 'string' && Array.isArray(event.durationSols) && event.durationSols.length === 2 &&
      event.durationSols.every((sols) => Number.isInteger(sols) && sols > 0) &&
      event.durationSols[0] <= event.durationSols[1] && event.effects && typeof event.name === 'string');
    data.events = hasEventData ? events : data['demo-events'];
    data.demoWeather = !hasEventData;
    message.remove();
    this.registry.set('missionData', data);
    this.scene.start('Title');
  }
}
