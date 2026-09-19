import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize,
  categoryOf,
  categoryFor,
  categoryNames,
} from './categorize.ts';

test('the taxonomy is the one the library shows', () => {
  assert.ok(categoryNames.includes('Dresses'));
  assert.ok(categoryNames.includes('Frames & borders'));
  assert.equal(categoryNames.length, 18);
});

test('a retailer category maps onto a tile', () => {
  assert.equal(categoryOf('Dresses'), 'Dresses');
  assert.equal(categoryOf('Sneakers'), 'Shoes');
  assert.equal(categoryOf('Knitwear'), 'Tops');
  assert.equal(categoryOf('Handbags'), 'Bags');
  assert.equal(categoryOf('Fine jewellery'), 'Jewelry');
  assert.equal(categoryOf('Trousers & leggings'), 'Pants');
});

test('the words that trap a naive match', () => {
  assert.equal(categoryOf('Dress shirt'), 'Tops');
  assert.equal(categoryOf('Dress pants'), 'Pants');
  assert.equal(categoryOf('Dress shoes'), 'Shoes');
  assert.equal(categoryOf('Denim jacket'), 'Outerwear');
  assert.equal(categoryOf('Jean jacket'), 'Outerwear');
  assert.equal(categoryOf('Dressing gown'), 'Outerwear');
  assert.equal(categoryOf('Straight leg jeans'), 'Jeans');
});

test('embellishments are recognised', () => {
  assert.equal(categoryOf('vintage newsprint'), 'Magazines');
  assert.equal(categoryOf('gold picture frame'), 'Frames & borders');
  assert.equal(categoryOf('marble bust'), 'People & print');
  assert.equal(categoryOf('floral seamless pattern'), 'Patterns & overlays');
  assert.equal(categoryOf('film grain texture'), 'Effects & textures');
  assert.equal(categoryOf('handwritten quote'), 'Text');
});

test('nothing recognisable gives no category rather than a wrong one', () => {
  assert.equal(categoryOf('Assorted'), undefined);
  assert.equal(categoryOf(''), undefined);
  assert.equal(categoryOf('9021 product'), undefined);
});

test('the retailer category outranks the title', () => {
  assert.equal(
    categorize({ category: 'Shoes', title: 'Dress sandals in satin' }),
    'Shoes',
  );
  assert.equal(
    categorize({ category: 'Outerwear', title: 'Denim overshirt' }),
    'Outerwear',
  );
});

test('the title is used when the retailer says nothing useful', () => {
  assert.equal(
    categorize({ category: 'New in', title: 'Bias-cut slip dress' }),
    'Dresses',
  );
  assert.equal(categorize({ title: 'Chunky gold hoop earrings' }), 'Jewelry');
});

test('the URL path is the last resort', () => {
  assert.equal(
    categorize({ url: 'https://shop.example/en/women/skirts/midi-123.html' }),
    'Skirts',
  );
  assert.equal(
    categorize({ title: 'Product 12345', url: 'https://shop.example/p/98' }),
    undefined,
  );
});

test('attributes can name the type', () => {
  assert.equal(
    categorize({ title: 'The Ada', attributes: { type: 'Ankle boot' } }),
    'Shoes',
  );
});

test('an object stored before categorisation still lands somewhere', () => {
  const o = {
    category: 'Women / Shoes / Loafers',
    title: 'Classic leather loafers',
    attributes: {},
    source: { url: 'https://shop.example/p/1' },
  };
  assert.equal(categoryFor(o), 'Shoes');
  assert.equal(
    categoryFor({ ...o, category: 'Bags' }),
    'Bags',
    'a category already in the taxonomy is kept as it is',
  );
  assert.equal(
    categoryFor({
      category: undefined,
      title: 'Untitled clip',
      attributes: {},
      source: { url: 'https://x.example/9' },
    }),
    undefined,
  );
});
