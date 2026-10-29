import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roundTo } from '../../../../engine/widgets/machine-learning/shared/ml-math.js';
import {
  MAX_INPUT, MAX_POINTS, MIN_POINTS, SLIDE_EXAMPLE, adaptiveDigits, compareWithBest, defaultPredictionX,
  equationLegend, equationText, fitLine, fitSentences, interceptSentence, lineResiduals, lineSteps,
  normalizeLeastSquaresConfig, ownLineSpecs, plotExtents, pointDescription, pointOrder, predictionFor, rangePosition,
  rangeText, residualExtents, residualPlotDescription, residualRowsText, residualWork, rSquaredInfo,
  scatterDescription, sentenceNames, slopeSentence, visibleSegment,
} from '../../../../engine/widgets/statistics/least-squares-line/least-squares-line-logic.js';

// M5 p.33-44 "Drug Reaction Time": drug in the blood (%) and reaction time (seconds); ŷ = −0.1 + 0.7x.
// 第 5 单元第 33-44 页“药物与反应时间”：血液药物含量（%）与反应时间（秒）；ŷ = −0.1 + 0.7x。
const DRUG = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 4]];

// M5 regression practice: 20 toddlers, time at the lunch table (minutes) and calories; the solution prints
// ŷ = 560.65126 − 3.0770733 time, r = −0.65 and the residual of (43.1, 410).
// 第 5 单元回归练习：20 名幼儿在餐桌旁的时间（分钟）与热量；答案给出 ŷ = 560.65126 − 3.0770733 time、r = −0.65 以及 (43.1, 410) 的残差。
const TODDLERS = [
  [21.4, 472], [22.8, 508], [28.6, 489], [29.2, 504], [30.6, 480], [30.8, 498], [31.3, 437], [32.8, 423],
  [32.9, 436], [33.0, 444], [33.5, 456], [33.9, 479], [34.1, 431], [35.1, 439], [37.7, 465], [39.5, 437],
  [42.4, 450], [43.1, 410], [43.7, 408], [43.8, 454],
];
const TODDLER_CONFIG = {
  title: { zh: '幼儿午餐', en: 'Toddlers at lunch' },
  xLabel: { zh: '时间（分钟）', en: 'Time (min)' },
  yLabel: { zh: '热量', en: 'Calories' },
  xName: { zh: '在餐桌旁的时间（分钟）', en: 'time at the lunch table (in minutes)' },
  yName: { zh: '午餐摄入的热量', en: 'calories consumed during lunch' },
  points: TODDLERS,
};

// 2025 midterm Q22-Q25: writing ability (y) predicted from spelling competence (x), ŷ = 13.31 + 0.69x.
// 2025 年期中第 22-25 题：由拼写能力（x）预测写作能力（y），ŷ = 13.31 + 0.69x。
const MIDTERM_NAMES = {
  x: { zh: '拼写能力得分', en: 'the score in spelling competence' },
  y: { zh: '写作能力得分', en: 'score in writing ability' },
};
const MIDTERM_LINE = { b0: 13.31, b1: 0.69 };

// The summary example of the content spec (section 5.4). 内容规范第 5.4 节中的概括统计量例子。
const SUMMARY = { xbar: 70, sx: 10, ybar: 62, sy: 8, r: 0.77 };

const works = (steps) => steps.map((step) => step.rows.map((row) => row.work));
const pairs = (model) => model.points.map(({ x, y }) => [x, y]);

const drugModel = normalizeLeastSquaresConfig({ points: DRUG });
const drugFit = fitLine(drugModel);
const toddlerModel = normalizeLeastSquaresConfig(TODDLER_CONFIG);
const toddlerFit = fitLine(toddlerModel);
const toddlerNames = sentenceNames(toddlerModel);

test('normalize: missing or broken configs show the M5 drug example with its own labels', () => {
  for (const config of [undefined, null, [], 'points', 7, {}, { points: 'bad', summary: 5 }]) {
    const model = normalizeLeastSquaresConfig(config);
    assert.equal(model.usedDefault, true);
    assert.equal(model.mode, 'data');
    assert.deepEqual(pairs(model), DRUG);
    assert.deepEqual(model.title, { ...SLIDE_EXAMPLE.title });
    assert.equal(model.summary, null);
  }
  // Labels written for other data are not paired with the example's points.
  // 为别的数据写的标签不会和例子的数据点搭配在一起。
  const fallback = normalizeLeastSquaresConfig({ title: { zh: '别的', en: 'Other' }, points: [[1, 2]] });
  assert.deepEqual(fallback.title, { ...SLIDE_EXAMPLE.title });
  assert.deepEqual(fallback.xName, { ...SLIDE_EXAMPLE.xName });
  fallback.title.zh = 'changed';
  assert.equal(SLIDE_EXAMPLE.title.zh, '药物含量与反应时间');
});

