import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AXIS_LIMITS,
  COMPARE_LIMITS,
  DEFAULT_REVERSE_Z,
  HIGHLY_SUSPECT_Z,
  SLIDE_EXAMPLE,
  SUSPECT_Z,
  VALUE_LIMITS,
  Z_DIGITS,
  announcement,
  axisScale,
  axisSpan,
  axisTicks,
  compareValues,
  comparisonText,
  formatDeviation,
  formatGiven,
  formatZ,
  interpretZ,
  labelCenter,
  labelStride,
  normalizeZScoreConfig,
  numberLineDescription,
  parseNumberInput,
  placeOnAxis,
  pointLabel,
  reverseFromZ,
  withUnit,
  zDetails,
  zOutlierLevel,
  zRule,
  zSteps,
  zWorking,
} from '../../../../engine/widgets/statistics/z-score/z-score-logic.js';

const bi = (zh, en) => ({ zh, en });
// M4 p.34-35: "67 on an exam with mean 50 and a standard deviation of 10" against "62 on an exam with mean 40
// and a standard deviation of 12". 第 4 单元第 34-35 页的两次考试。
const EXAMS = [
  { name: bi('考试 1', 'Exam 1'), mean: 50, sd: 10, value: 67 },
  { name: bi('考试 2', 'Exam 2'), mean: 40, sd: 12, value: 62 },
];
// The z-score row of tools/content-spec.md section 5.4. content-spec 第 5.4 节 z-score 一行的两个例子。
const SPEC_SINGLE = { title: bi('甜甜圈', 'Donuts'), variable: bi('热量', 'Calories'), unit: '', mean: 250, sd: 50, values: [400, 150] };
const SPEC_COMPARE = {
  title: bi('哪门课考得更好', 'Which test went better'),
  compare: [
    { name: bi('统计', 'Statistics'), mean: 70, sd: 8, value: 82 },
    { name: bi('微积分', 'Calculus'), mean: 60, sd: 5, value: 68 },
  ],
};
// Validator rule (tools/validate_content.py): no emojis or pictographic symbols in any text.
// 校验器规则：任何文字里都不能有表情或图形符号。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/* ---------- Config 配置 ---------- */

test('normalizeZScoreConfig reads both content-spec examples as written', () => {
  const single = normalizeZScoreConfig(SPEC_SINGLE);
  assert.equal(single.mode, 'single');
  assert.deepEqual([single.mean, single.sd, single.values], [250, 50, [400, 150]]);
  assert.deepEqual(single.title, SPEC_SINGLE.title);
  assert.deepEqual(single.variable, SPEC_SINGLE.variable);
  assert.equal(single.unit, '');
  assert.deepEqual(single.entries, []);
  assert.equal(single.usedDefault, false);

  const compare = normalizeZScoreConfig(SPEC_COMPARE);
  assert.equal(compare.mode, 'compare');
  assert.deepEqual(compare.entries, SPEC_COMPARE.compare.map((entry, index) => ({ index, ...entry, sentenceName: entry.name })));
  assert.deepEqual(compare.title, SPEC_COMPARE.title);
  assert.deepEqual(compare.values, []);
  assert.equal(compare.usedDefault, false);
});

test('every config the validator accepts is read without losing anything', () => {
  const entry = (value) => ({ name: bi(`组 ${value}`, `Group ${value}`), mean: value, sd: 1 + value / 10, value: value + 1 });
  const singles = [
    { mean: 250, sd: 50, values: [400] },
    { mean: 250, sd: 50, values: [1, 2, 3, 4, 5, 6] },
    { mean: -3.5, sd: 0.001, values: [-3.5, -3.499, 0] },
    { title: bi('IQ', 'IQ'), variable: bi('IQ 分数', 'IQ score'), unit: '$', quartiles: 'r7', mean: 100, sd: 16, values: [140, 1e6] },
  ];
  for (const config of singles) {
    const model = normalizeZScoreConfig(config);
    assert.equal(model.mode, 'single');
    assert.deepEqual([model.mean, model.sd, model.values], [config.mean, config.sd, config.values]);
    assert.equal(model.usedDefault, false);
  }
  const compares = [
    { compare: [entry(1), entry(2)] },
    { compare: [entry(1), entry(2), entry(3)] },
    { compare: [entry(1), entry(2), entry(3), entry(4)] },
    // With "compare" present the validator checks only the list, so the other fields do not matter.
    // 有 "compare" 时校验器只检查这个列表，其他字段不起作用。
    { compare: [entry(-2), entry(0)], mean: 'unused', sd: 0, values: 'unused' },
  ];
  for (const config of compares) {
    const model = normalizeZScoreConfig(config);
    assert.equal(model.mode, 'compare');
    assert.deepEqual(model.entries.map(({ name, mean, sd, value }) => ({ name, mean, sd, value })), config.compare);
  }
});

