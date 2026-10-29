import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSTANT_LIMITS, DEFAULT_CONSTANTS, EXAMPLE, GUIDE, MAX_VALUES, MIN_VALUES, METHOD_NAMES, PLACEHOLDERS,
  RESISTANCE_ROWS, TRANSFORM_PRESETS, TRANSFORM_ROWS, analyzeData, centreSpreadSteps, deviationView, formatConstant,
  formatDataText, iqrSentence, matchingPreset, meanSentence, medianSentence, methodMessage, modeSentence,
  normalizeCenterSpreadConfig, outlierMessage, outlierSwap, parseConstant, parseDataText, placeholderHint, plotModel,
  positionCells, rangeSentence, resistanceReport, sdSentence, summaryGroups, transformData, transformMessage,
  transformReport, updateMessage, withUnit,
} from '../../../../engine/widgets/statistics/center-spread/center-spread-logic.js';

// M3 p.5: calories of the 30 Tim Hortons donuts (2014), in ID order as R prints them.
// 第 3 单元第 5 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 R 打印的 ID 顺序。
const DONUTS = [
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
];
const DONUT_LABELS = { variable: { zh: 'Tim Hortons 甜甜圈的热量', en: 'calories in Tim Hortons donuts' }, unit: 'kcal' };
// M3 p.45-51: the three-value example for the variance. 第 3 单元第 45-51 页：讲方差用的三个值。
const THREE = [2, 3, 7];
// M4 p.27-30: the data that the slides shift and rescale. 第 4 单元第 27-30 页：课件平移与缩放的数据。
const ORIGINAL = [5, 10, 15, 20, 25];
const Y_LABELS = { variable: { zh: '变量 y', en: 'y' }, unit: '' };
const HAN = /[㐀-鿿]/;

const stepOf = (steps, id) => steps.find((step) => step.id === id);
const workOf = (step) => step.items.filter((item) => item.kind === 'work').flatMap((item) => item.lines);
const textsOf = (step, kind) => step.items.filter((item) => item.kind === kind).map((item) => item.text);
const stepsFor = (values, method = 'hand', labels = Y_LABELS) => centreSpreadSteps(analyzeData(values, method), labels);
const close = (actual, expected, epsilon = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= epsilon * Math.max(1, Math.abs(expected)),
  `${actual} != ${expected}`,
);

// A small deterministic generator, so the property tests always see the same data.
// 一个确定性的小随机数生成器，让性质测试每次看到相同的数据。
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomData(random, n, { decimals = 0, low = -50, high = 150 } = {}) {
  const factor = 10 ** decimals;
  return Array.from({ length: n }, () => Math.round((low + random() * (high - low)) * factor) / factor);
}

/* ---------- Config 配置 ---------- */

test('the content-spec example config is read exactly as written', () => {
  const config = {
    title: { zh: '集中趋势', en: 'Centre' },
    variable: { zh: '分数', en: 'quiz score' },
    unit: '',
    data: [2, 4, 4, 5, 7],
    quartiles: 'hand',
    transform: true,
  };
  assert.deepEqual(normalizeCenterSpreadConfig(config), {
    title: { zh: '集中趋势', en: 'Centre' },
    variable: { zh: '分数', en: 'quiz score' },
    cases: null,
    unit: '',
    data: [2, 4, 4, 5, 7],
    quartiles: 'hand',
    transform: true,
    usesExample: false,
  });
});

test('cases (optional) need an English name; a missing Chinese name borrows it, and the example has none', () => {
  const read = (cases) => normalizeCenterSpreadConfig({ data: THREE, cases }).cases;
  assert.deepEqual(read({ zh: ' Tim Hortons 甜甜圈 ', en: ' Tim Hortons donuts ' }), { zh: 'Tim Hortons 甜甜圈', en: 'Tim Hortons donuts' });
  assert.deepEqual(read({ en: 'these students' }), { zh: 'these students', en: 'these students' });
  assert.deepEqual(read('Tim Hortons donuts'), { zh: 'Tim Hortons donuts', en: 'Tim Hortons donuts' });
  for (const cases of [undefined, null, '', '甜甜圈', { zh: '甜甜圈' }, { en: '  ' }, 5, ['donuts']]) {
    assert.equal(read(cases), null, JSON.stringify(cases));
  }
  assert.equal(normalizeCenterSpreadConfig({ data: [1], cases: { en: 'donuts' } }).cases, null);
});

test('every config inside the validator limits keeps all of its data (3 to 30 finite numbers, r7, any unit)', () => {
  const three = normalizeCenterSpreadConfig({ data: [-1e6, 0.000001, 1e12], quartiles: 'r7', unit: '$', extra: 'ignored' });
  assert.deepEqual(three.data, [-1e6, 0.000001, 1e12]);
  assert.equal(three.quartiles, 'r7');
  assert.equal(three.unit, '$');
  assert.equal(three.usesExample, false);
  const thirty = Array.from({ length: MAX_VALUES }, (_, index) => index * 1.5 - 7);
  assert.deepEqual(normalizeCenterSpreadConfig({ data: thirty }).data, thirty);
  assert.equal(MIN_VALUES, 3);
  assert.equal(MAX_VALUES, 30);
  // The validator does not check unit or transform, so any value must be tolerated.
  // 校验器不检查 unit 与 transform，所以任何取值都要能接受。
  for (const unit of [5, null, { zh: 'x' }, ['kcal'], true]) {
    assert.equal(normalizeCenterSpreadConfig({ data: THREE, unit }).unit, '');
  }
  for (const transform of ['true', 1, {}, null, undefined, false]) {
    assert.equal(normalizeCenterSpreadConfig({ data: THREE, transform }).transform, false);
  }
});

test('the unit is trimmed and kept whole, however long, as the validator accepts any string', () => {
  assert.equal(normalizeCenterSpreadConfig({ data: THREE, unit: '  kcal ' }).unit, 'kcal');
  assert.equal(normalizeCenterSpreadConfig({ data: THREE, unit: ' thousands of Canadian dollars ' }).unit, 'thousands of Canadian dollars');
  assert.equal(normalizeCenterSpreadConfig({ data: THREE, unit: 7 }).unit, '');
});

test('bad configs fall back to safe defaults', () => {
  for (const config of [null, undefined, [], 'text', 42, { data: 'bad' }, { data: [1, 2] }, { data: [] }]) {
    const model = normalizeCenterSpreadConfig(config);
    assert.equal(model.usesExample, true);
    assert.deepEqual(model.data, [...EXAMPLE.data]);
    assert.deepEqual(model.variable, { ...EXAMPLE.variable });
    assert.equal(model.unit, 'kcal');
    assert.equal(model.quartiles, 'hand');
    assert.equal(model.transform, false);
    assert.deepEqual(model.title, { zh: '集中趋势与离散程度', en: 'Measures of centre and spread' });
  }
  // The example keeps its own labels, so a variable written for other data is not attached to the donuts.
  // 例子使用它自己的标签，为别的数据写的变量名不会贴到甜甜圈数据上。
  const fallback = normalizeCenterSpreadConfig({ data: [1], variable: { zh: '身高', en: 'height' }, unit: 'cm' });
  assert.deepEqual(fallback.variable, { ...EXAMPLE.variable });
  assert.equal(fallback.unit, 'kcal');

  const cleaned = normalizeCenterSpreadConfig({ data: [1, 'x', 2, null, '3', NaN, Infinity, true] });
  assert.deepEqual(cleaned.data, [1, 2, 3]);
  const long = Array.from({ length: 40 }, (_, index) => index);
  assert.deepEqual(normalizeCenterSpreadConfig({ data: long }).data, long.slice(0, 30));
  assert.equal(normalizeCenterSpreadConfig({ data: THREE, quartiles: 'R7' }).quartiles, 'hand');
});