test('normalize: points may be pairs, objects or numeric strings; bad entries are skipped', () => {
  const config = {
    points: [[1, 2], { x: 3, y: 4 }, ['5', '6'], ['a', 1], null, [7], [Infinity, 1], [8, 9]],
  };
  const before = JSON.stringify(config);
  const model = normalizeLeastSquaresConfig(config);
  assert.equal(model.mode, 'data');
  assert.equal(model.usedDefault, false);
  assert.deepEqual(model.points, [
    { index: 0, x: 1, y: 2 }, { index: 1, x: 3, y: 4 }, { index: 2, x: 5, y: 6 }, { index: 3, x: 8, y: 9 },
  ]);
  assert.equal(JSON.stringify(config), before, 'the config is not changed');
});

test('normalize: the validator limits, 3-30 points with at least two different x values', () => {
  assert.equal(MIN_POINTS, 3);
  assert.equal(MAX_POINTS, 30);
  assert.equal(normalizeLeastSquaresConfig({ points: [[1, 1], [2, 3], [3, 2]] }).mode, 'data');
  assert.equal(normalizeLeastSquaresConfig({ points: [[1, 1], [2, 3]] }).usedDefault, true);
  const thirty = Array.from({ length: 30 }, (_, index) => [index, (index * 7) % 11]);
  assert.equal(normalizeLeastSquaresConfig({ points: thirty }).points.length, 30);
  const model = normalizeLeastSquaresConfig({ points: [...thirty, [99, 99]] });
  assert.equal(model.points.length, 30, 'a 31st point is dropped');
  assert.equal(model.points.at(-1).x, 29);
  assert.equal(normalizeLeastSquaresConfig({ points: [[2, 1], [2, 3], [2, 5]] }).usedDefault, true, 'all x equal');
  const flat = normalizeLeastSquaresConfig({ points: [[1, 3], [2, 3], [4, 3]] });
  assert.equal(flat.mode, 'data', 'the validator accepts equal y values');
  assert.equal(flat.usedDefault, false);
});

test('normalize: usable points win over a summary; a summary is used when the points are unusable', () => {
  const both = normalizeLeastSquaresConfig({ points: DRUG, summary: SUMMARY });
  assert.equal(both.mode, 'data');
  assert.equal(both.summary, null);
  const summaryOnly = normalizeLeastSquaresConfig({ points: [[1, 1]], summary: SUMMARY });
  assert.equal(summaryOnly.mode, 'summary');
  assert.deepEqual(summaryOnly.summary, SUMMARY);
  assert.deepEqual(summaryOnly.points, []);
});

test('normalize: a summary needs numbers with s_x > 0, s_y > 0 and r between -1 and 1', () => {
  for (const r of [1, -1, 0]) {
    assert.equal(normalizeLeastSquaresConfig({ summary: { ...SUMMARY, r } }).mode, 'summary', `r = ${r}`);
  }
  const strings = normalizeLeastSquaresConfig({ summary: { xbar: '70', sx: '10', ybar: '62', sy: '8', r: '0.77' } });
  assert.deepEqual(strings.summary, SUMMARY);
  const broken = [
    { ...SUMMARY, sx: 0 }, { ...SUMMARY, sy: 0 }, { ...SUMMARY, sy: -8 }, { ...SUMMARY, r: 1.2 },
    { ...SUMMARY, r: -1.01 }, { ...SUMMARY, r: undefined }, { ...SUMMARY, xbar: NaN }, { ...SUMMARY, ybar: 'mean' },
  ];
  for (const summary of broken) {
    assert.equal(normalizeLeastSquaresConfig({ summary }).usedDefault, true, JSON.stringify(summary));
  }
});

