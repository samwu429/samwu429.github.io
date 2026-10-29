import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSlides,
  hashWithQuery,
  parseUnitParam,
  sourceLabel,
  unitChoices,
  unitShortLabel,
  unitTitleText,
} from '../../../engine/views/glossary/logic/unit-refs.js';

const LEC3 = { id: 'lec03', kind: 'lecture', number: 3, title: { zh: '搜索与博弈', en: 'Search' } };
const LAB2 = { id: 'lab02', kind: 'lab', number: 2, title: { zh: '海龟画图', en: 'Turtle Algorithms' } };

test('unitShortLabel names lectures and labs by number', () => {
  assert.equal(unitShortLabel(LEC3), 'Lec 3');
  assert.equal(unitShortLabel(LAB2), 'Lab 2');
  assert.equal(unitShortLabel({ id: 'tut01', kind: 'tutorial', number: '1' }), 'Tut 1');
});

test('unitShortLabel falls back to the upper-cased id', () => {
  assert.equal(unitShortLabel({ id: 'review', kind: 'other', number: 1 }), 'REVIEW');
  assert.equal(unitShortLabel({ id: 'lec09', kind: 'lecture', number: null }), 'LEC09');
  assert.equal(unitShortLabel(undefined, 'lab09'), 'LAB09');
  assert.equal(unitShortLabel(null), '');
});

test('formatSlides and sourceLabel produce "Lec 3 · p.19-22"', () => {
  assert.equal(formatSlides('19-22'), 'p.19-22');
  assert.equal(formatSlides(' 3, 7, 11 '), 'p.3, 7, 11');
  assert.equal(formatSlides(12), 'p.12');
  assert.equal(formatSlides(''), '');
  assert.equal(formatSlides(undefined), '');
  assert.equal(sourceLabel(LEC3, '19-22'), 'Lec 3 · p.19-22');
  assert.equal(sourceLabel(LAB2, ''), 'Lab 2');
  assert.equal(sourceLabel(undefined, '4', 'lab09'), 'LAB09 · p.4');
});

test('unitTitleText joins the Chinese and English titles', () => {
  assert.equal(unitTitleText(LEC3), '搜索与博弈 Search');
  assert.equal(unitTitleText({ title: { en: 'Only English' } }), 'Only English');
  assert.equal(unitTitleText({}), '');
});

test('parseUnitParam keeps known ids in course order without duplicates', () => {
  const valid = ['lec01', 'lec03', 'lab02'];
  assert.deepEqual(parseUnitParam('lab02,lec01,lab02', valid), ['lec01', 'lab02']);
  assert.deepEqual(parseUnitParam('lec99, lec03 ', valid), ['lec03']);
  assert.deepEqual(parseUnitParam('', valid), []);
  assert.deepEqual(parseUnitParam(null, valid), []);
});

test('hashWithQuery joins lists with commas, encodes text and skips empty values', () => {
  assert.equal(hashWithQuery('/glossary', {}), '#/glossary');
  assert.equal(hashWithQuery('/glossary', { q: '', unit: [], sort: null }), '#/glossary');
  assert.equal(hashWithQuery('/flashcards', { unit: ['lec03', 'lab03'], dir: 'zh-en' }), '#/flashcards?unit=lec03,lab03&dir=zh-en');
  assert.equal(hashWithQuery('/glossary', { q: 'state tree & 状态' }), '#/glossary?q=state%20tree%20%26%20%E7%8A%B6%E6%80%81');
  const parsed = new URLSearchParams(hashWithQuery('/glossary', { q: 'a+b c', unit: ['x'] }).split('?')[1]);
  assert.equal(parsed.get('q'), 'a+b c');
  assert.equal(parsed.get('unit'), 'x');
});

test('unitChoices lists units with terms in course order, then unknown units', () => {
  const counts = new Map([['lab02', 4], ['extra', 1], ['lec03', 9]]);
  const choices = unitChoices([LEC3, { id: 'lec04', kind: 'lecture', number: 4 }, LAB2], counts);
  assert.deepEqual(choices.map((choice) => [choice.id, choice.label, choice.count]), [
    ['lec03', 'Lec 3', 9],
    ['lab02', 'Lab 2', 4],
    ['extra', 'EXTRA', 1],
  ]);
  assert.equal(choices[0].title, '搜索与博弈 Search');
  assert.deepEqual(unitChoices(undefined, new Map()), []);
});
