import { test } from 'node:test';
import assert from 'node:assert/strict';

import { correlationStrength } from '../../../../engine/widgets/statistics/shared/stats-math.js';
import {
  DEFAULT_POINTS, FORMS, MAX_POINTS, MIN_POINTS, STRENGTH_SCALE, UNIT_FACTORS, analyzeScatter, appendPoint, associationWords,
  changeMessage, clampToView, correlationSteps, curvedPoints, describeAssociation, dragTarget, fitView, formatCoordinate,
  formatFactor, formatR, inputValue, normalizeFactor, normalizeScatterConfig, nudgePoint, outlierPosition, placeNewPoint,
  plotDescription, pointDescription, pointInsight, productSign, productTable, rText, reasonText, removePoint,
  replacePoint, scaleExtent, scalePoint, snapValue, strengthRows, unitComparison, unscaleX, viewContains,
} from '../../../../engine/widgets/statistics/scatter-correlation/scatter-correlation-logic.js';

// M5 p.37-43: % drug amount (x) and reaction time in seconds (y); r = 7 / √60 = 0.9037.
// 第 5 单元第 37-43 页：药物含量百分比 (x) 与反应时间（秒）(y)；r = 7 / √60 = 0.9037。
const DRUG = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 4]];
// M5 practice: 20 toddlers, minutes at the lunch table (x) and calories (y); r = −12.334 / 19 = −0.6492.
// 第 5 单元练习：20 名幼儿在午餐桌旁的分钟数 (x) 与卡路里 (y)；r = −12.334 / 19 = −0.6492。
const TODDLERS = [
  [21.4, 472], [22.8, 508], [28.6, 489], [29.2, 504], [30.6, 480], [30.8, 498], [31.3, 437], [32.8, 423],
  [32.9, 436], [33.0, 444], [33.5, 456], [33.9, 479], [34.1, 431], [35.1, 439], [37.7, 465], [39.5, 437],
  [42.4, 450], [43.1, 410], [43.7, 408], [43.8, 454],
];
// M5 practice correlation Q2: % of teenagers who used marijuana (x) and other drugs (y); Σ z_x z_y = 9.3410002.
// 第 5 单元相关练习 Q2：使用过大麻 (x) 与其他毒品 (y) 的青少年百分比；Σ z_x z_y = 9.3410002。
const MARIJUANA = [[5, 1], [6, 3], [7, 3], [17, 3], [19, 8], [22, 4], [23, 14], [34, 24], [37, 16], [40, 21], [53, 31]];
// A shapeless cloud with a weak negative r. 没有形状的点云，r 为弱负相关。
const CLOUD = [[1, 5], [2, 1], [3, 4], [4, 2], [5, 5], [6, 1]];
// M5 p.10: capacity (TB) and price ($) of 9 external disk drives on Amazon, early 2014; r = 0.988, yet the
// scatterplot bends upward. 第 5 单元第 10 页：9 个移动硬盘的容量（TB）与价格（美元）；r = 0.988，但散点图向上弯。
const DISKS = [[0.5, 59.99], [1, 79.99], [2, 111.97], [3, 109.99], [4, 149.99], [6, 423.34], [8, 596.11], [12, 1079.99], [32, 4461]];

const LABELS = {
  title: { zh: '幼儿午餐', en: 'Toddlers at lunch' },
  xLabel: { zh: '时间（分钟）', en: 'Time (in minutes)' },
  yLabel: { zh: '卡路里', en: 'Calories' },
};

// The pictographic ranges the content validator rejects (tools/validate_content.py, EMOJI).
// 内容校验器拒绝的图形符号范围（tools/validate_content.py 中的 EMOJI）。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const pairs = (points) => points.map(({ x, y }) => [x, y]);
const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

// Every string inside a value (objects and arrays are walked). 取出一个值里的所有字符串。
function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

// Deterministic pseudo-random numbers for the validator-limit configs. 为校验器上限测试生成确定的伪随机数。
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/* ---------- Config 配置 ---------- */

test('a missing or unusable config falls back to the M5 p.37 drug example with its own labels', () => {
  for (const config of [undefined, null, 'points', [], {}, { points: 'abc' }, { points: [[1, 2], [2, 3]] }]) {
    const model = normalizeScatterConfig(config);
    assert.equal(model.usesDefaultData, true);
    assert.deepEqual(pairs(model.points), DEFAULT_POINTS);
    assert.equal(model.xLabel.en, '% Drug Amount');
    assert.equal(model.yName.en, 'reaction time (in seconds)');
  }
  // A config whose points all share x (or y) cannot show r, so it uses the example too, labels included.
  // 所有点 x（或 y）都相同的配置无法显示 r，也改用例子，标签一起换掉。
  const sameX = normalizeScatterConfig({ ...LABELS, points: [[2, 1], [2, 5], [2, 3], [2, 4]] });
  assert.equal(sameX.usesDefaultData, true);
  assert.equal(sameX.title.en, 'Drug amount and reaction time: scatterplot and correlation r');
  assert.equal(normalizeScatterConfig({ points: [[1, 3], [2, 3], [3, 3], [4, 3]] }).usesDefaultData, true);
});

test('points may be pairs, objects or numeric strings; unusable points are dropped', () => {
  const model = normalizeScatterConfig({ points: [[1, 2], { x: 3, y: '4' }, ['5', 6], [7], ['a', 1], null, [true, 2], [8, 9]] });
  assert.equal(model.usesDefaultData, false);
  assert.deepEqual(pairs(model.points), [[1, 2], [3, 4], [5, 6], [8, 9]]);
  assert.deepEqual(model.title, { zh: '散点图和相关系数 r', en: 'Scatterplot and correlation r' });
  assert.deepEqual(model.xLabel, { zh: '解释变量 x', en: 'Explanatory variable x' });
  assert.deepEqual(model.xName, { zh: '解释变量 x', en: 'explanatory variable x' });
});