test('normalize: axis labels and sentence names stand in for each other', () => {
  const xLabel = { zh: '时间（分钟）', en: 'Time (min)' };
  const yName = { zh: '热量', en: 'calories' };
  const model = normalizeLeastSquaresConfig({ points: DRUG, xLabel, yName });
  assert.deepEqual(model.xName, xLabel);
  assert.deepEqual(model.yLabel, yName);
  assert.deepEqual(model.title, { zh: '最小二乘回归直线', en: 'Least-squares regression line' });
  // A plain string is filed by its script; an empty Bi counts as missing.
  // 普通字符串按文字归入 zh 或 en；空的双语值算作缺失。
  const plain = normalizeLeastSquaresConfig({ points: DRUG, xName: 'hours studied', yName: { zh: ' ', en: '' } });
  assert.deepEqual(plain.xName, { zh: '', en: 'hours studied' });
  assert.deepEqual(plain.yName, { zh: 'y', en: 'y' });
  assert.deepEqual(sentenceNames(plain).x, { zh: 'hours studied', en: 'hours studied' });
  assert.deepEqual(sentenceNames(null), { x: { zh: 'x', en: 'x' }, y: { zh: 'y', en: 'y' } });
});

test('drug example (M5 p.33-44): the worked steps reproduce b1 = 0.7 and b0 = -0.1', () => {
  assert.equal(drugFit.mode, 'data');
  assert.equal(roundTo(drugFit.b1, 10), 0.7);
  assert.equal(roundTo(drugFit.b0, 10), -0.1);
  assert.equal(roundTo(drugFit.r, 4), 0.9037);
  const steps = lineSteps(drugFit);
  assert.deepEqual(steps.map((step) => step.id), ['means', 'sds', 'correlation', 'slope', 'intercept', 'equation']);
  assert.deepEqual(works(steps), [
    ['x̄ = 15 / 5 = 3', 'ȳ = 10 / 5 = 2'],
    ['s_x = √(10 / 4) ≈ 1.5811', 's_y = √(6 / 4) ≈ 1.2247'],
    ['r = 3.6148 / 4 ≈ 0.9037'],
    ['b1 = 0.9037 × 1.2247 / 1.5811 ≈ 0.7'],
    ['b0 = 2 − 0.7 × 3 = −0.1'],
    ['ŷ = −0.1 + 0.7x'],
  ]);
  assert.deepEqual(steps.map((step) => step.rows[0].formula), [
    'x̄ = Σx / n', 's_x = √(Σ(x − x̄)² / (n − 1))', 'r = Σ z_x z_y / (n − 1)', 'b1 = r · s_y / s_x',
    'b0 = ȳ − b1 · x̄', 'ŷ = b0 + b1x',
  ]);
  for (const step of steps) {
    assert.ok(step.title.zh && step.title.en && step.note.zh && step.note.en, step.id);
  }
});

test('toddler lunch data (M5 regression practice): the line 560.65126 - 3.0770733 time', () => {
  assert.equal(roundTo(toddlerFit.b0, 5), 560.65126);
  assert.equal(roundTo(toddlerFit.b1, 7), -3.0770733);
  assert.equal(roundTo(toddlerFit.r, 2), -0.65);
  assert.deepEqual(works(lineSteps(toddlerFit)), [
    ['x̄ = 680.2 / 20 = 34.01', 'ȳ = 9120 / 20 = 456'],
    ['s_x = √(758.058 / 19) ≈ 6.3165', 's_y = √(17032 / 19) ≈ 29.9403'],
    ['r = −12.3342 / 19 ≈ −0.6492'],
    ['b1 = (−0.6492) × 29.9403 / 6.3165 ≈ −3.0771'],
    ['b0 = 456 − (−3.0771) × 34.01 ≈ 560.6513'],
    ['ŷ = 560.6513 − 3.0771x'],
  ]);
  assert.equal(equationText(toddlerFit, { report: true }), 'ŷ = 560.65 − 3.08x');
});

test('M5 practice Q4: the prediction at 43.1 minutes and the residual of (43.1, 410)', () => {
  const prediction = predictionFor(toddlerFit, 43.1, toddlerNames);
  assert.equal(prediction.ok, true);
  assert.equal(prediction.work, 'ŷ = 560.6513 − 3.0771 × 43.1 ≈ 428.03');
  assert.equal(prediction.position, 'inside');
  assert.equal(prediction.sentence.en,
    'When time at the lunch table (in minutes) is 43.1, the predicted calories consumed during lunch is about 428.03.');
  assert.equal(prediction.note.en, 'x = 43.1 is inside the observed range of x (21.4 to 43.8), so this is not extrapolation.');
  const work = residualWork(toddlerFit, { x: 43.1, y: 410 }, { resultDigits: toddlerFit.digits.result });
  assert.deepEqual(work.lines, ['ŷ = 560.6513 − 3.0771 × 43.1 ≈ 428.03', 'e = y − ŷ = 410 − 428.03 ≈ −18.03']);
  assert.equal(work.kind, 'over', 'negative residual: overestimated');
  assert.equal(work.residualText, '−18.03');
  assert.equal(roundTo(work.residual, 4), -18.0294);
});

