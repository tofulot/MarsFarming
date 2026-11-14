import { colors, panel, text } from './controls.js';

export function playAchievementToasts(scene, queue, y = 154) {
  let playing = false;

  function showNext() {
    if (playing || !queue.length) return;
    playing = true;
    const award = queue[0];
    const badge = scene.add.star(27, 33, 5, 6, 13, colors.mint);
    const card = scene.add.container(917, y - 10, [
      panel(scene, 0, 0, 308, 70, 0x26201f).setStrokeStyle(1, colors.mint),
      badge,
      text(scene, 49, 8, 'ACHIEVEMENT UNLOCKED', 11, { color: '#9bd8ae', fontStyle: 'bold' }),
      text(scene, 49, 23, award.name, 18, { fontStyle: 'bold' }),
      text(scene, 49, 47, award.id === 'botanist' ? 'Name your colony in Achievements' : `Sol ${award.sol}`,
        12, { color: colors.muted }),
    ]).setAlpha(0).setDepth(10);

    scene.tweens.chain({
      targets: card,
      tweens: [
        { y, alpha: 1, duration: 160, hold: 2800 },
        { y: y - 10, alpha: 0, duration: 180 },
      ],
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
