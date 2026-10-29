import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSOCIATION_RULE,
  EXAMPLE_TABLE,
  PRACTICE_LIMITS,
  QUESTION_KINDS,
  RATIO_DIGITS,
  TABLE_LIMITS,
  TWO_WAY_VIEWS,
  associationSummary,
  buildQuestion,
  buildTable,
  cellCount,
  cellDisplay,
  cellHighlights,
  cellKind,
  cellRole,
  compareGroups,
  comparisonChoices,
  conditionalBars,
  defaultComparison,
  describeCell,
  formatCount,
  fractionFormula,
  generateQuestion,
  judgeAnswer,
  normalizeTwoWayTableConfig,
  plainLabel,
  practiceCandidates,
  ratioWording,
  revealAnswer,
  shareText,
  tableShape,
  viewGuide,
} from '../../../../engine/widgets/statistics/two-way-table/two-way-table-logic.js';

// M2 p.21-35: Titanic survival status (rows) by ticket class (columns), the Module 2 lesson config.
// 第 2 单元第 21-35 页：泰坦尼克号的生还状态（行）× 船票等级（列），与第 2 单元讲义中的配置相同。
const TITANIC = {
  title: { zh: '泰坦尼克号：生还状态 × 船票等级', en: 'Titanic: Survival Status by Ticket Class' },
  rowVariable: { zh: '生还状态', en: 'Survival Status' },
  columnVariable: { zh: '船票等级', en: 'Ticket Class' },
  rows: [{ zh: '生还', en: 'Alive' }, { zh: '死亡', en: 'Dead' }],
  columns: [
    { zh: '头等舱', en: 'First' }, { zh: '二等舱', en: 'Second' }, { zh: '三等舱', en: 'Third' }, { zh: '船员', en: 'Crew' },
  ],
  counts: [[203, 118, 178, 212], [122, 167, 528, 673]],
  decimals: 4,
  start: 'column',
};

// Midterm 2025 Q1-Q6 (GSS 2000): membership (rows) by willingness to pay higher prices (columns).
// 2025 年期中考试第 1-6 题（GSS 2000）：是否成员（行）× 是否愿意多付钱（列）。
const GSS = {
  rowVariable: { zh: '环保组织成员', en: 'Member of Environmental Group' },
  columnVariable: { zh: '愿意多付钱', en: 'Pay Higher Prices' },
  rows: [{ zh: '是', en: 'Yes' }, { zh: '否', en: 'No' }],
  columns: [{ zh: '是', en: 'Yes' }, { zh: '否', en: 'No' }],
  counts: [[30, 66], [88, 933]],
};

// M2 p.34: hypothetical table with 30% survival in every class, i.e. no association.
// 第 2 单元第 34 页：每个等级的生还率都是 30% 的假想表格，即没有关联。
const NO_ASSOCIATION = {
  rowVariable: { zh: '生还状态', en: 'Survival Status' },
  columnVariable: { zh: '船票等级', en: 'Ticket Class' },
  rows: [{ zh: '生还', en: 'Alive' }, { zh: '死亡', en: 'Dead' }],
  columns: [{ zh: '船员', en: 'Crew' }, { zh: '头等舱', en: 'First' }, { zh: '二等舱', en: 'Second' }, { zh: '三等舱', en: 'Third' }],
  counts: [[270, 90, 90, 210], [630, 210, 210, 490]],
  decimals: 2,
};

// Module 2 practice Q1 (CCHS 2012): perceived mental health by sex, nearly identical row percentages.
// 第 2 单元练习题 Q1（CCHS 2012）：按性别分的自评心理健康，两行的行百分比几乎一样。
const MENTAL_HEALTH = {
  rowVariable: { zh: '性别', en: 'Sex' },
  columnVariable: { zh: '自评心理健康', en: 'Perceived mental health' },
  rows: [{ zh: '男', en: 'Male' }, { zh: '女', en: 'Female' }],
  columns: ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'],
  counts: [[3, 35, 333, 657, 688], [10, 64, 422, 844, 833]],
  decimals: 4,
};

const setup = (config) => {
  const model = normalizeTwoWayTableConfig(config);
  return { model, table: buildTable(model) };
};

// A small seeded generator (Park-Miller), so practice questions are reproducible.
// 一个带种子的小随机数生成器（Park-Miller），让练习题可以重现。
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

// Keys whose values are codes for the widget (such as the ratio kind "undefined"), not text for the learner.
// 这些键的值是给组件用的代码（例如比值种类 "undefined"），不是给学习者看的文字。
const CODE_KEYS = new Set(['kind', 'mistake', 'status', 'role', 'key', 'view']);

// Every display string inside a value (objects and arrays walked), for checks on all generated text.
// 取出一个值里全部显示用的字符串（递归遍历对象和数组），用来检查所有生成的文字。
function strings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      if (!CODE_KEYS.has(key)) strings(item, found);
    });
  }
  return found;
}

const sameFraction = (part, numerator, denominator) => part.numerator === numerator && part.denominator === denominator;

/* ---------- Config 配置 ---------- */

