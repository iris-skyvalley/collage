/** Dev-only: the mouse path — cursors, handle drags, wheel, keys. */
import { launch } from './browser.ts';

const BASE = process.env['BASE'] ?? 'http://localhost:8789';
const SP = process.env['SP'] ?? '.';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.tray-item');
await page.locator('.tray-item').first().click();
await page.waitForTimeout(700); // autosave debounces at 400ms

const canvas = page.locator('canvas.canvas');
const box = (await canvas.boundingBox())!;
const draft = async () => {
  const raw = await page.evaluate(() => localStorage.getItem('collage.draft.v1'));
  return JSON.parse(raw!).comp.layers[0].transform as { x: number; y: number; scale: number; rotation: number };
};
const cssPerUnit = box.width / 1080;
const toCss = (x: number, y: number) => ({ x: box.x + x * cssPerUnit, y: box.y + y * cssPerUnit });
const cursor = () => page.evaluate(() => (document.querySelector('canvas.canvas') as HTMLElement).style.cursor || '(default)');

let t = await draft();
console.log(`placed: scale=${t.scale.toFixed(3)} rot=${t.rotation.toFixed(3)}`);

// Hover the fragment: grab. Hover empty canvas: default.
await page.mouse.move(box.x + 8, box.y + 8);
console.log(`cursor over empty canvas: ${await cursor()}`);
await page.mouse.move(toCss(t.x, t.y).x, toCss(t.x, t.y).y);
console.log(`cursor over fragment:     ${await cursor()}`);

// Corner handle: hover cursor, then drag outward to scale up.
const w = 512 * t.scale, h = 512 * t.scale;
const cos = Math.cos(t.rotation), sin = Math.sin(t.rotation);
const corner = { x: t.x + (w / 2) * cos - (h / 2) * sin, y: t.y + (w / 2) * sin + (h / 2) * cos }; // br
const c = toCss(corner.x, corner.y);
await page.mouse.move(c.x, c.y);
console.log(`cursor over corner handle: ${await cursor()}`);
await page.mouse.down();
await page.mouse.move(c.x + 80, c.y + 80, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(600);
const afterScale = await draft();
console.log(`corner drag: scale ${t.scale.toFixed(3)} → ${afterScale.scale.toFixed(3)}  ${afterScale.scale > t.scale * 1.15 ? 'OK' : 'FAIL'}`);

// Rotate handle: 64 units above the top edge, then drag sideways.
t = afterScale;
const h2 = 512 * t.scale;
const cos2 = Math.cos(t.rotation), sin2 = Math.sin(t.rotation);
const rot = { x: t.x - (-(h2 / 2) - 64) * sin2, y: t.y + (-(h2 / 2) - 64) * cos2 };
const r = toCss(rot.x, rot.y);
await page.mouse.move(r.x, r.y);
console.log(`cursor over rotate handle: ${await cursor()}`);
await page.mouse.down();
await page.mouse.move(r.x + 120, r.y + 60, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(600);
const afterRot = await draft();
console.log(`rotate drag: rot ${t.rotation.toFixed(3)} → ${afterRot.rotation.toFixed(3)}  ${Math.abs(afterRot.rotation - t.rotation) > 0.2 ? 'OK' : 'FAIL'}`);
await page.screenshot({ path: `${SP}/20-desktop-handles.png` });

// Wheel scales the selection.
const centre = toCss(afterRot.x, afterRot.y);
await page.mouse.move(centre.x, centre.y);
await page.mouse.wheel(0, -300);
await page.waitForTimeout(600);
const afterWheel = await draft();
console.log(`wheel: scale ${afterRot.scale.toFixed(3)} → ${afterWheel.scale.toFixed(3)}  ${afterWheel.scale > afterRot.scale ? 'OK' : 'FAIL'}`);

// Delete removes it.
await page.keyboard.press('Delete');
await page.waitForTimeout(600);
const count = await page.evaluate(() => JSON.parse(localStorage.getItem('collage.draft.v1')!).comp.layers.length);
console.log(`delete: layers=${count}  ${count === 0 ? 'OK' : 'FAIL'}`);
await browser.close();
