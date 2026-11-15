import { label, plate } from './widgets.js';

const forecastColors = {
  'Dust devil': { short: 'Devil', color: 0xa26940 },
  'Ice clouds': { short: 'Cloud', color: 0x526d91 },
  'Dust haze': { short: 'Haze', color: 0x79563d },
  'Ice fog': { short: 'Fog', color: 0x607c86 },
  'Water-ice snow': { short: 'Snow', color: 0x607c86 },
  'Dry-ice snow': { short: 'Snow', color: 0x607c86 },
  Windy: { short: 'Wind', color: 0x436f6d },
};

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
    const style = storm ? { short: 'Dust', color: 0xc66c2b } : cold ? { short: 'Cold', color: 0x607c86 }
      : forecastColors[day.primary];
    const offset = index ? `+${index}` : 'Now';
    const width = slotWidth - 3;
    const cell = plate(scene, group, left, 44, width, 14, style?.color ?? 0x3d5364);
    label(scene, group, left + width / 2, 51, style ? `${offset} ${style.short}` : offset, 9, {
      align: 'center', fontStyle: index === 0 ? 'bold' : 'normal',
    }).setOrigin(0.5);
    if (!day.conditions) return;
    const conditions = day.conditions;
    const daylight = [
      { active: conditions.dustDevil, name: 'Dust devil', color: 0xffb577 },
      { active: conditions.waterIceCloud || conditions.co2Cloud, name: 'Ice clouds', color: 0xc1d8f3 },
      { active: conditions.haze, name: 'Dust haze', color: 0xde9c65 },
    ].filter(({ active, name }) => active && name !== day.primary);
    for (const [marker, { color }] of daylight.entries()) {
      group.add(scene.add.rectangle(left + 2 + marker * 6, 45, 4, 2, color).setOrigin(0).setDepth(21));
    }
    if (conditions.overnightFrost) {
      group.add(scene.add.rectangle(left + 1, 56, width - 2, 1, 0xb8c8e2).setOrigin(0).setDepth(21));
    }
    cell.setInteractive({ useHandCursor: true });
    let detail;
    const show = () => {
      detail?.destroy();
      const summary = [day.primary, ...daylight.map(({ name }) => name)].join(' · ');
      const overnight = conditions.overnightFrost === 'co2' ? 'Overnight dry-ice frost'
        : conditions.overnightFrost ? 'Overnight water-ice frost' : null;
      const peak = day.windPeakMs > day.windSpeedMs ? ` · Peak ${day.windPeakMs.toFixed(1)} m/s` : '';
      const info = `${Math.round(day.outsideTempC)} °C · Wind ${day.windSpeedMs.toFixed(1)} m/s${peak} · ${Math.round(day.pressurePa)} Pa`;
      const impacts = `Sun ${Math.round(day.atmosphereFactor * 100)}% · Hab heat +${Math.round(day.habitatHeatW)} W · Ice yield ${Math.round(day.iceDrillFactor * 100)}%`;
      const copy = [summary, overnight, info, impacts].filter(Boolean).join('\n');
      detail = label(scene, group, Math.min(left, 630), 62, copy, 11, {
        backgroundColor: '#352720', padding: { x: 5, y: 4 }, wordWrap: { width: 302 },
      }).setDepth(90);
    };
    cell.on('pointerover', show).on('pointerdown', show).on('pointerout', () => detail?.destroy());
  });
}