test('validator limits: 4-30 points come through unchanged, more are cut to 30, 3 is the widget minimum', () => {
  const four = [[1, 2], [2, 3], [3, 5], [4, 4]];
  assert.deepEqual(pairs(normalizeScatterConfig({ points: four }).points), four);
  const thirty = Array.from({ length: 30 }, (_, index) => [index, (index * 7) % 11]);
  assert.deepEqual(pairs(normalizeScatterConfig({ points: thirty }).points), thirty);
  const forty = Array.from({ length: 40 }, (_, index) => [index, (index * 7) % 11]);
  assert.deepEqual(pairs(normalizeScatterConfig({ points: forty }).points), forty.slice(0, MAX_POINTS));
  assert.equal(MAX_POINTS, 30);
  assert.equal(MIN_POINTS, 3);
  assert.equal(normalizeScatterConfig({ points: [[1, 2], [2, 3], [3, 5]] }).usesDefaultData, false);
  // Other keys the validator accepts for every statistics widget (quartiles) are simply ignored.
  // 校验器对所有统计组件都接受的其他键（如 quartiles）直接忽略。
  assert.deepEqual(pairs(normalizeScatterConfig({ points: four, quartiles: 'r7', unit: 'kg' }).points), four);
});

test('labels and sentence names: given names win, axis labels are lowered only at a normal capital', () => {
  const model = normalizeScatterConfig({ ...LABELS, points: TODDLERS });
  assert.deepEqual(model.title, LABELS.title);
  assert.deepEqual(model.xName, { zh: '时间（分钟）', en: 'time (in minutes)' });
  assert.deepEqual(model.yName, { zh: '卡路里', en: 'calories' });
  const acronym = normalizeScatterConfig({
    xLabel: { zh: '人类发展指数', en: 'HDI value' }, yLabel: { zh: '人均 GDP', en: 'GDP per capita' }, points: TODDLERS,
  });
  assert.equal(acronym.xName.en, 'HDI value');
  assert.equal(acronym.yName.en, 'GDP per capita');
  const named = normalizeScatterConfig({ ...LABELS, yName: { zh: '摄入的卡路里', en: 'the number of calories consumed' }, points: TODDLERS });
  assert.deepEqual(named.yName, { zh: '摄入的卡路里', en: 'the number of calories consumed' });
  // A one-sided name is completed from the label. 只有一种语言的名字用标签补齐。
  const half = normalizeScatterConfig({ ...LABELS, xName: { zh: '用餐时间' }, points: TODDLERS });
  assert.deepEqual(half.xName, { zh: '用餐时间', en: 'time (in minutes)' });
  const chineseOnly = normalizeScatterConfig({ xLabel: '身高', points: TODDLERS });
  assert.deepEqual(chineseOnly.xName, { zh: '身高', en: 'x' });
});

test('Title Case axis labels are lowered word by word, so a sentence never reads "reaction Time"', () => {
  // The axis titles of the R plot on M5 p.38, as the mod05 config writes them without xName or yName.
  // 第 5 单元第 38 页 R 图的坐标轴标题（mod05 的配置没有写 xName、yName）。
  const model = normalizeScatterConfig({
    xLabel: { zh: '血液中药物含量（%）', en: '% Drug Amount' },
    yLabel: { zh: '反应时间（秒）', en: 'Reaction Time (in seconds)' },
    points: DRUG,
  });
  assert.equal(model.xName.en, '% drug amount');
  assert.equal(model.yName.en, 'reaction time (in seconds)');
  assert.deepEqual(model.xLabel, { zh: '血液中药物含量（%）', en: '% Drug Amount' }, 'the axis keeps its title');
  const [first, second] = describeAssociation(analyzeScatter(model.points), model).sentences;
  assert.equal(first.en, 'There appears to be a strong positive linear association between reaction time (in seconds) and % drug amount.');
  assert.equal(second.en, 'As % drug amount increases, reaction time (in seconds) tends to increase.');
  const disks = normalizeScatterConfig({ xLabel: { en: 'Capacity (in TB)' }, yLabel: { en: 'Price (in $)' }, points: DISKS });
  assert.deepEqual([disks.xName.en, disks.yName.en], ['capacity (in TB)', 'price (in $)']);
  const sales = normalizeScatterConfig({ xLabel: { en: 'Number of sales people working' }, yLabel: { en: 'Sales (in $1000)' }, points: TODDLERS });
  assert.deepEqual([sales.xName.en, sales.yName.en], ['number of sales people working', 'sales (in $1000)']);
});

test('form: "curved" is the only other form; everything else, and the default example, is linear', () => {
  assert.deepEqual([...FORMS], ['linear', 'curved']);
  assert.equal(normalizeScatterConfig({ points: DISKS, form: 'curved' }).form, 'curved');
  for (const form of [undefined, 'linear', 'Curved', 'nonlinear', 1, null]) {
    assert.equal(normalizeScatterConfig({ points: DISKS, form }).form, 'linear', String(form));
  }
  assert.equal(normalizeScatterConfig({ form: 'curved' }).form, 'linear', 'the drug example brings its own form');
});

