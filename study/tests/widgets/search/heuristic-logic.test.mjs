import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advantageShare,
  clampCount,
  clampWeight,
  exceedsRewardRange,
  formatNumber,
  formulaLines,
  joinSum,
  normalizeHeuristicConfig,
  parseNumber,
  roundNumber,
  scoreTone,
  termExpression,
  termValue,
  totalScore,
} from '../../../engine/widgets/search/heuristic-score/heuristic-logic.js';

const feature = (weight, a, b) => ({ weight, counts: [a, b] });

// Lecture 3 p.53 board counted from the screenshot: material advantage +3.
// 第 3 讲第 53 页棋盘截图数出来的子力优势：+3。
const CHESS_P53 = [feature(1, 7, 6), feature(3, 1, 1), feature(3, 0, 1), feature(5, 2, 1), feature(9, 1, 1)];
// Lab 3 lesson example with made-up counts: +4. 实验 3 讲义里的假设数量：+4。
const CHESS_LAB = [feature(1, 8, 7), feature(3, 2, 2), feature(3, 2, 1), feature(5, 2, 2), feature(9, 1, 1)];
// Lab 3 'Combined': 3 x (2 - 1) + 1 x (1 - 3) = 1. 实验 3 的 'Combined'：结果为 1。
const COMBINED = [feature(3, 2, 1), feature(1, 1, 3)];

test('material advantage matches the worked course examples', () => {
  assert.deepEqual(CHESS_P53.map(termValue), [1, 0, -3, 5, 0]);
  assert.equal(totalScore(CHESS_P53), 3);
  assert.equal(totalScore(CHESS_LAB), 4);
  assert.equal(totalScore(COMBINED), 1);
  assert.equal(termValue(feature(1, 1, 3)), -2);
  assert.equal(totalScore([]), 0);
});

test('terms always subtract B from A, so swapping the counts flips the sign', () => {
  const swapped = CHESS_P53.map(({ weight, counts }) => feature(weight, counts[1], counts[0]));
  assert.equal(totalScore(swapped), -3);
});

test('fractional weights do not leak floating-point noise', () => {
  assert.equal(totalScore([feature(0.1, 1, 0), feature(0.2, 1, 0)]), 0.3);
  assert.equal(roundNumber(-0.0000001), 0);
  assert.ok(!Object.is(roundNumber(-0.0000001), -0));
});

test('formatNumber uses a true minus sign and an optional plus sign', () => {
  assert.equal(formatNumber(4), '4');
  assert.equal(formatNumber(4, { signed: true }), '+4');
  assert.equal(formatNumber(-2, { signed: true }), '−2');
  assert.equal(formatNumber(0, { signed: true }), '0');
  assert.equal(formatNumber(0.5), '0.5');
  assert.equal(formatNumber(Number.NaN), '?');
});

test('termExpression and joinSum write the slide format', () => {
  assert.equal(termExpression(feature(1, 8, 7)), '1 × (8 − 7)');
  assert.equal(termExpression(feature(-2, 3, 1)), '(−2) × (3 − 1)');
  assert.equal(joinSum([1, 0, -3, 5, 0]), '1 + 0 − 3 + 5 + 0');
  assert.equal(joinSum([-2, 3]), '−2 + 3');
  assert.equal(joinSum([]), '0');
});

test('formulaLines goes from the slide formula to the substituted numbers to the score', () => {
  const named = [
    { name: { zh: '兵 pawns', en: 'pawns' }, weight: 1, counts: [8, 7] },
    { name: { zh: '马', en: '' }, weight: -2, counts: [1, 2] },
  ];
  assert.deepEqual(formulaLines(named), {
    symbolic: 'Score = 1 × [(# A pawns) − (# B pawns)] + (−2) × [(# A 马) − (# B 马)]',
    substituted: '= 1 × (8 − 7) + (−2) × (1 − 2)',
    terms: '= 1 + 2',
    total: '= +3',
  });
  assert.equal(formulaLines(COMBINED).substituted, '= 3 × (2 − 1) + 1 × (1 − 3)');
  assert.equal(formulaLines(COMBINED).terms, '= 3 − 2');
  assert.equal(formulaLines(COMBINED).total, '= +1');
  assert.equal(formulaLines(CHESS_P53).total, '= +3');
  assert.deepEqual(formulaLines([], { name: 'h' }), { symbolic: 'h = 0', substituted: '= 0', terms: '= 0', total: '= 0' });
});