test('normalizeZScoreConfig keeps the validator limits: 1-6 values, 2-4 comparisons', () => {
  assert.deepEqual(VALUE_LIMITS, { min: 1, max: 6 });
  assert.deepEqual(COMPARE_LIMITS, { min: 2, max: 4 });
  const many = normalizeZScoreConfig({ mean: 0, sd: 1, values: [1, 2, 3, 4, 5, 6, 7, 8] });
  assert.deepEqual(many.values, [1, 2, 3, 4, 5, 6]);
  const crowd = normalizeZScoreConfig({ compare: Array.from({ length: 6 }, (_, index) => ({ mean: index, sd: 1, value: index })) });
  assert.equal(crowd.entries.length, 4);
  assert.deepEqual(crowd.entries.map((entry) => entry.index), [0, 1, 2, 3]);
});

test('normalizeZScoreConfig falls back to the slide example when nothing is usable', () => {
  for (const config of [undefined, null, 42, 'text', [], {}, { mean: 5 }, { mean: 5, sd: 0 }, { mean: 5, sd: -2 }, { sd: 3 }, { mean: 'x', sd: 2 }]) {
    const model = normalizeZScoreConfig(config);
    assert.equal(model.usedDefault, true);
    assert.equal(model.mode, 'single');
    assert.deepEqual([model.mean, model.sd, model.values, model.unit], [251, 50.06, [400, 180], 'kcal']);
    assert.equal(model.title, null);
  }
  // The config's own labels would mislabel the slide's numbers. 配置自己的标签会把课件例子的数字标错。
  const labelled = normalizeZScoreConfig({ title: bi('IQ', 'IQ'), variable: bi('IQ', 'IQ'), unit: 'points', sd: 0 });
  assert.equal(labelled.title, null);
  assert.deepEqual(labelled.variable, SLIDE_EXAMPLE.variable);
  // The example is copied, so a caller cannot change it. 例子是复制出来的，调用方改不了它。
  labelled.values.push(1);
  labelled.variable.en = 'changed';
  assert.deepEqual([...SLIDE_EXAMPLE.values], [400, 180]);
  assert.equal(SLIDE_EXAMPLE.variable.en, 'Calories of a donut');
});

test('normalizeZScoreConfig tolerates messy fields', () => {
  const strings = normalizeZScoreConfig({ mean: '251', sd: '50.06', values: ['400', 'x', null, true, 180, Infinity] });
  assert.deepEqual([strings.mean, strings.sd, strings.values], [251, 50.06, [400, 180]]);
  // A missing list becomes the value 1 standard deviation above the mean. 缺少数值时用“比平均数高 1 个标准差”的值。
  assert.deepEqual(normalizeZScoreConfig({ mean: 100, sd: 16 }).values, [116]);
  assert.deepEqual(normalizeZScoreConfig({ mean: 100, sd: 16, values: ['none'] }).values, [116]);

  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, title: '' }).title, null);
  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, title: 5 }).title, null);
  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, title: { zh: ' ', en: '' } }).title, null);
  assert.deepEqual(normalizeZScoreConfig({ ...SPEC_SINGLE, title: 'IQ scores' }).title, { zh: '', en: 'IQ scores' });
  assert.deepEqual(normalizeZScoreConfig({ ...SPEC_SINGLE, variable: '热量' }).variable, { zh: '热量', en: '' });

  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, unit: '  kcal ' }).unit, 'kcal');
  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, unit: 42 }).unit, '');
  // The validator accepts any unit string, so a long one is kept whole. 校验器接受任何单位字符串，较长的单位也完整保留。
  assert.equal(normalizeZScoreConfig({ ...SPEC_SINGLE, unit: 'points on the final exam paper' }).unit, 'points on the final exam paper');
});

