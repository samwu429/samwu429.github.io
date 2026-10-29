import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUARTILE_METHODS } from '../../../../engine/widgets/statistics/shared/stats-math.js';
import {
  BOXPLOT_LIMITS,
  FINISHED_PARTS,
  METHOD_NAMES,
  ORIENTATIONS,
  axisTitle,
  axisValues,
  bandPosition,
  boxplotExtent,
  buildModels,
  chartDescription,
  compareGroups,
  constructionSteps,
  defaultOrientation,
  describeSentences,
  dotStacks,
  fenceMarks,
  fitLabel,
  groupAtBand,
  groupModel,
  hasRawData,
  isSetAside,
  isSingleValued,
  normalizeBoxplotConfig,
  partsAt,
  readoutAt,
  shapeClues,
  sortedCells,
  stageAfterChange,
  stepStatus,
  withUnit,
} from '../../../../engine/widgets/statistics/boxplot/boxplot-logic.js';

// M3 p.5 and M4 p.6: calories of the 30 Tim Hortons donuts (2014), in the order R prints them.
// 第 3 单元第 5 页、第 4 单元第 6 页：30 个 Tim Hortons 甜甜圈（2014 年）的热量，按 R 打印的顺序。
const DONUTS = [
  180, 190, 190, 190, 210, 250, 290, 300, 210, 220, 250, 270, 270, 270, 280,
  280, 300, 340, 250, 200, 200, 210, 220, 230, 230, 250, 270, 270, 400, 310,
];
// M4 p.22-24: calories by type of donut, as the course notes rebuilt them from R's favstats output.
// 第 4 单元第 22-24 页：按甜甜圈类型分组的热量，课程笔记根据 R 的 favstats 输出还原。
const CAKE = [210, 220, 250, 250, 270, 270, 270, 280, 280, 300, 340];
const FILLED = [200, 200, 210, 220, 230, 230, 250, 270, 270, 400];
const YEAST = [180, 190, 190, 190, 210, 250, 290, 300];
const TYPES = {
  title: { zh: '按类型分组的热量', en: 'Calories by type of donut' },
  variable: { zh: '热量', en: 'Calories' },
  unit: 'kcal',
  groups: [
    { name: { zh: '蛋糕', en: 'Cake' }, data: CAKE },
    { name: { zh: '夹心', en: 'Filled' }, data: FILLED },
    { name: { zh: '酵母', en: 'Yeast' }, data: YEAST },
  ],
};
// M4 practice: job loss % in 34 OECD countries, favstats output A (overall) and C (by gender), with the whisker ends
// and the plotted points of the boxplots.
// 第 4 单元练习：34 个 OECD 国家的失业比例，favstats 输出 A（全体）和 C（按性别），以及箱线图的须线端点和单独画出的点。
const OVERALL = { name: { zh: '全体', en: 'All countries' }, summary: { min: 2.4, q1: 4.325, median: 5.2, q3: 6.275, max: 17.8 }, whiskers: [2.4, 8.6], outliers: [12.2, 17.8] };
const FEMALE = { name: { zh: '女性', en: 'Female' }, summary: { min: 2.6, q1: 4.725, median: 5.45, q3: 6.325, max: 18 }, whiskers: [2.6, 7.9], outliers: [8.9, 9.3, 14.3, 18] };
const MALE = { name: { zh: '男性', en: 'Male' }, summary: { min: 2.2, q1: 4.15, median: 5.15, q3: 6.4, max: 17.6 }, whiskers: [2.2, 8.4], outliers: [10.8, 17.6] };
const GENDER = { variable: { zh: '失业比例', en: 'Job loss' }, unit: '%', groups: [FEMALE, MALE] };
// M4 practice Q2E: female minus male job loss %, favstats output E (negative Q1).
// 第 4 单元练习 Q2E：女性减男性的失业比例，favstats 输出 E（Q1 为负）。
const DIFFERENCES = { min: -0.9, q1: -0.275, median: 0.1, q3: 0.7, max: 3.5 };
// content-spec section 5.4: the two config examples of the boxplot row.
// content-spec 第 5.4 节箱线图一行给出的两个配置示例。
const SPEC_DATA = {
  title: { zh: '热量', en: 'Calories' }, variable: { zh: '热量', en: 'Calories' }, unit: 'kcal', quartiles: 'hand',
  groups: [{ name: { zh: '甜甜圈', en: 'Donuts' }, data: [150, 180, 210, 250, 400] }],
};
const SPEC_SUMMARY = {
  groups: [{ name: { zh: '甜甜圈', en: 'Donuts' }, summary: { min: 150, q1: 210, median: 250, q3: 277.5, max: 400 }, whiskers: [150, 340], outliers: [400] }],
};

const LABELS = { variable: { zh: '热量', en: 'Calories' }, unit: 'kcal' };
const donut = (method) => groupModel(normalizeBoxplotConfig({ groups: [{ data: DONUTS }] }).groups[0], method);
const stepById = (steps, id) => steps.find((step) => step.id === id);
const mathOf = (steps, id) => stepById(steps, id).lines.filter((line) => line.type === 'math').map((line) => line.text);
const englishOf = (steps, id) => stepById(steps, id).lines.map((line) => line.en ?? line.text);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('the limits match the content validator: 1-4 groups, raw data with 4-200 values, quartiles hand or r7', () => {
  assert.equal(BOXPLOT_LIMITS.groups, 4);
  assert.equal(BOXPLOT_LIMITS.minValues, 4);
  assert.equal(BOXPLOT_LIMITS.maxValues, 200);
  assert.deepEqual(Object.keys(METHOD_NAMES), [...QUARTILE_METHODS]);
  assert.deepEqual([...ORIENTATIONS], ['horizontal', 'vertical']);
});

test('content-spec 5.4: both config examples are read without losing anything', () => {
  const raw = normalizeBoxplotConfig(SPEC_DATA);
  assert.equal(raw.usedDefault, false);
  assert.deepEqual(raw.title, SPEC_DATA.title);
  assert.deepEqual(raw.variable, SPEC_DATA.variable);
  assert.equal(raw.unit, 'kcal');
  assert.equal(raw.quartiles, 'hand');
  assert.deepEqual(raw.groups.map((group) => [group.kind, group.values]), [['data', [150, 180, 210, 250, 400]]]);

  const given = normalizeBoxplotConfig(SPEC_SUMMARY);
  const [group] = given.groups;
  assert.equal(group.kind, 'summary');
  assert.deepEqual(group.summary, SPEC_SUMMARY.groups[0].summary);
  assert.deepEqual(group.whiskers, [150, 340]);
  assert.deepEqual(group.outliers, [400]);
  assert.deepEqual(given.title, { zh: '箱线图', en: 'Boxplot' });
  assert.equal(given.unit, '');
});

