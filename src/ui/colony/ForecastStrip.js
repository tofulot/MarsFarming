import { label, plate } from './widgets.js';

export function drawForecastStrip(scene, group, currentWeather = scene.sim.getWeather()) {
  const { sim } = scene;
  const { days } = sim.forecastWeather(15);
  const { sol } = sim.state;
  const incoming = days.find((day) => day.sol <= sol + 10 && day.active.some(({ id, startSol }) =>
    startSol === day.sol && ['dustLocal', 'dustRegional', 'dustGlobal'].includes(id)));
  const until = incoming ? incoming.sol - sol : 0;
  const warning = until ? `DUST IN ${until} ${until === 1 ? 'SOL' : 'SOLS'}` : 'WEATHER';
  plate(scene, group, 20, 43, 930, 16, 0x412921);
  label(scene, group, 30, 45, warning, 9, {
    color: until ? '#ffad58' : '#d7aa8b', fontStyle: 'bold',
  });

  const timeline = [currentWeather, ...days];
  const slotWidth = 826 / timeline.length;
  timeline.forEach((day, index) => {
    const left = 120 + index * slotWidth;
    const storm = day.conditions ? Boolean(day.conditions.storm) : day.dustFactor < 1;
    const cold = day.conditions?.cold ?? day.heatingFactor > 1;
    const offset = index ? `+${index}` : 'Now';
    const condition = storm ? ' Dust' : cold ? ' Cold' : '';
    plate(scene, group, left, 44, slotWidth - 3, 14, storm ? 0xc66c2b : cold ? 0x607c86 : 0x3d5364);
    label(scene, group, left + (slotWidth - 3) / 2, 51, offset + condition, 9, {
      align: 'center', fontStyle: index === 0 ? 'bold' : 'normal',
    }).setOrigin(0.5);
    if (!day.conditions) return;
    const hit = scene.add.zone(left, 44, slotWidth - 3, 15).setOrigin(0).setDepth(23).setInteractive();
    let detail;
    const show = () => {
      detail?.destroy();
      const info = `${day.primary} · ${Math.round(day.outsideTempC)} °C · ${day.windSpeedMs.toFixed(1)} m/s · ${Math.round(day.pressurePa)} Pa`;
      const impacts = `Sun ${Math.round(day.atmosphereFactor * 100)}% · Hab heat +${Math.round(day.habitatHeatW)} W · Ice yield ${Math.round(day.iceDrillFactor * 100)}%`;
      detail = label(scene, group, Math.min(left, 654), 62, `${info}\n${impacts}`, 11, {
        backgroundColor: '#352720', padding: { x: 5, y: 4 },
      }).setDepth(90);
    };
    hit.on('pointerover', show).on('pointerdown', show).on('pointerout', () => detail?.destroy());
    group.add(hit);
  });
}