test('scoreTone reads the sign from player A\'s point of view', () => {
  assert.equal(scoreTone(4), 'positive');
  assert.equal(scoreTone(-2), 'negative');
  assert.equal(scoreTone(0), 'zero');
  assert.equal(scoreTone(0.000001), 'zero');
  assert.equal(exceedsRewardRange(99), false);
  assert.equal(exceedsRewardRange(-100), true);
});

test('advantageShare is centred at 0 and symmetric', () => {
  assert.equal(advantageShare(0), 0.5);
  assert.ok(advantageShare(4) > 0.5 && advantageShare(4) < 1);
  assert.ok(Math.abs(advantageShare(4) + advantageShare(-4) - 1) < 1e-12);
  assert.ok(advantageShare(1000) <= 1 && advantageShare(-1000) >= 0);
  assert.equal(advantageShare(Number.NaN), 0.5);
});

test('counts and weights are clamped and parsed like learner input', () => {
  assert.equal(clampCount(-3), 0);
  assert.equal(clampCount(150), 99);
  assert.equal(clampCount('2.6'), 3);
  assert.equal(clampCount('７'), 7);
  assert.equal(clampCount('x', 5), 5);
  assert.equal(clampWeight('−2'), -2);
  assert.equal(clampWeight(500), 99);
  assert.equal(clampWeight(undefined), 1);
  assert.equal(clampWeight(0), 0);
  assert.equal(parseNumber('1.'), 1);
  assert.equal(parseNumber('1-2'), null);
});

test('normalizeHeuristicConfig keeps good fields and repairs broken ones', () => {
  const setup = normalizeHeuristicConfig({
    title: { zh: '国际象棋子力优势', en: 'Chess material advantage' },
    players: [{ zh: '白方', en: 'White' }, 'Black'],
    features: [
      { name: { zh: '兵 pawns', en: 'pawns' }, weight: 1, counts: [8, 7] },
      { name: 'knights', counts: [2] },
      null,
      { weight: 'heavy', counts: 'many' },
    ],
  });
  assert.deepEqual(setup.title, { zh: '国际象棋子力优势', en: 'Chess material advantage' });
  assert.deepEqual(setup.players, [{ zh: '白方', en: 'White' }, { zh: '', en: 'Black' }]);
  assert.equal(setup.features.length, 3);
  assert.deepEqual(setup.features[0].counts, [8, 7]);
  assert.deepEqual(setup.features[1], { id: 'feature-1', name: { zh: '', en: 'knights' }, weight: 1, counts: [2, 0] });
  assert.deepEqual(setup.features[2].name, { zh: '特征 3', en: 'Feature 3' });
  assert.equal(setup.features[2].weight, 1);
  assert.deepEqual(setup.features[2].counts, [0, 0]);
});

test('normalizeHeuristicConfig survives a missing config', () => {
  const setup = normalizeHeuristicConfig(undefined);
  assert.deepEqual(setup.features, []);
  assert.equal(setup.players.length, 2);
  assert.equal(setup.players[0].en, 'Player A');
  assert.equal(setup.title.en, 'Heuristic score');
  assert.deepEqual(setup.symbols, ['A', 'B']);
  assert.equal(setup.formulaName, 'Score');
});

test('a config can write the formula like the slide: Material Advantage with W and B', () => {
  const setup = normalizeHeuristicConfig({
    formulaName: 'Material Advantage',
    symbols: ['W', 'B'],
    features: [{ name: { en: 'pawns' }, weight: 1, counts: [8, 7] }, { name: { en: 'knights' }, weight: 3, counts: [2, 2] }],
  });
  assert.deepEqual(setup.symbols, ['W', 'B']);
  assert.equal(
    formulaLines(setup.features, { name: setup.formulaName, symbols: setup.symbols }).symbolic,
    'Material Advantage = 1 × [(# W pawns) − (# B pawns)] + 3 × [(# W knights) − (# B knights)]',
  );
  assert.deepEqual(normalizeHeuristicConfig({ symbols: ['W', 'W'] }).symbols, ['A', 'B'], 'the two symbols must differ');
  assert.deepEqual(normalizeHeuristicConfig({ symbols: ['White', 'B'] }).symbols, ['A', 'B'], 'symbols are short');
  assert.deepEqual(normalizeHeuristicConfig({ symbols: [' w ', '黑'] }).symbols, ['w', '黑']);
  assert.equal(normalizeHeuristicConfig({ formulaName: { zh: '子力优势', en: 'Material Advantage' } }).formulaName, 'Material Advantage');
  assert.equal(normalizeHeuristicConfig({ formulaName: '   ' }).formulaName, 'Score');
});
