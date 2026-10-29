import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APPROX,
  ELLIPSIS,
  MINUS,
  STAT_DIGITS,
  formatFixed,
  formatFraction,
  formatInterval,
  formatLineEquation,
  formatOperand,
  formatPercent,
  formatProportion,
  formatResult,
  formatSigned,
  formatStemLabel,
  formatTerms,
  formatTrim,
  nameInSentence,
  ordinal,
  relationSign,
  roundTo,
} from '../../../../engine/widgets/statistics/shared/stat-format.js';
import {
  cellFraction, contingency, frequencyTable, marginalFraction, sortAscending, stemAndLeaf,
} from '../../../../engine/widgets/statistics/shared/stats-math.js';

// M3 p.5: calories of the 30 Tim Hortons donuts. 第 3 单元第 5 页：30 个甜甜圈的热量。
const DONUTS = [
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
];

test('the shared formatters print a real minus sign and round half away from zero', () => {
  assert.equal(MINUS, '−');
  assert.equal(APPROX, '≈');
  assert.equal(formatFixed(-1.4183, 2), '−1.42');
  assert.equal(formatFixed(0.2, 2), '0.20');
  assert.equal(formatTrim(277.5, 2), '277.5');
  assert.equal(formatTrim(251, 2), '251');
  assert.equal(formatSigned(2.9764, 2), '+2.98');
  assert.equal(formatSigned(-1.4183, 2), '−1.42');
  assert.equal(formatPercent(6 / 30), '20%');
  assert.equal(formatPercent(203 / 711, 2), '28.55%');
  assert.equal(formatOperand(-2), '(−2)');
  assert.equal(roundTo(0.3125, 3), 0.313);
  assert.equal(formatFixed(Number.NaN, 2), '—');
});

test('STAT_DIGITS records the course\'s usual decimals and cannot be changed', () => {
  assert.equal(STAT_DIGITS.variance, 4);
  assert.equal(STAT_DIGITS.sd, 2);
  assert.equal(STAT_DIGITS.z, 2);
  assert.equal(STAT_DIGITS.proportion, 3);
  assert.ok(Object.isFrozen(STAT_DIGITS));
  assert.equal(formatFixed(72670 / 29, STAT_DIGITS.variance), '2505.8621');
});

test('relationSign uses "=" for exact values and "≈" for rounded ones', () => {
  assert.equal(relationSign(7530 / 30), '=');
  assert.equal(relationSign(72670 / 29, 4), '≈');
  assert.equal(relationSign(277.5, 1), '=');
  assert.equal(relationSign(277.5, 0), '≈');
  assert.equal(relationSign(0.2 * 100, 1), '=');
  assert.equal(relationSign(Number.NaN), '=');
});

test('formatResult closes a worked step: "= 251", "≈ 2505.8621", "≈ 50.06"', () => {
  assert.equal(formatResult(7530 / 30), '= 251');
  assert.equal(formatResult(72670 / 29, 4), '≈ 2505.8621');
  assert.equal(formatResult(Math.sqrt(72670 / 29), 2), '≈ 50.06');
  assert.equal(formatResult(6 / 30, 2, { fixed: true }), '= 0.20');
  assert.equal(formatResult(Number.NaN), '= —');
});

test('proportions keep fixed decimals like the midterm answers', () => {
  assert.equal(formatProportion(30 / 96), '0.313');
  assert.equal(formatProportion(88 / 1021), '0.086');
  assert.equal(formatProportion(6 / 30, 2), '0.20');
  assert.equal(formatProportion(Number.NaN), '—');
});

test('formatFraction writes the fraction behind a proportion, as a decimal or a percentage', () => {
  const table = contingency([[30, 66], [88, 933]]);
  assert.equal(formatFraction(cellFraction(table, 0, 0, 'row')), '30 / 96 ≈ 0.313');
  assert.equal(formatFraction(cellFraction(table, 0, 0)), '30 / 1117 ≈ 0.027');
  assert.equal(formatFraction(marginalFraction(table, 'column', 0)), '118 / 1117 ≈ 0.106');
  assert.equal(formatFraction(cellFraction(table, 0, 0, 'row'), { percent: true }), '30 / 96 ≈ 31.3%');
  assert.equal(formatFraction({ numerator: 6, denominator: 30, value: 0.2 }, { digits: 2 }), '6 / 30 = 0.20');
  assert.equal(formatFraction({ numerator: 6, denominator: 30, value: 0.2 }, { percent: true }), '6 / 30 = 20%');
  assert.equal(formatFraction({ numerator: 0, denominator: 0, value: Number.NaN }), '0 / 0');
});

test('formatInterval writes the bins of R\'s histogram and of left-closed bins', () => {
  const right = frequencyTable(DONUTS, { start: 150, width: 50 });
  assert.deepEqual(
    right.bins.map((bin) => formatInterval(bin)),
    ['[150, 200]', '(200, 250]', '(250, 300]', '(300, 350]', '(350, 400]'],
  );
  const left = frequencyTable(DONUTS, { start: 150, width: 50, closed: 'left' });
  assert.equal(formatInterval(left.bins[5]), '[400, 450)');
  const decimals = frequencyTable([0.1, 0.25], { start: 0, width: 0.1 });
  assert.deepEqual(decimals.bins.map((bin) => formatInterval(bin)), ['[0, 0.1]', '(0.1, 0.2]', '(0.2, 0.3]']);
  assert.equal(formatInterval({ lower: -15, upper: -10, leftClosed: true, rightClosed: true }), '[−15, −10]');
  assert.equal(formatInterval({ lower: 1, upper: 2, leftClosed: false, rightClosed: true }, 1), '(1, 2]');
  assert.equal(formatInterval({ lower: 1 / 3, upper: 2 / 3, leftClosed: false, rightClosed: true }, 2), '(0.33, 0.67]');
});

