/**
 * The object model behind clipping.
 *
 * An Object is a thing lifted off a webpage: the original photo, the cutout
 * of the thing itself, what we learned about it (brand, price, retailer…),
 * who clipped it, and — derived from Creations — everything it has been used
 * in. Creations are collages; a creation references the objects placed on it.
 *
 * `usedIn` is never stored on the object. It is a query over creations, so a
 * count can never drift from the truth.
 */

/** Where an image's bytes live. Exactly one of the fields is set. */
export type ImageRef = {
  /** Key into the store's blob storage (IndexedDB or R2). */
  blobKey?: string;
  /** A remote URL, when we only hold a reference (hotlink or CDN copy). */
  url?: string;
  width: number;
  height: number;
  /** MIME type, e.g. image/png for cutouts. */
  type: string;
};

export type Money = { amount: number; currency: string };

/** How a field was found. Ordered from most to least trustworthy. */
export type ExtractionMethod =
  | 'json-ld'
  | 'microdata'
  | 'opengraph'
  | 'dom'
  | 'vision'
  | 'manual';

export type ObjectSource = {
  /** The page the clip was taken from, as loaded. */
  url: string;
  /** rel=canonical, og:url or the JSON-LD url when present. */
  canonicalUrl?: string;
  /** Human-readable retailer / site name. */
  retailer?: string;
  /** Hostname, kept separately so retailer can be a display name. */
  host: string;
  pageTitle?: string;
  /** The image URL that was clicked on the page. */
  imageUrl?: string;
  /** Every method that contributed at least one field. */
  methods: ExtractionMethod[];
  clippedAt: string;
};

export type CutoutStatus =
  | { status: 'none' }
  | { status: 'skipped'; reason: string }
  | { status: 'done'; method: 'flat-background' | 'model'; label?: string };

export type ClipObject = {
  id: string;
  title: string;
  brand?: string;
  price?: Money;
  category?: string;
  description?: string;
  /** Free-form product attributes: colour, material, size, pattern… */
  attributes: Record<string, string>;
  originalImage: ImageRef;
  /** Transparent PNG of the thing itself, when a cutout was possible. */
  cutoutImage?: ImageRef;
  cutout: CutoutStatus;
  source: ObjectSource;
  /** Creator id of whoever clipped it. */
  clippedBy: string;
  /** Semantic embedding for similarity search. Filled in by an enricher. */
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
};

/** A piece placed on a canvas. Mirrors app/collage.ts Piece, plus object. */
export type CreationPiece = {
  id: string;
  /** Catalog product id, or 'object' when `object` is set. */
  product: string;
  /** ClipObject id when the piece is a clipped object. */
  object?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  text?: string;
  style?: 'serif' | 'stamp' | 'caption';
};

export type Creation = {
  id: string;
  title: string;
  ownerId: string;
  pieces: CreationPiece[];
  /** Distinct object ids placed on the canvas; the used_in edge. */
  objectIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type UsageCount = { objectId: string; creations: number };

export function objectIdsOf(pieces: readonly CreationPiece[]): string[] {
  const ids = new Set<string>();
  for (const p of pieces) if (p.object) ids.add(p.object);
  return [...ids].sort();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