test('labels: a plain string is filed by script and a missing language borrows the other one', () => {
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE }).variable, { zh: '变量 y', en: 'y' });
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE, variable: '热量' }).variable, { zh: '热量', en: '热量' });
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE, variable: { en: ' height ' } }).variable, { zh: 'height', en: 'height' });
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE, title: 'Spread' }).title, { zh: '', en: 'Spread' });
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE, title: { zh: ' ', en: '' } }).title,
    { zh: '集中趋势与离散程度', en: 'Measures of centre and spread' });
});

/* ---------- Learner input 学生输入 ---------- */

test('parseDataText accepts commas, spaces, Chinese commas, full-width digits and the printed minus sign', () => {
  assert.deepEqual(parseDataText('1, 2，3、 4;５ −6\n７.５ +8 .5 1e2').values, [1, 2, 3, 4, 5, -6, 7.5, 8, 0.5, 100]);
  assert.deepEqual(parseDataText('-0 0 0').values, [0, 0, 0]);
  assert.equal(Object.is(parseDataText('-0 1 2').values[0], 0), true);
});

test('parseDataText names the problem: a token that is not a number, too few or too many values', () => {
  for (const [text, token] of [['1, 2, x', 'x'], ['0x10 2 3', '0x10'], ['1e999 2 3', '1e999'], ['--5 1 2', '--5']]) {
    const { values, error } = parseDataText(text);
    assert.equal(values, null);
    assert.equal(error.code, 'invalid');
    assert.ok(error.en.includes(`"${token}"`) && error.zh.includes(`“${token}”`));
  }
  const longToken = parseDataText(`${'9'.repeat(5)}abcdefghij 1 2`).error;
  assert.ok(longToken.en.includes('…'));
  assert.deepEqual(parseDataText('1 2').error.code, 'too-few');
  assert.ok(parseDataText('1 2').error.en.includes('(now 2)'));
  assert.equal(parseDataText('').error.code, 'too-few');
  assert.equal(parseDataText(Array.from({ length: 31 }, (_, index) => index).join(' ')).error.code, 'too-many');
  assert.equal(parseDataText(Array.from({ length: 30 }, (_, index) => index).join(' ')).error, null);
});

test('formatDataText writes the data so that parseDataText reads it back unchanged', () => {
  for (const values of [DONUTS, [-2.5, 0, 3.25], [106.43, 99.99, 112.5], [1e21, 2, 3], [0.000001, 0.5, 2],
    [0.1234567, 1, 2], [1e-7, 2e-7, -3e-7], [123456789.123, 2, 3]]) {
    assert.deepEqual(parseDataText(formatDataText(values)).values, values);
  }
  assert.equal(formatDataText([180, -2.5, 3]), '180, −2.5, 3');
  // Values the printed decimals would round are written in full. 打印小数位会四舍五入的值完整写出。
  assert.equal(formatDataText([0.1234567, 1, 2]), '0.1234567, 1, 2');
  assert.equal(formatDataText([1e-7, 2e-7, -3e-7]), '1e-7, 2e-7, −3e-7');
});

test('parseConstant: any c within ±1000000; k from 0.001 to 1000 in size, negative allowed, never 0', () => {
  assert.deepEqual(parseConstant('10', 'add'), { value: 10, error: null });
  assert.deepEqual(parseConstant(' −5 ', 'add'), { value: -5, error: null });
  assert.deepEqual(parseConstant('0', 'add'), { value: 0, error: null });
  assert.deepEqual(parseConstant('－２', 'multiply'), { value: -2, error: null });
  assert.deepEqual(parseConstant('0.2', 'multiply'), { value: 0.2, error: null });
  assert.equal(parseConstant('', 'add').error.code, 'empty');
  assert.equal(parseConstant('   ', 'multiply').error.code, 'empty');
  assert.equal(parseConstant('abc', 'add').error.code, 'invalid');
  assert.equal(parseConstant('1e7', 'add').error.code, 'range');
  assert.equal(parseConstant('0', 'multiply').error.code, 'zero');
  assert.equal(parseConstant('0.0001', 'multiply').error.code, 'range');
  assert.equal(parseConstant('-1001', 'multiply').error.code, 'range');
  assert.deepEqual(parseConstant(String(CONSTANT_LIMITS.multiplyMax), 'multiply'), { value: 1000, error: null });
  assert.ok(parseConstant('1e7', 'add').error.en.includes('−1000000'));
});

test('withUnit writes "kcal" after the number, "$" before it (sign first) and "%" without a space', () => {
  assert.equal(withUnit('251', 'kcal'), '251 kcal');
  assert.equal(withUnit('106.43', '$'), '$106.43');
  assert.equal(withUnit('−5', '$'), '−$5');
  assert.equal(withUnit('+2', '$'), '+$2');
  assert.equal(withUnit('5.2', '%'), '5.2%');
  assert.equal(withUnit('3', ''), '3');
  assert.equal(withUnit('—', 'kcal'), '—');
});

/* ---------- Worked steps on the course's examples 课程例子的解题步骤 ---------- */

test('M3 p.30-53: the donut steps reproduce the slides (ȳ = 251, median 250, mode 270, range 220, S = 50.06)', () => {
  const steps = stepsFor(DONUTS, 'hand', DONUT_LABELS);
  assert.deepEqual(steps.map((step) => step.id), ['sort', 'mean', 'median', 'mode', 'range', 'quartiles', 'sd']);
  assert.deepEqual(workOf(stepOf(steps, 'sort')), ['n = 30']);
  assert.deepEqual(workOf(stepOf(steps, 'mean')), ['ȳ = (180 + 190 + ⋯ + 400) / 30', '= 7530 / 30', '= 251']);
  assert.deepEqual(workOf(stepOf(steps, 'median')), ['0.5 × (30 + 1) = 15.5', 'median = (250 + 250) / 2 = 250']);
  assert.equal(textsOf(stepOf(steps, 'median'), 'explain')[0].en,
    'n = 30 is even: position 15.5 lies between the 15th and 16th values, so the median is their average.');
  assert.deepEqual(workOf(stepOf(steps, 'mode')), ['mode = 270']);
  assert.deepEqual(workOf(stepOf(steps, 'range')), ['Range = Max − Min = 400 − 180 = 220']);
  assert.deepEqual(workOf(stepOf(steps, 'sd')), [
    'Σ(y − ȳ)² = (180 − 251)² + (190 − 251)² + ⋯ + (400 − 251)²',
    '= 72670',
    'S² = 72670 / (30 − 1) = 72670 / 29 ≈ 2505.8621',
    'S = √2505.8621 ≈ 50.06',
  ]);
});

