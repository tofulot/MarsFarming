// AI-assisted (Cursor)
import { colors, panel, text } from './controls.js';
import { drawFactTail, drawHelperBotanist } from './helperBotanist.js';

/** Queue NASA milestone fact cards with a survival takeaway and helper mascot. */
export function playFactCards(scene, y = 238) {
  const queue = [];
  let playing = false;
  let helper;

  function ensureHelper() {
    if (helper) return helper;
    helper = drawHelperBotanist(scene, 868, y + 48, 1);
    scene.events.once('shutdown', () => helper?.destroy());
    return helper;
  }

  function showNext() {
    if (playing || !queue.length) return;
    playing = true;
    const card = queue[0];
    const mascot = ensureHelper();
    mascot.wave();
    const survival = card.survival
      ? text(scene, 16, 78, `Survival · ${card.survival}`, 12, {
        color: '#f0c9a0', wordWrap: { width: 300 },
      })
      : null;
    const height = survival ? 128 : 88;
    const bubbleX = 900;
    const body = [
      panel(scene, 0, 0, 332, height, 0x241c1b).setStrokeStyle(1, 0xd4a574),
      text(scene, 16, 10, 'NASA FACT', 11, { color: '#d4a574', fontStyle: 'bold' }),
      text(scene, 16, 28, card.title ?? 'Mission fact', 16, { fontStyle: 'bold', wordWrap: { width: 300 } }),
      text(scene, 16, 52, `${card.text} [${card.source ?? '—'}]`, 12, {
        color: colors.muted, wordWrap: { width: 300 },
      }),
    ];
    if (survival) body.push(survival);
    const view = scene.add.container(bubbleX, y - 12, body).setAlpha(0).setDepth(12);
    const tail = drawFactTail(scene, 888, y + 40, bubbleX, y + 36).setAlpha(0);

    scene.tweens.add({
      targets: [view, tail],
      alpha: 1,
      duration: 180,
      onComplete: () => {
        scene.tweens.add({
          targets: view,
          y,
          duration: 120,
          hold: 5000,
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
