import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatFixed } from '../../../../engine/widgets/machine-learning/shared/ml-math.js';
import {
  MAX_BINS,
  boxplotStats,
  cellFraction,
  classifyOutliers,
  contingency,
  correlation,
  correlationDirection,
  correlationStrength,
  defaultBinWidth,
  defaultLeafUnit,
  deviationTable,
  fences,
  finiteNumbers,
  finitePoints,
  fiveNumberSummary,
  frequencyTable,
  iqr,
  leastSquares,
  lineFromSummary,
  marginalFraction,
  mean,
  median,
  medianInfo,
  modes,
  observationFromZ,
  outlierLevel,
  predict,
  quantileR7,
  quartiles,
  range,
  residual,
  residualTable,
  sampleSd,
  sampleVariance,
  sortAscending,
  stemAndLeaf,
  sum,
  valueCounts,
  whiskerEnds,
  zScore,
} from '../../../../engine/widgets/statistics/shared/stats-math.js';

// M3 p.5: calories of the 30 Tim Hortons donuts (2014), in ID order as R prints them.
// 第 3 单元第 5 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 R 打印的 ID 顺序。
const DONUTS = [
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
];
// M4 p.22-24: calories by type of donut; the course notes rebuilt these values from R's favstats output.
// 第 4 单元第 22-24 页：按甜甜圈类型分组的热量；课程笔记根据 R 的 favstats 输出还原了这些数值。
const CAKE = [210, 220, 250, 250, 270, 270, 270, 280, 280, 300, 340];
const FILLED = [200, 200, 210, 220, 230, 230, 250, 270, 270, 400];
const YEAST = [180, 190, 190, 190, 210, 250, 290, 300];
// M4 p.27-32: the small data set used for shifting, rescaling and z-scores.
// 第 4 单元第 27-32 页：用于平移、缩放和 z 分数的小数据集。
const ORIGINAL = [5, 10, 15, 20, 25];
// M5 p.37-43: % drug amount (x) and reaction time in seconds (y).
// 第 5 单元第 37-43 页：药物含量百分比 (x) 与反应时间（秒）(y)。
const DRUG = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 4]];
// M5 practice: 20 toddlers, minutes at the lunch table (x) and calories (y). The notes read these points from the
// scatterplot; they reproduce the printed b0 = 560.65126 and b1 = −3.0770733 to every digit.
// 第 5 单元练习：20 名幼儿在午餐桌旁的分钟数 (x) 与摄入热量 (y)。笔记从散点图读出这些点，它们与印出的系数每一位都一致。
const TODDLERS = [
  [21.4, 472], [22.8, 508], [28.6, 489], [29.2, 504], [30.6, 480], [30.8, 498], [31.3, 437], [32.8, 423],
  [32.9, 436], [33.0, 444], [33.5, 456], [33.9, 479], [34.1, 431], [35.1, 439], [37.7, 465], [39.5, 437],
  [42.4, 450], [43.1, 410], [43.7, 408], [43.8, 454],
];
// M5 practice correlation Q2: % of teenagers who used marijuana (x) and other drugs (y), n = 11.
// 第 5 单元相关练习 Q2：使用过大麻 (x) 与其他毒品 (y) 的青少年百分比，n = 11。
const MARIJUANA = [[5, 1], [6, 3], [7, 3], [17, 3], [19, 8], [22, 4], [23, 14], [34, 24], [37, 16], [40, 21], [53, 31]];
// Midterm 2025 Q1-Q6: member of an environmental group (rows Yes, No) by willing to pay higher prices (columns Yes, No).
// 2025 年期中考试 Q1-Q6：是否为环保团体成员（行：是、否）与是否愿意付更高价格（列：是、否）。
const GSS = [[30, 66], [88, 933]];
// M2 p.21: Titanic survival status (rows Alive, Dead) by ticket class (columns First, Second, Third, Crew).
// 第 2 单元第 21 页：泰坦尼克号生还情况（行：生还、死亡）与船票等级（列：头等、二等、三等、船员）。
const TITANIC = [[203, 118, 178, 212], [122, 167, 528, 673]];

const close = (actual, expected, epsilon = 1e-9) => assert.ok(
  Math.abs(actual - expected) <= epsilon,
  `${actual} != ${expected}`,
);
const lineText = (line) => `${line.negative ? '-' : ''}${line.stem} | ${line.leaves.join('')}`;

/* ---------- Cleaning 清理数据 ---------- */

test('finiteNumbers keeps numbers and numeric strings in order and skips everything else', () => {
  assert.deepEqual(finiteNumbers([3, '2.5', ' 7 ', '', 'x', null, undefined, NaN, Infinity, [1], -4]), [3, 2.5, 7, -4]);
  assert.deepEqual(finiteNumbers('180, 190'), []);
  assert.deepEqual(finiteNumbers(null), []);
});

test('finitePoints accepts [x, y] pairs and { x, y } objects and drops incomplete points', () => {
  assert.deepEqual(
    finitePoints([[1, 2], { x: 3, y: '4' }, [5], { x: 6 }, ['a', 1], null, 7]),
    [{ x: 1, y: 2 }, { x: 3, y: 4 }],
  );
  assert.deepEqual(finitePoints(undefined), []);
});

/* ---------- Centre 集中趋势 ---------- */

test('M3 p.30: the mean calories is 7530 / 30 = 251', () => {
  assert.equal(sum(DONUTS), 7530);
  assert.equal(mean(DONUTS), 251);
  assert.equal(mean(['2', 3, 'x', 7]), 4);
  assert.ok(Number.isNaN(mean([])));
  assert.equal(sum([]), 0);
});

test('M3 p.32-33: an even n averages the 15th and 16th ordered values at rank 0.5 × (n + 1) = 15.5', () => {
  const info = medianInfo(DONUTS);
  assert.equal(info.n, 30);
  assert.equal(info.rank, 15.5);
  assert.deepEqual(info.positions, [15, 16]);
  assert.deepEqual(info.middle, [250, 250]);
  assert.equal(info.value, 250);
  assert.equal(info.sorted[0], 180);
  assert.equal(info.sorted[29], 400);

  const even = medianInfo([4, 1, 3, 2]);
  assert.deepEqual([even.rank, even.positions, even.middle, even.value], [2.5, [2, 3], [2, 3], 2.5]);
});

test('M3 p.32: an odd n takes the single middle value at rank (n + 1) / 2', () => {
  const odd = medianInfo([9, 1, 5, 3, 7]);
  assert.deepEqual([odd.rank, odd.positions, odd.middle, odd.value], [3, [3], [5], 5]);
  const single = medianInfo([42]);
  assert.deepEqual([single.rank, single.positions, single.value], [1, [1], 42]);
  assert.equal(median(CAKE), 270);
  assert.equal(median(FILLED), 230);
  assert.equal(median(YEAST), 200);
  const empty = medianInfo([]);
  assert.ok(Number.isNaN(empty.value) && Number.isNaN(empty.rank));
  assert.deepEqual(empty.positions, []);
});