test('M5 p.10 and the 2025 midterm Q18: curved data get nonlinear sentences, not r\'s linear ones', () => {
  const model = normalizeScatterConfig({
    xLabel: { zh: '容量（TB）', en: 'Capacity (in TB)' }, yLabel: { zh: '价格（美元）', en: 'Price (in $)' }, points: DISKS, form: 'curved',
  });
  const analysis = analyzeScatter(model.points);
  assert.equal(formatR(analysis.r), '0.9876');
  const curved = describeAssociation(analysis, model);
  assert.equal(curved.kind, 'curved');
  assert.deepEqual(curved.sentences.map((sentence) => sentence.en), [
    'There appears to be a positive nonlinear (curved) relationship between price (in $) and capacity (in TB).',
    'As capacity (in TB) increases, price (in $) tends to increase in a curvilinear manner.',
    'r measures linear association only, so it should not be used to describe this relationship.',
  ]);
  assert.deepEqual(curved.sentences.map((sentence) => sentence.zh), [
    '价格（美元）和容量（TB）之间看起来有正向的非线性（弯曲）关系。',
    '容量（TB）越大，价格（美元）往往越大，但不是沿着一条直线变化。',
    'r 只衡量线性关系，所以不能用 r 来描述这种弯曲的关系。',
  ]);
  assert.ok(curved.sentences.every((sentence) => !/\blinear association between\b|strong/.test(sentence.en)));
  assert.match(curved.summary.en, /^r ≈ 0\.9876\. The scatterplot of these data bends, so the form is nonlinear/);
  // The same data without the flag keep the linear wording, as before. 不加标记的同一组数据仍用线性的说法。
  assert.equal(describeAssociation(analysis, { ...model, form: 'linear' }).kind, 'association');
  // A curved pattern whose r rounds to 0 (M5 p.32 panel f) has no direction to name.
  // r 四舍五入为 0 的弯曲图案（第 5 单元第 32 页图 f）没有方向可说。
  const arch = describeAssociation(analyzeScatter([[-2, 0], [-1, 3], [0, 4], [1, 3], [2, 0]]),
    { xName: { zh: '时间', en: 'time' }, yName: { zh: '分数', en: 'score' }, form: 'curved' });
  assert.deepEqual(arch.sentences.map((sentence) => sentence.en), [
    'There appears to be a nonlinear (curved) relationship between score and time.',
    'A low correlation does not necessarily imply that time and score are unrelated, only that they are not strongly linearly related.',
  ]);
  assert.equal(describeAssociation(analyzeScatter([[4, 2], [4, 3], [4, 1]]), { form: 'curved' }).kind, 'undefined');
});

test('every config inside the validator limits is read unchanged and gives finite steps and sentences', () => {
  const next = seeded(220);
  const configs = [{ points: [[0, 0], [0, 1], [1, 0], [1, 1]] }, { points: TODDLERS }, { points: MARIJUANA }];
  for (let trial = 0; trial < 40; trial += 1) {
    const count = 4 + (trial % 27);
    const points = Array.from({ length: count }, (_, index) => [
      Math.round((next() * 400 - 200) * 100) / 100,
      trial % 3 === 0 ? index * 2 + Math.round(next() * 10) : Math.round(next() * 1000) / 10,
    ]);
    configs.push({ ...LABELS, points, quartiles: 'hand' });
  }
  for (const config of configs) {
    const model = normalizeScatterConfig(config);
    assert.equal(model.usesDefaultData, false);
    assert.deepEqual(pairs(model.points), config.points);
    for (const factor of UNIT_FACTORS) {
      const analysis = analyzeScatter(model.points, factor);
      assert.equal(analysis.defined, true);
      assert.ok(analysis.r >= -1 && analysis.r <= 1);
      const texts = strings([
        correlationSteps(analysis, 1), productTable(analysis), describeAssociation(analysis, model),
        pointInsight(analysis, 0), unitComparison(model.points, factor, 2), strengthRows(analysis),
        changeMessage('move', { number: 1, point: analysis.points[0], before: analysis, after: analysis }),
        plotDescription(analysis, { xLabel: 'x', yLabel: 'y' }), pointDescription(analysis, 0),
      ]);
      for (const text of texts) {
        assert.ok(!/NaN|undefined|Infinity|null/.test(text), `bad text: ${text}`);
        assert.ok(!EMOJI.test(text), `emoji in: ${text}`);
      }
    }
  }
});

/* ---------- r and the analysis r 与分析结果 ---------- */

test('M5 p.40-43: the drug data give x̄ = 3, ȳ = 2 and r = 7 / √60 = 0.9037, strong and positive', () => {
  const analysis = analyzeScatter(DRUG);
  assert.deepEqual([analysis.n, analysis.xbar, analysis.ybar, analysis.sumX, analysis.sumY], [5, 3, 2, 15, 10]);
  assert.deepEqual([analysis.ssxx, analysis.ssyy, analysis.ssxy, analysis.covariance], [10, 6, 7, 1.75]);
  close(analysis.r, 7 / Math.sqrt(60), 1e-12);
  assert.equal(analysis.rShown, 0.9037);
  assert.equal(analysis.direction, 'positive');
  assert.equal(analysis.strength, 'strong');
  assert.equal(analysis.defined, true);
  assert.equal(analysis.reason, null);
  close(analysis.sumZx, 0);
  close(analysis.sumZy, 0);
  assert.equal(formatR(analysis.sumZProducts), '3.6148');
});

test('M5 practice: the toddlers give r = −0.6492 (moderate to strong, negative); the marijuana data 0.9341 (strong)', () => {
  const toddlers = analyzeScatter(TODDLERS);
  assert.equal(toddlers.rShown, -0.6492);
  assert.deepEqual([toddlers.direction, toddlers.strength], ['negative', 'moderate-to-strong']);
  assert.equal(toddlers.sumZProducts.toFixed(3), '-12.334');
  const marijuana = analyzeScatter(MARIJUANA);
  assert.equal(marijuana.rShown, 0.9341);
  assert.deepEqual([marijuana.direction, marijuana.strength], ['positive', 'strong']);
  assert.equal(marijuana.sumZProducts.toFixed(7), '9.3410002');
});

