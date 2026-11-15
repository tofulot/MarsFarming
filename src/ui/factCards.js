// AI-assisted (Cursor)
import { colors, panel, text } from './controls.js';
import {
  drawFactTail, drawHelperBotanist, helperSlot, pickSpaceFact,
} from './helperBotanist.js';

/**
 * Mount the helper botanist and queue NASA fact toasts.
 * Helper sits lower-left (clear of right HUD / side panel). Bubbles open upward.
 */
export function playFactCards(scene, { facts = [], y = 300 } = {}) {
  const queue = [];
  let playing = false;
  const helper = drawHelperBotanist(scene, helperSlot.x, helperSlot.y, 1);
  scene.events.once('shutdown', () => helper.destroy());

  helper.onClick(() => {
    const card = pickSpaceFact(facts, () => Math.random());
    queue.push({ ...card, title: card.title || 'Space fact' });
    helper.wave();
    showNext();
  });

  function showNext() {
    if (playing || !queue.length) return;
    playing = true;
    const card = queue[0];
    helper.wave();
    const survival = card.survival
      ? text(scene, 14, 78, `Survival · ${card.survival}`, 12, {
        color: '#f0c9a0', wordWrap: { width: 340 },
      })
      : null;
    const height = survival ? 132 : 92;
    // Bubble sits above the helper, left-of-center — clear of right HUD (x≈1000) and dock (y≈548).
    const bubbleX = 118;
    const bubbleY = Math.min(y, 310);
    const body = [
      panel(scene, 0, 0, 360, height, 0x241c1b).setStrokeStyle(1, 0xd4a574),
      text(scene, 14, 10, card.milestone === 'click_space_fact' ? 'SPACE FACT' : 'NASA FACT', 11, {
        color: '#d4a574', fontStyle: 'bold',
      }),
      text(scene, 14, 28, card.title ?? 'Mission fact', 16, { fontStyle: 'bold', wordWrap: { width: 330 } }),
      text(scene, 14, 52, `${card.text} [${card.source ?? '—'}]`, 12, {
        color: colors.muted, wordWrap: { width: 330 },
      }),
    ];
    if (survival) body.push(survival);
    const view = scene.add.container(bubbleX, bubbleY - 10, body).setAlpha(0).setDepth(27);
    const tail = drawFactTail(
      scene,
      helperSlot.x + 18,
      helperSlot.y - 18,
      bubbleX + 40,
      bubbleY + height - 4,
    ).setAlpha(0);

    scene.tweens.add({
      targets: [view, tail],
      alpha: 1,
      duration: 180,
      onComplete: () => {
        scene.tweens.add({
          targets: view,
          y: bubbleY,
          duration: 120,
          hold: 5200,
          onComplete: () => {
            scene.tweens.add({
              targets: [view, tail],
              alpha: 0,
              duration: 200,
              onComplete: () => {
                view.destroy();
                tail.destroy();
                queue.shift();
                playing = false;
                showNext();
              },
            });
          },
        });
      },
    });
  }

  return (card) => {
    queue.push(card);
    showNext();
  };
}
