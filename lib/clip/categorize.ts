import { categoryGroups } from '../../app/collage.ts';

/**
 * Putting a clipped object into one of the studio's categories.
 *
 * Retailers describe things in their own words: a breadcrumb reading
 * "Women / Outerwear / Puffers", a JSON-LD category of "Sneakers", a title
 * of "Bias-cut slip dress". The studio has one fixed set of tiles, so a clip
 * is only findable if those words are mapped onto it.
 *
 * The rules are ordered, and the first one that matches wins. Order carries
 * meaning: a denim jacket is outerwear, not jeans, so outerwear is asked
 * first. Traps where one category's word appears inside another's phrase
 * ("dress shirt", "dress shoes") are removed before matching.
 */

export type CategoryName = string;

/** Every category the library offers, as a flat list. */
export const categoryNames: CategoryName[] = categoryGroups.flatMap((g) =>
  g.items.map((c) => c.name),
);

type Rule = { category: CategoryName; words: string[] };

/**
 * Phrases that read as one category but belong to another. Each is rewritten
 * before any matching, so "dress shirt" is a shirt and nothing else.
 */
const DISAMBIGUATE: [RegExp, string][] = [
  [/\bdress(?:ing)? (shirt|blouse)s?\b/g, ' shirt '],
  [/\bdress (pant|trouser|slack)s?\b/g, ' trousers '],
  [/\bdress (shoe|boot|sandal|loafer|heel)s?\b/g, ' shoes '],
  [/\bdress sock(s)?\b/g, ' socks '],
  [/\bdressing gowns?\b/g, ' robe '],
  [/\bjean(?: |-)?jackets?\b/g, ' denim jacket '],
  [/\bt(?:-| )?shirts?\b/g, ' tshirt '],
  [/\bjewell?ery\b/g, ' jewelry '],
  // "Top handle bag" is a bag; "short sleeve shirt" is a shirt.
  [/\btop handles?\b/g, ' '],
  [/\b(short|long|cap|three quarter) sleeve[ds]?\b/g, ' '],
  [/\bshort(s)? sleeve\b/g, ' '],
];

const RULES: Rule[] = [
  // Embellishments first: their words rarely collide with garments.
  {
    category: 'Text',
    words: [
      'text',
      'quote',
      'typography',
      'lettering',
      'letterform',
      'font',
      'phrase',
      'wordart',
      'caption',
      'headline',
    ],
  },
  {
    category: 'Frames & borders',
    words: ['frame', 'framed', 'border', 'passepartout', 'moulding'],
  },
  {
    category: 'Magazines',
    words: [
      'magazine',
      'newspaper',
      'newsprint',
      'tabloid',
      'zine',
      'editorial page',
      'press clipping',
      'broadsheet',
    ],
  },
  {
    category: 'Patterns & overlays',
    words: [
      'pattern',
      'overlay',
      'seamless',
      'damask',
      'toile',
      'gingham',
      'houndstooth',
      'paisley',
      'motif',
      'wallpaper',
    ],
  },
  {
    category: 'Effects & textures',
    words: [
      'texture',
      'grain',
      'glitter',
      'sparkle',
      'light leak',
      'bokeh',
      'gradient',
      'halftone',
      'noise',
      'grunge',
      'foil',
    ],
  },

  // Garments. Outerwear before jeans and tops so a denim jacket lands right.
  {
    category: 'Outerwear',
    words: [
      'outerwear',
      'coat',
      'jacket',
      'blazer',
      'parka',
      'trench',
      'puffer',
      'anorak',
      'raincoat',
      'overcoat',
      'bomber',
      'peacoat',
      'windbreaker',
      'gilet',
      'poncho',
      'cape',
      'robe',
      'mac',
    ],
  },
  {
    category: 'Dresses',
    words: [
      'dress',
      'gown',
      'sundress',
      'frock',
      'jumpsuit',
      'playsuit',
      'romper',
      'kaftan',
      'caftan',
    ],
  },
  { category: 'Skirts', words: ['skirt'] },
  { category: 'Shorts', words: ['short', 'bermuda'] },
  { category: 'Jeans', words: ['jean', 'denim'] },
  {
    category: 'Pants',
    words: [
      'pant',
      'trouser',
      'legging',
      'chino',
      'jogger',
      'slack',
      'culotte',
      'cargo',
      'sweatpant',
      'bottom',
    ],
  },
  {
    category: 'Tops',
    words: [
      'top',
      'shirt',
      'blouse',
      'tshirt',
      'tee',
      'tank',
      'camisole',
      'cami',
      'sweater',
      'jumper',
      'knit',
      'knitwear',
      'cardigan',
      'hoodie',
      'sweatshirt',
      'polo',
      'bodysuit',
      'turtleneck',
      'pullover',
      'corset',
      'bralette',
    ],
  },
  {
    category: 'Shoes',
    words: [
      'shoe',
      'footwear',
      'boot',
      'sneaker',
      'trainer',
      'heel',
      'sandal',
      'loafer',
      'flat',
      'pump',
      'mule',
      'espadrille',
      'clog',
      'slipper',
      'brogue',
      'oxford',
      'ballerina',
    ],
  },
  {
    category: 'Bags',
    words: [
      'bag',
      'handbag',
      'purse',
      'tote',
      'clutch',
      'backpack',
      'rucksack',
      'satchel',
      'crossbody',
      'shoulder bag',
      'luggage',
      'suitcase',
      'wallet',
      'pouch',
    ],
  },
  // Jewelry before accessories: it is the narrower of the two.
  {
    category: 'Jewelry',
    words: [
      'jewelry',
      'earring',
      'necklace',
      'ring',
      'bracelet',
      'bangle',
      'brooch',
      'pendant',
      'anklet',
      'charm',
      'choker',
      'cufflink',
      'watch',
    ],
  },
  {
    category: 'Accessories',
    words: [
      'accessory',
      'belt',
      'hat',
      'cap',
      'beanie',
      'beret',
      'scarf',
      'shawl',
      'glove',
      'mitten',
      'sunglasses',
      'eyewear',
      'glasses',
      'tights',
      'stocking',
      'sock',
      'hair clip',
      'headband',
      'umbrella',
      'keyring',
      'lingerie',
      'swimwear',
      'bikini',
    ],
  },

  // Imagery last: its words are generic enough to shadow garments.
  {
    category: 'People & print',
    words: [
      'portrait',
      'sculpture',
      'bust',
      'statue',
      'model',
      'face',
      'figure',
      'headshot',
      'mannequin',
    ],
  },
  {
    category: 'Background',
    words: [
      'background',
      'backdrop',
      'landscape',
      'architecture',
      'interior',
      'skyline',
      'scenery',
      'cityscape',
      'room',
    ],
  },
];

