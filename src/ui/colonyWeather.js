import { colors, text } from './controls.js';

export function drawColonyWeather(scene, group, sim) {
  const say = (x, y, copy, size, options) => group.add(text(scene, x, y, copy, size, options));
  const now = sim.getWeather();
  const forecast = sim.forecastWeather();
  say(695, 211, `Now · ${Math.round(now.outsideTempC)} °C · solar index ${now.solarFactor.toFixed(2)}`,
    17, { fontStyle: 'bold' });
  say(695, 240, '7-sol projection · Seasonal model and active events', 15, { color: colors.muted });
  const headers = ['Sol', 'Outside temp.', 'Solar index', 'Heating', 'Comms'];
  const columns = [695, 772, 891, 1001, 1103];
  headers.forEach((label, i) => say(columns[i], 272, label, 13, { color: colors.muted, fontStyle: 'bold' }));
  forecast.days.forEach((day, row) => {
    const cells = [day.sol, `${Math.round(day.outsideTempC)} °C`, day.solarFactor.toFixed(2),
      `×${day.heatingFactor}`, `${Math.round(100 * day.commsFactor)}%`];
    cells.forEach((value, i) => say(columns[i], 298 + row * 23, String(value), 15));
  });
  say(695, 467, 'Solar index is relative to equatorial noon at mean Mars distance.', 13, { color: colors.muted });
  say(695, 489, 'New storms can start during the forecast.', 13, { color: colors.muted });

  const observations = sim.weather.getObservations();
  const pressure = observations.find(({ pressurePa }) => pressurePa !== undefined);
  const gust = observations.find(({ windGustMps }) => windGustMps !== undefined);
  if (pressure && gust) {
    say(695, 522, 'NASA archive · Jezero MEDA', 14, { color: '#ff9f7c', fontStyle: 'bold' });
    say(695, 548, `Initial pressure: ${pressure.pressurePa} Pa · Sols 43–44: gusts ~${gust.windGustMps} m/s`, 14,
      { color: colors.muted });
    say(695, 570, 'Historical readings at Jezero Crater.', 13, { color: colors.muted });
  }
}