test('normalizeTwoWayTableConfig keeps a valid lesson config unchanged', () => {
  const model = normalizeTwoWayTableConfig(TITANIC);
  assert.deepEqual(model.rows, TITANIC.rows);
  assert.deepEqual(model.columns, TITANIC.columns);
  assert.deepEqual(model.counts, TITANIC.counts);
  assert.deepEqual(model.title, TITANIC.title);
  assert.deepEqual(model.rowVariable, TITANIC.rowVariable);
  assert.deepEqual(model.columnVariable, TITANIC.columnVariable);
  assert.equal(model.decimals, 4);
  assert.equal(model.percentDigits, 2);
  assert.equal(model.start, 'column');
  assert.equal(model.usedExample, false);
});

test('normalizeTwoWayTableConfig fills the optional fields with defaults', () => {
  const model = normalizeTwoWayTableConfig({ rows: GSS.rows, columns: GSS.columns, counts: GSS.counts });
  assert.equal(model.decimals, TABLE_LIMITS.defaultDecimals);
  assert.equal(model.percentDigits, 1);
  assert.equal(model.start, 'counts');
  assert.deepEqual(model.rowVariable, { zh: '行变量', en: 'Row variable' });
  assert.deepEqual(model.columnVariable, { zh: '列变量', en: 'Column variable' });
  assert.ok(model.title.zh && model.title.en);
});

test('normalizeTwoWayTableConfig accepts every shape and start the validator accepts', () => {
  for (let rows = 2; rows <= 6; rows += 1) {
    for (let columns = 2; columns <= 6; columns += 1) {
      for (const start of TWO_WAY_VIEWS) {
        const counts = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => (r * 7 + c * 3) % 5));
        const config = {
          rows: Array.from({ length: rows }, (_, index) => ({ zh: `行${index}`, en: `R${index}` })),
          columns: Array.from({ length: columns }, (_, index) => ({ zh: `列${index}`, en: `C${index}` })),
          counts,
          start,
        };
        const model = normalizeTwoWayTableConfig(config);
        assert.deepEqual(model.counts, counts);
        assert.equal(model.rows.length, rows);
        assert.equal(model.columns.length, columns);
        assert.equal(model.start, start);
        assert.equal(model.usedExample, false);
      }
    }
  }
});

test('normalizeTwoWayTableConfig cleans bad counts and clamps sizes and decimals', () => {
  const messy = normalizeTwoWayTableConfig({
    rows: ['Yes', '是'],
    columns: [{ en: 'A' }, { zh: '', en: '' }, 7],
    counts: [[' 5 ', -3, 2.6], [null, 'x', true]],
    decimals: '4',
    start: '  Row ',
  });
  assert.deepEqual(messy.counts, [[5, 0, 3], [0, 0, 0]]);
  assert.deepEqual(messy.rows, [{ zh: '', en: 'Yes' }, { zh: '是', en: '' }]);
  assert.deepEqual(messy.columns, [{ zh: '', en: 'A' }, { zh: '第 2 列', en: 'Column 2' }, { zh: '第 3 列', en: 'Column 3' }]);
  assert.equal(messy.decimals, 4);
  assert.equal(messy.start, 'row');

  const wide = normalizeTwoWayTableConfig({
    rows: Array.from({ length: 9 }, (_, index) => `Row label ${index}`),
    columns: ['only one'],
    counts: Array.from({ length: 9 }, () => [1, 2, 3]),
  });
  assert.equal(wide.rows.length, TABLE_LIMITS.maxCategories);
  assert.equal(wide.columns.length, TABLE_LIMITS.minCategories);
  assert.deepEqual(wide.counts[0], [1, 2]);
  assert.deepEqual(wide.columns[1], { zh: '第 2 列', en: 'Column 2' });

  // Without labels the counts decide the size. 没有标签时由计数决定大小。
  const unlabeled = normalizeTwoWayTableConfig({ counts: [[1, 2, 3], [4, 5], [6]] });
  assert.equal(unlabeled.rows.length, 3);
  assert.equal(unlabeled.columns.length, 3);
  assert.deepEqual(unlabeled.counts, [[1, 2, 3], [4, 5, 0], [6, 0, 0]]);
  assert.deepEqual(unlabeled.rows[2], { zh: '第 3 行', en: 'Row 3' });

  const huge = normalizeTwoWayTableConfig({ counts: [[1e20, 1], [1, 1]] });
  assert.equal(huge.counts[0][0], TABLE_LIMITS.maxCount);

  for (const [decimals, expected] of [[0, 2], [1, 2], [2, 2], [3.6, 4], [9, 6], ['x', 3], [null, 3], [Number.NaN, 3]]) {
    assert.equal(normalizeTwoWayTableConfig({ ...GSS, decimals }).decimals, expected, `decimals ${decimals}`);
  }
  for (const start of ['joint', 'rows', '', 42, null]) {
    assert.equal(normalizeTwoWayTableConfig({ ...GSS, start }).start, 'counts', `start ${start}`);
  }
});

