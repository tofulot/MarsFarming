// AI-assisted (Cursor)
import { colors, text } from './controls.js';
import {
  drawHelperBotanist, helperSlot, pickSpaceFact,
} from './helperBotanist.js';

const BUBBLE = Object.freeze({
  width: 312,
  padX: 14,
  padTop: 10,
  radius: 12,
  fill: 0x1c1518,
  fillAlpha: 0.62,
  stroke: 0xe0b07a,
  accent: 0x9bd8ae,
  holdMs: 5600,
  showAlpha: 0.9,
});

/**
 * Mount the helper botanist and show NASA fact toasts.
 * A new fact replaces any visible bubble immediately.
 * Helper sits lower-left; bubbles open upward.
 */
export function playFactCards(scene, { facts = [], y = 236 } = {}) {
  const helper = drawHelperBotanist(scene, helperSlot.x, helperSlot.y, 1);
  scene.events.once('shutdown', () => {
    dismissActive(true);
    helper.destroy();
  });

  let active = null;

  helper.onClick(() => {
    const card = pickSpaceFact(facts, () => Math.random());
    helper.wave();
    showCard({ ...card, title: card.title || 'Space fact' });
  });

  function dismissActive(immediate = false) {
    if (!active) return;
    const leaving = active;
    active = null;
    leaving.tweens.forEach((tw) => { try { tw.stop(); } catch { /* noop */ } });
    if (immediate || !leaving.view.active) {
      leaving.view.destroy();
      return;
    }
    scene.tweens.add({
      targets: leaving.view,
      alpha: 0,
      y: leaving.view.y + 8,
      scale: 0.96,
      duration: 120,
      onComplete: () => leaving.view.destroy(),
    });
  }

  function showCard(card) {
    dismissActive();
    helper.wave();

    const bubbleX = 22;
    const view = buildFactBubble(scene, card);
    // Keep a modest gap above the helper — close enough to feel attached.
    const clearAboveHelper = helperSlot.y - 40 - (view.getData('height') ?? 100);
    const bubbleY = Math.min(y, clearAboveHelper);
    view.setPosition(bubbleX, bubbleY + 10).setAlpha(0).setScale(0.96).setDepth(29);

    const enter = scene.tweens.add({
      targets: view,
      alpha: BUBBLE.showAlpha,
      y: bubbleY,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    const hold = scene.tweens.add({
      targets: view,
      alpha: BUBBLE.showAlpha,
      duration: 1,
      delay: BUBBLE.holdMs,
      onComplete: () => {
        if (active?.view !== view) return;
        dismissActive();
      },
    });

    active = { view, tweens: [enter, hold] };
  }

  return (card) => showCard(card);
}

/** Compact translucent speech bubble with accent bar, source chip, survival strip. */
function buildFactBubble(scene, card) {
  const width = BUBBLE.width;
  const isClick = card.milestone === 'click_space_fact';
  const eyebrowCopy = isClick ? 'SPACE FACT' : 'NASA FACT';
  const titleCopy = card.title ?? 'Mission fact';
  const bodyCopy = card.text ?? '';
  const sourceCopy = String(card.source ?? '—');
  const survivalCopy = card.survival ? `Survival · ${card.survival}` : '';

  const wrap = width - BUBBLE.padX * 2 - 8;
  const eyebrow = text(scene, 0, 0, eyebrowCopy, 10, {
    color: '#9bd8ae', fontStyle: 'bold',
  });
  const title = text(scene, 0, 0, titleCopy, 14, {
    fontStyle: 'bold', wordWrap: { width: wrap },
  });
  const body = text(scene, 0, 0, bodyCopy, 12, {
    color: colors.muted, wordWrap: { width: wrap },
  });
  const source = text(scene, 0, 0, sourceCopy, 10, {
    color: '#1b1412', fontStyle: 'bold',
  });
  const survival = survivalCopy
    ? text(scene, 0, 0, survivalCopy, 11, {
      color: '#f0c9a0', wordWrap: { width: wrap },
    })
    : null;

  let cursorY = BUBBLE.padTop;
  eyebrow.setPosition(BUBBLE.padX + 8, cursorY);
  cursorY += eyebrow.height + 4;
  title.setPosition(BUBBLE.padX + 8, cursorY);
  cursorY += title.height + 5;
  body.setPosition(BUBBLE.padX + 8, cursorY);
  cursorY += body.height + 8;

  const chipPadX = 6;
  const chipPadY = 2;
  const chipW = source.width + chipPadX * 2;
  const chipH = source.height + chipPadY * 2;
  source.setPosition(BUBBLE.padX + 8 + chipPadX, cursorY + chipPadY);
  cursorY += chipH + 8;

  let survivalTop = 0;
  if (survival) {
    survivalTop = cursorY;
    survival.setPosition(BUBBLE.padX + 8, cursorY + 7);
    cursorY += survival.height + 14;
  }

  const height = Math.max(84, cursorY + 2);
  const g = scene.add.graphics();

  g.fillStyle(0x000000, 0.14);
  g.fillRoundedRect(3, 4, width, height, BUBBLE.radius);

  g.fillStyle(BUBBLE.fill, BUBBLE.fillAlpha);
  g.fillRoundedRect(0, 0, width, height, BUBBLE.radius);
  g.lineStyle(1.25, BUBBLE.stroke, 0.55);
  g.strokeRoundedRect(0, 0, width, height, BUBBLE.radius);

  g.fillStyle(BUBBLE.accent, 0.85);
  g.fillRoundedRect(0, 8, 3, height - 16, 2);

  g.fillStyle(0xe0b07a, 0.8);
  g.fillRoundedRect(BUBBLE.padX + 8, source.y - chipPadY, chipW, chipH, 5);

  if (survival) {
    g.fillStyle(0x2a201c, 0.45);
    g.fillRoundedRect(8, survivalTop, width - 16, height - survivalTop - 8, 7);
  }

  const tipX = 36;
  const tipY = height;
  g.fillStyle(BUBBLE.fill, BUBBLE.fillAlpha);
  g.fillTriangle(tipX, tipY - 1, tipX + 14, tipY - 1, tipX - 5, tipY + 11);
  g.lineStyle(1.25, BUBBLE.stroke, 0.55);
  g.lineBetween(tipX, tipY, tipX - 5, tipY + 11);
  g.lineBetween(tipX + 14, tipY, tipX - 5, tipY + 11);

  const kids = [g, eyebrow, title, body, source];
  if (survival) kids.push(survival);
  const view = scene.add.container(0, 0, kids);
  view.setData('height', height);
  return view;
}
