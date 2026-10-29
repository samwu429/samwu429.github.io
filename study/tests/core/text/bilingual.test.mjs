import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasText, pickText, toBi } from '../../../engine/core/text/bilingual.js';

test('toBi normalises objects and files bare strings by script', () => {
  assert.deepEqual(toBi({ zh: '搜索', en: 'Search' }), { zh: '搜索', en: 'Search' });
  assert.deepEqual(toBi({ en: 'Only English' }), { zh: '', en: 'Only English' });
  assert.deepEqual(toBi({ zh: '召回率' }), { zh: '召回率', en: '' });
  assert.deepEqual(toBi('中文句子'), { zh: '中文句子', en: '' });
  assert.deepEqual(toBi('有些工作可能被 AI 取代'), { zh: '有些工作可能被 AI 取代', en: '' });
  assert.deepEqual(toBi('English line'), { zh: '', en: 'English line' });
  assert.deepEqual(toBi('Precision'), { zh: '', en: 'Precision' });
  assert.deepEqual(toBi({ zh: '标题', en: 5 }), { zh: '标题', en: '' });
});

test('toBi rejects empty and malformed values', () => {
  assert.equal(toBi({ zh: '  ', en: '' }), null);
  assert.equal(toBi('   '), null);
  assert.equal(toBi(['x']), null);
  assert.equal(toBi(42), null);
  assert.equal(toBi(undefined), null);
});

test('pickText prefers one language and falls back to the other', () => {
  assert.equal(pickText({ zh: '搜索', en: 'Search' }, 'en'), 'Search');
  assert.equal(pickText({ en: 'Search' }, 'zh'), 'Search');
  assert.equal(pickText('plain'), 'plain');
  assert.equal(pickText(null), '');
  assert.equal(hasText(' x '), true);
  assert.equal(hasText('  '), false);
});
