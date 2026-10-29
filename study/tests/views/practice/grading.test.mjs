import test from 'node:test';
import assert from 'node:assert/strict';

import {
  containsChinese,
  correctAnswerText,
  correctIndices,
  countWords,
  expectedBoolean,
  formatNumber,
  gradeCalc,
  gradeMcq,
  gradeMulti,
  gradeQuestion,
  gradeTf,
  gradeWritten,
  hasResponse,
  parseNumber,
  withUnit,
} from '../../../engine/views/practice/logic/grading.js';
import { FALLBACK_POINT, questionMarks, scoringPoints } from '../../../engine/views/practice/logic/question-types.js';

const options = (count) => Array.from({ length: count }, (_, index) => ({ en: `Option ${index}`, zh: `选项 ${index}` }));
const mcq = { id: 'lec01-q01', type: 'mcq', options: options(4), answer: 2 };
const multi = { id: 'lec01-q02', type: 'multi', options: options(6), answer: [0, 1, 3, 4] };
const tf = { id: 'lec01-q03', type: 'tf', answer: false };
const calcPercent = { id: 'lec01-q04', type: 'calc', answer: 87.5, tolerance: 0.1, unit: '%' };
const calcCount = { id: 'lec01-q05', type: 'calc', answer: 8, tolerance: 0 };
const calcGap = { id: 'lec01-q06', type: 'calc', answer: -14, tolerance: 0.05, unit: 'pp' };
const shortQ = {
  id: 'lec01-q07',
  type: 'short',
  modelAnswer: { en: 'Model.', zh: '参考。' },
  points: [{ en: 'A', zh: '甲' }, { en: 'B', zh: '乙' }, { en: 'C', zh: '丙' }, { en: 'D', zh: '丁' }],
};

test('mcq: right, wrong, unanswered and out-of-range choices', () => {
  assert.equal(gradeMcq(mcq, 2).correct, true);
  const wrong = gradeMcq(mcq, 1);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.answered, true);
  assert.equal(wrong.expected, 2);
  assert.equal(gradeMcq(mcq, null).answered, false);
  assert.equal(gradeMcq(mcq, 7).answered, false);
  assert.equal(gradeMcq(mcq, 1.5).answered, false);
  assert.equal(gradeMcq({ ...mcq, answer: undefined }, 2).correct, false);
});

test('multi: exact set match only, with hits, misses and extras', () => {
  const exact = gradeMulti(multi, [4, 3, 1, 0]);
  assert.equal(exact.correct, true);
  assert.deepEqual(exact.selected, [0, 1, 3, 4]);

  const partial = gradeMulti(multi, [0, 1, 2]);
  assert.equal(partial.correct, false);
  assert.deepEqual(partial.hits, [0, 1]);
  assert.deepEqual(partial.missed, [3, 4]);
  assert.deepEqual(partial.extra, [2]);
  assert.equal(partial.hitRatio, 0.5);

  const superset = gradeMulti(multi, [0, 1, 2, 3, 4, 5]);
  assert.equal(superset.correct, false);
  assert.deepEqual(superset.extra, [2, 5]);

  const duplicates = gradeMulti(multi, [0, 0, 1, 3, 4, 4, 9, -1]);
  assert.equal(duplicates.correct, true);

  const empty = gradeMulti(multi, []);
  assert.equal(empty.answered, false);
  assert.equal(empty.correct, false);
  assert.equal(gradeMulti(multi, null).answered, false);
});

test('multi: unsorted or single-number answers in content are normalised', () => {
  assert.deepEqual(correctIndices({ answer: [3, 1, 1] }), [1, 3]);
  assert.deepEqual(correctIndices({ answer: 2 }), [2]);
  assert.deepEqual(correctIndices({}), []);
  assert.equal(gradeMulti({ ...multi, answer: [4, 0, 3, 1] }, [0, 1, 3, 4]).correct, true);
  assert.equal(gradeMulti({ ...multi, answer: [] }, [0]).correct, false);
});

test('tf: booleans, string answers in content, unanswered', () => {
  assert.equal(gradeTf(tf, false).correct, true);
  assert.equal(gradeTf(tf, true).correct, false);
  assert.equal(gradeTf(tf, null).answered, false);
  assert.equal(gradeTf(tf, 'false').answered, false);
  assert.equal(expectedBoolean({ answer: 'True' }), true);
  assert.equal(expectedBoolean({ answer: 'false ' }), false);
  assert.equal(expectedBoolean({ answer: 1 }), null);
  assert.equal(gradeTf({ answer: 'maybe' }, true).correct, false);
});

