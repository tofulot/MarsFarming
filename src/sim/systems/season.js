// AI-assisted (OpenAI Codex)
import { solarLongitude } from '../insolation.js';

export function seasonSystem(state, { seasons }, site) {
  state.Ls = solarLongitude(state.sol + (state.landingCalendarSol ?? 0), seasons);
  const north = Math.floor(state.Ls / 90);
  state.seasonIdx = (north + (site.lat < 0 ? 2 : 0)) % 4;
  state.season = seasons.seasonNamesNorth[state.seasonIdx];
}
