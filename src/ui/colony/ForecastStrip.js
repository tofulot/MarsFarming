import { label, plate } from './widgets.js';

export function drawForecastStrip(scene, group) {
  const { sim } = scene;
  const { days } = sim.forecastWeather(15);
  const { sol } = sim.state;
  const incoming = days.find((day) => day.sol <= sol + 10 && day.active.some(({ id, startSol }) =>
    startSol === day.sol && (id === 'dustRegional' || id === 'dustGlobal')));
  const until = incoming ? incoming.sol - sol : 0;
  const warning = until ? `DUST IN ${until} ${until === 1 ? 'SOL' : 'SOLS'}` : 'WEATHER';
  plate(scene, group, 20, 43, 930, 16, 0x412921);
  label(scene, group, 30, 45, warning, 9, {
    color: until ? '#ffad58' : '#d7aa8b', fontStyle: 'bold',
  });

  const timeline = [sim.getWeather(), ...days];
  const slotWidth = 826 / timeline.length;
  timeline.forEach((day, index) => {
    const left = 120 + index * slotWidth;
    const storm = day.dustFactor < 1;
    const cold = day.heatingFactor > 1;
    const offset = index ? `+${index}` : 'Now';
    const condition = storm ? ' Dust' : cold ? ' Cold' : '';
    plate(scene, group, left, 44, slotWidth - 3, 14, storm ? 0xc66c2b : cold ? 0x607c86 : 0x3d5364);
    label(scene, group, left + (slotWidth - 3) / 2, 51, offset + condition, 9, {
      align: 'center', fontStyle: index === 0 ? 'bold' : 'normal',
    }).setOrigin(0.5);
  });
}
