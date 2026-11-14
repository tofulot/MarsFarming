// AI-assisted (OpenAI Codex).
import { stepWeather, accumulatePanelDust, cleanPanel } from './systems/weather.mjs';

/** Call after seasonSystem increments state.sol and before powerSystem.
 * Calculates everything before committing, so invalid inputs leave state intact.
 * Returns bus messages for the caller to emit after a successful commit.
 */
export function applyWeather(state, site, config, observation) {
  const result = stepWeather(state.weather, {
    sol: state.sol, Ls: state.Ls, seed: state.seed,
    difficulty: state.difficulty, site, observation
  }, config);
  if (state.weather?.sol === state.sol) return [];
  const buildings = (state.buildings ?? []).map(building => {
    if (building.id !== 'solarArray') return building;
    return { ...building, dust: accumulatePanelDust(building.dust ?? 0, config) };
  });
  state.weather = result.weather;
  state.buildings = buildings;
  state.power = { ...state.power, solarFactor: result.weather.solarFactor };
  return result.messages;
}

/** Called by Simulation.command({type: 'clean', uid}) after any cost validation. */
export function cleanWeatherPanel(state, uid) {
  const index = state.buildings?.findIndex(building => building.uid === uid) ?? -1;
  if (index < 0 || state.buildings[index].id !== 'solarArray') {
    return { ok: false, reason: 'Select a solar array to clean.' };
  }
  state.buildings[index] = cleanPanel(state.buildings[index]);
  return { ok: true };
}
