/**
 * The clipper. Runs inside any webpage — injected by the bookmarklet today,
 * the same file works as a browser-extension content script.
 *
 * Hover highlights the thing under the pointer; a click extracts the page's
 * product metadata, grabs the image bytes while we still have the page's
 * origin, and hands everything to the studio over postMessage.
 */
import { extractFromDocument } from '../../lib/clip/extract.ts';
import type { ClipPayload } from '../../lib/clip/ingest.ts';

// Where the clipper was loaded from is where the studio lives. As a classic
// script that is document.currentScript; as a dev-server module, import.meta.
const STUDIO = new URL(
  (document.currentScript as HTMLScriptElement | null)?.src || import.meta.url,
).origin;
const STUDIO_PATH = '/clip';
const WINDOW_NAME = 'offcut-clip';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

declare global {
  interface Window {
    __offcutClipper?: { stop: () => void };
  }
}

// Clicking the bookmarklet twice toggles the clipper off.
if (window.__offcutClipper) {
  window.__offcutClipper.stop();
} else {
  start();
}

function start() {
  const host = document.createElement('div');
  host.setAttribute('data-offcut', '');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .box { position: fixed; pointer-events: none; z-index: 2147483646;
             border: 2px solid #7361a2; border-radius: 4px;
             box-shadow: 0 0 0 9999px rgba(36,33,36,.28); transition: all .08s ease-out;
             display: none; }
      .tag { position: fixed; z-index: 2147483647; pointer-events: none;
             background: #29232f; color: #fff; font: 500 13px/1 -apple-system, Segoe UI, Arial, sans-serif;
             padding: 9px 12px; border-radius: 7px; box-shadow: 0 6px 24px rgba(0,0,0,.25);
             white-space: nowrap; display: none; }
      .tag b { color: #c5b4e5; font-weight: 600; }
      .bar { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
             z-index: 2147483647; background: #29232f; color: #fff; padding: 12px 18px;
             border-radius: 9px; font: 13px/1.4 -apple-system, Segoe UI, Arial, sans-serif;
             box-shadow: 0 8px 30px rgba(0,0,0,.3); display: flex; gap: 14px; align-items: center; }
      .bar button { all: unset; cursor: pointer; color: #c5b4e5; font-weight: 600; }
      .bar.error { background: #8a2b2b; }
    </style>
    <div class="box"></div>
    <div class="tag"></div>
    <div class="bar"><span class="msg">Hover over anything, then click to clip it. <b>Esc</b> to cancel.</span><button class="stop">Cancel</button></div>`;
  document.documentElement.appendChild(host);
  const box = root.querySelector<HTMLDivElement>('.box')!;
  const tag = root.querySelector<HTMLDivElement>('.tag')!;
  const bar = root.querySelector<HTMLDivElement>('.bar')!;
  const msg = root.querySelector<HTMLSpanElement>('.msg')!;

  let target: Element | null = null;
  let busy = false;
  let studio: Window | null = null;
  let ready: ((w: Window) => void) | null = null;

  const say = (text: string, error = false) => {
    msg.textContent = text;
    bar.classList.toggle('error', error);
  };

  const stop = () => {
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('message', onMessage);
    host.remove();
    delete window.__offcutClipper;
  };
  window.__offcutClipper = { stop };
  root.querySelector('.stop')!.addEventListener('click', stop);

  const onMove = (e: PointerEvent) => {
    if (busy) return;
    host.style.pointerEvents = 'none';
    const el = pickTarget(document.elementFromPoint(e.clientX, e.clientY));
    if (el === target) return;
    target = el;
    if (!el) {
      box.style.display = tag.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: `${r.left - 3}px`,
      top: `${r.top - 3}px`,
      width: `${r.width + 2}px`,
      height: `${r.height + 2}px`,
    });
    tag.innerHTML = `<b>Clip</b> ${describe(el)}`;
    Object.assign(tag.style, {
      display: 'block',
      left: `${Math.max(8, r.left)}px`,
      top: `${Math.max(8, r.top - 40)}px`,
    });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    }
  };

  const onMessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; token?: string } | null;
    if (
      e.origin === STUDIO &&
      d?.type === 'offcut:ready' &&
      ready &&
      e.source
    ) {
      ready(e.source as Window);
    }
  };

  const onClick = async (e: MouseEvent) => {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    const el =
      target ?? pickTarget(document.elementFromPoint(e.clientX, e.clientY));
    if (!el) return;
    busy = true;
    say('Clipping…');
    try {
      const token = crypto.randomUUID();
      // Open the receiver first, inside the click, so pop-up blockers allow
      // it. It takes the clip, tells any open studio, and closes itself.
      studio = window.open(
        `${STUDIO}${STUDIO_PATH}?clip=${token}`,
        WINDOW_NAME,
      );
      if (!studio) {
        say(
          'Your browser blocked the studio window. Allow pop-ups for this site and try again.',
          true,
        );
        busy = false;
        return;
      }
      const extracted = extractFromDocument(document, el);
      const imageUrl = extracted.images[0];
      const imageDataUrl = imageUrl ? await grab(imageUrl, el) : undefined;
      const payload: ClipPayload = {
        version: 1,
        token,
        pageUrl: location.href,
        pageTitle: document.title,
        imageUrl,
        imageDataUrl,
        extracted,
      };
      const studioWindow = await new Promise<Window>((resolve, reject) => {
        ready = resolve;
        setTimeout(
          () => reject(new Error('The studio did not answer.')),
          20000,
        );
      });
      studioWindow.postMessage({ ...payload, type: 'offcut:clip' }, STUDIO);
      say(`Clipped “${extracted.title ?? 'image'}”. It is in your library.`);
      setTimeout(stop, 1800);
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not clip that.', true);
      busy = false;
    }
  };

  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('message', onMessage);
}

/** The clippable thing at or above an element: an image or a backdrop. */
function pickTarget(el: Element | null): Element | null {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 5; depth++) {
    if (node.hasAttribute('data-offcut')) return null;
    if (node instanceof HTMLImageElement && node.naturalWidth > 40) return node;
    if (node instanceof HTMLPictureElement)
      return node.querySelector('img') ?? node;
    const img = node.querySelector('img');
    if (
      img &&
      img.naturalWidth > 40 &&
      node.getBoundingClientRect().width <
        img.getBoundingClientRect().width * 1.5
    )
      return img;
    const bg = getComputedStyle(node).backgroundImage;
    if (bg && bg !== 'none' && bg.includes('url(')) return node;
    node = node.parentElement;
  }
  return null;
}

function describe(el: Element): string {
  const alt = el instanceof HTMLImageElement ? el.alt.trim() : '';
  if (alt) return alt.length > 48 ? alt.slice(0, 45) + '…' : alt;
  const r = el.getBoundingClientRect();
  return `image · ${Math.round(r.width)}×${Math.round(r.height)}`;
}

/** Get the image bytes as a data URL, while we still have the page's origin. */
async function grab(url: string, el: Element): Promise<string | undefined> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size <= MAX_IMAGE_BYTES && blob.type.startsWith('image/'))
        return await toDataUrl(blob);
    }
  } catch {
    // The CDN said no. Try the pixels the page already has.
  }
  try {
    const img = el instanceof HTMLImageElement ? el : el.querySelector('img');
    if (!img || !img.naturalWidth) return undefined;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL('image/png'); // throws on a tainted canvas
  } catch {
    return undefined;
  }
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}