/** Lower-case, strip punctuation, and rewrite the misleading phrases. */
export function normalize(text: string): string {
  let s = ' ' + text.toLowerCase().replace(/[^a-z0-9&]+/g, ' ') + ' ';
  for (const [re, to] of DISAMBIGUATE) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ');
}

/**
 * The words of a phrase, each also in its singular form, so one rule word
 * covers "bag", "bags", "dresses" and "accessories" alike.
 */
function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of s.trim().split(' ')) {
    if (!t) continue;
    out.add(t);
    if (t.endsWith('ies') && t.length > 4) out.add(t.slice(0, -3) + 'y');
    if (t.endsWith('es') && t.length > 3) out.add(t.slice(0, -2));
    if (t.endsWith('s') && t.length > 3) out.add(t.slice(0, -1));
  }
  return out;
}

/** The category a single phrase implies, if any. */
export function categoryOf(text: string): CategoryName | undefined {
  if (!text) return undefined;
  const s = normalize(text);
  const words = tokens(s);
  // An exact category name always wins over any keyword inside the phrase.
  for (const name of categoryNames)
    if (s.includes(' ' + normalize(name).trim() + ' ')) return name;
  for (const rule of RULES)
    for (const word of rule.words)
      if (word.includes(' ') ? s.includes(' ' + word + ' ') : words.has(word))
        return rule.category;
  return undefined;
}

export type CategorySignals = {
  /** The retailer's own category, from JSON-LD or a breadcrumb. */
  category?: string;
  /** The product title. */
  title?: string;
  /** Product attributes: colour, material, and whatever else was found. */
  attributes?: Record<string, string>;
  /** The page URL, whose path often names the department. */
  url?: string;
};

/**
 * Pick a category for a clip, trying the most trustworthy signal first.
 * Returns undefined rather than guessing when nothing matches.
 */
export function categorize(signals: CategorySignals): CategoryName | undefined {
  const ordered = [
    signals.category,
    signals.attributes?.department,
    signals.attributes?.type,
    signals.attributes?.productType,
    signals.title,
    // The path is the weakest signal: it is full of unrelated words.
    signals.url && pathWords(signals.url),
  ];
  for (const signal of ordered) {
    const hit = signal && categoryOf(signal);
    if (hit) return hit;
  }
  return undefined;
}

function pathWords(url: string): string {
  try {
    return new URL(url).pathname.replace(/[/_-]+/g, ' ');
  } catch {
    return '';
  }
}

/**
 * The library category an object is filed under. Clips stored before this
 * existed carry the retailer's own wording, so derive one for them rather
 * than leaving them unfindable.
 */
export function categoryFor(o: {
  category?: string;
  title: string;
  attributes: Record<string, string>;
  source: { url: string; canonicalUrl?: string };
}): CategoryName | undefined {
  if (o.category && categoryNames.includes(o.category)) return o.category;
  return categorize({
    category: o.category ?? o.attributes.sourceCategory,
    title: o.title,
    attributes: o.attributes,
    url: o.source.canonicalUrl ?? o.source.url,
  });
}
