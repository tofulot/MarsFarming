// AI-assisted (Cursor)
import { colors, panel, text } from './controls.js';

/** Quiet, compact achievement toasts — less chrome, shorter dwell. */
export function playAchievementToasts(scene, queue, y = 168) {
  let playing = false;

  function showNext() {
    if (playing || !queue.length) return;
    playing = true;
    const award = queue[0];
    const card = scene.add.container(980, y - 6, [
      panel(scene, 0, 0, 248, 52, 0x221c1b).setStrokeStyle(1, 0x5a6f62),
      text(scene, 14, 8, 'Unlocked', 10, { color: '#8fb89a' }),
      text(scene, 14, 22, award.name, 15, { fontStyle: 'bold' }),
      text(scene, 14, 40, award.id === 'botanist' ? 'Naming + Ice Drill'
        : `Sol ${award.sol}${award.credits ? ` · +${award.credits} cr` : ''}`,
      11, { color: colors.muted }),
    ]).setAlpha(0).setDepth(10);

    scene.tweens.chain({
      targets: card,
      tweens: [
        { y, alpha: 0.88, duration: 140, hold: 1600 },
        { y: y - 6, alpha: 0, duration: 160 },
      ],
      onStart: () => {
        if (scene.cache.audio.exists('achievement-chime')) {
          scene.sound.play('achievement-chime', { volume: 0.22 });
        }
      },
      onComplete: () => {
        card.destroy();
        queue.shift();
        playing = false;
        showNext();
      },
    });
  }

  showNext();
  return (award) => {
    queue.push(award);
    showNext();
  };
}