test('the words follow the printed r: |r| = 0.79998 prints as 0.8000 and is called strong', () => {
  // r of (1, 1), (2, 2), (3, t), (4, 4) falls from 1 towards 0.22 as t grows; find t with r = 0.79998.
  // (1, 1)、(2, 2)、(3, t)、(4, 4) 的 r 随 t 增大从 1 降向 0.22；用二分法找到 r = 0.79998 的 t。
  const rOf = (t) => analyzeScatter([[1, 1], [2, 2], [3, t], [4, 4]]).r;
  let low = 3;
  let high = 100;
  for (let step = 0; step < 200; step += 1) {
    const middle = (low + high) / 2;
    if (rOf(middle) > 0.79998) low = middle;
    else high = middle;
  }
  const analysis = analyzeScatter([[1, 1], [2, 2], [3, low], [4, 4]]);
  assert.ok(analysis.r < 0.8);
  assert.equal(correlationStrength(analysis.r), 'moderate-to-strong');
  assert.equal(analysis.rShown, 0.8);
  assert.equal(analysis.strength, 'strong');
  assert.equal(formatR(analysis.r), '0.8000');
});

test('r cannot be computed when every x or every y is the same, even with binary noise in the mean', () => {
  const sameX = analyzeScatter([[0.1, 1], [0.1, 2], [0.1, 3]]);
  assert.equal(sameX.defined, false);
  assert.equal(sameX.reason, 'same-x');
  assert.equal(sameX.sx, 0);
  assert.ok(Number.isNaN(sameX.r));
  assert.ok(sameX.rows.every((row) => Number.isNaN(row.zx) && Number.isNaN(row.zxzy)));
  assert.deepEqual(sameX.rows.map((row) => row.zy), [-1, 0, 1]);
  assert.equal(sameX.direction, null);
  const sameY = analyzeScatter([[1, 4], [2, 4], [3, 4]]);
  assert.equal(sameY.reason, 'same-y');
  assert.equal(sameY.sy, 0);
  assert.equal(analyzeScatter([[1, 4]]).reason, 'too-few');
  assert.match(reasonText(sameX).en, /s_x = 0/);
  assert.match(reasonText(sameY).zh, /s_y = 0/);
  assert.equal(reasonText(analyzeScatter(DRUG)), null);
});

test('values too large or too small for the sums of squares give no r instead of a wrong one', () => {
  for (const scale of [1e200, 1e-200]) {
    const analysis = analyzeScatter(DRUG.map(([x, y]) => [x * scale, y * scale]));
    assert.equal(analysis.defined, false);
    assert.equal(analysis.reason, 'out-of-range');
    assert.ok(analysis.rows.every((row) => Number.isNaN(row.zx) && Number.isNaN(row.zy)));
    assert.ok(Number.isNaN(analysis.sumZx));
    assert.match(reasonText(analysis).en, /too large or too small/);
  }
});

test('M5 p.24, p.27: multiplying x by a factor scales x̄, s_x and S_xy but keeps every z_x and r', () => {
  const base = analyzeScatter(DRUG);
  for (const factor of UNIT_FACTORS) {
    const scaled = analyzeScatter(DRUG, factor);
    assert.equal(scaled.factor, factor);
    close(scaled.r, base.r, 1e-12);
    assert.equal(scaled.rShown, base.rShown);
    close(scaled.xbar, base.xbar * factor, 1e-9);
    close(scaled.sx, base.sx * factor, 1e-9);
    close(scaled.covariance, base.covariance * factor, 1e-9);
    scaled.rows.forEach((row, index) => close(row.zx, base.rows[index].zx, 1e-12));
  }
  for (const bad of [0, -2, Number.NaN, '2.54', undefined]) assert.equal(analyzeScatter(DRUG, bad).factor, 1);
});

/* ---------- Steps and table 步骤与表格 ---------- */

test('M5 p.40-43: the worked steps of the drug data, number by number', () => {
  const steps = correlationSteps(analyzeScatter(DRUG));
  assert.deepEqual(steps.map((step) => step.key), ['means', 'sd', 'z', 'sum', 'r', 'check']);
  assert.deepEqual(steps.map((step) => step.lines), [
    ['x̄ = Σx / n = 15 / 5 = 3', 'ȳ = Σy / n = 10 / 5 = 2'],
    ['s_x = √(Σ(x − x̄)² / (n − 1)) = √(10 / 4) ≈ 1.5811', 's_y = √(Σ(y − ȳ)² / (n − 1)) = √(6 / 4) ≈ 1.2247'],
    [
      'z_x = (x − x̄) / s_x = (1 − 3) / 1.5811 ≈ −1.2649',
      'z_y = (y − ȳ) / s_y = (1 − 2) / 1.2247 ≈ −0.8165',
      'z_x · z_y = (−1.2649) × (−0.8165) ≈ 1.0328',
    ],
    ['Σ z_x z_y = 1.0328 + 0.5164 + 0 + 0 + 2.0656 ≈ 3.6148'],
    ['r = Σ z_x z_y / (n − 1) = 3.6148 / 4 ≈ 0.9037'],
    [
      'S_xy = Σ(x − x̄)(y − ȳ) / (n − 1) = 7 / 4 = 1.75',
      'r = S_xy / (s_x s_y) = SS_xy / √(SS_xx × SS_yy) = 7 / √(10 × 6) ≈ 0.9037',
    ],
  ]);
  assert.equal(steps[2].title.en, 'Step 3: each point\'s z-scores and their product (point 1 shown)');
});