test('normalizeTwoWayTableConfig falls back to the midterm table when no count is usable', () => {
  for (const config of [undefined, null, 42, 'table', [], {}, { counts: [[0, 0], [0, 0]] }, { counts: 'none' }, { rows: TITANIC.rows }]) {
    const model = normalizeTwoWayTableConfig(config);
    assert.equal(model.usedExample, true);
    assert.deepEqual(model.counts, EXAMPLE_TABLE.counts);
    assert.deepEqual(model.rows, EXAMPLE_TABLE.rows);
    assert.deepEqual(model.rowVariable, EXAMPLE_TABLE.rowVariable);
  }
  const kept = normalizeTwoWayTableConfig({ counts: [[0, 0], [0, 0]], decimals: 4, start: 'row' });
  assert.equal(kept.decimals, 4);
  assert.equal(kept.start, 'row');
  // The model is a copy: changing it never changes the frozen example. 模型是副本：修改它不会改动冻结的示例。
  kept.counts[0][0] = 999;
  assert.equal(EXAMPLE_TABLE.counts[0][0], 30);
  assert.ok(Object.isFrozen(EXAMPLE_TABLE.counts[0]));
});

/* ---------- Cells 格子 ---------- */

test('cellRole, cellCount and cellKind name every table position', () => {
  const { table } = setup(TITANIC);
  assert.equal(cellRole(table, 0, 0), 'cell');
  assert.equal(cellRole(table, 1, 4), 'row-total');
  assert.equal(cellRole(table, 2, 3), 'column-total');
  assert.equal(cellRole(table, 2, 4), 'grand-total');
  for (const [row, column] of [[3, 0], [0, 5], [-1, 0], [0.5, 1], ['0', 0]]) assert.equal(cellRole(table, row, column), null);
  assert.equal(cellCount(table, 0, 0), 203);
  assert.equal(cellCount(table, 1, 4), 1490);
  assert.equal(cellCount(table, 2, 3), 885);
  assert.equal(cellCount(table, 2, 4), 2201);
  assert.ok(Number.isNaN(cellCount(table, 9, 9)));
  assert.equal(cellKind('row', 'cell'), 'row-conditional');
  assert.equal(cellKind('row', 'column-total'), 'marginal-column');
  assert.equal(cellKind('column', 'row-total'), 'marginal-row');
  assert.equal(cellKind('total', 'cell'), 'joint');
  assert.equal(cellKind('unknown', 'cell'), 'count');
});

test('cellDisplay prints each view like the R output of M2 p.30-33', () => {
  const { model, table } = setup(TITANIC);
  const counts = cellDisplay(model, table, 'counts', 0, 0);
  assert.equal(counts.countText, '203');
  assert.equal(counts.share, null);

  const joint = cellDisplay(model, table, 'total', 0, 0);
  assert.equal(joint.share.proportion, '0.0922');
  assert.equal(joint.share.percent, '9.22%');
  assert.equal(joint.share.sign, '≈');

  // prop.table(tab, 1): 0.28551336 (p.33); prop.table(tab, 2): 0.2521246 for Third (p.32).
  assert.equal(cellDisplay(model, table, 'row', 0, 0).share.proportion, '0.2855');
  assert.equal(cellDisplay(model, table, 'column', 0, 2).share.percent, '25.21%');
  assert.equal(cellDisplay(model, table, 'column', 0, 3).share.percent, '23.95%');

  // Margins: in the row view the Total row is the marginal distribution of ticket class (p.29).
  assert.equal(cellDisplay(model, table, 'row', 2, 3).share.proportion, '0.4021');
  assert.equal(cellDisplay(model, table, 'row', 0, 4).share.proportion, '1.0000');
  assert.equal(cellDisplay(model, table, 'column', 0, 4).share.proportion, '0.3230');
  assert.equal(cellDisplay(model, table, 'total', 2, 4).share.percent, '100.00%');
  assert.equal(cellDisplay(model, table, 'total', 2, 4).share.sign, '=');
  assert.equal(cellDisplay(model, table, 'total', 7, 7), null);
});

test('shareText, fractionFormula, formatCount and plainLabel format like the course', () => {
  const model = { decimals: 3, percentDigits: 1 };
  assert.deepEqual(shareText(30 / 96, model), { defined: true, sign: '≈', about: true, proportion: '0.313', percent: '31.3%' });
  assert.deepEqual(shareText(0.25, model), { defined: true, sign: '=', about: false, proportion: '0.250', percent: '25.0%' });
  assert.equal(shareText(Number.NaN, model).defined, false);
  assert.equal(fractionFormula({ numerator: 30, denominator: 96, value: 30 / 96 }, model), '30 / 96 ≈ 0.313 = 31.3%');
  assert.equal(fractionFormula({ numerator: 0, denominator: 0, value: Number.NaN }, model), '0 / 0');
  assert.equal(formatCount(2201), '2201');
  assert.equal(formatCount(Number.NaN), '—');
  // Counts up to the cap print digit for digit, totals included. 不超过上限的计数逐位原样印出，合计也一样。
  assert.equal(formatCount(TABLE_LIMITS.maxCount), '1000000000000');
  const large = normalizeTwoWayTableConfig({ counts: [[600000000000, 3], [5, 7]] });
  const largeTable = buildTable(large);
  assert.deepEqual([[0, 0], [0, 2], [2, 2]].map(([row, column]) => cellDisplay(large, largeTable, 'counts', row, column).countText),
    ['600000000000', '600000000003', '600000000015']);
  assert.equal(plainLabel({ zh: '生还', en: 'Alive' }), '生还 Alive');
  assert.equal(plainLabel({ zh: 'Crew', en: 'Crew' }), 'Crew');
  assert.equal(plainLabel({ zh: '', en: '**Yes**' }), 'Yes');
});