test('M3 p.30, p.33, p.37, p.53: the interpretation sentences follow the instructor\'s templates', () => {
  const steps = stepsFor(DONUTS, 'hand', DONUT_LABELS);
  // Course brief: "On average, <cases> have <mean> <units>." and "... 50% of <cases> have at most M (M or less) ...";
  // without cases in the config the sentences keep [cases], like the histogram widget.
  // 课程简报的句型；配置里没有个案时句子保留 [cases]，与直方图组件相同。
  assert.equal(stepOf(steps, 'mean').sentence.en, 'On average, [cases] have 251 kcal.');
  assert.equal(stepOf(steps, 'mean').sentence.zh, '平均来说，[个案] 的“Tim Hortons 甜甜圈的热量”是 251 kcal。');
  assert.equal(stepOf(steps, 'median').sentence.en, 'The median calories in Tim Hortons donuts is 250 kcal. '
    + 'This means that 50% of [cases] have at most 250 kcal (250 or less), whereas 50% have more than 250 kcal.');
  assert.equal(stepOf(steps, 'median').sentence.zh, '“Tim Hortons 甜甜圈的热量”的中位数是 250 kcal：50% 的 [个案] 不超过 250 kcal'
    + '（at most，即 250 或更少），另外 50% 大于 250 kcal（more than）。');
  assert.equal(stepOf(steps, 'mode').sentence.en, 'The most frequent value is 270 kcal (5 out of 30 values), so the mode is 270 kcal.');
  assert.equal(stepOf(steps, 'range').sentence.en,
    'The values of calories in Tim Hortons donuts range from 180 kcal to 400 kcal, so the range is 220 kcal.');
  assert.equal(stepOf(steps, 'quartiles').sentence.en, 'The middle 50% of the values of calories in Tim Hortons donuts '
    + 'lie between Q1 = 210 kcal and Q3 = 280 kcal, a range of 70 kcal (the IQR).');
  assert.equal(stepOf(steps, 'sd').sentence.en,
    'We can expect calories in Tim Hortons donuts to differ from the mean by about 50.06 kcal, on average.');
  assert.equal(stepOf(steps, 'sd').sentence.zh, '我们可以预期，“Tim Hortons 甜甜圈的热量”与平均数平均相差大约 50.06 kcal。');
  // A leading "the" is dropped after "The median"; the other sentences keep it.
  // 放在“The median”后面时去掉开头的 the；其他句子保留。
  const prozac = { variable: { zh: 'Prozac 的价格', en: 'the cost of Prozac' }, unit: '$' };
  const analysis = analyzeData([106.43, 101.2, 112.5], 'hand');
  assert.ok(medianSentence(analysis, prozac).en.startsWith('The median cost of Prozac is $106.43.'));
  assert.equal(meanSentence(analysis, prozac).en, 'On average, [cases] have $106.71.');
  assert.ok(sdSentence(analysis, prozac).en.startsWith('We can expect the cost of Prozac to differ from the mean by about $'));
});

test('with the slide\'s cases the mean and median sentences read exactly like M3 p.30 and p.33', () => {
  const labels = {
    variable: { zh: '热量', en: 'Calories' }, unit: 'kcal', cases: { zh: 'Tim Hortons 甜甜圈', en: 'Tim Hortons donuts' },
  };
  const analysis = analyzeData(DONUTS, 'hand');
  assert.deepEqual(meanSentence(analysis, labels), {
    zh: '平均来说，Tim Hortons 甜甜圈的“热量”是 251 kcal。',
    en: 'On average, Tim Hortons donuts have 251 kcal.',
  });
  assert.deepEqual(medianSentence(analysis, labels), {
    zh: '“热量”的中位数是 250 kcal：50% 的 Tim Hortons 甜甜圈不超过 250 kcal（at most，即 250 或更少），另外 50% 大于 250 kcal（more than）。',
    en: 'The median calories is 250 kcal. This means that 50% of Tim Hortons donuts have at most 250 kcal (250 or less), whereas 50% have more than 250 kcal.',
  });
  assert.equal(placeholderHint(labels, { units: true }), null);
  assert.equal(placeholderHint(labels), null);
  const steps = centreSpreadSteps(analysis, labels);
  assert.deepEqual([stepOf(steps, 'mean').hint, stepOf(steps, 'median').hint], [null, null]);
});

test('variable names read as inside a sentence: "Calories" and "Quiz mark" lower-cased, R names kept', () => {
  const analysis = analyzeData(DONUTS, 'hand');
  const labels = { variable: { zh: '热量', en: 'Calories' }, unit: 'kcal' };
  assert.ok(medianSentence(analysis, labels).en.startsWith('The median calories is 250 kcal.'));
  assert.ok(rangeSentence(analysis, labels).en.startsWith('The values of calories range from 180 kcal'));
  assert.ok(iqrSentence(analysis, labels).en.startsWith('The middle 50% of the values of calories lie between'));
  assert.equal(sdSentence(analysis, labels).en, 'We can expect calories to differ from the mean by about 50.06 kcal, on average.');
  const quiz = { variable: { zh: '测验分数', en: 'Quiz mark' }, unit: '' };
  assert.ok(sdSentence(analyzeData(THREE), quiz).en.startsWith('We can expect quiz mark to differ'));
  const rName = { variable: { zh: '原始数据（original.data）', en: 'original.data' }, unit: '' };
  assert.ok(medianSentence(analyzeData(ORIGINAL), rName).en.startsWith('The median original.data is 15.'));
  // The data panel still shows the label as written; only the sentences change it.
  // 数据面板仍按原样显示标签；只有句子里改写。
  assert.deepEqual(normalizeCenterSpreadConfig({ data: THREE, variable: { zh: '热量', en: 'Calories' } }).variable, { zh: '热量', en: 'Calories' });
});

