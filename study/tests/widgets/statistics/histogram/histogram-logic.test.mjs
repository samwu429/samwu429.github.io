import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DATA_LIMITS,
  HISTOGRAM_VIEWS,
  MAX_DISPLAY_BINS,
  MAX_LEAVES_PER_LINE,
  MAX_LISTED_VALUES,
  MAX_STEM_LINES,
  READING_RELATIONS,
  SLIDE_EXAMPLE,
  alignStart,
  binCountFor,
  binDetail,
  binFacts,
  binWidthOptions,
  centreSummary,
  centreTexts,
  cutOptions,
  dataDecimals,
  decimalPointNote,
  defaultSplit,
  describeLines,
  dotplotStacks,
  dotplotText,
  edgeDigits,
  frequencyRows,
  histogramAltText,
  histogramLayout,
  intervalMeaning,
  layoutAnnouncement,
  leafUnitOptions,
  meanMedianHint,
  normalizeHistogramConfig,
  readFromBins,
  readableRelations,
  readingText,
  relationWords,
  sameValue,
  shareOf,
  slideCaution,
  startOptions,
  stemAnnouncement,
  stemDisplay,
  stemText,
  summaryLabels,
  withUnit,
} from '../../../../engine/widgets/statistics/histogram/histogram-logic.js';

// M3 p.5: calories of the 30 Tim Hortons donuts (2014), in ID order as R prints them.
// 第 3 单元第 5 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 R 打印的 ID 顺序。
const DONUTS = [
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
];
// 2025 midterm Q15: 10 children whose aggressive acts give R's bars 3, 3, 1, 1, 1, 1 over (0, 2], ..., (10, 12]
// (the test only shows the bars; these values are one data set that draws them).
// 2025 年期中第 15 题：10 个孩子的攻击行为次数，R 的柱子为 3、3、1、1、1、1（试卷只给了柱子，这里是能画出它们的一组数据）。
const AGGRESSIVE = [0, 1, 2, 3, 3, 4, 5, 7, 9, 11];

const DONUT_CONFIG = {
  title: { zh: 'Tim Hortons 甜甜圈的热量', en: 'Calories of Tim Hortons donuts' },
  variable: { zh: '热量', en: 'Calories' },
  unit: 'kcal',
  data: DONUTS,
  binWidth: 50,
  start: 100,
  closed: 'right',
  views: ['histogram', 'dotplot', 'stemleaf'],
  leafUnit: 10,
};

const counts = (layout) => layout.bins.map((bin) => bin.count);
const donutLayout = (closed = 'right') => histogramLayout(DONUTS, { width: 50, start: 100, closed });

// Every string inside a value, for checking that no text shows NaN, undefined or Infinity.
// 取出一个值里的所有字符串，用来检查文字里没有 NaN、undefined 或 Infinity。
function textsOf(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
}