test('sortAscending returns a new sorted array and leaves the input alone', () => {
  const data = [3, 1, 2];
  assert.deepEqual(sortAscending(data), [1, 2, 3]);
  assert.deepEqual(data, [3, 1, 2]);
});

test('M3 p.37: the mode is 270 (5 of 30 donuts); ties give several modes and unique values give none', () => {
  assert.deepEqual(modes(DONUTS), { values: [270], count: 5 });
  assert.deepEqual(modes([17, 8, 10, 8, 17, 10, 3]), { values: [8, 10, 17], count: 2 });
  assert.deepEqual(modes([1, 2, 3]), { values: [], count: 1 });
  assert.deepEqual(modes([]), { values: [], count: 0 });
});

test('valueCounts is R\'s table() of the calories (M3 notes p.5)', () => {
  const counts = valueCounts(DONUTS);
  assert.deepEqual(counts.map((item) => item.value), [180, 190, 200, 210, 220, 230, 250, 270, 280, 290, 300, 310, 340, 400]);
  assert.deepEqual(counts.map((item) => item.count), [1, 3, 2, 3, 2, 2, 4, 5, 2, 1, 2, 1, 1, 1]);
});

/* ---------- Quartiles 四分位数 ---------- */

test('M4 p.6 by hand: Q1 is the 8th of the first 15 values (210), Q3 the 8th of the last 15 (280)', () => {
  const q = quartiles(DONUTS, 'hand');
  assert.equal(q.method, 'hand');
  assert.deepEqual([q.q1, q.median, q.q3, q.iqr], [210, 250, 280, 70]);
  assert.deepEqual(q.positions, { q1: [8], median: [15, 16], q3: [23] });
  assert.equal(q.medianRank, 15.5);
  assert.equal(q.medianExcluded, false);
  assert.equal(q.ranks, null);
  assert.deepEqual([q.lowerHalf.from, q.lowerHalf.to, q.lowerHalf.rank, q.lowerHalf.positions], [1, 15, 8, [8]]);
  assert.deepEqual([q.upperHalf.from, q.upperHalf.to, q.upperHalf.rank, q.upperHalf.positions], [16, 30, 8, [8]]);
  assert.equal(q.lowerHalf.values.length, 15);
  assert.equal(q.upperHalf.values[7], 280);
});

test('M4 p.6 in R: summary() gives Q1 = 210 and Q3 = 277.5 (type 7, h = (n − 1)p + 1)', () => {
  const q = quartiles(DONUTS, 'r7');
  assert.equal(q.method, 'r7');
  assert.deepEqual([q.q1, q.median, q.q3, q.iqr], [210, 250, 277.5, 67.5]);
  assert.deepEqual(q.ranks, { q1: 8.25, q3: 22.75 });
  assert.deepEqual(q.positions, { q1: [8, 9], median: [15, 16], q3: [22, 23] });
  assert.equal(q.lowerHalf, null);
  assert.equal(q.upperHalf, null);
  assert.equal(q.medianExcluded, false);
});

test('R\'s quantile(1:10) gives 3.25 and 7.75; the hand method gives 3 and 8', () => {
  const oneToTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(quantileR7(oneToTen, 0.25), { value: 3.25, rank: 3.25, positions: [3, 4] });
  assert.deepEqual(quantileR7(oneToTen, 0.75), { value: 7.75, rank: 7.75, positions: [7, 8] });
  assert.equal(quantileR7(oneToTen, 0).value, 1);
  assert.equal(quantileR7(oneToTen, 0.5).value, 5.5);
  assert.equal(quantileR7(oneToTen, 1).value, 10);
  assert.equal(quantileR7(oneToTen, '0.9').value, 9.1);
  assert.ok(Number.isNaN(quantileR7(oneToTen, 1.5).value));
  assert.ok(Number.isNaN(quantileR7([], 0.5).value));
  const r7 = quartiles(oneToTen, 'r7');
  assert.deepEqual([r7.q1, r7.median, r7.q3], [3.25, 5.5, 7.75]);
  const hand = quartiles(oneToTen, 'hand');
  assert.deepEqual([hand.q1, hand.median, hand.q3], [3, 5.5, 8]);
  assert.deepEqual(hand.positions, { q1: [3], median: [5, 6], q3: [8] });
});

test('odd n by hand: the median is left out of both halves', () => {
  const hand = quartiles([9, 8, 7, 6, 5, 4, 3, 2, 1], 'hand');
  assert.equal(hand.medianExcluded, true);
  assert.deepEqual(hand.lowerHalf.values, [1, 2, 3, 4]);
  assert.deepEqual(hand.upperHalf.values, [6, 7, 8, 9]);
  assert.deepEqual([hand.upperHalf.from, hand.upperHalf.to], [6, 9]);
  assert.deepEqual([hand.q1, hand.median, hand.q3], [2.5, 5, 7.5]);
  assert.deepEqual(hand.positions, { q1: [2, 3], median: [5], q3: [7, 8] });
  const r7 = quartiles([9, 8, 7, 6, 5, 4, 3, 2, 1], 'r7');
  assert.deepEqual([r7.q1, r7.q3], [3, 7]);

  // M4 p.27: favstats(original.data) prints Q1 = 10 and Q3 = 20; by hand the halves are 5, 10 and 20, 25.
  // 第 4 单元第 27 页：favstats 打印 Q1 = 10、Q3 = 20；手算时两半是 5、10 和 20、25。
  assert.deepEqual([quartiles(ORIGINAL, 'r7').q1, quartiles(ORIGINAL, 'r7').q3], [10, 20]);
  assert.deepEqual([quartiles(ORIGINAL).q1, quartiles(ORIGINAL).q3], [7.5, 22.5]);

  // Cake (n = 11): both methods give the box 250 to 280 of M4 p.24.
  // 蛋糕类（n = 11）：两种方法都得到第 4 单元第 24 页的箱子 250 到 280。
  const cake = quartiles(CAKE);
  assert.deepEqual([cake.q1, cake.median, cake.q3], [250, 270, 280]);
  assert.deepEqual([quartiles(CAKE, 'r7').q1, quartiles(CAKE, 'r7').q3], [250, 280]);
});

test('M4 p.23-24: hand quartiles reproduce the slide boxes, R quartiles reproduce favstats', () => {
  assert.deepEqual([quartiles(FILLED).q1, quartiles(FILLED).q3], [210, 270]);
  assert.deepEqual([quartiles(FILLED, 'r7').q1, quartiles(FILLED, 'r7').q3], [212.5, 265]);
  assert.deepEqual([quartiles(YEAST).q1, quartiles(YEAST).q3], [190, 270]);
  assert.deepEqual([quartiles(YEAST, 'r7').q1, quartiles(YEAST, 'r7').q3], [190, 260]);
  assert.equal(iqr(YEAST, 'r7'), 70);
  assert.equal(iqr(FILLED, 'r7'), 52.5);
  assert.equal(iqr(CAKE, 'r7'), 30);
});

