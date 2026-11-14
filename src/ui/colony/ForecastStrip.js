import { label, plate } from './widgets.js';

export function drawForecastStrip(scene, group) {
  plate(scene, group, 20, 672, 1240, 32, 0x412921);
  label(scene, group, 32, 682, 'FORECAST · MODEL', 9, { fontStyle: 'bold' });
  const forecast = scene.sim.forecastWeather(12);
  forecast.days.forEach((day, index) => {
    const x = 125 + index * 93;
    const storm = day.dustFactor < 1;
    const cold = day.heatingFactor > 1;
    plate(scene, group, x, 677, 88, 22, storm ? 0x9c7654 : cold ? 0x607c86 : 0x805b43, 0.9);
    label(scene, group, x + 44, 688, `${day.sol}  ${storm ? 'DUST' : cold ? 'COLD' : `${Math.round(day.outsideTempC)}°`}`,
      10, { align: 'center' }).setOrigin(0.5);
  });
}
