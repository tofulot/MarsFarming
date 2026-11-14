// AI-assisted (OpenAI Codex)
import { clearSolarFactor, solarLongitude } from '../insolation.js';

export function seasonSystem(state, { seasons, balance }, site) {
  state.Ls = solarLongitude(state.sol, seasons);
  const north = Math.floor(state.Ls / 90);
  state.seasonIdx = (north + (site.lat < 0 ? 2 : 0)) % 4;
  state.season = seasons.seasonNamesNorth[state.seasonIdx];
  state.power.clearSolarFactor = clearSolarFactor(site.lat, state.Ls, seasons.orbit);
  const model = balance.temperatureModel;
  state.outsideTempC = model.baseC - Math.abs(site.lat) * model.latitudePenalty
    + model.seasonSwingC * Math.sin(state.Ls * Math.PI / 180) * (site.lat < 0 ? -1 : 1);
}