test('tiny data sets: one value is its own quartiles, two and three values split cleanly, none gives NaN', () => {
  const one = quartiles([7]);
  assert.deepEqual([one.q1, one.median, one.q3, one.iqr], [7, 7, 7, 0]);
  assert.deepEqual(one.positions, { q1: [1], median: [1], q3: [1] });
  assert.deepEqual(one.lowerHalf.values, []);
  assert.ok(Number.isNaN(one.lowerHalf.from));
  assert.deepEqual([quartiles([7], 'r7').q1, quartiles([7], 'r7').q3], [7, 7]);

  const two = quartiles([9, 3]);
  assert.deepEqual([two.q1, two.median, two.q3], [3, 6, 9]);
  const three = quartiles([12, 3, 9]);
  assert.deepEqual([three.q1, three.median, three.q3], [3, 9, 12]);
  assert.deepEqual(three.positions, { q1: [1], median: [2], q3: [3] });

  const none = quartiles([]);
  assert.ok([none.q1, none.median, none.q3, none.iqr].every(Number.isNaN));
  assert.equal(quartiles(DONUTS, 'unknown').method, 'hand');
});

test('M4 p.7-8: five-number summary min = 180, Q1 = 210, median = 250, Q3 = 280, max = 400; range 220 (M3 p.44)', () => {
  assert.deepEqual(fiveNumberSummary(DONUTS), { method: 'hand', n: 30, min: 180, q1: 210, median: 250, q3: 280, max: 400 });
  assert.deepEqual(fiveNumberSummary(DONUTS, 'r7'), { method: 'r7', n: 30, min: 180, q1: 210, median: 250, q3: 277.5, max: 400 });
  assert.equal(range(DONUTS), 220);
  assert.ok(Number.isNaN(range([])));
  assert.ok(Number.isNaN(fiveNumberSummary([]).min));
});

/* ---------- Fences, whiskers and outliers 栅栏、须线与离群值 ---------- */

test('M4 p.14: with R\'s quartiles the fences are 108.75 and 378.75, the whiskers 180 and 340, and 400 is plotted alone', () => {
  const set = fences(210, 277.5);
  assert.deepEqual(set, {
    q1: 210,
    q3: 277.5,
    iqr: 67.5,
    innerStep: 101.25,
    outerStep: 202.5,
    lowerInner: 108.75,
    upperInner: 378.75,
    lowerOuter: 7.5,
    upperOuter: 480,
  });
  assert.deepEqual(whiskerEnds(DONUTS, set), { lower: 180, upper: 340 });
  assert.deepEqual(classifyOutliers(DONUTS, set), {
    outliers: [{ value: 400, level: 'suspect', side: 'high' }],
    suspect: [400],
    highlySuspect: [],
  });
});

test('M4 notes p.12: the hand quartiles give fences 105 and 385 (outer 0 and 490) and the same conclusion', () => {
  const box = boxplotStats(DONUTS);
  const { lowerInner, upperInner, lowerOuter, upperOuter } = box.fences;
  assert.deepEqual([lowerInner, upperInner, lowerOuter, upperOuter], [105, 385, 0, 490]);
  assert.deepEqual(box.whiskers, { lower: 180, upper: 340 });
  assert.deepEqual(box.suspect, [400]);
  assert.deepEqual(box.highlySuspect, []);
  assert.deepEqual([box.min, box.q1, box.median, box.q3, box.max, box.iqr], [180, 210, 250, 280, 400, 70]);
  assert.equal(box.quartiles.method, 'hand');
  assert.equal(boxplotStats(DONUTS, 'r7').fences.upperInner, 378.75);
});

test('a value exactly on a fence is inside it (M4 p.14: "a value ≥ 108.75"); only values strictly beyond are outliers', () => {
  const set = fences(10, 20);
  assert.deepEqual([set.lowerInner, set.upperInner, set.lowerOuter, set.upperOuter], [-5, 35, -20, 50]);
  assert.equal(outlierLevel(35, set), 'none');
  assert.equal(outlierLevel(-5, set), 'none');
  assert.equal(outlierLevel(35.001, set), 'suspect');
  assert.equal(outlierLevel(-5.001, set), 'suspect');
  assert.equal(outlierLevel(50, set), 'suspect');
  assert.equal(outlierLevel(-20, set), 'suspect');
  assert.equal(outlierLevel(50.001, set), 'highly-suspect');
  assert.equal(outlierLevel(-20.001, set), 'highly-suspect');
  assert.equal(outlierLevel('x', set), 'none');
  assert.equal(outlierLevel(100, null), 'none');
  assert.deepEqual(whiskerEnds([-5, 0, 15, 35, 36], set), { lower: -5, upper: 35 });
  assert.deepEqual(classifyOutliers([-21, -6, 15, 36, 51], set).outliers, [
    { value: -21, level: 'highly-suspect', side: 'low' },
    { value: -6, level: 'suspect', side: 'low' },
    { value: 36, level: 'suspect', side: 'high' },
    { value: 51, level: 'highly-suspect', side: 'high' },
  ]);
});

test('M4 practice Q1B: job loss fences from R quartiles 4.325 and 6.275; 9.2 stays inside despite binary noise', () => {
  const set = fences(4.325, 6.275);
  assert.equal(formatFixed(set.iqr, 2), '1.95');
  assert.equal(formatFixed(set.upperInner, 2), '9.20');
  assert.equal(outlierLevel(9.2, set), 'none');
  assert.equal(outlierLevel(8.6, set), 'none');
  assert.notEqual(outlierLevel(12.2, set), 'none');
  assert.notEqual(outlierLevel(17.8, set), 'none');
});

test('M4 practice Q2C: suspect and highly suspect outliers by gender', () => {
  const female = fences(4.725, 6.325);
  assert.equal(formatFixed(female.upperInner, 3), '8.725');
  assert.equal(formatFixed(female.upperOuter, 3), '11.125');
  assert.deepEqual(classifyOutliers([18, 14.3, 9.3, 8.9, 5.45], female), {
    outliers: [
      { value: 8.9, level: 'suspect', side: 'high' },
      { value: 9.3, level: 'suspect', side: 'high' },
      { value: 14.3, level: 'highly-suspect', side: 'high' },
      { value: 18, level: 'highly-suspect', side: 'high' },
    ],
    suspect: [8.9, 9.3],
    highlySuspect: [14.3, 18],
  });
  const male = fences(4.15, 6.4);
  assert.equal(formatFixed(male.upperInner, 3), '9.775');
  assert.equal(formatFixed(male.upperOuter, 2), '13.15');
  assert.equal(outlierLevel(17.6, male), 'highly-suspect');
  assert.equal(outlierLevel(10.8, male), 'suspect');
});