test('normalizeZScoreConfig skips unusable comparison entries and names the rest', () => {
  const model = normalizeZScoreConfig({
    compare: [
      null, [1, 2, 3], { mean: 1, sd: 0, value: 2 }, { mean: 1, sd: -1, value: 2 }, { mean: 1, sd: 2 },
      { mean: '70', sd: '8', value: '82' }, { name: '微积分', mean: 60, sd: 5, value: 68 },
    ],
  });
  assert.equal(model.mode, 'compare');
  assert.deepEqual(model.entries, [
    {
      index: 0, name: { zh: '分布 A', en: 'Distribution A' }, sentenceName: { zh: '分布 A', en: 'Distribution A' }, mean: 70, sd: 8, value: 82,
    },
    {
      index: 1, name: { zh: '微积分', en: '' }, sentenceName: { zh: '微积分', en: '' }, mean: 60, sd: 5, value: 68,
    },
  ]);

  // One usable entry: the single fields win when they are usable, otherwise the entry is shown alone.
  // 只有一个可用比较项：单个分布的字段可用时用它们，否则单独显示这个比较项。
  const withSingle = normalizeZScoreConfig({ compare: [EXAMS[0]], mean: 100, sd: 15, values: [130] });
  assert.deepEqual([withSingle.mode, withSingle.mean, withSingle.values], ['single', 100, [130]]);
  const alone = normalizeZScoreConfig({ compare: [EXAMS[1], { mean: 1 }] });
  assert.deepEqual([alone.mode, alone.mean, alone.sd, alone.values], ['single', 40, 12, [62]]);
  assert.deepEqual(alone.variable, EXAMS[1].name);
  assert.equal(alone.usedDefault, false);
});

test('parseNumberInput reads typed numbers, including Chinese input-method text', () => {
  assert.equal(parseNumberInput('400'), 400);
  assert.equal(parseNumberInput(' -1.5 '), -1.5);
  assert.equal(parseNumberInput('−71'), -71);
  assert.equal(parseNumberInput('４００'), 400);
  assert.equal(parseNumberInput('２．５'), 2.5);
  assert.equal(parseNumberInput('.5'), 0.5);
  assert.equal(parseNumberInput('1e3'), 1000);
  assert.equal(parseNumberInput(12), 12);
  for (const bad of ['', '   ', 'abc', '1,000', '1.2.3', '--2', NaN, Infinity, null, undefined, {}]) {
    assert.equal(parseNumberInput(bad), null, String(bad));
  }
});

/* ---------- Number text 数字文本 ---------- */

test('number text: given numbers as written, z with 2 decimals, units in the right place', () => {
  assert.equal(formatGiven(5.7529411765), '5.752941');
  assert.equal(formatGiven(-71), '−71');
  assert.equal(formatGiven(50.06), '50.06');
  assert.equal(Z_DIGITS, 2);
  assert.equal(formatZ(1.7), '1.70');
  assert.equal(formatZ(-1.41829), '−1.42');
  assert.equal(formatZ(1.833333, 3), '1.833');
  assert.equal(formatZ(NaN), '—');
  assert.equal(formatDeviation(149, 'kcal'), '+149 kcal');
  assert.equal(formatDeviation(-71, 'kcal'), '−71 kcal');
  assert.equal(formatDeviation(0), '0');

  assert.equal(withUnit('400', 'kcal'), '400 kcal');
  assert.equal(withUnit('82', '$'), '$82');
  assert.equal(withUnit('82', 'CA$'), 'CA$82');
  assert.equal(withUnit('−5', '$'), '−$5');
  assert.equal(withUnit('+12', '$'), '+$12');
  assert.equal(withUnit('12', '%'), '12%');
  assert.equal(withUnit('—', 'kcal'), '—');
  assert.equal(withUnit('7', ''), '7');
});

/* ---------- One value 单个值 ---------- */

test('M4 p.39: the 400-calorie donut is 2.98 standard deviations above the mean, the 180-calorie one 1.42 below', () => {
  const high = zDetails(400, 251, 50.06);
  assert.deepEqual([high.direction, high.deviation, formatZ(high.z), high.level], ['above', 149, '2.98', 'suspect']);
  const low = zDetails(180, 251, 50.06);
  assert.deepEqual([low.direction, low.deviation, formatZ(low.z), low.level], ['below', -71, '−1.42', 'none']);

  assert.equal(zWorking(400, 251, 50.06).line, 'z = (400 − 251) / 50.06 = 149 / 50.06 ≈ 2.98');
  assert.equal(zWorking(180, 251, 50.06).line, 'z = (180 − 251) / 50.06 = −71 / 50.06 ≈ −1.42');
  assert.equal(zWorking(400, 251, 50.06).general, 'z = (y − ȳ) / s');

  const above = interpretZ(400, 251, 50.06, 'kcal');
  assert.equal(above.en, 'A value of 400 kcal is 2.98 standard deviations above the mean.');
  assert.equal(above.zh, '400 kcal 比平均数高 2.98 个标准差。');
  assert.equal(above.template, '[Variable] for [case] is 2.98 standard deviations above the mean [variable].');
  const below = interpretZ(180, 251, 50.06, 'kcal');
  assert.equal(below.en, 'A value of 180 kcal is 1.42 standard deviations below the mean.');
  assert.equal(below.zh, '180 kcal 比平均数低 1.42 个标准差。');
});