/* ---------- Explanations 说明 ---------- */

test('describeCell in the counts view lists the three choices of percentages of M2 p.23', () => {
  const { model, table } = setup({ ...TITANIC, decimals: 3 });
  const info = describeCell(model, table, 'counts', 0, 0);
  assert.equal(info.kind, 'count');
  assert.deepEqual(info.lines.map((line) => line.formula), [
    '203 / 711 ≈ 0.286 = 28.6%',
    '203 / 325 ≈ 0.625 = 62.5%',
    '203 / 2201 ≈ 0.092 = 9.2%',
  ]);
  assert.equal(info.lines[0].sentence.en,
    'Among the 711 cases with Survival Status = Alive, about 28.6% (203/711) have Ticket Class = First.');
  assert.equal(info.lines[1].sentence.en,
    'Among the 325 cases with Ticket Class = First, about 62.5% (203/325) have Survival Status = Alive.');
  assert.equal(info.lines[2].sentence.en,
    'About 9.2% (203/2201) of all cases have Survival Status = Alive and Ticket Class = First.');
  assert.equal(info.lines[1].sentence.zh, '在「船票等级 = 头等舱」的 325 个个体中，约 62.5%（203/325）是「生还状态 = 生还」。');
  assert.equal(info.summary.en, '203 cases have Survival Status = Alive and Ticket Class = First.');
  assert.equal(info.announce, '生还 × 头等舱 Alive × First: 203');
  assert.deepEqual(info.highlight.denominator, [{ row: 0, column: 4 }, { row: 2, column: 0 }, { row: 2, column: 4 }]);
});

test('describeCell reproduces midterm 2025 Q2-Q5 with their denominators', () => {
  const { model, table } = setup(GSS);
  const q4 = describeCell(model, table, 'row', 0, 0);
  assert.equal(q4.kind, 'row-conditional');
  assert.equal(q4.lines[0].formula, '30 / 96 ≈ 0.313 = 31.3%');
  assert.equal(q4.lines[0].sentence.en,
    'Among the 96 cases with Member of Environmental Group = Yes, about 31.3% (30/96) have Pay Higher Prices = Yes.');
  assert.deepEqual(q4.highlight, { numerator: [{ row: 0, column: 0 }], denominator: [{ row: 0, column: 2 }], band: { axis: 'row', index: 0 } });
  assert.equal(describeCell(model, table, 'row', 1, 0).lines[0].formula, '88 / 1021 ≈ 0.086 = 8.6%');
  const q3 = describeCell(model, table, 'total', 2, 0);
  assert.equal(q3.kind, 'marginal-column');
  assert.equal(q3.lines[0].formula, '118 / 1117 ≈ 0.106 = 10.6%');
  assert.equal(q3.lines[0].sentence.en, 'About 10.6% (118/1117) of all cases have Pay Higher Prices = Yes.');
  assert.equal(describeCell(model, table, 'total', 0, 0).lines[0].formula, '30 / 1117 ≈ 0.027 = 2.7%');
  assert.equal(describeCell(model, table, 'total', 1, 1).lines[0].formula, '933 / 1117 ≈ 0.835 = 83.5%');
});