test('M4 p.22-24: side-by-side boxplots with R quartiles flag 340 (Cake) and 400 (Filled) but nothing in Yeast', () => {
  const cake = boxplotStats(CAKE, 'r7');
  assert.deepEqual([cake.fences.lowerInner, cake.fences.upperInner], [205, 325]);
  assert.deepEqual(cake.suspect, [340]);
  assert.deepEqual(cake.whiskers, { lower: 210, upper: 300 });
  const filled = boxplotStats(FILLED, 'r7');
  assert.deepEqual([filled.fences.lowerInner, filled.fences.upperInner], [133.75, 343.75]);
  assert.deepEqual(filled.suspect, [400]);
  assert.deepEqual(filled.whiskers, { lower: 200, upper: 270 });
  const yeast = boxplotStats(YEAST, 'r7');
  assert.deepEqual([yeast.fences.lowerInner, yeast.fences.upperInner], [85, 365]);
  assert.deepEqual(yeast.outliers, []);
  assert.deepEqual(yeast.whiskers, { lower: 180, upper: 300 });

  const empty = boxplotStats([]);
  assert.ok(Number.isNaN(empty.whiskers.lower) && Number.isNaN(empty.whiskers.upper));
  assert.deepEqual(empty.outliers, []);
});

/* ---------- Spread 离散程度 ---------- */

test('M3 p.45-51: for 2, 3, 7 the deviations add to 0, the squares to 14, s² = 14 / 2 = 7 and s = 2.65', () => {
  const table = deviationTable([2, 3, 7]);
  assert.equal(table.mean, 4);
  assert.deepEqual(table.rows.map((row) => row.deviation), [-2, -1, 3]);
  assert.deepEqual(table.rows.map((row) => row.squared), [4, 1, 9]);
  assert.deepEqual(table.rows.map((row) => row.index), [0, 1, 2]);
  assert.equal(table.sumDeviation, 0);
  assert.equal(table.sumSquared, 14);
  assert.equal(table.variance, 7);
  assert.equal(formatFixed(table.sd, 2), '2.65');
});

test('M3 p.53: Σ(x − x̄)² = 72670, s² = 72670 / 29 = 2505.8621 and s = 50.06', () => {
  const table = deviationTable(DONUTS);
  assert.deepEqual([table.n, table.sum, table.mean], [30, 7530, 251]);
  assert.equal(table.rows[0].x, 180);
  assert.equal(table.rows[0].deviation, -71);
  assert.equal(table.rows[28].squared, 149 * 149);
  close(table.sumDeviation, 0);
  assert.equal(table.sumSquared, 72670);
  assert.equal(formatFixed(table.variance, 4), '2505.8621');
  assert.equal(formatFixed(table.sd, 2), '50.06');
  assert.equal(formatFixed(sampleSd(DONUTS), 5), '50.05859');
  close(sampleVariance(DONUTS), 72670 / 29);
});

test('M4 p.23: favstats SDs by type and NA for a single donut; M3 p.52: identical marks have s = 0', () => {
  assert.equal(formatFixed(sampleSd(CAKE), 5), '35.80249');
  assert.equal(formatFixed(sampleSd(FILLED), 5), '59.21711');
  assert.equal(formatFixed(sampleSd(YEAST), 5), '48.40307');
  assert.equal(formatFixed(mean(CAKE), 4), '267.2727');
  assert.ok(Number.isNaN(sampleSd([310])));
  assert.ok(Number.isNaN(sampleVariance([])));
  assert.equal(sampleSd([10, 10, 10]), 0);
});

test('M4 p.27-30: adding a constant shifts position but not spread; multiplying scales both', () => {
  const summaryOf = (data) => {
    const box = fiveNumberSummary(data, 'r7');
    return { ...box, mean: mean(data), sd: sampleSd(data), range: range(data), iqr: iqr(data, 'r7') };
  };
  const original = summaryOf(ORIGINAL);
  assert.equal(formatFixed(original.sd, 6), '7.905694');

  const shifted = summaryOf(ORIGINAL.map((value) => value + 10));
  assert.deepEqual([shifted.min, shifted.q1, shifted.median, shifted.q3, shifted.max, shifted.mean], [15, 20, 25, 30, 35, 25]);
  close(shifted.sd, original.sd);
  assert.deepEqual([shifted.range, shifted.iqr], [original.range, original.iqr]);

  const lowered = summaryOf(ORIGINAL.map((value) => value - 5));
  assert.deepEqual([lowered.min, lowered.q1, lowered.median, lowered.q3, lowered.max, lowered.mean], [0, 5, 10, 15, 20, 10]);

  const doubled = summaryOf(ORIGINAL.map((value) => value * 2));
  assert.deepEqual([doubled.min, doubled.q1, doubled.median, doubled.q3, doubled.max, doubled.mean], [10, 20, 30, 40, 50, 30]);
  assert.equal(formatFixed(doubled.sd, 5), '15.81139');
  assert.deepEqual([doubled.range, doubled.iqr], [40, 20]);
  close(sampleVariance(ORIGINAL.map((value) => value * 2)), 4 * sampleVariance(ORIGINAL));

  const divided = summaryOf(ORIGINAL.map((value) => value / 5));
  assert.equal(formatFixed(divided.sd, 6), '1.581139');

  // A negative multiplier scales the spread by its absolute value. 负的乘数按其绝对值缩放离散程度。
  close(sampleSd(ORIGINAL.map((value) => value * -3)), 3 * original.sd);
  assert.equal(range(ORIGINAL.map((value) => value * -3)), 3 * original.range);
});

/* ---------- z-scores z 分数 ---------- */

test('M4 p.35-39: z = (x − x̄) / s and back again, y = x̄ + z × s', () => {
  assert.equal(formatFixed(zScore(67, 50, 10), 2), '1.70');
  assert.equal(formatFixed(zScore(62, 40, 12), 2), '1.83');
  assert.equal(formatFixed(zScore(400, 251, 50.06), 2), '2.98');
  assert.equal(formatFixed(zScore(180, 251, 50.06), 2), '−1.42');
  assert.equal(formatFixed(zScore(190, 251, 50.06), 2), '−1.22');
  assert.equal(zScore('251', 251, 50.06), 0);
  assert.equal(observationFromZ(2.5, 100, 16), 140);
  assert.ok(Number.isNaN(zScore(5, 5, 0)));
  assert.ok(Number.isNaN(zScore(5, 5, -1)));
  assert.ok(Number.isNaN(zScore('x', 5, 1)));
  assert.ok(Number.isNaN(observationFromZ(1, 5, -1)));
});

test('M4 p.31-32, p.43: z-scores have mean 0, SD 1, and their squares add to n − 1', () => {
  const sd = sampleSd(ORIGINAL);
  const scores = ORIGINAL.map((value) => zScore(value, mean(ORIGINAL), sd));
  assert.deepEqual(scores.map((z) => formatFixed(z, 7)), ['−1.2649111', '−0.6324555', '0.0000000', '0.6324555', '1.2649111']);
  close(mean(scores), 0);
  close(sampleSd(scores), 1);
  close(scores.reduce((total, z) => total + z * z, 0), ORIGINAL.length - 1);

  const donutScores = DONUTS.map((value) => zScore(value, mean(DONUTS), sampleSd(DONUTS)));
  close(donutScores.reduce((total, z) => total + z * z, 0), 29);
});