test('every config the validator accepts is read in full and runs through every function', () => {
  const many = Array.from({ length: 200 }, (_, index) => (index * 37) % 101);
  const configs = [
    SPEC_DATA,
    SPEC_SUMMARY,
    TYPES,
    { ...TYPES, quartiles: 'r7' },
    GENDER,
    { groups: [OVERALL, FEMALE, MALE, { name: { zh: '差', en: 'Difference' }, summary: DIFFERENCES }] },
    { groups: [{ name: { zh: '四个数', en: 'Four values' }, data: [1, 2, 3, 4] }, { name: { zh: '二百个数', en: '200 values' }, data: many }] },
    { groups: [{ name: { zh: '相同', en: 'Equal' }, summary: { min: 310, q1: 310, median: 310, q3: 310, max: 310 } }] },
    { groups: [{ name: { zh: '边界', en: 'Edges' }, summary: { min: 1, q1: 2, median: 3, q3: 4, max: 5 }, whiskers: [2, 4], outliers: [] }] },
    { groups: [{ name: { zh: '两个 400', en: 'Two 400s' }, summary: SPEC_SUMMARY.groups[0].summary, whiskers: [150, 340], outliers: [400, 400] }] },
    { groups: [{ name: { zh: '小数', en: 'Decimals' }, data: [0.25, -1.5, 3.75, 2, 2, 9.125] }] },
  ];
  for (const config of configs) {
    const setup = normalizeBoxplotConfig(config);
    assert.equal(setup.usedDefault, false);
    assert.equal(setup.groups.length, config.groups.length);
    setup.groups.forEach((group, index) => {
      const source = config.groups[index];
      assert.deepEqual(group.name, source.name);
      if (source.data) assert.deepEqual(group.values, source.data);
      else {
        assert.deepEqual(group.summary, source.summary);
        assert.deepEqual(group.whiskers, source.whiskers ?? null);
        assert.deepEqual(group.outliers, [...(source.outliers ?? [])].sort((a, b) => a - b));
      }
    });
    for (const method of QUARTILE_METHODS) {
      const models = buildModels(setup.groups, method);
      const extent = boxplotExtent(models);
      assert.ok(extent.max > extent.min);
      models.forEach((model) => {
        const steps = constructionSteps(model);
        assert.equal(steps[steps.length - 1].id, 'draw');
        steps.forEach((step, stage) => {
          partsAt(steps, stage);
          readoutAt(model, steps, stage, extent);
          assert.ok(stepStatus(steps, stage));
        });
        describeSentences(model, setup, { groupCount: models.length });
        shapeClues(model);
        sortedCells(model);
      });
      compareGroups(models, setup);
      assert.ok(chartDescription(models, setup, { steps: constructionSteps(models[0]), stage: 0 }).length > 0);
    }
  }
});

test('normalizeBoxplotConfig clamps sizes and skips groups it cannot draw', () => {
  const groups = Array.from({ length: 6 }, (_, index) => ({ data: [index, 1, 2, 3, 4] }));
  assert.equal(normalizeBoxplotConfig({ groups }).groups.length, 4);

  const long = Array.from({ length: 250 }, (_, index) => index);
  assert.deepEqual(normalizeBoxplotConfig({ groups: [{ data: long }] }).groups[0].values, long.slice(0, 200));

  const setup = normalizeBoxplotConfig({
    quartiles: 'R',
    unit: '   kilocalories per serving   ',
    groups: [
      'not a group',
      { data: [1, 2, 3] },
      { data: [5, '6', 'x', null, 7, 8, Infinity] },
      { data: [1, 2], summary: { min: 1, q1: 2, median: 3, q3: 4, max: 5 }, whiskers: [0, 4], outliers: 'many' },
      { summary: { min: 1, q1: 3, median: 2, q3: 4, max: 5 } },
      { summary: { min: 1, q1: 2, median: 3, q3: 4 } },
    ],
  });
  assert.equal(setup.quartiles, 'hand');
  assert.equal(setup.unit, 'kilocalories per serving', 'a long unit is kept whole, as the validator accepts it');
  assert.equal(setup.groups.length, 2);
  const [numbers, summary] = setup.groups;
  assert.deepEqual(numbers.values, [5, 6, 7, 8]);
  assert.deepEqual(numbers.name, { zh: '第 1 组', en: 'Group 1' });
  assert.equal(summary.kind, 'summary');
  assert.deepEqual(summary.name, { zh: '第 2 组', en: 'Group 2' });
  assert.equal(summary.whiskers, null, 'a whisker end below Min is dropped');
  assert.deepEqual(summary.outliers, []);
  assert.equal(normalizeBoxplotConfig({ unit: 12, groups: [{ data: [1, 2, 3, 4] }] }).unit, '');
  assert.equal(normalizeBoxplotConfig({ quartiles: 'r7', groups: [{ data: [1, 2, 3, 4] }] }).quartiles, 'r7');
});

test('without a usable group the M4 donut example is shown', () => {
  for (const config of [undefined, null, [], 'boxplot', {}, { groups: [] }, { groups: [{ data: [1, 2] }] }]) {
    const setup = normalizeBoxplotConfig(config);
    assert.equal(setup.usedDefault, true);
    assert.deepEqual(setup.variable, { zh: '热量', en: 'Calories' });
    assert.equal(setup.unit, 'kcal');
    assert.equal(setup.groups[0].values.length, 30);
  }
  assert.equal(normalizeBoxplotConfig({ quartiles: 'r7' }).quartiles, 'r7');
});

test('hasRawData and defaultOrientation', () => {
  assert.equal(hasRawData(normalizeBoxplotConfig(TYPES).groups), true);
  assert.equal(hasRawData(normalizeBoxplotConfig(GENDER).groups), false);
  assert.equal(hasRawData(null), false);
  assert.equal(defaultOrientation(normalizeBoxplotConfig(SPEC_DATA).groups), 'horizontal');
  assert.equal(defaultOrientation(normalizeBoxplotConfig(TYPES).groups), 'vertical');
});

test('M4 p.6-10: hand quartiles of the donuts are 210 and 280 (IQR 70), whiskers 180 and 340, 400 plotted', () => {
  const model = donut('hand');
  assert.deepEqual([model.min, model.q1, model.median, model.q3, model.max, model.iqr], [180, 210, 250, 280, 400, 70]);
  assert.deepEqual(
    [model.fences.lowerInner, model.fences.upperInner, model.fences.lowerOuter, model.fences.upperOuter],
    [105, 385, 0, 490],
  );
  assert.deepEqual([model.whiskers.lower, model.whiskers.upper], [180, 340]);
  assert.deepEqual(model.points, [{ value: 400, level: 'suspect', side: 'high', source: 'data' }]);
  assert.equal(model.range, 220);
});