test('M4 p.35: z = (67 − 50) / 10 = 1.70 and z = (62 − 40) / 12 = 1.83', () => {
  assert.equal(zWorking(67, 50, 10).line, 'z = (67 − 50) / 10 = 17 / 10 = 1.70');
  assert.equal(zWorking(62, 40, 12).line, 'z = (62 − 40) / 12 = 22 / 12 ≈ 1.83');
  // A negative mean gets parentheses. 负的平均数加括号。
  assert.equal(zWorking(3, -2, 1.5).line, 'z = (3 − (−2)) / 1.5 = 5 / 1.5 ≈ 3.33');
});

test('M4 practice key: Greece 2.28 and Spain 4.26; female Greece 2.73 is not an extreme value, female Spain 3.94 is', () => {
  assert.equal(zWorking(12.2, 5.752941, 2.825236).line, 'z = (12.2 − 5.752941) / 2.825236 = 6.447059 / 2.825236 ≈ 2.28');
  const greece = zRule(zDetails(12.2, 5.752941, 2.825236).z);
  assert.equal(greece.level, 'suspect');
  assert.equal(greece.en, '|z| = 2.28 is between 2 and 3 in absolute value: a potential/suspect outlier.');
  assert.equal(greece.extreme.answer, false);
  assert.equal(greece.extreme.en, 'No; it is not beyond a z-score of 3 in absolute value.');

  const spain = zRule(zDetails(17.8, 5.752941, 2.825236).z);
  assert.deepEqual([spain.size, spain.level, spain.extreme.answer], ['4.26', 'highly-suspect', true]);
  assert.equal(spain.en, '|z| = 4.26 is larger than 3, so the value is unlikely (rare): a highly suspect outlier.');
  assert.equal(spain.extreme.en, 'Yes; it is beyond a z-score of 3 in absolute value.');

  const femaleGreece = zRule(zDetails(14.3, 5.938235, 3.061591).z);
  assert.deepEqual([femaleGreece.size, femaleGreece.level, femaleGreece.extreme.answer], ['2.73', 'suspect', false]);
  const femaleSpain = zRule(zDetails(18, 5.938235, 3.061591).z);
  assert.deepEqual([femaleSpain.size, femaleSpain.level, femaleSpain.extreme.answer], ['3.94', 'highly-suspect', true]);
});

test('the z-score rule (M4 p.26): exactly 2 is not flagged, exactly 3 is suspect, beyond 3 highly suspect', () => {
  assert.deepEqual([SUSPECT_Z, HIGHLY_SUSPECT_Z], [2, 3]);
  const levels = [1.42, 2, -2, 2.0001, 2.98, 3, -3, 3.0000000000000004, 3.0001, -3.5, NaN, Infinity].map(zOutlierLevel);
  assert.deepEqual(levels, [
    'none', 'none', 'none', 'suspect', 'suspect', 'suspect', 'suspect', 'suspect', 'highly-suspect', 'highly-suspect', 'none', 'none',
  ]);
  // |z| keeps enough decimals that its place beside 2 and 3 stays visible. |z| 保留足够的小数位，看得出它与 2、3 的大小关系。
  assert.equal(zRule(3.004).size, '3.004');
  assert.equal(zRule(-2.9999).size, '2.9999');
  assert.equal(zRule(2).size, '2.00');
  assert.equal(zRule(-1.42).en, '|z| = 1.42 is not larger than 2, so the z-score rule does not flag it as an outlier.');
  assert.equal(zRule(NaN).size, '—');
});