/* ---------- Correlation 相关系数 ---------- */

test('M5 p.40: the drug table gives SS_xy = 7, SS_xx = 10, SS_yy = 6 and r = 7 / √60 = 0.9037 (the slide prints 0.9024)', () => {
  const result = correlation(DRUG);
  assert.deepEqual([result.n, result.xbar, result.ybar], [5, 3, 2]);
  assert.deepEqual(result.rows.map((row) => row.dx), [-2, -1, 0, 1, 2]);
  assert.deepEqual(result.rows.map((row) => row.dy), [-1, -1, 0, 0, 2]);
  assert.deepEqual(result.rows.map((row) => row.dxdy), [2, 1, 0, 0, 4]);
  assert.deepEqual(result.rows.map((row) => row.dx2), [4, 1, 0, 1, 4]);
  assert.deepEqual(result.rows.map((row) => row.dy2), [1, 1, 0, 0, 4]);
  assert.deepEqual([result.ssxy, result.ssxx, result.ssyy, result.covariance], [7, 10, 6, 1.75]);
  close(result.sx, Math.sqrt(10 / 4));
  close(result.sy, Math.sqrt(6 / 4));
  close(result.r, 7 / Math.sqrt(60), 1e-12);
  assert.equal(formatFixed(result.r, 7), '0.9036961');
  assert.equal(formatFixed(result.r, 4), '0.9037');
});

test('M5 p.42-43: r = Σ z_x z_y / (n − 1) = 3.614784 / 4', () => {
  const result = correlation(DRUG);
  assert.deepEqual(result.rows.map((row) => formatFixed(row.zx, 4)), ['−1.2649', '−0.6325', '0.0000', '0.6325', '1.2649']);
  assert.deepEqual(result.rows.map((row) => formatFixed(row.zy, 4)), ['−0.8165', '−0.8165', '0.0000', '0.0000', '1.6330']);
  assert.deepEqual(result.rows.map((row) => formatFixed(row.zxzy, 4)), ['1.0328', '0.5164', '0.0000', '0.0000', '2.0656']);
  assert.equal(formatFixed(result.sumZProducts, 6), '3.614784');
  close(result.r, result.sumZProducts / 4, 1e-12);
});

test('M5 practice: Σ z_x z_y = 9.3410002 gives r = 0.934 (marijuana); the toddlers give r = −0.6492 ≈ −0.65', () => {
  const drugs = correlation(MARIJUANA);
  assert.equal(formatFixed(drugs.sumZProducts, 7), '9.3410002');
  assert.equal(formatFixed(drugs.r, 7), '0.9341000');
  const toddlers = correlation(TODDLERS);
  assert.equal(formatFixed(toddlers.sumZProducts, 3), '−12.334');
  assert.equal(formatFixed(toddlers.r, 4), '−0.6492');
  assert.equal(formatFixed(toddlers.xbar, 2), '34.01');
  assert.equal(formatFixed(toddlers.sx, 4), '6.3165');
  assert.equal(toddlers.ybar, 456);
  assert.equal(formatFixed(toddlers.sy, 3), '29.940');
});

test('M5 p.24, p.27: changing units changes the covariance but not r; a negative factor flips its sign', () => {
  const base = correlation(DRUG);
  const minutes = correlation(DRUG.map(([x, y]) => [x, y / 60]));
  close(minutes.r, base.r, 1e-12);
  close(minutes.covariance, base.covariance / 60, 1e-12);
  const shifted = correlation(DRUG.map(([x, y]) => [2.54 * x + 100, 3 * y - 7]));
  close(shifted.r, base.r, 1e-12);
  const flipped = correlation(DRUG.map(([x, y]) => [-x, y]));
  close(flipped.r, -base.r, 1e-12);
  const swapped = correlation(DRUG.map(([x, y]) => [y, x]));
  close(swapped.r, base.r, 1e-12);
});

test('r stays within −1 and 1, needs spread in both variables, and misses curved patterns (M5 p.32 f)', () => {
  assert.equal(correlation([[1, 2], [2, 4], [3, 6], [4, 8]]).r, 1);
  assert.equal(correlation([[0.1, 0.3], [0.2, 0.1], [0.3, -0.1]]).r, -1);
  const curve = correlation([[-2, 0], [-1, 3], [0, 4], [1, 3], [2, 0]]);
  close(curve.r, 0, 1e-12);
  assert.ok(Number.isNaN(correlation([[1, 5], [2, 5], [3, 5]]).r));
  assert.ok(Number.isNaN(correlation([[4, 1], [4, 2]]).r));
  assert.ok(Number.isNaN(correlation([[1, 2]]).r));
  assert.ok(Number.isNaN(correlation([]).r));
  assert.ok(Number.isNaN(correlation([[1, 5], [2, 5]]).sumZProducts));
});

test('M5 p.32 strength scale on |r|, with the lower bounds included', () => {
  assert.equal(correlationStrength(0.9037), 'strong');
  assert.equal(correlationStrength(0.85), 'strong');
  assert.equal(correlationStrength(0.8), 'strong');
  assert.equal(correlationStrength(0.7999999999999999), 'strong');
  assert.equal(correlationStrength(0.79), 'moderate-to-strong');
  assert.equal(correlationStrength(0.78), 'moderate-to-strong');
  assert.equal(correlationStrength(-0.65), 'moderate-to-strong');
  assert.equal(correlationStrength(0.5), 'moderate-to-strong');
  assert.equal(correlationStrength(-0.49), 'moderate');
  assert.equal(correlationStrength(0.3), 'moderate');
  assert.equal(correlationStrength(0.29), 'weak');
  assert.equal(correlationStrength(0), 'weak');
  assert.equal(correlationStrength(Number.NaN), null);
  assert.equal(correlationStrength('x'), null);
  assert.equal(correlationDirection(0.9), 'positive');
  assert.equal(correlationDirection(-0.65), 'negative');
  assert.equal(correlationDirection(0), 'none');
  assert.equal(correlationDirection(1e-15), 'none');
  assert.equal(correlationDirection(undefined), null);
});

/* ---------- Least squares 最小二乘 ---------- */

test('drug data: b1 = r · s_y / s_x = 0.7, b0 = ȳ − b1 · x̄ = −0.1, R² = r² = 49 / 60', () => {
  const fit = leastSquares(DRUG);
  close(fit.b1, 0.7, 1e-12);
  close(fit.b0, -0.1, 1e-12);
  close(fit.b1, (fit.r * fit.sy) / fit.sx, 1e-12);
  close(fit.rSquared, 49 / 60, 1e-12);
  assert.deepEqual([fit.n, fit.xbar, fit.ybar, fit.xMin, fit.xMax], [5, 3, 2, 1, 5]);
  assert.deepEqual(fit.residuals.map((row) => formatFixed(row.residual, 1)), ['0.4', '−0.3', '0.0', '−0.7', '0.6']);
  close(fit.residuals.reduce((total, row) => total + row.residual, 0), 0, 1e-12);
  close(fit.sse, 1.1, 1e-12);
  assert.equal(fit.correlation.ssxy, 7);
});