test('M4 p.14: with R\'s quartiles the working reads 277.5 − 210 = 67.5, 101.25, 108.75 and 378.75', () => {
  const steps = constructionSteps(donut('r7'));
  assert.deepEqual(mathOf(steps, 'iqr'), ['IQR = Q3 − Q1 = 277.5 − 210 = 67.5']);
  assert.deepEqual(mathOf(steps, 'step'), ['1.5 × IQR = 1.5 × 67.5 = 101.25']);
  assert.deepEqual(mathOf(steps, 'inner'), [
    'Lower inner fence = Q1 − 1.5 × IQR = 210 − 101.25 = 108.75',
    'Upper inner fence = Q3 + 1.5 × IQR = 277.5 + 101.25 = 378.75',
  ]);
  assert.deepEqual(mathOf(steps, 'outer'), [
    '3 × IQR = 3 × 67.5 = 202.5',
    'Lower outer fence = Q1 − 3 × IQR = 210 − 202.5 = 7.5',
    'Upper outer fence = Q3 + 3 × IQR = 277.5 + 202.5 = 480',
  ]);
  const whiskers = englishOf(steps, 'whiskers');
  assert.ok(whiskers.includes('Lower whisker: from Q1 = 210 to the smallest value ≥ 108.75, which is 180.'));
  assert.ok(whiskers.includes('Upper whisker: from Q3 = 277.5 to the largest value ≤ 378.75, which is 340.'));
  assert.ok(englishOf(steps, 'outliers').includes('400 is a suspect outlier since it is not above 480 but it is between 378.75 and 480.'));
  assert.deepEqual(mathOf(steps, 'quartiles'), [
    'Q1 position: h = (30 − 1) × 0.25 + 1 = 8.25',
    'Q1 = 8th value + 0.25 × (9th value − 8th value) = 210 + 0.25 × (210 − 210) = 210',
    'Q3 position: h = (30 − 1) × 0.75 + 1 = 22.75',
    'Q3 = 22nd value + 0.75 × (23rd value − 22nd value) = 270 + 0.75 × (280 − 270) = 277.5',
  ]);
  assert.ok(englishOf(steps, 'quartiles').some((line) => line.includes('hand method gives Q1 = 210, Q3 = 280 (IQR = 70)')));
});

test('hand steps follow M4 p.6: position 15.5, then the 8th value of each half of 15', () => {
  const steps = constructionSteps(donut('hand'));
  assert.deepEqual(steps.map((step) => step.id),
    ['sort', 'median', 'quartiles', 'five', 'iqr', 'step', 'inner', 'outer', 'outliers', 'whiskers', 'draw']);
  assert.deepEqual(mathOf(steps, 'median'), ['Position = 0.5 × (n + 1) = 0.5 × (30 + 1) = 15.5', 'Median = (250 + 250) / 2 = 250']);
  assert.deepEqual(mathOf(steps, 'quartiles'), ['Q1 = 8th value of the lower half = 210', 'Q3 = 8th value of the upper half (23rd overall) = 280']);
  assert.ok(englishOf(steps, 'quartiles')[0].includes('the lower half is the 1st to 15th values and the upper half the 16th to 30th values'));
  assert.ok(englishOf(steps, 'quartiles').some((line) => line.includes("R's summary() gives Q1 = 210, Q3 = 277.5 (IQR = 67.5)")));
  assert.deepEqual(mathOf(steps, 'five'), ['Min = 180, Q1 = 210, Median = 250, Q3 = 280, Max = 400']);
  assert.deepEqual(mathOf(steps, 'iqr'), ['IQR = Q3 − Q1 = 280 − 210 = 70']);
  assert.deepEqual(mathOf(steps, 'inner'), [
    'Lower inner fence = Q1 − 1.5 × IQR = 210 − 105 = 105',
    'Upper inner fence = Q3 + 1.5 × IQR = 280 + 105 = 385',
  ]);
  assert.deepEqual(mathOf(steps, 'outliers'), ['Suspect outliers: 400', 'Highly suspect outliers: none']);
});

test('odd n (Cake, n = 11): the median is left out of both halves and the steps say so', () => {
  const cake = buildModels(normalizeBoxplotConfig(TYPES).groups, 'hand')[0];
  assert.deepEqual([cake.q1, cake.median, cake.q3], [250, 270, 280]);
  const steps = constructionSteps(cake);
  assert.deepEqual(mathOf(steps, 'median'), ['Position = 0.5 × (n + 1) = 0.5 × (11 + 1) = 6', 'Median = 6th value = 270']);
  const lines = stepById(steps, 'quartiles').lines;
  assert.ok(lines.some((line) => line.en?.includes('is not included in either half')));
  const extra = lines.find((line) => line.type === 'extra');
  assert.ok(extra.zh.startsWith('补充（课件外）：'));
  assert.ok(extra.en.startsWith('Not on the slides: '));
  assert.deepEqual(mathOf(steps, 'quartiles'), ['Q1 = 3rd value of the lower half = 250', 'Q3 = 3rd value of the upper half (9th overall) = 280']);

  const cells = sortedCells(cake);
  assert.deepEqual(cells[5], { position: 6, value: 270, text: '270', half: null, marks: ['median'], level: 'none', split: false });
  assert.deepEqual(cells.filter((cell) => cell.marks.includes('q1')).map((cell) => cell.position), [3]);
  assert.deepEqual(cells.filter((cell) => cell.marks.includes('q3')).map((cell) => cell.position), [9]);
  assert.equal(cells[10].level, 'suspect');
  assert.ok(cells.every((cell) => !cell.split));
});