test('describeCell explains totals, sums and the grand total', () => {
  const { model, table } = setup(TITANIC);
  const rowTotal = describeCell(model, table, 'counts', 0, 4);
  assert.equal(rowTotal.lines[0].formula, '203 + 118 + 178 + 212 = 711');
  assert.equal(rowTotal.lines[1].formula, '711 / 2201 ≈ 0.3230 = 32.30%');
  assert.equal(rowTotal.highlight.numerator.length, 4);
  const columnTotal = describeCell(model, table, 'counts', 2, 2);
  assert.equal(columnTotal.lines[0].formula, '178 + 528 = 706');
  const grand = describeCell(model, table, 'counts', 2, 4);
  assert.deepEqual(grand.lines.map((line) => line.formula), ['711 + 1490 = 2201', '325 + 285 + 706 + 885 = 2201']);

  // Printed row proportions of the Alive row add to 1.0001 (0.2855 + 0.1660 + 0.2504 + 0.2982).
  const rowSum = describeCell(model, table, 'row', 0, 4);
  assert.equal(rowSum.kind, 'row-sum');
  assert.equal(rowSum.lines[0].formula, '(203 + 118 + 178 + 212) / 711 = 711 / 711 = 1 = 100%');
  assert.match(rowSum.note.en, /add to 1\.0001/);
  assert.equal(describeCell(model, table, 'column', 2, 0).note, null);
  assert.equal(describeCell(model, table, 'column', 2, 4).lines[0].formula, '2201 / 2201 = 1 = 100%');
  const marginal = describeCell(model, table, 'row', 2, 1);
  assert.equal(marginal.kind, 'marginal-column');
  assert.match(marginal.note.en, /Compare each row's conditional distribution/);
  assert.deepEqual(marginal.highlight.band, { axis: 'row', index: 2 });
  assert.equal(describeCell(model, table, 'row', 5, 5), null);
});

test('cellHighlights marks numerator, denominator and the conditional band', () => {
  const { table } = setup(TITANIC);
  assert.deepEqual(cellHighlights(table, 'column', 1, 2), {
    numerator: [{ row: 1, column: 2 }], denominator: [{ row: 2, column: 2 }], band: { axis: 'column', index: 2 },
  });
  assert.deepEqual(cellHighlights(table, 'total', 1, 2).denominator, [{ row: 2, column: 4 }]);
  const columnSum = cellHighlights(table, 'column', 2, 1);
  assert.deepEqual(columnSum.numerator, [{ row: 0, column: 1 }, { row: 1, column: 1 }]);
  assert.deepEqual(columnSum.denominator, [{ row: 2, column: 1 }]);
  assert.deepEqual(cellHighlights(table, 'counts', 9, 9), { numerator: [], denominator: [], band: null });
});

test('zero row totals (accepted by the validator) give undefined percentages, not errors', () => {
  const { model, table } = setup({ rows: ['A', 'B'], columns: ['X', 'Y'], counts: [[0, 0], [5, 3]] });
  assert.equal(model.usedExample, false);
  const empty = describeCell(model, table, 'row', 0, 0);
  assert.equal(empty.lines[0].formula, '0 / 0');
  assert.match(empty.lines[0].sentence.en, /undefined/);
  assert.equal(describeCell(model, table, 'row', 0, 2).lines[0].formula, '0 + 0 = 0');
  assert.equal(cellDisplay(model, table, 'row', 0, 1).share.defined, false);
  const bars = conditionalBars(model, table, 'row');
  assert.equal(bars.bars[0].empty, true);
  assert.equal(associationSummary(model, table, 'row').status, 'insufficient');
  assert.equal(comparisonChoices(model, table, 'row').groups.length, 1);
  assert.equal(compareGroups(model, table, 'row'), null);
  // Column view still works: both columns have cases. 列视图仍可用：两列都有个体。
  assert.equal(compareGroups(model, table, 'column').sameGroup, false);
});

test('viewGuide and tableShape describe the views in both languages', () => {
  const { model } = setup(TITANIC);
  assert.match(viewGuide(model, 'row').en, /prop\.table\(tab, 1\)/);
  assert.match(viewGuide(model, 'column').en, /prop\.table\(tab, 2\)/);
  assert.match(viewGuide(model, 'total').en, /joint distribution/);
  assert.match(viewGuide(model, 'counts').zh, /行合计/);
  assert.match(viewGuide(model, 'row').zh, /条件分布/);
  assert.equal(tableShape(model).en, 'A 2 x 4 contingency table (read as "2-by-4"): 2 rows and 4 columns, not counting the totals.');
});

/* ---------- Chart and association 图与关联 ---------- */

test('conditionalBars gives one 100% bar per group plus the marginal bar', () => {
  const { model, table } = setup(TITANIC);
  assert.equal(conditionalBars(model, table, 'counts'), null);
  assert.equal(conditionalBars(model, table, 'total'), null);
  const data = conditionalBars(model, table, 'column');
  assert.equal(data.bars.length, 5);
  assert.deepEqual(data.bars.map((bar) => bar.total), [325, 285, 706, 885, 2201]);
  assert.equal(data.bars[4].marginal, true);
  for (const bar of data.bars) {
    const width = bar.segments.reduce((sum, segment) => sum + segment.width, 0);
    assert.ok(Math.abs(width - 100) < 1e-9);
  }
  assert.deepEqual(data.bars[0].segments.map((segment) => segment.label), ['62%', '38%']);
  assert.deepEqual(data.bars[4].segments.map((segment) => segment.percent), ['32.30%', '67.70%']);
  assert.match(data.description, /First, n = 325: 生还 Alive 62\.46%, 死亡 Dead 37\.54%/);
  const rows = conditionalBars(model, table, 'row');
  assert.equal(rows.bars.length, 3);
  assert.equal(rows.bars[0].segments.length, 4);
  assert.deepEqual(rows.categoryVariable, TITANIC.columnVariable);
});

test('associationSummary compares the conditional distributions (M2 p.34-35, practice Q1E)', () => {
  const titanic = setup(TITANIC);
  const summary = associationSummary(titanic.model, titanic.table, 'column');
  assert.equal(summary.status, 'different');
  assert.equal(summary.category, 0);
  assert.equal(summary.low.group, 3);
  assert.equal(summary.high.group, 0);
  assert.equal(summary.pointsText, '38.51');
  assert.equal(summary.sentence.en, 'The conditional distributions are not all the same: the percentage with Survival Status = Alive '
    + 'ranges from 23.95% (Ticket Class = Crew) to 62.46% (Ticket Class = First), a difference of about 38.51 percentage points.');
  assert.equal(summary.rule, ASSOCIATION_RULE);
  assert.equal(associationSummary(titanic.model, titanic.table, 'counts'), null);

  const none = setup(NO_ASSOCIATION);
  assert.equal(associationSummary(none.model, none.table, 'column').status, 'identical');
  assert.equal(associationSummary(none.model, none.table, 'row').status, 'identical');
  assert.match(associationSummary(none.model, none.table, 'column').sentence.en, /independent/);

  // Practice Q1E: the largest gap is Excellent, 40.09% vs 38.33% = 1.76 percentage points.
  const health = setup(MENTAL_HEALTH);
  const small = associationSummary(health.model, health.table, 'row');
  assert.equal(small.status, 'different');
  assert.equal(small.category, 4);
  assert.equal(small.pointsText, '1.76');
});

/* ---------- Difference and ratio 差与比 ---------- */

test('ratioWording follows the course wording rules of M2 p.42-44', () => {
  assert.deepEqual(ratioWording(0.62 / 0.25), { kind: 'times', rounded: 2.48, amount: 2.48 });
  assert.deepEqual(ratioWording(0.054 / 0.05), { kind: 'higher', rounded: 1.08, amount: 8 });
  assert.deepEqual(ratioWording(1.23), { kind: 'higher', rounded: 1.23, amount: 23 });
  assert.deepEqual(ratioWording(0.05 / 0.054), { kind: 'lower', rounded: 0.93, amount: 7 });
  assert.deepEqual(ratioWording(0.92), { kind: 'lower', rounded: 0.92, amount: 8 });
  assert.deepEqual(ratioWording(2), { kind: 'times', rounded: 2, amount: 2 });
  assert.deepEqual(ratioWording(1.996), { kind: 'times', rounded: 2, amount: 2 });
  assert.equal(ratioWording(1.004).kind, 'same');
  assert.deepEqual(ratioWording(0), { kind: 'lower', rounded: 0, amount: 100 });
  for (const bad of [Number.NaN, Infinity, -1, '2', null]) assert.equal(ratioWording(bad).kind, 'undefined');
  assert.equal(RATIO_DIGITS, 2);
});

test('compareGroups reproduces the Titanic difference and ratio (M2 p.37-38)', () => {
  const { model, table } = setup(TITANIC);
  const choices = comparisonChoices(model, table, 'column');
  assert.deepEqual(defaultComparison(choices), { first: 0, second: 1, category: 0 });
  const result = compareGroups(model, table, 'column', { first: 0, second: 2, category: 0 });
  assert.equal(result.p1.formula, 'p₁ = 203 / 325 ≈ 0.6246 = 62.46%');
  assert.equal(result.p2.formula, 'p₂ = 178 / 706 ≈ 0.2521 = 25.21%');
  assert.equal(result.difference.formula, 'p₁ − p₂ ≈ 0.6246 − 0.2521 ≈ 0.3725');
  assert.equal(result.difference.sentence.en, 'The percentage with Survival Status = Alive is about 37.25 percentage points higher '
    + 'among cases with Ticket Class = First than among cases with Ticket Class = Third. Say "percentage points", not "37.25% higher" (M2 p.37).');
  assert.equal(result.ratio.formula, 'p₁ / p₂ ≈ 0.6246 / 0.2521 ≈ 2.48');
  assert.equal(result.ratio.wording.kind, 'times');
  assert.match(result.ratio.sentence.en, /2\.48 times as large among cases with Ticket Class = First as among cases with Ticket Class = Third/);
  assert.equal(result.ratio.tip, null);
  assert.equal(result.ratio.roundingNote, null);

  const swapped = compareGroups(model, table, 'column', { first: 2, second: 0, category: 0 });
  assert.equal(swapped.ratio.wording.kind, 'lower');
  assert.match(swapped.difference.sentence.en, /lower/);
  assert.ok(swapped.ratio.tip);
});

test('compareGroups gives the midterm Q6 relative risk 3.63 and warns about rounding first', () => {
  const { model, table } = setup(GSS);
  const result = compareGroups(model, table, 'row', { first: 0, second: 1, category: 0 });
  assert.equal(result.ratio.text, '3.63');
  assert.match(result.ratio.sentence.en, /3\.63 times as large among cases with Member of Environmental Group = Yes as among cases with Member of Environmental Group = No/);
  assert.match(result.ratio.roundingNote.en, /0\.313 and 0\.086 first gives 3\.64 instead of 3\.63/);
});

test('compareGroups uses percent wording between 1 and 2 and handles bad selections', () => {
  // M2 p.41-43: heart attacks, placebo 0.054 vs aspirin 0.050. 第 41-43 页：安慰剂 0.054，阿司匹林 0.050。
  const { model, table } = setup({
    rowVariable: { zh: '组别', en: 'Group' },
    columnVariable: { zh: '心脏病发作', en: 'Heart attack' },
    rows: [{ zh: '安慰剂', en: 'Placebo' }, { zh: '阿司匹林', en: 'Aspirin' }],
    columns: [{ zh: '是', en: 'Yes' }, { zh: '否', en: 'No' }],
    counts: [[54, 946], [50, 950]],
  });
  const higher = compareGroups(model, table, 'row', { first: 0, second: 1, category: 0 });
  assert.equal(higher.ratio.wording.kind, 'higher');
  assert.match(higher.ratio.sentence.en, /\(1\.08 − 1\) × 100% = 8%\. The proportion with Heart attack = Yes is 8% higher/);
  const lower = compareGroups(model, table, 'row', { first: 1, second: 0, category: 0 });
  assert.match(lower.ratio.sentence.en, /\(1 − 0\.93\) × 100% = 7%/);

  const fallback = compareGroups(model, table, 'row', { first: 'x', second: 9, category: -1 });
  assert.equal(fallback.first, 0);
  assert.equal(fallback.second, 1);
  assert.equal(fallback.category, 0);
  assert.equal(compareGroups(model, table, 'row', { first: 1, second: 1 }).sameGroup, true);
  assert.equal(compareGroups(model, table, 'total'), null);
  assert.equal(comparisonChoices(model, table, 'counts'), null);
  assert.equal(defaultComparison(null), null);
});

test('compareGroups reports an undefined ratio when p₂ is 0', () => {
  const { model, table } = setup({ rows: ['A', 'B'], columns: ['X', 'Y'], counts: [[4, 6], [0, 10]] });
  const result = compareGroups(model, table, 'row', { first: 0, second: 1, category: 0 });
  assert.equal(result.ratio.wording.kind, 'undefined');
  assert.equal(result.ratio.formula, 'p₁ / p₂ = 0.400 / 0.000');
  assert.match(result.ratio.sentence.en, /undefined/);
  assert.match(result.difference.sentence.en, /40\.0 percentage points higher/);
});

/* ---------- Practice 练习 ---------- */

test('buildQuestion offers the midterm Q3-Q5 options built from real mistakes', () => {
  const { model, table } = setup(GSS);
  const values = (question) => new Set(question.options.map((option) => `${option.numerator}/${option.denominator}`));

  const q4 = buildQuestion(model, table, { kind: 'row-conditional', row: 0, column: 0 }, seeded(3));
  assert.equal(q4.prompt.en, 'Among the cases with Member of Environmental Group = Yes, what is the proportion with Pay Higher Prices = Yes?');
  for (const fraction of ['30/96', '30/1117', '30/118', '118/1117']) assert.ok(values(q4).has(fraction), fraction);
  assert.equal(q4.options.length, PRACTICE_LIMITS.maxOptions);
  assert.equal(q4.formula, '30 / 96 ≈ 0.313 = 31.3%');

  // Midterm Q5 options: 0.086 (answer), 0.079, 0.746, 0.106, 0.914 (the complement). A random source near 1
  // leaves the extra mistakes in their order, so the complement is the fifth option.
  // 期中第 5 题的选项。随机源接近 1 时其余错误保持原顺序，所以第五个选项是补集。
  const q5 = buildQuestion(model, table, { kind: 'row-conditional', row: 1, column: 0 }, () => 0.99);
  assert.deepEqual(values(q5), new Set(['88/1021', '88/1117', '88/118', '118/1117', '933/1021']));

  // Midterm Q3: 0.106 (answer) with 0.313 = 30/96 and 0.341 = 30/88 among the distractors.
  const q3 = buildQuestion(model, table, { kind: 'marginal-column', row: 0, column: 0 }, seeded(5));
  assert.deepEqual(values(q3), new Set(['118/1117', '30/1117', '30/96', '999/1117', '30/88']));

  // Joint: 30/1117 with the row and column denominators and the whole totals (midterm Q2 adds 96 + 118).
  const joint = buildQuestion(model, table, { kind: 'joint', row: 0, column: 0 }, seeded(11));
  for (const fraction of ['30/1117', '30/96', '30/118', '96/1117']) assert.ok(values(joint).has(fraction), fraction);
});

test('every practice question has one answer and distinct printed options', () => {
  for (const config of [TITANIC, GSS, MENTAL_HEALTH, NO_ASSOCIATION]) {
    const { model, table } = setup(config);
    const candidates = practiceCandidates(model, table);
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
      const question = buildQuestion(model, table, candidate, seeded(candidate.row * 10 + candidate.column + 1));
      const printed = question.options.map((option) => option.text.split(' ').pop());
      assert.equal(new Set(printed).size, printed.length, `${candidate.key} has repeated values`);
      assert.ok(question.options.length >= PRACTICE_LIMITS.minOptions && question.options.length <= PRACTICE_LIMITS.maxOptions);
      assert.equal(question.options.filter((option) => option.correct).length, 1);
      assert.ok(question.options[question.answer].correct);
      for (const option of question.options) {
        assert.ok(option.value > 0 && option.value <= 1, `${candidate.key}: ${option.text}`);
        if (!option.correct) assert.ok(option.feedback?.zh && option.feedback?.en, `${candidate.key}: ${option.mistake}`);
        assert.ok(option.denominatorCell && option.numeratorCells.length > 0);
        assert.equal(option.wrongCells.length > 0, !option.correct, `${candidate.key}: ${option.mistake}`);
      }
    }
  }
});