test('M5 practice reg: ŷ = 560.65126 − 3.0770733 time, residual at 43.1 minutes is −18.0294, R² ≈ 0.42', () => {
  const fit = leastSquares(TODDLERS);
  assert.equal(formatFixed(fit.b0, 5), '560.65126');
  assert.equal(formatFixed(fit.b1, 7), '−3.0770733');
  assert.equal(formatFixed(fit.rSquared, 2), '0.42');
  assert.equal(formatFixed(fit.sse, 2), '9854.42');
  assert.deepEqual([fit.xMin, fit.xMax], [21.4, 43.8]);
  const printed = { b0: 560.65126, b1: -3.077073 };
  assert.equal(formatFixed(predict(printed, 43.1), 4), '428.0294');
  assert.equal(formatFixed(residual(printed, 43.1, 410), 4), '−18.0294');
  const point = fit.residuals[17];
  assert.deepEqual([point.x, point.y], [43.1, 410]);
  assert.equal(formatFixed(point.residual, 3), '−18.029');
  // Q6: R² = (−0.65)² = 0.4225 ≈ 0.42. 第 6 题：R² = (−0.65)² = 0.4225 ≈ 0.42。
  assert.equal(formatFixed(lineFromSummary({ xbar: 34.01, sx: 6.3165, ybar: 456, sy: 29.94, r: -0.65 }).rSquared, 4), '0.4225');
});

test('M5 practice corr Q2: the marijuana line is ŷ = −3.068 + 0.6150x with R² = 0.8725', () => {
  const fit = leastSquares(MARIJUANA);
  assert.equal(formatFixed(fit.b0, 3), '−3.068');
  assert.equal(formatFixed(fit.b1, 4), '0.6150');
  assert.equal(formatFixed(fit.rSquared, 4), '0.8725');
});

test('midterm 2025 Q24-Q25: ŷ = 13.31 + 0.69 × 88 = 74.03, residual 90 − 74.03 = 15.97, R² = 0.77² = 0.59', () => {
  const line = { b0: 13.31, b1: 0.69 };
  close(predict(line, 88), 74.03);
  close(residual(line, 88, 90), 15.97);
  assert.equal(formatFixed(residual(line, 88, 90), 2), '15.97');
  // The answer key writes "88 − 74.03"; 13.97 is the distractor that comes from it.
  // 答案写成了“88 − 74.03”；13.97 正是由此得到的干扰选项。
  assert.equal(formatFixed(88 - predict(line, 88), 2), '13.97');
  const summary = lineFromSummary({ xbar: 70, sx: 10, ybar: 62, sy: 8, r: 0.77 });
  close(summary.rSquared, 0.5929);
  assert.equal(formatFixed(summary.rSquared, 2), '0.59');
});

test('lineFromSummary uses b1 = r · s_y / s_x and b0 = ȳ − b1 · x̄, and agrees with the line fitted from data', () => {
  const line = lineFromSummary({ xbar: 70, sx: 10, ybar: 62, sy: 8, r: 0.77 });
  close(line.b1, 0.616);
  close(line.b0, 18.88);
  assert.deepEqual([line.r, line.xbar, line.sx, line.ybar, line.sy], [0.77, 70, 10, 62, 8]);

  const fit = leastSquares(DRUG);
  const fromSummary = lineFromSummary({ xbar: fit.xbar, sx: fit.sx, ybar: fit.ybar, sy: fit.sy, r: fit.r });
  close(fromSummary.b1, fit.b1, 1e-12);
  close(fromSummary.b0, fit.b0, 1e-12);
  assert.equal(lineFromSummary({ xbar: '3', sx: '2', ybar: '1', sy: '4', r: '0.5' }).b1, 1);

  for (const bad of [{ xbar: 70, sx: 0, ybar: 62, sy: 8, r: 0.5 }, { xbar: 70, sx: 10, ybar: 62, sy: -1, r: 0.5 },
    { xbar: 70, sx: 10, ybar: 62, sy: 8, r: 1.2 }, { sx: 10, ybar: 62, sy: 8, r: 0.5 }, null]) {
    const result = lineFromSummary(bad);
    assert.ok(Number.isNaN(result.b0) && Number.isNaN(result.b1) && Number.isNaN(result.rSquared));
  }
});

test('the least-squares line has the smallest sum of squared residuals; residualTable scores any line', () => {
  const fit = leastSquares(TODDLERS);
  const own = residualTable({ b0: fit.b0 + 5, b1: fit.b1 }, TODDLERS);
  const tilted = residualTable({ b0: fit.b0, b1: fit.b1 + 0.1 }, TODDLERS);
  assert.ok(own.sse > fit.sse && tilted.sse > fit.sse);
  close(residualTable({ b0: fit.b0, b1: fit.b1 }, TODDLERS).sse, fit.sse, 1e-6);
  const table = residualTable({ b0: 1, b1: 2 }, [[1, 4], { x: 2, y: 5 }]);
  assert.deepEqual(table.rows, [
    { index: 0, x: 1, y: 4, yHat: 3, residual: 1, squared: 1 },
    { index: 1, x: 2, y: 5, yHat: 5, residual: 0, squared: 0 },
  ]);
  assert.equal(table.sse, 1);
});

test('degenerate lines: equal x values give no line, equal y values give the flat line ŷ = ȳ', () => {
  const vertical = leastSquares([[3, 1], [3, 5]]);
  assert.ok(Number.isNaN(vertical.b0) && Number.isNaN(vertical.b1) && Number.isNaN(vertical.sse));
  const flat = leastSquares([[1, 5], [2, 5], [3, 5]]);
  assert.deepEqual([flat.b0, flat.b1, flat.sse], [5, 0, 0]);
  assert.ok(Number.isNaN(flat.r) && Number.isNaN(flat.rSquared));
  const empty = leastSquares([]);
  assert.ok(Number.isNaN(empty.b1) && Number.isNaN(empty.xMin));
  assert.ok(Number.isNaN(predict({ b0: 1 }, 2)));
  assert.ok(Number.isNaN(predict({ b0: 1, b1: 2 }, 'x')));
  assert.ok(Number.isNaN(residual({ b0: 1, b1: 2 }, 3, null)));
  assert.equal(predict({ b0: '1', b1: 2 }, '3'), 7);
});

/* ---------- Frequency tables 频数表 ---------- */