test('zSteps: subtract the mean, then divide by the standard deviation', () => {
  const [subtract, divide] = zSteps(400, 251, 50.06, 'kcal');
  assert.equal(subtract.id, 'subtract');
  assert.equal(subtract.math, 'y − ȳ = 400 − 251 = 149');
  assert.match(subtract.zh, /高出 149 kcal/);
  assert.match(subtract.en, /y is 149 kcal above the mean\.$/);
  assert.equal(divide.id, 'divide');
  assert.equal(divide.math, 'z = 149 / 50.06 ≈ 2.98');
  assert.match(divide.en, /149 kcal is about 2\.98 times 50\.06 kcal\.$/);
  assert.match(divide.zh, /149 kcal 大约是 2\.98 个 50\.06 kcal/);

  const exact = zSteps(67, 50, 10);
  assert.match(exact[1].en, /: 17 is 1\.70 times 10\.$/);
  assert.match(exact[1].zh, /17 正好是 1\.70 个 10/);

  const [down, divideDown] = zSteps(180, 251, 50.06, 'kcal');
  assert.equal(down.math, 'y − ȳ = 180 − 251 = −71');
  assert.match(down.en, /y is 71 kcal below the mean\.$/);
  assert.match(divideDown.en, /The minus sign means y is below the mean\.$/);

  const [same, divideSame] = zSteps(251, 251, 50.06);
  assert.equal(same.math, 'y − ȳ = 251 − 251 = 0');
  assert.equal(divideSame.math, 'z = 0 / 50.06 = 0.00');
  assert.match(divideSame.en, /so z = 0\.$/);

  assert.equal(zSteps(3, -2, 1.5)[0].math, 'y − ȳ = 3 − (−2) = 5');
});

test('zDetails treats binary noise as the mean itself but keeps real small differences', () => {
  const noise = zDetails(0.1 + 0.2, 0.3, 1);
  assert.deepEqual([noise.deviation, noise.z, noise.direction], [0, 0, 'at']);
  const tiny = zDetails(1000000.0005, 1000000, 1);
  assert.equal(tiny.direction, 'above');
  assert.ok(tiny.deviation > 0);
  const strings = zDetails('400', '251', '50.06');
  assert.equal(formatZ(strings.z), '2.98');
  const flat = zDetails(5, 5, 0);
  assert.ok(Number.isNaN(flat.z));
  assert.equal(flat.direction, 'none');
  assert.equal(interpretZ(5, 5, 0).en, 'This z-score cannot be computed.');
});

test('interpretZ keeps a tiny non-zero z visible and says when y equals the mean', () => {
  assert.equal(interpretZ(251.1, 251, 50.06).en, 'A value of 251.1 is 0.002 standard deviations above the mean.');
  const same = interpretZ(251, 251, 50.06, 'kcal');
  assert.equal(same.en, 'A value of 251 kcal is equal to the mean, so its z-score is 0.');
  assert.equal(same.zh, '251 kcal 正好等于平均数，所以 z = 0。');
});

test('M4 p.37: reverseFromZ gives IQ = 100 + (2.5 × 16) = 140', () => {
  const genius = reverseFromZ(2.5, 100, 16);
  assert.equal(genius.value, 140);
  assert.equal(genius.line, 'y = ȳ + z × s = 100 + (2.5 × 16) = 140');
  assert.equal(genius.en, 'The value with z = 2.5 is 140: 2.5 standard deviations above the mean.');
  assert.equal(genius.zh, 'z = 2.5 对应的值是 140：比平均数高 2.5 个标准差。');

  const low = reverseFromZ(-1.5, 100, 16, 'points');
  assert.equal(low.line, 'y = ȳ + z × s = 100 + (−1.5 × 16) = 76');
  assert.equal(low.en, 'The value with z = −1.5 is 76 points: 1.5 standard deviations below the mean.');

  assert.equal(reverseFromZ(0, 251, 50.06, 'kcal').en, 'The value with z = 0 is 251 kcal, the mean itself.');
  // The default z = 2 lands on the "ȳ + 2s" tick of the number line. 默认的 z = 2 正好落在数轴“ȳ + 2s”刻度上。
  const tick = axisTicks(251, 50.06, 3.5).find((item) => item.k === DEFAULT_REVERSE_Z);
  assert.equal(formatGiven(reverseFromZ(DEFAULT_REVERSE_Z, 251, 50.06).value), tick.valueLabel);
  assert.equal(reverseFromZ(1 / 3, 0, 1).line, 'y = ȳ + z × s = 0 + (0.333333 × 1) ≈ 0.333333');

  const empty = reverseFromZ('x', 100, 16);
  assert.ok(Number.isNaN(empty.value));
  assert.equal(empty.line, 'y = ȳ + z × s');
  assert.equal(empty.en, 'Enter a z-score first.');
});

/* ---------- Several distributions 多个分布 ---------- */

