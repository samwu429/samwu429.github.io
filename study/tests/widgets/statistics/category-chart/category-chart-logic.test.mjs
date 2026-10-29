import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BAR_MODES,
  DEFAULT_TITLE,
  DEFAULT_VARIABLE,
  DISPLAYS,
  MAX_CATEGORIES,
  MAX_COUNT,
  MIN_CATEGORIES,
  PERCENT_DIGITS,
  PIE_VIEW,
  PROPORTION_DIGITS,
  SLIDE_EXAMPLE,
  TEXT,
  barAxis,
  barChartLabel,
  barValues,
  categorySteps,
  chartFlags,
  distributionSummary,
  estimateLabelWidth,
  formatCount,
  frequencyDistribution,
  normalizeCategoryChartConfig,
  pieChartLabel,
  pieLabels,
  pieNote,
  pieSlices,
  plainBi,
  roundingCheck,
  selectionAnnouncement,
  sliceOffset,
  slicePath,
  valueLabelsFit,
} from '../../../../engine/widgets/statistics/category-chart/category-chart-logic.js';

// M2 p.16: ticket class on the Titanic, in R's order. 第 2 单元第 16 页：泰坦尼克号的船票等级（R 的顺序）。
const TICKET_CLASS = [['船员', 'Crew', 885], ['头等舱', 'First', 325], ['二等舱', 'Second', 285], ['三等舱', 'Third', 706]];
// M2 p.9 and p.14: survival status. 第 2 单元第 9、14 页：是否生还。
const SURVIVAL = [['生还', 'Alive', 711], ['死亡', 'Dead', 1490]];
// M2 practice Q1C: perceived mental health of the 3889 CCHS 2012 respondents. 第 2 单元练习 Q1C：3889 位受访者的心理健康自评。
const MENTAL_HEALTH = [
  ['差', 'Poor', 13], ['一般', 'Fair', 99], ['好', 'Good', 755], ['很好', 'Very Good', 1501], ['极好', 'Excellent', 1521],
];
const VARIABLE = { zh: '船票等级', en: 'Ticket Class' };

const configOf = (entries, extra = {}) => ({
  title: { zh: '标题', en: 'Title' },
  variable: { zh: '变量', en: 'Variable' },
  categories: entries.map(([zh, en, count]) => ({ label: { zh, en }, count })),
  ...extra,
});
const countsOnly = (counts) => counts.map((count, index) => [`类别${index + 1}`, `C${index + 1}`, count]);
const distributionOf = (entries) => frequencyDistribution(normalizeCategoryChartConfig(configOf(entries)).categories);
const close = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;

const ticket = distributionOf(TICKET_CLASS);
const survival = distributionOf(SURVIVAL);
const mental = distributionOf(MENTAL_HEALTH);

// Deterministic pseudo-random numbers in [0, 1), so the property checks always see the same tables.
// 确定的伪随机数（0 到 1 之间），让性质检查每次都用同样的表。
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomTables(count, seed) {
  const random = generator(seed);
  return Array.from({ length: count }, () => {
    const size = MIN_CATEGORIES + Math.floor(random() * (MAX_CATEGORIES - MIN_CATEGORIES + 1));
    return Array.from({ length: size }, () => Math.floor(random() ** 3 * 3000));
  });
}

// The box a pie label covers, from its anchor and estimated width. 饼图标签占据的矩形，由锚点和估计宽度得出。
function labelBox(label) {
  const width = estimateLabelWidth(label.text, PIE_VIEW.labelSize);
  const left = label.anchor === 'start' ? label.x : label.anchor === 'end' ? label.x - width : label.x - width / 2;
  const half = PIE_VIEW.labelSize / 2;
  return { left, right: left + width, top: label.y - half, bottom: label.y + half };
}

function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function distanceToCentre([x1, y1], [x2, y2]) {
  const { cx, cy } = PIE_VIEW;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.min(1, Math.max(0, ((cx - x1) * dx + (cy - y1) * dy) / length)) : 0;
  return Math.hypot(x1 + t * dx - cx, y1 + t * dy - cy);
}

