import type {
  ClipObject,
  ExtractionMethod,
  ImageRef,
} from '../objects/schema.ts';
import { newId, now } from '../objects/schema.ts';
import type { ObjectStore } from '../objects/store.ts';
import type { Cutter, Detection } from './cutout.ts';
import type { Extracted } from './extract.ts';
import { retailerFromHost, safeHost } from './extract.ts';
import { categorize } from './categorize.ts';

/**
 * What the clipper sends from the retailer's tab to the studio.
 *
 * The image travels as a data URL because the studio's origin usually cannot
 * fetch the retailer's CDN (CORS), while the clipper, running on the
 * retailer's page, can. When even that fails the clipper sends only the URL
 * and the studio keeps a reference.
 */
export type ClipPayload = {
  version: 1;
  token: string;
  pageUrl: string;
  pageTitle?: string;
  imageUrl?: string;
  imageDataUrl?: string;
  /** Which detection the user chose, if any. */
  pick?: Detection;
  extracted: Extracted;
};

export function isClipPayload(v: unknown): v is ClipPayload {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    p.version === 1 &&
    typeof p.token === 'string' &&
    typeof p.pageUrl === 'string' &&
    typeof p.extracted === 'object' &&
    p.extracted !== null &&
    (p.imageDataUrl === undefined || typeof p.imageDataUrl === 'string') &&
    (p.imageUrl === undefined || typeof p.imageUrl === 'string')
  );
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Turn a payload into a stored object: save the original, try to cut it out,
 * save the cutout, write the row. Returns the object as stored.
 *
 * Blob keys are <clipper>/<object id>/<original|cutout>: the first folder
 * names the owner, which is what the storage policies check.
 */
export async function ingestClip(
  payload: ClipPayload,
  store: ObjectStore,
  cutter: Cutter,
  clippedBy: string,
): Promise<ClipObject> {
  const id = newId();
  const x = payload.extracted;
  const host = safeHost(payload.pageUrl) ?? 'unknown';
  const methods: ExtractionMethod[] = [...x.methods];

  let original: ImageRef;
  let originalBlob: Blob | undefined;
  if (payload.imageDataUrl) {
    originalBlob = await dataUrlToBlob(payload.imageDataUrl);
    const size = await measure(originalBlob);
    const key = `${clippedBy}/${id}/original`;
    await store.putBlob(key, originalBlob);
    original = {
      blobKey: key,
      type: originalBlob.type || 'image/jpeg',
      ...size,
    };
  } else {
    original = {
      url: payload.imageUrl ?? x.images[0] ?? '',
      width: 0,
      height: 0,
      type: 'image/*',
    };
  }

  let cutoutImage: ImageRef | undefined;
  let cutout: ClipObject['cutout'] = { status: 'none' };
  if (originalBlob) {
    try {
      const cut = await cutter.cut(originalBlob, payload.pick);
      if (cut) {
        const key = `${clippedBy}/${id}/cutout`;
        await store.putBlob(key, cut.blob);
        cutoutImage = {
          blobKey: key,
          type: 'image/png',
          width: cut.width,
          height: cut.height,
        };
        cutout = { status: 'done', method: cut.method, label: cut.label };
      } else {
        cutout = { status: 'skipped', reason: 'no flat background to remove' };
      }
    } catch (e) {
      cutout = {
        status: 'skipped',
        reason: e instanceof Error ? e.message : 'cutout failed',
      };
    }
  } else {
    cutout = { status: 'skipped', reason: 'image bytes unavailable' };
  }

  const t = now();
  const object: ClipObject = {
    id,
    title:
      x.title ?? payload.pick?.label ?? payload.pageTitle ?? 'Untitled clip',
    brand: x.brand,
    price: x.price,
    // The retailer's own wording is kept, but the category the studio files
    // it under has to be one of the library's own.
    category: categorize({
      category: x.category,
      title: x.title,
      attributes: x.attributes,
      url: x.canonicalUrl ?? payload.pageUrl,
    }),
    description: x.description,
    attributes: {
      ...x.attributes,
      ...(x.category ? { sourceCategory: x.category } : {}),
    },
    originalImage: original,
    cutoutImage,
    cutout,
    source: {
      url: payload.pageUrl,
      canonicalUrl: x.canonicalUrl,
      retailer: x.retailer ?? retailerFromHost(host),
      host,
      pageTitle: payload.pageTitle,
      imageUrl: payload.imageUrl,
      methods,
      clippedAt: t,
    },
    clippedBy,
    createdAt: t,
    updatedAt: t,
  };
  await store.putObject(object);
  return object;
}
