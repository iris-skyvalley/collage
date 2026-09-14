import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromJsonLd,
  fromOpenGraph,
  fromMicrodata,
  fromDom,
  merge,
  parseAmount,
  parsePrice,
  retailerFromHost,
  parseSrcset,
} from './extract.ts';

test('parseAmount handles separators from both sides of the Atlantic', () => {
  assert.equal(parseAmount('1,299.00'), 1299);
  assert.equal(parseAmount('1.299,00'), 1299);
  assert.equal(parseAmount('€49'), 49);
  assert.equal(parseAmount('49,90'), 49.9);
  assert.equal(parseAmount('1,299'), 1299);
  assert.equal(parseAmount('1.299.000'), 1299000);
  assert.equal(parseAmount(89.5), 89.5);
  assert.equal(parseAmount('sold out'), undefined);
});

test('parsePrice finds currency from symbols and codes', () => {
  assert.deepEqual(parsePrice('£ 120.00'), { amount: 120, currency: 'GBP' });
  assert.deepEqual(parsePrice('249 SEK'), { amount: 249, currency: 'SEK' });
  assert.deepEqual(parsePrice('$1,050'), { amount: 1050, currency: 'USD' });
  assert.equal(parsePrice('120'), undefined);
});

test('retailerFromHost gives a display name', () => {
  assert.equal(retailerFromHost('www.zara.com'), 'Zara');
  assert.equal(retailerFromHost('shop.mango.co.uk'), 'Mango');
  assert.equal(retailerFromHost('www2.hm.com'), 'Hm');
  assert.equal(retailerFromHost('arket-store.com'), 'Arket Store');
});

test('fromJsonLd reads a schema.org Product with offers and breadcrumbs', () => {
  const product = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home' },
          { '@type': 'ListItem', position: 2, name: 'Women' },
          { '@type': 'ListItem', position: 3, name: 'Dresses' },
        ],
      },
      {
        '@type': 'Product',
        name: 'Red satin slip dress',
        brand: { '@type': 'Brand', name: 'Réalisation Par' },
        image: [
          'https://cdn.example/dress-1.jpg',
          'https://cdn.example/dress-2.jpg',
        ],
        url: 'https://example.com/p/red-satin-slip-dress',
        description: 'A bias-cut slip dress in scarlet satin.',
        color: 'Red',
        material: 'Silk',
        offers: {
          '@type': 'Offer',
          price: '189.00',
          priceCurrency: 'EUR',
          seller: { '@type': 'Organization', name: 'Example Boutique' },
        },
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Fit', value: 'Slim' },
        ],
      },
    ],
  });
  const x = fromJsonLd(['not json', product]);
  assert.equal(x.title, 'Red satin slip dress');
  assert.equal(x.brand, 'Réalisation Par');
  assert.deepEqual(x.price, { amount: 189, currency: 'EUR' });
  assert.equal(x.canonicalUrl, 'https://example.com/p/red-satin-slip-dress');
  assert.equal(x.retailer, 'Example Boutique');
  assert.equal(x.category, 'Dresses');
  assert.equal(x.description, 'A bias-cut slip dress in scarlet satin.');
  assert.deepEqual(x.images, [
    'https://cdn.example/dress-1.jpg',
    'https://cdn.example/dress-2.jpg',
  ]);
  assert.deepEqual(x.attributes, {
    color: 'Red',
    material: 'Silk',
    fit: 'Slim',
  });
  assert.deepEqual(x.methods, ['json-ld']);
});

test('fromJsonLd uses AggregateOffer lowPrice and nested product types', () => {
  const x = fromJsonLd([
    JSON.stringify({
      '@type': ['ProductGroup'],
      name: 'Butterfly chair',
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: 240,
        highPrice: 300,
        priceCurrency: 'USD',
      },
    }),
  ]);
  assert.equal(x.title, 'Butterfly chair');
  assert.deepEqual(x.price, { amount: 240, currency: 'USD' });
});

test('fromJsonLd returns nothing for pages without a product', () => {
  const x = fromJsonLd([JSON.stringify({ '@type': 'WebSite', name: 'Blog' })]);
  assert.equal(x.title, undefined);
  assert.deepEqual(x.methods, []);
});

