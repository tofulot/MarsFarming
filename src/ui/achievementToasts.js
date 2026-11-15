// AI-assisted (Claude Code): DOM achievement card for the colony HUD; Phaser card kept for ReportScene.
import { advancementUnlocks } from '../sim/advancements.js';
import { colors, panel, text } from './controls.js';
import { startLifetime } from './colony/messages.js';
import { theme } from './theme.js';

const HOLD_MS = 3600;
const QUEUED_HOLD_MS = 2400;
const LEAVE_MS = 280;

function playChime(scene) {
  if (scene.cache.audio.exists('achievement-chime')) {
    scene.sound.play('achievement-chime', { volume: 0.55 });
  }
}

function unlockNames(scene, award) {
  const data = scene.dataSet ?? scene.registry?.get('missionData');
  return data ? advancementUnlocks(award.id, data) : [];
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3} more` : ''}`;
}

export function rewardLine(award) {
  return award.credits ? `+${award.credits} kg materials` : '';
}

// Phaser card. Used where there is no DOM HUD (ReportScene).
export function playAchievementToasts(scene, queue, y = 154, x = 917) {
  let playing = false;

  function showNext() {
    if (playing || !queue.length) return;
    playing = true;
    const award = queue[0];
    const unlocks = unlockNames(scene, award);
    const detail = [`Sol ${award.sol}`, rewardLine(award), unlocks.length ? `Unlocks ${joinNames(unlocks)}` : '']
      .filter(Boolean).join(' · ');
    const badge = scene.add.star(27, 33, 5, 6, 13, colors.mint);
    const detailText = text(scene, 49, 47, detail, 12, { color: colors.muted, wordWrap: { width: 252 } });
    const card = scene.add.container(x, y - 10, [
      panel(scene, 0, 0, 308, Math.max(70, 55 + detailText.height), 0x26201f).setStrokeStyle(1, colors.mint),
      badge,
      text(scene, 49, 8, 'ACHIEVEMENT UNLOCKED', 11, { color: '#9bd8ae', fontStyle: 'bold' }),
      text(scene, 49, 23, award.name, 18, { fontStyle: 'bold' }),
      detailText,
    ]).setAlpha(0).setDepth(10);

    scene.tweens.chain({
      targets: card,
      tweens: [
        { y, alpha: 1, duration: 160, hold: 2800 },
        { y: y - 10, alpha: 0, duration: 180 },
      ],
      onStart: () => playChime(scene),
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

const STAR_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
  <defs><radialGradient id="award-glow" cx="50%" cy="45%" r="55%">
    <stop offset="0" stop-color="#ffe9a8"/><stop offset=".6" stop-color="#f0b45a"/><stop offset="1" stop-color="#c8702f"/>
  </radialGradient></defs>
  <circle cx="32" cy="32" r="29" fill="#3a2623" stroke="#f0b45a" stroke-width="2"/>
  <circle cx="32" cy="32" r="23" fill="none" stroke="#f0886a" stroke-width="1" stroke-dasharray="3 4"/>
  <path d="M32 12 L37.6 25.2 L51.6 26.4 L41 35.6 L44.2 49.4 L32 42 L19.8 49.4 L23 35.6 L12.4 26.4 L26.4 25.2 Z"
    fill="url(#award-glow)" stroke="#fff3cf" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

export const achievementCardCss = `
  .colony-award { position:absolute; left:640px; top:134px; z-index:40; width:440px; box-sizing:border-box; display:grid; overflow:hidden;
    grid-template-columns:72px minmax(0,1fr); gap:6px 16px; align-items:center; padding:16px 20px 16px 16px; pointer-events:auto; cursor:pointer;
    color:#f5e9e2; background:linear-gradient(160deg,#3a2623 0%,#231615 70%); border:2px solid #f0b45a; border-radius:14px;
    box-shadow:0 0 0 4px #f0b45a22, 0 10px 34px #0b0505cc, 0 0 40px #f0b45a44; transform-origin:50% 0;
    animation:colony-award-in .42s cubic-bezier(.2,1.5,.4,1) both; }
  .colony-award.is-leaving { animation:colony-award-out ${LEAVE_MS}ms ease-in both; }
  /* With the side panel open, centre on the visible map instead of the whole screen. */
  .colony-hud-root:has(#colony-side-panel:not([hidden])) .colony-award { left:406px; }
  .colony-award .colony-life-bar { background:${theme.amber}; }
  .colony-award-badge { grid-row:1 / span 4; width:72px; height:72px; display:grid; place-items:center;
    animation:colony-award-badge 1.6s ease-in-out .3s infinite; filter:drop-shadow(0 0 8px #f0b45a99); }
  .colony-award-kicker { color:#ffd27a; font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }
  .colony-award-name { font-size:26px; font-weight:800; line-height:1.1; }
  .colony-award-reward { font-size:30px; font-weight:900; line-height:1.05; color:#ffd27a; text-shadow:0 0 14px #f0b45a66; }
  .colony-award-reward small { font-size:16px; font-weight:800; color:#f5e9e2; margin-left:4px; }
  .colony-award-unlock { color:#cfe8c9; font-size:14px; font-weight:700; line-height:1.3; }
  .colony-award-unlock b { color:#9bd8ae; }
  .colony-award-sol { color:#c9b3a8; font-size:12px; font-weight:700; }
  @keyframes colony-award-in { 0% { opacity:0; transform:translate(-50%,-26px) scale(.7); }
    100% { opacity:1; transform:translate(-50%,0) scale(1); } }
  @keyframes colony-award-out { 0% { opacity:1; transform:translate(-50%,0) scale(1); }
    100% { opacity:0; transform:translate(-50%,-18px) scale(.92); } }
  @keyframes colony-award-badge { 0%,100% { transform:scale(1) rotate(0); } 50% { transform:scale(1.1) rotate(-8deg); } }
  @media (prefers-reduced-motion: reduce) {
    .colony-award,.colony-award.is-leaving,.colony-award-badge { animation:none; }
    .colony-award { transform:translateX(-50%); }
    .colony-award.is-leaving { opacity:0; }
  }
`;

// DOM card shown inside the colony HUD root so no HUD panel can cover it.
// Awards are queued until the HUD has mounted (UIScene launches after ColonyScene.create)
// and while a modal dialog is open. Timers are wall-clock so they match the CSS animations.
export function playColonyAchievementToasts(scene, queue, { onDone } = {}) {
  let playing = false;
  let waiting = false;
  let disposed = false;
  const timers = new Set();
  const later = (ms, fn) => {
    const id = setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
  };
  scene.events.once('shutdown', () => {
    disposed = true;
    timers.forEach(clearTimeout);
    timers.clear();
  });

  function finish(node, award) {
    if (node.dataset.leaving) return;
    node.dataset.leaving = '1';
    node.cancelLifetime?.();
    node.classList.add('is-leaving');
    later(LEAVE_MS, () => {
      node.remove();
      queue.shift();
      playing = false;
      scene.hud?.pulseTab?.('goals');
      onDone?.(award);
      showNext();
    });
  }

  function showNext() {
    if (disposed || playing || !queue.length) return;
    const root = scene.hud?.root;
    if (!root?.isConnected || document.querySelector('dialog[open]')) {
      if (!waiting) {
        waiting = true;
        later(200, () => { waiting = false; showNext(); });
      }
      return;
    }
    playing = true;
    const award = queue[0];
    const unlocks = unlockNames(scene, award);
    const node = document.createElement('div');
    node.className = 'colony-award';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.title = 'Click to dismiss';
    const badge = document.createElement('div');
    badge.className = 'colony-award-badge';
    badge.innerHTML = STAR_SVG;
    const kicker = document.createElement('div');
    kicker.className = 'colony-award-kicker';
    kicker.textContent = 'Achievement unlocked';
    const name = document.createElement('div');
    name.className = 'colony-award-name';
    name.textContent = award.name;
    node.append(badge, kicker, name);
    if (award.credits) {
      const reward = document.createElement('div');
      reward.className = 'colony-award-reward';
      reward.textContent = `+${award.credits} kg`;
      const unit = document.createElement('small');
      unit.textContent = 'build materials';
      reward.append(unit);
      node.append(reward);
    }
    const unlock = document.createElement('div');
    unlock.className = unlocks.length ? 'colony-award-unlock' : 'colony-award-sol';
    if (unlocks.length) {
      const label = document.createElement('b');
      label.textContent = 'Unlocks ';
      unlock.append(label, joinNames(unlocks));
    } else {
      unlock.textContent = `Sol ${award.sol} · See Goals for what's next`;
    }
    node.append(unlock);
    root.append(node);
    playChime(scene);
    node.addEventListener('click', (event) => { event.stopPropagation(); finish(node, award); });
    // Same bottom lifetime bar as the message box (messages.js); hovering the card holds it.
    node.cancelLifetime = startLifetime(node, queue.length > 1 ? QUEUED_HOLD_MS : HOLD_MS, () => {
      if (!disposed) finish(node, award);
    });
  }

  showNext();
  // urgent awards jump the queue and play right after the card on screen.
  return (award, { urgent = false } = {}) => {
    if (urgent) queue.splice(playing ? 1 : 0, 0, award);
    else queue.push(award);
    showNext();
  };
}