test('parseNumber reads the ways learners type numbers', () => {
  assert.equal(parseNumber('87.5'), 87.5);
  assert.equal(parseNumber(' 87.5 % '), 87.5);
  assert.equal(parseNumber('-14pp'), -14);
  assert.equal(parseNumber('−14'), -14);
  assert.equal(parseNumber('－14'), -14);
  assert.equal(parseNumber('８７．５％'), 87.5);
  assert.equal(parseNumber('87。5'), 87.5);
  assert.equal(parseNumber('1,000'), 1000);
  assert.equal(parseNumber('87,5'), 87.5);
  assert.equal(parseNumber('7/8'), 0.875);
  assert.equal(parseNumber('7/0'), null);
  assert.equal(parseNumber('+4'), 4);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('8 times'), 8);
  assert.equal(parseNumber('8次'), 8);
  assert.equal(parseNumber('≈ 69.4'), 69.4);
  assert.equal(parseNumber('1e3'), 1000);
  assert.equal(parseNumber(42), 42);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('12abc34'), null);
  assert.equal(parseNumber('1,5,6'), null);
  assert.equal(parseNumber('Infinity'), null);
  assert.equal(parseNumber(Number.NaN), null);
  assert.equal(parseNumber(null), null);
});

test('parseNumber removes the question unit first, even with digits or slashes in it', () => {
  assert.equal(parseNumber('180 cm²', { unit: 'cm²' }), 180);
  assert.equal(parseNumber('180cm2', { unit: 'cm²' }), 180);
  assert.equal(parseNumber('8.314 L·kPa/(mol·K)', { unit: 'L·kPa/(mol·K)' }), 8.314);
  assert.equal(parseNumber('60 km/h', { unit: 'km/h' }), 60);
  assert.equal(parseNumber('12 tokens', { unit: 'tokens' }), 12);
  assert.equal(parseNumber('cm²', { unit: 'cm²' }), null);
  assert.equal(parseNumber('180 cm²'), null);
  assert.equal(gradeCalc({ type: 'calc', answer: 180, tolerance: 0.1, unit: 'cm²' }, '180 cm²').correct, true);
});

test('calc: absolute tolerance boundaries and float noise', () => {
  assert.equal(gradeCalc(calcPercent, '87.5').correct, true);
  assert.equal(gradeCalc(calcPercent, '87.6').correct, true);
  assert.equal(gradeCalc(calcPercent, '87.4%').correct, true);
  assert.equal(gradeCalc(calcPercent, '87.39').correct, false);
  assert.equal(gradeCalc(calcCount, '8').correct, true);
  assert.equal(gradeCalc(calcCount, '8.01').correct, false);
  assert.equal(gradeCalc({ type: 'calc', answer: 0.3, tolerance: 0 }, 0.1 + 0.2).correct, true);
  assert.equal(gradeCalc(calcGap, '-14.0').correct, true);
  assert.equal(gradeCalc({ type: 'calc', answer: '4', tolerance: '0' }, '4').correct, true);
  assert.equal(gradeCalc({ type: 'calc', answer: 4 }, '4').correct, true);
});

test('calc: hints for typical slips', () => {
  assert.equal(gradeCalc(calcGap, '14').hint, 'sign');
  assert.equal(gradeCalc(calcPercent, '0.875').hint, 'ratio-for-percent');
  assert.equal(gradeCalc(calcPercent, '87').hint, 'close');
  assert.equal(gradeCalc(calcPercent, '12.5').hint, null);
  assert.equal(gradeCalc(calcCount, '7').hint, null);
  const unreadable = gradeCalc(calcPercent, 'eighty');
  assert.equal(unreadable.answered, false);
  assert.equal(unreadable.hint, 'unreadable');
  assert.equal(gradeCalc(calcPercent, '').hint, null);
  assert.equal(gradeCalc({ type: 'calc', answer: 'x' }, '1').correct, false);
});

