/** Dev-only: rasterise an SVG string to RGBA via the headless browser. */
import type { Browser } from 'playwright';

export async function rasterise(browser: Browser, svg: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const page = await browser.newPage({ viewport: { width: 8, height: 8 } });
  const arr = await page.evaluate(
    async ([svgSrc, width, height]) => {
      const blob = new Blob([svgSrc as string], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = width as number; c.height = height as number;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width as number, height as number);
      return Array.from(ctx.getImageData(0, 0, width as number, height as number).data);
    },
    [svg, w, h] as const,
  );
  await page.close();
  return new Uint8ClampedArray(arr);
}