test('M4 p.22-24: groups by type with R\'s quartiles (favstats) and with the hand method', () => {
  const setup = normalizeBoxplotConfig(TYPES);
  const [cake, filled, yeast] = buildModels(setup.groups, 'r7');
  assert.deepEqual([cake.q1, cake.q3, cake.iqr, cake.whiskers.lower, cake.whiskers.upper], [250, 280, 30, 210, 300]);
  assert.deepEqual(cake.points.map((point) => [point.value, point.level]), [[340, 'suspect']]);
  assert.deepEqual([filled.q1, filled.q3, filled.iqr], [212.5, 265, 52.5]);
  assert.deepEqual([filled.fences.lowerInner, filled.fences.upperInner, filled.fences.upperOuter], [133.75, 343.75, 422.5]);
  assert.deepEqual(filled.points.map((point) => [point.value, point.level]), [[400, 'suspect']]);
  assert.deepEqual([yeast.q1, yeast.q3, yeast.iqr, yeast.fences.lowerInner, yeast.fences.upperInner], [190, 260, 70, 85, 365]);
  assert.deepEqual(yeast.points, []);
  assert.deepEqual([yeast.whiskers.lower, yeast.whiskers.upper], [180, 300]);
  assert.ok(mathOf(constructionSteps(filled), 'quartiles').includes(
    'Q1 = 3rd value + 0.25 × (4th value − 3rd value) = 210 + 0.25 × (220 − 210) = 212.5',
  ));

  const hand = buildModels(setup.groups, 'hand');
  assert.deepEqual(hand.map((model) => [model.q1, model.q3]), [[250, 280], [210, 270], [190, 270]]);
});

test('M4 practice Q2C: given summaries sort the plotted points into suspect and highly suspect outliers', () => {
  const [female, male] = buildModels(normalizeBoxplotConfig(GENDER).groups);
  near(female.fences.upperInner, 8.725);
  near(female.fences.upperOuter, 11.125);
  near(male.fences.upperInner, 9.775);
  near(male.fences.upperOuter, 13.15);
  assert.deepEqual(female.points.map((point) => [point.value, point.level]),
    [[8.9, 'suspect'], [9.3, 'suspect'], [14.3, 'highly-suspect'], [18, 'highly-suspect']]);
  assert.deepEqual(male.points.map((point) => [point.value, point.level]), [[10.8, 'suspect'], [17.6, 'highly-suspect']]);

  const steps = constructionSteps(female);
  assert.equal(steps[0].id, 'given');
  assert.deepEqual(mathOf(steps, 'given'), ['Min = 2.6, Q1 = 4.725, Median = 5.45, Q3 = 6.325, Max = 18']);
  assert.deepEqual(mathOf(steps, 'iqr'), ['IQR = Q3 − Q1 = 6.325 − 4.725 = 1.6']);
  assert.ok(mathOf(steps, 'inner').includes('Upper inner fence = Q3 + 1.5 × IQR = 6.325 + 2.4 = 8.725'));
  assert.ok(mathOf(steps, 'outer').includes('Upper outer fence = Q3 + 3 × IQR = 6.325 + 4.8 = 11.125'));
  const outliers = englishOf(steps, 'outliers');
  assert.ok(outliers.includes('9.3 is a suspect outlier since it is not above 11.125 but it is between 8.725 and 11.125.'));
  assert.ok(outliers.includes('18 is a highly suspect outlier since it is above 11.125 (the upper outer fence).'));
  assert.ok(englishOf(steps, 'whiskers').includes('Upper whisker: from Q3 = 6.325 to 7.9 (given).'));
});

test('M4 practice Q1B: 1.5 × IQR = 2.925 gives the upper inner fence 9.2; 12.2 is just above the outer fence 12.125', () => {
  const model = buildModels(normalizeBoxplotConfig({ groups: [OVERALL] }).groups)[0];
  const steps = constructionSteps(model);
  assert.deepEqual(mathOf(steps, 'step'), ['1.5 × IQR = 1.5 × 1.95 = 2.925']);
  assert.deepEqual(mathOf(steps, 'inner'), [
    'Lower inner fence = Q1 − 1.5 × IQR = 4.325 − 2.925 = 1.4',
    'Upper inner fence = Q3 + 1.5 × IQR = 6.275 + 2.925 = 9.2',
  ]);
  assert.ok(mathOf(steps, 'outer').includes('Lower outer fence = Q1 − 3 × IQR = 4.325 − 5.85 = −1.525'));
  assert.deepEqual(model.points.map((point) => point.level), ['highly-suspect', 'highly-suspect']);
});

test('negative quartiles get parentheses: IQR = 0.7 − (−0.275) = 0.975 (M4 practice Q2E)', () => {
  const group = { name: { zh: '差', en: 'Female − Male' }, summary: DIFFERENCES, whiskers: [-0.9, 1.7], outliers: [3.5] };
  const model = buildModels(normalizeBoxplotConfig({ groups: [group] }).groups)[0];
  const steps = constructionSteps(model);
  assert.deepEqual(mathOf(steps, 'iqr'), ['IQR = Q3 − Q1 = 0.7 − (−0.275) = 0.975']);
  assert.deepEqual(mathOf(steps, 'inner'), [
    'Lower inner fence = Q1 − 1.5 × IQR = −0.275 − 1.4625 = −1.7375',
    'Upper inner fence = Q3 + 1.5 × IQR = 0.7 + 1.4625 = 2.1625',
  ]);
  assert.ok(mathOf(steps, 'outer').includes('Upper outer fence = Q3 + 3 × IQR = 0.7 + 2.925 = 3.625'));
  assert.deepEqual(model.points.map((point) => [point.value, point.level]), [[3.5, 'suspect']]);
});

test('a value exactly on a fence is inside it (M4 p.14: ≥ and ≤)', () => {
  const onInner = groupModel(normalizeBoxplotConfig({ groups: [{ data: [0, 10, 10, 20, 20, 30, 30, 60] }] }).groups[0]);
  assert.deepEqual([onInner.q1, onInner.q3, onInner.fences.upperInner], [10, 30, 60]);
  assert.deepEqual(onInner.points, []);
  assert.equal(onInner.whiskers.upper, 60);

  const onOuter = groupModel(normalizeBoxplotConfig({ groups: [{ data: [0, 10, 10, 20, 20, 30, 30, 90] }] }).groups[0]);
  assert.equal(onOuter.fences.upperOuter, 90);
  assert.deepEqual(onOuter.points.map((point) => [point.value, point.level]), [[90, 'suspect']]);
  assert.equal(onOuter.whiskers.upper, 30);
});

test('a summary without whisker ends: Min inside the fences ends the whisker, Max beyond them is plotted', () => {
  const model = buildModels(normalizeBoxplotConfig({ groups: [{ name: 'Difference', summary: DIFFERENCES }] }).groups)[0];
  assert.equal(model.whiskers.lowerFrom, 'min');
  assert.equal(model.whiskers.lower, -0.9);
  assert.equal(model.whiskers.upperFrom, 'unknown');
  assert.ok(Number.isNaN(model.whiskers.upper));
  assert.deepEqual(model.points, [{ value: 3.5, level: 'suspect', side: 'high', source: 'max' }]);

  const steps = constructionSteps(model);
  assert.ok(englishOf(steps, 'whiskers').some((line) => line.includes('so this whisker end is unknown')));
  const readout = readoutAt(model, steps, steps.length - 1, boxplotExtent([model]));
  assert.deepEqual(readout.find((item) => item.id === 'whiskers').value, { zh: '−0.9 – 未知', en: '−0.9 – unknown' });
  assert.deepEqual(compareGroups([model], {}).rows[0].whiskers, { zh: '−0.9 – 未知', en: '−0.9 – unknown' });
  assert.ok(shapeClues(model).en.includes('upper whisker: unknown'));
});

