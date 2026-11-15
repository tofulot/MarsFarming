import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import config from '../vite.config.js';

const output = await mkdtemp(join(tmpdir(), 'red-harvest-browser-'));
const origin = 'http://red-harvest.test';
let browser;

try {
  await build({
    build: { outDir: output, emptyOutDir: true },
    plugins: [{
      name: 'expose-game-for-browser-check',
      transform(source, id) {
        if (id.endsWith('/src/main.js')) {
          return source.replace('new Phaser.Game(', 'window.missionTestGame = new Phaser.Game(');
        }
      },
    }],
  });
  // CHROME_PATH lets the check run against an installed Chrome when Playwright's Chromium is absent.
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      ...(process.env.CHROME_PATH ? ['--no-sandbox'] : [])],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.route(`${origin}${config.base}**`, async (route) => {
    const file = new URL(route.request().url()).pathname.slice(config.base.length) || 'index.html';
    const local = join(output, file);
    // The game falls back to demo-events.json when the optional event pack is absent.
    if (file === 'data/events.json') {
      try {
        return await route.fulfill({ path: local });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return route.fulfill({ status: 404 });
      }
    }
    if (file !== 'data/balance.json') return route.fulfill({ path: local });
    const balance = JSON.parse(await readFile(local, 'utf8'));
    // Use the real end-of-sol rules with a short rescue deadline.
    balance.rescue.arrivalSol = 3;
    return route.fulfill({ json: balance });
  });

  const active = async (key) => {
    try {
      await page.waitForFunction((scene) =>
        window.missionTestGame?.scene.isActive(scene), key, { timeout: 10000 });
    } catch (error) {
      const scenes = await page.evaluate(() =>
        window.missionTestGame?.scene.getScenes(true).map((scene) => scene.sys.settings.key));
      throw new Error(`Expected ${key}. Active scenes: ${scenes?.join(', ')}. Page errors: ${errors.join(', ')}`, { cause: error });
    }
  };
  const hasText = (scene, text) => page.waitForFunction(([key, copy]) =>
    window.missionTestGame.scene.getScene(key).children.list.some((item) => item.text === copy),
  [scene, text], { timeout: 10000 });
  const pressButton = async (scene, text) => {
    await hasText(scene, text);
    await page.evaluate(([key, copy]) => {
      const { list } = window.missionTestGame.scene.getScene(key).children;
      const label = list.find((item) => item.text === copy);
      const button = list.find((item) => item.input?.enabled && item.listenerCount('pointerdown')
        && item.getBounds().contains(label.x, label.y));
      if (!button) throw new Error(`No enabled ${key} button for ${copy}`);
      button.emit('pointerdown');
    }, [scene, text]);
  };

  // The intro cutscene plays between every "land" button and the colony.
  const throughIntro = async ({ skip }) => {
    await active('Cutscene');
    await page.waitForFunction(() => {
      const video = document.querySelector('.intro-cutscene video');
      return video && !video.paused && video.currentTime > 0.3;
    }, undefined, { timeout: 10000 });
    if (skip === 'key') await page.keyboard.press('Escape');
    if (skip === 'button') await page.getByRole('button', { name: 'Skip intro' }).click();
    await page.waitForFunction(() => window.missionTestGame.scene.isActive('UI'), undefined, { timeout: skip ? 10000 : 20000 });
    assert.equal(await page.locator('.intro-cutscene').count(), 0);
    // The first achievement waits for the fade from black.
    await page.waitForFunction(() => !document.getElementById('red-harvest-veil'), undefined, { timeout: 10000 });
    await page.waitForSelector('.colony-award', { timeout: 10000 });
  };

  await page.goto(`${origin}${config.base}?demo=1`);
  await active('Title');
  await pressButton('Title', 'Start survival');
  await throughIntro({ skip: false });
  await active('UI');
  // One top strip (sol dial, five resource chips, speed, tabs) inside 1280×720, in the bundled font pair.
  const strip = await page.evaluate(() => {
    const bar = document.querySelector('.colony-hud-bar');
    const box = bar.getBoundingClientRect();
    const canvas = document.querySelector('canvas').getBoundingClientRect();
    const scale = canvas.height / 720;
    const loaded = new Set([...document.fonts].filter(face => face.status === 'loaded').map(face => face.family.replace(/["']/g, '')));
    return {
      bottom: (box.bottom - canvas.top) / scale,
      chips: bar.querySelectorAll('.colony-hud-chip').length,
      escaped: [...bar.querySelectorAll('*')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > box.right + 1 || r.left < box.left - 1);
      }).length,
      clipped: [...bar.querySelectorAll('.colony-hud-chip-copy, .colony-hud-rescue')]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
      tabs: ['base', 'ops', 'goals'].every(id => bar.querySelector(`#colony-tab-${id}[role="tab"]`)),
      zoom: Boolean(document.querySelector('.colony-hud-zoom [aria-label="Zoom in"]')),
      fonts: ['Amatic SC', 'Patrick Hand'].filter(family => loaded.has(family)),
    };
  });
  assert.ok(strip.bottom <= 70, `top strip ends at ${strip.bottom}`);
  assert.equal(strip.chips, 5);
  assert.equal(strip.escaped, 0);
  assert.deepEqual(strip.clipped, []);
  assert.ok(strip.tabs && strip.zoom);
  assert.deepEqual(strip.fonts, ['Amatic SC', 'Patrick Hand']);
  // The DOM forecast strip lists 15 forecast sols plus today; a cell opens a card with the colony effects.
  const forecastCells = '[data-weather-forecast] button[data-sol]';
  await page.waitForFunction((selector) => document.querySelectorAll(selector).length >= 16, forecastCells);
  await page.locator(forecastCells).nth(1).click();
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-weather-detail]')?.textContent ?? '';
    return card.includes('Hab heat') && card.includes('Ice yield') && card.includes('Pa');
  });
  await page.locator('[aria-label="Close weather details"]').click();

  const lighting = await page.evaluate(() => {
    const scene = window.missionTestGame.scene.getScene('Colony');
    const { dayGlow, nightShade, weatherLayer } = scene.presentation;
    const { graphics } = weatherLayer;
    const fillStyle = graphics.fillStyle;
    let cloud;
    graphics.fillStyle = function (color, alpha) {
      if (color === 0xd7e5ee) cloud = alpha;
      return fillStyle.call(this, color, alpha);
    };
    const frameAt = (progress) => {
      scene.acc = scene.dataSet.balance.solMs * progress;
      weatherLayer.nextFrame = 0;
      scene.update(scene.time.now, 0);
      return { cloud, day: dayGlow.alpha, night: nightShade.alpha, sol: scene.sim.state.sol };
    };
    try {
      const dawn = frameAt(0);
      const noon = frameAt(0.25);
      const night = frameAt(0.75);
      const nextDawn = frameAt(1);
      scene.sim.command({ type: 'setSpeed', speed: 1 });
      scene.update(scene.time.now, 0);
      scene.sim.command({ type: 'setSpeed', speed: 0 });
      return { dawn, noon, night, nextDawn, afterRollover: frameAt(0) };
    } finally {
      graphics.fillStyle = fillStyle;
    }
  });
  const { dawn, noon, night, nextDawn, afterRollover } = lighting;
  assert.ok(dawn.cloud < noon.cloud && noon.cloud < night.cloud && night.cloud < nextDawn.cloud);
  assert.ok(noon.day > night.day && night.night > noon.night);
  assert.equal(nextDawn.sol, dawn.sol);
  assert.equal(afterRollover.sol, dawn.sol + 1);
  assert.ok(Math.abs(nextDawn.cloud - afterRollover.cloud) < 1e-9);
  assert.ok(Math.abs(nextDawn.day - afterRollover.day) < 1e-9);
  assert.ok(Math.abs(nextDawn.night - afterRollover.night) < 1e-9);

  // Halfway Home (sol 2 of 3 here) pauses fast-forward and asks for a colony name.
  // Typing R and F must not trigger the demo hotkeys while the dialog is open.
  await page.keyboard.press('f');
  await page.waitForSelector('dialog[open] input', { timeout: 15000 });
  await page.locator('dialog[open] input').fill('');
  await page.keyboard.type('Fort Radish');
  await page.locator('dialog[open] button[value="save"]').click();
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Colony').sim.state.rescue.colonyName === 'Fort Radish');
  assert.equal(await page.evaluate(() => window.missionTestGame.scene.getScene('Colony').sim.state.status), 'active');
  await page.keyboard.press('f');
  // A rescue plays the liftoff cutscene; watch it to the end, including the title card with the colony name.
  await active('Cutscene');
  await page.waitForSelector('.intro-cutscene[data-clip="outro"] video', { timeout: 5000 });
  await page.waitForFunction(() => {
    const card = document.querySelector('.cutscene-card');
    return card && getComputedStyle(card).opacity > 0.5;
  }, undefined, { timeout: 15000 });
  const cardText = await page.locator('.cutscene-card').textContent();
  assert.match(cardText, /Rescued/);
  assert.match(cardText, /Fort Radish · Sol 3/);
  await active('Report');
  await page.waitForFunction(() => !document.getElementById('red-harvest-veil'), undefined, { timeout: 10000 });
  await hasText('Report', 'Rescue successful');
  await pressButton('Report', 'Crop journal');
  await hasText('Report', 'Crop discoveries');
  await pressButton('Report', 'Back to report');
  await hasText('Report', 'Rescue successful');
  await pressButton('Report', 'Try another landing site →');
  await active('Map');
  await pressButton('Map', 'Back');
  await active('Title');
  await pressButton('Title', 'Start survival');
  await throughIntro({ skip: 'key' });
  await active('UI');
  assert.equal(await page.evaluate(() => window.missionTestGame.scene.getScene('Colony').sim.state.sol), 0);

  const respondToAbandon = async (accept) => {
    const abandon = page.getByRole('button', { name: 'Abandon colony' });
    if (!(await abandon.isVisible())) await page.locator('#colony-tab-ops').click();
    await abandon.click();
    const dialog = page.locator('dialog[open]');
    assert.match(await dialog.textContent(), /abandon/i);
    await dialog.locator(`button[value="${accept ? 'confirm' : 'cancel'}"]`).click();
  };
  await respondToAbandon(false);
  await active('UI');
  assert.equal(await page.evaluate(() => window.missionTestGame.scene.getScene('Colony').sim.state.status), 'active');
  await respondToAbandon(true);
  await active('Report');
  await hasText('Report', 'Mission abandoned');

  await pressButton('Report', 'Try another landing site →');
  await active('Map');
  await pressButton('Map', 'Autumn\nSpring');
  await hasText('Map', 'Landing season · Lₛ 180°');
  await page.evaluate(() => {
    const scene = window.missionTestGame.scene.getScene('Map');
    const gale = { x: 838, y: 400 };
    scene.atlas.emit('pointerdown', gale);
    scene.input.emit('pointerup', gale);
  });
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Map').children.list.some(({ text }) =>
    text?.includes('storm sols in a 3-sol window')));
  await pressButton('Map', 'Land and establish base →');
  await throughIntro({ skip: 'button' });
  await active('UI');
  const outlook = await page.evaluate(() => {
    const { sim } = window.missionTestGame.scene.getScene('Colony');
    return { now: sim.getWeather(), days: sim.forecastWeather(15).days };
  });
  assert.equal(outlook.now.Ls, 180);
  assert.ok(outlook.now.archiveYear >= 25 && outlook.now.archiveYear <= 36);
  assert.equal(outlook.days.length, 15);
  assert.ok(outlook.days.every(({ atmosphereFactor, pressurePa }) => Number.isFinite(atmosphereFactor) && pressurePa > 0));

  await page.keyboard.press('1');
  await page.waitForFunction(() => {
    const scene = window.missionTestGame.scene.getScene('Colony');
    return scene.presentation.weatherLayer.weather?.conditions.storm === 'dustRegional';
  });
  await page.locator('[aria-label="Zoom in"]').click();
  await page.waitForFunction(() => {
    const scene = window.missionTestGame.scene.getScene('Colony');
    const layer = scene.presentation.weatherLayer;
    return scene.boardZoom > 1 && layer.lastZoom === scene.boardZoom && layer.graphics.mask === layer.mask;
  });
  const canvas = await page.locator('canvas').first().boundingBox();
  assert.ok(canvas);
  const point = (x, y) => [canvas.x + x * canvas.width / 1280, canvas.y + y * canvas.height / 720];
  await page.evaluate(() => { window.missionTestGame.scene.getScene('Colony').selected = null; });
  await page.mouse.click(...point(300, 300));
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Colony').selected != null);

  assert.deepEqual(errors, []);
  console.log('Intro cutscene (played, key skip, button skip), rescue cutscene with title card, rescue, colony naming, crop journal, re-fly, abandon confirmation, archived weather, zoom, and sol transitions verified.');
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