test('M4 p.34-35: 62 on the second exam is the better score, though 67 is larger and only the z-scores are fair', () => {
  const result = compareValues(EXAMS);
  assert.deepEqual(result.order, [1, 0]);
  assert.deepEqual(result.ranks, [2, 1]);
  assert.deepEqual([result.top, result.rawTop, result.deviationTop], [[1], [0], [1]]);
  assert.deepEqual([result.sameMeans, result.sameSds, result.zDigits], [false, false, 2]);
  assert.deepEqual(result.rows.map((row) => row.deviation), [17, 22]);

  const text = comparisonText(result);
  assert.equal(text.chain, '1.83 > 1.70');
  assert.equal(text.conclusion.en, 'Relative to its own mean and standard deviation, 62 (Exam 2) is the highest: it has the largest z-score (z = 1.83).');
  assert.equal(text.conclusion.zh, '相对于各自的平均数和标准差，62（考试 2）的相对位置最高：它的 z 分数最大（z = 1.83）。');
  assert.equal(text.exam.en, 'So, 62 (Exam 2) is the better performance, relative to its mean and its standard deviation.');
  assert.deepEqual(text.ways.map((way) => [way.id, way.fair, way.picks]), [
    ['raw', false, [{ index: 0, text: '67' }]],
    ['deviation', false, [{ index: 1, text: '+22' }]],
    ['z', true, [{ index: 1, text: 'z = 1.83' }]],
  ]);
  assert.equal(text.ways[0].pick.en, '67 (Exam 1)');
  assert.equal(text.ways[0].reason.en, 'Not fair: the means and the standard deviations differ.');
});

test('a name that states its own value ("Exam 2: 62 (mean 40, SD 12)") is not repeated inside the sentences', () => {
  // The names of the mod04 comparison config; M4 p.35: "So, 62 exam mark is a (slightly) better performance ...".
  // 第 4 单元比较配置里的名称；第 4 单元第 35 页的结论句。
  const { entries } = normalizeZScoreConfig({
    compare: [
      { name: bi('考试 1：67 分（平均数 50，标准差 10）', 'Exam 1: 67 (mean 50, SD 10)'), mean: 50, sd: 10, value: 67 },
      { name: bi('考试 2：62 分（平均数 40，标准差 12）', 'Exam 2: 62 (mean 40, SD 12)'), mean: 40, sd: 12, value: 62 },
    ],
  });
  assert.deepEqual(entries.map((entry) => entry.sentenceName), [bi('考试 1', 'Exam 1'), bi('考试 2', 'Exam 2')]);
  assert.deepEqual(entries[1].name, bi('考试 2：62 分（平均数 40，标准差 12）', 'Exam 2: 62 (mean 40, SD 12)'), 'cards and table keep the full name');
  const text = comparisonText(compareValues(entries));
  assert.equal(text.exam.en, 'So, 62 (Exam 2) is the better performance, relative to its mean and its standard deviation.');
  assert.equal(text.exam.zh, '所以，相对于自己的平均数和标准差，62（考试 2）的表现更好。');
  assert.equal(text.conclusion.en, 'Relative to its own mean and standard deviation, 62 (Exam 2) is the highest: it has the largest z-score (z = 1.83).');
  assert.deepEqual(text.ways.map((way) => way.pick.en), ['67 (Exam 1)', '+22 (Exam 2)', 'z = 1.83 (Exam 2)']);
  // After the learner types another value the sentence still names the exam, never the old 62.
  // 学习者改了数值以后，句子仍然只写考试名称，不会出现旧的 62。
  const typed = comparisonText(compareValues(entries.map((entry, index) => ({ ...entry, value: index ? 70 : entry.value }))));
  assert.equal(typed.exam.en, 'So, 70 (Exam 2) is the better performance, relative to its mean and its standard deviation.');

  // A number after the colon that is not the entry's value, or no colon at all, keeps the whole name.
  // 冒号后的数不是该项的数值，或者根本没有冒号时，保留整个名称。
  const kept = normalizeZScoreConfig({
    compare: [
      { name: bi('', 'Section 2: 30 students'), mean: 70, sd: 8, value: 82 },
      { name: bi('', 'Store A: $82 (mean 70)'), mean: 70, sd: 8, value: 82 },
      { name: bi('', 'Test 620'), mean: 60, sd: 5, value: 62 },
      { name: bi('', 'Exam 3: 620'), mean: 600, sd: 50, value: 62 },
    ],
  }).entries.map((entry) => entry.sentenceName.en);
  assert.deepEqual(kept, ['Section 2: 30 students', 'Store A', 'Test 620', 'Exam 3: 620']);
});

