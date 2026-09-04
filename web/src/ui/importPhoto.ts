/** Photo picker + auto-cut on import (PRD §8.2). The result is a fragment
 *  like any other: referenced by id, with its pixels in device storage. */
import { CAPS } from '@collage/shared/constants';
import type { FragmentRef } from '@collage/shared/version';
import { shortId } from '@collage/shared/id';
import { autoCut, contentBounds } from '../tray/autocut.ts';
import { putUpload } from '../tray/uploads.ts';
import { track } from '../lib/metrics.ts';

const MAX_EDGE = 1024;

export async function importPhoto(): Promise<FragmentRef | null> {
  const file = await pickFile();
  if (!file) return null;
  if (file.size > CAPS.maxUploadBytes) {
    alert('That photo is a bit large — try one under 8MB.');
    return null;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  autoCut({ data: img.data, width: w, height: h });
  ctx.putImageData(img, 0, 0);

  // Trim the dead margin the cut leaves, so the fragment's box is its content.
  const box = contentBounds({ data: img.data, width: w, height: h });
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  out.getContext('2d')!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  if (!blob) return null;

  const id = `upload.${shortId(10)}`;
  await putUpload(id, blob);
  track('tray_source', { action: 'upload', w: box.w, h: box.h });
  return { source: 'upload', id, w: box.w, h: box.h };
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker must resolve, or the caller hangs forever.
    input.oncancel = () => resolve(null);
    input.click();
  });
}
