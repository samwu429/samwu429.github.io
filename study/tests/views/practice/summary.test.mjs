import test from 'node:test';
import assert from 'node:assert/strict';

import { combineStats, marksFor, summarizeResults, unitPracticeStats } from '../../../engine/views/practice/logic/summary.js';
import { gradeQuestion } from '../../../engine/views/practice/logic/grading.js';

const points = (count) => Array.from({ length: count }, (_, index) => ({ en: `Point ${index}`, zh: `要点 ${index}` }));
const questions = [
  { id: 'lec01-q01', unitId: 'lec01', type: 'mcq', options: [{}, {}, {}], answer: 0 },
  { id: 'lec01-q02', unitId: 'lec01', type: 'tf', answer: true },
  { id: 'lec01-q03', unitId: 'lec01', type: 'long', points: points(5) },
  { id: 'lec02-q01', unitId: 'lec02', type: 'calc', answer: 70, tolerance: 0, unit: '%' },
  { id: 'lec02-q02', unitId: 'lec02', type: 'multi', options: [{}, {}, {}, {}], answer: [1, 2] },
  { id: 'lec02-q03', unitId: 'lec02', type: 'short', points: points(2) },
];

test('marksFor: objective 1 mark, written 1 per point covered', () => {
  assert.deepEqual(marksFor(questions[0], gradeQuestion(questions[0], 0)), { earned: 1, possible: 1 });
  assert.deepEqual(marksFor(questions[0], gradeQuestion(questions[0], 1)), { earned: 0, possible: 1 });
  assert.deepEqual(marksFor(questions[2], gradeQuestion(questions[2], { text: 'x', covered: [0, 1] })), { earned: 2, possible: 5 });
  assert.deepEqual(marksFor(questions[2], null), { earned: 0, possible: 5 });
});

test('summarizeResults: totals, per-unit and per-type rows, id lists', () => {
  const responses = [0, false, { text: 'Answer', covered: [0, 1, 2] }, '70', null, { text: 'Short', covered: [] }];
  const entries = questions.map((question, index) => ({
    question,
    result: responses[index] === null ? null : gradeQuestion(question, responses[index]),
  }));
  const summary = summarizeResults(entries, { unitOrder: ['lec02', 'lec01', 'lab01'] });

  assert.equal(summary.totals.questions, 6);
  assert.equal(summary.totals.answered, 5);
  assert.equal(summary.totals.correct, 3);
  assert.equal(summary.totals.earned, 1 + 0 + 3 + 1 + 0 + 0);
  assert.equal(summary.totals.possible, 1 + 1 + 5 + 1 + 1 + 2);
  assert.equal(summary.totals.percent, (100 * 5) / 11);
  assert.equal(summary.totals.accuracy, 3 / 5);
  assert.equal(summary.totals.objectiveQuestions, 4);
  assert.equal(summary.totals.objectiveCorrect, 2);
  assert.equal(summary.totals.writtenEarned, 3);
  assert.equal(summary.totals.writtenPossible, 7);

  assert.deepEqual(summary.byUnit.map((row) => row.unitId), ['lec02', 'lec01']);
  assert.equal(summary.byUnit[1].earned, 4);
  assert.equal(summary.byUnit[1].possible, 7);
  assert.equal(summary.byType.mcq.correct, 1);
  assert.equal(summary.byType.multi.answered, 0);

  assert.deepEqual(summary.correctIds, ['lec01-q01', 'lec01-q03', 'lec02-q01']);
  assert.deepEqual(summary.wrongIds, ['lec01-q02', 'lec02-q03']);
  assert.deepEqual(summary.unansweredIds, ['lec02-q02']);
});

test('summarizeResults: empty input and units missing from unitOrder', () => {
  const empty = summarizeResults([]);
  assert.equal(empty.totals.questions, 0);
  assert.equal(empty.totals.percent, null);
  assert.equal(empty.totals.accuracy, null);
  assert.deepEqual(empty.byUnit, []);
  const stray = summarizeResults([{ question: questions[0], result: null }, { question: null }], { unitOrder: [] });
  assert.deepEqual(stray.byUnit.map((row) => row.unitId), ['lec01']);
  assert.deepEqual(stray.unansweredIds, ['lec01-q01']);
});

test('unitPracticeStats: accuracy from attempts, mistakes, attempted', () => {
  const attempts = {
    'lec01-q01': { tries: 2, correct: 1, last: 'right' },
    'lec01-q02': { tries: 1, correct: 0, last: 'wrong' },
    'lec02-q01': { tries: 'bad', correct: 3 },
    'lec02-q02': { tries: 1, correct: 5, last: 'right' },
  };
  const stats = unitPracticeStats(questions, attempts, ['lec01-q02', 'nope']);
  const lec01 = stats.get('lec01');
  assert.equal(lec01.total, 3);
  assert.equal(lec01.attempted, 2);
  assert.equal(lec01.tries, 3);
  assert.equal(lec01.correct, 1);
  assert.equal(lec01.accuracy, 1 / 3);
  assert.equal(lec01.lastRight, 1);
  assert.equal(lec01.mistakes, 1);
  assert.deepEqual(lec01.byType, { mcq: 1, tf: 1, long: 1 });
  const lec02 = stats.get('lec02');
  assert.equal(lec02.attempted, 1);
  assert.equal(lec02.correct, 1);
  assert.equal(lec02.accuracy, 1);

  const overall = combineStats(stats);
  assert.equal(overall.total, 6);
  assert.equal(overall.tries, 4);
  assert.equal(overall.accuracy, 2 / 4);

  const fresh = unitPracticeStats(questions, null, null);
  assert.equal(fresh.get('lec01').accuracy, null);
});
