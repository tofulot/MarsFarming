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
  const clickButton = async (scene, text) => {
    await hasText(scene, text);
    const point = await page.evaluate(([key, copy]) => {
      const game = window.missionTestGame;
      const label = game.scene.getScene(key).children.list.find((item) => item.text === copy);
      const { left, top, width, height } = game.canvas.getBoundingClientRect();
      return {
        x: left + label.x * width / game.scale.gameSize.width,
        y: top + label.y * height / game.scale.gameSize.height,
      };
    }, [scene, text]);
    await page.mouse.click(point.x, point.y);
  };

  await page.goto(`${origin}${config.base}?demo=1`);
  await active('Title');
  await clickButton('Title', 'Start survival');
  await active('UI');
  await page.keyboard.press('f');
  await active('Report');
  await hasText('Report', 'Rescue successful');
  await clickButton('Report', 'Crop journal');
  await hasText('Report', 'Crop discoveries');
  await clickButton('Report', 'Back to report');
  await hasText('Report', 'Rescue successful');
  await clickButton('Report', 'Try another landing site →');
  await active('Map');
  await clickButton('Map', 'Back');
  await active('Title');
  await clickButton('Title', 'Start survival');
  await active('UI');
  assert.equal(await page.evaluate(() => window.missionTestGame.scene.getScene('Colony').sim.state.sol), 0);
  assert.deepEqual(errors, []);
  console.log('Rescue report, crop journal, and fresh mission verified.');
} finally {
  await browser?.close();
  await rm(output, { recursive: true, force: true });
}