test('given whiskers that stop short of Max put Max on the plot, once per given value', () => {
  const base = SPEC_SUMMARY.groups[0];
  const plotted = (group) => groupModel(normalizeBoxplotConfig({ groups: [group] }).groups[0]).points;
  assert.deepEqual(plotted({ ...base, outliers: [] }), [{ value: 400, level: 'suspect', side: 'high', source: 'max' }]);
  assert.deepEqual(plotted(base), [{ value: 400, level: 'suspect', side: 'high', source: 'given' }]);
  assert.deepEqual(plotted({ ...base, outliers: [400, 400] }).map((point) => point.value), [400, 400]);
  const inside = plotted({ ...base, outliers: [300, 400] });
  assert.equal(inside[0].level, 'none');
  const steps = constructionSteps(groupModel(normalizeBoxplotConfig({ groups: [{ ...base, outliers: [300, 400] }] }).groups[0]));
  assert.ok(englishOf(steps, 'outliers').some((line) => line.startsWith('300 is plotted individually in the given boxplot')));
});

test('the value axis covers the data and the inner fences, not 0 and not the outer fences', () => {
  const model = donut('hand');
  const extent = boxplotExtent([model]);
  assert.deepEqual([extent.min, extent.max, extent.step], [50, 450, 50]);
  assert.ok(axisValues([model]).includes(105) && axisValues([model]).includes(385));
  assert.deepEqual(fenceMarks(model, extent).map((mark) => [mark.kind, mark.side, mark.value, mark.inside]), [
    ['inner', 'low', 105, true], ['inner', 'high', 385, true], ['outer', 'low', 0, false], ['outer', 'high', 490, false],
  ]);
  assert.ok(fenceMarks(model, undefined).every((mark) => !mark.inside));
  const negative = boxplotExtent(buildModels(normalizeBoxplotConfig({ groups: [{ summary: DIFFERENCES }] }).groups));
  assert.ok(negative.min <= -1.7375 && negative.max >= 3.5);
});

test('partsAt builds the drawing step by step and ends with the clean boxplot', () => {
  const steps = constructionSteps(donut('hand'));
  const on = (stage) => Object.entries(partsAt(steps, stage)).filter(([, shown]) => shown).map(([name]) => name).sort();
  assert.deepEqual(on(0), ['dots']);
  assert.deepEqual(on(1), ['dots', 'median']);
  assert.deepEqual(on(2), ['dots', 'median', 'quartileLines']);
  assert.deepEqual(on(3), ['box', 'dots', 'median', 'minmax', 'quartileLines']);
  assert.ok(partsAt(steps, 4).iqrBracket && !partsAt(steps, 5).iqrBracket);
  assert.ok(partsAt(steps, 5).stepBrackets && !partsAt(steps, 6).stepBrackets);
  assert.ok(partsAt(steps, 6).innerFences && !partsAt(steps, 6).outerFences);
  assert.ok(partsAt(steps, 7).outerFences && !partsAt(steps, 7).points);
  assert.ok(partsAt(steps, 8).points && !partsAt(steps, 8).whiskers);
  assert.ok(partsAt(steps, 9).whiskers && partsAt(steps, 9).innerFences);
  assert.deepEqual(partsAt(steps, 10), { ...FINISHED_PARTS });
  assert.deepEqual(partsAt(steps, 99), { ...FINISHED_PARTS });
  assert.deepEqual(partsAt([], 0), { ...FINISHED_PARTS });
  assert.deepEqual(Object.entries(FINISHED_PARTS).filter(([, shown]) => shown).map(([name]) => name).sort(),
    ['box', 'median', 'points', 'whiskers']);

  const given = constructionSteps(groupModel(normalizeBoxplotConfig(SPEC_SUMMARY).groups[0]));
  assert.deepEqual(Object.entries(partsAt(given, 0)).filter(([, shown]) => shown).map(([name]) => name).sort(), ['box', 'median', 'minmax']);
});

test('stageAfterChange keeps the same step when it exists, otherwise shows the finished boxplot', () => {
  const hand = constructionSteps(donut('hand'));
  const r7 = constructionSteps(donut('r7'));
  const given = constructionSteps(groupModel(normalizeBoxplotConfig(SPEC_SUMMARY).groups[0]));
  assert.equal(stageAfterChange(hand, 6, r7), 6);
  assert.equal(stageAfterChange(hand, 6, given), given.findIndex((step) => step.id === 'inner'));
  assert.equal(stageAfterChange(hand, 0, given), given.length - 1);
  assert.equal(stageAfterChange([], 3, given), given.length - 1);
  assert.equal(stageAfterChange(hand, 2, []), 0);
});

test('stepStatus names the step and its first formula', () => {
  const steps = constructionSteps(donut('hand'));
  const status = stepStatus(steps, 5);
  assert.equal(status.number, 6);
  assert.equal(status.total, 11);
  assert.equal(status.detail, '1.5 × IQR = 1.5 × 70 = 105');
  assert.equal(status.zh, '第 6 步（共 11 步）：1.5 倍的 IQR');
  assert.equal(status.en, 'Step 6 of 11: 1.5 × IQR');
  assert.equal(stepStatus(steps, 0).detail, '');
  assert.equal(stepStatus([], 0), null);
});

test('readoutAt lists the numbers found so far and flags outer fences beyond the axis', () => {
  const model = donut('hand');
  const steps = constructionSteps(model);
  const extent = boxplotExtent([model]);
  const ids = (stage) => readoutAt(model, steps, stage, extent).map((item) => item.id);
  assert.deepEqual(ids(0), ['n']);
  assert.deepEqual(ids(3), ['n', 'min', 'q1', 'median', 'q3', 'max']);
  assert.equal(ids(10).length, 13);
  const outer = readoutAt(model, steps, 7, extent).find((item) => item.id === 'outerFences');
  assert.equal(outer.value, '0, 490');
  assert.deepEqual(outer.note, { zh: '超出图的范围', en: 'beyond the axis' });
  const final = readoutAt(model, steps, 10, extent);
  assert.equal(final.find((item) => item.id === 'suspect').value, '400');
  assert.deepEqual(final.find((item) => item.id === 'highly').value, { zh: '无', en: 'none' });
  assert.equal(final.find((item) => item.id === 'whiskers').value, '180 – 340');

  const given = groupModel(normalizeBoxplotConfig(SPEC_SUMMARY).groups[0]);
  assert.deepEqual(readoutAt(given, constructionSteps(given), 0).map((item) => item.id), ['min', 'q1', 'median', 'q3', 'max']);
});

