// AI-assisted (Cursor)
import { colors, text } from './controls.js';
import {
  drawHelperBotanist, helperSlot, pickSpaceFact,
} from './helperBotanist.js';

const BUBBLE = Object.freeze({
  width: 372,
  padX: 18,
  padTop: 14,
  radius: 14,
  fill: 0x1c1518,
  stroke: 0xe0b07a,
  accent: 0x9bd8ae,
  holdMs: 5600,
});

/**
 * Mount the helper botanist and show NASA fact toasts.
 * A new fact replaces any visible bubble immediately.
 * Helper sits lower-left; bubbles open upward.
 */
export function playFactCards(scene, { facts = [], y = 300 } = {}) {
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

    const bubbleY = Math.min(y, 300);
    const bubbleX = 22;
    const view = buildFactBubble(scene, card);
    view.setPosition(bubbleX, bubbleY + 12).setAlpha(0).setScale(0.96).setDepth(27);

    const enter = scene.tweens.add({
      targets: view,
      alpha: 1,
      y: bubbleY,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });

    const hold = scene.tweens.add({
      targets: view,
      alpha: 1,
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

/** Rounded speech bubble with accent bar, source chip, and optional survival strip. */
function buildFactBubble(scene, card) {
  const width = BUBBLE.width;
  const isClick = card.milestone === 'click_space_fact';
  const eyebrowCopy = isClick ? 'SPACE FACT' : 'NASA FACT';
  const titleCopy = card.title ?? 'Mission fact';
  const bodyCopy = card.text ?? '';
  const sourceCopy = String(card.source ?? '—');
  const survivalCopy = card.survival ? `Survival tip · ${card.survival}` : '';

  const wrap = width - BUBBLE.padX * 2 - 10;
  const eyebrow = text(scene, 0, 0, eyebrowCopy, 11, {
    color: '#9bd8ae', fontStyle: 'bold',
  });
  const title = text(scene, 0, 0, titleCopy, 17, {
    fontStyle: 'bold', wordWrap: { width: wrap },
  });
  const body = text(scene, 0, 0, bodyCopy, 13, {
    color: colors.muted, wordWrap: { width: wrap },
  });
  const source = text(scene, 0, 0, sourceCopy, 11, {
    color: '#1b1412', fontStyle: 'bold',
  });
  const survival = survivalCopy
    ? text(scene, 0, 0, survivalCopy, 12, {
      color: '#f0c9a0', wordWrap: { width: wrap },
    })
    : null;

  let cursorY = BUBBLE.padTop;
  eyebrow.setPosition(BUBBLE.padX + 10, cursorY);
  cursorY += eyebrow.height + 6;
  title.setPosition(BUBBLE.padX + 10, cursorY);
  cursorY += title.height + 8;
  body.setPosition(BUBBLE.padX + 10, cursorY);
  cursorY += body.height + 12;

  const chipPadX = 8;
  const chipPadY = 3;
  const chipW = source.width + chipPadX * 2;
  const chipH = source.height + chipPadY * 2;
  source.setPosition(BUBBLE.padX + 10 + chipPadX, cursorY + chipPadY);
  cursorY += chipH + 10;

  let survivalTop = 0;
  if (survival) {
    survivalTop = cursorY;
    survival.setPosition(BUBBLE.padX + 10, cursorY + 10);
    cursorY += survival.height + 20;
  }

  const height = Math.max(96, cursorY + 4);
  const g = scene.add.graphics();

  // Soft drop shadow
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(4, 6, width, height, BUBBLE.radius);

  // Card face
  g.fillStyle(BUBBLE.fill, 0.97);
  g.fillRoundedRect(0, 0, width, height, BUBBLE.radius);
  g.lineStyle(1.5, BUBBLE.stroke, 0.85);
  g.strokeRoundedRect(0, 0, width, height, BUBBLE.radius);

  // Left accent bar
  g.fillStyle(BUBBLE.accent, 1);
  g.fillRoundedRect(0, 10, 4, height - 20, 2);

  // Source chip
  g.fillStyle(0xe0b07a, 1);
  g.fillRoundedRect(BUBBLE.padX + 10, source.y - chipPadY, chipW, chipH, 6);

  // Survival strip
  if (survival) {
    g.fillStyle(0x2a201c, 1);
    g.fillRoundedRect(10, survivalTop, width - 20, height - survivalTop - 10, 8);
  }

  // Speech pointer toward helper (bottom-left)
  const tipX = 42;
  const tipY = height;
  g.fillStyle(BUBBLE.fill, 0.97);
  g.fillTriangle(tipX, tipY - 1, tipX + 16, tipY - 1, tipX - 6, tipY + 14);
  g.lineStyle(1.5, BUBBLE.stroke, 0.85);
  g.lineBetween(tipX, tipY, tipX - 6, tipY + 14);
  g.lineBetween(tipX + 16, tipY, tipX - 6, tipY + 14);

  const kids = [g, eyebrow, title, body, source];
  if (survival) kids.push(survival);
  return scene.add.container(0, 0, kids);
}