test('without a unit the mean keeps [units]; the hint names every placeholder left to fill', () => {
  const steps = stepsFor(THREE, 'hand', { variable: { zh: '数值', en: 'Value' }, unit: '' });
  assert.deepEqual(stepOf(steps, 'mean').sentence, {
    zh: '平均来说，[个案] 的“数值”是 4 [单位]。',
    en: 'On average, [cases] have 4 [units].',
  });
  assert.equal(stepOf(steps, 'mean').hint.en,
    'On a test, replace [cases] with the cases of the question (for example Tim Hortons donuts) and [units] with the units of the variable.');
  assert.equal(stepOf(steps, 'median').hint.en, 'On a test, replace [cases] with the cases of the question, for example Tim Hortons donuts.');
  assert.equal(stepOf(steps, 'median').sentence.en,
    'The median value is 3. This means that 50% of [cases] have at most 3 (3 or less), whereas 50% have more than 3.');
  for (const id of ['sort', 'mode', 'range', 'quartiles', 'sd']) assert.equal(stepOf(steps, id).hint, undefined, id);
  const named = { variable: { zh: '数值', en: 'Value' }, unit: '', cases: { en: 'these students' } };
  assert.equal(meanSentence(analyzeData(THREE), named).en, 'On average, these students have 4 [units].');
  assert.deepEqual(placeholderHint(named, { units: true }), {
    zh: '考试时把 [单位] 换成变量的单位。', en: 'On a test, replace [units] with the units of the variable.',
  });
  assert.equal(placeholderHint(named), null);
  assert.deepEqual(PLACEHOLDERS, { cases: { zh: '[个案]', en: '[cases]' }, units: { zh: '[单位]', en: '[units]' } });
});

test('M4 p.5-6: hand quartiles of the donuts are the 8th value of each half, Q1 = 210 and Q3 = 280, IQR = 70', () => {
  const step = stepOf(stepsFor(DONUTS, 'hand', DONUT_LABELS), 'quartiles');
  assert.equal(step.title.en, 'Quartiles Q1, Q3 and the IQR (hand method: the median of each half)');
  assert.deepEqual(workOf(step), [
    'position in the half = 0.5 × (15 + 1) = 8', 'Q1 = 210',
    'position in the half = 0.5 × (15 + 1) = 8', 'Q3 = 280',
    'IQR = Q3 − Q1 = 280 − 210 = 70',
  ]);
  const explains = textsOf(step, 'explain').map((text) => text.en);
  assert.equal(explains[0], 'Lower half: the 1st to the 15th values (15 values). Q1 is the median of this half.');
  assert.equal(explains[1], 'Upper half: the 16th to the 30th values (15 values). Q3 is the median of this half. '
    + 'Its 8th value is the 23rd value overall.');
  assert.equal(textsOf(step, 'explain')[1].zh,
    '上半部分：第 16 到第 30 个值（共 15 个）。Q3 是这一半的中位数。它的第 8 个值就是全部数据的第 23 个值。');
  // The slide's remark that R's quartiles can differ is always there. 课件“R 的四分位数可能不同”的说明一直都在。
  assert.ok(textsOf(step, 'note').some((text) => text.en.includes('R uses a different, more advanced algorithm')));
});

test("R's method on the donuts: h = 8.25 and 22.75 give Q1 = 210 and Q3 = 277.5 like summary(Calories) on M4 p.6", () => {
  const step = stepOf(stepsFor(DONUTS, 'r7', DONUT_LABELS), 'quartiles');
  assert.equal(step.title.en, "Quartiles Q1, Q3 and the IQR (R's method)");
  assert.deepEqual(workOf(step), [
    'h = (30 − 1) × 0.25 + 1 = 8.25', 'Q1 = 210 + 0.25 × (210 − 210) = 210',
    'h = (30 − 1) × 0.75 + 1 = 22.75', 'Q3 = 270 + 0.75 × (280 − 270) = 277.5',
    'IQR = Q3 − Q1 = 277.5 − 210 = 67.5',
  ]);
  const notes = textsOf(step, 'note');
  assert.ok(notes[0].zh.startsWith('补充（课件外）'));
  assert.ok(notes[0].en.startsWith('Extra (not on the slides)'));
  assert.equal(step.sentence.en, 'The middle 50% of the values of calories in Tim Hortons donuts '
    + 'lie between Q1 = 210 kcal and Q3 = 277.5 kcal, a range of 67.5 kcal (the IQR).');
});

test('M3 p.45-51: for 2, 3, 7 the deviations are −2, −1, +3, the squares add to 14 and S² = 14 / 2 = 7', () => {
  const analysis = analyzeData(THREE, 'hand');
  const view = deviationView(analysis);
  assert.deepEqual(view.rows, [
    { position: 1, y: '2', deviation: '−2', squared: '4' },
    { position: 2, y: '3', deviation: '−1', squared: '1' },
    { position: 3, y: '7', deviation: '+3', squared: '9' },
  ]);
  assert.deepEqual(view.footer, { sum: '12', sumDeviation: '0', sumSquared: '14' });
  assert.equal(view.note, null);
  assert.deepEqual(workOf(stepOf(centreSpreadSteps(analysis, Y_LABELS), 'sd')), [
    'Σ(y − ȳ)² = (2 − 4)² + (3 − 4)² + (7 − 4)²',
    '= 14',
    'S² = 14 / (3 − 1) = 14 / 2 = 7',
    'S = √7 ≈ 2.65',
  ]);
});

test('an odd n leaves the median out of both halves and says so; R\'s method matches favstats on M4 p.27', () => {
  const hand = stepOf(stepsFor(ORIGINAL, 'hand'), 'quartiles');
  assert.ok(textsOf(hand, 'note')[0].en.startsWith('n = 5 is odd: the median (the 3rd value) is not included in either half.'));
  assert.deepEqual(workOf(hand), [
    'position in the half = 0.5 × (2 + 1) = 1.5', 'Q1 = (5 + 10) / 2 = 7.5',
    'position in the half = 0.5 × (2 + 1) = 1.5', 'Q3 = (20 + 25) / 2 = 22.5',
    'IQR = Q3 − Q1 = 22.5 − 7.5 = 15',
  ]);
  assert.ok(textsOf(hand, 'explain')[1].en.endsWith('Its 1st and 2nd values are the 4th and 5th values overall.'));
  const r7 = stepOf(stepsFor(ORIGINAL, 'r7'), 'quartiles');
  assert.deepEqual(workOf(r7), [
    'h = (5 − 1) × 0.25 + 1 = 2', 'Q1 = 10',
    'h = (5 − 1) × 0.75 + 1 = 4', 'Q3 = 20',
    'IQR = Q3 − Q1 = 20 − 10 = 10',
  ]);
  assert.equal(textsOf(r7, 'explain')[0].en, 'h = 2 is a whole number, so Q1 is the 2nd value.');
  assert.deepEqual(workOf(stepOf(stepsFor(ORIGINAL), 'median')), ['0.5 × (5 + 1) = 3', 'median = 15']);
  // A half of one value: n = 3. 只有一个值的半边：n = 3。
  const tiny = stepOf(stepsFor(THREE, 'hand'), 'quartiles');
  assert.equal(textsOf(tiny, 'explain')[0].en, 'Lower half: only the 1st value. Q1 is the median of this half.');
  assert.deepEqual(workOf(tiny).slice(0, 2), ['position in the half = 0.5 × (1 + 1) = 1', 'Q1 = 2']);
});