test('sortedCells marks the halves, the median, Q1 and Q3 like M4 p.6', () => {
  const cells = sortedCells(donut('hand'));
  assert.equal(cells.length, 30);
  assert.ok(cells.slice(0, 15).every((cell) => cell.half === 'lower'));
  assert.ok(cells.slice(15).every((cell) => cell.half === 'upper'));
  const at = (mark) => cells.filter((cell) => cell.marks.includes(mark)).map((cell) => cell.position);
  assert.deepEqual(at('q1'), [8]);
  assert.deepEqual(at('median'), [15, 16]);
  assert.deepEqual(at('q3'), [23]);
  assert.deepEqual(cells.filter((cell) => cell.split).map((cell) => cell.position), [16]);
  assert.equal(cells[29].level, 'suspect');

  const r7 = sortedCells(donut('r7'));
  assert.deepEqual(r7.filter((cell) => cell.marks.includes('q1')).map((cell) => cell.position), [8, 9]);
  assert.deepEqual(r7.filter((cell) => cell.marks.includes('q3')).map((cell) => cell.position), [22, 23]);
  assert.ok(r7.every((cell) => cell.half === null && !cell.split));
  assert.deepEqual(sortedCells(groupModel(normalizeBoxplotConfig(SPEC_SUMMARY).groups[0])), []);
});

test('dotStacks stacks tied values, bandPosition and groupAtBand map groups to bands', () => {
  assert.deepEqual(dotStacks([400, 250, 250, 'x', 270, 250]), [
    { value: 250, slot: 0, count: 3 }, { value: 250, slot: 1, count: 3 }, { value: 250, slot: 2, count: 3 },
    { value: 270, slot: 0, count: 1 }, { value: 400, slot: 0, count: 1 },
  ]);
  assert.deepEqual(dotStacks(null), []);
  assert.deepEqual([0, 1, 2].map((index) => bandPosition(index, 3, 'horizontal')), [2, 1, 0]);
  assert.deepEqual([0, 1, 2].map((index) => bandPosition(index, 3, 'vertical')), [0, 1, 2]);
  assert.equal(groupAtBand(2.5, 3, 'horizontal'), 0);
  assert.equal(groupAtBand(0.2, 3, 'vertical'), 0);
  assert.equal(groupAtBand(3, 3, 'vertical'), 2);
  assert.equal(groupAtBand(-0.1, 3, 'vertical'), -1);
  assert.equal(groupAtBand(NaN, 3, 'vertical'), -1);
});

test('describeSentences follow the instructor\'s templates (M4 p.17 and the M4 practice boxplot table)', () => {
  const [centre, spread, outliers] = describeSentences(donut('hand'), LABELS);
  assert.equal(centre.en, 'The median calories was 250 kcal. This means that 50% of the observations were at most 250 kcal '
    + '(250 kcal or less), whereas 50% were more than 250 kcal.');
  assert.equal(spread.en, 'Calories ranged from 180 kcal to 400 kcal. The middle 50% of the observations were between 210 kcal '
    + 'and 280 kcal (IQR = Q3 − Q1 = 70 kcal).');
  assert.equal(outliers.en, '1 observation was plotted individually: 400 kcal (suspect outlier).');
  assert.equal(outliers.zh, '有 1 个观测值被单独画出：400 kcal（可疑离群值）。');

  const models = buildModels(normalizeBoxplotConfig(TYPES).groups, 'r7');
  const yeast = describeSentences(models[2], LABELS, { groupCount: 3 });
  assert.ok(yeast[0].en.startsWith('For Yeast, the median calories was 200 kcal.'));
  assert.ok(yeast[1].en.startsWith('For Yeast, calories ranged from 180 kcal to 300 kcal.'));
  assert.equal(yeast[2].en, 'For Yeast, no observations were plotted individually: no value is beyond the inner fences.');
  assert.ok(yeast[0].zh.startsWith('酵母：热量的中位数是 200 kcal。'));

  const female = buildModels(normalizeBoxplotConfig(GENDER).groups)[0];
  assert.equal(describeSentences(female, GENDER)[2].en,
    '4 observations were plotted individually: 8.9% and 9.3% (suspect outliers); 14.3% and 18% (highly suspect outliers).');
});

test('compareGroups: three groups name the highest median and the smallest IQR and range (M4 p.18-24)', () => {
  const setup = normalizeBoxplotConfig(TYPES);
  const { rows, sentences } = compareGroups(buildModels(setup.groups, 'r7'), setup);
  assert.deepEqual(rows.map((row) => [row.n, row.q1, row.median, row.q3, row.iqr, row.range, row.suspect, row.highlySuspect]), [
    ['11', '250', '270', '280', '30', '130', '340', '—'],
    ['10', '212.5', '230', '265', '52.5', '200', '400', '—'],
    ['8', '190', '200', '260', '70', '120', '—', '—'],
  ]);
  assert.deepEqual(sentences.map((sentence) => sentence.en), [
    'The median calories is highest for Cake (270 kcal) and lowest for Yeast (200 kcal).',
    'Cake has the smallest IQR (30 kcal), so the middle 50% varies least there; Yeast has the largest IQR (70 kcal).',
    'Yeast has the smallest range (120 kcal); Filled has the largest range (200 kcal).',
    'Plotted individually: Cake 340; Filled 400; Yeast none.',
  ]);
  assert.equal(sentences[0].zh, '热量的中位数：蛋糕最高（270 kcal），酵母最低（200 kcal）。');

  const tied = normalizeBoxplotConfig({ groups: [{ name: 'A', data: [1, 2, 3, 4, 5] }, { name: 'B', data: [1, 2, 3, 4, 6] }, { name: 'C', data: [0, 1, 2, 3, 4] }] });
  assert.equal(compareGroups(buildModels(tied.groups), tied).sentences[0].en, 'The median value is highest for A and B (3) and lowest for C (2).');
  assert.deepEqual(compareGroups(buildModels(normalizeBoxplotConfig(SPEC_DATA).groups), SPEC_DATA).sentences, []);
});