test('2025 midterm Q24: ŷ = 13.31 + 0.69 × 88 = 74.03, and e = 90 − 74.03 = 15.97 is an underestimate', () => {
  const work = residualWork(MIDTERM_LINE, { x: 88, y: 90 });
  assert.deepEqual(work.lines, ['ŷ = 13.31 + 0.69 × 88 = 74.03', 'e = y − ŷ = 90 − 74.03 = 15.97']);
  assert.equal(work.kind, 'under');
  assert.equal(work.sentence.en, 'The residual is positive: the point is above the line, so the line underestimates y here (y > ŷ).');
  assert.equal(residualWork(MIDTERM_LINE, { x: 88, y: 74.03 }).kind, 'on');
  assert.equal(residualWork({ b0: NaN, b1: 1 }, { x: 1, y: 1 }).ok, false);
  assert.equal(residualWork(MIDTERM_LINE, { x: 'a', y: 1 }).ok, false);
});

test('2025 midterm Q25 and M5 practice Q6: R² = r² with the "About ...% of the variation" sentence', () => {
  const midterm = rSquaredInfo(0.77, MIDTERM_NAMES, { given: true });
  assert.equal(midterm.work, 'R² = r² = (0.77)² ≈ 0.59');
  assert.equal(midterm.text, '0.59');
  assert.equal(midterm.percent, '59%');
  assert.equal(midterm.sentence.en,
    'About 59% of the variation in score in writing ability is explained by the linear regression with the score in spelling competence.');
  assert.equal(midterm.sentence.zh, '写作能力得分的变化（variation）中，大约 59% 可以由它与拼写能力得分之间的线性回归来解释。');
  const practice = rSquaredInfo(-0.65, toddlerNames, { given: true });
  assert.equal(practice.work, 'R² = r² = (−0.65)² ≈ 0.42');
  assert.equal(practice.percent, '42%');
  assert.ok(practice.value > 0, 'R² is never negative');
  assert.equal(rSquaredInfo(toddlerFit.r, toddlerNames).work, 'R² = r² = (−0.6492)² ≈ 0.42');
  assert.equal(rSquaredInfo(1).percent, '100%');
  assert.equal(rSquaredInfo(0.998).percent, '99.6%', 'a share below 100% is not printed as 100%');
  assert.equal(rSquaredInfo(0.05).text, '0.0025');
  assert.equal(rSquaredInfo(NaN).defined, false);
});

test('slope sentence: the 2025 midterm Q22 template, with the sign deciding increase or decrease', () => {
  assert.equal(slopeSentence(0.69, MIDTERM_NAMES).en,
    'When the score in spelling competence increases by 1, the mean score in writing ability is estimated to increase by 0.69.');
  assert.equal(slopeSentence(0.69, MIDTERM_NAMES).zh, '当拼写能力得分增加 1 时，写作能力得分的平均值估计会增加 0.69。');
  const toddler = slopeSentence(toddlerFit.b1, toddlerNames);
  assert.equal(toddler.direction, 'decrease');
  assert.equal(toddler.amount, '3.08');
  assert.ok(toddler.en.endsWith('is estimated to decrease by 3.08.'));
  assert.equal(slopeSentence(0.69).zh, '当 x 增加 1 时，y 的平均值估计会增加 0.69。', 'Latin names get spaces in Chinese');
  assert.equal(slopeSentence(0.0034).amount, '0.0034', 'a small slope keeps its digits');
  assert.equal(slopeSentence(0).direction, 'none');
  assert.equal(slopeSentence(Number.NaN), null);
});