test('M3 p.13-20: R\'s hist() bins are right-closed with [150, 200] first, giving 6, 11, 10, 2, 1', () => {
  const table = frequencyTable(DONUTS, { start: 150, width: 50, closed: 'right' });
  assert.deepEqual([table.n, table.start, table.width, table.closed], [30, 150, 50, 'right']);
  assert.deepEqual(table.edges, [150, 200, 250, 300, 350, 400]);
  assert.deepEqual(table.bins.map((bin) => bin.count), [6, 11, 10, 2, 1]);
  assert.deepEqual(table.bins.map((bin) => [bin.leftClosed, bin.rightClosed]), [
    [true, true], [false, true], [false, true], [false, true], [false, true],
  ]);
  // "At most 200" is the first bar, 6 / 30 = 0.20; "more than 300" the last two, 3 / 30 = 0.10.
  // “最多 200”就是第一根柱，6 / 30 = 0.20；“多于 300”是最后两根，3 / 30 = 0.10。
  assert.deepEqual(table.bins[0].values, [180, 190, 190, 190, 200, 200]);
  assert.equal(table.bins[0].proportion, 0.2);
  assert.equal(table.bins[3].count + table.bins[4].count, 3);
  assert.deepEqual(table.bins[2].values, [270, 270, 270, 270, 270, 280, 280, 290, 300, 300]);
  assert.deepEqual(table.bins.map((bin) => bin.cumulative), [6, 17, 27, 29, 30]);
  assert.equal(table.bins[4].cumulativeProportion, 1);
});

test('without a start or width the table follows R\'s defaults (Sturges, width 50 from 150)', () => {
  assert.equal(defaultBinWidth(DONUTS), 50);
  const table = frequencyTable(DONUTS);
  assert.deepEqual([table.start, table.width, table.closed], [150, 50, 'right']);
  assert.deepEqual(table.bins.map((bin) => bin.count), [6, 11, 10, 2, 1]);
  assert.equal(defaultBinWidth([]), 1);
  assert.equal(defaultBinWidth([250, 250]), 50);
});

test('left-closed bins [a, b) give 4, 9, 12, 4, 0, 1 like the poster on M3 p.8, keeping the empty bin', () => {
  const table = frequencyTable(DONUTS, { start: 150, width: 50, closed: 'left' });
  assert.deepEqual(table.edges, [150, 200, 250, 300, 350, 400, 450]);
  assert.deepEqual(table.bins.map((bin) => bin.count), [4, 9, 12, 4, 0, 1]);
  assert.ok(table.bins.every((bin) => bin.leftClosed && !bin.rightClosed));
  assert.deepEqual(table.bins[1].values.slice(0, 2), [200, 200]);
  assert.deepEqual(table.bins[5].values, [400]);
  assert.deepEqual(table.bins[4].values, []);
});

test('M3 p.22 and M4 p.27: other bin layouts R and ggplot2 draw', () => {
  // ggplot2 with binwidth 30 starts its bins at 165: 4, 7, 6, 7, 4, 1, 0, 1.
  // ggplot2 组距 30 时从 165 开始分组：4、7、6、7、4、1、0、1。
  assert.deepEqual(frequencyTable(DONUTS, { start: 165, width: 30 }).bins.map((bin) => bin.count), [4, 7, 6, 7, 4, 1, 0, 1]);
  // R puts 5 and 10 together in [5, 10], so a symmetric data set looks skewed: 2, 1, 1, 1.
  // R 把 5 和 10 放进同一组 [5, 10]，对称的数据看起来却是偏的：2、1、1、1。
  assert.deepEqual(frequencyTable(ORIGINAL, { start: 5, width: 5 }).bins.map((bin) => bin.count), [2, 1, 1, 1]);
});

