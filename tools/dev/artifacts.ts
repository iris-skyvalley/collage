/** Dev-only: drives the real UI and saves the three exports for inspection. */
import { launch } from './browser.ts';

const BASE = process.env['BASE'] ?? 'http://localhost:8787';
const SP = process.env['SP'] ?? '.';

const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item');

for (const i of [0, 5, 9, 2, 14, 20, 7]) {
  await page.keyboard.press('Escape');
  await page.locator('.tray-item').nth(i).click();
  await page.waitForTimeout(140);
}

// Give several of them edges and materials. Layers land on a golden-angle
// spiral out from the centre, so their positions are computable for the test.
const canvas = page.locator('canvas.canvas');
const box = (await canvas.boundingBox())!;
const scatter = (i: number): { x: number; y: number } => {
  if (i === 0) return { x: 540, y: 675 };
  const r = Math.sqrt(i) * 1080 * 0.16;
  const a = i * 2.399963;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { x: clamp(540 + Math.cos(a) * r, 172.8, 907.2), y: clamp(675 + Math.sin(a) * r * 1.1, 172.8, 1177.2) };
};
const styles = ['Torn', 'Deckle', 'Burnt', 'Scissor'];
for (let i = 0; i < styles.length; i++) {
  const p = scatter(i);
  await page.mouse.click(box.x + (p.x / 1080) * box.width, box.y + (p.y / 1350) * box.height);
  if (!(await page.locator('.verb-row').count())) { console.log(`! layer ${i} not selectable`); continue; }
    await page.locator('.chip', { hasText: new RegExp(`^${styles[i]}$`) }).click();
  await page.waitForTimeout(600);
}
console.log('verbs on canvas:', await page.evaluate(() => {
  const raw = localStorage.getItem('collage.draft.v1');
  if (!raw) return 'no draft';
  const d = JSON.parse(raw) as { comp: { layers: { verbs: { verb: string; params: Record<string, unknown> }[] }[] } };
  return d.comp.layers.map((l) => l.verbs.map((v) => `${v.verb}:${v.params['style'] ?? ''}`).join('+') || '-').join(' ');
}));

await page.keyboard.press('Escape');
await page.locator('.palette-row .chip', { hasText: 'Sepia' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/editor.png` });

await page.locator('.pill-primary', { hasText: 'Export' }).click();
await page.waitForSelector('.sheet-title');
await page.waitForSelector('.replay-video', { timeout: 45000 }).catch(() => console.log('! no replay'));

for (const [label, file] of [['Save 4:5', 'piece.jpg'], ['Save 9:16 story', 'story.jpg']] as const) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator('.pill', { hasText: label }).click(),
  ]);
  await dl.saveAs(`${SP}/${file}`);
  console.log(`saved ${file}`);
}

// Pull the replay bytes straight off the video element's blob URL.
const replay = await page.evaluate(async () => {
  const v = document.querySelector('video.replay-video') as HTMLVideoElement | null;
  if (!v?.src) return null;
  const blob = await (await fetch(v.src)).blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  return { type: blob.type, size: blob.size, head: Array.from(buf.slice(0, 16)) };
});
console.log('replay:', replay ? `${replay.type} ${(replay.size / 1024).toFixed(0)}kB` : 'none');

await ctx.close();
await browser.close();