test('intercept sentence: the 2025 midterm Q23 template, checked against the observed x range', () => {
  const unknown = interceptSentence(13.31, MIDTERM_NAMES);
  assert.equal(unknown.en, 'The mean score in writing ability is estimated to be 13.31 when the score in spelling competence is 0.');
  assert.equal(unknown.zeroInRange, null);
  assert.ok(unknown.note.en.startsWith('Use this sentence only if x = 0 is within the observed range of x'));
  const drug = fitSentences(drugFit, sentenceNames(drugModel)).intercept;
  assert.equal(drug.value, '−0.1');
  assert.equal(drug.zeroInRange, false);
  assert.ok(drug.note.en.includes('outside the observed range of x (1 to 5)'));
  const around = fitLine(normalizeLeastSquaresConfig({ points: [[-2, 1], [0, 2], [3, 5]] }));
  assert.equal(fitSentences(around, sentenceNames(null)).intercept.zeroInRange, true);
});

test('extrapolation: the ends of the observed range are inside, beyond them is flagged', () => {
  assert.equal(rangePosition(1, 1, 5), 'inside');
  assert.equal(rangePosition(5, 1, 5), 'inside');
  assert.equal(rangePosition(5.000000000000001, 1, 5), 'inside');
  assert.equal(rangePosition(0.5, 1, 5), 'below');
  assert.equal(rangePosition('6', 1, 5), 'above');
  assert.equal(rangePosition('abc', 1, 5), 'unknown');
  assert.equal(rangePosition(3, NaN, NaN), 'unknown');
  const far = predictionFor(drugFit, 10, sentenceNames(drugModel));
  assert.equal(far.position, 'above');
  assert.ok(far.note.en.startsWith('Extrapolation: x = 10 is outside the observed range of x (1 to 5).'));
  assert.deepEqual(rangeText(drugFit), { zh: '1 到 5', en: '1 to 5' });
});

test('predictions accept numeric text and refuse other text and absurdly large inputs', () => {
  const names = sentenceNames(drugModel);
  assert.equal(predictionFor(drugFit, '4', names).work, 'ŷ = −0.1 + 0.7 × 4 = 2.7');
  assert.equal(predictionFor(drugFit, -2, names).work, 'ŷ = −0.1 + 0.7 × (−2) = −1.5');
  for (const value of ['', '  ', 'abc', null, undefined]) {
    assert.deepEqual([predictionFor(drugFit, value, names).ok, predictionFor(drugFit, value, names).reason], [false, 'not-a-number']);
  }
  assert.equal(predictionFor(drugFit, MAX_INPUT * 10, names).reason, 'too-large');
  assert.equal(predictionFor(drugFit, MAX_INPUT, names).ok, true);
});

test('summary mode (exam style): the steps start from the given numbers', () => {
  const model = normalizeLeastSquaresConfig({ summary: SUMMARY, xName: { zh: '期中成绩', en: 'the midterm score' } });
  const fit = fitLine(model);
  assert.equal(fit.mode, 'summary');
  assert.deepEqual(fit.rows, []);
  assert.ok(Number.isNaN(fit.xMin));
  assert.deepEqual(works(lineSteps(fit)), [
    ['x̄ = 70, s_x = 10, ȳ = 62, s_y = 8, r = 0.77'],
    ['b1 = 0.77 × 8 / 10 = 0.616'],
    ['b0 = 62 − 0.616 × 70 = 18.88'],
    ['ŷ = 18.88 + 0.616x'],
  ]);
  assert.equal(defaultPredictionX(fit), 70);
  const prediction = predictionFor(fit, 70, sentenceNames(model));
  assert.equal(prediction.work, 'ŷ = 18.88 + 0.616 × 70 = 62', 'the line passes through (x̄, ȳ)');
  assert.equal(prediction.position, 'unknown');
  assert.ok(prediction.note.en.startsWith('The observed range of x is not given here.'));
  assert.equal(fitSentences(fit, sentenceNames(model)).rSquared.work, 'R² = r² = (0.77)² ≈ 0.59');
  assert.equal(fitSentences(fit, sentenceNames(model)).slope.amount, '0.62');
});

