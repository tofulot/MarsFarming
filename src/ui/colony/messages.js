// AI-assisted (Claude Code): colony message box (auto-dismiss with a lifetime bar) and the shared bar helper.
import { colonyLayout } from './layout.js';
import { fontBody, theme } from '../theme.js';

/** Gap between the message box and the top of the weather strip (design px). */
const GAP_PX = 6;
const LEAVE_MS = 260;
const MIN_MS = 4000;
const MAX_MS = 9000;
const PER_CHAR_MS = 45;
export const WARNING_MS = 9000;

/** 4 s + 45 ms per character, clamped to 4–9 s; warnings always 9 s. */
export function messageLifetime(text, severity = 'info') {
  if (severity === 'warning') return WARNING_MS;
  return Math.min(MAX_MS, Math.max(MIN_MS, MIN_MS + PER_CHAR_MS * String(text ?? '').length));
}

const STYLE_ID = 'colony-messages-style';
const css = `
  .colony-life-bar { position:absolute; left:0; right:0; bottom:0; height:4px; pointer-events:none;
    background:${theme.accent}; transform:scaleX(0); transform-origin:left center;
    animation:colony-life-fill var(--life, 4s) linear forwards; }
  .is-life-paused .colony-life-bar { animation-play-state:paused; }
  @keyframes colony-life-fill { from { transform:scaleX(0); } to { transform:scaleX(1); } }
  .colony-msg { position:absolute; left:24px; box-sizing:border-box; max-width:600px; min-width:220px;
    padding:10px 44px 14px 14px; overflow:hidden; pointer-events:auto; z-index:31;
    color:${theme.ink}; background:${theme.panel}ed; border:1px solid ${theme.border}; border-radius:${theme.radiusPanel};
    box-shadow:0 4px 18px #140b0b55; font-family:${fontBody}; font-size:16px; line-height:1.3;
    transition:opacity ${LEAVE_MS}ms ease-out; }
  .colony-msg[hidden] { display:none; }
  .colony-msg.is-warning { border:2px solid ${theme.amber}; }
  .colony-msg.is-warning .colony-life-bar { background:${theme.amber}; }
  .colony-msg.is-leaving { opacity:0; }
  .colony-msg-close { position:absolute; right:7px; top:6px; width:28px; height:28px; padding:0; line-height:1;
    color:${theme.ink}; background:${theme.raised}; border:1px solid ${theme.border}; border-radius:${theme.radiusButton}; cursor:pointer; font-size:18px; }
  .colony-msg-close:hover { border-color:${theme.accent}; }
  .colony-msg-close:focus-visible { outline:2px solid #ffe9b8; outline-offset:1px; }
  @media (prefers-reduced-motion: reduce) {
    .colony-life-bar { animation:none; transform:scaleX(0); }
    .colony-msg { transition:none; }
  }
`;

export function ensureMessageStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.append(tag);
}

const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * Run one lifetime on `node`: appends a 4 px bar along its bottom edge that fills left to right over
 * `ms` (one CSS animation), then calls `onDone`. Hover or keyboard focus inside `node` pauses it.
 * With prefers-reduced-motion the bar stays still and a pausable timer ends the lifetime instead.
 * Returns `cancel()`.
 */