test('the content-spec comparison: the raw values and the distances both pick 82, the z-scores pick 68', () => {
  const { entries } = normalizeZScoreConfig(SPEC_COMPARE);
  const result = compareValues(entries);
  assert.deepEqual([result.top, result.rawTop, result.deviationTop], [[1], [0], [0]]);
  const text = comparisonText(result, '%');
  assert.equal(text.chain, '1.60 > 1.50');
  assert.equal(text.ways[0].pick.en, '82% (Statistics)');
  assert.equal(text.ways[1].pick.zh, '+12%（统计）');
  assert.equal(text.ways[2].pick.en, 'z = 1.60 (Calculus)');
  assert.equal(text.exam.zh, '所以，相对于自己的平均数和标准差，68%（微积分）的表现更好。');
});

test('compareValues ranks ties together and comparisonText reports them', () => {
  const result = compareValues([
    { name: bi('甲', 'A'), mean: 50, sd: 10, value: 60 },
    { name: bi('乙', 'B'), mean: 20, sd: 5, value: 25 },
    { name: bi('丙', 'C'), mean: 0, sd: 1, value: 0.5 },
  ]);
  assert.deepEqual([result.top, result.ranks], [[0, 1], [1, 1, 3]]);
  const text = comparisonText(result);
  assert.equal(text.chain, '1.00 = 1.00 > 0.50');
  assert.equal(text.conclusion.en,
    '60 (A) and 25 (B) have the same z-score (z = 1.00): relative to their own means and standard deviations, they are equally high.');
  assert.equal(text.conclusion.zh, '60（甲）和25（乙）的 z 分数相同（z = 1.00）：相对于各自的平均数和标准差，它们一样高。');
  assert.equal(text.exam.en, 'So, they are equally good performances, relative to their own means and standard deviations.');
  assert.equal(text.ways[2].picks.length, 2);
});

test('comparisonText calls a way fair only when the distributions allow it', () => {
  const ways = (entries) => comparisonText(compareValues(entries)).ways;
  const same = ways([{ mean: 10, sd: 2, value: 13 }, { mean: 10, sd: 2, value: 11 }]);
  assert.deepEqual(same.map((way) => way.fair), [true, true, true]);
  assert.equal(same[0].reason.en, 'Fair here: every mean and every standard deviation is the same.');
  const sameSds = ways([{ mean: 10, sd: 2, value: 13 }, { mean: 20, sd: 2, value: 21 }]);
  assert.deepEqual(sameSds.map((way) => way.fair), [false, true, true]);
  assert.equal(sameSds[0].reason.en, 'Not fair: the means differ.');
  assert.equal(sameSds[1].reason.en, 'Fair here: every standard deviation is the same, so it ranks the values the way z does.');
  const sameMeans = ways([{ mean: 10, sd: 2, value: 13 }, { mean: 10, sd: 4, value: 15 }]);
  assert.deepEqual(sameMeans.map((way) => way.fair), [false, false, true]);
  assert.equal(sameMeans[0].reason.en, 'Not fair: the standard deviations differ.');
  assert.equal(sameMeans[1].reason.en, 'Not fair: it ignores that the standard deviations differ.');
});

test('comparisons print z with enough decimals to keep different scores apart', () => {
  const result = compareValues([{ mean: 0, sd: 3, value: 5.5 }, { mean: 0, sd: 6, value: 11.001 }]);
  assert.equal(result.zDigits, 3);
  assert.deepEqual(result.top, [1]);
  assert.equal(comparisonText(result).chain, '1.834 > 1.833');
});

test('comparison names fall back to the other language, and to letters when missing', () => {
  const result = compareValues([
    { name: { zh: '', en: 'Physics' }, mean: 0, sd: 1, value: 2 },
    { name: { zh: '化学', en: '' }, mean: 0, sd: 1, value: 1 },
  ]);
  const text = comparisonText(result);
  assert.equal(text.conclusion.zh, '相对于各自的平均数和标准差，2（Physics）的相对位置最高：它的 z 分数最大（z = 2.00）。');
  assert.equal(text.ways[0].pick.en, '2 (Physics)');
  const named = normalizeZScoreConfig({ compare: [{ mean: 0, sd: 1, value: 1 }, { mean: 0, sd: 1, value: 2 }] });
  assert.deepEqual(named.entries.map((entry) => entry.name.en), ['Distribution A', 'Distribution B']);
  assert.equal(comparisonText(compareValues(named.entries)).ways[2].pick.zh, 'z = 2.00（分布 B）');
  assert.deepEqual(compareValues(undefined).rows, []);
  assert.equal(comparisonText(compareValues([])).conclusion.en, 'These z-scores cannot be compared.');
});

/* ---------- Number line 数轴 ---------- */