test('generateQuestion draws kinds by weight, avoids the previous question and tolerates bad randomness', () => {
  const { model, table } = setup(GSS);
  assert.equal(generateQuestion(model, table, () => 0).kind, QUESTION_KINDS[0]);
  assert.equal(generateQuestion(model, table, () => 0.9999).kind, 'marginal-column');
  const random = seeded(42);
  let previous = null;
  for (let round = 0; round < 40; round += 1) {
    const question = generateQuestion(model, table, random, { avoid: previous?.key });
    assert.ok(question);
    if (previous) assert.notEqual(question.key, previous.key);
    previous = question;
  }
  for (const broken of [() => Number.NaN, () => 7, null, 'random']) {
    const question = generateQuestion(model, table, broken);
    assert.ok(question && question.answer >= 0);
  }
  // A table whose only proportions are 0 or 1 has no question. 只有 0 和 1 两种比例的表出不了题。
  const degenerate = setup({ counts: [[5, 0], [0, 0]] });
  assert.equal(generateQuestion(degenerate.model, degenerate.table, seeded(1)), null);
  assert.deepEqual(practiceCandidates(degenerate.model, degenerate.table), []);
});

test('wrongCells marks only the part of a wrong option that differs from the answer', () => {
  const { model, table } = setup(GSS);
  const question = buildQuestion(model, table, { kind: 'row-conditional', row: 0, column: 0 }, () => 0.99);
  const byMistake = Object.fromEntries(question.options.map((option) => [option.mistake ?? 'answer', option.wrongCells]));
  assert.deepEqual(byMistake.answer, []);
  assert.deepEqual(byMistake['grand-total'], [{ row: 2, column: 2 }]);
  assert.deepEqual(byMistake.reversed, [{ row: 2, column: 0 }]);
  assert.deepEqual(byMistake['ignored-condition'], [{ row: 2, column: 0 }, { row: 2, column: 2 }]);
  // The complement divides by the right total; only its numerator (the other cell, 66) is wrong.
  // 补集的分母是对的，只有分子（另一个格子 66）错了。
  assert.deepEqual(byMistake.complement, [{ row: 0, column: 1 }]);
});

