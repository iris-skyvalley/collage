/** Dev-only: renders a contact sheet of one theme's tray, for eyeballing. */
import { readFileSync } from 'node:fs';
import { launch } from './browser.ts';

const manifest = JSON.parse(readFileSync('web/public/fragments/manifest.json', 'utf8'));
const theme = process.argv[2] ?? 'herbarium';
const items = manifest.themes[theme].slice(0, Number(process.argv[3] ?? 24));
const cells = items
  .map((it: { uri: string; family: string }) => {
    const svg = readFileSync(`web/public${it.uri}`, 'utf8');
    return `<div class="c">${svg}<span>${it.family}</span></div>`;
  })
  .join('');
const html = `<body style="margin:0;background:#efe7d7;font:11px system-ui">
<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:10px">${cells}</div>
<style>.c{background:#fff8ec;border:1px solid #ccc;height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.c svg{max-width:100%;max-height:120px;width:auto;height:auto}</style></body>`;
const b = await launch();
const p = await b.newPage({ viewport: { width: 900, height: 660 } });
await p.setContent(html);
await p.waitForTimeout(500);
await p.screenshot({ path: `${process.env['SP'] ?? '.'}/sheet-${theme}.png`, fullPage: true });
await b.close();
