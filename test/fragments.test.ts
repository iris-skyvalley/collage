/** Every fragment is an SVG that will be loaded through an <img>, which parses
 *  it as XML — stricter than the HTML the contact sheets use. A duplicate
 *  attribute or an unbalanced tag shows up as a missing-image icon in the
 *  tray, so it is checked here for every family. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILIES, generateFragment, generateTray, variantsOf } from '../shared/src/fragments.ts';
import { THEMES } from '../shared/src/constants.ts';

/** A small strict check: balanced tags, no duplicate attributes, quoted values. */
function assertWellFormed(svg: string, id: string): void {
  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = tagRe.exec(svg))) {
    seen++;
    const [, closing, name, rawAttrs, selfClosing] = m;
    if (closing) {
      assert.equal(stack.pop(), name, `${id}: </${name}> does not match the open tag`);
      continue;
    }
    const names = new Set<string>();
    const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let a: RegExpExecArray | null;
    let consumed = 0;
    while ((a = attrRe.exec(rawAttrs!))) {
      assert.ok(!names.has(a[1]!), `${id}: duplicate attribute ${a[1]} on <${name}>`);
      names.add(a[1]!);
      consumed += a[0].length;
    }
    const leftover = rawAttrs!.replace(attrRe, '').trim();
    assert.equal(leftover, '', `${id}: unparsed attribute text on <${name}>: ${JSON.stringify(leftover)}`);
    void consumed;
    if (!selfClosing) stack.push(name!);
  }
  assert.ok(seen > 0, `${id}: no tags`);
  assert.deepEqual(stack, [], `${id}: unclosed tags ${stack.join(', ')}`);
  assert.ok(!/NaN|undefined/.test(svg), `${id}: NaN or undefined in the markup`);
}

describe('fragments', () => {
  test('every family produces well-formed SVG across several seeds', () => {
    for (const fam of FAMILIES.all) {
      for (let n = 0; n < 6; n++) assertWellFormed(generateFragment(`${fam.key}.${n}`).svg, `${fam.key}.${n}`);
    }
  });

  test('every category fills a tray, and "all" mixes them', () => {
    for (const t of THEMES) {
      const tray = generateTray(t.id, 60);
      assert.equal(tray.length, 60);
      for (const f of tray) assertWellFormed(f.svg, f.id);
    }
    assert.ok(new Set(generateTray('all', 60).map((f) => f.theme)).size >= 8, '"all" should span the categories');
  });

  test('the same id always yields the same bytes', () => {
    assert.equal(generateFragment('sneaker.4').svg, generateFragment('sneaker.4').svg);
  });

  test('variants stay in the family', () => {
    for (const v of variantsOf('tote.2', 4, 1)) assert.equal(v.family, 'tote');
  });

  test('an unknown id throws rather than drawing nothing', () => {
    assert.throws(() => generateFragment('leaf.0'));
    assert.throws(() => generateFragment('tee'));
  });
});
