// AI-assisted (Claude): plays the pre-rendered intro (cutscene/ Remotion project) after Start,
// then fades to black and starts the colony. Skippable with a click, Escape, Space or Enter.
import Phaser from 'phaser';
import { fitOverCanvas, showVeil } from '../ui/veil.js';
import { fontBody, theme } from '../ui/theme.js';

const SKIP_GUARD_MS = 400; // ignore the key or click that started the mission
const STALL_MS = 12000; // never strand the player if the video can't play
const SKIP_FADE_MS = 280;

export const introSources = () => {
  const base = `${import.meta.env.BASE_URL}assets/cutscene/`;
  return [{ src: `${base}intro.webm`, type: 'video/webm' }, { src: `${base}intro.mp4`, type: 'video/mp4' }];
};

export class CutsceneScene extends Phaser.Scene {
  constructor() { super('Cutscene'); }

  create(options) {
    this.cameras.main.setBackgroundColor('#000000');
    const canvas = this.game.canvas;
    const host = canvas.parentElement;
    host.style.position ||= 'relative';
    const startedAt = performance.now();
    let done = false;
    const timers = [];

    const root = document.createElement('div');
    root.className = 'intro-cutscene';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Intro cutscene: your rocket crashes on Mars. Press Escape to skip.');
    Object.assign(root.style, { position: 'absolute', zIndex: '55', background: '#000', overflow: 'hidden', cursor: 'pointer' });

    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' });
    for (const { src, type } of introSources()) {
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip ›';
    skip.setAttribute('aria-label', 'Skip intro');
    Object.assign(skip.style, {
      position: 'absolute', right: '2.2%', bottom: '3.5%', padding: '6px 14px', borderRadius: theme.radiusButton,
      font: `20px ${fontBody}`, color: theme.ink, background: '#00000080', border: `1px solid ${theme.border}`,
      cursor: 'pointer', opacity: '0', transition: 'opacity 300ms', letterSpacing: '0.04em',
    });
    root.append(video, skip);
    host.append(root);
    const fit = fitOverCanvas(canvas, root);
    window.addEventListener('resize', fit);
    timers.push(setTimeout(() => { skip.style.opacity = '1'; }, SKIP_GUARD_MS + 200));

    const finish = ({ skipped = false } = {}) => {
      if (done) return;
      done = true;
      // The video already ends on black; a skip fades to black first.
      showVeil(canvas, { fadeMs: skipped ? SKIP_FADE_MS : 0 });
      timers.push(setTimeout(() => {
        video.pause();
        this.scene.start('Colony', { ...options, fromCutscene: true });
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

    // Pressing Start counts as a user gesture, so sound is normally allowed; fall back to muted.
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
