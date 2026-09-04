/** Boot: warm the tray pools, then listen. */
import { createApp } from './app.ts';
import { sweepCounters, HOUR } from './ratelimit.ts';
import { warmPools } from './providers/generation.ts';
import { TRAY_TARGET } from '@collage/shared/constants';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env['PORT'] ?? 8787);
const DEV_ORIGIN = process.env['DEV_CLIENT_ORIGIN'] ?? 'http://localhost:5173';

const trayLimit = Math.min(TRAY_TARGET.max, Math.max(TRAY_TARGET.min, Number(process.env['TRAY_SIZE'] ?? 60)));
const warmed = await warmPools(trayLimit);
sweepCounters();
setInterval(sweepCounters, 6 * HOUR).unref();

const hasBuild = existsSync(join(process.cwd(), 'dist/web/index.html'));

createApp().listen(PORT, () => {
  console.log(`collage server on http://localhost:${PORT}`);
  console.log(`  tray pools warmed: ${warmed} fragments`);
  console.log(`  client: ${hasBuild ? 'dist/web' : `not built — dev client expected on ${DEV_ORIGIN}`}`);
});
