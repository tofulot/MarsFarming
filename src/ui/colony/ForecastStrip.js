import { label, plate } from './widgets.js';

export function drawForecastStrip(scene, group) {
  plate(scene, group, 20, 672, 1240, 32, 0x412921);
  label(scene, group, 32, 682, 'FORECAST · MODEL', 9, { fontStyle: 'bold' });
  const forecast = scene.sim.forecastWeather(12);
  const incoming = forecast.days.find(day => day.sol > scene.sim.state.sol && day.sol <= scene.sim.state.sol + 10 && day.dustFactor < 1);
  if (incoming) label(scene, group, 32, 663, `⚠ DUST STORM IN ${incoming.sol - scene.sim.state.sol} SOL${incoming.sol - scene.sim.state.sol === 1 ? '' : 'S'}`, 10,
    { color: '#ffad58', fontStyle: 'bold' });
  forecast.days.forEach((day, index) => {
    const x = 125 + index * 93;
    const storm = day.dustFactor < 1;
    const cold = day.heatingFactor > 1;
    plate(scene, group, x, 677, 88, 22, storm ? 0xc66c2b : cold ? 0x607c86 : 0x805b43, 0.9);
    label(scene, group, x + 44, 688, `${day.sol}  ${storm ? 'DUST' : cold ? 'COLD' : `${Math.round(day.outsideTempC)}°`}`,
      10, { align: 'center' }).setOrigin(0.5);
  });
}