test('step 3 writes out the chosen point; an index that does not exist shows point 1', () => {
  const analysis = analyzeScatter(DRUG);
  assert.deepEqual(correlationSteps(analysis, 2)[2].lines, [
    'z_x = (x − x̄) / s_x = (3 − 3) / 1.5811 = 0',
    'z_y = (y − ȳ) / s_y = (2 − 2) / 1.2247 = 0',
    'z_x · z_y = 0 × 0 = 0',
  ]);
  assert.match(correlationSteps(analysis, 4)[2].title.zh, /点 5/);
  assert.match(correlationSteps(analysis, 9)[2].title.zh, /点 1/);
  assert.match(correlationSteps(analysis, -1)[2].title.zh, /点 1/);
});

test('M5 practice: the toddler and marijuana steps end with −12.3342 / 19 and 9.3410 / 10', () => {
  const toddlers = correlationSteps(analyzeScatter(TODDLERS));
  assert.deepEqual(toddlers[0].lines, ['x̄ = Σx / n = 680.2 / 20 = 34.01', 'ȳ = Σy / n = 9120 / 20 = 456']);
  assert.equal(toddlers[1].lines[0], 's_x = √(Σ(x − x̄)² / (n − 1)) = √(758.058 / 19) ≈ 6.3165');
  assert.equal(toddlers[3].lines[0], 'Σ z_x z_y = (−1.0669) + (−3.0823) + (−0.944) + (−1.2208) + ⋯ + (−0.1035) ≈ −12.3342');
  assert.equal(toddlers[4].lines[0], 'r = Σ z_x z_y / (n − 1) = −12.3342 / 19 ≈ −0.6492');
  const marijuana = correlationSteps(analyzeScatter(MARIJUANA));
  assert.match(marijuana[3].lines[0], / ≈ 9\.3410$/);
  assert.equal(marijuana[4].lines[0], 'r = Σ z_x z_y / (n − 1) = 9.3410 / 10 ≈ 0.9341');
  assert.equal(productTable(analyzeScatter(MARIJUANA)).rLine, '9.3410 / 10 ≈ 0.9341');
});

test('when r cannot be computed the steps stop after the standard deviations with the reason', () => {
  const steps = correlationSteps(analyzeScatter([[4, 2], [4, 2], [4, 4]]));
  assert.deepEqual(steps.map((step) => step.key), ['means', 'sd', 'stop']);
  assert.equal(steps[1].lines[0], 's_x = √(Σ(x − x̄)² / (n − 1)) = √(0 / 2) = 0');
  assert.deepEqual(steps[2].lines, []);
  assert.match(steps[2].note.zh, /x 都一样/);
});

test('M5 p.43: the product table of the drug data, with Σ z_x = Σ z_y = 0 and the r line', () => {
  const table = productTable(analyzeScatter(DRUG));
  assert.deepEqual(table.rows.map((row) => [row.number, row.x, row.y, row.zx, row.zy, row.product, row.sign]), [
    [1, '1', '1', '−1.2649', '−0.8165', '1.0328', 'positive'],
    [2, '2', '1', '−0.6325', '−0.8165', '0.5164', 'positive'],
    [3, '3', '2', '0.0000', '0.0000', '0.0000', 'zero'],
    [4, '4', '2', '0.6325', '0.0000', '0.0000', 'zero'],
    [5, '5', '4', '1.2649', '1.6330', '2.0656', 'positive'],
  ]);
  assert.deepEqual(table.sums, { zx: '0.0000', zy: '0.0000', product: '3.6148' });
  assert.equal(table.rLine, '3.6148 / 4 ≈ 0.9037');
  const undefinedTable = productTable(analyzeScatter([[4, 2], [4, 3], [4, 4]]));
  assert.deepEqual(undefinedTable.rows.map((row) => [row.zx, row.product, row.sign]), [['—', '—', null], ['—', '—', null], ['—', '—', null]]);
  assert.equal(undefinedTable.sums.zy, '0.0000');
  assert.equal(undefinedTable.rLine, '—');
  assert.equal(productSign(-0.00004), 'zero');
  assert.equal(productSign(-0.0001), 'negative');
  assert.equal(productSign(Number.NaN), null);
});

/* ---------- Words and sentences 文字与句子 ---------- */

test('M5 p.32 strength scale: the current level is marked, and the words name direction and strength', () => {
  assert.deepEqual(STRENGTH_SCALE.map((item) => item.rule), ['|r| ≥ 0.8', '0.5 ≤ |r| < 0.8', '0.3 ≤ |r| < 0.5', '|r| < 0.3']);
  assert.deepEqual(STRENGTH_SCALE.map((item) => item.label.en), [
    'Strong correlations', 'Moderate to strong correlations', 'Moderate correlations', 'Weak correlations',
  ]);
  assert.deepEqual(strengthRows(analyzeScatter(DRUG)).map((row) => row.active), [true, false, false, false]);
  assert.deepEqual(strengthRows(analyzeScatter(TODDLERS)).map((row) => row.active), [false, true, false, false]);
  assert.deepEqual(strengthRows(analyzeScatter([[4, 2], [4, 3], [4, 1]])).map((row) => row.active), [false, false, false, false]);
  assert.deepEqual(associationWords(analyzeScatter(DRUG)), {
    direction: { zh: '正向', en: 'positive' }, strength: { zh: '强', en: 'strong' },
  });
  assert.deepEqual(associationWords(analyzeScatter(TODDLERS)).direction, { zh: '负向', en: 'negative' });
  assert.deepEqual(associationWords(analyzeScatter([[-2, 0], [-1, 3], [0, 4], [1, 3], [2, 0]])), {
    direction: { zh: '无方向', en: 'no direction' }, strength: { zh: '弱', en: 'weak' },
  });
  assert.deepEqual(associationWords(analyzeScatter([[4, 2], [4, 3], [4, 1]])), { direction: null, strength: null });
});

