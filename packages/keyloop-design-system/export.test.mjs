import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL(name, import.meta.url), 'utf8');

test('CSS variables match the exported JSON tokens and every component variable exists', async () => {
  const tokens = JSON.parse(await read('./tokens.json'));
  const css = await read('./tokens.css');
  const components = await read('./components.css');
  for (const [group, values] of Object.entries(tokens.values)) {
    for (const [name, value] of Object.entries(values)) {
      assert.ok(css.includes(`--kl-${group}-${name}: ${value};`), `${group}.${name} differs from CSS`);
    }
  }
  for (const [, variable] of components.matchAll(/var\((--kl-[\w-]+)\)/g)) {
    assert.ok(css.includes(`${variable}:`), `${variable} is undefined`);
  }
  for (const [, font] of css.matchAll(/url\("([^"]+)"\)/g)) {
    await access(new URL(font, import.meta.url));
  }
});

test('catalogue contains the nine DMS products with descriptions and valid source images', async () => {
  const { products } = JSON.parse(await read('./products.json'));
  assert.equal(products.length, 9);
  assert.equal(new Set(products.map(p => p.name)).size, products.length);
  assert.ok(!products.some(p => p.name === 'VEGA'));
  const counts = {};
  for (const product of products) {
    assert.ok(product.description?.length > 20, product.name);
    assert.equal(product.benefits.length, 3, product.name);
    assert.equal(new URL(product.image.url).protocol, 'https:');
    counts[product.domain] = (counts[product.domain] || 0) + 1;
  }
  assert.deepEqual(counts, { operate: 9 });
});
