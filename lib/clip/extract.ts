import type { ExtractionMethod, Money } from '../objects/schema.ts';

/**
 * Product metadata extraction.
 *
 * Order of trust: JSON-LD schema.org/Product → microdata → OpenGraph →
 * plain DOM heuristics. Each layer only fills fields the layers above left
 * empty. The pure functions take strings and records so they run in Node;
 * `extractFromDocument` is the thin DOM glue on top.
 */

export type Extracted = {
  title?: string;
  brand?: string;
  price?: Money;
  canonicalUrl?: string;
  retailer?: string;
  category?: string;
  description?: string;
  attributes: Record<string, string>;
  /** Candidate product image URLs, best first. */
  images: string[];
  /** Methods that contributed at least one field. */
  methods: ExtractionMethod[];
};

export function emptyExtraction(): Extracted {
  return { attributes: {}, images: [], methods: [] };
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: Json | undefined): string | undefined {
  if (typeof v === 'string') return clean(v);
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return asString(v[0]);
  if (isObject(v)) return asString(v['name'] ?? v['@value'] ?? v['url']);
  return undefined;
}

function asStrings(v: Json | undefined): string[] {
  if (Array.isArray(v)) return v.flatMap(asStrings);
  const s = asString(v);
  return s ? [s] : [];
}

export function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Parse "1,299.00", "1.299,00", "€49", "49 EUR" into a number. */
export function parseAmount(
  raw: string | number | undefined,
): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (!raw) return undefined;
  const m = raw.replace(/\s/g, '').match(/\d[\d.,]*/);
  if (!m) return undefined;
  let s = m[0];
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Whichever separator comes last is the decimal point.
    s =
      lastDot > lastComma
        ? s.replace(/,/g, '')
        : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma !== -1) {
    // A single comma followed by exactly two digits is a decimal comma.
    const tail = s.length - lastComma - 1;
    s = tail === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const tail = s.length - lastDot - 1;
    if (tail === 3 && s.split('.').length > 2) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  $: 'USD',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  kr: 'SEK',
  CHF: 'CHF',
};

/** Find a currency code in free text: a symbol or an ISO code. */
export function parseCurrency(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const iso = raw.match(/\b([A-Z]{3})\b/);
  if (
    iso &&
    /^(EUR|GBP|USD|JPY|INR|KRW|SEK|NOK|DKK|CHF|AUD|CAD|NZD|CNY|HKD|SGD|PLN|CZK|HUF|BRL|MXN|ZAR|TRY|AED)$/.test(
      iso[1],
    )
  )
    return iso[1];
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS))
    if (raw.includes(symbol)) return code;
  return undefined;
}

/** "€ 1.299,00" → { amount: 1299, currency: 'EUR' } */
export function parsePrice(raw: string | undefined): Money | undefined {
  const amount = parseAmount(raw);
  const currency = parseCurrency(raw);
  return amount !== undefined && currency ? { amount, currency } : undefined;
}

