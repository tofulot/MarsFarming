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

  await page.goto(`${origin}${config.base}?demo=1`);
  await active('Title');
  await pressButton('Title', 'Start survival');
  await active('UI');
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
  await active('Report');
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
  console.log('Rescue, colony naming, crop journal, re-fly, abandon confirmation, archived weather, zoom, and sol transitions verified.');
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