test('the drug example in the instructor\'s sentences (M5 p.39, p.44)', () => {
  const model = normalizeScatterConfig({});
  const description = describeAssociation(analyzeScatter(model.points), model);
  assert.equal(description.kind, 'association');
  assert.equal(description.summary.en, 'r ≈ 0.9037. Direction: positive (upward trend). Strength: |r| = 0.9037 and |r| ≥ 0.8, so it is strong (p.32).');
  assert.deepEqual(description.sentences.map((sentence) => sentence.en), [
    'There appears to be a strong positive linear association between reaction time (in seconds) and drug amount (in %).',
    'As drug amount (in %) increases, reaction time (in seconds) tends to increase.',
    'If drug amount (in %) is 1 standard deviation above its mean, reaction time (in seconds) is estimated to be 0.9037 standard deviation above its mean, on average.',
  ]);
  assert.deepEqual(description.sentences.map((sentence) => sentence.zh), [
    '反应时间（秒）和药物含量（%）之间看起来有强的正向线性关系。',
    '药物含量（%）越大，反应时间（秒）往往越大。',
    '如果药物含量（%）比它的平均数高 1 个标准差，那么反应时间（秒）平均估计比它的平均数高 0.9037 个标准差。',
  ]);
});

test('a negative association says "decrease" and "below", with |r| in the standard-deviation sentence', () => {
  const model = normalizeScatterConfig({ ...LABELS, points: TODDLERS });
  const description = describeAssociation(analyzeScatter(model.points), model);
  assert.match(description.summary.en, /\|r\| = 0\.6492 and 0\.5 ≤ \|r\| < 0\.8, so it is moderate to strong/);
  assert.deepEqual(description.sentences.map((sentence) => sentence.en), [
    'There appears to be a moderate to strong negative linear association between calories and time (in minutes).',
    'As time (in minutes) increases, calories tends to decrease.',
    'If time (in minutes) is 1 standard deviation above its mean, calories is estimated to be 0.6492 standard deviation below its mean, on average.',
  ]);
  assert.match(description.sentences[2].zh, /低 0\.6492 个标准差/);
});

test('r rounding to 0 means no linear association, with the M5 p.50 warning; an undefined r has no sentences', () => {
  const names = { xName: { zh: '时间', en: 'time' }, yName: { zh: '分数', en: 'score' } };
  const none = describeAssociation(analyzeScatter([[-2, 0], [-1, 3], [0, 4], [1, 3], [2, 0]]), names);
  assert.equal(none.kind, 'none');
  assert.deepEqual(none.sentences.map((sentence) => sentence.en), [
    'There appears to be no linear association between score and time.',
    'A low correlation does not necessarily imply that time and score are unrelated, only that they are not strongly linearly related.',
  ]);
  const missing = describeAssociation(analyzeScatter([[4, 2], [4, 3], [4, 1]]), names);
  assert.equal(missing.kind, 'undefined');
  assert.deepEqual(missing.sentences, []);
  assert.match(missing.summary.en, /Every x value is the same/);
  assert.equal(describeAssociation(analyzeScatter(DRUG)).sentences[1].en, 'As x increases, y tends to increase.');
});

test('M5 p.42: the selected point\'s product and where it lies around (x̄, ȳ)', () => {
  const drug = analyzeScatter(DRUG);
  const first = pointInsight(drug, 0);
  assert.equal(first.values, 'z_x ≈ −1.2649, z_y ≈ −0.8165, z_x · z_y ≈ 1.0328');
  assert.deepEqual([first.sign, first.quadrant], ['positive', 'lower-left']);
  assert.match(first.text.en, /below and to the left of \(x̄, ȳ\)/);
  assert.match(first.text.zh, /左下方/);
  const middle = pointInsight(drug, 2);
  assert.deepEqual([middle.sign, middle.quadrant], ['zero', null]);
  assert.match(middle.text.en, /adds nothing/);
  const toddler = pointInsight(analyzeScatter(TODDLERS), 0);
  assert.deepEqual([toddler.sign, toddler.quadrant], ['negative', 'upper-left']);
  assert.match(toddler.text.en, /opposite signs/);
  assert.equal(pointInsight(drug, 5), null);
  assert.match(pointInsight(analyzeScatter([[4, 2], [4, 3], [4, 1]]), 0).text.en, /s_x = 0/);
});

test('M5 p.27-28 change of units: x̄, s_x and S_xy are multiplied by 2.54, z_x and r stay', () => {
  const comparison = unitComparison(DRUG, 2.54, 0);
  assert.equal(comparison.factor, 2.54);
  assert.deepEqual(comparison.rows.map((row) => [row.key, row.original, row.converted, row.changed]), [
    ['xbar', '3', '7.62', true],
    ['sx', '1.5811', '4.0161', true],
    ['covariance', '1.75', '4.445', true],
    ['zx', '−1.2649', '−1.2649', false],
    ['r', '0.9037', '0.9037', false],
  ]);
  assert.match(comparison.text.en, /multiplied by 2\.54 too, but every z_x stays the same, so r is still 0\.9037/);
  const same = unitComparison(DRUG, 1);
  assert.ok(same.rows.every((row) => !row.changed));
  assert.match(same.text.en, /Pick a factor k/);
  assert.equal(unitComparison(DRUG, 7).factor, 1);
  assert.match(unitComparison(DRUG, 60, 4).rows[3].name.en, /point 5/);
});

