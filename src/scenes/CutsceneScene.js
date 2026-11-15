// AI-assisted (Claude): plays a pre-rendered cutscene (cutscene/ Remotion project) full-screen, then fades
// to black and starts the next scene. Skippable with a click, Escape, Space or Enter.
// Clips: 'intro' (crash, after landing -> Colony) and 'outro' (liftoff, after a rescue -> Report).
import Phaser from 'phaser';
import { fitOverCanvas, showVeil } from '../ui/veil.js';
import { fontBody, fontDisplay, theme } from '../ui/theme.js';

const SKIP_GUARD_MS = 400; // ignore the key or click that started the clip
const STALL_MS = 14000; // never strand the player if the video can't play
const SKIP_FADE_MS = 280;

export const clipSources = (clip = 'intro') => {
  const base = `${import.meta.env.BASE_URL}assets/cutscene/`;
  return [{ src: `${base}${clip}.webm`, type: 'video/webm' }, { src: `${base}${clip}.mp4`, type: 'video/mp4' }];
};
export const introSources = () => clipSources('intro');

/** Warm the browser cache for a clip (one request, low priority). */
export function prefetchClip(clip) {
  if (document.querySelector(`link[data-cutscene-prefetch="${clip}"]`)) return;
  const probe = document.createElement('video');
  const sources = clipSources(clip);
  const { src } = sources.find(({ type }) => probe.canPlayType(type)) ?? sources[1];
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = src;
  link.dataset.cutscenePrefetch = clip;
  document.head.append(link);
}

export class CutsceneScene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  /**
   * data: { clip, next, nextData, card?: { title, subtitle, at } }.
   * Older callers passed mission options directly; that still plays the intro into the colony.
   */
  create(data = {}) {
    const clip = data.clip ?? 'intro';
    const next = data.next ?? 'Colony';
    const nextData = data.nextData ?? { ...data, fromCutscene: true };
    this.cameras.main.setBackgroundColor('#000000');
    const canvas = this.game.canvas;
    const host = canvas.parentElement;
    host.style.position ||= 'relative';
    const startedAt = performance.now();
    let done = false;
    const timers = [];

    const root = document.createElement('div');
    root.className = 'intro-cutscene';
    root.dataset.clip = clip;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', clip === 'outro'
      ? 'Ending cutscene: the rescue ship leaves Mars. Press Escape to skip.'
      : 'Intro cutscene: your rocket crashes on Mars. Press Escape to skip.');
    Object.assign(root.style, { position: 'absolute', zIndex: '55', background: '#000', overflow: 'hidden', cursor: 'pointer' });

    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' });
    for (const { src, type } of clipSources(clip)) {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip ›';
    skip.setAttribute('aria-label', clip === 'outro' ? 'Skip ending' : 'Skip intro');
    Object.assign(skip.style, {
      position: 'absolute', right: '2.2%', bottom: '3.5%', padding: '6px 14px', borderRadius: theme.radiusButton,
      font: `20px ${fontBody}`, color: theme.ink, background: '#00000080', border: `1px solid ${theme.border}`,
      cursor: 'pointer', opacity: '0', transition: 'opacity 300ms', letterSpacing: '0.04em',
    });
    root.append(video, skip);

    // Optional text card drawn over the video (so it can show the player's colony name).
    let card;
    if (data.card) {
      card = document.createElement('div');
      card.className = 'cutscene-card';
      card.setAttribute('aria-live', 'polite');
      Object.assign(card.style, {
        position: 'absolute', left: '0', right: '0', top: '6%', textAlign: 'center', pointerEvents: 'none',
        opacity: '0', transition: 'opacity 700ms ease-out', textShadow: '0 2px 12px #000, 0 0 2px #000',
      });
      const title = document.createElement('div');
      title.textContent = data.card.title;
      Object.assign(title.style, { font: `700 clamp(36px, 8vw, 88px) ${fontDisplay}`, letterSpacing: '0.08em', color: '#ffd27a', lineHeight: '1' });
      card.append(title);
      if (data.card.subtitle) {
        const sub = document.createElement('div');
        sub.textContent = data.card.subtitle;
        Object.assign(sub.style, { font: `clamp(16px, 2.2vw, 26px) ${fontBody}`, color: theme.ink, marginTop: '0.4em', letterSpacing: '0.04em' });
        card.append(sub);
      }
      root.append(card);
      const showAt = data.card.at ?? 0;
      const hideAt = data.card.hideAt ?? Infinity;
      video.addEventListener('timeupdate', () => {
        const visible = video.currentTime >= showAt && video.currentTime < hideAt;
        card.style.opacity = visible ? '1' : '0';
      });
    }

    host.append(root);
    const fit = fitOverCanvas(canvas, root);
    window.addEventListener('resize', fit);
    timers.push(setTimeout(() => { skip.style.opacity = '1'; }, SKIP_GUARD_MS + 200));

    const finish = ({ skipped = false } = {}) => {
      if (done) return;
      done = true;
      // The clips end on black; a skip fades to black first.
      showVeil(canvas, { fadeMs: skipped ? SKIP_FADE_MS : 0 });
      timers.push(setTimeout(() => {
        video.pause();
        this.scene.start(next, nextData);
      }, skipped ? SKIP_FADE_MS : 0));
    };
    const trySkip = () => {
      if (performance.now() - startedAt < SKIP_GUARD_MS) return;
      finish({ skipped: true });
    };

    video.addEventListener('ended', () => finish());
    video.addEventListener('error', () => finish(), true);
    root.addEventListener('click', trySkip);
    skip.addEventListener('click', (event) => { event.stopPropagation(); trySkip(); });
    const onKey = (event) => {
      if (event.repeat || !['Escape', 'Space', 'Enter', 'NumpadEnter'].includes(event.code)) return;
      event.preventDefault();
      trySkip();
    };
    window.addEventListener('keydown', onKey);
    timers.push(setTimeout(() => finish(), STALL_MS));

    // The player has interacted with the page, so sound is normally allowed; fall back to muted.
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => finish());
    });

    this.events.once('shutdown', () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
      root.remove();
    });
  }
}
