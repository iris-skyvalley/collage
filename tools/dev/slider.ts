/** Dev-only: drag the roughness slider with a mouse and measure main-thread
 *  stalls while doing it. A smooth drag has no frame gap much over 16ms. */
import { launch } from './browser.ts';
const BASE = process.env['BASE'] ?? 'http://localhost:8789';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item');
await page.locator('.tray-item').first().click();
await page.locator('.chip', { hasText: 'Torn' }).click();
await page.waitForSelector('input[type=range]');
await page.waitForTimeout(800);

await page.evaluate(() => {
  const gaps: number[] = [];
  let last = performance.now();
  const tick = (): void => { const now = performance.now(); gaps.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  (window as unknown as { __gaps: number[] }).__gaps = gaps;
});

const slider = page.locator('input[type=range]');
const box = (await slider.boundingBox())!;
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
await page.mouse.down();
const t0 = Date.now();
for (let i = 0; i <= 40; i++) {
  await page.mouse.move(box.x + box.width * (0.5 + (i / 40) * 0.45), box.y + box.height / 2);
  await page.waitForTimeout(16);
}
await page.mouse.up();
const dragMs = Date.now() - t0;
await page.waitForTimeout(300);
const sliderStillThere = await slider.count();
const gaps = await page.evaluate(() => (window as unknown as { __gaps: number[] }).__gaps);
const worst = Math.max(...gaps.slice(5));
const over50 = gaps.filter((g) => g > 50).length;
const value = await slider.inputValue();
console.log(`drag ${dragMs}ms · frames ${gaps.length} · worst gap ${worst.toFixed(0)}ms · gaps>50ms: ${over50} · slider survived: ${sliderStillThere === 1} · value ${value}`);
console.log(worst < 50 && sliderStillThere === 1 ? 'smooth: OK' : 'smooth: FAIL');
await browser.close();