function assertPieLabelsReadable(labels, where) {
  const { width, height, r } = PIE_VIEW;
  const boxes = labels.map(labelBox);
  boxes.forEach((box, index) => {
    assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height, `${where}: label ${index} leaves the view`);
    for (let other = index + 1; other < boxes.length; other += 1) {
      assert.ok(!boxesOverlap(box, boxes[other]), `${where}: labels ${labels[index].index} and ${labels[other].index} overlap`);
    }
  });
  for (const label of labels.filter((item) => item.leader)) {
    for (let point = 1; point < label.leader.length; point += 1) {
      const distance = distanceToCentre(label.leader[point - 1], label.leader[point]);
      assert.ok(distance >= r - 0.5, `${where}: leader of ${label.index} crosses the circle`);
    }
  }
}

test('normalizeCategoryChartConfig reads the content-spec config exactly', () => {
  const config = {
    title: { zh: '同学们用的电脑', en: 'Computers students use' },
    variable: { zh: '电脑类型', en: 'Computer type' },
    categories: [{ label: { zh: '苹果电脑', en: 'MAC' }, count: 12 }, { label: { zh: '个人电脑', en: 'PC' }, count: 8 }],
    display: 'both',
  };
  assert.deepEqual(normalizeCategoryChartConfig(config), {
    title: config.title,
    variable: config.variable,
    categories: [
      { index: 0, label: { zh: '苹果电脑', en: 'MAC' }, count: 12 },
      { index: 1, label: { zh: '个人电脑', en: 'PC' }, count: 8 },
    ],
    display: 'both',
    usedDefault: false,
  });
});

test('display accepts bar, pie and both, and anything else means both', () => {
  for (const display of DISPLAYS) assert.equal(normalizeCategoryChartConfig(configOf(TICKET_CLASS, { display })).display, display);
  assert.equal(normalizeCategoryChartConfig(configOf(TICKET_CLASS)).display, 'both');
  assert.equal(normalizeCategoryChartConfig(configOf(TICKET_CLASS, { display: ' Pie ' })).display, 'pie');
  for (const display of ['table', '', 3, null, ['bar'], { bar: true }]) {
    assert.equal(normalizeCategoryChartConfig(configOf(TICKET_CLASS, { display })).display, 'both');
  }
  assert.deepEqual(chartFlags('bar'), { bar: true, pie: false });
  assert.deepEqual(chartFlags('pie'), { bar: false, pie: true });
  assert.deepEqual(chartFlags('both'), { bar: true, pie: true });
  assert.deepEqual(chartFlags(undefined), { bar: true, pie: true });
});

