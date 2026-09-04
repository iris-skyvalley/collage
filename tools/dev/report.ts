/** Dev-only: the report path on a shared piece (PRD §10). */
import { launch } from './browser.ts';

const BASE = process.env['BASE'] ?? 'http://localhost:8789';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item');
await page.locator('.tray-item').first().click();
await page.locator('.pill-primary', { hasText: 'Export' }).click();
await page.waitForSelector('.link-input');
const link = await page.locator('.link-input').inputValue();
await ctx.close();

const rx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p2 = await rx.newPage();
await p2.goto(link, { waitUntil: 'networkidle' });
await p2.waitForSelector('.linkbar');
await p2.locator('.linkbar-report').click();
await p2.locator('.linkbar .link-input').fill('test report from the dev harness');
await p2.locator('.linkbar-btn', { hasText: 'Send' }).click();
await p2.waitForTimeout(600);
console.log('after report:', (await p2.locator('.linkbar-text').textContent())?.trim());

await p2.locator('.linkbar-btn', { hasText: 'React' }).count().then((n) => console.log('react button still present:', n > 0));
await rx.close();
await browser.close();

const id = link.split('/v/')[1]!;
console.log('reported version:', id);