test('summary mode reports predictions with 2 to 4 decimals, whatever decimals s_y is given with', () => {
  // R-style summary of the M5 toddler data: s_y with 5 decimals must not give 6-decimal predictions.
  // 第 5 单元幼儿数据的 R 风格概括：s_y 有 5 位小数，也不应得到 6 位小数的预测值。
  const toddlers = fitLine(normalizeLeastSquaresConfig({
    summary: { xbar: 34.01, sx: 6.31647, ybar: 456, sy: 29.94029, r: -0.6491667 },
  }));
  assert.equal(toddlers.digits.result, 2);
  const at88 = predictionFor(toddlers, 88, sentenceNames(null));
  assert.equal(at88.work, 'ŷ = 560.6513 − 3.0771 × 88 ≈ 289.87');
  // The printed coefficients give the same answer to 2 decimals. 印出来的系数算出的结果，保留 2 位小数后相同。
  assert.equal(roundTo(560.6513 - 3.0771 * 88, 2), 289.87);
  assert.equal(predictionFor(toddlers, 43.1, sentenceNames(null)).work, 'ŷ = 560.6513 − 3.0771 × 43.1 ≈ 428.03');
  // A mean given with more decimals keeps up to 4 (M5 practice Q4 reports 428.0294).
  // 平均数给得更精确时最多保留 4 位（第 5 单元练习 Q4 写成 428.0294）。
  const precise = (ybar) => fitLine(normalizeLeastSquaresConfig({ summary: { xbar: 10, sx: 2, ybar, sy: 3.123456, r: 0.5 } })).digits.result;
  assert.deepEqual([precise(62), precise(62.5), precise(62.125), precise(62.123456)], [2, 2, 3, 4]);
  assert.equal(fitLine(normalizeLeastSquaresConfig({ summary: SUMMARY })).digits.result, 2);
});

test('flat data: equal y values give the flat line ŷ = ȳ, with no r and no R²', () => {
  const model = normalizeLeastSquaresConfig({ points: [[1, 3], [2, 3], [4, 3]] });
  const fit = fitLine(model);
  assert.equal(fit.flat, true);
  assert.equal(fit.b1, 0);
  assert.equal(fit.b0, 3);
  assert.ok(Number.isNaN(fit.r));
  const steps = lineSteps(fit);
  assert.deepEqual(works(steps).slice(2), [[null], ['b1 = 0'], ['b0 = 3 − 0 × 2.3333 ≈ 3'], ['ŷ = 3 + 0x']]);
  assert.ok(steps[2].note.en.includes('r cannot be computed'));
  assert.ok(steps[3].note.en.includes('flat line'));
  const sentences = fitSentences(fit, sentenceNames(model));
  assert.equal(sentences.rSquared.defined, false);
  assert.equal(sentences.rSquared.work, null);
  assert.equal(sentences.slope.direction, 'none');
});

test('residual table: Σe is 0 for the least-squares line and Σe² is the sum of squared residuals', () => {
  const table = residualRowsText(drugFit, drugModel.points, { resultDigits: drugFit.digits.result });
  assert.deepEqual(table.rows.map((row) => [row.number, row.x, row.y, row.yHat, row.residual, row.squared]), [
    ['1', '1', '1', '0.60', '+0.40', '0.16'],
    ['2', '2', '1', '1.30', '−0.30', '0.09'],
    ['3', '3', '2', '2.00', '0.00', '0.00'],
    ['4', '4', '2', '2.70', '−0.70', '0.49'],
    ['5', '5', '4', '3.40', '+0.60', '0.36'],
  ]);
  assert.equal(table.sumResiduals, '0.00');
  assert.equal(table.sse, '1.10');
  assert.equal(residualRowsText(toddlerFit, toddlerModel.points).sse, '9854.42');
  assert.equal(residualRowsText({ b0: 2, b1: 0 }, drugModel.points).sse, '6.00');
  assert.deepEqual(lineResiduals(drugFit, drugModel.points).map((row) => roundTo(row.residual, 6)), [0.4, -0.3, 0, -0.7, 0.6]);
});

test('own line: symmetric slider ranges that contain the least-squares line, starting from the flat line ŷ = ȳ', () => {
  const drug = ownLineSpecs(drugFit, drugModel.points);
  assert.deepEqual(drug.b1, { min: -1.5, max: 1.5, step: 0.001, keyStep: 0.01, digits: 3 });
  assert.deepEqual(drug.b0, { min: -10, max: 10, step: 0.01, keyStep: 0.1, digits: 2 });
  assert.deepEqual(drug.start, { b0: 2, b1: 0 });
  // The drug line lies on the slider grid, so the learner can reach it exactly.
  // 药物例子的直线正好落在滑块刻度上，学生可以精确地找到它。
  assert.ok(Number.isInteger(roundTo(drugFit.b1 / drug.b1.step, 6)));
  assert.ok(Number.isInteger(roundTo(drugFit.b0 / drug.b0.step, 6)));
  const toddler = ownLineSpecs(toddlerFit, toddlerModel.points);
  assert.equal(toddler.start.b0, 456);
  assert.ok(Math.abs(toddlerFit.b0) < toddler.b0.max && Math.abs(toddlerFit.b1) < toddler.b1.max);
  const flatModel = normalizeLeastSquaresConfig({ points: [[1, 0], [2, 0], [4, 0]] });
  const flat = ownLineSpecs(fitLine(flatModel), flatModel.points);
  assert.ok(flat.b0.max > 0 && flat.b1.max > 0 && Number.isFinite(flat.b0.step) && flat.b0.step > 0);
});