// M4 p.22-24 (favstats on p.23): the four donut types, where Other is a single donut of 310 kcal.
// 第 4 单元第 22-24 页（第 23 页的 favstats）：四种甜甜圈，其中 Other 只有一个 310 kcal 的甜甜圈。
const DONUT_TYPES = (otherExtra = {}) => ({
  variable: { zh: '热量', en: 'Calories' },
  unit: 'kcal',
  groups: [
    { name: { zh: '蛋糕型', en: 'Cake' }, summary: { min: 210, q1: 250, median: 270, q3: 280, max: 340 }, whiskers: [210, 300], outliers: [340] },
    { name: { zh: '夹馅型', en: 'Filled' }, summary: { min: 200, q1: 212.5, median: 230, q3: 265, max: 400 }, whiskers: [200, 270], outliers: [400] },
    { name: { zh: '其他', en: 'Other' }, summary: { min: 310, q1: 310, median: 310, q3: 310, max: 310 }, whiskers: [310, 310], outliers: [], ...otherExtra },
    { name: { zh: '酵母型', en: 'Yeast' }, summary: { min: 180, q1: 190, median: 200, q3: 260, max: 300 }, whiskers: [180, 300], outliers: [] },
  ],
});

test('M4 p.24: the single Other donut is left out of the comparison, so Cake has the highest median and smallest IQR', () => {
  const setup = normalizeBoxplotConfig(DONUT_TYPES());
  const models = buildModels(setup.groups);
  assert.deepEqual(models.map(isSingleValued), [false, false, true, false]);
  assert.deepEqual(models.map(isSetAside), [false, false, true, false]);
  const { rows, sentences } = compareGroups(models, setup);
  assert.equal(rows.length, 4, 'the table still lists Other');
  assert.deepEqual(sentences.map((sentence) => sentence.en), [
    'Other is left out of the comparison: all of its observations are 310 kcal (Min = Max), so it has no box or spread to compare.',
    'Among Cake, Filled and Yeast, the median calories is highest for Cake (270 kcal) and lowest for Yeast (200 kcal).',
    'Among Cake, Filled and Yeast, Cake has the smallest IQR (30 kcal), so the middle 50% varies least there; Yeast has the largest IQR (70 kcal).',
    'Among Cake, Filled and Yeast, Yeast has the smallest range (120 kcal); Filled has the largest range (200 kcal).',
    'Plotted individually: Cake 340; Filled 400; Other none; Yeast none.',
  ]);
  assert.equal(sentences[1].zh, '在蛋糕型、夹馅型和酵母型中，热量的中位数：蛋糕型最高（270 kcal），酵母型最低（200 kcal）。');
  assert.equal(sentences[0].zh, '其他不参加比较：它的观测值都是 310 kcal（最小值 = 最大值），没有箱子，也没有离散程度可以比较。');

  // With n = 1 given (favstats prints it) the sentences say "only one observation" and the table shows n.
  // 给出 n = 1（favstats 会打印）时，句子写“只有一个观测值”，表格显示 n。
  const counted = normalizeBoxplotConfig(DONUT_TYPES({ n: 1 }));
  const countedModels = buildModels(counted.groups);
  const compared = compareGroups(countedModels, counted);
  assert.deepEqual(compared.rows.map((row) => row.n), ['—', '—', '1', '—']);
  assert.equal(compared.sentences[0].en,
    'Other is left out of the comparison: it has only one observation (310 kcal), so it has no box or spread to compare.');
  assert.deepEqual(describeSentences(countedModels[2], counted, { groupCount: 4 }), [{
    id: 'single',
    en: 'For Other, there is only one observation, 310 kcal, so there is no spread to describe: Min, Q1, the median, Q3 and Max are all 310 kcal.',
    zh: '其他：只有一个观测值 310 kcal，没有离散程度可以描述：最小值、Q1、中位数、Q3 和最大值都是 310 kcal。',
  }]);

  // Two groups left after Other is set aside are compared pair-wise; one group left gives no comparison.
  // 去掉 Other 后剩两组时两两比较；只剩一组时不比较。
  const pair = normalizeBoxplotConfig({ ...DONUT_TYPES(), groups: DONUT_TYPES().groups.slice(1, 4) });
  assert.deepEqual(compareGroups(buildModels(pair.groups), pair).sentences.map((sentence) => sentence.id),
    ['set-aside', 'median', 'iqr', 'range', 'outliers']);
  assert.ok(compareGroups(buildModels(pair.groups), pair).sentences[1].en.startsWith('The median calories for Filled is higher (230 kcal)'));
  const alone = normalizeBoxplotConfig({ ...DONUT_TYPES(), groups: DONUT_TYPES().groups.slice(2, 4) });
  assert.deepEqual(compareGroups(buildModels(alone.groups), alone).sentences.map((sentence) => sentence.id), ['set-aside', 'outliers']);
});

test('a group whose values are all equal gets one true sentence instead of the 50% templates', () => {
  const other = buildModels(normalizeBoxplotConfig(DONUT_TYPES()).groups)[2];
  const [single, ...rest] = describeSentences(other, LABELS, { groupCount: 4 });
  assert.equal(rest.length, 0);
  assert.equal(single.en, 'For Other, every observation is 310 kcal, so there is no spread to describe: Min, Q1, the median, Q3 and Max are all 310 kcal.');
  assert.ok(!/50%/.test(single.en));
  assert.ok(englishOf(constructionSteps(other), 'iqr').includes(
    'Min = Max = 310: every observation is the same, so the box, the whiskers and the fences all shrink to one line at 310, and there is no spread to describe.',
  ));
  // Raw data with equal values: one sentence too, but n = 4 is known, so the group still takes part in comparisons.
  // 值全部相等的原始数据：同样只有一句；但已知 n = 4，所以仍然参加比较。
  const equal = normalizeBoxplotConfig({ groups: [{ name: 'A', data: [5, 5, 5, 5] }, { name: 'B', data: [1, 2, 3, 4, 5] }, { name: 'C', data: [2, 3, 4, 5, 9] }] });
  const models = buildModels(equal.groups);
  assert.deepEqual([isSingleValued(models[0]), isSetAside(models[0])], [true, false]);
  assert.equal(describeSentences(models[0], { variable: { en: 'Score' } }).map((sentence) => sentence.id).join(), 'single');
  assert.equal(compareGroups(models, equal).sentences[1].en, 'A has the smallest IQR (0), so the middle 50% varies least there; C has the largest IQR (4.5).');
  // A summary with equal values and a given n of 2 or more is a real group with no spread, so it is compared.
  // 值全部相等、给出 n ≥ 2 的五数概括是真实的、没有离散的组，所以参加比较。
  const known = buildModels(normalizeBoxplotConfig({ groups: [{ summary: { min: 5, q1: 5, median: 5, q3: 5, max: 5 }, n: 3 }] }).groups)[0];
  assert.deepEqual([known.n, isSingleValued(known), isSetAside(known)], [3, true, false]);
  assert.equal(describeSentences(known, {})[0].en.startsWith('Every observation is 5'), true);
});