test('judgeAnswer names the mistake and revealAnswer gives the letter', () => {
  const { model, table } = setup(GSS);
  const question = buildQuestion(model, table, { kind: 'row-conditional', row: 0, column: 0 }, seeded(9));
  const right = judgeAnswer(question, question.answer);
  assert.equal(right.correct, true);
  assert.match(right.feedback.en, /^Correct! 30 \/ 96 ≈ 0\.313 = 31\.3%\. Among the 96 cases/);
  assert.match(right.feedback.zh, /^答对了！/);
  const grandIndex = question.options.findIndex((option) => option.mistake === 'grand-total');
  const wrong = judgeAnswer(question, grandIndex);
  assert.equal(wrong.correct, false);
  assert.match(wrong.feedback.en, /grand total 1117/);
  assert.deepEqual(wrong.option.denominatorCell, { row: 2, column: 2 });
  const reversedIndex = question.options.findIndex((option) => option.mistake === 'reversed');
  assert.match(judgeAnswer(question, reversedIndex).feedback.en, /reverses the condition/);
  assert.equal(judgeAnswer(question, 99), null);
  assert.equal(judgeAnswer(null, 0), null);
  const letter = 'ABCDE'[question.answer];
  assert.match(revealAnswer(question).en, new RegExp(`^The answer is ${letter}: 30 / 96`));
  assert.equal(revealAnswer(null), null);
});