test('the validator limits hold: 2 to 10 categories, extra ones are cut and too few use the slide example', () => {
  assert.equal(MIN_CATEGORIES, 2);
  assert.equal(MAX_CATEGORIES, 10);
  const two = normalizeCategoryChartConfig(configOf(countsOnly([3, 4])));
  assert.equal(two.usedDefault, false);
  assert.equal(two.categories.length, 2);
  const ten = normalizeCategoryChartConfig(configOf(countsOnly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])));
  assert.equal(ten.categories.length, 10);

  const twelve = normalizeCategoryChartConfig(configOf(countsOnly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])));
  assert.equal(twelve.usedDefault, false);
  assert.deepEqual(twelve.categories.map((category) => category.count), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(twelve.categories.map((category) => category.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  const one = normalizeCategoryChartConfig(configOf(countsOnly([5])));
  assert.equal(one.usedDefault, true);
  assert.deepEqual(one.title, SLIDE_EXAMPLE.title);
  assert.deepEqual(one.variable, SLIDE_EXAMPLE.variable);
  assert.deepEqual(one.categories.map((category) => category.count), [885, 325, 285, 706]);
});

test('every config the validator accepts comes through unchanged', () => {
  const accepted = [
    configOf([['苹果电脑', 'MAC', 12], ['个人电脑', 'PC', 8]], { display: 'both' }),
    configOf(countsOnly([0, 0])),
    configOf(countsOnly([0, 5]), { display: 'bar' }),
    configOf(countsOnly([2.5, 7.5]), { display: 'pie' }),
    configOf(countsOnly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    configOf(countsOnly([600000, 1200000])),
    configOf(SURVIVAL, { quartiles: 'r7', unit: 'kcal' }),
    { categories: [{ label: { zh: '是', en: 'Yes' }, count: 0.5 }, { label: { zh: '否', en: 'No' }, count: 0 }] },
  ];
  for (const config of accepted) {
    const model = normalizeCategoryChartConfig(config);
    assert.equal(model.usedDefault, false);
    assert.equal(model.display, config.display ?? 'both');
    assert.deepEqual(model.categories.map((category) => category.count), config.categories.map((category) => category.count));
    assert.deepEqual(model.categories.map((category) => category.label), config.categories.map((category) => category.label));
    if (config.title) assert.deepEqual(model.title, config.title);
    else assert.deepEqual(model.title, DEFAULT_TITLE);
    if (!config.variable) assert.deepEqual(model.variable, DEFAULT_VARIABLE);

    const distribution = frequencyDistribution(model.categories);
    distribution.rows.forEach((row) => {
      const steps = categorySteps(distribution, row.index);
      assert.equal(steps.index, row.index);
      assert.ok(steps.frequency && steps.total && steps.proportion);
      assert.ok(selectionAnnouncement(distribution, row.index).startsWith('已选 Selected: '));
    });
    assert.ok(['majority', 'half', 'plurality', 'tie', 'all-equal', 'empty'].includes(distributionSummary(distribution).kind));
    for (const mode of BAR_MODES) {
      const axis = barAxis(distribution, mode);
      assert.ok(barValues(distribution, mode).every((bar) => Number.isFinite(bar.value) && bar.value <= axis.max));
    }
    assertPieLabelsReadable(pieLabels(distribution), JSON.stringify(config.categories.map((category) => category.count)));
  }
});

test('normalizeCategoryChartConfig skips entries without data and repairs the rest', () => {
  const model = normalizeCategoryChartConfig({
    categories: [
      null, 7, 'x', [1, 2],
      { label: 'Cats', count: '12' },
      { label: { zh: '狗' }, count: -3 },
      { count: 4 },
      { label: { zh: '鸟', en: 'Birds' } },
      { label: { zh: '鱼', en: 'Fish' }, count: 5e12 },
      { label: { zh: '马', en: 'Horse' }, count: true },
      { label: { zh: '牛', en: 'Cow' }, count: '' },
    ],
  });
  assert.equal(model.usedDefault, false);
  assert.deepEqual(model.categories, [
    { index: 0, label: { zh: '', en: 'Cats' }, count: 12 },
    { index: 1, label: { zh: '狗', en: '' }, count: 0 },
    { index: 2, label: { zh: '类别 3', en: 'Category 3' }, count: 4 },
    { index: 3, label: { zh: '鱼', en: 'Fish' }, count: MAX_COUNT },
  ]);
  assert.deepEqual(model.title, DEFAULT_TITLE);
  assert.deepEqual(model.variable, DEFAULT_VARIABLE);
  assert.deepEqual(normalizeCategoryChartConfig({ title: '我的标题', categories: countsOnly([1, 2]).map(([zh, en, count]) => ({ label: { zh, en }, count })) }).title,
    { zh: '我的标题', en: '' });
});

test('missing or malformed configs show the M2 p.16 example, which stays frozen', () => {
  for (const config of [undefined, null, 5, 'categories', [], {}, { categories: 'none' }, { categories: [] }]) {
    const model = normalizeCategoryChartConfig(config);
    assert.equal(model.usedDefault, true);
    assert.equal(model.display, 'both');
    assert.deepEqual(model.variable, { zh: '船票等级', en: 'Ticket Class' });
    assert.deepEqual(model.categories.map((category) => category.label.en), ['Crew', 'First', 'Second', 'Third']);
    assert.deepEqual(model.categories.map((category) => category.count), [885, 325, 285, 706]);
  }
  const model = normalizeCategoryChartConfig(null);
  model.categories[0].label.en = 'changed';
  model.title.en = 'changed';
  assert.equal(SLIDE_EXAMPLE.categories[0].label.en, 'Crew');
  assert.equal(SLIDE_EXAMPLE.title.en, 'Ticket Class on the Titanic');
  assert.ok(Object.isFrozen(SLIDE_EXAMPLE.categories[0].label));
});

test('frequencyDistribution reproduces the tables of M2 p.14 and p.16', () => {
  assert.equal(PROPORTION_DIGITS, 3);
  assert.equal(PERCENT_DIGITS, 1);
  assert.equal(ticket.total, 2201);
  assert.equal(ticket.totalText, '2201');
  assert.equal(ticket.k, 4);
  assert.deepEqual(ticket.rows.map((row) => row.countText), ['885', '325', '285', '706']);
  assert.deepEqual(ticket.rows.map((row) => row.proportionText), ['0.402', '0.148', '0.129', '0.321']);
  assert.deepEqual(ticket.rows.map((row) => row.percentText), ['40.2%', '14.8%', '12.9%', '32.1%']);
  assert.ok(close(ticket.rows[0].proportion, 885 / 2201));
  assert.ok(close(ticket.rows[3].percent, 32.07633, 1e-5));
  assert.equal(ticket.proportionTotalText, '1.000');
  assert.equal(ticket.percentTotalText, '100.0%');
  assert.deepEqual(survival.rows.map((row) => row.proportionText), ['0.323', '0.677']);
  assert.deepEqual(survival.rows.map((row) => row.percentText), ['32.3%', '67.7%']);
  assert.equal(roundingCheck(ticket), null);
  assert.equal(roundingCheck(survival), null);
});

test('every percentage is the shown proportion times 100, and proportions lie between 0 and 1', () => {
  for (const counts of randomTables(300, 220)) {
    const distribution = distributionOf(countsOnly(counts));
    if (!distribution.hasTotal) continue;
    for (const row of distribution.rows) {
      const shown = Number(row.proportionText);
      assert.ok(shown >= 0 && shown <= 1, `${row.proportionText} is not a proportion`);
      assert.equal(row.percentText, `${(shown * 100).toFixed(1)}%`);
      const steps = categorySteps(distribution, row.index);
      assert.equal(steps.percent, `${row.proportionText} × 100 = ${row.percentText}`);
      assert.ok(steps.proportion.endsWith(row.proportionText));
    }
  }
});

test('roundingCheck explains rounded proportions that do not add up to 1', () => {
  assert.deepEqual(mental.rows.map((row) => row.proportionText), ['0.003', '0.025', '0.194', '0.386', '0.391']);
  const note = roundingCheck(mental);
  assert.equal(note.proportionSum, '0.999');
  assert.equal(note.percentSum, '99.9%');
  assert.match(note.en, /add up to 0\.999 \(99\.9%\), not exactly 1 \(100%\)/);
  assert.match(note.zh, /0\.999（99\.9%）/);
  assert.equal(roundingCheck(distributionOf(countsOnly([1, 1, 1]))).proportionSum, '0.999');
  assert.equal(roundingCheck(distributionOf(countsOnly([1, 1, 1, 1, 1, 1]))).proportionSum, '1.002');
  assert.equal(roundingCheck(distributionOf(countsOnly([0, 0]))), null);
});

test('categorySteps writes the slide working: f, n, f / n and × 100', () => {
  const crew = categorySteps(ticket, 0);
  assert.equal(crew.index, 0);
  assert.deepEqual(crew.label, { zh: '船员', en: 'Crew' });
  assert.equal(crew.frequency, 'f = 885');
  assert.equal(crew.total, 'n = 885 + 325 + 285 + 706 = 2201');
  assert.equal(crew.proportion, 'f / n = 885 / 2201 ≈ 0.402');
  assert.equal(crew.percent, '0.402 × 100 = 40.2%');
  assert.equal(crew.angle, '885 / 2201 × 360° ≈ 144.8°');
  assert.equal(crew.warning, null);
  assert.equal(crew.sentence.en, '885 of the 2201 cases (40.2%) are in the category "Crew".');
  assert.equal(crew.sentence.zh, '2201 个个案中，有 885 个（40.2%）属于“船员”这一类。');

  // M2 p.14: 711 / 2201 ≅ 0.3230, about 32% survived. 第 2 单元第 14 页。
  const alive = categorySteps(survival, 0);
  assert.equal(alive.proportion, 'f / n = 711 / 2201 ≈ 0.323');
  assert.equal(alive.percent, '0.323 × 100 = 32.3%');

  const pets = distributionOf([['猫', 'Cats', 1], ['狗', 'Dogs', 3]]);
  const cats = categorySteps(pets, 0);
  assert.equal(cats.proportion, 'f / n = 1 / 4 = 0.250');
  assert.equal(cats.percent, '0.250 × 100 = 25.0%');
  assert.equal(cats.angle, '1 / 4 × 360° = 90°');
  assert.equal(cats.sentence.en, '1 of the 4 cases (25.0%) is in the category "Cats".');

  assert.equal(categorySteps(ticket, 9).index, 0);
  assert.equal(categorySteps(ticket, -1).index, 0);
  assert.equal(categorySteps(ticket, 1.5).index, 0);
  assert.equal(categorySteps(ticket, 3).index, 3);
  assert.equal(categorySteps(frequencyDistribution([]), 0), null);
  assert.equal(categorySteps(undefined, 0), null);
});

test('counts are written exactly, however large', () => {
  assert.equal(formatCount(600000), '600000');
  assert.equal(formatCount(106576), '106576');
  assert.equal(formatCount(MAX_COUNT), '100000000000');
  assert.equal(formatCount(2.5), '2.5');
  assert.equal(formatCount(12.345), '12.35');
  assert.equal(formatCount(Number.NaN), '—');
  const big = distributionOf(countsOnly([600000, 1200000]));
  assert.equal(big.totalText, '1800000');
  assert.equal(categorySteps(big, 0).total, 'n = 600000 + 1200000 = 1800000');
  assert.equal(categorySteps(big, 0).proportion, 'f / n = 600000 / 1800000 ≈ 0.333');
  const halves = distributionOf(countsOnly([2.5, 7.5]));
  assert.equal(categorySteps(halves, 0).proportion, 'f / n = 2.5 / 10 = 0.250');
  // Population counts, which the validator accepts, are kept as written and the bar axis prints exact numbers.
  // 校验器接受的人口数量原样保留，条形图坐标轴印出的数字也是精确的。
  const people = distributionOf(countsOnly([1411750000, 1428627663, 5200000000]));
  assert.deepEqual(people.rows.map((row) => row.count), [1411750000, 1428627663, 5200000000]);
  assert.equal(people.totalText, '8040377663');
  assert.equal(categorySteps(people, 2).proportion, 'f / n = 5200000000 / 8040377663 ≈ 0.647');
  const axis = barAxis(distributionOf(countsOnly([MAX_COUNT, 1])), 'count');
  assert.ok(axis.ticks.every((tick) => Number.isInteger(tick) && tick < 5e11));
});

test('with every count 0 nothing is divided by 0', () => {
  const empty = distributionOf(countsOnly([0, 0]));
  assert.equal(empty.hasTotal, false);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows.map((row) => [row.proportionText, row.percentText]), [['—', '—'], ['—', '—']]);
  assert.equal(empty.proportionTotalText, '—');
  assert.equal(empty.percentTotalText, '—');
  const steps = categorySteps(empty, 1);
  assert.equal(steps.frequency, 'f = 0');
  assert.equal(steps.total, 'n = 0 + 0 = 0');
  assert.equal(steps.proportion, 'f / n = 0 / 0');
  assert.equal(steps.percent, null);
  assert.equal(steps.angle, null);
  assert.deepEqual(steps.warning, { ...TEXT.noTotal });
  assert.deepEqual(steps.sentence, { ...TEXT.nothingToInterpret });
  assert.equal(distributionSummary(empty).kind, 'empty');
  assert.deepEqual(pieSlices(empty), []);
  assert.deepEqual(pieLabels(empty), []);
  assert.deepEqual(barAxis(empty, 'count'), { min: 0, max: 1, step: 1, ticks: [0, 1] });
  assert.deepEqual(barAxis(empty, 'percent'), { min: 0, max: 1, step: 1, ticks: [0, 1] });
  assert.deepEqual(barValues(empty, 'percent').map((bar) => [bar.value, bar.text]), [[0, '—'], [0, '—']]);
  assert.equal(selectionAnnouncement(empty, 0), '已选 Selected: 类别1 C1. f = 0, n = 0');
});

test('distributionSummary words the graph like the slides: majority, most common category, ties', () => {
  // M2 p.11: "Majority of the passengers and crew members did not survive." 第 2 单元第 11 页。
  const dead = distributionSummary(survival);
  assert.equal(dead.kind, 'majority');
  assert.deepEqual(dead.indices, [1]);
  assert.equal(dead.en, 'The majority of the cases (67.7%) are in the category "Dead", so it is the most common category (the mode).');
  assert.match(dead.zh, /超过一半（67\.7%）的个案属于“死亡”/);

  // M2 p.17: about 40% crew members and about 32% third-class passengers. 第 2 单元第 17 页。
  const crew = distributionSummary(ticket);
  assert.equal(crew.kind, 'plurality');
  assert.deepEqual(crew.indices, [0]);
  assert.equal(crew.en, 'No category has a majority (more than 50% of the cases). The most common category (the mode) is "Crew" (40.2%), followed by "Third" (32.1%).');
  assert.match(crew.zh, /“船员”（40\.2%），其次是“三等舱”（32\.1%）/);

  const half = distributionSummary(distributionOf(countsOnly([5, 3, 2])));
  assert.equal(half.kind, 'half');
  assert.match(half.en, /^Exactly half of the cases \(50\.0%\) are in the category "C1"/);

  const tie = distributionSummary(distributionOf(countsOnly([3, 3, 2])));
  assert.equal(tie.kind, 'tie');
  assert.deepEqual(tie.indices, [0, 1]);
  assert.equal(tie.en, '"C1" and "C2" are tied as the most common categories (the modes), with 37.5% each.');
  assert.match(tie.zh, /^“类别1”和“类别2”并列最常见/);

  const equal = distributionSummary(distributionOf(countsOnly([4, 4, 4, 4])));
  assert.equal(equal.kind, 'all-equal');
  assert.deepEqual(equal.indices, [0, 1, 2, 3]);
  assert.match(equal.en, /\(25\.0% each\)/);

  const runners = distributionSummary(distributionOf(countsOnly([5, 3, 3, 1])));
  assert.equal(runners.kind, 'plurality');
  assert.match(runners.en, /followed by "C2" and "C3" \(25\.0% each\)\.$/);
  assert.match(runners.zh, /其次是“类别2”和“类别3”（各占 25\.0%）/);

  // 50.03% prints as 50.0% but is still a majority. 50.03% 显示为 50.0%，但仍然过半。
  const barely = distributionSummary(distributionOf(countsOnly([5003, 4997])));
  assert.equal(barely.kind, 'majority');
  assert.match(barely.en, /\(50\.0%\)/);
});

test('bar values and the y-axis: counts or percent, room for labels, percent never past 100', () => {
  assert.deepEqual(barValues(ticket, 'count').map((bar) => [bar.index, bar.value, bar.text]),
    [[0, 885, '885'], [1, 325, '325'], [2, 285, '285'], [3, 706, '706']]);
  assert.deepEqual(barValues(ticket).map((bar) => bar.value), [885, 325, 285, 706]);
  const percents = barValues(ticket, 'percent');
  assert.deepEqual(percents.map((bar) => bar.text), ['40.2%', '14.8%', '12.9%', '32.1%']);
  assert.ok(close(percents[0].value, 88500 / 2201));
  assert.deepEqual(barAxis(ticket, 'count'), { min: 0, max: 1000, step: 200, ticks: [0, 200, 400, 600, 800, 1000] });
  assert.deepEqual(barAxis(ticket, 'percent'), { min: 0, max: 50, step: 10, ticks: [0, 10, 20, 30, 40, 50] });
  assert.equal(barAxis(distributionOf(countsOnly([5, 0])), 'percent').max, 100);
  for (const counts of [...randomTables(100, 7), [885, 325, 285, 706], [1, 0], [1490, 711]]) {
    const distribution = distributionOf(countsOnly(counts));
    for (const mode of BAR_MODES) {
      const axis = barAxis(distribution, mode);
      const values = barValues(distribution, mode).map((bar) => bar.value);
      assert.ok(values.every((value) => value <= axis.max), `${counts} ${mode}: a bar is above the axis`);
      assert.ok(axis.ticks.every(Number.isInteger), `${counts} ${mode}: fractional ticks`);
      if (mode === 'percent') assert.ok(axis.max <= 100);
    }
  }
});

test('value labels are drawn for every bar only when they fit their slot', () => {
  const bars = barValues(ticket, 'count');
  assert.ok(valueLabelsFit(bars, 60, 11));
  assert.equal(valueLabelsFit(bars, 20, 11), false);
  assert.ok(valueLabelsFit([], 10, 11));
  assert.ok(estimateLabelWidth('40.2%', 12) > estimateLabelWidth('9%', 12));
  assert.equal(estimateLabelWidth('', 12), 0);
});

test('pie slices follow the table from 12 o\'clock, clockwise, and leave out empty categories', () => {
  const slices = pieSlices(survival);
  assert.equal(slices.length, 2);
  assert.ok(close(slices[0].start, -Math.PI / 2));
  assert.ok(close(slices[0].sweep, (711 / 2201) * 2 * Math.PI));
  assert.ok(close(slices[0].degrees, (711 / 2201) * 360));
  assert.ok(close(slices[1].start, slices[0].end));
  assert.ok(close(slices[1].end, 1.5 * Math.PI));
  assert.ok(close(slices[0].mid, (slices[0].start + slices[0].end) / 2));
  const total = pieSlices(ticket).reduce((sum, slice) => sum + slice.sweep, 0);
  assert.ok(close(total, 2 * Math.PI));
  assert.deepEqual(pieSlices(distributionOf(countsOnly([2, 0, 2]))).map((slice) => slice.index), [0, 2]);
  assert.deepEqual(pieSlices(undefined), []);
});

test('slicePath draws each slice as an arc, and a whole circle is left to a circle element', () => {
  const [small, large] = pieSlices(distributionOf(countsOnly([1, 3])));
  assert.equal(slicePath(small), 'M 150 116 L 150 32 A 84 84 0 0 1 234 116 Z');
  assert.equal(slicePath(large), 'M 150 116 L 234 116 A 84 84 0 1 1 150 32 Z');
  assert.deepEqual(sliceOffset(small, 6), { dx: 4.2, dy: -4.2 });
  const whole = pieSlices(distributionOf(countsOnly([5, 0])));
  assert.equal(whole.length, 1);
  assert.equal(slicePath(whole[0]), null);
  assert.deepEqual(sliceOffset(whole[0], 6), { dx: 0, dy: 0 });
  assert.equal(slicePath(null), null);
  for (const slice of pieSlices(ticket)) {
    assert.ok(!slicePath(slice).includes('−'), 'SVG path data needs an ASCII minus sign');
  }
});

test('pie labels sit inside large slices and beside small ones, with the table\'s percentages', () => {
  const labels = pieLabels(mental);
  assert.deepEqual(labels.map((label) => label.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(labels.map((label) => label.text), ['0.3%', '2.5%', '19.4%', '38.6%', '39.1%']);
  assert.deepEqual(labels.map((label) => label.inside), [false, false, true, true, true]);
  const [poor, fair] = labels;
  assert.equal(poor.anchor, 'start');
  assert.equal(fair.anchor, 'start');
  assert.ok(Math.abs(poor.y - fair.y) >= PIE_VIEW.labelSize, 'the two small labels are spread apart');
  assert.ok(close(Math.hypot(poor.leader[0][0] - PIE_VIEW.cx, poor.leader[0][1] - PIE_VIEW.cy), PIE_VIEW.r + 1, 0.2));
  assert.ok(labels.filter((label) => label.inside).every((label) => label.leader === null && label.anchor === 'middle'));

  assert.ok(pieLabels(ticket).every((label) => label.inside), 'all four Titanic labels fit inside');
  assert.deepEqual(pieLabels(distributionOf(countsOnly([5, 0]))),
    [{ index: 0, text: '100.0%', inside: true, x: 150, y: 116, anchor: 'middle', leader: null }]);
});

test('pie labels stay in the view, never overlap, and their leaders never cross the circle', () => {
  const crowded = [[100, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 100, 1, 100, 1, 100, 1, 100, 1, 100]];
  for (const counts of [...randomTables(300, 1912), ...crowded, [13, 99, 755, 1501, 1521]]) {
    const labels = pieLabels(distributionOf(countsOnly(counts)));
    assert.equal(labels.length, counts.filter((count) => count > 0).length);
    assertPieLabelsReadable(labels, String(counts));
  }
});

test('text alternatives and announcements name every category with its value', () => {
  assert.equal(barChartLabel(ticket, VARIABLE, 'count'),
    '条形图 Bar chart: 船票等级 Ticket Class; 纵轴 y-axis: 频数 Frequency. 船员 Crew 885; 头等舱 First 325; 二等舱 Second 285; 三等舱 Third 706.');
  assert.match(barChartLabel(ticket, VARIABLE, 'percent'), /纵轴 y-axis: 百分比 Percent\. 船员 Crew 40\.2%; 头等舱 First 14\.8%/);
  assert.equal(pieChartLabel(ticket, VARIABLE),
    '饼图 Pie chart: 船票等级 Ticket Class, n = 2201. 船员 Crew 40.2%; 头等舱 First 14.8%; 二等舱 Second 12.9%; 三等舱 Third 32.1%.');
  assert.equal(selectionAnnouncement(ticket, 0), '已选 Selected: 船员 Crew. f / n = 885 / 2201 ≈ 0.402 = 40.2%');
  assert.equal(selectionAnnouncement(frequencyDistribution([]), 0), '');
  assert.match(pieNote(ticket).en, /all n = 2201 cases \(100%\)/);
  assert.match(pieNote(ticket).zh, /n = 2201 个个案（100%）/);
  assert.equal(plainBi({ zh: '**猫**', en: '`Cats`' }), '猫 Cats');
  assert.equal(plainBi({ zh: '', en: 'Cats' }), 'Cats');
  assert.equal(plainBi({ zh: 'MAC', en: 'MAC' }), 'MAC');
  assert.equal(plainBi(null), '');
});

test('sentences stay clean when a label has markup or only one language', () => {
  const model = normalizeCategoryChartConfig({ categories: [{ label: '**Cats**', count: 3 }, { label: { zh: '狗' }, count: 1 }] });
  const distribution = frequencyDistribution(model.categories);
  const cats = categorySteps(distribution, 0).sentence;
  assert.equal(cats.en, '3 of the 4 cases (75.0%) are in the category "Cats".');
  assert.equal(cats.zh, '4 个个案中，有 3 个（75.0%）属于“Cats”这一类。');
  assert.equal(categorySteps(distribution, 1).sentence.en, '1 of the 4 cases (25.0%) is in the category "狗".');
  assert.equal(distributionSummary(distribution).en, 'The majority of the cases (75.0%) are in the category "Cats", so it is the most common category (the mode).');
});

test('the teaching text is bilingual, free of emoji and frozen', () => {
  const pictographs = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const han = /[一-鿿]/;
  const pairs = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.zh === 'string' || typeof value.en === 'string') pairs.push(value);
    Object.values(value).forEach(walk);
  };
  walk(TEXT);
  assert.ok(pairs.length >= 20);
  for (const pair of pairs) {
    assert.ok(han.test(pair.zh), `missing Chinese: ${pair.en}`);
    assert.ok(typeof pair.en === 'string' && pair.en.trim() && !han.test(pair.en), `missing or mixed English: ${pair.zh}`);
    assert.ok(!pictographs.test(pair.zh) && !pictographs.test(pair.en));
  }
  for (const generated of [roundingCheck(mental), distributionSummary(ticket), categorySteps(ticket, 1).sentence, pieNote(ticket)]) {
    assert.ok(han.test(generated.zh) && generated.en && !pictographs.test(`${generated.zh}${generated.en}`));
  }
  assert.ok(Object.isFrozen(TEXT));
  assert.ok(Object.isFrozen(TEXT.notes));
  assert.ok(Object.isFrozen(TEXT.notes[0]));
  assert.ok(Object.isFrozen(PIE_VIEW));
});