test('a mean that is not exact is written with ≈, and the rounded table cells are flagged', () => {
  const analysis = analyzeData([1, 2, 4], 'hand');
  const steps = centreSpreadSteps(analysis, Y_LABELS);
  assert.deepEqual(workOf(stepOf(steps, 'mean')), ['ȳ = (1 + 2 + 4) / 3', '= 7 / 3', '≈ 2.33']);
  assert.deepEqual(workOf(stepOf(steps, 'sd')), [
    'Σ(y − ȳ)² = (1 − 2.3333)² + (2 − 2.3333)² + (4 − 2.3333)²',
    '≈ 4.6667',
    'S² ≈ 4.6667 / (3 − 1) ≈ 4.6667 / 2 ≈ 2.3333',
    'S = √2.3333 ≈ 1.53',
  ]);
  const view = deviationView(analysis);
  assert.deepEqual(view.rows.map((row) => row.deviation), ['−1.3333', '−0.3333', '+1.6667']);
  assert.deepEqual(view.footer.sumDeviation, '0');
  assert.ok(view.note.en.startsWith('Deviations and squares in the table are rounded'));
});

test('negative data and decimals keep parentheses in the working and exact quartiles', () => {
  const steps = stepsFor([-3.5, -1.25, 0, 2.75, 4.5, 6, 6], 'r7');
  assert.equal(workOf(stepOf(steps, 'mean'))[0], 'ȳ = ((−3.5) + (−1.25) + ⋯ + 6) / 7');
  assert.deepEqual(workOf(stepOf(steps, 'quartiles')).slice(0, 2),
    ['h = (7 − 1) × 0.25 + 1 = 2.5', 'Q1 = −1.25 + 0.5 × (0 − (−1.25)) = −0.625']);
  assert.equal(workOf(stepOf(steps, 'quartiles'))[4], 'IQR = Q3 − Q1 = 5.25 − (−0.625) = 5.875');
  assert.equal(workOf(stepOf(steps, 'range'))[0], 'Range = Max − Min = 6 − (−3.5) = 9.5');
});

test('M3 p.36-37 and practice Q1d: no mode, one mode, or several tied modes', () => {
  assert.equal(modeSentence(analyzeData(THREE), Y_LABELS).en,
    'Every value appears only once, so no value is more frequent than the others: there is no mode.');
  assert.deepEqual(workOf(stepOf(stepsFor(THREE), 'mode')), []);
  const tied = analyzeData([12, 8, 10, 17, 8, 10, 17, 3]);
  assert.equal(modeSentence(tied, Y_LABELS).en, 'There are 3 modes: 8, 10 and 17 (each appears 2 times out of 8).');
  assert.equal(modeSentence(tied, Y_LABELS).zh, '有 3 个众数：8、10 和 17（8 个值中各出现 2 次）。');
  assert.deepEqual(workOf(stepOf(centreSpreadSteps(tied, Y_LABELS), 'mode')), ['modes = 8, 10, 17']);
  assert.equal(modeSentence(analyzeData([4, 4, 9]), { unit: 'kg' }).en,
    'The most frequent value is 4 kg (2 out of 3 values), so the mode is 4 kg.');
});

test('M3 p.52: when every value is equal, S = 0 and the range is 0', () => {
  const steps = stepsFor([10, 10, 10]);
  assert.equal(stepOf(steps, 'sd').sentence.en, 'S = 0: every value of y equals the mean, so there is no variation.');
  assert.deepEqual(workOf(stepOf(steps, 'sd')).slice(2), ['S² = 0 / (3 − 1) = 0 / 2 = 0', 'S = √0 = 0']);
  assert.equal(stepOf(steps, 'range').sentence.en, 'Every value of y equals 10, so the range is 0.');
  // No value is more than the median, so the 50% split of the template would be false.
  // 没有值大于中位数，句型里 50% 的划分不成立。
  assert.deepEqual(stepOf(steps, 'median').sentence, {
    zh: '“变量 y”的中位数是 10。这里每个值都等于 10，所以 100% 的 [个案] 都不超过 10，没有一个大于 10。',
    en: 'The median y is 10. Here every value equals 10, so 100% of [cases] have at most 10 and none has more than 10.',
  });
});

test('large numbers print exactly: a variance of 10⁸ is not shown as 100000000.0001', () => {
  const analysis = analyzeData([0, 10000, 20000], 'hand');
  assert.deepEqual(workOf(stepOf(centreSpreadSteps(analysis, Y_LABELS), 'sd')).slice(1), [
    '= 200000000',
    'S² = 200000000 / (3 − 1) = 200000000 / 2 = 100000000',
    'S = √100000000 = 10000',
  ]);
  assert.equal(summaryGroups(analysis, '').find((group) => group.id === 'spread').items[2].value, '100000000');
  // Income-sized data: the sum of squares 1730039318.63 is rounded to whole units and marked with ≈.
  // 收入量级的数据：平方和 1730039318.63 取整，并标上 ≈。
  const income = analyzeData([43595.28, 68681, 21032.5, 54012.75, 39876.12, 47123.9, 30123.45, 61234.56]);
  const lines = workOf(stepOf(centreSpreadSteps(income, Y_LABELS), 'sd'));
  assert.equal(lines[1], '≈ 1730039319');
  assert.equal(lines[2], 'S² ≈ 1730039319 / (8 − 1) ≈ 1730039319 / 7 ≈ 247148474.1');
  assert.equal(lines[3], 'S = √247148474.1 ≈ 15720.96');
});

test('positionCells marks Min, Q1, Q2, Q3 and Max where each method looks, with the hand method\'s halves', () => {
  const marked = (cells) => cells.filter((cell) => cell.marks.length).map((cell) => `${cell.position}:${cell.marks.join('/')}`);
  const hand = positionCells(analyzeData(DONUTS, 'hand'));
  assert.deepEqual(marked(hand), ['1:Min', '8:Q1', '15:Q2', '16:Q2', '23:Q3', '30:Max']);
  assert.deepEqual([hand[14].half, hand[15].half, hand[0].text], ['lower', 'upper', '180']);
  const r7 = positionCells(analyzeData(DONUTS, 'r7'));
  assert.deepEqual(marked(r7), ['1:Min', '8:Q1', '9:Q1', '15:Q2', '16:Q2', '22:Q3', '23:Q3', '30:Max']);
  assert.ok(r7.every((cell) => cell.half === null));
  const odd = positionCells(analyzeData(THREE, 'hand'));
  assert.deepEqual(odd.map((cell) => [cell.marks.join('/'), cell.half]),
    [['Min/Q1', 'lower'], ['Q2', 'median'], ['Q3/Max', 'upper']]);
});

test('summaryGroups lists centre, spread and position with units, and a mode that is not one short list', () => {
  const groups = summaryGroups(analyzeData(DONUTS, 'hand'), 'kcal');
  assert.deepEqual(groups.map((group) => group.id), ['centre', 'spread', 'position']);
  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => `${item.id}=${item.value}`)), [
    'mean=251 kcal', 'median=250 kcal', 'mode=270 kcal',
    'range=220 kcal', 'iqr=70 kcal', 'variance=2505.8621', 'sd=50.06 kcal',
    'min=180 kcal', 'q1=210 kcal', 'q3=280 kcal', 'max=400 kcal',
  ]);
  assert.deepEqual(summaryGroups(analyzeData(THREE), '')[0].items[2].valueBi, { zh: '没有', en: 'none' });
  assert.equal(summaryGroups(analyzeData([1, 1, 2, 2, 3, 3]), '')[0].items[2].value, '1, 2, 3');
  assert.deepEqual(summaryGroups(analyzeData([1, 1, 2, 2, 3, 3, 4, 4]), '')[0].items[2].valueBi, { zh: '4 个众数', en: '4 modes' });
});