test('summary groups read an optional n: a whole number from 1, and never 1 when Min is below Max', () => {
  const group = (n, summary = { min: 1, q1: 2, median: 3, q3: 4, max: 5 }) => normalizeBoxplotConfig({ groups: [{ summary, n }] }).groups[0].n;
  assert.deepEqual([group(11), group('8'), group(1, { min: 7, q1: 7, median: 7, q3: 7, max: 7 })], [11, 8, 1]);
  for (const n of [undefined, null, 0, -3, 2.5, 'many', 1]) assert.equal(group(n), null, String(n));
  assert.equal(normalizeBoxplotConfig({ groups: [{ data: [1, 2, 3, 4], n: 1 }] }).groups[0].n, undefined, 'raw data count themselves');
  assert.equal(buildModels(normalizeBoxplotConfig({ groups: [{ data: [1, 2, 3, 4], n: 1 }] }).groups)[0].n, 4);
});

test('compareGroups: two groups use the comparative wording of M4 practice Q2B', () => {
  const setup = normalizeBoxplotConfig(GENDER);
  const { rows, sentences } = compareGroups(buildModels(setup.groups), setup);
  assert.deepEqual(rows.map((row) => [row.n, row.iqr, row.whiskers]), [['—', '1.6', '2.6 – 7.9'], ['—', '2.25', '2.2 – 8.4']]);
  assert.deepEqual(sentences.map((sentence) => sentence.en), [
    'The median job loss for Female is higher (5.45%) than for Male (5.15%).',
    'The middle 50% of job loss varies less in Female (IQR = 1.6%) than in Male (IQR = 2.25%).',
    'Female and Male have the same range (15.4%).',
    'Plotted individually: Female 8.9, 9.3, 14.3 and 18; Male 10.8 and 17.6.',
  ]);
});

test('shapeClues give the lengths to compare, without naming a shape', () => {
  const clues = shapeClues(donut('hand'));
  assert.deepEqual([clues.lowerBox, clues.upperBox, clues.lowerWhisker, clues.upperWhisker, clues.low, clues.high], [40, 30, 30, 60, 0, 1]);
  assert.equal(clues.en, 'Q1 to median: 40; median to Q3: 30; lower whisker: 30; upper whisker: 60; plotted individually: 0 low, 1 high.');
  assert.ok(!/skew|symmetric/i.test(clues.en));
});

test('withUnit, axisTitle and fitLabel', () => {
  assert.equal(withUnit('250', 'kcal'), '250 kcal');
  assert.equal(withUnit('5.2', '%'), '5.2%');
  assert.equal(withUnit('250', '$'), '$250');
  assert.equal(withUnit('−5', '$'), '−$5');
  assert.equal(withUnit('3', ''), '3');
  assert.equal(withUnit('3', undefined), '3');
  assert.deepEqual(axisTitle(LABELS), { zh: '热量（kcal）', en: 'Calories (kcal)' });
  assert.deepEqual(axisTitle({ variable: { zh: '分数', en: 'Score' } }), { zh: '分数', en: 'Score' });
  assert.deepEqual(fitLabel({ zh: '蛋糕', en: 'Cake' }, 80), { zh: '蛋糕', en: 'Cake' });
  assert.deepEqual(fitLabel({ zh: '夹心甜甜圈', en: 'Filled' }, 60), { zh: '', en: 'Filled' });
  assert.deepEqual(fitLabel({ zh: '夹心甜甜圈', en: 'Filled donuts' }, 60), { zh: '', en: 'Filled…' });
  assert.deepEqual(fitLabel({ zh: '', en: '' }, 60), { zh: '', en: '' });
  assert.deepEqual(fitLabel({ zh: 'B', en: 'B' }, 60), { zh: '', en: 'B' });
  assert.deepEqual(fitLabel({ zh: '**蛋糕**', en: '**Cake** (`n = 11`)' }, 200), { zh: '蛋糕', en: 'Cake (n = 11)' }, 'SVG text shows no markup');
});

test('chartDescription summarizes every group and the step in progress', () => {
  const setup = normalizeBoxplotConfig(TYPES);
  const models = buildModels(setup.groups, 'r7');
  const steps = constructionSteps(models[0]);
  const drawing = chartDescription(models, setup, { steps, stage: 3, selected: 0 });
  assert.ok(drawing.startsWith('并排箱线图 Side-by-side boxplots of Calories (kcal).'));
  assert.ok(drawing.includes('Cake: Min 210, Q1 250, Median 270, Q3 280, Max 340, whiskers 210 – 300, plotted individually: 340.'));
  assert.ok(drawing.includes('Yeast: Min 180, Q1 190, Median 200, Q3 260, Max 300, whiskers 180 – 300, no outliers.'));
  assert.ok(drawing.endsWith('Drawing Cake: Step 4 of 11: Five-number summary.'));
  assert.ok(!chartDescription(models, setup, { steps, stage: steps.length - 1 }).includes('Drawing'));
  assert.ok(chartDescription([donut('hand')], LABELS).startsWith('箱线图 Boxplot of Calories (kcal).'));
});

test('step and sentence text is clean: no NaN, no undefined, balanced bold markers, Chinese in every zh line', () => {
  const setups = [TYPES, GENDER, SPEC_SUMMARY, { groups: [{ summary: DIFFERENCES }] }, { groups: [OVERALL] }];
  for (const config of setups) {
    const setup = normalizeBoxplotConfig(config);
    for (const method of QUARTILE_METHODS) {
      const models = buildModels(setup.groups, method);
      const texts = [];
      for (const model of models) {
        for (const step of constructionSteps(model)) {
          texts.push(step.title.zh, step.title.en);
          for (const line of step.lines) {
            if (line.type === 'math') texts.push(line.text);
            else {
              assert.match(line.zh, /[一-鿿]/);
              texts.push(line.zh, line.en);
            }
          }
        }
        for (const sentence of describeSentences(model, setup, { groupCount: models.length })) texts.push(sentence.zh, sentence.en);
        texts.push(shapeClues(model).zh, shapeClues(model).en);
      }
      for (const sentence of compareGroups(models, setup).sentences) texts.push(sentence.zh, sentence.en);
      for (const text of texts) {
        assert.equal(typeof text, 'string');
        assert.ok(!/NaN|undefined|null|Infinity/.test(text), text);
        assert.equal((text.match(/\*\*/g) || []).length % 2, 0, text);
        assert.ok(!text.includes('`'), text);
      }
    }
  }
});
