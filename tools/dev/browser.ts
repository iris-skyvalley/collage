/** Dev-only helper: launches the pre-installed Chromium regardless of which
 *  build the local Playwright package expects. */
import { chromium, type Browser } from 'playwright';
import { existsSync } from 'node:fs';
import { globSync } from 'node:fs';

export async function launch(): Promise<Browser> {
  const candidates = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
  const executablePath = candidates.find((p) => existsSync(p));
  return chromium.launch(executablePath ? { executablePath } : {});
}
