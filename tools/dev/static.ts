/** Dev-only: serve dist/web the way a static host does — files, an SPA
 *  fallback, and nothing at all behind /api. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(process.cwd(), 'dist/web');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  if (path.startsWith('/api/') || path.startsWith('/r/') || path.startsWith('/u/')) { res.writeHead(404); res.end('no server'); return; }
  const tryFile = async (p: string): Promise<boolean> => {
    try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(b); return true; }
    catch { return false; }
  };
  if (!(await tryFile(path)) && !(await tryFile('index.html'))) { res.writeHead(404); res.end(); }
}).listen(Number(process.env['PORT'] ?? 4174), () => console.log('static on', process.env['PORT'] ?? 4174));