/** A display name for the retailer, from a hostname. */
export function retailerFromHost(host: string): string {
  const parts = host
    .toLowerCase()
    .replace(/^(www|shop|store|m|en|us|uk|de|fr|nl)\d*\./, '')
    .split('.');
  const label =
    parts.length >= 3 && parts.at(-2)!.length <= 3 ? parts.at(-3)! : parts[0];
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const PRODUCT_TYPES = new Set([
  'Product',
  'ProductModel',
  'IndividualProduct',
  'ProductGroup',
  'SomeProducts',
  'Vehicle',
  'Car',
]);

function types(node: JsonObject): string[] {
  return asStrings(node['@type']).map((t) => t.replace(/^.*[/#]/, ''));
}

/** Walk a JSON-LD document and yield every node object. */
function* nodes(v: Json | undefined): Generator<JsonObject> {
  if (Array.isArray(v)) {
    for (const x of v) yield* nodes(x);
  } else if (isObject(v)) {
    yield v;
    for (const [k, x] of Object.entries(v))
      if (k !== '@context' && (Array.isArray(x) || isObject(x)))
        yield* nodes(x);
  }
}

function offerOf(product: JsonObject): JsonObject | undefined {
  const offers = product['offers'];
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (!isObject(o)) continue;
    const t = types(o);
    if (t.includes('AggregateOffer')) {
      const lo = o['lowPrice'];
      if (lo !== undefined) return { ...o, price: lo };
    }
    return o;
  }
  return undefined;
}

/** Extract from raw JSON-LD script contents. Malformed scripts are skipped. */
export function fromJsonLd(scripts: readonly string[]): Extracted {
  const out = emptyExtraction();
  let product: JsonObject | undefined;
  let breadcrumbs: string[] = [];
  for (const text of scripts) {
    let parsed: Json;
    try {
      parsed = JSON.parse(text) as Json;
    } catch {
      continue;
    }
    for (const node of nodes(parsed)) {
      const t = types(node);
      if (!product && t.some((x) => PRODUCT_TYPES.has(x))) product = node;
      if (t.includes('BreadcrumbList') && !breadcrumbs.length) {
        const items = node['itemListElement'];
        if (Array.isArray(items))
          breadcrumbs = items
            .map((i) =>
              isObject(i) ? asString(i['name'] ?? i['item']) : undefined,
            )
            .filter((x): x is string => !!x);
      }
    }
  }
  if (!product) return out;
  out.methods.push('json-ld');
  out.title = asString(product['name']);
  out.brand = asString(product['brand'] ?? product['manufacturer']);
  out.description = asString(product['description']);
  out.canonicalUrl = asString(product['url'] ?? product['@id']);
  out.category = asString(product['category']) ?? breadcrumbs.at(-1);
  if (!out.category && breadcrumbs.length > 1)
    out.category = breadcrumbs.at(-2);
  out.images = asStrings(product['image']);
  const offer = offerOf(product);
  if (offer) {
    const raw = offer['price'] ?? offer['lowPrice'];
    const priceSpec = offer['priceSpecification'];
    const amount =
      parseAmount(typeof raw === 'number' ? raw : asString(raw)) ??
      (isObject(priceSpec)
        ? parseAmount(asString(priceSpec['price']))
        : undefined);
    const currency =
      asString(offer['priceCurrency']) ??
      (isObject(priceSpec)
        ? asString(priceSpec['priceCurrency'])
        : undefined) ??
      parseCurrency(asString(raw));
    if (amount !== undefined && currency) out.price = { amount, currency };
    const seller = offer['seller'];
    if (isObject(seller)) out.retailer = asString(seller['name']);
  }
  for (const key of [
    'color',
    'material',
    'size',
    'pattern',
    'gender',
    'sku',
    'gtin13',
    'gtin',
    'mpn',
  ]) {
    const v = asString(product[key]);
    if (v) out.attributes[key] = v;
  }
  const props = product['additionalProperty'];
  if (Array.isArray(props))
    for (const p of props) {
      if (!isObject(p)) continue;
      const name = asString(p['name']);
      const value = asString(p['value']);
      if (name && value && !(name.toLowerCase() in out.attributes))
        out.attributes[name.toLowerCase()] = value;
    }
  return out;
}

/** Extract from `<meta property|name="…" content="…">` pairs. */
export function fromOpenGraph(
  meta: Readonly<Record<string, string>>,
): Extracted {
  const out = emptyExtraction();
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta[k];
      if (v && clean(v)) return clean(v);
    }
    return undefined;
  };
  const title = get('og:title', 'twitter:title');
  const image = get('og:image:secure_url', 'og:image', 'twitter:image');
  const amount = parseAmount(
    get('product:price:amount', 'og:price:amount', 'product:sale_price:amount'),
  );
  const currency = get('product:price:currency', 'og:price:currency');
  out.title = title;
  out.description = get('og:description', 'twitter:description');
  out.canonicalUrl = get('og:url');
  out.retailer = get('og:site_name');
  out.brand = get('product:brand', 'og:brand');
  out.category = get('product:category');
  if (image) out.images = [image];
  if (amount !== undefined && currency) out.price = { amount, currency };
  for (const key of ['color', 'material', 'size']) {
    const v = get('product:' + key);
    if (v) out.attributes[key] = v;
  }
  const found =
    title ||
    image ||
    out.price ||
    out.retailer ||
    out.canonicalUrl ||
    out.brand;
  if (found) out.methods.push('opengraph');
  return out;
}

/** Microdata as collected by the DOM glue: itemprop → value. */
export function fromMicrodata(
  props: Readonly<Record<string, string>>,
): Extracted {
  const out = emptyExtraction();
  const get = (k: string) => (props[k] ? clean(props[k]) : undefined);
  if (!get('name') && !get('price')) return out;
  out.methods.push('microdata');
  out.title = get('name');
  out.brand = get('brand');
  out.description = get('description');
  out.canonicalUrl = get('url');
  out.category = get('category');
  const img = get('image');
  if (img) out.images = [img];
  const amount = parseAmount(get('price') ?? get('lowPrice'));
  const currency = get('priceCurrency') ?? parseCurrency(get('price'));
  if (amount !== undefined && currency) out.price = { amount, currency };
  for (const key of ['color', 'material', 'size', 'sku'])
    if (get(key)) out.attributes[key] = get(key)!;
  return out;
}

/** What the DOM glue can see without any structured data. */
export type DomSignals = {
  url: string;
  canonical?: string;
  title?: string;
  h1?: string;
  /** Text near the clicked element that looks like a price. */
  priceText?: string;
  breadcrumbs?: string[];
  /** The clicked image and its alt text. */
  image?: string;
  imageAlt?: string;
  metaDescription?: string;
};

export function fromDom(d: DomSignals): Extracted {
  const out = emptyExtraction();
  out.methods.push('dom');
  const host = safeHost(d.url);
  out.retailer = host ? retailerFromHost(host) : undefined;
  out.canonicalUrl = d.canonical;
  out.title = d.h1 ?? d.imageAlt ?? titleWithoutSite(d.title, out.retailer);
  out.description = d.metaDescription;
  out.price = parsePrice(d.priceText);
  if (d.breadcrumbs?.length) {
    const crumbs = d.breadcrumbs.filter(
      (c) => c && !/^(home|start|shop)$/i.test(c),
    );
    out.category = crumbs.at(-1) === out.title ? crumbs.at(-2) : crumbs.at(-1);
  }
  if (d.image) out.images = [d.image];
  return out;
}

export function safeHost(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function titleWithoutSite(title: string | undefined, site: string | undefined) {
  if (!title) return undefined;
  const parts = title.split(/\s+[|–—-]\s+/);
  if (parts.length > 1) {
    const last = parts.at(-1)!;
    if (
      !site ||
      last.toLowerCase().includes(site.toLowerCase()) ||
      last.length < 25
    )
      return clean(parts.slice(0, -1).join(' - '));
  }
  return clean(title);
}

/** Layer extractions: earlier arguments win, later ones fill gaps. */
export function merge(...layers: Extracted[]): Extracted {
  const out = emptyExtraction();
  const seen = new Set<string>();
  for (const l of layers) {
    out.title ??= l.title;
    out.brand ??= l.brand;
    out.price ??= l.price;
    out.canonicalUrl ??= l.canonicalUrl;
    out.retailer ??= l.retailer;
    out.category ??= l.category;
    out.description ??= l.description;
    for (const [k, v] of Object.entries(l.attributes)) out.attributes[k] ??= v;
    for (const img of l.images)
      if (!seen.has(img)) {
        seen.add(img);
        out.images.push(img);
      }
    for (const m of l.methods)
      if (!out.methods.includes(m)) out.methods.push(m);
  }
  if (out.retailer === undefined && out.canonicalUrl) {
    const host = safeHost(out.canonicalUrl);
    if (host) out.retailer = retailerFromHost(host);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* DOM glue. Only this part touches a Document.                              */
/* ------------------------------------------------------------------------ */

const PRICE_RE =
  /(?:[€£$¥₹₩]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|£|\$|kr|EUR|GBP|USD|CHF|SEK|NOK|DKK|PLN|JPY|AUD|CAD))/;

export function collectJsonLd(doc: Document): string[] {
  return [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
    (s) => s.textContent ?? '',
  );
}

export function collectMeta(doc: Document): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of doc.querySelectorAll('meta[property],meta[name]')) {
    const key = (
      m.getAttribute('property') ??
      m.getAttribute('name') ??
      ''
    ).toLowerCase();
    const content = m.getAttribute('content');
    if (key && content && !(key in meta)) meta[key] = content;
  }
  return meta;
}

export function collectMicrodata(doc: Document): Record<string, string> {
  const props: Record<string, string> = {};
  const scope = doc.querySelector('[itemtype*="schema.org/Product"]');
  if (!scope) return props;
  for (const el of scope.querySelectorAll('[itemprop]')) {
    const name = el.getAttribute('itemprop');
    if (!name || name in props) continue;
    const value =
      el.getAttribute('content') ??
      (el instanceof HTMLImageElement
        ? el.currentSrc || el.src
        : el instanceof HTMLAnchorElement || el instanceof HTMLLinkElement
          ? el.href
          : el.textContent) ??
      '';
    if (clean(value)) props[name] = clean(value);
  }
  return props;
}

/** The nearest text that looks like a price, walking up from `el`. */
export function priceNear(el: Element | null): string | undefined {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 6; depth++) {
    const priced = [
      ...node.querySelectorAll(
        '[class*="price" i],[itemprop="price"],[data-price]',
      ),
    ]
      .map((e) => e.getAttribute('content') ?? e.textContent ?? '')
      .find((t) => PRICE_RE.test(t));
    if (priced) return clean(priced.match(PRICE_RE)![0]);
    node = node.parentElement;
  }
  const any = el?.ownerDocument.querySelector(
    '[class*="price" i],[itemprop="price"]',
  );
  const text = any?.getAttribute('content') ?? any?.textContent ?? '';
  const m = text.match(PRICE_RE);
  return m ? clean(m[0]) : undefined;
}

