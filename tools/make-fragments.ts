/**
 * Emits the static tray to web/public/fragments/, plus a manifest the client
 * loads at boot.
 *
 * The same generators back the server's pre-warmed pools, so this script is a
 * build-time cache of work the server would otherwise repeat.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THEMES, TRAY_TARGET, type ThemeId } from '../shared/src/constants.ts';
import { generateTray, type FragmentSpec } from '../shared/src/fragments.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'web/public/fragments');

const PER_THEME = Number(process.env['TRAY_SIZE'] ?? 60);
if (PER_THEME < TRAY_TARGET.min || PER_THEME > TRAY_TARGET.max) {
  console.warn(`warning: tray size ${PER_THEME} is outside the PRD's ${TRAY_TARGET.min}–${TRAY_TARGET.max} target`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

interface ManifestEntry {
  id: string; theme: ThemeId; family: string; name: string; w: number; h: number; uri: string;
}

const manifest: Record<string, ManifestEntry[]> = {};
let count = 0;

for (const theme of THEMES) {
  const specs: FragmentSpec[] = generateTray(theme.id, PER_THEME);
  manifest[theme.id] = specs.map((s) => {
    // Files live under their category; "all" points into the categories.
    const dir = join(outDir, s.theme);
    mkdirSync(dir, { recursive: true });
    const file = `${s.id}.svg`;
    const path = join(dir, file);
    if (!existsSync(path)) { writeFileSync(path, s.svg); count++; }
    return {
      id: s.id, theme: s.theme, family: s.family, name: s.name,
      w: s.w, h: s.h, uri: `/fragments/${s.theme}/${file}`,
    };
  });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ generated_at: Date.now(), themes: manifest }));
console.log(`fragments: wrote ${count} assets across ${THEMES.length} themes → web/public/fragments/`);