test('formatTerms writes a sum like M3 p.30 and p.45, shortening long ones with "⋯"', () => {
  const sorted = sortAscending(DONUTS);
  assert.equal(ELLIPSIS, '⋯');
  assert.equal(formatTerms(sorted, { maxTerms: 4 }), '180 + 190 + ⋯ + 400');
  assert.equal(formatTerms(sorted), '180 + 190 + 190 + 190 + ⋯ + 400');
  assert.equal(formatTerms([-2, -1, 3]), '(−2) + (−1) + 3');
  assert.equal(formatTerms([2, 3, 7], { maxTerms: 3 }), '2 + 3 + 7');
  assert.equal(formatTerms([1, 2, 3, 4], { maxTerms: 1 }), '1 + ⋯ + 4');
  assert.equal(
    formatTerms(sorted, { maxTerms: 4, term: (value) => `(${value} ${MINUS} 251)²` }),
    '(180 − 251)² + (190 − 251)² + ⋯ + (400 − 251)²',
  );
  assert.equal(formatTerms(null), '');
});

test('ordinal gives English positions for the steps and leaves fractional ranks as numbers', () => {
  assert.deepEqual([1, 2, 3, 4, 8, 11, 12, 13, 15, 16, 21, 22, 23, 30, 101, 111, 112].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '8th', '11th', '12th', '13th', '15th', '16th', '21st', '22nd', '23rd', '30th', '101st',
    '111th', '112th',
  ]);
  assert.equal(ordinal(15.5), '15.5');
  assert.equal(ordinal(8.25), '8.25');
});

test('formatStemLabel prints the stems of R\'s display, with "−0" for the negative zero stem', () => {
  assert.deepEqual(stemAndLeaf(DONUTS, { leafUnit: 10, split: true }).lines.map(formatStemLabel), ['1', '2', '2', '3', '3', '4']);
  assert.deepEqual(stemAndLeaf([-15, -3, 2], { leafUnit: 1 }).lines.map(formatStemLabel), ['−1', '−0', '0']);
  assert.equal(formatStemLabel(null), '');
});

test('nameInSentence lowers a label for the middle of a sentence without ever mixing cases', () => {
  const cases = [
    // A Title Case label: every capitalized word outside brackets. 标题式大写：括号外每个首字母大写的单词。
    ['Reaction Time (in seconds)', 'reaction time (in seconds)'],
    ['% Drug Amount', '% drug amount'],
    ['Hours of Study per Week', 'hours of study per week'],
    ['Body Mass Index (BMI)', 'body mass index (BMI)'],
    ['Calories', 'calories'],
    // Any other label: its first word only, so names inside keep their capitals. 其他标签：只改第一个单词。
    ['Calories in Tim Hortons donuts', 'calories in Tim Hortons donuts'],
    ['Number of sales people working', 'number of sales people working'],
    ['Time (in minutes)', 'time (in minutes)'],
    ['Capacity (in TB)', 'capacity (in TB)'],
    ['The cost of Prozac', 'the cost of Prozac'],
    // Kept as written: acronyms, R names, small-letter labels, mixed case. 保持原样：缩写、R 名称、小写标签、混合大小写。
    ['GDP per capita', 'GDP per capita'],
    ['GPA', 'GPA'],
    ['R output', 'R output'],
    ['Type.of.Donut', 'Type.of.Donut'],
    ['original.data', 'original.data'],
    ['calories in Tim Hortons donuts', 'calories in Tim Hortons donuts'],
    ['pH Level', 'pH Level'],
    ['  Quiz mark  ', 'quiz mark'],
  ];
  for (const [label, expected] of cases) assert.equal(nameInSentence(label), expected, label);
  for (const value of [undefined, null, 5, { en: 'x' }]) assert.equal(nameInSentence(value), '');
  assert.equal(nameInSentence(''), '');
});

test('formatLineEquation writes fitted lines the way the course does', () => {
  assert.equal(formatLineEquation({ b0: 13.31, b1: 0.69 }), 'ŷ = 13.31 + 0.69x');
  assert.equal(formatLineEquation({ b0: -0.1, b1: 0.7 }), 'ŷ = −0.1 + 0.7x');
  assert.equal(formatLineEquation({ b0: 560.65126, b1: -3.0770733 }, { x: 'time' }), 'ŷ = 560.65 − 3.08 time');
  assert.equal(
    formatLineEquation({ b0: 560.65126, b1: -3.0770733 }, { digits: 5, y: 'calories-hat', x: 'time' }),
    'calories-hat = 560.65126 − 3.07707 time',
  );
  assert.equal(formatLineEquation({ b0: 2, b1: 0.5 }, { fixed: true }), 'ŷ = 2.00 + 0.50x');
  assert.equal(formatLineEquation({ b0: Number.NaN, b1: 1 }), 'ŷ = —');
  assert.equal(formatLineEquation(null), 'ŷ = —');
});