export function collectBreadcrumbs(doc: Document): string[] {
  const nav =
    doc.querySelector('nav[aria-label*="breadcrumb" i]') ??
    doc.querySelector('[class*="breadcrumb" i]') ??
    doc.querySelector('[itemtype*="BreadcrumbList"]');
  if (!nav) return [];
  return [...nav.querySelectorAll('a,li,span[itemprop="name"]')]
    .map((e) => clean(e.textContent ?? ''))
    .filter((t, i, all) => t && t.length < 40 && all.indexOf(t) === i);
}

/** Best image URL for an element: largest srcset entry, or currentSrc. */
export function imageUrlOf(el: Element | null): string | undefined {
  if (!el) return undefined;
  const img =
    el instanceof HTMLImageElement
      ? el
      : (el.querySelector('img') ??
        el.closest('picture')?.querySelector('img'));
  if (img) {
    const candidates = [
      ...(img.closest('picture')?.querySelectorAll('source') ?? []),
      img,
    ].flatMap((s) => parseSrcset(s.getAttribute('srcset') ?? ''));
    const best = candidates.sort((a, b) => b.width - a.width)[0];
    return absolute(best?.url ?? img.currentSrc ?? img.src, img.ownerDocument);
  }
  const bg = el.ownerDocument.defaultView
    ?.getComputedStyle(el)
    .backgroundImage.match(/url\(["']?([^"')]+)/);
  return bg ? absolute(bg[1], el.ownerDocument) : undefined;
}

export function parseSrcset(srcset: string): { url: string; width: number }[] {
  return srcset
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [url, size] = s.split(/\s+/);
      const w = size?.endsWith('w') ? Number(size.slice(0, -1)) : 0;
      const x = size?.endsWith('x') ? Number(size.slice(0, -1)) * 1000 : 0;
      return { url, width: w || x || 0 };
    });
}

function absolute(url: string, doc: Document): string {
  try {
    return new URL(url, doc.baseURI).href;
  } catch {
    return url;
  }
}

/** Extract everything the page offers, with the clicked element as context. */
export function extractFromDocument(
  doc: Document,
  picked: Element | null = null,
): Extracted {
  const meta = collectMeta(doc);
  const image = imageUrlOf(picked);
  const img =
    picked instanceof HTMLImageElement ? picked : picked?.querySelector('img');
  const dom = fromDom({
    url: doc.location?.href ?? doc.baseURI,
    canonical:
      doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
      undefined,
    title: doc.title,
    h1: doc.querySelector('h1')?.textContent?.trim() || undefined,
    priceText: priceNear(picked),
    breadcrumbs: collectBreadcrumbs(doc),
    image,
    imageAlt: img?.alt?.trim() || undefined,
    metaDescription: meta['description'],
  });
  const merged = merge(
    fromJsonLd(collectJsonLd(doc)),
    fromMicrodata(collectMicrodata(doc)),
    fromOpenGraph(meta),
    dom,
  );
  // The clicked image is what the user meant, whatever the page advertises.
  if (image)
    merged.images = [image, ...merged.images.filter((u) => u !== image)];
  return merged;
}
