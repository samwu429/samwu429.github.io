import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPACT_EN, COMPACT_ZH, rowClass } from '../../../../engine/views/lesson/blocks/flow-layout.js';

const step = (en, zh = '一步') => ({ en, zh });

test('two or three short steps run in a short row, four in a long row', () => {
  assert.equal(rowClass([step('Collect data'), step('Train')]), 'flow-block--row-short');
  assert.equal(rowClass([step('A'), step('B'), step('C')]), 'flow-block--row-short');
  assert.equal(rowClass([step('A'), step('B'), step('C'), step('D')]), 'flow-block--row-long');
});

test('one step, five or more steps, or any long step use the column layout', () => {
  assert.equal(rowClass([step('Only one')]), null);
  assert.equal(rowClass(['A', 'B', 'C', 'D', 'E'].map((en) => step(en))), null);
  assert.equal(rowClass([step('x'.repeat(COMPACT_EN + 1)), step('B')]), null);
  assert.equal(rowClass([step('A', '字'.repeat(COMPACT_ZH + 1)), step('B')]), null);
  assert.equal(rowClass([step('x'.repeat(COMPACT_EN), '字'.repeat(COMPACT_ZH)), step('B')]), 'flow-block--row-short');
});

test('missing or malformed items do not throw', () => {
  assert.equal(rowClass(undefined), null);
  assert.equal(rowClass([null, { en: 'B' }]), 'flow-block--row-short');
});
