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
  browser = await chromium.launch({
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
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
    const respond = page.waitForEvent('dialog', { timeout: 10000 }).then(async (dialog) => {
      const message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      assert.match(message, /abandon/i);
    });
    await Promise.all([respond, pressButton('UI', 'Abandon')]);
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
  await pressButton('Colony', '+');
  await page.waitForFunction(() => {
    const scene = window.missionTestGame.scene.getScene('Colony');
    const layer = scene.presentation.weatherLayer;
    return scene.boardZoom > 1 && layer.lastZoom === scene.boardZoom && layer.graphics.mask === layer.mask;
  });
  const canvas = await page.locator('canvas').first().boundingBox();
  assert.ok(canvas);
  const point = (x, y) => [canvas.x + x * canvas.width / 1280, canvas.y + y * canvas.height / 720];
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Colony').input._list.some((item) =>
    item.x === 120 && item.y === 44 && item.listenerCount('pointerdown')));
  await page.mouse.move(...point(100, 50));
  await page.mouse.move(...point(144, 51), { steps: 4 });
  await page.mouse.click(...point(144, 51));
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Colony').children.list.some(({ text }) =>
    text?.includes('Hab heat') && text.includes('Ice yield')), undefined, { timeout: 5000 });
  await page.mouse.click(...point(96, 110));
  await page.waitForFunction(() => window.missionTestGame.scene.getScene('Colony').selected?.x === 1);

  assert.deepEqual(errors, []);
  console.log('Rescue, crop journal, re-fly, abandon confirmation, and archived weather verified.');
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
