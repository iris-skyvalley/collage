export type Piece = {
  id: string;
  product: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  text?: string;
  style?: 'serif' | 'stamp' | 'caption';
};
export type Product = {
  id: string;
  name: string;
  category: string;
  detail: string;
  w: number;
  h: number;
  text?: string;
  style?: Piece['style'];
};
export const products: Product[] = [
  {
    id: 'newsprint',
    name: 'A page from the archive',
    category: 'Magazine',
    detail: 'Vintage newsprint · Background',
    w: 260,
    h: 319,
  },
  {
    id: 'architecture',
    name: 'A morning in Paris',
    category: 'Magazine',
    detail: 'Monochrome · Photo clipping',
    w: 245,
    h: 181,
  },
  {
    id: 'sculpture',
    name: 'An eye for the classics',
    category: 'Magazine',
    detail: 'Marble study · Photo clipping',
    w: 170,
    h: 255,
  },
  {
    id: 'rose',
    name: 'A single red rose',
    category: 'Objects',
    detail: 'Scarlet · Cutout',
    w: 145,
    h: 102,
  },
  {
    id: 'frame',
    name: 'Something from the flea market',
    category: 'Objects',
    detail: 'Antique gold · Open frame',
    w: 180,
    h: 241,
  },

  {
    id: 'jacket',
    name: 'The worn-in leather jacket',
    category: 'Clothing',
    detail: 'Chocolate · Outerwear',
    w: 260,
    h: 310,
  },
  {
    id: 'tank',
    name: 'Everyday white tank',
    category: 'Clothing',
    detail: 'Chalk · Essentials',
    w: 140,
    h: 190,
  },
  {
    id: 'jeans',
    name: 'Perfectly lived-in denim',
    category: 'Clothing',
    detail: 'Indigo · Straight leg',
    w: 190,
    h: 340,
  },
  {
    id: 'bag',
    name: 'The everyday leather bag',
    category: 'Bags',
    detail: 'Warm brown · Leather',
    w: 190,
    h: 180,
  },
  {
    id: 'shoes',
    name: 'Classic leather loafers',
    category: 'Shoes',
    detail: 'Black · Everyday',
    w: 180,
    h: 150,
  },
  {
    id: 'earrings',
    name: 'Green crystal earrings',
    category: 'Accessories',
    detail: 'Emerald · Finishing touches',
    w: 85,
    h: 130,
  },
  {
    id: 'headline',
    name: 'The art of getting dressed',
    category: 'Typography',
    detail: 'Red ink · Editable headline',
    w: 210,
    h: 100,
    text: 'THE ART OF\nGETTING\nDRESSED',
    style: 'stamp',
  },
  {
    id: 'signature',
    name: 'Romantic handwriting',
    category: 'Typography',
    detail: 'Italic serif · Editable text',
    w: 270,
    h: 65,
    text: 'a little undone.',
    style: 'serif',
  },
  {
    id: 'caption',
    name: 'Magazine caption',
    category: 'Typography',
    detail: 'Small type · Editable caption',
    w: 180,
    h: 40,
    text: 'PERSONAL STYLE\nVOL. 01 / SEPTEMBER',
    style: 'caption',
  },
];
export const initial: Piece[] = [
  {
    id: 'paper-top',
    product: 'newsprint',
    x: 319,
    y: 24,
    w: 255,
    h: 313,
    r: 4,
  },
  {
    id: 'paper-bottom',
    product: 'newsprint',
    x: 373,
    y: 358,
    w: 202,
    h: 248,
    r: -4,
  },
  {
    id: 'photo-paris',
    product: 'architecture',
    x: 19,
    y: 95,
    w: 237,
    h: 175,
    r: -5,
  },
  {
    id: 'photo-sculpture',
    product: 'sculpture',
    x: 27,
    y: 433,
    w: 151,
    h: 227,
    r: 0,
  },
  { id: 'frame-gold', product: 'frame', x: 11, y: 417, w: 183, h: 245, r: 0 },
  { id: 'rose-left', product: 'rose', x: 17, y: 240, w: 169, h: 119, r: -22 },

  { id: 'a', product: 'jacket', x: 139, y: 74, w: 295, h: 330, r: -4 },
  { id: 'b', product: 'tank', x: 367, y: 94, w: 140, h: 185, r: 7 },
  { id: 'c', product: 'jeans', x: 331, y: 291, w: 214, h: 377, r: 5 },
  { id: 'd', product: 'bag', x: 176, y: 337, w: 191, h: 205, r: -11 },
  { id: 'e', product: 'shoes', x: 103, y: 492, w: 232, h: 174, r: -9 },
  { id: 'f', product: 'earrings', x: 492, y: 168, w: 88, h: 123, r: 14 },
  { id: 'rose-bottom', product: 'rose', x: 254, y: 577, w: 102, h: 72, r: 15 },
  { id: 'rose-top', product: 'rose', x: 482, y: 33, w: 90, h: 63, r: -18 },
  {
    id: 'g',
    product: 'signature',
    text: 'a little undone.',
    style: 'serif',
    x: 47,
    y: 14,
    w: 290,
    h: 62,
    r: -4,
  },
  {
    id: 'h',
    product: 'headline',
    text: 'THE ART OF\nGETTING\nDRESSED',
    style: 'stamp',
    x: 22,
    y: 334,
    w: 192,
    h: 101,
    r: -5,
  },
  {
    id: 'i',
    product: 'caption',
    text: 'PERSONAL STYLE\nVOL. 01 / SEPTEMBER',
    style: 'caption',
    x: 348,
    y: 646,
    w: 199,
    h: 37,
    r: 0,
  },
];
export function textMetrics(p: Piece) {
  const style = p.style || 'serif';
  return {
    font:
      style === 'stamp'
        ? `900 ${p.w * 0.13}px Arial`
        : style === 'caption'
          ? `500 ${p.w * 0.052}px Arial`
          : `italic ${p.w * 0.16}px Georgia`,
    color: style === 'stamp' ? '#ab2029' : '#242124',
    lineHeight:
      p.w * (style === 'stamp' ? 0.135 : style === 'caption' ? 0.078 : 0.18),
    background: style === 'stamp' ? '#fff' : undefined,
  };
}