test('normalizeFactor accepts only the offered factors, also as select strings', () => {
  assert.deepEqual(UNIT_FACTORS, [1, 2.54, 10, 0.1, 60]);
  assert.equal(normalizeFactor('2.54'), 2.54);
  assert.equal(normalizeFactor(60), 60);
  assert.equal(normalizeFactor('0.1'), 0.1);
  for (const bad of [3, '3', 'abc', '', null, undefined, -1, Number.NaN]) assert.equal(normalizeFactor(bad), 1);
});

test('status messages name the point, the change of r and, when needed, why r is missing', () => {
  const before = analyzeScatter(DRUG);
  const after = analyzeScatter([...DRUG, [7, 1]]);
  assert.deepEqual(changeMessage('move', { number: 5, point: { x: 5, y: 3.5 }, before, after }), {
    zh: '点 5 移到 (5, 3.5)。r：0.9037 → 0.2904。',
    en: 'Point 5 moved to (5, 3.5). r: 0.9037 → 0.2904.',
  });
  assert.match(changeMessage('outlier', { number: 6, point: { x: 7, y: 1 }, before, after }).en, /r: 0\.9037 → 0\.2904\. One extreme point changed r a lot/);
  assert.match(changeMessage('units', { factor: 2.54, after: before }).en, /multiplied by 2\.54: x̄, s_x and S_xy change, but r ≈ 0\.9037, unchanged/);
  assert.match(changeMessage('units', { factor: 1, after: before }).zh, /回到原来的单位/);
  assert.match(changeMessage('curve', { after: analyzeScatter(curvedPoints(fitView(DRUG))) }).en, /but r = 0\.0000/);
  assert.match(changeMessage('reset', { after: before }).en, /r ≈ 0\.9037/);
  assert.match(changeMessage('min').en, /At least 3 points/);
  assert.match(changeMessage('max').zh, /最多 30 个点/);
  assert.match(changeMessage('edge', { number: 2 }).en, /Point 2 is already at the edge/);
  assert.equal(changeMessage('invalid').en, 'Please enter a number.');
  const broken = changeMessage('move', { number: 1, point: { x: 4, y: 1 }, before, after: analyzeScatter([[4, 2], [4, 3], [4, 1]]) });
  assert.match(broken.en, /^Point 1 moved to \(4, 1\)\. r: 0\.9037 → —\. Every x value is the same, so s_x = 0\./);
  assert.match(broken.zh, /r：0\.9037 → —。所有点的 x 都一样/);
});

test('text alternatives of a point and of the whole plot', () => {
  const analysis = analyzeScatter(DRUG);
  assert.equal(pointDescription(analysis, 0), '点 1 Point 1: x = 1, y = 1; z 分数乘积 z-score product ≈ 1.0328');
  assert.equal(pointDescription(analysis, 7), '');
  assert.equal(
    plotDescription(analysis, { xLabel: 'x', yLabel: 'y' }),
    '散点图 Scatterplot: 5 个点 points, r ≈ 0.9037 (强 strong, 正向 positive). x: x; y: y.',
  );
  assert.match(plotDescription(analyzeScatter([[4, 2], [4, 3], [4, 1]])), /r = —/);
});

test('number helpers: r text, coordinates, factors and input values with an ASCII minus sign', () => {
  assert.equal(rText(analyzeScatter(DRUG)), 'r ≈ 0.9037');
  assert.equal(rText(analyzeScatter([[1, 2], [2, 4], [3, 6]])), 'r = 1.0000');
  assert.equal(rText(analyzeScatter([[4, 2], [4, 3], [4, 1]])), 'r = —');
  assert.equal(formatR(-0.64921), '−0.6492');
  assert.equal(formatR(Number.NaN), '—');
  assert.equal(formatCoordinate(12.700000000000001), '12.7');
  assert.equal(formatCoordinate(-3), '−3');
  assert.equal(formatFactor(2.54), '2.54');
  assert.equal(inputValue(-3), '-3');
  assert.equal(inputValue(7.620000000000001), '7.62');
  assert.equal(inputValue(Number.NaN), '');
  assert.deepEqual(scalePoint({ x: 3, y: 2 }, 2.54), { x: 7.62, y: 2 });
  assert.equal(unscaleX(7.62, 2.54), 3);
  assert.equal(unscaleX(2.54e-12, 2.54), 1e-12);
  assert.equal(unscaleX(21.43, 1), 21.43);
  assert.equal(unscaleX(5, 0), 5);
});

/* ---------- View and editing 绘图窗口与编辑 ---------- */

test('fitView gives round axes with room around the data and a snap grid of a tenth of a tick', () => {
  const drug = fitView(DRUG);
  assert.deepEqual([drug.x.min, drug.x.max, drug.x.step], [0, 6, 1]);
  assert.deepEqual([drug.y.min, drug.y.max, drug.y.step], [0.5, 4.5, 0.5]);
  assert.deepEqual(drug.snap, { x: 0.1, y: 0.05 });
  const toddlers = fitView(TODDLERS);
  assert.deepEqual([toddlers.x.min, toddlers.x.max, toddlers.y.min, toddlers.y.max], [15, 50, 380, 520]);
  assert.deepEqual(toddlers.snap, { x: 0.5, y: 2 });
  assert.equal(viewContains(drug, DRUG), true);
  assert.equal(viewContains(drug, [...DRUG, [7, 1]]), false);
  assert.equal(viewContains(drug, [[0, 4.5]]), true);
});