/* ---------- Dot plot and messages 点图与提示 ---------- */

test('plotModel stacks equal values, marks the outlier and describes the plot in words', () => {
  const model = plotModel(analyzeData(DONUTS, 'hand'), { unit: 'kcal' });
  assert.equal(model.stacks.find((stack) => stack.value === 270).count, 5);
  assert.equal(model.maxCount, 5);
  assert.deepEqual(model.yExtent, { min: 0, max: 6, step: 1, ticks: [] });
  assert.ok(model.xExtent.min <= 180 && model.xExtent.max >= 400);
  assert.deepEqual([model.mean, model.median, model.q1, model.q3], [251, 250, 210, 280]);
  assert.ok(model.stacks.every((stack) => !stack.outlier));
  assert.equal(model.description.en, 'Dot plot of 30 values from 180 kcal to 400 kcal. Mean ȳ = 251 kcal, median = 250 kcal; '
    + 'the shaded band is the middle 50%, from Q1 = 210 kcal to Q3 = 280 kcal.');
  const swap = outlierSwap(DONUTS);
  const withOutlier = plotModel(analyzeData(swap.values, 'hand'), { outlier: swap.to, unit: 'kcal' });
  assert.deepEqual(withOutlier.stacks.filter((stack) => stack.outlier).map((stack) => stack.value), [840]);
  assert.ok(withOutlier.description.en.endsWith('The marked dot is the outlier 840 kcal.'));
  assert.equal(plotModel(analyzeData([3, 3, 3])).yExtent.max, 4);
});

test('values the validator accepts but no axis can show (near 10³⁰⁸ or 10⁻³²⁴) give a sentence instead of a plot', () => {
  for (const data of [[1e308, -1e308, 5], [5e-324, 1e-323, 2e-323], [1.79e308, 1.7e308, 1.75e308], [1e-310, 0, 1]]) {
    const model = plotModel(analyzeData(data));
    assert.equal(model.drawable, false);
    assert.ok(model.description.en.startsWith('These values are too large (or too close together) to draw a dot plot'));
  }
  for (const data of [[0, 0, 0], [1e300, -1e300, 0], [123456789012.5, 123456789013.25, 123456789014]]) {
    const model = plotModel(analyzeData(data));
    assert.equal(model.drawable, true);
    assert.ok(Number.isFinite(model.xExtent.min) && Number.isFinite(model.xExtent.max) && model.xExtent.step > 0);
  }
});

test('every path the widget runs survives the extreme configs the validator accepts', () => {
  const extremes = [[1e308, -1e308, 5], [5e-324, 1e-323, 2e-323], [1.79e308, 1.7e308, 1.75e308], [-1.79e308, -1.7e308, 0],
    [1e300, -1e300, 0], [0.1, 0.2, 0.30000000000000004], [1.5, -2.25, 1e12, 0.000001]];
  for (const data of extremes) {
    const model = normalizeCenterSpreadConfig({ data });
    assert.deepEqual(model.data, data);
    const labels = { variable: model.variable, unit: model.unit };
    for (const method of ['hand', 'r7']) {
      const analysis = analyzeData(model.data, method);
      const swap = outlierSwap(model.data);
      assert.ok(swap.values.every(Number.isFinite));
      centreSpreadSteps(analysis, labels);
      summaryGroups(analysis, '');
      positionCells(analysis);
      deviationView(analysis);
      plotModel(analysis, { outlier: swap.to });
      resistanceReport(analysis, analyzeData(swap.values, method), swap, labels);
      for (const [operation, constant] of [['add', 1e6], ['multiply', -1000], ['multiply', 0.001]]) {
        transformReport(model.data, method, operation, constant, labels);
      }
    }
  }
  // At the very edge of floating point the outlier cannot move further, and the sentence says so.
  // 在浮点数的极限处，离群值无法再增大，句子会如实说明。
  const edge = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
  const swap = outlierSwap(edge);
  const report = resistanceReport(analyzeData(edge), analyzeData(swap.values), swap, Y_LABELS);
  assert.ok(report.sentence.en.endsWith('changes none of these measures.'));
});

test('status messages report the new numbers', () => {
  const analysis = analyzeData(DONUTS, 'hand');
  assert.equal(updateMessage(analysis, 'kcal').en, 'Updated: n = 30, ȳ = 251 kcal, median = 250 kcal, S ≈ 50.06 kcal.');
  assert.equal(methodMessage(analyzeData(DONUTS, 'r7'), 'kcal').en,
    "Quartiles now use R's method (quantile(), type 7): Q1 = 210 kcal, Q3 = 277.5 kcal, IQR = 67.5 kcal.");
  assert.equal(methodMessage(analyzeData(DONUTS, 'r7'), 'kcal').zh,
    '四分位数改用 R 的方法（quantile() 的 type 7）：Q1 = 210 kcal，Q3 = 277.5 kcal，IQR = 67.5 kcal。');
  assert.ok(methodMessage(analysis, '').en.startsWith(`Quartiles now use ${METHOD_NAMES.hand.en}:`));
  const swap = outlierSwap(DONUTS);
  assert.equal(outlierMessage(swap, true, 'kcal').en,
    'The largest value 400 kcal is now 840 kcal, an outlier. The comparison below shows which measures changed.');
  assert.equal(outlierMessage(swap, false, 'kcal').en, 'The largest value is back to 400 kcal.');
});

/* ---------- Resistance 耐抗性 ---------- */

test('outlierSwap moves the last largest value two ranges further up and leaves the rest in place', () => {
  const swap = outlierSwap(DONUTS);
  assert.deepEqual([swap.from, swap.to, swap.index], [400, 840, 28]);
  assert.deepEqual(swap.values.filter((_, index) => index !== 28), DONUTS.filter((_, index) => index !== 28));
  assert.deepEqual(DONUTS[28], 400, 'the input is not changed');
  assert.deepEqual(outlierSwap([1, 5, 5]), { values: [1, 5, 13], index: 2, from: 5, to: 13 });
  assert.deepEqual(outlierSwap([4, 4, 4]).values, [4, 4, 12]);
  assert.deepEqual(outlierSwap([0, 0, 0]).values, [0, 0, 2]);
  assert.deepEqual(outlierSwap([-6, -2, -4]).values, [-6, 6, -4]);
  assert.deepEqual(outlierSwap([1.5, 2.25, 3]).values, [1.5, 2.25, 6]);
  assert.deepEqual(outlierSwap([]), { values: [], index: -1, from: NaN, to: NaN });
});

