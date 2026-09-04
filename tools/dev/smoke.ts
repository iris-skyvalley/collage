/**
 * Dev-only end-to-end walk of the cold-arrival flow, on a phone viewport:
 * land, place fragments, apply verbs, export, share. Screenshots each step.
 */
import { launch } from './browser.ts';

const BASE = process.env['BASE'] ?? 'http://localhost:8787';
const SP = process.env['SP'] ?? '.';

const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item', { timeout: 10000 });
const trayCount = await page.locator('.tray-item').count();
console.log(`tray items: ${trayCount}`);
await page.screenshot({ path: `${SP}/01-cold-arrival.png` });

// Place a few fragments.
for (const i of [0, 7, 3, 12, 5]) {
  await page.locator('.tab', { hasText: 'Tray' }).click();
  await page.locator('.tray-item').nth(i).click();
  await page.waitForTimeout(180);
}
await page.screenshot({ path: `${SP}/02-placed.png` });

// Drag the top fragment so it is not stacked dead centre.
const canvas = page.locator('canvas.canvas');
const box = (await canvas.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.32, box.y + box.height * 0.3, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);

// Edge, the highest-priority verb.
await page.locator('.verb-tab', { hasText: 'Edge' }).click();
await page.locator('.chip', { hasText: 'Torn' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SP}/03-torn-edge.png` });

// Material.
await page.locator('.verb-tab', { hasText: 'Material' }).click();
await page.locator('.chip', { hasText: 'Riso' }).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${SP}/04-material.png` });

// Paper + palette, document-level.
await page.locator('.tab', { hasText: 'Tray' }).click();
await page.locator('.palette-row .chip', { hasText: 'Cyanotype' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/05-paper-palette.png` });

// Export: the replay is offered first.
await page.locator('.pill-primary', { hasText: 'Export' }).click();
await page.waitForSelector('.sheet-title', { timeout: 5000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SP}/06-export-opening.png` });

await page.waitForSelector('.replay-video', { timeout: 40000 }).catch(() => console.log('! replay did not appear'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/07-export-replay.png` });

const link = await page.locator('.link-input').inputValue().catch(() => '');
console.log(`minted link: ${link || '(none)'}`);

await ctx.close();
await browser.close();
console.log(errors.length ? `console errors:\n  ${errors.join('\n  ')}` : 'no console errors');
if (link) console.log(`LINK=${link}`);