test('compareWithBest: the flat line, a near miss and the least-squares line itself', () => {
  const flat = compareWithBest({ b0: 2, b1: 0 }, drugFit, drugModel.points);
  assert.equal(flat.status, 'worse');
  assert.deepEqual([flat.ownText, flat.bestText, flat.gapText], ['6.00', '1.10', '4.90']);
  assert.equal(flat.message.en, 'Your line has Σe² = 6.00, which is 4.90 more than the least-squares line (Σe² = 1.10).');
  assert.equal(compareWithBest({ b0: -0.1, b1: 0.7001 }, drugFit, drugModel.points).status, 'close');
  const best = compareWithBest({ b0: -0.1, b1: 0.7 }, drugFit, drugModel.points);
  assert.equal(best.status, 'best');
  assert.equal(best.message.en, 'Your line is the least-squares line: Σe² = 1.10, the smallest of all lines.');
  const near = compareWithBest({ b0: 561, b1: -3.08 }, toddlerFit, toddlerModel.points);
  assert.equal(near.status, 'worse');
  assert.ok(near.ownSse > near.bestSse);
  assert.ok(near.message.en.includes('about'), 'a rounded gap is said to be about');
});

test('plot extents cover the data and the line; residual plots are symmetric around 0', () => {
  const drug = plotExtents(drugModel.points, drugFit);
  assert.deepEqual([drug.x.min, drug.x.max, drug.y.min, drug.y.max], [0, 6, -1, 5]);
  const toddler = plotExtents(toddlerModel.points, toddlerFit);
  assert.deepEqual([toddler.x.min, toddler.x.max, toddler.y.min, toddler.y.max], [15, 50, 380, 540]);
  const residuals = residualExtents(drugFit.rows, 'x', drug.x);
  assert.equal(residuals.x, drug.x);
  assert.deepEqual([residuals.y.min, residuals.y.max, residuals.y.step], [-1, 1, 0.5]);
  const fitted = residualExtents(toddlerFit.rows, 'fitted', toddler.x);
  assert.equal(fitted.y.min, -fitted.y.max);
  for (const row of toddlerFit.rows) assert.ok(row.yHat >= fitted.x.min && row.yHat <= fitted.x.max);
  const perfect = residualExtents(lineResiduals({ b0: 0, b1: 1 }, [{ x: 1, y: 1 }, { x: 2, y: 2 }]), 'x');
  assert.ok(perfect.y.max > 0, 'all-zero residuals still get an axis');
});

test('visibleSegment clips the line to the plot box', () => {
  const box = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
  assert.deepEqual(visibleSegment({ b0: 5, b1: 0 }, box), [[0, 5], [10, 5]]);
  assert.equal(visibleSegment({ b0: 50, b1: 0 }, box), null);
  assert.deepEqual(visibleSegment({ b0: 0, b1: 2 }, box), [[0, 0], [5, 10]]);
  assert.deepEqual(visibleSegment({ b0: 10, b1: -1 }, box), [[0, 10], [10, 0]]);
  assert.equal(visibleSegment({ b0: 20, b1: 1 }, box), null);
  assert.equal(visibleSegment({ b0: NaN, b1: 1 }, box), null);
});

test('pointOrder runs left to right, then bottom to top', () => {
  const model = normalizeLeastSquaresConfig({ points: [[3, 1], [1, 5], [3, 0], [2, 2]] });
  assert.deepEqual(pointOrder(model.points), [1, 3, 2, 0]);
});