test('scaleExtent multiplies the tick numbers only, so the grid and the picture stay the same', () => {
  const { x } = fitView(DRUG);
  assert.deepEqual(scaleExtent(x, 2.54), { min: 0, max: 15.24, step: 2.54, ticks: [0, 2.54, 5.08, 7.62, 10.16, 12.7, 15.24] });
  assert.deepEqual(scaleExtent(x, 0.1).ticks, [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  assert.deepEqual(scaleExtent(x, 60).ticks, [0, 60, 120, 180, 240, 300, 360]);
  assert.deepEqual(scaleExtent(x, -1), x);
  assert.deepEqual(scaleExtent(fitView(TODDLERS).x, 2.54).ticks.slice(0, 3), [38.1, 50.8, 63.5]);
});

test('dragging snaps to the grid and stays inside the view; arrow keys move one step or one tick', () => {
  const view = fitView(DRUG);
  assert.equal(snapValue(2.37, 0.05), 2.35);
  assert.equal(snapValue(21.43, 0.5), 21.5);
  assert.equal(snapValue(4, 0), 4);
  assert.deepEqual(dragTarget({ x: 3.04, y: 2.226 }, view), { x: 3, y: 2.25 });
  assert.deepEqual(dragTarget({ x: 9.3, y: -1 }, view), { x: 6, y: 0.5 });
  assert.deepEqual(clampToView({ x: -2, y: 9 }, view), { x: 0, y: 4.5 });
  assert.deepEqual(nudgePoint({ x: 3, y: 2 }, 'ArrowRight', view), { x: 3.1, y: 2 });
  assert.deepEqual(nudgePoint({ x: 3, y: 2 }, 'ArrowUp', view), { x: 3, y: 2.05 });
  assert.deepEqual(nudgePoint({ x: 3, y: 2 }, 'ArrowLeft', view, { large: true }), { x: 2, y: 2 });
  assert.deepEqual(nudgePoint({ x: 3, y: 2 }, 'ArrowDown', view, { large: true }), { x: 3, y: 1.5 });
  assert.deepEqual(nudgePoint({ x: 6, y: 4.5 }, 'ArrowRight', view), { x: 6, y: 4.5 });
  assert.equal(nudgePoint({ x: 3, y: 2 }, 'Enter', view), null);
  // A point between grid lines keeps its own decimals: 21.4 + 0.5 = 21.9.
  // 不在网格上的点保留自己的小数位：21.4 + 0.5 = 21.9。
  assert.deepEqual(nudgePoint({ x: 21.4, y: 472 }, 'ArrowRight', fitView(TODDLERS)), { x: 21.9, y: 472 });
});

test('a new point goes to the centre of the view, or to the nearest free spot, never on top of another', () => {
  const view = fitView(DRUG);
  assert.deepEqual(placeNewPoint(DRUG, view), { x: 3, y: 2.5 });
  assert.deepEqual(placeNewPoint([...DRUG, [3, 2.5]], view), { x: 3, y: 2.75 });
  let points = DRUG.map(([x, y]) => ({ x, y }));
  while (points.length < MAX_POINTS) points = appendPoint(points, placeNewPoint(points, view));
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, MAX_POINTS);
  assert.equal(viewContains(view, points), true);
});

test('M5 p.28 outlier: against a moderate or stronger trend r drops; in a weak cloud it creates a trend', () => {
  const drugView = fitView(DRUG);
  const drugOutlier = outlierPosition(DRUG, drugView);
  assert.deepEqual(drugOutlier, { x: 7, y: 1 });
  assert.equal(analyzeScatter([...DRUG, [7, 1]]).rShown, 0.2904);
  const toddlerOutlier = outlierPosition(TODDLERS, fitView(TODDLERS));
  assert.deepEqual(toddlerOutlier, { x: 55, y: 508 });
  assert.ok(Math.abs(analyzeScatter([...TODDLERS, [55, 508]]).r) < 0.3);
  const cloud = analyzeScatter(CLOUD);
  assert.equal(cloud.strength, 'weak');
  const cloudOutlier = outlierPosition(CLOUD, fitView(CLOUD));
  assert.deepEqual(cloudOutlier, { x: 8.5, y: 7 });
  assert.ok(analyzeScatter([...CLOUD, [8.5, 7]]).r > 0.3);
});

test('M5 p.32 panel f: the curved pattern is an upside-down U whose r is 0', () => {
  const view = fitView(DRUG);
  const curve = curvedPoints(view);
  assert.equal(curve.length, 9);
  assert.equal(viewContains(view, curve), true);
  curve.forEach((point, index) => {
    const mirror = curve[curve.length - 1 - index];
    close(point.x + mirror.x, 6, 1e-9);
    assert.equal(point.y, mirror.y);
  });
  assert.equal(Math.max(...curve.map((point) => point.y)), curve[4].y);
  assert.ok(curve[0].y < curve[2].y && curve[2].y < curve[4].y);
  const analysis = analyzeScatter(curve);
  assert.equal(analysis.rShown, 0);
  assert.equal(analysis.direction, 'none');
  assert.equal(describeAssociation(analysis).kind, 'none');
});

test('editing helpers never change their input and respect the 3-30 point limits', () => {
  const points = DRUG.map(([x, y]) => ({ x, y }));
  const copy = JSON.stringify(points);
  assert.deepEqual(replacePoint(points, 1, { x: 9, y: 9 })[1], { x: 9, y: 9 });
  assert.equal(removePoint(points, 0).length, 4);
  assert.equal(appendPoint(points, { x: 6, y: 5 }).length, 6);
  assert.equal(JSON.stringify(points), copy);
  const three = points.slice(0, MIN_POINTS);
  assert.equal(removePoint(three, 0), three);
  assert.equal(removePoint(points, 9), points);
  assert.equal(removePoint(points, 1.5), points);
  const full = Array.from({ length: MAX_POINTS }, (_, index) => ({ x: index, y: index % 4 }));
  assert.equal(appendPoint(full, { x: 1, y: 1 }), full);
});