test('written: correct once at least half of the points are covered', () => {
  const written = { text: 'Symbolic AI follows rules written by people.' };
  assert.equal(gradeWritten(shortQ, [0, 2], written).correct, true);
  assert.equal(gradeWritten(shortQ, [3], written).correct, false);
  assert.equal(gradeWritten(shortQ, [], written).correct, false);
  const three = { ...shortQ, points: shortQ.points.slice(0, 3) };
  assert.equal(gradeWritten(three, [0], written).correct, false);
  assert.equal(gradeWritten(three, [0, 2], written).correct, true);
  assert.equal(gradeWritten(three, [0, 2], written).needed, 2);
  const result = gradeWritten(shortQ, [1, 1, 9, -2, 0], { text: 'Symbolic AI uses rules.' });
  assert.deepEqual(result.covered, [0, 1]);
  assert.equal(result.coveredCount, 2);
  assert.equal(result.total, 4);
  assert.equal(result.words, 4);
  assert.equal(result.answered, true);
  assert.equal(gradeWritten(shortQ, [], { text: '  ' }).answered, false);
});

test('written: ticked points do not count for a blank answer', () => {
  for (const text of ['', '   ', undefined]) {
    const result = gradeWritten(shortQ, [0, 1, 2, 3], { text });
    assert.equal(result.answered, false);
    assert.equal(result.correct, false);
    assert.equal(result.coveredCount, 0);
    assert.deepEqual(result.covered, []);
  }
  assert.equal(gradeQuestion(shortQ, { text: '', covered: [0, 1, 2, 3] }).correct, false);
});

test('written: questions without points fall back to one overall point', () => {
  const bare = { type: 'long', modelAnswer: { en: 'x' } };
  assert.deepEqual(scoringPoints(bare), [FALLBACK_POINT]);
  assert.equal(gradeWritten(bare, [0], { text: 'x' }).correct, true);
  assert.equal(gradeWritten(bare, [], { text: 'x' }).correct, false);
  assert.equal(questionMarks(bare), 1);
  assert.deepEqual(scoringPoints({ type: 'short', points: ['Plain string', null, {}] }), [{ en: 'Plain string' }]);
  assert.equal(questionMarks(shortQ), 4);
  assert.equal(questionMarks(mcq), 1);
});

test('gradeQuestion dispatches by type and survives unknown types', () => {
  assert.equal(gradeQuestion(mcq, 2).correct, true);
  assert.equal(gradeQuestion(multi, [0, 1, 3, 4]).correct, true);
  assert.equal(gradeQuestion(tf, false).correct, true);
  assert.equal(gradeQuestion(calcPercent, '87.5%').correct, true);
  assert.equal(gradeQuestion(shortQ, { text: 'x', covered: [0, 1] }).correct, true);
  assert.equal(gradeQuestion({ ...shortQ, type: 'long' }, null).correct, false);
  const unknown = gradeQuestion({ type: 'essay' }, 'x');
  assert.equal(unknown.unsupported, true);
  assert.equal(unknown.correct, false);
  assert.equal(gradeQuestion(null, 1).correct, false);
});

test('hasResponse per type', () => {
  assert.equal(hasResponse(mcq, 0), true);
  assert.equal(hasResponse(mcq, null), false);
  assert.equal(hasResponse(multi, [1]), true);
  assert.equal(hasResponse(multi, []), false);
  assert.equal(hasResponse(tf, false), true);
  assert.equal(hasResponse(tf, null), false);
  assert.equal(hasResponse(calcCount, ' 8 '), true);
  assert.equal(hasResponse(calcCount, '   '), false);
  assert.equal(hasResponse(calcCount, 3), true);
  assert.equal(hasResponse(shortQ, { text: 'Hello' }), true);
  assert.equal(hasResponse(shortQ, { text: '' }), false);
  assert.equal(hasResponse({ type: 'essay' }, 'x'), false);
});

test('answer text and number formatting', () => {
  assert.equal(correctAnswerText(mcq), 'C');
  assert.equal(correctAnswerText(multi), 'A, B, D, E');
  assert.equal(correctAnswerText(tf), 'False');
  assert.equal(correctAnswerText(calcPercent), '87.5%');
  assert.equal(correctAnswerText(calcGap), '-14 pp');
  assert.equal(correctAnswerText(calcCount), '8');
  assert.equal(correctAnswerText(shortQ), '');
  assert.equal(formatNumber(86.50000001), '86.5');
  assert.equal(formatNumber(-0.0000001), '0');
  assert.equal(formatNumber(Number.NaN), '');
  assert.equal(withUnit('5', ''), '5');
});

test('word count and Chinese detection for written answers', () => {
  assert.equal(countWords("Machine learning doesn't need rules."), 5);
  assert.equal(countWords('  '), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords('AI 很强'), 3);
  assert.equal(containsChinese('The model 过拟合 here'), true);
  assert.equal(containsChinese('Overfitting happens.'), false);
});