test('adaptiveDigits keeps small values readable and equationText writes the sign once', () => {
  assert.equal(adaptiveDigits(0.7), 4);
  assert.equal(adaptiveDigits(0.0034), 6);
  assert.equal(adaptiveDigits(560.65, 2), 2);
  assert.equal(adaptiveDigits(0.034, 2), 3);
  assert.equal(adaptiveDigits(0), 4);
  assert.equal(adaptiveDigits(Number.NaN, 2), 2);
  assert.equal(adaptiveDigits(1e-12), 8);
  assert.equal(equationText({ b0: 2, b1: -0.5 }), 'ŷ = 2 − 0.5x');
  assert.equal(equationText({ b0: 1, b1: 0.0034 }), 'ŷ = 1 + 0.0034x');
  assert.equal(equationText({ b0: Number.NaN, b1: 1 }), 'ŷ = —');
  assert.equal(equationText(null), 'ŷ = —');
});

test('text alternatives describe the scatterplot, the residual plot and each point', () => {
  assert.equal(scatterDescription(drugFit, drugFit).en, 'Scatterplot of 5 points, x from 1 to 5; least-squares line ŷ = −0.1 + 0.7x.');
  assert.equal(scatterDescription(drugFit, { b0: 2, b1: 0 }, { own: true }).en,
    'Scatterplot of 5 points, x from 1 to 5; your line ŷ = 2 + 0x.');
  assert.equal(residualPlotDescription(drugFit, 'x').en, 'Residual plot against x: 5 residuals from −0.7 to +0.6, around the line e = 0.');
  assert.ok(residualPlotDescription(drugFit, 'fitted').en.startsWith('Residual plot against the fitted values ŷ'));
  assert.equal(pointDescription(drugFit, drugModel.points[3]), '点 4 Point 4: x = 4, y = 2, ŷ = 2.7, e = −0.7');
  assert.deepEqual(equationLegend(sentenceNames(null)), { zh: 'x：x；ŷ：预测的 y', en: 'x: x; ŷ: predicted y' });
});

test('the data decide the decimals of predictions and residuals and the default prediction x', () => {
  assert.deepEqual(toddlerFit.digits, { x: 1, y: 0, result: 2 });
  const fine = fitLine(normalizeLeastSquaresConfig({ points: [[1, 0.125], [2, 0.25], [3, 0.5]] }));
  assert.deepEqual(fine.digits, { x: 0, y: 3, result: 4 });
  // Between two observed x values, about halfway from x̄ to the largest x, never on (x̄, ȳ).
  // 在两个观测 x 之间，大约在 x̄ 与最大 x 的正中间，绝不落在 (x̄, ȳ) 上。
  assert.equal(defaultPredictionX(drugFit), 3.5);
  assert.equal(defaultPredictionX(toddlerFit), 38.6);
  assert.equal(predictionFor(toddlerFit, defaultPredictionX(toddlerFit), toddlerNames).position, 'inside');
  for (const fit of [drugFit, toddlerFit]) {
    const x = defaultPredictionX(fit);
    assert.ok(!fit.rows.some((row) => row.x === x), 'not on a data point');
    assert.notEqual(x, fit.xbar);
  }
});

test('every text the logic builds is plain: no HTML, no inline markup characters, no emoji', () => {
  const summaryModel = normalizeLeastSquaresConfig({ summary: SUMMARY });
  const flatModel = normalizeLeastSquaresConfig({ points: [[1, 3], [2, 3], [4, 3]] });
  const texts = [];
  const collect = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const model of [drugModel, toddlerModel, summaryModel, flatModel]) {
    const fit = fitLine(model);
    const names = sentenceNames(model);
    collect([lineSteps(fit), fitSentences(fit, names), predictionFor(fit, 4, names), predictionFor(fit, 1000, names)]);
    if (fit.mode === 'data') {
      collect([residualWork(fit, model.points[0]), compareWithBest({ b0: 0, b1: 1 }, fit, model.points)]);
      collect([scatterDescription(fit, fit), residualPlotDescription(fit, 'x'), residualRowsText(fit, model.points)]);
    }
  }
  assert.ok(texts.length > 100);
  // The validator's own patterns (tools/validate_content.py): "y < ŷ" is fine, a tag is not.
  // 使用校验器自己的规则（tools/validate_content.py）：“y < ŷ”可以，标签不行。
  for (const text of texts) {
    assert.doesNotMatch(text, /<\s*\/?\s*[a-zA-Z][^>]*>/, text);
    assert.doesNotMatch(text, /`|\*\*/, text);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, text);
  }
});
