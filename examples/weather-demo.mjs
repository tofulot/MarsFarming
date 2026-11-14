// AI-assisted (OpenAI Codex). Weather-only integration demonstration.
import { readFile } from 'node:fs/promises';
import { applyWeather, cleanWeatherPanel } from '../src/sim/weatherAdapter.mjs';
import { seasonAt, panelOutputW, plantingAdvice } from '../src/sim/systems/weather.mjs';

const config = JSON.parse(await readFile(new URL('../public/data/weather.json', import.meta.url)));
const site = { id: 'jezero', lat: 18.44 };
const state = {
  seed: 42, difficulty: 'medium', sol: 0,
  buildings: [{ uid: 'solar-1', id: 'solarArray', dust: 0 }], power: {}
};
const lettuce = { id: 'lettuce', ppf: 17, tempDayC: 23, growthSols: 27 };
let eventStarts = 0;
let minimumSolarW = Infinity;
for (let sol = 0; sol < 669; sol++) {
  state.sol = sol;
  Object.assign(state, seasonAt(sol, site.lat, config));
  const messages = applyWeather(state, site, config);
  eventStarts += messages.filter(message => message.type === 'event:start').length;
  // Example policy only: clean every 30 sols. The real game's player chooses this.
  if (sol % 30 === 0) cleanWeatherPanel(state, 'solar-1');
  const outputW = panelOutputW(3000, state.buildings[0].dust, state.weather);
  minimumSolarW = Math.min(minimumSolarW, outputW);
}
console.log(JSON.stringify({
  solsSimulated: 669, eventStarts, minimumSolarW,
  finalWeather: { season: state.weather.season, Ls: state.weather.Ls, outsideTempC: state.weather.outsideTempC },
  lettuceAdviceWith1000ClimateWatts: plantingAdvice(lettuce, state.weather, config, 1000)
}, null, 2));
