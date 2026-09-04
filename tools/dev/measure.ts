/** Dev-only: how much of the viewport the canvas actually takes (PRD §8.1). */
import { launch } from './browser.ts';
const BASE = process.env['BASE'] ?? 'http://localhost:8787';
const browser = await launch();
for (const [w, h, label] of [[390, 844, 'iPhone 14'], [360, 780, 'small Android'], [430, 932, 'iPhone Pro Max']] as const) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tray-item');
  const box = await page.locator('canvas.canvas').boundingBox();
  console.log(`${label} ${w}x${h}: canvas ${box!.width.toFixed(0)}x${box!.height.toFixed(0)} = ${((box!.height / h) * 100).toFixed(0)}% of viewport height`);
  await ctx.close();
}
await browser.close();