test('M3 p.68 and M4 p.46: the outlier moves the mean, range, S² and S but not the median or the IQR', () => {
  for (const method of ['hand', 'r7']) {
    const swap = outlierSwap(DONUTS);
    const report = resistanceReport(analyzeData(DONUTS, method), analyzeData(swap.values, method), swap, DONUT_LABELS);
    assert.deepEqual(report.rows.map((row) => row.id), [...RESISTANCE_ROWS]);
    assert.deepEqual(report.rows.map((row) => [row.id, row.changed, row.resistant]), [
      ['mean', true, false], ['median', false, true], ['range', true, false],
      ['iqr', false, true], ['variance', true, false], ['sd', true, false],
    ]);
    assert.equal(report.note, null);
    assert.equal(report.sentence.en, 'Replacing the largest value 400 kcal by 840 kcal changes the mean, the range, '
      + 'the variance and the standard deviation, but not the median or the IQR.');
    assert.equal(report.sentence.zh, '把最大值 400 kcal 换成 840 kcal：平均数、极差、方差和标准差都变了，中位数和 IQR 没有变。');
  }
  const swap = outlierSwap(DONUTS);
  const report = resistanceReport(analyzeData(DONUTS), analyzeData(swap.values), swap, DONUT_LABELS);
  const row = (id) => report.rows.find((item) => item.id === id);
  assert.deepEqual([row('mean').before, row('mean').after, row('mean').change], ['251 kcal', '265.67 kcal', '+14.67 kcal']);
  assert.deepEqual([row('range').before, row('range').after, row('range').change], ['220 kcal', '660 kcal', '+440 kcal']);
  assert.deepEqual([row('median').after, row('median').change], ['250 kcal', null]);
  assert.equal(row('variance').change, '+10974.7126');
  assert.ok(report.rule.en.startsWith('From the slides: the mean, range, variance and standard deviation are not resistant'));
  assert.ok(report.advice.en.includes('report the median and the IQR'));
});

test('with very few values Q3 uses the largest value, so the IQR moves too and a note explains why', () => {
  const swap = outlierSwap(THREE);
  const report = resistanceReport(analyzeData(THREE), analyzeData(swap.values), swap, Y_LABELS);
  assert.equal(report.rows.find((row) => row.id === 'iqr').changed, true);
  assert.equal(report.rows.find((row) => row.id === 'median').changed, false);
  assert.ok(report.note.en.startsWith('Note: with only n = 3 values, Q3 is computed from the largest value'));
  assert.equal(report.sentence.en,
    'Replacing the largest value 7 by 17 changes the mean, the range, the IQR, the variance and the standard deviation, but not the median.');
  const five = [2, 4, 4, 5, 7];
  const fiveSwap = outlierSwap(five);
  assert.equal(resistanceReport(analyzeData(five, 'r7'), analyzeData(fiveSwap.values, 'r7'), fiveSwap, Y_LABELS).note, null);
  assert.ok(resistanceReport(analyzeData(five, 'hand'), analyzeData(fiveSwap.values, 'hand'), fiveSwap, Y_LABELS).note);
});

test('property: the median never moves, and the IQR stays put from n = 6 (hand) or n = 5 (R)', () => {
  const random = seeded(220);
  for (let n = 3; n <= 30; n += 1) {
    for (let trial = 0; trial < 5; trial += 1) {
      const data = randomData(random, n, { decimals: trial % 3 });
      const swap = outlierSwap(data);
      for (const method of ['hand', 'r7']) {
        const report = resistanceReport(analyzeData(data, method), analyzeData(swap.values, method), swap, Y_LABELS);
        const changed = Object.fromEntries(report.rows.map((row) => [row.id, row.changed]));
        assert.equal(changed.median, false, `median moved for n = ${n}`);
        assert.equal(changed.mean, true);
        assert.equal(changed.range, true);
        if (n >= (method === 'hand' ? 6 : 5)) assert.equal(changed.iqr, false, `IQR moved for n = ${n} (${method})`);
        assert.equal(report.note !== null, changed.iqr);
      }
    }
  }
});

/* ---------- Adding or multiplying by a constant 加上或乘以常数 ---------- */

test('M4 p.27-30: + 10, − 5, × 2 and ÷ 5 move the measures exactly as favstats shows', () => {
  const read = (report) => Object.fromEntries(report.rows.map((row) => [row.id, row.after]));
  const plus = transformReport(ORIGINAL, 'r7', 'add', 10, Y_LABELS);
  assert.equal(plus.expression, 'y + 10');
  assert.equal(plus.preview, '15, 20, 25, 30, 35');
  assert.deepEqual(read(plus), {
    mean: '25', median: '25', min: '15', q1: '20', q3: '30', max: '35', range: '20', iqr: '10', sd: '7.91', variance: '62.5',
  });
  const minus = transformReport(ORIGINAL, 'r7', 'add', -5, Y_LABELS);
  assert.equal(minus.expression, 'y − 5');
  assert.deepEqual([read(minus).min, read(minus).q1, read(minus).median, read(minus).q3, read(minus).max, read(minus).sd],
    ['0', '5', '10', '15', '20', '7.91']);
  const twice = transformReport(ORIGINAL, 'r7', 'multiply', 2, Y_LABELS);
  assert.equal(twice.expression, '2 × y');
  assert.deepEqual([read(twice).mean, read(twice).sd, read(twice).range, read(twice).iqr, read(twice).variance],
    ['30', '15.81', '40', '20', '250']);
  const fifth = transformReport(ORIGINAL, 'r7', 'multiply', 0.2, Y_LABELS);
  assert.equal(fifth.preview, '1, 2, 3, 4, 5');
  assert.deepEqual([read(fifth).mean, read(fifth).sd], ['3', '1.58']);
  assert.ok(fifth.sentence.en.startsWith('Multiplying every value by 0.2 (that is, dividing by 5) multiplies every measure of position'));
});

test('the rule column names how each measure moves, and the sentence states the slides\' rule', () => {
  const rules = (report) => Object.fromEntries(report.rows.map((row) => [row.id, row.rule.en]));
  const plus = transformReport(ORIGINAL, 'hand', 'add', 10, Y_LABELS);
  assert.deepEqual(rules(plus), {
    mean: '+ 10', median: '+ 10', min: '+ 10', q1: '+ 10', q3: '+ 10', max: '+ 10',
    range: 'unchanged', iqr: 'unchanged', sd: 'unchanged', variance: 'unchanged',
  });
  assert.equal(plus.rows.find((row) => row.id === 'sd').rule.zh, '不变');
  assert.ok(plus.sentence.en.startsWith('Adding 10 to every value adds 10 to every measure of position'));
  assert.ok(plus.sentence.en.includes('leaves the measures of spread (range, IQR, standard deviation S) unchanged'));
  assert.equal(plus.sentenceIsExtra, false);
  assert.ok(plus.varianceNote.zh.startsWith('补充（课件外）'));
  assert.equal(rules(transformReport(ORIGINAL, 'hand', 'add', -5, Y_LABELS)).mean, '− 5');
  assert.ok(transformReport(ORIGINAL, 'hand', 'add', -5, Y_LABELS).sentence.en.startsWith('Subtracting 5 from every value'));
  assert.equal(transformReport(ORIGINAL, 'hand', 'add', 0, Y_LABELS).rows[0].rule.en, 'unchanged');
  const twice = rules(transformReport(ORIGINAL, 'hand', 'multiply', 2, Y_LABELS));
  assert.deepEqual([twice.mean, twice.q3, twice.sd, twice.variance], ['× 2', '× 2', '× 2', '× 2² = × 4']);
  assert.equal(transformReport(ORIGINAL, 'hand', 'multiply', 2, Y_LABELS).sentenceIsExtra, false);
});

