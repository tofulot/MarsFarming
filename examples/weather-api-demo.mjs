// AI-assisted (OpenAI Codex). Runs the shared API through the actual game Simulation.
import { readFileSync } from 'node:fs';
import { Simulation } from '../src/sim/Simulation.js';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const data = Object.fromEntries(['sites', 'crops', 'buildings', 'seasons', 'difficulty',
  'landers', 'objectives', 'facts', 'balance', 'weather'].map(key => [key, read(key)]));
data.events = read('demo-events');
data.weatherObservations = read('weather-observations');
const sim = new Simulation(data, { difficulty: 'easy', siteId: 'gale', demo: true });
sim.command({ type: 'triggerEvent', id: 'dustRegional' });
const weather = sim.getWeather();
const advice = sim.weather.plantingAdvice(data.crops[0], weather, 1500,
  { basePowerW: 800, includedPpf: 28 });
console.log(JSON.stringify({
  apiVersion: sim.weather.version,
  current: { sol: weather.sol, outsideTempC: weather.outsideTempC, dustFactor: weather.dustFactor },
  lettuce: advice,
  nextThreeSols: sim.forecastWeather(3).days.map(day => ({ sol: day.sol, solarFactor: day.solarFactor })),
  referenceRecords: sim.weather.getObservations().length
}, null, 2));
