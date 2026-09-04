/**
 * Dev-only: the link path (PRD §7.2). Someone makes a piece and sends it;
 * someone else opens the link and changes it. Asserts the one thing that
 * differs downstream — the child's parent_id.
 */
import { launch } from './browser.ts';

const BASE = process.env['BASE'] ?? 'http://localhost:8787';
const SP = process.env['SP'] ?? '.';
const browser = await launch();

// --- sender ---------------------------------------------------------------
const senderCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const sender = await senderCtx.newPage();
await sender.goto(BASE, { waitUntil: 'networkidle' });
await sender.waitForSelector('.tray-item');
for (const i of [1, 6, 11, 3]) {
  await sender.locator('.tab', { hasText: 'Tray' }).click();
  await sender.locator('.tray-item').nth(i).click();
  await sender.waitForTimeout(120);
}
await sender.locator('.pill-primary', { hasText: 'Export' }).click();
await sender.waitForSelector('.link-input');
const link = await sender.locator('.link-input').inputValue();
console.log('sender minted:', link);

// The claim offer must not appear before anything has been sent.
console.log('claim offered before send:', await sender.locator('.export-row', { hasText: 'Who reacted' }).isVisible());
await sender.locator('.pill', { hasText: 'Copy' }).click();
await sender.waitForTimeout(300);
console.log('claim offered after send: ', await sender.locator('.export-row', { hasText: 'Who reacted' }).isVisible());
await sender.screenshot({ path: `${SP}/10-claim-after-send.png`, fullPage: false });
await senderCtx.close();

// --- recipient ------------------------------------------------------------
const rxCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const rx = await rxCtx.newPage();
const errors: string[] = [];
rx.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await rx.goto(link, { waitUntil: 'networkidle' });
await rx.waitForSelector('.linkbar', { state: 'visible', timeout: 8000 });
console.log(`landed on their piece in ${Date.now() - t0}ms`);
await rx.screenshot({ path: `${SP}/11-link-arrival.png` });

// The knobs are already there: change something without opening an editor.
await rx.locator('.tab', { hasText: 'Paper' }).click();
await rx.locator('.chip', { hasText: 'Riso duo' }).click();
await rx.waitForTimeout(900);
console.log(`first change at ${Date.now() - t0}ms from load`);
await rx.screenshot({ path: `${SP}/12-link-nudged.png` });

await rx.locator('.pill-primary', { hasText: 'Send yours' }).click();
await rx.waitForSelector('.link-input');
const childLink = await rx.locator('.link-input').inputValue();
console.log('recipient minted:', childLink);
await rxCtx.close();
await browser.close();

// --- the contract ---------------------------------------------------------
const parentId = link.split('/v/')[1]!;
const childId = childLink.split('/v/')[1]!;
const { version } = await (await fetch(`${BASE}/api/versions/${childId}`)).json() as
  { version: { parent_id: string | null; root_id: string | null } };
console.log(`child.parent_id = ${version.parent_id} (expected ${parentId})`);
console.log(`child.root_id   = ${version.root_id} (expected ${parentId})`);
if (version.parent_id !== parentId) throw new Error('link arrival did not write parent_id');
if (version.root_id !== parentId) throw new Error('link arrival did not inherit root_id');
console.log(errors.length ? `page errors: ${errors.join('; ')}` : 'no page errors');
console.log('link path OK');