export function startLifetime(node, ms, onDone) {
  ensureMessageStyles();
  node.querySelectorAll(':scope > .colony-life-bar').forEach(old => old.remove());
  node.classList.remove('is-life-paused');
  const bar = document.createElement('span');
  bar.className = 'colony-life-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.setProperty('--life', `${ms}ms`);
  node.append(bar);

  let hovered = node.matches(':hover');
  let focused = node.contains(document.activeElement);
  let finished = false;
  const still = reducedMotion();
  let remaining = ms;
  let startedAt = 0;
  let timer = null;

  const done = () => {
    if (finished) return;
    finished = true;
    cleanup();
    onDone?.();
  };
  const runTimer = () => { startedAt = performance.now(); timer = setTimeout(done, remaining); };
  const stopTimer = () => {
    if (timer == null) return;
    clearTimeout(timer);
    timer = null;
    remaining = Math.max(0, remaining - (performance.now() - startedAt));
  };
  const sync = () => {
    const paused = hovered || focused;
    node.classList.toggle('is-life-paused', paused);
    if (!still) return;
    if (paused) stopTimer();
    else if (timer == null) runTimer();
  };
  const onEnd = (event) => { if (event.target === bar && event.animationName === 'colony-life-fill') done(); };
  const enter = () => { hovered = true; sync(); };
  const leave = () => { hovered = false; sync(); };
  const focusIn = () => { focused = true; sync(); };
  const focusOut = (event) => { focused = node.contains(event.relatedTarget); sync(); };
  function cleanup() {
    stopTimer();
    bar.removeEventListener('animationend', onEnd);
    node.removeEventListener('mouseenter', enter);
    node.removeEventListener('mouseleave', leave);
    node.removeEventListener('focusin', focusIn);
    node.removeEventListener('focusout', focusOut);
  }
  bar.addEventListener('animationend', onEnd);
  node.addEventListener('mouseenter', enter);
  node.addEventListener('mouseleave', leave);
  node.addEventListener('focusin', focusIn);
  node.addEventListener('focusout', focusOut);
  sync();
  return () => { if (!finished) { finished = true; cleanup(); } };
}

/** Top of the weather strip in design px: measured from the strip when mounted, else colonyLayout.forecast. */
function weatherTop(root) {
  const strip = document.querySelector('[data-weather-forecast]');
  const canvas = root.parentElement?.querySelector('canvas');
  if (strip && canvas) {
    const box = canvas.getBoundingClientRect();
    const sy = box.height / colonyLayout.height;
    const top = strip.getBoundingClientRect().top;
    if (sy > 0 && top > box.top) return (top - box.top) / sy;
  }
  return colonyLayout.forecast.y;
}

/**
 * Message box anchored by its bottom edge GAP_PX above the weather strip; grows upward.
 * `show(text, { severity })` replaces the current message and restarts its bar.
 * `sync(scene)` shows scene.message when scene.messageSeq (or the text) changes.
 */
export function createMessageBox(root) {
  ensureMessageStyles();
  const box = document.createElement('div');
  box.className = 'colony-msg';
  box.dataset.colonyMessage = '';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.hidden = true;
  const text = document.createElement('span');
  text.className = 'colony-msg-text';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'colony-msg-close';
  close.textContent = '×';
  close.title = 'Dismiss message';
  close.setAttribute('aria-label', 'Dismiss message');
  box.append(text, close);
  box.addEventListener('click', event => event.stopPropagation());
  root.append(box);

  let cancel = null;
  let leaveTimer = null;
  let shownKey;

  function hide() {
    cancel?.();
    cancel = null;
    clearTimeout(leaveTimer);
    box.classList.remove('is-leaving');
    box.hidden = true;
  }

  function fadeOut() {
    cancel = null;
    if (reducedMotion()) { hide(); return; }
    box.classList.add('is-leaving');
    leaveTimer = setTimeout(hide, LEAVE_MS);
  }

  close.addEventListener('click', (event) => { event.stopPropagation(); hide(); });

  function place() {
    box.style.bottom = `${colonyLayout.height - weatherTop(root) + GAP_PX}px`;
  }

  function show(message, { severity = 'info' } = {}) {
    if (!message) return;
    hide();
    text.textContent = message;
    box.classList.toggle('is-warning', severity === 'warning');
    box.dataset.severity = severity;
    place();
    box.hidden = false;
    cancel = startLifetime(box, messageLifetime(message, severity), fadeOut);
  }

  function sync(scene) {
    if (!scene?.message) return;
    const key = scene.messageSeq ?? scene.message;
    if (key === shownKey) return;
    shownKey = key;
    show(scene.message, { severity: scene.messageSeverity });
  }

  return { element: box, show, hide, sync, place };
}