test('fromOpenGraph reads product tags', () => {
  const x = fromOpenGraph({
    'og:title': 'Tassel loafers',
    'og:image': 'https://cdn.example/loafers.jpg',
    'og:site_name': 'Loafer House',
    'og:url': 'https://loafers.example/tassel',
    'product:price:amount': '150',
    'product:price:currency': 'GBP',
    'product:brand': 'Loafer House',
    'product:color': 'Black',
  });
  assert.equal(x.title, 'Tassel loafers');
  assert.equal(x.retailer, 'Loafer House');
  assert.deepEqual(x.price, { amount: 150, currency: 'GBP' });
  assert.deepEqual(x.images, ['https://cdn.example/loafers.jpg']);
  assert.equal(x.attributes.color, 'Black');
  assert.deepEqual(x.methods, ['opengraph']);
});

test('fromOpenGraph keeps the site name even without product tags', () => {
  const x = fromOpenGraph({
    'og:site_name': 'Example Boutique',
    description: 'x',
  });
  assert.equal(x.retailer, 'Example Boutique');
  assert.equal(x.description, undefined, 'plain description is DOM territory');
  assert.deepEqual(x.methods, ['opengraph']);
  assert.deepEqual(
    fromOpenGraph({ viewport: 'width=device-width' }).methods,
    [],
  );
});

test('fromMicrodata reads itemprops', () => {
  const x = fromMicrodata({
    name: 'Wool coat',
    price: '399',
    priceCurrency: 'EUR',
    brand: 'Arket',
  });
  assert.equal(x.title, 'Wool coat');
  assert.deepEqual(x.price, { amount: 399, currency: 'EUR' });
  assert.deepEqual(x.methods, ['microdata']);
});

test('fromDom falls back to page signals', () => {
  const x = fromDom({
    url: 'https://www.cos.com/en/women/dresses/product.red-dress.html',
    title: 'Red dress | COS',
    priceText: '€ 89,00',
    breadcrumbs: ['Home', 'Women', 'Dresses', 'Red dress'],
    image: 'https://cdn.cos/red.jpg',
    imageAlt: 'Red dress',
  });
  assert.equal(x.title, 'Red dress');
  assert.equal(x.retailer, 'Cos');
  assert.deepEqual(x.price, { amount: 89, currency: 'EUR' });
  assert.equal(x.category, 'Dresses');
});

test('fromDom strips the site name from a title', () => {
  const x = fromDom({
    url: 'https://www.arket.com/x',
    title: 'Linen shirt - ARKET',
  });
  assert.equal(x.title, 'Linen shirt');
});

test('merge lets structured data win and later layers fill gaps', () => {
  const merged = merge(
    fromJsonLd([
      JSON.stringify({
        '@type': 'Product',
        name: 'Lamp',
        url: 'https://shop.hay.dk/lamp',
      }),
    ]),
    fromOpenGraph({
      'og:title': 'Lamp – HAY',
      'og:image': 'https://cdn/lamp.jpg',
      'product:price:amount': '120',
      'product:price:currency': 'DKK',
    }),
    fromDom({
      url: 'https://shop.hay.dk/lamp',
      title: 'Lamp – HAY',
      priceText: '999 kr',
    }),
  );
  assert.equal(merged.title, 'Lamp');
  assert.deepEqual(merged.price, { amount: 120, currency: 'DKK' });
  assert.deepEqual(merged.images, ['https://cdn/lamp.jpg']);
  assert.equal(merged.retailer, 'Hay');
  assert.deepEqual(merged.methods, ['json-ld', 'opengraph', 'dom']);
});

test('parseSrcset picks widths and densities', () => {
  const s = parseSrcset('a.jpg 400w, b.jpg 1200w, c.jpg 2x');
  assert.deepEqual(
    s.map((x) => x.url),
    ['a.jpg', 'b.jpg', 'c.jpg'],
  );
  assert.equal(s[1].width, 1200);
  assert.equal(s[2].width, 2000);
});