test('the number line spans ȳ ± 3.5 s at least and stretches to ±6.5 s at most', () => {
  assert.deepEqual(AXIS_LIMITS, { min: 3.5, max: 6.5 });
  assert.equal(axisSpan([]), 3.5);
  assert.equal(axisSpan([2.98, -1.42]), 3.5);
  assert.equal(axisSpan([3]), 3.5);
  assert.equal(axisSpan([3.01]), 4.5);
  assert.equal(axisSpan([4.26]), 5.5);
  assert.equal(axisSpan([-5.9]), 6.5);
  assert.equal(axisSpan([34.9]), 6.5);
  assert.equal(axisSpan([NaN, 'x']), 3.5);
  assert.equal(axisSpan(null), 3.5);
});

test('axis ticks sit at ȳ + k·s, with the slide donut values 100.82 to 401.18', () => {
  const ticks = axisTicks(251, 50.06, 3.5);
  assert.deepEqual(ticks.map((tick) => tick.valueLabel), ['100.82', '150.88', '200.94', '251', '301.06', '351.12', '401.18']);
  assert.deepEqual(ticks.map((tick) => tick.zLabel), ['−3', '−2', '−1', '0', '1', '2', '3']);
  assert.equal(axisTicks(251, 50.06, 6.5).length, 13);

  const scale = axisScale(400, 3.5, 18);
  assert.deepEqual([scale.left, scale.right, scale.unit], [18, 382, 52]);
  assert.deepEqual([scale.x(-3.5), scale.x(0), scale.x(3.5)], [18, 200, 382]);
  assert.equal(axisScale(10, 3.5, 18).right, 19);
});

test('points beyond the line become arrows at its end; labels thin out and stay inside', () => {
  assert.deepEqual(placeOnAxis(2.98, 3.5), { z: 2.98, side: 0, visible: true });
  assert.deepEqual(placeOnAxis(34.9, 6.5), { z: 6.5, side: 1, visible: true });
  assert.deepEqual(placeOnAxis(-7, 6.5), { z: -6.5, side: -1, visible: true });
  assert.equal(placeOnAxis(NaN, 3.5).visible, false);

  assert.equal(labelStride(52, ['100.82', '0']), 1);
  assert.equal(labelStride(35, ['100.82']), 2);
  assert.equal(labelStride(10, ['551.36']), 6);
  assert.equal(labelStride(5, ['551.36']), 6);
  assert.equal(labelStride(40, []), 1);

  assert.equal(labelCenter(200, 17, 400), 200);
  assert.ok(Math.abs(labelCenter(395, 17, 400) - (400 - 4 - (17 * 7.4) / 2)) < 1e-9);
  assert.ok(Math.abs(labelCenter(0, 17, 400) - (4 + (17 * 7.4) / 2)) < 1e-9);
  assert.equal(labelCenter(10, 100, 300), 150);

  assert.equal(pointLabel(400, 251, 50.06), 'y = 400, z ≈ 2.98');
  assert.equal(pointLabel(67, 50, 10), 'y = 67, z = 1.70');
});

test('the number line and the live region have a text alternative in both languages', () => {
  assert.equal(numberLineDescription({ mean: 251, sd: 50.06, span: 3.5, values: [400, 180], unit: 'kcal' }),
    '数轴 Number line: ȳ = 251 kcal, s = 50.06 kcal; ticks from ȳ − 3s = 100.82 to ȳ + 3s = 401.18. '
      + 'y = 400 kcal, z ≈ 2.98; y = 180 kcal, z ≈ −1.42.');
  assert.equal(announcement(400, 251, 50.06, 'kcal'),
    'y = 400 kcal, z ≈ 2.98。400 kcal 比平均数高 2.98 个标准差。 A value of 400 kcal is 2.98 standard deviations above the mean.');
});

test('no sentence the widget shows contains an emoji', () => {
  const texts = [];
  const collect = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  for (const [y, mean, sd] of [[400, 251, 50.06], [180, 251, 50.06], [251, 251, 50.06], [17.8, 5.752941, 2.825236]]) {
    collect([zWorking(y, mean, sd), zSteps(y, mean, sd, 'kcal'), interpretZ(y, mean, sd, 'kcal'), zRule(zDetails(y, mean, sd).z)]);
    collect([reverseFromZ(-2, mean, sd), announcement(y, mean, sd), numberLineDescription({ mean, sd, span: 3.5, values: [y] })]);
  }
  collect(comparisonText(compareValues(EXAMS)));
  assert.ok(texts.length > 50);
  for (const text of texts) assert.ok(!EMOJI.test(text), text);
});
