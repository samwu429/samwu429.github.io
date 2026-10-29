import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asList,
  filterValue,
  humanizeId,
  matchesFilter,
  presentSections,
  speechText,
  splitBlanks,
  termNames,
  unitFilterOptions,
} from '../../../engine/views/review/review-logic.js';

test('splitBlanks separates text and blanks', () => {
  assert.deepEqual(splitBlanks('Both ___ and ____ are metrics.'), [
    { text: 'Both ', blank: false },
    { text: '___', blank: true },
    { text: ' and ', blank: false },
    { text: '____', blank: true },
    { text: ' are metrics.', blank: false },
  ]);
  assert.deepEqual(splitBlanks('___ first'), [{ text: '___', blank: true }, { text: ' first', blank: false }]);
  assert.deepEqual(splitBlanks('no blanks_here'), [{ text: 'no blanks_here', blank: false }]);
  assert.deepEqual(splitBlanks(''), []);
  assert.deepEqual(splitBlanks(undefined), []);
});

test('speechText turns blanks into pauses', () => {
  assert.equal(speechText('X is ___ because ___.'), 'X is … because … .');
  assert.equal(speechText(null), '');
});

test('humanizeId turns ids into readable words', () => {
  assert.equal(humanizeId('state-tree'), 'state tree');
  assert.equal(humanizeId('f1_score'), 'f1 score');
});

test('asList is defensive', () => {
  assert.deepEqual(asList([1, null, 2, undefined]), [1, 2]);
  assert.deepEqual(asList('x'), []);
});

test('termNames keeps the first definition of each id', () => {
  const names = termNames([
    { id: 'precision', en: 'Precision', zh: '精确率' },
    { id: 'precision', en: 'Other', zh: '别的' },
    { id: 'recall', en: 'Recall' },
    { en: 'No id' },
    null,
  ]);
  assert.deepEqual(names.get('precision'), { en: 'Precision', zh: '精确率' });
  assert.deepEqual(names.get('recall'), { en: 'Recall', zh: '' });
  assert.equal(names.size, 2);
});

test('unitFilterOptions labels blocks with the course unit and falls back to positions', () => {
  const options = unitFilterOptions(
    [
      { lessonId: 'lec06', title: { zh: '评估与公平', en: 'Evaluation and Fairness' } },
      { lessonId: 'lab05' },
      { lessonId: 'lec06', title: { zh: '重复', en: 'Duplicate' } },
      { lessonId: 'Weird Id', title: { zh: '其他', en: 'Other' } },
    ],
    [
      { id: 'lec06', kind: 'lecture', number: 6, title: { zh: '模型评估', en: 'Evaluation' } },
      { id: 'lab05', kind: 'lab', number: 5, title: { zh: '公平性', en: 'Fairness' } },
    ],
  );
  assert.deepEqual(options.map((option) => option.value), ['lec06', 'lab05', 'unit-4']);
  assert.deepEqual(options[0].label, { zh: '第 6 讲 · 评估与公平', en: 'Lecture 6 · Evaluation and Fairness' });
  assert.deepEqual(options[1].label, { zh: '实验 5 · 公平性', en: 'Lab 5 · Fairness' });
  assert.deepEqual(options[2].label, { zh: '其他', en: 'Other' });
});

test('filterValue and matchesFilter', () => {
  assert.equal(filterValue({ lessonId: 'lec01' }, 0), 'lec01');
  assert.equal(filterValue({}, 2), 'unit-3');
  assert.equal(matchesFilter('lec01', 'all'), true);
  assert.equal(matchesFilter('lec01', ''), true);
  assert.equal(matchesFilter('lec01', 'lec01'), true);
  assert.equal(matchesFilter('lec02', 'lec01'), false);
});

test('presentSections keeps the display order and skips empty sections', () => {
  const order = ['verbs', 'templates', 'phrases', 'mistakes', 'strategy'];
  assert.deepEqual(presentSections({ strategy: [{}], verbs: [{}], templates: [], phrases: 'x' }, order), ['verbs', 'strategy']);
  assert.deepEqual(presentSections(null, order), []);
});