function assertClean(value, where) {
  for (const text of textsOf(value)) {
    assert.doesNotMatch(text, /NaN|undefined|Infinity|null|\[object/, `${where}: ${text}`);
  }
}

/* ---------- Reading the config 读取配置 ---------- */

test('normalizeHistogramConfig reads a full content-spec config without dropping anything', () => {
  const model = normalizeHistogramConfig(DONUT_CONFIG);
  assert.deepEqual(model.title, DONUT_CONFIG.title);
  assert.deepEqual(model.variable, DONUT_CONFIG.variable);
  assert.equal(model.unit, 'kcal');
  assert.deepEqual(model.data, DONUTS);
  assert.deepEqual([model.binWidth, model.start, model.closed, model.leafUnit], [50, 100, 'right', 10]);
  assert.deepEqual(model.views, ['histogram', 'dotplot', 'stemleaf']);
  assert.deepEqual([model.usedDefault, model.truncated, model.widthAdjusted, model.leafUnitAdjusted], [false, false, false, false]);
  assert.equal(model.split, true, 'four lines of stems are split, like stem(Calories, scale = 0.5) on M3 p.23');
  assert.equal(normalizeHistogramConfig({ ...DONUT_CONFIG, closed: 'left' }).closed, 'left');
});

test('a config without usable data shows the M3 p.5 donuts with their own labels and R\'s bins', () => {
  for (const config of [undefined, null, [], 'data', {}, { data: [] }, { data: ['a', null, true, {}] }, { data: 'x' }]) {
    const model = normalizeHistogramConfig(config);
    assert.equal(model.usedDefault, true);
    assert.deepEqual(model.data, SLIDE_EXAMPLE.data);
    assert.deepEqual([model.unit, model.variable.en, model.title.en], ['kcal', 'Calories', 'Calories of Tim Hortons donuts']);
    assert.deepEqual([model.binWidth, model.start, model.closed, model.leafUnit], [50, null, 'right', 10]);
    assert.deepEqual(model.views, ['histogram']);
  }
  // The author's width, start, leaf unit and labels belong to the missing data, so they are not applied.
  // 作者的组距、起点、叶单位和标签属于缺失的数据，所以不用在例子上。
  const model = normalizeHistogramConfig({ binWidth: 7, start: 3, leafUnit: 1, unit: '$', variable: { zh: '收入', en: 'Earnings' }, views: ['dotplot'] });
  assert.deepEqual([model.binWidth, model.start, model.leafUnit, model.unit, model.variable.en], [50, null, 10, 'kcal', 'Calories']);
  assert.deepEqual(model.views, ['dotplot']);
  assert.ok(!Object.isFrozen(model.data), 'the example data are copied, not shared');
});

test('bad or missing fields fall back to safe defaults', () => {
  const model = normalizeHistogramConfig({
    data: ['1', 2, 'x', true, null, 3, '4.5', 5, Number.NaN, Infinity, 6],
    title: 'Number of goals',
    variable: '进球数',
    unit: 5,
    closed: 'middle',
    views: ['pie', 'histogram', 'stemleaf', 'histogram'],
    binWidth: -5,
    start: 'soon',
    leafUnit: 0,
  });
  assert.deepEqual(model.data, [1, 2, 3, 4.5, 5, 6]);
  assert.deepEqual(model.title, { zh: '', en: 'Number of goals' });
  assert.deepEqual(model.variable, { zh: '进球数', en: '' });
  assert.deepEqual([model.unit, model.closed, model.start], ['', 'right', null]);
  assert.deepEqual(model.views, ['histogram', 'stemleaf']);
  assert.equal(model.widthAdjusted, false, 'a missing or negative width is not an adjustment');
  assert.equal(model.leafUnitAdjusted, false);
  assert.deepEqual(normalizeHistogramConfig({ data: DONUTS, views: 'histogram' }).views, ['histogram']);
  assert.deepEqual(normalizeHistogramConfig({ data: DONUTS, views: [] }).views, ['histogram']);
  assert.deepEqual(normalizeHistogramConfig({ data: DONUTS }).title, { zh: '直方图', en: 'Histogram' });
  assert.deepEqual(normalizeHistogramConfig({ data: DONUTS, variable: { zh: ' ', en: '' } }).variable, { zh: '数值', en: 'Value' });
  // The validator accepts any unit string, so a long one is kept whole rather than cut.
  // 校验器接受任何单位字符串，所以较长的单位完整保留，不截断。
  const long = normalizeHistogramConfig({ data: DONUTS, unit: '  kilocalories per serving of donut  ' });
  assert.equal(long.unit, 'kilocalories per serving of donut');
  assert.deepEqual(HISTOGRAM_VIEWS, ['histogram', 'dotplot', 'stemleaf']);
});

test('sizes are clamped: more than 200 values are cut, too many bins or a single bar fall back to R\'s width', () => {
  const many = normalizeHistogramConfig({ data: Array.from({ length: 250 }, (_, index) => index) });
  assert.equal(many.data.length, DATA_LIMITS.max);
  assert.deepEqual([many.truncated, many.data[199]], [true, 199]);
  assert.equal(normalizeHistogramConfig({ data: DONUTS.slice(0, DATA_LIMITS.min) }).data.length, 5);
  assert.equal(normalizeHistogramConfig({ data: [7] }).data.length, 1, 'fewer than 5 values are still drawn');

  // (400 − 180) / 4 = 55 bins fit; (400 − 180) / 3 = 74 bins do not; 1000 would draw one bar.
  // (400 − 180) / 4 = 55 组放得下；(400 − 180) / 3 = 74 组放不下；1000 只会画出一根柱子。
  assert.deepEqual(pick(normalizeHistogramConfig({ data: DONUTS, binWidth: 4 })), [4, false]);
  for (const binWidth of [3, 1e-9, 1000, 1e9]) {
    assert.deepEqual(pick(normalizeHistogramConfig({ data: DONUTS, binWidth })), [50, true], `width ${binWidth}`);
  }
  // One bar is right when every value is the same. 所有值都相同时，一根柱子就是对的。
  assert.deepEqual(pick(normalizeHistogramConfig({ data: [5, 5, 5, 5, 5], binWidth: 0.001 })), [0.001, false]);
  function pick(model) {
    return [model.binWidth, model.widthAdjusted];
  }
});

test('leaf units: a power of ten that fits is kept, anything else falls back to the default', () => {
  const leaf = (leafUnit, data = DONUTS) => {
    const model = normalizeHistogramConfig({ data, leafUnit });
    return [model.leafUnit, model.leafUnitAdjusted];
  };
  assert.deepEqual(leaf(1), [1, false]);
  assert.deepEqual(leaf('10'), [10, false]);
  assert.deepEqual(leaf(100), [100, false], 'stems 0 with leaves 2-4 still separate the values');
  assert.deepEqual(leaf(5), [10, true], 'not a power of ten');
  assert.deepEqual(leaf(0.001), [10, true], 'would need more than 60 stem lines');
  assert.deepEqual(leaf(1e6), [10, true], 'would round every value to 0');
  assert.deepEqual(leaf(1, [5, 5, 5, 5, 5]), [1, false]);
  // A large data set gets a finer default leaf unit so no line holds more than 40 leaves.
  // 数据很多时默认叶单位会更细，让一行不超过 40 片叶子。
  const crowded = normalizeHistogramConfig({ data: Array.from({ length: 200 }, (_, index) => (index * 37) % 101) });
  const display = stemDisplay(crowded.data, { leafUnit: crowded.leafUnit, split: crowded.split });
  assert.equal(crowded.leafUnit, 1);
  assert.ok(display.lines.every((line) => line.count <= MAX_LEAVES_PER_LINE));
  assert.ok(display.lines.length <= MAX_STEM_LINES);
});

test('every config the validator accepts gives a drawable histogram, dotplot, stem-and-leaf and centre', () => {
  // validate_content.py: 5-200 finite numbers, positive binWidth and leafUnit, any numeric start, closed
  // "left" or "right", a non-empty list of known views (repeats allowed), Bi labels, any other keys.
  // 校验器接受的范围：5-200 个有限数字，正的组距和叶单位，任意数字起点，closed 为 left 或 right，视图为非空的已知列表（可以重复），其他键随意。
  const configs = [
    { data: [1, 2, 3, 4, 5] },
    { data: Array.from({ length: 200 }, (_, index) => (index * 37) % 101), views: ['dotplot'] },
    { data: [5, 5, 5, 5, 5], binWidth: 0.001, leafUnit: 1000 },
    { data: DONUTS, binWidth: 1e-12, start: 1e12, leafUnit: 1e-12, closed: 'left', views: ['stemleaf', 'stemleaf'] },
    { data: DONUTS, binWidth: 1e12, start: -1e12, leafUnit: 1e12, views: ['dotplot', 'histogram'] },
    { data: [-2.5, -1.25, 0, 1.75, 3.5, 3.5], binWidth: 0.25, start: -3, leafUnit: 0.1, closed: 'right' },
    { data: [-40, -12, -3, -3, -1], binWidth: 5, closed: 'left', leafUnit: 1 },
    { data: [0.001, 0.002, 0.0025, 0.004, 0.009], leafUnit: 0.001 },
    { data: [43595.28, 68681, 10234.5, 55000, 47000.25, 21000], unit: '$', binWidth: 10000, start: 0 },
    { data: [1e6, 2e6, 2.5e6, 4e6, 9e6], binWidth: 7, leafUnit: 3, quartiles: 'r7' },
    { ...DONUT_CONFIG, leafUnit: 1, closed: 'left' },
    { data: AGGRESSIVE, binWidth: 2, start: 0 },
  ];
  for (const config of configs) {
    const where = JSON.stringify(config).slice(0, 80);
    const model = normalizeHistogramConfig(config);
    const { data } = model;
    const sorted = [...data].sort((a, b) => a - b);
    assert.ok(data.length >= 1 && data.length <= DATA_LIMITS.max, where);
    assert.equal(model.usedDefault, false, where);

    const layout = histogramLayout(data, { width: model.binWidth, start: model.start, closed: model.closed });
    assert.equal(layout.width, model.binWidth, `${where}: no silent fallback`);
    assert.ok(layout.bins.length >= 1 && layout.bins.length <= MAX_DISPLAY_BINS, where);
    assert.equal(layout.bins.length, binCountFor(data, { width: model.binWidth, start: model.start, closed: model.closed }), where);
    assert.equal(counts(layout).reduce((sum, count) => sum + count, 0), data.length, where);
    assert.ok(layout.bins[0].count > 0 && layout.bins[layout.bins.length - 1].count > 0, `${where}: no empty end bins`);
    assert.ok(layout.edges.every((edge, index) => index === 0 || edge > layout.edges[index - 1]), where);

    const widths = binWidthOptions(data, model.binWidth, { start: model.start, closed: model.closed });
    assert.ok(widths.includes(model.binWidth), where);
    assert.ok(widths.every((width) => binCountFor(data, { width, start: model.start, closed: model.closed }) <= MAX_DISPLAY_BINS), where);
    const starts = startOptions(data, model.binWidth, model.start);
    assert.ok(starts.length >= 1 && starts.length <= 9, where);
    assert.ok(starts.some((start) => sameValue(start, layout.start)), `${where}: the drawn start is offered`);
    for (const start of starts) {
      assert.ok(start <= sorted[0] && start > sorted[0] - model.binWidth - 1e-9, `${where}: start ${start}`);
    }

    const display = stemDisplay(data, { leafUnit: model.leafUnit, split: model.split });
    assert.equal(display.leafUnit, model.leafUnit, `${where}: the stem display uses the chosen leaf unit`);
    assert.ok(display.lines.length <= 2 * MAX_STEM_LINES + 1, where);
    assert.equal(display.lines.reduce((sum, line) => sum + line.count, 0), data.length, where);
    assert.ok(leafUnitOptions(data, model.leafUnit).includes(model.leafUnit), where);

    const dots = dotplotStacks(data);
    assert.equal(dots.stacks.reduce((sum, stack) => sum + stack.count, 0), data.length, where);

    const summary = centreSummary(data);
    assertClean([
      centreTexts(summary, { variable: model.variable, unit: model.unit }),
      summaryLabels(summary, model.unit),
      frequencyRows(layout),
      binFacts(layout),
      layoutAnnouncement(layout),
      histogramAltText(layout, model.variable),
      layout.bins.map((bin) => binDetail(bin, layout, { decimals: summary.decimals })),
      stemText(display, { unit: model.unit, decimals: summary.decimals }),
      stemAnnouncement(display),
      dotplotText(dots),
    ], where);
    for (const cut of cutOptions(layout)) {
      for (const relation of READING_RELATIONS) {
        const reading = readFromBins(layout, data, { relation, cut });
        assert.ok(reading, `${where}: ${relation} ${cut}`);
        if (reading.readable) assert.equal(reading.barTotal, reading.count, `${where}: ${relation} ${cut}`);
        assertClean(readingText(reading, layout, { unit: model.unit }), where);
      }
    }
  }
});

/* ---------- Bins 分组 ---------- */

test('M3 p.13-14: R\'s right-closed bins give 6, 11, 10, 2, 1, with [150, 200] first', () => {
  const layout = donutLayout();
  assert.deepEqual([layout.start, layout.width, layout.closed], [150, 50, 'right']);
  assert.deepEqual(layout.edges, [150, 200, 250, 300, 350, 400]);
  assert.deepEqual(counts(layout), [6, 11, 10, 2, 1]);
  assert.deepEqual([layout.maxCount, layout.peaks, layout.gaps], [11, [1], []]);
  assert.equal(edgeDigits(layout), 0);
});

test('M3 p.8 and p.22: other boundary rules and widths draw other pictures, with visible gaps', () => {
  // The poster's left-closed bins [a, b): 4, 9, 12, 4, 0, 1, with the gap [350, 400).
  // 海报的左闭组 [a, b)：4、9、12、4、0、1，[350, 400) 是缺口。
  const poster = donutLayout('left');
  assert.deepEqual(poster.edges, [150, 200, 250, 300, 350, 400, 450]);
  assert.deepEqual(counts(poster), [4, 9, 12, 4, 0, 1]);
  assert.deepEqual([poster.peaks, poster.gaps], [[2], [4]]);
  // ggplot2 with binwidth 30 starts at 165: 4, 7, 6, 7, 4, 1, 0, 1, two tallest bars and a gap.
  // ggplot2 组距 30 时从 165 开始：4、7、6、7、4、1、0、1，有两根最高的柱子和一个缺口。
  const ggplot = histogramLayout(DONUTS, { width: 30, start: 165 });
  assert.equal(ggplot.start, 165);
  assert.deepEqual(counts(ggplot), [4, 7, 6, 7, 4, 1, 0, 1]);
  assert.deepEqual([ggplot.peaks, ggplot.gaps], [[1, 3], [6]]);
  // 2025 midterm Q15: bars of width 2 from 0 give 3, 3, 1, 1, 1, 1. 2025 年期中第 15 题。
  assert.deepEqual(counts(histogramLayout(AGGRESSIVE, { width: 2, start: 0 })), [3, 3, 1, 1, 1, 1]);
});

test('alignStart moves any start by whole widths to the edge at or below the smallest value', () => {
  assert.equal(alignStart(100, 50, 180), 150, 'no empty bar in front of the data');
  assert.equal(alignStart(200, 50, 180), 150, 'a start above the minimum moves down');
  assert.equal(alignStart(null, 50, 180), 150, 'without a start the grid goes through 0, like R');
  assert.equal(alignStart(165, 30, 180), 165);
  assert.equal(alignStart(130, 50, 180), 180, 'the minimum on an edge starts the first bin');
  assert.equal(alignStart(-1e12, 50, 180), 150);
  assert.equal(alignStart(1e12, 50, 180), 150);
  assert.equal(alignStart(0.05, 0.1, 0.3), 0.25);
  assert.equal(alignStart(null, 0.1, 0.3), 0.3, 'binary noise of 0.3 / 0.1 does not push the start down');
  assert.equal(alignStart(null, 5, -13), -15);
  assert.ok(Number.isNaN(alignStart(0, 0, 180)) && Number.isNaN(alignStart(0, 5, 'x')));
});

test('binCountFor counts exactly the bins histogramLayout draws', () => {
  for (const closed of ['right', 'left']) {
    for (const width of [10, 20, 25, 30, 50, 100, 200]) {
      for (const start of [null, 0, 15, 100, 165, 333]) {
        assert.equal(
          binCountFor(DONUTS, { width, start, closed }),
          histogramLayout(DONUTS, { width, start, closed }).bins.length,
          `${closed} ${width} ${start}`,
        );
      }
    }
  }
  assert.equal(binCountFor([], { width: 5 }), 0);
  assert.equal(binCountFor(DONUTS, { width: 0 }), 0);
});

test('bin width choices go from too many bars to too few around R\'s width', () => {
  assert.deepEqual(binWidthOptions(DONUTS, 50), [10, 20, 50, 100, 200]);
  assert.deepEqual(binWidthOptions(DONUTS, 30, { start: 165 }), [10, 20, 30, 50, 100]);
  assert.deepEqual(binWidthOptions(AGGRESSIVE, 2, { start: 0 }), [1, 2, 5, 10], 'never finer than whole acts');
  assert.deepEqual(binWidthOptions([2.4, 4.3, 17.8, 5.5, 9.1], 5), [1, 2, 5, 10]);
  assert.deepEqual(binWidthOptions([0.12, 0.47, 0.33, 0.9, 0.61], 0.1), [0.02, 0.05, 0.1, 0.2, 0.5]);
  assert.deepEqual(binWidthOptions([250, 250, 250], 50), [50], 'one value: one bar whatever the width');
  assert.deepEqual(binWidthOptions([], 50), []);
  assert.deepEqual(binWidthOptions(DONUTS), [10, 20, 50, 100, 200], 'without a width R\'s default is the centre');
});

test('start choices each keep the smallest value in the first bin and draw a different picture', () => {
  const starts = startOptions(DONUTS, 50, 100);
  assert.deepEqual(starts, [140, 150, 160, 170, 180]);
  const pictures = starts.map((start) => histogramLayout(DONUTS, { width: 50, start }));
  for (const layout of pictures) assert.ok(layout.bins[0].values.includes(180));
  // Start 140 happens to give the poster's counts; start 150 is R's picture (M3 p.14).
  // 起点 140 碰巧得到海报的计数；起点 150 就是 R 的图（第 3 单元第 14 页）。
  assert.deepEqual(pictures.map(counts), [
    [4, 9, 12, 4, 0, 1], [6, 11, 10, 2, 1], [9, 8, 11, 1, 1], [11, 11, 6, 1, 1], [13, 11, 4, 1, 1],
  ]);
  assert.deepEqual(startOptions(DONUTS, 30, 165), [155, 160, 165, 170, 175, 180]);
  assert.deepEqual(startOptions(DONUTS, 20), [165, 170, 175, 180]);
  assert.deepEqual(startOptions(AGGRESSIVE, 1), [0], 'a width of one whole act cannot shift by less');
  assert.deepEqual(startOptions(DONUTS, 50, 133), [133, 140, 150, 160, 170, 180], 'the configured grid stays available');
  assert.deepEqual(startOptions([], 50), []);
  // Data without negative values get no negative first edge, unless the config asked for one.
  // 没有负值的数据不给负的第一条边界，除非配置要求这样。
  assert.deepEqual(startOptions(AGGRESSIVE, 2, 0), [0], 'no first bin from −1 acts');
  assert.deepEqual(startOptions([12000, 30500, 61000, 68681, 10234.5], 50000), [0, 10000]);
  assert.deepEqual(startOptions(AGGRESSIVE, 2, -1), [-1, 0]);
  assert.deepEqual(startOptions([-13, -3, 2, 15], 5), [-17, -16, -15, -14, -13], 'negative data keep negative starts');
});

test('the frequency table prints intervals, frequencies, relative and cumulative relative frequencies', () => {
  const table = frequencyRows(donutLayout());
  assert.deepEqual(table.rows.map((row) => row.interval), ['[150, 200]', '(200, 250]', '(250, 300]', '(300, 350]', '(350, 400]']);
  assert.deepEqual(table.rows.map((row) => row.count), ['6', '11', '10', '2', '1']);
  assert.deepEqual(table.rows.map((row) => row.relative), ['0.200', '0.367', '0.333', '0.067', '0.033']);
  assert.deepEqual(table.rows.map((row) => row.percent), ['20%', '36.7%', '33.3%', '6.7%', '3.3%']);
  assert.deepEqual(table.rows.map((row) => row.cumulative), ['0.200', '0.567', '0.900', '0.967', '1.000']);
  assert.deepEqual(table.total, { count: '30', relative: '1.000', percent: '100%' });
  const poster = frequencyRows(donutLayout('left'));
  assert.deepEqual(poster.rows.map((row) => row.interval).slice(-2), ['[350, 400)', '[400, 450)']);
  assert.deepEqual(poster.rows.map((row) => row.gap), [false, false, false, false, true, false]);
  assert.deepEqual(frequencyRows(histogramLayout([0.2, 2.6, 4.9], { width: 2.5 })).rows.map((row) => row.interval), ['[0, 2.5]', '(2.5, 5]']);
});

test('interval notation: [a, b] keeps both ends, (a, b] is more than a and at most b, [a, b) the other way', () => {
  const [first, second] = donutLayout().bins;
  assert.deepEqual(intervalMeaning(first), { zh: '至少 150，并且最多 200', en: 'at least 150 and at most 200', inequality: '150 ≤ y ≤ 200' });
  assert.deepEqual(intervalMeaning(second), { zh: '多于 200，并且最多 250', en: 'more than 200 and at most 250', inequality: '200 < y ≤ 250' });
  assert.deepEqual(intervalMeaning(donutLayout('left').bins[1]), {
    zh: '至少 200，并且少于 250', en: 'at least 200 and less than 250', inequality: '200 ≤ y < 250',
  });
});

test('a selected bar lists its interval, its share of n and its values', () => {
  const layout = donutLayout();
  assert.deepEqual(binDetail(layout.bins[1], layout), {
    interval: '(200, 250]',
    inequality: '200 < y ≤ 250',
    meaning: { zh: '多于 200，并且最多 250', en: 'more than 200 and at most 250' },
    frequency: '11 / 30 ≈ 0.367 (36.7%)',
    values: '210, 210, 210, 220, 220, 230, 230, 250, 250, 250, 250',
    hidden: 0,
  });
  assert.equal(binDetail(layout.bins[0], layout).frequency, '6 / 30 = 0.200 (20%)');
  const gap = donutLayout('left');
  assert.deepEqual([binDetail(gap.bins[4], gap).values, binDetail(gap.bins[4], gap).frequency], ['', '0 / 30 = 0.000 (0%)']);
  const crowd = histogramLayout(Array.from({ length: 45 }, (_, index) => 1 + (index % 3) / 10), { width: 1 });
  const detail = binDetail(crowd.bins[0], crowd, { decimals: 1 });
  assert.equal(detail.values.split(', ').length, MAX_LISTED_VALUES);
  assert.equal(detail.hidden, 15);
  assert.ok(detail.values.startsWith('1, 1, 1'));
});

test('bar facts name the tallest bars and the gaps but never label the shape', () => {
  assert.deepEqual(binFacts(donutLayout()), {
    peak: { zh: '最高的柱子：(200, 250]，有 11 个个案。', en: 'Tallest bar: (200, 250] with 11 cases.' },
    gaps: {
      zh: '没有缺口（gap）：从最小值到最大值，每一组都至少有一个个案。',
      en: 'No gaps: every bin from the smallest to the largest value has at least one case.',
    },
  });
  assert.deepEqual(binFacts(donutLayout('left')).gaps, { zh: '缺口（gap，没有个案的组）：[350, 400)。', en: 'Gap (a bin with no cases): [350, 400).' });
  const ggplot = binFacts(histogramLayout(DONUTS, { width: 30, start: 165 }));
  assert.equal(ggplot.peak.en, 'Tallest bars: (195, 225] and (255, 285], with 7 cases each.');
  const twoGaps = binFacts(histogramLayout([1, 9, 10, 12], { width: 2, start: 0 }));
  assert.equal(twoGaps.gaps.en, 'Gaps (bins with no cases): (2, 4], (4, 6] and (6, 8].');
  for (const facts of [binFacts(donutLayout()), binFacts(donutLayout('left'))]) {
    assert.doesNotMatch(JSON.stringify(facts), /skew|symmetric|bimodal|unimodal|偏|对称/);
  }
});

test('announcements and the text alternative describe the bins', () => {
  assert.deepEqual(layoutAnnouncement(donutLayout()), {
    zh: '组距 50：5 个组，从 150 到 400。最高的柱子是 (200, 250]（11）。',
    en: 'Bin width 50: 5 bins from 150 to 400. Tallest bar (200, 250] (11).',
  });
  assert.deepEqual(histogramAltText(donutLayout(), { zh: '热量', en: 'Calories' }), {
    zh: '热量的直方图：5 个组，组距 50。',
    en: 'Histogram of Calories: 5 bins of width 50: [150, 200] 6; (200, 250] 11; (250, 300] 10; (300, 350] 2; (350, 400] 1.',
  });
  const fine = histogramAltText(histogramLayout(DONUTS, { width: 10 }), null);
  assert.equal(fine.en, 'Histogram of Value: 22 bins of width 10; the frequency table below lists every bin.');
  assert.equal(fine.zh, '数值的直方图：22 个组，组距 10。各组频数见下面的频数表。');
});

/* ---------- Reading percentages 读百分比 ---------- */

test('M3 p.14: "at most 200" is the first bar, 6/30 = 0.20 in proportion (or 20%)', () => {
  const layout = donutLayout();
  assert.deepEqual(cutOptions(layout), [200, 250, 300, 350]);
  assert.deepEqual(readableRelations('right'), ['at-most', 'more-than']);
  const reading = readFromBins(layout, DONUTS, { relation: 'at-most', cut: 200 });
  assert.deepEqual(
    [reading.readable, reading.bins, reading.barTotal, reading.count, reading.onCut, reading.cutBin],
    [true, [0], 6, 6, 2, 0],
  );
  const text = readingText(reading, layout, { unit: 'kcal' });
  assert.equal(text.question.en, 'What percentage of the cases have at most 200 kcal (200 or less)?');
  assert.deepEqual(text.steps.map((step) => step.en), [
    'With bins (a, b], a value equal to 200 belongs to the bar on the left of 200. So the bars to the left of 200 hold exactly the values that are at most 200 kcal (200 or less): [150, 200].',
    'The frequency of this bar is 6.',
    'Divide by n = 30: 6 / 30 = 0.20 in proportion.',
    'As a percentage: 6 / 30 × 100 = 20%.',
  ]);
  assert.equal(text.warning, null);
  assert.equal(text.answer.en, '6 of the 30 cases have at most 200 kcal (200 or less). That is, 6/30 = 0.20 in proportion (or 20%).');
  assert.equal(text.answer.zh, '30 个个案中有 6 个最多 200 kcal（200 或更少）。也就是说，比例是 6/30 = 0.20（即 20%）。');
  assert.equal(text.rCode, 'length(y[y <= 200])');
});

test('M3 p.14-16: "more than 300" adds the last two bars, 2 + 1 = 3, 3/30 = 0.10 (10%)', () => {
  const layout = donutLayout();
  const reading = readFromBins(layout, DONUTS, { relation: 'more-than', cut: 300 });
  assert.deepEqual([reading.readable, reading.bins, reading.count, reading.values], [true, [3, 4], 3, [310, 340, 400]]);
  const text = readingText(reading, layout, { unit: 'kcal' });
  assert.equal(text.steps[0].en.endsWith('hold exactly the values that are more than 300 kcal: (300, 350] and (350, 400].'), true);
  assert.equal(text.steps[1].en, 'Add their frequencies: 2 + 1 = 3.');
  assert.equal(text.steps[1].zh, '把这些柱子的频数加起来：2 + 1 = 3。');
  assert.equal(text.answer.en, '3 of the 30 cases have more than 300 kcal. That is, 3/30 = 0.10 in proportion (or 10%).');
  assert.equal(text.rCode, 'length(y[y > 300])');
});

test('M3 p.17-18: "at least 300" cannot be read from (a, b] bars; the raw data give 5/30 ≈ 0.1667', () => {
  const layout = donutLayout();
  const reading = readFromBins(layout, DONUTS, { relation: 'at-least', cut: 300 });
  assert.deepEqual(
    [reading.readable, reading.barTotal, reading.count, reading.onCut, reading.cutBin, reading.values],
    [false, 3, 5, 2, 2, [300, 300, 310, 340, 400]],
  );
  const text = readingText(reading, layout, { unit: 'kcal' });
  assert.equal(text.steps[0].en, 'The bars cannot answer this. With bins (a, b], a value equal to 300 sits in the bar (250, 300] together with values less than 300, so whole bars cannot pick out the values that are at least 300 kcal (300 or more).');
  assert.equal(text.steps[1].en, 'Count the raw data instead, as the slides do in R with `length(y[y >= 300])`: 5 values are at least 300 kcal (300 or more), namely 300, 300, 310, 340, 400.');
  assert.deepEqual(text.steps.slice(2).map((step) => step.en), [
    'Divide by n = 30: 5 / 30 ≈ 0.1667 in proportion.',
    'As a percentage: 5 / 30 × 100 ≈ 16.67%.',
  ]);
  assert.equal(text.warning.en, 'Adding the bars to the right of 300 would give 3 / 30 = 10%: it misses the 2 values equal to 300.');
  assert.equal(text.answer.en, '5 of the 30 cases have at least 300 kcal (300 or more). That is, 5/30 ≈ 0.1667 in proportion (or about 16.67%).');
  assert.equal(text.answer.zh, '30 个个案中有 5 个至少 300 kcal（300 或更多）。也就是说，比例是 5/30 ≈ 0.1667（即约 16.67%）。');
});

test('"less than" from (a, b] bars would wrongly count the values on the edge; [a, b) bars flip the readable questions', () => {
  const right = donutLayout();
  const less = readFromBins(right, DONUTS, { relation: 'less-than', cut: 250 });
  assert.deepEqual([less.readable, less.barTotal, less.count, less.onCut], [false, 17, 13, 4]);
  assert.equal(readingText(less, right).warning.en, 'Adding the bars to the left of 250 would give 17 / 30 ≈ 56.67%: it wrongly counts the 4 values equal to 250.');
  // No value equals 350, so the bars happen to be right, which only the raw data can show.
  // 没有值等于 350，所以柱子碰巧是对的，但只有原始数据能说明这一点。
  const lucky = readFromBins(right, DONUTS, { relation: 'at-least', cut: 350 });
  assert.deepEqual([lucky.readable, lucky.barTotal, lucky.count, lucky.onCut], [false, 1, 1, 0]);
  assert.equal(readingText(lucky, right).warning.en, 'In these data no value equals 350, so adding the bars happens to give the same count; only the raw data can show that.');

  const left = donutLayout('left');
  assert.deepEqual(readableRelations('left'), ['less-than', 'at-least']);
  const atLeast = readFromBins(left, DONUTS, { relation: 'at-least', cut: 300 });
  assert.deepEqual([atLeast.readable, atLeast.bins, atLeast.barTotal, atLeast.count], [true, [3, 4, 5], 5, 5]);
  assert.match(readingText(atLeast, left).steps[0].en, /^With bins \[a, b\), a value equal to 300 belongs to the bar on the right of 300\. So the bars to the right of 300 hold exactly the values that are at least 300 \(300 or more\): \[300, 350\), \[350, 400\) and \[400, 450\)\.$/);
  const atMost = readFromBins(left, DONUTS, { relation: 'at-most', cut: 200 });
  assert.deepEqual([atMost.readable, atMost.barTotal, atMost.count, atMost.cutBin], [false, 4, 6, 1]);
  assert.match(readingText(atMost, left).steps[0].en, /sits in the bar \[200, 250\) together with values greater than 200/);
});

test('2025 midterm Q15 and Module 3 practice Q3b: percentages from bars, 1/10 = 10% and 13/35 ≈ 37.14%', () => {
  const layout = histogramLayout(AGGRESSIVE, { width: 2, start: 0 });
  const reading = readFromBins(layout, AGGRESSIVE, { relation: 'more-than', cut: 10 });
  assert.deepEqual([reading.readable, reading.bins, reading.count], [true, [5], 1]);
  const text = readingText(reading, layout);
  assert.equal(text.question.en, 'What percentage of the cases have more than 10?');
  assert.equal(text.answer.en, '1 of the 10 cases has more than 10. That is, 1/10 = 0.10 in proportion (or 10%).');
  assert.deepEqual(shareOf(13, 35), {
    count: 13, n: 35, proportion: 13 / 35, percent: (13 / 35) * 100,
    sign: '≈', proportionText: '0.3714', percentSign: '≈', percentText: '37.14%',
  });
  assert.deepEqual([shareOf(6, 30).proportionText, shareOf(6, 30).percentText, shareOf(6, 30).sign], ['0.20', '20%', '=']);
  assert.deepEqual([shareOf(1, 8).proportionText, shareOf(1, 8).percentText, shareOf(1, 8).sign], ['0.125', '12.5%', '=']);
  assert.deepEqual([shareOf(0, 30).proportionText, shareOf(0, 30).percentText], ['0.00', '0%']);
});

test('readings cut only at edges between two bins; an unknown relation reads what the bars can answer', () => {
  const layout = donutLayout();
  for (const cut of [150, 400, 275, 'x', null]) assert.equal(readFromBins(layout, DONUTS, { relation: 'at-most', cut }), null);
  assert.equal(readFromBins(layout, DONUTS, { relation: 'between', cut: 250 }).relation, 'at-most');
  assert.equal(readFromBins(donutLayout('left'), DONUTS, { cut: 250 }).relation, 'less-than');
  assert.deepEqual(cutOptions(histogramLayout([5, 5, 5, 5, 5], { width: 10 })), [], 'one bin has no edge to cut at');
  assert.deepEqual(relationWords('at-least'), { zh: '至少', en: 'at least', symbol: '≥' });
  assert.deepEqual(relationWords('nonsense'), relationWords('at-most'));
  assert.ok(sameValue(0.1 + 0.2, 0.3) && !sameValue(0.3, 0.31) && !sameValue('x', 1));
});

test('units: currency symbols go first, % sticks to the number, other units follow with a space', () => {
  assert.equal(withUnit('251', 'kcal'), '251 kcal');
  assert.equal(withUnit('43595.28', '$'), '$43595.28');
  assert.equal(withUnit('−5', '$'), '−$5');
  assert.equal(withUnit('3', 'US$'), 'US$3');
  assert.equal(withUnit('12.5', '%'), '12.5%');
  assert.equal(withUnit('3', ' kg '), '3 kg');
  assert.equal(withUnit('3', ''), '3');
  assert.equal(withUnit('3', undefined), '3');
  const dollars = readFromBins(histogramLayout([12, 25, 31, 47, 55], { width: 10 }), [12, 25, 31, 47, 55], { relation: 'at-most', cut: 30 });
  assert.equal(readingText(dollars, histogramLayout([12, 25, 31, 47, 55], { width: 10 }), { unit: '$' }).question.en, 'What percentage of the cases have at most $30 (30 or less)?');
});

/* ---------- Dotplot 点图 ---------- */

test('M3 p.26: the dotplot stacks one dot per donut at its value, 5 dots at 270', () => {
  const dots = dotplotStacks(DONUTS);
  assert.equal(dots.grouped, false);
  assert.equal(dots.width, 10);
  assert.deepEqual(dots.stacks.map((stack) => [stack.value, stack.count]), [
    [180, 1], [190, 3], [200, 2], [210, 3], [220, 2], [230, 2], [250, 4],
    [270, 5], [280, 2], [290, 1], [300, 2], [310, 1], [340, 1], [400, 1],
  ]);
  assert.equal(dots.maxCount, 5);
  const text = dotplotText(dots, { zh: '热量', en: 'Calories' });
  assert.deepEqual(text.rows[7], { label: '270', count: 5 });
  assert.match(text.note.en, /^Each dot is one case; equal values stack up\./);
  assert.deepEqual(text.alt, {
    zh: '热量的点图：30 个点，最高的一叠有 5 个点。每一叠见下面的表格。',
    en: 'Dotplot of Calories: 30 dots; the tallest stack has 5. The table below lists every stack.',
  });
});

test('values closer than a fortieth of the range share a stack, like geom_dotplot(binwidth = ...)', () => {
  // The range 58681 / 40 ≈ 1467 rounds to the nice width 2000. 全距 58681 / 40 ≈ 1467，取整为整齐的宽度 2000。
  const values = [10000, 10150, 10200, 31000, 31500, 52000, 68681];
  const dots = dotplotStacks(values);
  assert.equal(dots.grouped, true);
  assert.equal(dots.width, 2000);
  assert.deepEqual(dots.stacks.map((stack) => [stack.lower, stack.upper, stack.value, stack.count]), [
    [10000, 12000, 11000, 3], [30000, 32000, 31000, 2], [52000, 54000, 53000, 1], [68000, 70000, 69000, 1],
  ]);
  assert.deepEqual(dots.stacks[0].values, [10000, 10150, 10200]);
  const text = dotplotText(dots);
  assert.deepEqual(text.rows[0], { label: '[10000, 12000)', count: 3 });
  assert.match(text.note.en, /geom_dotplot\(binwidth = 2000\)/);
  assert.deepEqual(dotplotStacks([]), { grouped: false, width: NaN, stacks: [], maxCount: 0 });
  assert.deepEqual(dotplotStacks([4, 4]).stacks.map((stack) => stack.count), [2]);
});

/* ---------- Stem-and-leaf 茎叶图 ---------- */

test('M3 p.23-25: stem(Calories, scale = 0.5), its decimal-point line, key, minimum and maximum', () => {
  const display = stemDisplay(DONUTS, { leafUnit: 10, split: true });
  assert.deepEqual(display.lines.map((line) => `${line.label} | ${line.leafText}`), [
    '1 | 8999', '2 | 001112233', '2 | 555577777889', '3 | 0014', '3 | ', '4 | 0',
  ]);
  assert.deepEqual(display.lines.map((line) => line.count), [4, 9, 12, 4, 0, 1]);
  assert.equal(display.note, 'The decimal point is 2 digit(s) to the right of the |');
  assert.deepEqual([display.key, display.first, display.last], [
    { stem: '1', leaf: 8, value: 180 }, { stem: '1', leaf: 8, value: 180 }, { stem: '4', leaf: 0, value: 400 },
  ]);
  assert.equal(display.lineWidth, 50);
  const text = stemText(display, { unit: 'kcal' });
  assert.equal(text.key.en, 'Key: 1 | 8 means 180 kcal (leaf unit 10).');
  assert.equal(text.ends.en, 'The minimum is the first leaf, 1 | 8, which is 180 kcal. The maximum is the last leaf, 4 | 0, which is 400 kcal.');
  assert.equal(text.rounded, null);
  assert.match(text.tilt.en, /^Each line covers 50 kcal, like a bar of width 50 kcal\. Tilt your head to the right/);
  assert.deepEqual(stemAnnouncement(display), { zh: '叶的单位 10：6 行，每个茎拆成两行。', en: 'Leaf unit 10: 6 lines, each stem split in two.' });
  assert.equal(stemDisplay(DONUTS, { leafUnit: 10 }).lineWidth, 100);
});

test('R\'s decimal-point line moves with the stem unit', () => {
  assert.equal(decimalPointNote(100), 'The decimal point is 2 digit(s) to the right of the |');
  assert.equal(decimalPointNote(10), 'The decimal point is 1 digit(s) to the right of the |');
  assert.equal(decimalPointNote(1), 'The decimal point is at the |');
  assert.equal(decimalPointNote(0.1), 'The decimal point is 1 digit(s) to the left of the |');
  assert.equal(decimalPointNote(0.001), 'The decimal point is 3 digit(s) to the left of the |');
});

test('leaf unit choices, split stems, rounding and negative stems', () => {
  assert.deepEqual(leafUnitOptions(DONUTS, 10), [1, 10]);
  assert.deepEqual(leafUnitOptions(AGGRESSIVE, 1), [1], 'whole acts: nothing finer, and 10 puts every value on one stem');
  assert.deepEqual(leafUnitOptions([2.4, 4.3, 17.8, 5.5, 9.1], 1), [0.1, 1]);
  assert.deepEqual(leafUnitOptions([], 1), []);
  assert.equal(defaultSplit(DONUTS, 10), true);
  assert.equal(defaultSplit(DONUTS, 1), false, '23 lines are enough without splitting');
  assert.equal(defaultSplit([250, 250, 250], 10), false, 'one line that cannot be split usefully');

  const rounded = stemDisplay([1.25, 1.34, 1.4], { leafUnit: 0.1 });
  const text = stemText(rounded, { decimals: 2 });
  assert.equal(rounded.note, 'The decimal point is at the |');
  assert.equal(text.key.en, 'Key: 1 | 3 means 1.3 (leaf unit 0.1).');
  assert.equal(text.rounded.en, 'Note: like R\'s stem(), every value is first rounded to the leaf unit, so a leaf can show a rounded value (the actual minimum is 1.25 and the maximum 1.4).');

  const negative = stemDisplay([-15, -13, -3, 2, 15], { leafUnit: 1 });
  assert.deepEqual(negative.lines.map((line) => `${line.label} | ${line.leafText}`), ['−1 | 53', '−0 | 3', '0 | 2', '1 | 5']);
  assert.deepEqual([negative.first, negative.last], [{ stem: '−1', leaf: 5, value: -15 }, { stem: '1', leaf: 5, value: 15 }]);
  assert.equal(stemText(negative).ends.en, 'The minimum is the first leaf, −1 | 5, which is −15. The maximum is the last leaf, 1 | 5, which is 15.');
  assert.deepEqual(stemText(stemDisplay([], { leafUnit: 1 })), { key: null, ends: null, rounded: null, tilt: null });
});

/* ---------- Centre 中心 ---------- */

test('M3 p.30-33: ȳ = 7530 / 30 = 251 and the median averages the 15th and 16th ordered values', () => {
  const summary = centreSummary(DONUTS);
  assert.deepEqual([summary.n, summary.sum, summary.mean, summary.median, summary.medianRank], [30, 7530, 251, 250, 15.5]);
  assert.deepEqual([summary.min, summary.max, summary.range, summary.decimals], [180, 400, 220, 0]);
  assert.deepEqual(summary.digits, { value: 0, mean: 2, median: 2 });
  const texts = centreTexts(summary, { variable: { zh: '热量', en: 'Calories' }, unit: 'kcal' });
  assert.equal(texts.meanWork, 'ȳ = Σy / n = (180 + 190 + ⋯ + 400) / 30 = 7530 / 30 = 251 kcal');
  assert.equal(texts.medianPosition, '0.5 × (n + 1) = 0.5 × (30 + 1) = 15.5');
  assert.deepEqual(texts.medianRule, {
    zh: 'n = 30 是偶数，所以中位数是第 15 个和第 16 个有序值的平均：(250 + 250) / 2 = 250 kcal。',
    en: 'n = 30 is even, so the median is the average of the 15th and the 16th ordered values: (250 + 250) / 2 = 250 kcal.',
  });
  assert.deepEqual(summaryLabels(summary, 'kcal'), {
    n: 'n = 30', mean: 'ȳ = 251 kcal', median: '250 kcal', min: '180 kcal', max: '400 kcal',
  });
});

test('odd n takes the middle value; rounded means are marked with ≈', () => {
  const summary = centreSummary([2.4, 4.3, 17.8, 5.5, 9.1, 12.25, 3.3]);
  assert.deepEqual([summary.decimals, summary.digits.mean, summary.digits.median], [2, 2, 3]);
  const texts = centreTexts(summary, { variable: { en: 'Job loss' }, unit: '%' });
  assert.equal(texts.meanWork, 'ȳ = Σy / n = (2.4 + 3.3 + ⋯ + 17.8) / 7 = 54.65 / 7 ≈ 7.81%');
  assert.equal(texts.medianRule.en, 'n = 7 is odd, so the median is the 4th ordered value: 5.5%.');
  assert.equal(texts.medianPosition, '0.5 × (n + 1) = 0.5 × (7 + 1) = 4');
  assert.equal(summaryLabels(summary, '%').mean, 'ȳ ≈ 7.81%');
  const negative = centreTexts(centreSummary([-15, -13, -3, 2]), {});
  assert.equal(negative.meanWork, 'ȳ = Σy / n = ((−15) + (−13) + (−3) + 2) / 4 = −29 / 4 = −7.25');
  assert.equal(negative.medianRule.en, 'n = 4 is even, so the median is the average of the 2nd and the 3rd ordered values: ((−13) + (−3)) / 2 = −8.');
});

test('the instructor\'s templates: "On average, <cases> have <mean> <units>" and the 50% median sentence', () => {
  const texts = centreTexts(centreSummary(DONUTS), { variable: { zh: '热量', en: 'Calories' }, unit: 'kcal' });
  assert.deepEqual(texts.meanSentence, { zh: '平均来说，[个案] 的热量是 251 kcal。', en: 'On average, [cases] have 251 kcal.' });
  // The variable's name reads as inside a sentence ("The median calories is ..."), as in the center-spread widget.
  // 变量名按句中写法给出（“The median calories is …”），与 center-spread 组件一致。
  assert.deepEqual(texts.medianSentence, {
    zh: '热量的中位数是 250 kcal。也就是说，50% 的 [个案] 最多 250 kcal（250 或更少），另外 50% 多于 250 kcal。',
    en: 'The median calories is 250 kcal. This means that 50% of [cases] have at most 250 kcal (250 or less), whereas 50% have more than 250 kcal.',
  });
  assert.match(texts.placeholderHint.en, /^On a test, replace \[cases\] with the cases of the question/);
  const plain = centreTexts(centreSummary(AGGRESSIVE), { variable: { zh: '攻击行为次数', en: 'Number of aggressive acts' } });
  assert.deepEqual(plain.meanSentence, { zh: '平均来说，[个案] 的攻击行为次数是 4.5 [单位]。', en: 'On average, [cases] have 4.5 [units].' });
  assert.equal(plain.medianSentence.en, 'The median number of aggressive acts is 3.5. This means that 50% of [cases] have at most 3.5 (3.5 or less), whereas 50% have more than 3.5.');
  assert.match(plain.placeholderHint.en, /\[units\] with the units of the variable/);
  const dollars = centreTexts(centreSummary([43595.28, 68681, 10234.5, 55000]), { variable: { en: 'Earnings' }, unit: '$' });
  assert.equal(dollars.meanSentence.en, 'On average, [cases] have $44377.7.');
  assert.match(dollars.medianSentence.en, /^The median earnings is \$49297\.64\. This means that 50% of \[cases\] have at most \$49297\.64 \(49297\.64 or less\)/);
  const titled = centreTexts(centreSummary(AGGRESSIVE), { variable: { en: 'Hours of Study per Week' }, unit: 'hours' });
  assert.ok(titled.medianSentence.en.startsWith('The median hours of study per week is 3.5 hours.'));
  const acronym = centreTexts(centreSummary(AGGRESSIVE), { variable: { en: 'GPA' } });
  assert.ok(acronym.medianSentence.en.startsWith('The median GPA is 3.5.'));
});

test('mean against median is a hint about skew, never a shape label (M3 p.35, p.42)', () => {
  const donuts = meanMedianHint(centreSummary(DONUTS), 'kcal');
  assert.equal(donuts.relation, 'greater');
  assert.equal(donuts.en, 'Here the mean ȳ = 251 kcal is greater than the median 250 kcal. A mean greater than the median often goes with a right-skewed distribution (a longer tail to the right). It is only a hint: name the shape from the graph.');
  const left = meanMedianHint(centreSummary([1, 9, 10, 10, 11]));
  assert.equal(left.relation, 'less');
  assert.match(left.en, /left-skewed distribution \(a longer tail to the left\)/);
  const equal = meanMedianHint(centreSummary([1, 2, 3, 4, 5]));
  assert.equal(equal.relation, 'equal');
  assert.match(equal.en, /equal values alone do not show that the shape is symmetric/);
  // Means that only differ beyond the printed digits count as equal. 只在显示位数以外不同的平均数算作相等。
  assert.equal(meanMedianHint(centreSummary([0, 0, 1, 2, 2.001])).relation, 'equal');
  assert.deepEqual(slideCaution(), {
    zh: '课件第 3 单元第 35 页：Tim Hortons 甜甜圈热量的平均数是 251、中位数是 250，几乎一样，可直方图却是右偏的。所以不能只靠这两个数判断形状。',
    en: 'Module 3, p.35: the Tim Hortons donut calories have mean 251 and median 250, almost the same, yet the histogram is right-skewed. So do not decide the shape from these two numbers alone.',
  });
});

test('"Describe the distribution" leaves shape and outliers to the graph and computes centre and spread', () => {
  const lines = describeLines(centreSummary(DONUTS), 'kcal');
  assert.deepEqual(lines.map((line) => line.label.en), ['Shape', 'Centre', 'Spread', 'Outliers']);
  assert.match(lines[0].text.en, /^\[read it from the graph/);
  assert.equal(lines[1].text.en, 'median 250 kcal (mean ȳ = 251 kcal)');
  assert.equal(lines[2].text.en, 'from 180 kcal to 400 kcal (Range = Max − Min = 400 − 180 = 220 kcal)');
  assert.match(lines[3].text.en, /^\[read it from the graph/);
  assert.equal(describeLines(centreSummary([-3, 4, 9, 12, 20]))[2].text.en, 'from −3 to 20 (Range = Max − Min = 20 − (−3) = 23)');
  assert.deepEqual(centreTexts(centreSummary(DONUTS), { unit: 'kcal' }).describe, lines);
});

test('data decimals are counted once per data set, at most 6', () => {
  assert.equal(dataDecimals(DONUTS), 0);
  assert.equal(dataDecimals([2.4, 12.25, 3]), 2);
  assert.equal(dataDecimals([1 / 3]), 6);
  assert.equal(dataDecimals([]), 0);
});