test('a negative factor reverses the order: Min and Q1 come from the old Max and Q3, spreads use |k|', () => {
  const report = transformReport(ORIGINAL, 'r7', 'multiply', -2, Y_LABELS);
  const row = (id) => report.rows.find((item) => item.id === id);
  assert.equal(report.expression, '(−2) × y');
  assert.equal(report.preview, '−50, −40, −30, −20, −10');
  assert.deepEqual([row('min').after, row('min').rule.en, row('min').rule.zh], ['−50', '= (−2) × the old maximum', '= (−2) × 原来的最大值']);
  assert.deepEqual([row('q1').after, row('q1').rule.en, row('q1').rule.zh], ['−40', '= (−2) × the old Q3', '= (−2) × 原来的 Q3']);
  assert.deepEqual([row('mean').after, row('mean').rule.en], ['−30', '× (−2)']);
  assert.deepEqual([row('sd').after, row('sd').rule.en], ['15.81', '× |−2| = × 2']);
  assert.deepEqual([row('variance').after, row('variance').rule.en], ['250', '× (−2)² = × 4']);
  assert.equal(report.sentenceIsExtra, true);
  assert.ok(report.sentence.zh.startsWith('补充（课件外'));
  assert.ok(report.sentence.en.startsWith('Extra (not on the slides'));
});

test('property: every measure after the transformation equals the rule applied to the measure before it', () => {
  const random = seeded(2026);
  const predict = {
    add: (before, id, c) => (['range', 'iqr', 'sd', 'variance'].includes(id) ? before[id] : before[id] + c),
    multiply: (before, id, k) => {
      if (id === 'variance') return before.variance * k * k;
      if (['range', 'iqr', 'sd'].includes(id)) return before[id] * Math.abs(k);
      const mirror = { min: 'max', max: 'min', q1: 'q3', q3: 'q1' };
      return before[k < 0 && mirror[id] ? mirror[id] : id] * k;
    },
  };
  const measures = (analysis) => ({
    mean: analysis.mean, median: analysis.median.value, min: analysis.min, max: analysis.max,
    q1: analysis.quartiles.q1, q3: analysis.quartiles.q3, range: analysis.range, iqr: analysis.quartiles.iqr,
    sd: analysis.sd, variance: analysis.variance,
  });
  for (let trial = 0; trial < 60; trial += 1) {
    const data = randomData(random, 3 + Math.floor(random() * 28), { decimals: trial % 3 });
    for (const method of ['hand', 'r7']) {
      for (const [operation, constant] of [['add', 7.5], ['add', -12], ['multiply', 3], ['multiply', 0.25], ['multiply', -1.5]]) {
        const report = transformReport(data, method, operation, constant, Y_LABELS);
        const before = measures(report.before);
        const after = measures(report.after);
        for (const id of TRANSFORM_ROWS) close(after[id], predict[operation](before, id, constant), 1e-9);
      }
    }
  }
});

test('transformData keeps the input order and never prints binary noise', () => {
  assert.deepEqual(transformData([0.1, 0.7, 0.4], 'add', 0.2), [0.3, 0.9, 0.6]);
  assert.deepEqual(transformData([0.1, 0.7], 'multiply', 3), [0.3, 2.1]);
  assert.deepEqual(transformData([5, -5], 'multiply', -1), [-5, 5]);
  assert.deepEqual(transformData([1, 2], 'add', 'x'), [1, 2]);
  assert.deepEqual(transformData([1, 2], 'multiply', null), [1, 2]);
  const message = transformMessage(transformReport(THREE, 'hand', 'add', 10, Y_LABELS), '');
  assert.equal(message.en, 'y + 10: mean 4 → 14, standard deviation S 2.65 → 2.65.');
});

test('the slide presets are + 10, − 5, × 2 and ÷ 5, and matchingPreset finds them', () => {
  assert.deepEqual(TRANSFORM_PRESETS.map((preset) => [preset.operation, preset.constant, preset.text]),
    [['add', 10, '+ 10'], ['add', -5, '− 5'], ['multiply', 2, '× 2'], ['multiply', 0.2, '÷ 5']]);
  assert.equal(matchingPreset('add', DEFAULT_CONSTANTS.add), 0);
  assert.equal(matchingPreset('multiply', 0.2), 3);
  assert.equal(matchingPreset('multiply', 10), -1);
  assert.equal(matchingPreset('add', 2), -1);
  assert.deepEqual([formatConstant(10), formatConstant(-5), formatConstant(0.2), formatConstant('x')], ['10', '−5', '0.2', '0']);
});

/* ---------- Language 语言 ---------- */

test('every English text is free of Chinese, every Chinese text has Chinese, and nothing has an emoji', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const texts = [];
  const collect = (value) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if (typeof value.zh === 'string' && typeof value.en === 'string' && value.zh !== value.en) texts.push(value);
      Object.values(value).forEach(collect);
    }
  };
  const datasets = [DONUTS, THREE, ORIGINAL, [1, 2, 4], [10, 10, 10], [12, 8, 10, 17, 8, 10, 17, 3], [-3.5, -1.25, 0, 2.75]];
  for (const data of datasets) {
    for (const method of ['hand', 'r7']) {
      const analysis = analyzeData(data, method);
      const swap = outlierSwap(data);
      collect(centreSpreadSteps(analysis, DONUT_LABELS));
      collect(summaryGroups(analysis, 'kcal'));
      collect(plotModel(analysis, { outlier: swap.to, unit: 'kcal' }));
      collect(resistanceReport(analysis, analyzeData(swap.values, method), swap, DONUT_LABELS));
      for (const [operation, constant] of [['add', 10], ['add', -5], ['multiply', 2], ['multiply', -3]]) {
        collect(transformReport(data, method, operation, constant, DONUT_LABELS));
      }
    }
  }
  collect(GUIDE);
  collect(parseDataText('1 x').error);
  collect(parseConstant('0', 'multiply').error);
  assert.ok(texts.length > 200);
  for (const { zh, en } of texts) {
    assert.ok(!HAN.test(en), `English text contains Chinese: ${en}`);
    assert.ok(!zh || HAN.test(zh), `Chinese text has no Chinese: ${zh}`);
    assert.ok(!emoji.test(zh) && !emoji.test(en), 'emoji found');
  }
});
