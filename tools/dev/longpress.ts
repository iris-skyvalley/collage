/** Dev-only: on touch, holding a piece shows the ✕, and tapping it removes. */
import { launch } from './browser.ts';
const BASE = process.env['BASE'] ?? 'http://localhost:8789';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item');
await page.locator('.tray-item').first().click();
await page.waitForTimeout(700);
const t = JSON.parse((await page.evaluate(() => localStorage.getItem('collage.draft.v1')))!).comp.layers[0].transform;
const box = (await page.locator('canvas.canvas').boundingBox())!;
const x = box.x + (t.x / 1080) * box.width, y = box.y + (t.y / 1350) * box.height;

const cdp = await ctx.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
await page.waitForTimeout(250);
console.log(`✕ before the hold completes: ${await page.locator('.remove-btn').isVisible() ? 'shown (FAIL)' : 'hidden (OK)'}`);
await page.waitForTimeout(400);
console.log(`✕ after a 650ms hold:        ${await page.locator('.remove-btn').isVisible() ? 'shown (OK)' : 'hidden (FAIL)'}`);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(100);
console.log(`✕ stays after lifting:       ${await page.locator('.remove-btn').isVisible() ? 'shown (OK)' : 'hidden (FAIL)'}`);
await page.locator('.remove-btn').tap();
await page.waitForTimeout(600);
const n = await page.evaluate(() => JSON.parse(localStorage.getItem('collage.draft.v1')!).comp.layers.length);
console.log(`tap ✕ removes: layers=${n} ${n === 0 ? '(OK)' : '(FAIL)'}`);
await browser.close();