/* ---------- Text quality 文字质量 ---------- */

test('generated text never shows undefined, NaN or Chinese inside English sentences', () => {
  for (const config of [TITANIC, GSS, MENTAL_HEALTH, NO_ASSOCIATION, { counts: [[0, 0], [5, 3]] }]) {
    const { model, table } = setup(config);
    const texts = [];
    for (const view of TWO_WAY_VIEWS) {
      texts.push(viewGuide(model, view), conditionalBars(model, table, view), associationSummary(model, table, view));
      for (let row = 0; row <= table.rowCount; row += 1) {
        for (let column = 0; column <= table.columnCount; column += 1) texts.push(describeCell(model, table, view, row, column));
      }
      const choices = comparisonChoices(model, table, view);
      for (const first of choices?.groups ?? []) {
        for (const second of choices.groups) {
          for (const category of choices.categories) {
            texts.push(compareGroups(model, table, view, { first: first.index, second: second.index, category: category.index }));
          }
        }
      }
    }
    for (const candidate of practiceCandidates(model, table)) texts.push(buildQuestion(model, table, candidate, seeded(2)));
    texts.push(tableShape(model));
    // "is undefined" is a real sentence (division by 0); any other "undefined" is a missing value.
    // “is undefined”是正常句子（除以 0）；其他地方出现 undefined 都说明漏了值。
    for (const text of strings(texts)) assert.doesNotMatch(text, /(?<!is )undefined|NaN|\[object|\bnull\b/, text);
    const english = [];
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        if (typeof value.en === 'string') english.push(value.en);
        Object.entries(value).forEach(([key, item]) => { if (key !== 'en') walk(item); });
      }
    };
    walk(texts);
    for (const text of english) assert.doesNotMatch(text, /[一-鿿]/, text);
  }
});