test('a start above the minimum moves down by whole widths; decimal widths keep exact edges', () => {
  const moved = frequencyTable(DONUTS, { start: 200, width: 50 });
  assert.equal(moved.start, 150);
  assert.deepEqual(moved.bins.map((bin) => bin.count), [6, 11, 10, 2, 1]);
  const early = frequencyTable(DONUTS, { start: 100, width: 50 });
  assert.deepEqual(early.bins.map((bin) => bin.count), [0, 6, 11, 10, 2, 1]);

  const right = frequencyTable([0.1, 0.2, 0.3], { start: 0, width: 0.1 });
  assert.deepEqual(right.edges, [0, 0.1, 0.2, 0.3]);
  assert.deepEqual(right.bins.map((bin) => bin.count), [1, 1, 1]);
  const left = frequencyTable([0.1, 0.2, 0.3], { start: 0, width: 0.1, closed: 'left' });
  assert.deepEqual(left.edges, [0, 0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(left.bins.map((bin) => bin.count), [0, 1, 1, 1]);
  assert.deepEqual(frequencyTable([2.4, 17.8], { start: 0, width: 2.5 }).edges.slice(0, 3), [0, 2.5, 5]);
});

test('frequency tables handle negative data, one repeated value, no data and unusable widths', () => {
  const negative = frequencyTable([-13, -3, 2, 15], { width: 5 });
  assert.equal(negative.start, -15);
  assert.deepEqual(negative.bins.map((bin) => bin.count), [1, 0, 1, 1, 0, 1]);
  const single = frequencyTable([250, 250]);
  assert.deepEqual(single.bins.map((bin) => [bin.lower, bin.upper, bin.count]), [[250, 300, 2]]);
  const none = frequencyTable([]);
  assert.deepEqual([none.n, none.bins, none.edges], [0, [], []]);
  for (const options of [{ width: 0.001 }, { start: -1e6, width: 50 }]) {
    const table = frequencyTable(DONUTS, options);
    assert.ok(table.bins.length <= MAX_BINS);
    assert.deepEqual([table.start, table.width], [150, 50]);
  }
  assert.equal(frequencyTable(DONUTS, { width: -5 }).width, 50);
  assert.equal(frequencyTable(DONUTS, null).closed, 'right');
});

/* ---------- Stem-and-leaf 茎叶图 ---------- */

test('M3 p.23: stem(Calories, scale = 0.5) has split stems and an empty 3 | line', () => {
  const display = stemAndLeaf(DONUTS, { leafUnit: 10, split: true });
  assert.deepEqual(display.lines.map(lineText), ['1 | 8999', '2 | 001112233', '2 | 555577777889', '3 | 0014', '3 | ', '4 | 0']);
  assert.deepEqual(display.lines.map((line) => line.part), [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(display.lines.map((line) => line.values.length), [4, 9, 12, 4, 0, 1]);
  assert.deepEqual([display.n, display.leafUnit, display.stemUnit, display.split, display.rounded], [30, 10, 100, true, false]);
  assert.deepEqual(display.lines[0].values, [180, 190, 190, 190]);
});

test('without split each stem is one line; the default leaf unit for the calories is 10', () => {
  assert.equal(defaultLeafUnit(DONUTS), 10);
  const display = stemAndLeaf(DONUTS);
  assert.deepEqual(display.lines.map(lineText), ['1 | 8999', '2 | 001112233555577777889', '3 | 0014', '4 | 0']);
  assert.deepEqual(display.lines.map((line) => line.part), [0, 0, 0, 0]);
  assert.equal(display.split, false);
  assert.equal(stemAndLeaf(DONUTS, { split: 'false' }).split, false, 'only true splits the stems');
  assert.equal(defaultLeafUnit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 1);
  assert.equal(defaultLeafUnit([2.4, 17.8, 5.5]), 1);
  assert.equal(defaultLeafUnit([0.12, 0.47]), 0.01);
  assert.equal(defaultLeafUnit([]), 1);
});

test('values are rounded to the leaf unit half away from zero, like R\'s stem()', () => {
  const display = stemAndLeaf([1.25, 1.34, 1.4], { leafUnit: 0.1 });
  assert.deepEqual(display.lines.map(lineText), ['1 | 334']);
  assert.equal(display.rounded, true);
  assert.equal(display.stemUnit, 1);
  const jobLoss = stemAndLeaf([2.4, 4.3, 17.8], { leafUnit: 1 });
  assert.deepEqual(jobLoss.lines.map(lineText), ['0 | 24', '1 | 8']);
  assert.deepEqual(stemAndLeaf([15, 3, 2], { leafUnit: '1' }).lines.map(lineText), ['0 | 23', '1 | 5']);
});

test('negative stems come first with their leaves in data order, including "−0"', () => {
  const display = stemAndLeaf([-15, -13, -3, 2, 15], { leafUnit: 1 });
  assert.deepEqual(display.lines.map(lineText), ['-1 | 53', '-0 | 3', '0 | 2', '1 | 5']);
  assert.deepEqual(display.lines.map((line) => line.negative), [true, true, false, false]);
  const split = stemAndLeaf([-17, -12, -7, -3, 0, 4, 15], { leafUnit: 1, split: true });
  assert.deepEqual(split.lines.map((line) => `${lineText(line)}/${line.part}`), [
    '-1 | 7/1', '-1 | 2/0', '-0 | 7/1', '-0 | 3/0', '0 | 04/0', '0 | /1', '1 | /0', '1 | 5/1',
  ]);
});

test('an unusable leaf unit falls back to the default one', () => {
  for (const leafUnit of [3, 0, -10, 'x', undefined]) {
    assert.equal(stemAndLeaf(DONUTS, { leafUnit }).leafUnit, 10);
  }
  const crowded = stemAndLeaf([1, 100000], { leafUnit: 0.001 });
  assert.equal(crowded.leafUnit, 1000);
  assert.ok(crowded.lines.length <= MAX_BINS);
  assert.deepEqual(stemAndLeaf([]).lines, []);
});

/* ---------- Contingency tables 列联表 ---------- */

test('midterm 2025 Q2-Q6: totals, joint, marginal and conditional proportions of the GSS table', () => {
  const table = contingency(GSS);
  assert.deepEqual([table.rowCount, table.columnCount], [2, 2]);
  assert.deepEqual([table.rowTotals, table.columnTotals, table.total], [[96, 1021], [118, 999], 1117]);
  // Q2: yes to both or no to both. 两题都答是或都答否。
  assert.equal(formatFixed(table.joint[0][0] + table.joint[1][1], 3), '0.862');
  // Q3: willing to pay higher prices (a column margin). 愿意付更高价格（列边际）。
  assert.equal(formatFixed(table.columnMarginal[0], 3), '0.106');
  assert.equal(formatFixed(table.rowMarginal[0], 3), '0.086');
  // Q4 and Q5: conditional on membership, so row proportions. 以是否为成员为条件，因此是行比例。
  assert.equal(formatFixed(table.rowProportions[0][0], 3), '0.313');
  assert.equal(formatFixed(table.rowProportions[1][0], 3), '0.086');
  // Q6: relative risk 0.3125 / 0.0862 ≈ 3.63. 相对风险。
  assert.equal(formatFixed(table.rowProportions[0][0] / table.rowProportions[1][0], 2), '3.63');
  assert.equal(formatFixed(table.joint[0][0], 3), '0.027');
});

test('cellFraction and marginalFraction name the numerator and the denominator', () => {
  const table = contingency(GSS);
  assert.deepEqual(cellFraction(table, 0, 0, 'row'), { numerator: 30, denominator: 96, value: 0.3125 });
  assert.deepEqual(cellFraction(table, 1, 0, 'row'), { numerator: 88, denominator: 1021, value: 88 / 1021 });
  assert.deepEqual(cellFraction(table, 0, 0, 'column'), { numerator: 30, denominator: 118, value: 30 / 118 });
  assert.deepEqual(cellFraction(table, 0, 0), { numerator: 30, denominator: 1117, value: 30 / 1117 });
  assert.deepEqual(marginalFraction(table, 'column', 0), { numerator: 118, denominator: 1117, value: 118 / 1117 });
  assert.deepEqual(marginalFraction(table, 'row', 0), { numerator: 96, denominator: 1117, value: 96 / 1117 });
  const missing = cellFraction(table, 5, 0, 'row');
  assert.ok(Number.isNaN(missing.numerator) && Number.isNaN(missing.value));
  assert.ok(Number.isNaN(marginalFraction(table, 'row', 9).value));
  assert.ok(Number.isNaN(cellFraction(null, 0, 0).value));
});

test('M2 p.23-33: Titanic column percentages add to 100% per column, row percentages per row', () => {
  const table = contingency(TITANIC);
  assert.deepEqual([table.rowTotals, table.columnTotals, table.total], [[711, 1490], [325, 285, 706, 885], 2201]);
  const digits = (list, places) => list.map((value) => formatFixed(value, places));
  assert.deepEqual(digits(table.columnProportions[0], 7), ['0.6246154', '0.4140351', '0.2521246', '0.2395480']);
  assert.equal(formatFixed(table.rowProportions[0][0], 8), '0.28551336');
  assert.equal(formatFixed(table.joint[0][0], 8), '0.09223080');
  assert.deepEqual(digits(table.rowMarginal, 8), ['0.32303498', '0.67696502']);
  assert.deepEqual(digits(table.columnMarginal, 8), ['0.14766015', '0.12948660', '0.32076329', '0.40208996']);
  const [alive, dead] = table.columnProportions;
  for (let column = 0; column < 4; column += 1) close(alive[column] + dead[column], 1, 1e-12);
  for (const row of table.rowProportions) close(row.reduce((total, value) => total + value, 0), 1, 1e-12);
  close(table.joint.flat().reduce((total, value) => total + value, 0), 1, 1e-12);
});

test('contingency pads short rows, counts bad cells as 0 and leaves proportions over 0 undefined', () => {
  const table = contingency([[1, 2, 3], [4], 'x', [-1, 'a', '2']]);
  assert.deepEqual(table.counts, [[1, 2, 3], [4, 0, 0], [0, 0, 0], [0, 0, 2]]);
  assert.deepEqual([table.rowTotals, table.columnTotals, table.total], [[6, 4, 0, 2], [5, 2, 5], 12]);
  assert.ok(table.rowProportions[2].every(Number.isNaN));
  assert.equal(table.columnProportions[3][2], 0.4);
  const empty = contingency(undefined);
  assert.deepEqual([empty.rowCount, empty.columnCount, empty.total, empty.joint], [0, 0, 0, []]);
  const zero = contingency([[0, 0], [0, 0]]);
  assert.ok(zero.joint.flat().every(Number.isNaN));
  assert.ok(zero.columnMarginal.every(Number.isNaN));
});
