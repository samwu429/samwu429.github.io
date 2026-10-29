import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineTokens, stripMarkup } from '../../../engine/core/text/inline-markup.js';

test('inlineTokens reads bold, code and line breaks; everything else stays text', () => {
  assert.deepEqual(inlineTokens('状态树（**state tree**）用 `minimax`\n求值'), [
    { type: 'text', text: '状态树（' },
    { type: 'strong', children: [{ type: 'text', text: 'state tree' }] },
    { type: 'text', text: '）用 ' },
    { type: 'code', text: 'minimax' },
    { type: 'break' },
    { type: 'text', text: '求值' },
  ]);
});

test('bold may contain code, and code is always literal', () => {
  assert.deepEqual(inlineTokens('**use `x = 1`**'), [
    { type: 'strong', children: [{ type: 'text', text: 'use ' }, { type: 'code', text: 'x = 1' }] },
  ]);
  assert.deepEqual(inlineTokens('`**not bold**`'), [{ type: 'code', text: '**not bold**' }]);
});

test('markup characters without a partner, and HTML, stay plain text', () => {
  assert.deepEqual(inlineTokens('2 ** 3 and a ` tick'), [{ type: 'text', text: '2 ** 3 and a ` tick' }]);
  assert.deepEqual(inlineTokens('****'), [{ type: 'text', text: '****' }]);
  assert.deepEqual(inlineTokens('<b>x</b>'), [{ type: 'text', text: '<b>x</b>' }]);
  assert.deepEqual(inlineTokens(null), []);
  assert.deepEqual(inlineTokens(42), [{ type: 'text', text: '42' }]);
});

test('stripMarkup removes bold and code markers for speech, search and labels', () => {
  assert.equal(stripMarkup('**Precision** = `TP / (TP + FP)`'), 'Precision = TP / (TP + FP)');
  assert.equal(stripMarkup('no markup'), 'no markup');
  assert.equal(stripMarkup('2 ** 3'), '2 ** 3');
  assert.equal(stripMarkup(undefined), '');
});
