/**
 * Pure logic of the "two-way-table" widget: the contingency tables of STA220 Module 2. DOM-free.
 * “two-way-table”组件的纯逻辑：STA220 第 2 单元的列联表；不依赖 DOM。
 *
 * The module reads the content config and builds every number and sentence the widget shows: the cells of the
 * four views (counts, % of Overall Total, % of Row, % of Column), the explanation of a selected cell with its
 * fraction and denominator, the conditional distributions behind the segmented bar chart, the association
 * summary, the difference and ratio of two conditional proportions, and the practice questions.
 * 本模块读取内容配置，生成组件显示的每一个数字和句子：四种视图（计数、总百分比、行百分比、列百分比）的格子，
 * 选中格子的分数与分母说明，分段条形图背后的条件分布，关联小结，两个条件比例的差与比，以及练习题。
 *
 * Course conventions (M2 p.21-45, midterm 2025 Q1-Q6):
 * - % of Row = cell ÷ row total, % of Column = cell ÷ column total, % of Overall Total (joint) = cell ÷ grand
 *   total; a marginal proportion is a row or column total ÷ the grand total.
 * - Proportions are printed with `decimals` places and percentages with two places fewer, so a percentage is
 *   exactly the printed proportion × 100 (0.2855 = 28.55%); "≈" marks a rounded value.
 * - A difference of two percentages is given in percentage points, never "% higher" (M2 p.37).
 * - A ratio of proportions uses the unrounded proportions (midterm Q6: 3.63) and is printed with 2 decimals:
 *   2 or more reads "times as large", between 1 and 2 "(ratio − 1) × 100% higher", below 1
 *   "(1 − ratio) × 100% lower" (M2 p.38-44).
 * 课程约定（第 2 单元第 21-45 页，2025 年期中考试第 1-6 题）：
 * - 行百分比 = 格子 ÷ 行合计，列百分比 = 格子 ÷ 列合计，总百分比（联合）= 格子 ÷ 总数；边际比例 = 行合计或列合计 ÷ 总数。
 * - 比例保留 decimals 位小数，百分数少两位，所以百分数正好是显示出来的比例 × 100（0.2855 = 28.55%）；“≈”表示经过四舍五入。
 * - 两个百分数之差用“百分点”表示，不说“高百分之几”（第 37 页）。
 * - 比例之比用没有四舍五入的比例计算（期中第 6 题：3.63），保留 2 位小数：不小于 2 说“是……的几倍”，
 *   在 1 和 2 之间说“高 (比值 − 1) × 100%”，小于 1 说“低 (1 − 比值) × 100%”（第 38-44 页）。
 */
import { optionLetter } from '../../../core/util/format.js';
import { shuffleWith } from '../../../core/util/random.js';
import { isFiniteNumber, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import { formatFixed, formatTerms, relationSign, roundTo } from '../shared/stat-format.js';
import { cellFraction, contingency, marginalFraction } from '../shared/stats-math.js';

/* ---------- Config 配置 ---------- */

export const TWO_WAY_VIEWS = Object.freeze(['counts', 'total', 'row', 'column']);

// Sizes the widget can lay out, and the decimals it prints (the course uses 2-4; R prints more).
// 组件能排版的尺寸与打印的小数位数（课程用 2-4 位；R 会打印更多位）。
export const TABLE_LIMITS = Object.freeze({
  minCategories: 2,
  maxCategories: 6,
  minDecimals: 2,
  maxDecimals: 6,
  defaultDecimals: 3,
  maxCount: 1e12,
});

// Ratios of proportions are printed with 2 decimals, like the course (0.62 / 0.25 = 2.48, RR = 3.63).
// 比例之比保留 2 位小数，与课程一致（0.62 / 0.25 = 2.48，相对风险 3.63）。
export const RATIO_DIGITS = 2;

function freezeDeep(value) {
  if (value && typeof value === 'object') Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

// The table of the 2025 midterm, Q1-Q6 (General Social Survey 2000), shown when a config has no usable counts.
// 2025 年期中考试第 1-6 题的表格（General Social Survey 2000），配置里没有可用的计数时显示它。
export const EXAMPLE_TABLE = freezeDeep({
  title: {
    zh: 'GSS 2000：是否环保组织成员 × 是否愿意多付钱保护环境',
    en: 'GSS 2000: environmental group membership and paying higher prices',
  },
  rowVariable: { zh: '环保组织成员', en: 'Member of Environmental Group' },
  columnVariable: { zh: '愿意多付钱', en: 'Pay Higher Prices' },
  rows: [{ zh: '是', en: 'Yes' }, { zh: '否', en: 'No' }],
  columns: [{ zh: '是', en: 'Yes' }, { zh: '否', en: 'No' }],
  counts: [[30, 66], [88, 933]],
});

const DEFAULT_TITLE = { zh: '列联表（二维表）', en: 'Contingency table (two-way table)' };
const DEFAULT_ROW_VARIABLE = { zh: '行变量', en: 'Row variable' };
const DEFAULT_COLUMN_VARIABLE = { zh: '列变量', en: 'Column variable' };
const rowFallback = (index) => ({ zh: `第 ${index + 1} 行`, en: `Row ${index + 1}` });
const columnFallback = (index) => ({ zh: `第 ${index + 1} 列`, en: `Column ${index + 1}` });

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampInteger(value, min, max, fallback) {
  const number = toNumber(value);
  if (number === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

// A count is a whole number of cases: anything unreadable or negative is 0, fractions are rounded.
// 计数是整数个个体：读不懂的值或负数记为 0，小数四舍五入。
function cleanCount(value) {
  const number = toNumber(value);
  if (number === null || number <= 0) return 0;
  return Math.min(TABLE_LIMITS.maxCount, Math.round(number));
}

// The labels decide how many categories there are; without labels the counts do. Clamped to 2-6.
// 类别个数由标签决定；没有标签时由计数决定。限制在 2-6 之间。
function categoryCount(labels, fromCounts) {
  const size = Array.isArray(labels) && labels.length ? labels.length : fromCounts;
  return Math.min(TABLE_LIMITS.maxCategories, Math.max(TABLE_LIMITS.minCategories, size));
}

function labelAt(labels, index, fallback) {
  return toBi(Array.isArray(labels) ? labels[index] : undefined, fallback(index));
}

function exampleModel() {
  return {
    title: { ...EXAMPLE_TABLE.title },
    rowVariable: { ...EXAMPLE_TABLE.rowVariable },
    columnVariable: { ...EXAMPLE_TABLE.columnVariable },
    rows: EXAMPLE_TABLE.rows.map((label) => ({ ...label })),
    columns: EXAMPLE_TABLE.columns.map((label) => ({ ...label })),
    counts: EXAMPLE_TABLE.counts.map((row) => [...row]),
  };
}

/**
 * Reads a content config defensively: { title, rowVariable, columnVariable, rows, columns, counts, decimals,
 * percentDigits, start, usedExample }. 2-6 rows and columns (labels missing for a size get "Row 3"),
 * whole non-negative counts (bad cells are 0), decimals 2-6 (default 3), start one of TWO_WAY_VIEWS
 * (default "counts"). When no count is positive the 2025 midterm table is used and usedExample is true.
 * 防御性读取内容配置。行、列各 2-6 个（缺少的标签用“第 3 行”之类代替），计数为非负整数（无效格子记 0），
 * decimals 为 2-6（默认 3），start 为四种视图之一（默认 "counts"）。没有任何正数计数时改用 2025 年期中考试的表格，
 * 并把 usedExample 设为 true。
 */
export function normalizeTwoWayTableConfig(config) {
  const source = isRecord(config) ? config : {};
  const rawRows = (Array.isArray(source.counts) ? source.counts : []).map((row) => (Array.isArray(row) ? row : []));
  const rowCount = categoryCount(source.rows, rawRows.length);
  const columnCount = categoryCount(source.columns, rawRows.reduce((widest, row) => Math.max(widest, row.length), 0));
  const counts = Array.from({ length: rowCount },
    (_, row) => Array.from({ length: columnCount }, (_, column) => cleanCount(rawRows[row]?.[column])));
  const decimals = clampInteger(source.decimals, TABLE_LIMITS.minDecimals, TABLE_LIMITS.maxDecimals, TABLE_LIMITS.defaultDecimals);
  const startKey = typeof source.start === 'string' ? source.start.trim().toLowerCase() : '';
  const settings = {
    decimals,
    percentDigits: decimals - 2,
    start: TWO_WAY_VIEWS.includes(startKey) ? startKey : 'counts',
  };
  if (!counts.some((row) => row.some((count) => count > 0))) return { ...exampleModel(), ...settings, usedExample: true };
  return {
    title: toBi(source.title, DEFAULT_TITLE),
    rowVariable: toBi(source.rowVariable, DEFAULT_ROW_VARIABLE),
    columnVariable: toBi(source.columnVariable, DEFAULT_COLUMN_VARIABLE),
    rows: Array.from({ length: rowCount }, (_, index) => labelAt(source.rows, index, rowFallback)),
    columns: Array.from({ length: columnCount }, (_, index) => labelAt(source.columns, index, columnFallback)),
    counts,
    ...settings,
    usedExample: false,
  };
}

/** Totals and proportions of the model's counts (stats-math contingency). 计数的合计与比例（stats-math 的 contingency）。 */
export function buildTable(model) {
  return contingency(model?.counts);
}

/* ---------- Text helpers 文字工具 ---------- */

const filled = (text) => typeof text === 'string' && text.trim().length > 0;
const enText = (value) => (filled(value?.en) ? value.en : (value?.zh ?? ''));
const zhText = (value) => (filled(value?.zh) ? value.zh : (value?.en ?? ''));
const stripMarks = (text) => text.replace(/\*\*|`/g, '');
const casesWord = (count) => (count === 1 ? 'case' : 'cases');

/** Plain text of a label for aria labels and select options: "生还 Alive". 标签的纯文本，用于无障碍标签和下拉选项。 */
export function plainLabel(value) {
  const parts = [value?.zh, value?.en].filter(filled).map(stripMarks);
  return parts.length === 2 && parts[0] === parts[1] ? parts[0] : parts.join(' ');
}

/**
 * A count as the course prints it: 2201. Whole counts are written digit for digit, because rounding them again
 * (formatFixed) misprints counts of 5 × 10¹¹ and more, which TABLE_LIMITS still allows.
 * 按课程写法输出计数：2201。整数计数逐位原样写出，因为再四舍五入一次（formatFixed）会把 5 × 10¹¹ 及以上的计数印错，
 * 而 TABLE_LIMITS 仍然允许这样大的计数。
 */
export function formatCount(count) {
  if (!isFiniteNumber(count)) return '—';
  return Number.isInteger(count) ? String(count) : formatFixed(count, 0);
}

/**
 * A proportion and its percentage as printed: { defined, sign, about, proportion: "0.2855", percent: "28.55%" }.
 * `sign` is "=" when the printed value is exact and "≈" when it was rounded.
 * 比例及其百分数的显示文字；数值精确时 sign 为“=”，经过四舍五入时为“≈”。
 */
export function shareText(value, model) {
  if (!isFiniteNumber(value)) return { defined: false, sign: '=', about: false, proportion: '—', percent: '—' };
  const sign = relationSign(value, model.decimals);
  return {
    defined: true,
    sign,
    about: sign !== '=',
    proportion: formatFixed(value, model.decimals),
    percent: `${formatFixed(value * 100, model.percentDigits)}%`,
  };
}

/** The worked fraction "203 / 711 ≈ 0.2855 = 28.55%"; a zero denominator prints "0 / 0". 写出的分数计算式。 */
export function fractionFormula(part, model) {
  const base = `${formatCount(part.numerator)} / ${formatCount(part.denominator)}`;
  const share = shareText(part.value, model);
  return share.defined ? `${base} ${share.sign} ${share.proportion} = ${share.percent}` : base;
}

// A condition such as Survival Status = Alive; Chinese wraps it in corner brackets.
// “变量 = 类别”形式的条件；中文外加直角引号。
function condition(variable, label) {
  return { zh: `「${zhText(variable)} = ${zhText(label)}」`, en: `${enText(variable)} = ${enText(label)}` };
}

const rowCondition = (model, row) => condition(model.rowVariable, model.rows[row]);
const columnCondition = (model, column) => condition(model.columnVariable, model.columns[column]);

/* ---------- Cells 格子 ---------- */

/**
 * What a table position holds: "cell", "row-total" (right margin), "column-total" (bottom margin),
 * "grand-total", or null outside the table. Row rowCount is the Total row, column columnCount the Total column.
 * 表格位置的种类：格子、行合计（右边）、列合计（下边）、总数；超出表格时为 null。
 */
export function cellRole(table, row, column) {
  const rows = table?.rowCount ?? 0;
  const columns = table?.columnCount ?? 0;
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0 || row > rows || column > columns) {
    return null;
  }
  if (row < rows && column < columns) return 'cell';
  if (row < rows) return 'row-total';
  if (column < columns) return 'column-total';
  return 'grand-total';
}

/** The count at a table position (a cell, a total or the grand total). 表格某个位置上的计数。 */
export function cellCount(table, row, column) {
  const role = cellRole(table, row, column);
  if (role === 'cell') return table.counts[row][column];
  if (role === 'row-total') return table.rowTotals[row];
  if (role === 'column-total') return table.columnTotals[column];
  return role === 'grand-total' ? table.total : NaN;
}

// Which quantity each position shows in each view. 每种视图里每个位置显示的量。
const VIEW_KINDS = Object.freeze({
  counts: { cell: 'count', 'row-total': 'row-total-count', 'column-total': 'column-total-count', 'grand-total': 'grand-total-count' },
  total: { cell: 'joint', 'row-total': 'marginal-row', 'column-total': 'marginal-column', 'grand-total': 'whole' },
  row: { cell: 'row-conditional', 'row-total': 'row-sum', 'column-total': 'marginal-column', 'grand-total': 'whole' },
  column: { cell: 'column-conditional', 'row-total': 'marginal-row', 'column-total': 'column-sum', 'grand-total': 'whole' },
});

/** The quantity a position shows in a view, e.g. "row-conditional"; an unknown view counts as "counts". 视图中某位置显示的量。 */
export function cellKind(view, role) {
  return (VIEW_KINDS[view] ?? VIEW_KINDS.counts)[role] ?? null;
}

function plainFraction(numerator, denominator) {
  return { numerator, denominator, value: denominator > 0 ? numerator / denominator : NaN };
}

function kindFraction(table, kind, row, column) {
  switch (kind) {
    case 'joint': return cellFraction(table, row, column, 'joint');
    case 'row-conditional': return cellFraction(table, row, column, 'row');
    case 'column-conditional': return cellFraction(table, row, column, 'column');
    case 'marginal-row': return marginalFraction(table, 'row', row);
    case 'marginal-column': return marginalFraction(table, 'column', column);
    case 'row-sum': return plainFraction(table.rowTotals[row], table.rowTotals[row]);
    case 'column-sum': return plainFraction(table.columnTotals[column], table.columnTotals[column]);
    case 'whole': return plainFraction(table.total, table.total);
    default: return null;
  }
}

/**
 * What a table position shows in a view: { role, kind, count, countText, fraction, share }. `fraction` and
 * `share` (see shareText) are null in the counts view.
 * 某个位置在某种视图下显示的内容；计数视图中 fraction 与 share 为 null。
 */
export function cellDisplay(model, table, view, row, column) {
  const role = cellRole(table, row, column);
  if (!role) return null;
  const kind = cellKind(view, role);
  const fraction = kindFraction(table, kind, row, column);
  const count = cellCount(table, row, column);
  return { role, kind, count, countText: formatCount(count), fraction, share: fraction ? shareText(fraction.value, model) : null };
}

/**
 * Cells to mark for a selected position: { numerator, denominator, band }. `numerator` lists the counts on
 * top of the fraction (or the counts that are added up), `denominator` the totals it divides by (the three
 * possible ones in the counts view), and `band` the row or column read as one conditional distribution.
 * 选中某个位置时要标出的格子：numerator 为分子（或被加起来的数），denominator 为分母（计数视图中是三种可能的分母），
 * band 为作为一个条件分布来读的那一行或那一列。
 */
export function cellHighlights(table, view, row, column) {
  const role = cellRole(table, row, column);
  const none = { numerator: [], denominator: [], band: null };
  if (!role) return none;
  const lastRow = table.rowCount;
  const lastColumn = table.columnCount;
  const at = (r, c) => ({ row: r, column: c });
  const grand = at(lastRow, lastColumn);
  const rowCells = (r) => Array.from({ length: lastColumn }, (_, c) => at(r, c));
  const columnCells = (c) => Array.from({ length: lastRow }, (_, r) => at(r, c));
  switch (cellKind(view, role)) {
    case 'count': return { ...none, numerator: [at(row, column)], denominator: [at(row, lastColumn), at(lastRow, column), grand] };
    case 'row-total-count': return { ...none, numerator: rowCells(row) };
    case 'column-total-count': return { ...none, numerator: columnCells(column) };
    case 'grand-total-count': return { ...none, numerator: [...columnCells(lastColumn), ...rowCells(lastRow)] };
    case 'joint': return { ...none, numerator: [at(row, column)], denominator: [grand] };
    case 'marginal-row': return { numerator: [at(row, lastColumn)], denominator: [grand], band: view === 'column' ? { axis: 'column', index: lastColumn } : null };
    case 'marginal-column': return { numerator: [at(lastRow, column)], denominator: [grand], band: view === 'row' ? { axis: 'row', index: lastRow } : null };
    case 'row-conditional': return { numerator: [at(row, column)], denominator: [at(row, lastColumn)], band: { axis: 'row', index: row } };
    case 'column-conditional': return { numerator: [at(row, column)], denominator: [at(lastRow, column)], band: { axis: 'column', index: column } };
    case 'row-sum': return { numerator: rowCells(row), denominator: [at(row, lastColumn)], band: { axis: 'row', index: row } };
    case 'column-sum': return { numerator: columnCells(column), denominator: [at(lastRow, column)], band: { axis: 'column', index: column } };
    case 'whole': return { ...none, denominator: [grand] };
    default: return none;
  }
}

/* ---------- Sentences 句子 ---------- */

function fractionWords(part) {
  return `${formatCount(part.numerator)}/${formatCount(part.denominator)}`;
}

// "About 9.22% (203/2201) of all cases have A and B", the M2 p.23 "% of Overall Total" sentence.
// 第 2 单元第 23 页“总百分比”的句型。
function jointSentence(model, part, row, column) {
  const share = shareText(part.value, model);
  const a = rowCondition(model, row);
  const b = columnCondition(model, column);
  return {
    zh: `全部 ${formatCount(part.denominator)} 个个体中，${share.about ? '约 ' : ''}${share.percent}（${fractionWords(part)}）同时是${a.zh}和${b.zh}。`,
    en: `${share.about ? 'About ' : ''}${share.percent} (${fractionWords(part)}) of all cases have ${a.en} and ${b.en}.`,
  };
}

function marginalSentence(model, part, target) {
  const share = shareText(part.value, model);
  return {
    zh: `全部 ${formatCount(part.denominator)} 个个体中，${share.about ? '约 ' : ''}${share.percent}（${fractionWords(part)}）是${target.zh}。`,
    en: `${share.about ? 'About ' : ''}${share.percent} (${fractionWords(part)}) of all cases have ${target.en}.`,
  };
}

// "Among the 711 cases with A, about 28.55% (203/711) have B": the group after "Among" is the denominator.
// “在 A 的 711 个个体中，约 28.55%（203/711）是 B”：Among 后面的那一组就是分母。
function conditionalSentence(model, part, given, target) {
  if (!(part.denominator > 0)) {
    return {
      zh: `没有任何个体是${given.zh}（合计为 0）。不能除以 0，所以这个比例无法计算。`,
      en: `No cases have ${given.en} (the total is 0). We cannot divide by 0, so this proportion is undefined.`,
    };
  }
  const share = shareText(part.value, model);
  const total = formatCount(part.denominator);
  return {
    zh: `在${given.zh}的 ${total} 个个体中，${share.about ? '约 ' : ''}${share.percent}（${fractionWords(part)}）是${target.zh}。`,
    en: `Among the ${total} ${casesWord(part.denominator)} with ${given.en}, ${share.about ? 'about ' : ''}${share.percent} (${fractionWords(part)}) have ${target.en}.`,
  };
}

const sumFormula = (values, total) => `${formatTerms(values, { term: formatCount, maxTerms: TABLE_LIMITS.maxCategories })} = ${formatCount(total)}`;

// Printed proportions of one row or column can add to 0.9999 or 1.0001 because each one was rounded.
// 一行（或一列）中每个比例都四舍五入过，所以显示出来的值加起来可能是 0.9999 或 1.0001。
function roundingNote(counts, total, model) {
  if (!(total > 0)) return null;
  const printed = counts.reduce((sum, count) => sum + roundTo(count / total, model.decimals), 0);
  const text = formatFixed(printed, model.decimals);
  if (text === formatFixed(1, model.decimals)) return null;
  return {
    zh: `把这里显示的 ${counts.length} 个比例直接相加，得到 ${text}，不是正好 1：每个比例都四舍五入过，这不是算错。`,
    en: `The ${counts.length} printed proportions add to ${text}, not exactly 1: each one was rounded, so this is not a mistake.`,
  };
}

const TERMS = Object.freeze({
  count: { zh: '计数（**count**，也叫频数 **frequency**）', en: 'Count (frequency)' },
  'row-total-count': { zh: '行合计（**row total**）', en: 'Row total' },
  'column-total-count': { zh: '列合计（**column total**）', en: 'Column total' },
  'grand-total-count': { zh: '总数（**grand total**）= 样本量 n', en: 'Grand total = the number of cases n' },
  joint: { zh: '联合比例（**joint proportion**）= 格子 ÷ 总数', en: 'Joint proportion = cell ÷ grand total (% of Overall Total)' },
  'marginal-row': { zh: '边际比例（**marginal proportion**）= 行合计 ÷ 总数', en: 'Marginal proportion = row total ÷ grand total' },
  'marginal-column': { zh: '边际比例（**marginal proportion**）= 列合计 ÷ 总数', en: 'Marginal proportion = column total ÷ grand total' },
  'row-conditional': { zh: '条件比例（**conditional proportion**）= 格子 ÷ 行合计', en: 'Conditional proportion = cell ÷ row total (% of Row)' },
  'column-conditional': { zh: '条件比例（**conditional proportion**）= 格子 ÷ 列合计', en: 'Conditional proportion = cell ÷ column total (% of Column)' },
  'row-sum': { zh: '一行的行百分比加起来 = 100%', en: 'Each row of row percentages adds to 100%' },
  'column-sum': { zh: '一列的列百分比加起来 = 100%', en: 'Each column of column percentages adds to 100%' },
  whole: { zh: '总数 ÷ 总数 = 1 = 100%', en: 'Grand total ÷ grand total = 1 = 100%' },
});

const CHOICE_LABELS = Object.freeze({
  row: { zh: '行百分比（**% of Row**）：除以行合计', en: '% of Row: divide by the row total' },
  column: { zh: '列百分比（**% of Column**）：除以列合计', en: '% of Column: divide by the column total' },
  total: { zh: '总百分比（**% of Overall Total**）：除以总数', en: '% of Overall Total: divide by the grand total' },
});

function cellHeading(model, role, row, column) {
  if (role === 'cell') {
    return {
      zh: `${zhText(model.rows[row])} × ${zhText(model.columns[column])}`,
      en: `${enText(model.rows[row])} × ${enText(model.columns[column])}`,
    };
  }
  if (role === 'row-total') return { zh: `${zhText(model.rows[row])}：行合计`, en: `${enText(model.rows[row])}: row total` };
  if (role === 'column-total') return { zh: `${zhText(model.columns[column])}：列合计`, en: `${enText(model.columns[column])}: column total` };
  return { zh: '总数', en: 'Grand total' };
}

function describeCount(model, table, row, column) {
  const a = rowCondition(model, row);
  const b = columnCondition(model, column);
  const count = table.counts[row][column];
  const rowPart = cellFraction(table, row, column, 'row');
  const columnPart = cellFraction(table, row, column, 'column');
  const jointPart = cellFraction(table, row, column, 'joint');
  return {
    summary: {
      zh: `同时是${a.zh}和${b.zh}的个体有 ${formatCount(count)} 个。`,
      en: `${formatCount(count)} ${casesWord(count)} have ${a.en} and ${b.en}.`,
    },
    lines: [
      { label: CHOICE_LABELS.row, formula: fractionFormula(rowPart, model), sentence: conditionalSentence(model, rowPart, a, b) },
      { label: CHOICE_LABELS.column, formula: fractionFormula(columnPart, model), sentence: conditionalSentence(model, columnPart, b, a) },
      { label: CHOICE_LABELS.total, formula: fractionFormula(jointPart, model), sentence: jointSentence(model, jointPart, row, column) },
    ],
    note: {
      zh: '同一个计数可以写成三种百分比（第 2 单元第 23 页）：分母不同，回答的就是不同的问题。',
      en: 'For any cell there are three choices of percentages (M2 p.23): each denominator answers a different question.',
    },
  };
}

function describeTotalCount(model, table, axis, index) {
  const byRow = axis === 'row';
  const target = byRow ? rowCondition(model, index) : columnCondition(model, index);
  const parts = byRow ? table.counts[index] : table.counts.map((line) => line[index]);
  const total = byRow ? table.rowTotals[index] : table.columnTotals[index];
  const marginal = marginalFraction(table, axis, index);
  const variable = byRow ? model.rowVariable : model.columnVariable;
  return {
    summary: null,
    lines: [
      {
        label: byRow ? { zh: '把这一行加起来', en: 'Add up the row' } : { zh: '把这一列加起来', en: 'Add up the column' },
        formula: sumFormula(parts, total),
        sentence: {
          zh: `一共有 ${formatCount(total)} 个个体是${target.zh}。`,
          en: `In total, ${formatCount(total)} ${casesWord(total)} have ${target.en}.`,
        },
      },
      {
        label: { zh: '边际比例（**marginal proportion**）', en: 'Marginal proportion' },
        formula: fractionFormula(marginal, model),
        sentence: marginalSentence(model, marginal, target),
      },
    ],
    note: byRow
      ? {
        zh: `最右一列的行合计就是「${zhText(variable)}」的边际分布（**marginal distribution**）：可以用计数表示，也可以除以总数写成比例。`,
        en: `The row totals (the right margin) are the marginal distribution of ${enText(variable)}, as counts or divided by the grand total.`,
      }
      : {
        zh: `最下一行的列合计就是「${zhText(variable)}」的边际分布（**marginal distribution**）：可以用计数表示，也可以除以总数写成比例。`,
        en: `The column totals (the bottom margin) are the marginal distribution of ${enText(variable)}, as counts or divided by the grand total.`,
      },
  };
}

function describeGrandCount(table) {
  const total = table.total;
  return {
    summary: {
      zh: `总数 n = ${formatCount(total)}：表里一共有 ${formatCount(total)} 个个体。把行合计相加、把列合计相加，结果一样。`,
      en: `The grand total is n = ${formatCount(total)}, the number of cases in the table. Adding the row totals or the column totals gives the same number.`,
    },
    lines: [
      { label: { zh: '把行合计加起来', en: 'Add the row totals' }, formula: sumFormula(table.rowTotals, total), sentence: null },
      { label: { zh: '把列合计加起来', en: 'Add the column totals' }, formula: sumFormula(table.columnTotals, total), sentence: null },
    ],
    note: null,
  };
}

function describeConditional(model, table, axis, row, column) {
  const byRow = axis === 'row';
  const part = cellFraction(table, row, column, byRow ? 'row' : 'column');
  const given = byRow ? rowCondition(model, row) : columnCondition(model, column);
  const target = byRow ? columnCondition(model, column) : rowCondition(model, row);
  const otherVariable = byRow ? model.columnVariable : model.rowVariable;
  const defined = part.denominator > 0;
  return {
    summary: null,
    lines: [{ label: null, formula: fractionFormula(part, model), sentence: conditionalSentence(model, part, given, target) }],
    note: defined
      ? {
        zh: `这一${byRow ? '行' : '列'}的格子都除以同一个合计 ${formatCount(part.denominator)}：它们合起来就是「${zhText(otherVariable)}」在${given.zh}中的条件分布（**conditional distribution**）。`,
        en: `Every cell of this ${axis} is divided by the same total, ${formatCount(part.denominator)}: together they form the conditional distribution of ${enText(otherVariable)} for ${given.en}.`,
      }
      : null,
  };
}

function describeSum(model, table, axis, index) {
  const byRow = axis === 'row';
  const given = byRow ? rowCondition(model, index) : columnCondition(model, index);
  const parts = byRow ? table.counts[index] : table.counts.map((line) => line[index]);
  const total = byRow ? table.rowTotals[index] : table.columnTotals[index];
  const otherVariable = byRow ? model.columnVariable : model.rowVariable;
  const terms = formatTerms(parts, { term: formatCount, maxTerms: TABLE_LIMITS.maxCategories });
  if (!(total > 0)) {
    return {
      summary: null,
      lines: [{
        label: null,
        formula: `${terms} = 0`,
        sentence: {
          zh: `没有任何个体是${given.zh}（合计为 0），所以这一${byRow ? '行' : '列'}算不出百分比。`,
          en: `No cases have ${given.en} (the total is 0), so this ${axis} has no percentages.`,
        },
      }],
      note: null,
    };
  }
  return {
    summary: null,
    lines: [{
      label: null,
      formula: `(${terms}) / ${formatCount(total)} = ${formatCount(total)} / ${formatCount(total)} = 1 = 100%`,
      sentence: {
        zh: `${given.zh}的 ${formatCount(total)} 个个体分布在「${zhText(otherVariable)}」的 ${parts.length} 个类别里，加起来正好是这 ${formatCount(total)} 个，所以这一${byRow ? '行' : '列'}的百分比加起来是 100%。`,
        en: `The ${formatCount(total)} ${casesWord(total)} with ${given.en} are split among the ${parts.length} ${enText(otherVariable)} categories, so the percentages of this ${axis} add to 100%.`,
      },
    }],
    note: roundingNote(parts, total, model),
  };
}

function describeMarginal(model, table, view, axis, index) {
  const byRow = axis === 'row';
  const part = marginalFraction(table, axis, index);
  const target = byRow ? rowCondition(model, index) : columnCondition(model, index);
  const variable = byRow ? model.rowVariable : model.columnVariable;
  const otherVariable = byRow ? model.columnVariable : model.rowVariable;
  const margin = byRow ? { zh: '最右一列', en: 'The right margin' } : { zh: '最下一行', en: 'The bottom margin' };
  const compare = view === (byRow ? 'column' : 'row');
  return {
    summary: null,
    lines: [{ label: null, formula: fractionFormula(part, model), sentence: marginalSentence(model, part, target) }],
    note: compare
      ? {
        zh: `${margin.zh}（合计）是「${zhText(variable)}」的边际分布：不分「${zhText(otherVariable)}」时的整体情况。拿每一${byRow ? '列' : '行'}的条件分布和它比较（第 2 单元第 35 页）。`,
        en: `${margin.en} (Total) is the marginal distribution of ${enText(variable)}, ignoring ${enText(otherVariable)}. Compare each ${byRow ? 'column' : 'row'}'s conditional distribution with it (M2 p.35).`,
      }
      : {
        zh: `${margin.zh}的比例是「${zhText(variable)}」的边际分布（**marginal distribution**），加起来是 100%。`,
        en: `${margin.en} is the marginal distribution of ${enText(variable)}; it adds to 100%.`,
      },
  };
}

function describeWhole(model, table, view) {
  const total = formatCount(table.total);
  const notes = {
    total: {
      zh: '所有格子的总百分比加起来是 100%，这就是联合分布（**joint distribution**）；最右一列、最下一行也各自加起来是 100%。',
      en: 'The % of Overall Total of all the cells add to 100% (the joint distribution), and so does each margin.',
    },
    row: {
      zh: `最下面的合计行是「${zhText(model.columnVariable)}」的边际分布，它和每一行一样，加起来是 100%。`,
      en: `The Total row is the marginal distribution of ${enText(model.columnVariable)}; like every row, it adds to 100%.`,
    },
    column: {
      zh: `最右边的合计列是「${zhText(model.rowVariable)}」的边际分布，它和每一列一样，加起来是 100%。`,
      en: `The Total column is the marginal distribution of ${enText(model.rowVariable)}; like every column, it adds to 100%.`,
    },
  };
  return {
    summary: null,
    lines: [{
      label: null,
      formula: `${total} / ${total} = 1 = 100%`,
      sentence: { zh: `表里全部 ${total} 个个体就是整体，占 100%。`, en: `All ${total} cases in the table are the whole: 100%.` },
    }],
    note: notes[view] ?? null,
  };
}

/**
 * Everything the explanation panel shows for a selected position in a view: { role, kind, heading, term,
 * summary, lines: [{ label, formula, sentence }], note, highlight, announce }. In the counts view a cell lists
 * its three choices of percentages (M2 p.23).
 * 说明面板对选中位置显示的全部内容。计数视图中，一个格子会列出它的三种百分比（第 2 单元第 23 页）。
 */
export function describeCell(model, table, view, row, column) {
  const role = cellRole(table, row, column);
  if (!role) return null;
  const kind = cellKind(view, role);
  let body;
  switch (kind) {
    case 'count': body = describeCount(model, table, row, column); break;
    case 'row-total-count': body = describeTotalCount(model, table, 'row', row); break;
    case 'column-total-count': body = describeTotalCount(model, table, 'column', column); break;
    case 'grand-total-count': body = describeGrandCount(table); break;
    case 'joint': {
      const part = cellFraction(table, row, column, 'joint');
      body = {
        summary: null,
        lines: [{ label: null, formula: fractionFormula(part, model), sentence: jointSentence(model, part, row, column) }],
        note: {
          zh: '分母是总数：所有格子的总百分比加起来是 100%，这就是联合分布（**joint distribution**）。',
          en: 'The denominator is the grand total: the % of Overall Total of all the cells add to 100% (the joint distribution).',
        },
      };
      break;
    }
    case 'row-conditional': body = describeConditional(model, table, 'row', row, column); break;
    case 'column-conditional': body = describeConditional(model, table, 'column', row, column); break;
    case 'row-sum': body = describeSum(model, table, 'row', row); break;
    case 'column-sum': body = describeSum(model, table, 'column', column); break;
    case 'marginal-row': body = describeMarginal(model, table, view, 'row', row); break;
    case 'marginal-column': body = describeMarginal(model, table, view, 'column', column); break;
    default: body = describeWhole(model, table, view);
  }
  const heading = cellHeading(model, role, row, column);
  const first = body.lines[0];
  const value = kind === 'count' ? formatCount(table.counts[row][column]) : first?.formula;
  return {
    role,
    kind,
    heading,
    term: TERMS[kind],
    ...body,
    highlight: cellHighlights(table, view, row, column),
    announce: `${plainLabel(heading)}: ${value}`,
  };
}

/* ---------- Views 视图说明 ---------- */

/** What the numbers of a view mean, with the R call that makes them. 每种视图中数字的含义，以及得到它们的 R 代码。 */
export function viewGuide(model, view) {
  const rowName = model.rowVariable;
  const columnName = model.columnVariable;
  if (view === 'total') {
    return {
      zh: '总百分比（**% of Overall Total**）：每个格子 ÷ 总数。所有格子加起来是 100%，这叫联合分布（**joint distribution**）；最右一列和最下一行（合计 ÷ 总数）是两个变量各自的边际分布（**marginal distribution**）。R：`prop.table(tab)`。',
      en: '% of Overall Total: each cell ÷ the grand total. All the cells add to 100% (the joint distribution); the margins (totals ÷ grand total) are the marginal distributions. R: `prop.table(tab)`.',
    };
  }
  if (view === 'row') {
    return {
      zh: `行百分比（**% of Row**）：每个格子 ÷ 它所在行的合计，所以每一行加起来是 100%。每一行就是「${zhText(columnName)}」在这一类「${zhText(rowName)}」里的条件分布（**conditional distribution**）；最下面的合计行是「${zhText(columnName)}」的边际分布，用来对比。R：\`prop.table(tab, 1)\`。`,
      en: `% of Row: each cell ÷ its row total, so each row adds to 100%. Each row is the conditional distribution of ${enText(columnName)} for one ${enText(rowName)} category; the Total row is the marginal distribution of ${enText(columnName)}, for comparison. R: \`prop.table(tab, 1)\`.`,
    };
  }
  if (view === 'column') {
    return {
      zh: `列百分比（**% of Column**）：每个格子 ÷ 它所在列的合计，所以每一列加起来是 100%。每一列就是「${zhText(rowName)}」在这一类「${zhText(columnName)}」里的条件分布（**conditional distribution**）；最右边的合计列是「${zhText(rowName)}」的边际分布，用来对比。R：\`prop.table(tab, 2)\`。`,
      en: `% of Column: each cell ÷ its column total, so each column adds to 100%. Each column is the conditional distribution of ${enText(rowName)} for one ${enText(columnName)} category; the Total column is the marginal distribution of ${enText(rowName)}, for comparison. R: \`prop.table(tab, 2)\`.`,
    };
  }
  return {
    zh: '计数（**count**）：每个格子是同时属于这一行和这一列的个体数。最右一列是行合计（**row total**），最下一行是列合计（**column total**），右下角是总数（**grand total**）n。',
    en: 'Counts: each cell is the number of cases in that row and that column. The right margin holds the row totals, the bottom margin the column totals, and the corner the grand total n.',
  };
}

/** "A 2 x 4 contingency table (read as "2-by-4")", M2 p.23. 表格的大小（第 2 单元第 23 页）。 */
export function tableShape(model) {
  const rows = model.rows.length;
  const columns = model.columns.length;
  return {
    zh: `这是 ${rows} × ${columns} 列联表（**contingency table**），读作 “${rows}-by-${columns}”：${rows} 行、${columns} 列，不算合计。`,
    en: `A ${rows} x ${columns} contingency table (read as "${rows}-by-${columns}"): ${rows} rows and ${columns} columns, not counting the totals.`,
  };
}

// Practice Q1B and midterm Q1: take percentages within each level of the explanatory variable.
// 练习题 Q1B 与期中第 1 题：在解释变量的每一类里算百分比。
export const CHOICE_TIP = Object.freeze({
  zh: '用行百分比还是列百分比？在解释变量（**explanatory variable**）的每一类里算百分比：解释变量在行上就用行百分比，在列上就用列百分比。要比较的那几组就是分母。',
  en: 'Row or column percentages? Take percentages within each level of the explanatory variable: row percentages when it is in the rows, column percentages when it is in the columns. The groups you compare give the denominators.',
});

/* ---------- Segmented bar chart 分段条形图 ---------- */

const MARGINAL_LABEL = Object.freeze({ zh: '合计（边际分布）', en: 'Total (marginal)' });

function segmentOf(model, index, count, total) {
  const value = total > 0 ? count / total : NaN;
  const defined = isFiniteNumber(value);
  return {
    index,
    count,
    value,
    width: defined ? value * 100 : 0,
    label: defined ? `${formatFixed(value * 100, 0)}%` : '',
    percent: shareText(value, model).percent,
  };
}

/**
 * Data of the segmented (100% stacked) bar chart for the row or column view, or null for the other views.
 * One bar per group (a row in the row view, a column in the column view) plus a last bar for the marginal
 * distribution; each segment is one category with its conditional proportion, `width` in percent and a
 * whole-percent `label`. `description` is the chart's text alternative.
 * 行视图或列视图的分段（100% 堆叠）条形图数据；其他视图返回 null。每组一根条（行视图中是一行，列视图中是一列），
 * 最后一根是边际分布；每段是一个类别及其条件比例，width 为百分数，label 为取整的百分数。description 是图的文字替代。
 */
export function conditionalBars(model, table, view) {
  if (view !== 'row' && view !== 'column') return null;
  const byRow = view === 'row';
  const groupVariable = byRow ? model.rowVariable : model.columnVariable;
  const categoryVariable = byRow ? model.columnVariable : model.rowVariable;
  const groupLabels = byRow ? model.rows : model.columns;
  const categories = byRow ? model.columns : model.rows;
  const groupTotals = byRow ? table.rowTotals : table.columnTotals;
  const marginalTotals = byRow ? table.columnTotals : table.rowTotals;
  const countAt = (group, category) => (byRow ? table.counts[group][category] : table.counts[category][group]);
  const bar = (key, label, total, counts, marginal) => ({
    key,
    label,
    total,
    totalText: formatCount(total),
    marginal,
    empty: !(total > 0),
    segments: counts.map((count, index) => segmentOf(model, index, count, total)),
  });
  const bars = groupLabels.map((label, group) => bar(`group-${group}`, label, groupTotals[group],
    categories.map((_, category) => countAt(group, category)), false));
  bars.push(bar('marginal', { ...MARGINAL_LABEL }, table.total, marginalTotals, true));
  const title = {
    zh: `分段条形图：每一类「${zhText(groupVariable)}」中「${zhText(categoryVariable)}」的条件分布`,
    en: `Segmented bar chart: the conditional distribution of ${enText(categoryVariable)} within each ${enText(groupVariable)} category`,
  };
  const barTexts = bars.map((item) => `${plainLabel(item.label)}, n = ${item.totalText}: ${item.empty
    ? '没有个体 no cases'
    : item.segments.map((segment) => `${plainLabel(categories[segment.index])} ${segment.percent}`).join(', ')}`);
  return {
    view,
    groupVariable,
    categoryVariable,
    categories,
    bars,
    title,
    description: `${title.zh}。${title.en}. ${barTexts.join('; ')}.`,
  };
}

/* ---------- Association 关联 ---------- */

// Exact comparison of a/b and c/d for whole counts; other numbers fall back to a tight tolerance.
// 用交叉相乘精确比较 a/b 与 c/d（计数都是整数）；其他数字退回到很小的容差比较。
function sameShare(a, b, c, d) {
  if ([a, b, c, d].every(Number.isSafeInteger)) return BigInt(a) * BigInt(d) === BigInt(c) * BigInt(b);
  const left = a / b;
  const right = c / d;
  return Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));
}

// M2 p.34 and p.40, practice Q1E and Q3E: compare conditional distributions, never raw counts.
// 第 2 单元第 34、40 页，练习题 Q1E、Q3E：比较条件分布，不要比较计数。
export const ASSOCIATION_RULE = Object.freeze({
  zh: '怎么判断：各组的条件分布差不多相同 → 没有关联（**no association**，两个变量相互独立 **independent**）；明显不同 → 有关联（**associated**，也说 **dependent**）。差别越大，关联越强：相差 50 个百分点就很大（第 2 单元第 40 页）。各组人数不一样，所以要比较百分比，不能比较计数。',
  en: 'Nearly the same conditional distributions in every group mean no association (the variables are independent); clearly different ones mean the variables are associated (dependent). The larger the difference, the stronger the association; 50 percentage points is a substantial difference (M2 p.40). Compare percentages, not counts.',
});

/**
 * Whether the conditional distributions of the row or column view differ: { status: "insufficient" |
 * "identical" | "different", sentence, rule, ... }. For "different" it names the category whose percentage
 * varies most between the groups, with its lowest and highest group and the gap in percentage points. Groups
 * without cases are left out. Null for the counts and total views.
 * 行视图或列视图中各组条件分布是否不同。“different”时指出各组之间百分比相差最大的类别、最低和最高的组，
 * 以及相差多少个百分点。没有个体的组不参加比较。计数视图和总百分比视图返回 null。
 */
export function associationSummary(model, table, view) {
  if (view !== 'row' && view !== 'column') return null;
  const byRow = view === 'row';
  const groupLabels = byRow ? model.rows : model.columns;
  const categories = byRow ? model.columns : model.rows;
  const groupVariable = byRow ? model.rowVariable : model.columnVariable;
  const categoryVariable = byRow ? model.columnVariable : model.rowVariable;
  const totals = byRow ? table.rowTotals : table.columnTotals;
  const countAt = (group, category) => (byRow ? table.counts[group][category] : table.counts[category][group]);
  const groups = groupLabels.map((_, index) => index).filter((index) => totals[index] > 0);
  if (groups.length < 2) {
    return {
      status: 'insufficient',
      sentence: {
        zh: '至少要有两组有个体，才能比较条件分布。',
        en: 'At least two groups with cases are needed to compare conditional distributions.',
      },
      rule: ASSOCIATION_RULE,
    };
  }
  const base = groups[0];
  const identical = groups.every((group) => categories.every((_, category) => sameShare(
    countAt(group, category), totals[group], countAt(base, category), totals[base])));
  if (identical) {
    return {
      status: 'identical',
      sentence: {
        zh: `每一组的条件分布完全一样（也都等于边际分布），所以「${zhText(groupVariable)}」和「${zhText(categoryVariable)}」之间没有关联：两个变量相互独立。`,
        en: `Every group has exactly the same conditional distribution (equal to the marginal distribution), so there is no association between ${enText(groupVariable)} and ${enText(categoryVariable)}: the variables are independent.`,
      },
      rule: ASSOCIATION_RULE,
    };
  }
  let best = null;
  categories.forEach((_, category) => {
    let high = null;
    let low = null;
    for (const group of groups) {
      const value = countAt(group, category) / totals[group];
      if (!high || value > high.value) high = { group, value };
      if (!low || value < low.value) low = { group, value };
    }
    const gap = high.value - low.value;
    // Equal gaps (always the case for two categories) keep the first category; the slack absorbs binary noise.
    // 差距相同时（两个类别时总是如此）保留第一个类别；容差用来吸收二进制误差。
    if (!best || gap > best.gap + 1e-12) best = { category, high, low, gap };
  });
  const target = condition(categoryVariable, categories[best.category]);
  const highGroup = condition(groupVariable, groupLabels[best.high.group]);
  const lowGroup = condition(groupVariable, groupLabels[best.low.group]);
  const highText = shareText(best.high.value, model).percent;
  const lowText = shareText(best.low.value, model).percent;
  const points = best.gap * 100;
  const about = relationSign(points, model.percentDigits) !== '=';
  const pointsText = formatFixed(points, model.percentDigits);
  return {
    status: 'different',
    category: best.category,
    high: best.high,
    low: best.low,
    gap: best.gap,
    pointsText,
    sentence: {
      zh: `各组的条件分布并不完全相同：${target.zh}的百分比最低是 ${lowText}（${lowGroup.zh}），最高是 ${highText}（${highGroup.zh}），相差${about ? '约 ' : ' '}${pointsText} 个百分点（**percentage points**）。`,
      en: `The conditional distributions are not all the same: the percentage with ${target.en} ranges from ${lowText} (${lowGroup.en}) to ${highText} (${highGroup.en}), a difference of ${about ? 'about ' : ''}${pointsText} percentage points.`,
    },
    rule: ASSOCIATION_RULE,
  };
}

/* ---------- Difference and ratio of two proportions 两个比例的差与比 ---------- */

/**
 * The course's words for a ratio of proportions, read from the ratio rounded to 2 decimals (M2 p.42-44):
 * { kind: "times" (2 or more), "higher" (between 1 and 2), "lower" (below 1), "same" (1.00) or "undefined",
 *   rounded, amount } where `amount` is the ratio for "times" and the whole percent for "higher" / "lower".
 * 按课程的说法解读比例之比（先取 2 位小数，第 2 单元第 42-44 页）：不小于 2 说“几倍”，1 和 2 之间说“高百分之几”，
 * 小于 1 说“低百分之几”，等于 1.00 说“差不多一样”；无法计算时为 undefined。
 */
export function ratioWording(ratio) {
  if (!isFiniteNumber(ratio) || ratio < 0) return { kind: 'undefined', rounded: NaN, amount: NaN };
  const rounded = roundTo(ratio, RATIO_DIGITS);
  if (rounded === 1) return { kind: 'same', rounded, amount: 0 };
  if (rounded >= 2) return { kind: 'times', rounded, amount: rounded };
  if (rounded > 1) return { kind: 'higher', rounded, amount: roundTo((rounded - 1) * 100, 0) };
  return { kind: 'lower', rounded, amount: roundTo((1 - rounded) * 100, 0) };
}

/**
 * The groups and categories of the row or column view that can be compared: { groupVariable,
 * categoryVariable, groups: [{ index, label, total }] (groups with cases only), categories: [{ index, label }] },
 * or null for the other views.
 * 行视图或列视图中可以比较的组（只含有个体的组）和类别；其他视图返回 null。
 */
export function comparisonChoices(model, table, view) {
  if (view !== 'row' && view !== 'column') return null;
  const byRow = view === 'row';
  const labels = byRow ? model.rows : model.columns;
  const totals = byRow ? table.rowTotals : table.columnTotals;
  return {
    groupVariable: byRow ? model.rowVariable : model.columnVariable,
    categoryVariable: byRow ? model.columnVariable : model.rowVariable,
    groups: labels.map((label, index) => ({ index, label, total: totals[index] })).filter((group) => group.total > 0),
    categories: (byRow ? model.columns : model.rows).map((label, index) => ({ index, label })),
  };
}

/** First comparison shown: the first two groups with cases and the first category. 默认比较：前两个有个体的组与第一个类别。 */
export function defaultComparison(choices) {
  if (!choices || choices.groups.length < 2) return null;
  return { first: choices.groups[0].index, second: choices.groups[1].index, category: 0 };
}

const DIFFERENCE_TERM = Object.freeze({ zh: '比例之差（**difference of proportions**）', en: 'Difference of proportions' });
const RATIO_TERM = Object.freeze({
  zh: '比例之比（**ratio of proportions**，也叫相对风险 **relative risk**）',
  en: 'Ratio of proportions (relative risk, risk ratio)',
});

function differenceSentence(model, difference, a, b, k) {
  const points = difference * 100;
  const pointsText = formatFixed(Math.abs(points), model.percentDigits);
  const about = relationSign(points, model.percentDigits) !== '=';
  if (roundTo(points, model.percentDigits) === 0) {
    return {
      zh: `两组中${k.zh}的百分比几乎一样（相差约 0 个百分点），这正是“没有关联”时的样子。`,
      en: 'The two percentages are about the same (a difference of about 0 percentage points), which is what no association looks like.',
    };
  }
  const higher = points > 0;
  return {
    zh: `${k.zh}的百分比，${a.zh}比${b.zh}${higher ? '高' : '低'}${about ? '约 ' : ' '}${pointsText} 个百分点（**percentage points**）。要说“百分点”，不能说“${higher ? '高' : '低'} ${pointsText}%”（第 2 单元第 37 页）。`,
    en: `The percentage with ${k.en} is ${about ? 'about ' : ''}${pointsText} percentage points ${higher ? 'higher' : 'lower'} among cases with ${a.en} than among cases with ${b.en}. Say "percentage points", not "${pointsText}% ${higher ? 'higher' : 'lower'}" (M2 p.37).`,
  };
}

function ratioSentence(wording, a, b, k) {
  const r = formatFixed(wording.rounded, RATIO_DIGITS);
  switch (wording.kind) {
    case 'times': return {
      zh: `比值 ${r} 不小于 2，习惯说“几倍”：${k.zh}的比例，在${a.zh}中是在${b.zh}中的 ${r} 倍。英文写 “${r} times as large”，也可以说 “${r} times more likely”。`,
      en: `The ratio ${r} is at least 2, so we use "times": the proportion with ${k.en} is ${r} times as large among cases with ${a.en} as among cases with ${b.en} (${r} times more likely).`,
    };
    case 'higher': return {
      zh: `比值 ${r} 在 1 和 2 之间，习惯说“高百分之几”：(${r} − 1) × 100% = ${wording.amount}%。${k.zh}的比例，在${a.zh}中比在${b.zh}中高 ${wording.amount}%。`,
      en: `The ratio ${r} is between 1 and 2, so we speak of a percent increase: (${r} − 1) × 100% = ${wording.amount}%. The proportion with ${k.en} is ${wording.amount}% higher among cases with ${a.en} than among cases with ${b.en}.`,
    };
    case 'lower': return {
      zh: `比值 ${r} 小于 1，习惯说“低百分之几”：(1 − ${r}) × 100% = ${wording.amount}%。${k.zh}的比例，在${a.zh}中比在${b.zh}中低 ${wording.amount}%。`,
      en: `The ratio ${r} is below 1, so we speak of a percent decrease: (1 − ${r}) × 100% = ${wording.amount}%. The proportion with ${k.en} is ${wording.amount}% lower among cases with ${a.en} than among cases with ${b.en}.`,
    };
    case 'same': return {
      zh: `比值约等于 1：两组中${k.zh}的比例差不多，这正是“没有关联”时的样子。`,
      en: 'The ratio is about 1: the two proportions are about the same, which is what no association looks like.',
    };
    default: return {
      zh: `${b.zh}中没有任何个体是${k.zh}（p₂ = 0），不能除以 0，所以比值无法计算。`,
      en: `No cases with ${b.en} have ${k.en} (p₂ = 0). We cannot divide by 0, so the ratio is undefined.`,
    };
  }
}

/**
 * Compares one category between two groups of the row or column view (M2 p.36-45, midterm Q6):
 * p₁ and p₂ (conditional proportions), the difference p₁ − p₂ in percentage points and the ratio p₁ / p₂
 * with the course's wording. Bad selections fall back to valid ones. Returns null when fewer than two
 * groups have cases; { sameGroup: true } when both choices name the same group.
 * 在行视图或列视图中，比较两组的同一个类别（第 2 单元第 36-45 页，期中第 6 题）：两个条件比例 p₁、p₂，
 * 差 p₁ − p₂（百分点）和比 p₁ / p₂（课程的说法）。无效的选择会换成有效的；少于两组有个体时返回 null；两边选了同一组时
 * 返回 { sameGroup: true }。
 */
export function compareGroups(model, table, view, selection = {}) {
  const choices = comparisonChoices(model, table, view);
  if (!choices || choices.groups.length < 2) return null;
  const isGroup = (index) => choices.groups.some((group) => group.index === index);
  const first = isGroup(selection?.first) ? selection.first : choices.groups[0].index;
  const second = isGroup(selection?.second) ? selection.second : choices.groups.find((group) => group.index !== first).index;
  const category = Number.isInteger(selection?.category) && selection.category >= 0 && selection.category < choices.categories.length
    ? selection.category
    : 0;
  const byRow = view === 'row';
  const a = condition(choices.groupVariable, choices.groups.find((group) => group.index === first).label);
  const b = condition(choices.groupVariable, choices.groups.find((group) => group.index === second).label);
  const k = condition(choices.categoryVariable, choices.categories[category].label);
  const base = { first, second, category, groupA: a, groupB: b, target: k, differenceTerm: DIFFERENCE_TERM, ratioTerm: RATIO_TERM };
  if (first === second) {
    return {
      ...base,
      sameGroup: true,
      message: { zh: '请选两个不同的组来比较。', en: 'Choose two different groups to compare.' },
    };
  }
  const fractionOf = (group) => (byRow ? cellFraction(table, group, category, 'row') : cellFraction(table, category, group, 'column'));
  const p1 = fractionOf(first);
  const p2 = fractionOf(second);
  const s1 = shareText(p1.value, model);
  const s2 = shareText(p2.value, model);
  const inputsSign = s1.about || s2.about ? '≈' : '=';
  const difference = p1.value - p2.value;
  const ratio = p2.value > 0 ? p1.value / p2.value : NaN;
  const wording = ratioWording(ratio);
  const ratioText = formatFixed(wording.rounded, RATIO_DIGITS);
  const rounded1 = roundTo(p1.value, model.decimals);
  const rounded2 = roundTo(p2.value, model.decimals);
  const roundedRatio = rounded2 > 0 ? rounded1 / rounded2 : NaN;
  const roundingShifts = wording.kind !== 'undefined' && isFiniteNumber(roundedRatio)
    && formatFixed(roundedRatio, RATIO_DIGITS) !== ratioText;
  return {
    ...base,
    sameGroup: false,
    p1: {
      fraction: p1,
      label: { zh: `p₁：${a.zh}中${k.zh}的比例`, en: `p₁: proportion with ${k.en} among cases with ${a.en}` },
      formula: `p₁ = ${fractionFormula(p1, model)}`,
    },
    p2: {
      fraction: p2,
      label: { zh: `p₂：${b.zh}中${k.zh}的比例`, en: `p₂: proportion with ${k.en} among cases with ${b.en}` },
      formula: `p₂ = ${fractionFormula(p2, model)}`,
    },
    difference: {
      value: difference,
      points: difference * 100,
      formula: `p₁ − p₂ ${inputsSign} ${s1.proportion} − ${s2.proportion} ${relationSign(difference, model.decimals)} ${formatFixed(difference, model.decimals)}`,
      sentence: differenceSentence(model, difference, a, b, k),
    },
    ratio: {
      value: ratio,
      wording,
      text: ratioText,
      formula: wording.kind === 'undefined'
        ? `p₁ / p₂ = ${s1.proportion} / ${s2.proportion}`
        : `p₁ / p₂ ${inputsSign} ${s1.proportion} / ${s2.proportion} ${relationSign(ratio, RATIO_DIGITS)} ${ratioText}`,
      sentence: ratioSentence(wording, a, b, k),
      tip: wording.kind === 'lower'
        ? {
          zh: '把较大的比例放在分子上更好解释（第 2 单元第 44 页）：按“交换”试试。',
          en: 'It is easier to interpret with the larger proportion on top (M2 p.44): press Swap.',
        }
        : null,
      roundingNote: roundingShifts
        ? {
          zh: `注意：如果先把两个比例四舍五入成 ${s1.proportion} 和 ${s2.proportion} 再相除，会得到 ${formatFixed(roundedRatio, RATIO_DIGITS)}，而不是 ${ratioText}。要用没有四舍五入的比例算到最后。`,
          en: `Careful: rounding the proportions to ${s1.proportion} and ${s2.proportion} first gives ${formatFixed(roundedRatio, RATIO_DIGITS)} instead of ${ratioText}. Keep the unrounded proportions until the end.`,
        }
        : null,
    },
    announce: `p₁ ${s1.sign} ${s1.proportion}, p₂ ${s2.sign} ${s2.proportion}; 差 difference ${formatFixed(difference * 100, model.percentDigits)} percentage points; 比 ratio ${wording.kind === 'undefined' ? '—' : ratioText}`,
  };
}

/* ---------- Practice 练习 ---------- */

export const QUESTION_KINDS = Object.freeze(['row-conditional', 'column-conditional', 'joint', 'marginal-row', 'marginal-column']);

// Conditional proportions come up most on the test (midterm Q4, Q5), then joint (Q2) and marginal (Q3) ones.
// 考试里最常考条件比例（期中第 4、5 题），其次是联合比例（第 2 题）和边际比例（第 3 题）。
const KIND_WEIGHTS = Object.freeze({
  'row-conditional': 3, 'column-conditional': 3, joint: 2, 'marginal-row': 1, 'marginal-column': 1,
});
export const PRACTICE_LIMITS = Object.freeze({ minOptions: 3, maxOptions: 5 });

const HINTS = Object.freeze({
  conditional: {
    zh: '“Among …” 后面的那一组就是分母：分母 = 这一组的合计。',
    en: 'The group after "Among" is the denominator: divide by that group\'s total.',
  },
  joint: {
    zh: '“… and …” 是两个条件同时成立的那一个格子，分母是总数。',
    en: '"... and ..." is the one cell where both conditions hold; divide by the grand total.',
  },
  marginal: {
    zh: '只问一个变量、没有 “Among”：用这一类的合计 ÷ 总数。',
    en: 'One variable and no "Among": that category\'s total ÷ the grand total.',
  },
});

function choice(mistake, numerator, denominator, numeratorCells, denominatorCell, feedback = null) {
  return {
    mistake,
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : NaN,
    numeratorCells,
    denominatorCell,
    feedback,
  };
}

function conditionalChoices(model, table, kind, row, column) {
  const byRow = kind === 'row-conditional';
  const { counts, rowTotals, columnTotals, total } = table;
  const lastRow = table.rowCount;
  const lastColumn = table.columnCount;
  const cell = (r, c) => ({ row: r, column: c });
  const grand = cell(lastRow, lastColumn);
  const groupTotal = byRow ? rowTotals[row] : columnTotals[column];
  const groupTotalCell = byRow ? cell(row, lastColumn) : cell(lastRow, column);
  const targetTotal = byRow ? columnTotals[column] : rowTotals[row];
  const targetTotalCell = byRow ? cell(lastRow, column) : cell(row, lastColumn);
  const otherRow = byRow ? (row + 1) % lastRow : row;
  const otherColumn = byRow ? column : (column + 1) % lastColumn;
  const otherGroupTotal = byRow ? rowTotals[otherRow] : columnTotals[otherColumn];
  const otherGroupTotalCell = byRow ? cell(otherRow, lastColumn) : cell(lastRow, otherColumn);
  const count = counts[row][column];
  const group = byRow ? rowCondition(model, row) : columnCondition(model, column);
  const target = byRow ? columnCondition(model, column) : rowCondition(model, row);
  const other = byRow ? rowCondition(model, otherRow) : columnCondition(model, otherColumn);
  const rest = byRow
    ? counts[row].map((_, c) => cell(row, c)).filter((address) => address.column !== column)
    : counts.map((_, r) => cell(r, column)).filter((address) => address.row !== row);
  const N = formatCount(total);
  return {
    correct: choice(null, count, groupTotal, [cell(row, column)], groupTotalCell),
    core: [
      choice('grand-total', count, total, [cell(row, column)], grand, {
        zh: `你除以了总数 ${N}，得到的是联合比例（**joint proportion**）：在全部个体中占多少。题目说 “Among …”，只看${group.zh}这一组，分母应该是这一组的合计。`,
        en: `You divided by the grand total ${N}, which gives a joint proportion (a share of all cases). The question says "Among ...", so only the cases with ${group.en} count: divide by their total.`,
      }),
      choice('reversed', count, targetTotal, [cell(row, column)], targetTotalCell, {
        zh: `你除以了${target.zh}的合计 ${formatCount(targetTotal)}，条件弄反了：这算的是在${target.zh}中${group.zh}占多少。“Among” 后面的那一组才是分母。`,
        en: `You divided by the total of ${target.en} (${formatCount(targetTotal)}), which reverses the condition: it is the proportion with ${group.en} among cases with ${target.en}. The group after "Among" gives the denominator.`,
      }),
      choice('ignored-condition', targetTotal, total, [targetTotalCell], grand, {
        zh: `这是在全部个体中${target.zh}的比例（边际比例 **marginal proportion**），忽略了题目的条件${group.zh}。`,
        en: `This is the proportion with ${target.en} among all cases (a marginal proportion); it ignores the condition ${group.en}.`,
      }),
    ],
    extra: [
      choice('complement', groupTotal - count, groupTotal, rest, groupTotalCell, {
        zh: `这是在${group.zh}中**不是**${target.zh}的比例（补集），等于 1 减去正确答案。`,
        en: `This is the proportion of cases with ${group.en} that do NOT have ${target.en} (the complement, 1 minus the answer).`,
      }),
      choice('other-group', counts[otherRow][otherColumn], otherGroupTotal, [cell(otherRow, otherColumn)], otherGroupTotalCell, {
        zh: `这是在${other.zh}中的比例，不是在${group.zh}中的比例。看清题目问的是哪一组。`,
        en: `This is the proportion among cases with ${other.en}, not among cases with ${group.en}. Check which group the question names.`,
      }),
      choice('cell-over-cell', count, counts[otherRow][otherColumn], [cell(row, column)], cell(otherRow, otherColumn), cellOverCell(count, counts[otherRow][otherColumn])),
    ],
  };
}

function cellOverCell(numerator, denominator) {
  return {
    zh: `你用一个格子除以了另一个格子（${formatCount(numerator)} / ${formatCount(denominator)}）。比例的分母必须是一整组的合计：行合计、列合计或总数。`,
    en: `You divided one cell by another cell (${formatCount(numerator)} / ${formatCount(denominator)}). The denominator of a proportion must be the total of a whole group: a row total, a column total or the grand total.`,
  };
}

function jointChoices(model, table, row, column) {
  const { counts, rowTotals, columnTotals, total } = table;
  const lastRow = table.rowCount;
  const lastColumn = table.columnCount;
  const cell = (r, c) => ({ row: r, column: c });
  const grand = cell(lastRow, lastColumn);
  const count = counts[row][column];
  const a = rowCondition(model, row);
  const b = columnCondition(model, column);
  const N = formatCount(total);
  return {
    correct: choice(null, count, total, [cell(row, column)], grand),
    core: [
      choice('row-denominator', count, rowTotals[row], [cell(row, column)], cell(row, lastColumn), {
        zh: `你除以了行合计 ${formatCount(rowTotals[row])}，这是只在${a.zh}中的条件比例（行百分比）。题目问的是全部个体，分母是总数 ${N}。`,
        en: `You divided by the row total ${formatCount(rowTotals[row])}, which gives a conditional proportion (% of Row) among cases with ${a.en} only. The question is about all cases, so divide by the grand total ${N}.`,
      }),
      choice('column-denominator', count, columnTotals[column], [cell(row, column)], cell(lastRow, column), {
        zh: `你除以了列合计 ${formatCount(columnTotals[column])}，这是只在${b.zh}中的条件比例（列百分比）。题目问的是全部个体，分母是总数 ${N}。`,
        en: `You divided by the column total ${formatCount(columnTotals[column])}, which gives a conditional proportion (% of Column) among cases with ${b.en} only. The question is about all cases, so divide by the grand total ${N}.`,
      }),
      choice('whole-row', rowTotals[row], total, [cell(row, lastColumn)], grand, {
        zh: `你用了整行的合计 ${formatCount(rowTotals[row])}：它包括所有${a.zh}的个体，不管它们是不是${b.zh}。“and” 指两个条件同时成立的那一个格子。`,
        en: `You used the whole row total ${formatCount(rowTotals[row])}: it counts every case with ${a.en}, whatever its ${enText(model.columnVariable)}. "And" means the one cell where both conditions hold.`,
      }),
    ],
    extra: [
      choice('whole-column', columnTotals[column], total, [cell(lastRow, column)], grand, {
        zh: `你用了整列的合计 ${formatCount(columnTotals[column])}：它包括所有${b.zh}的个体，不管它们是不是${a.zh}。“and” 指两个条件同时成立的那一个格子。`,
        en: `You used the whole column total ${formatCount(columnTotals[column])}: it counts every case with ${b.en}, whatever its ${enText(model.rowVariable)}. "And" means the one cell where both conditions hold.`,
      }),
      choice('added-totals', rowTotals[row] + columnTotals[column], total, [cell(row, lastColumn), cell(lastRow, column)], grand, {
        zh: `你把行合计和列合计加了起来：两个条件都满足的 ${formatCount(count)} 个个体被算了两次，只满足一个条件的个体也被算了进去。“and” 只看两个条件同时成立的那一个格子。`,
        en: `You added the row total and the column total. That counts the ${formatCount(count)} cases with both conditions twice and also counts cases with only one of them. "And" means the one cell where both hold.`,
      }),
    ],
  };
}

function marginalChoices(model, table, kind, row, column) {
  const byRow = kind === 'marginal-row';
  const { counts, rowTotals, columnTotals, total } = table;
  const lastRow = table.rowCount;
  const lastColumn = table.columnCount;
  const cell = (r, c) => ({ row: r, column: c });
  const grand = cell(lastRow, lastColumn);
  const count = counts[row][column];
  const targetTotal = byRow ? rowTotals[row] : columnTotals[column];
  const targetTotalCell = byRow ? cell(row, lastColumn) : cell(lastRow, column);
  const extraTotal = byRow ? columnTotals[column] : rowTotals[row];
  const extraTotalCell = byRow ? cell(lastRow, column) : cell(row, lastColumn);
  const otherIndex = byRow ? (row + 1) % lastRow : (column + 1) % lastColumn;
  const otherTotal = byRow ? rowTotals[otherIndex] : columnTotals[otherIndex];
  const otherTotalCell = byRow ? cell(otherIndex, lastColumn) : cell(lastRow, otherIndex);
  // The cell next to this one inside the same column (or row), like the midterm Q3 distractor 30 / 88.
  // 同一列（或同一行）里相邻的另一个格子，类似期中第 3 题的干扰项 30 / 88。
  const neighbour = byRow ? cell(row, (column + 1) % lastColumn) : cell((row + 1) % lastRow, column);
  const target = byRow ? rowCondition(model, row) : columnCondition(model, column);
  const extra = byRow ? columnCondition(model, column) : rowCondition(model, row);
  const other = byRow ? rowCondition(model, otherIndex) : columnCondition(model, otherIndex);
  const N = formatCount(total);
  const neighbourCount = counts[neighbour.row][neighbour.column];
  return {
    correct: choice(null, targetTotal, total, [targetTotalCell], grand),
    core: [
      choice('one-cell', count, total, [cell(row, column)], grand, {
        zh: `你只用了一个格子 ${formatCount(count)}：它只数同时也是${extra.zh}的个体。边际比例要用${target.zh}的整个合计。`,
        en: `You used a single cell (${formatCount(count)}): it only counts the cases that also have ${extra.en}. A marginal proportion uses the whole total of ${target.en}.`,
      }),
      choice('conditional', count, extraTotal, [cell(row, column)], extraTotalCell, {
        zh: `你除以了${extra.zh}的合计 ${formatCount(extraTotal)}，这是只在${extra.zh}中的条件比例。题目问的是全部个体，分母是总数 ${N}。`,
        en: `You divided by the total of ${extra.en} (${formatCount(extraTotal)}), which gives a conditional proportion among cases with ${extra.en} only. The question is about all cases, so divide by the grand total ${N}.`,
      }),
      choice('other-category', otherTotal, total, [otherTotalCell], grand, {
        zh: `这是${other.zh}的比例，是另一个类别。`,
        en: `This is the proportion with ${other.en}, a different category.`,
      }),
    ],
    extra: [
      choice('cell-over-cell', count, neighbourCount, [cell(row, column)], neighbour, cellOverCell(count, neighbourCount)),
    ],
  };
}

function choicesFor(model, table, kind, row, column) {
  if (kind === 'joint') return jointChoices(model, table, row, column);
  if (kind === 'marginal-row' || kind === 'marginal-column') return marginalChoices(model, table, kind, row, column);
  return conditionalChoices(model, table, kind, row, column);
}

// Keeps choices that are real proportions (0 < value ≤ 1) and print differently at the widget's decimals, so
// no two options show the same number; the correct choice comes first and is never dropped.
// 只保留真正的比例（0 < 值 ≤ 1），并且在组件的小数位数下打印出来互不相同，这样任意两个选项显示的数都不一样；
// 正确选项排在最前，永远不会被去掉。
function distinctChoices(list, decimals) {
  const kept = [];
  const printed = new Set();
  for (const item of list) {
    if (!(item.value > 0 && item.value <= 1)) continue;
    const text = formatFixed(item.value, decimals);
    if (printed.has(text)) continue;
    printed.add(text);
    kept.push(item);
  }
  return kept;
}

// The same printed question has the same key: a marginal question names one category only, so its variants
// (which differ only in the cell their distractors use) share a key.
// 打印出来相同的题目 key 也相同：边际比例题只提到一个类别，它的几个变体（只是干扰项用的格子不同）共用一个 key。
function questionKey(kind, row, column) {
  if (kind === 'marginal-row') return `${kind}:${row}`;
  if (kind === 'marginal-column') return `${kind}:${column}`;
  return `${kind}:${row}:${column}`;
}

/**
 * Every practice question this table supports: [{ kind, row, column, key }]. A question needs an answer
 * strictly between 0 and 1 and at least three options that print differently. Marginal questions also carry a
 * cell, which picks the cell their distractors use.
 * 这张表能出的所有练习题。一道题的答案必须在 0 和 1 之间（不含两端），而且至少有三个打印出来互不相同的选项。
 * 边际比例题也带一个格子，用来决定干扰项用哪个格子。
 */
export function practiceCandidates(model, table) {
  const list = [];
  for (const kind of QUESTION_KINDS) {
    for (let row = 0; row < table.rowCount; row += 1) {
      for (let column = 0; column < table.columnCount; column += 1) {
        const set = choicesFor(model, table, kind, row, column);
        if (!(set.correct.value > 0 && set.correct.value < 1)) continue;
        const options = distinctChoices([set.correct, ...set.core, ...set.extra], model.decimals);
        if (options.length < PRACTICE_LIMITS.minOptions) continue;
        list.push({ kind, row, column, key: questionKey(kind, row, column) });
      }
    }
  }
  return list;
}

function pick(list, random) {
  const roll = Number(random());
  const safe = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1 - Number.EPSILON) : 0;
  return list[Math.floor(safe * list.length)];
}

function weightedKind(kinds, random) {
  const total = kinds.reduce((sum, kind) => sum + KIND_WEIGHTS[kind], 0);
  const roll = Number(random());
  let remaining = (Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1 - Number.EPSILON) : 0) * total;
  for (const kind of kinds) {
    remaining -= KIND_WEIGHTS[kind];
    if (remaining < 0) return kind;
  }
  return kinds[kinds.length - 1];
}

function questionPrompt(model, kind, row, column) {
  const a = rowCondition(model, row);
  const b = columnCondition(model, column);
  if (kind === 'row-conditional') {
    return { en: `Among the cases with ${a.en}, what is the proportion with ${b.en}?`, zh: `在${a.zh}的个体中，${b.zh}的比例是多少？` };
  }
  if (kind === 'column-conditional') {
    return { en: `Among the cases with ${b.en}, what is the proportion with ${a.en}?`, zh: `在${b.zh}的个体中，${a.zh}的比例是多少？` };
  }
  if (kind === 'joint') {
    return { en: `What is the proportion of all cases with ${a.en} and ${b.en}?`, zh: `在全部个体中，同时是${a.zh}和${b.zh}的比例是多少？` };
  }
  const target = kind === 'marginal-row' ? a : b;
  return { en: `What is the proportion of all cases with ${target.en}?`, zh: `在全部个体中，${target.zh}的比例是多少？` };
}

function questionSolution(model, kind, row, column, part) {
  if (kind === 'row-conditional') return conditionalSentence(model, part, rowCondition(model, row), columnCondition(model, column));
  if (kind === 'column-conditional') return conditionalSentence(model, part, columnCondition(model, column), rowCondition(model, row));
  if (kind === 'joint') return jointSentence(model, part, row, column);
  return marginalSentence(model, part, kind === 'marginal-row' ? rowCondition(model, row) : columnCondition(model, column));
}

function optionText(item, model) {
  const share = shareText(item.value, model);
  return `${formatCount(item.numerator)} / ${formatCount(item.denominator)} ${share.sign} ${share.proportion}`;
}

const sameCell = (a, b) => a.row === b.row && a.column === b.column;
const sameCells = (a, b) => a.length === b.length && a.every((cell) => b.some((other) => sameCell(cell, other)));

// The table cells a wrong option got wrong: its numerator, its denominator, or both (the complement keeps the
// right denominator; dividing by the grand total keeps the right numerator).
// 错误选项用错的格子：分子、分母，或者两者都错（补集的分母是对的；除以总数时分子是对的）。
function wrongCells(item, correct) {
  if (item.mistake === null) return [];
  return [
    ...(sameCells(item.numeratorCells, correct.numeratorCells) ? [] : item.numeratorCells),
    ...(sameCell(item.denominatorCell, correct.denominatorCell) ? [] : [item.denominatorCell]),
  ];
}

/**
 * A practice question in the test's wording ("Among the cases with A, what is the proportion with B?"), or
 * null when the table supports none. `avoid` is the key of the previous question, which is not repeated when
 * another one exists. The kind is drawn with weights (conditional questions most often), then the cell.
 * 按考试的问法出一道练习题；这张表出不了题时返回 null。avoid 是上一题的 key：还有别的题可出时不重复它。
 * 先按权重抽题型（条件比例题最多），再抽格子。
 */
export function generateQuestion(model, table, random = Math.random, { avoid = null } = {}) {
  const draw = typeof random === 'function' ? random : Math.random;
  const pool = practiceCandidates(model, table);
  const fresh = pool.filter((candidate) => candidate.key !== avoid);
  const usable = fresh.length ? fresh : pool;
  if (!usable.length) return null;
  const kinds = QUESTION_KINDS.filter((kind) => usable.some((candidate) => candidate.kind === kind));
  const kind = weightedKind(kinds, draw);
  return buildQuestion(model, table, pick(usable.filter((candidate) => candidate.kind === kind), draw), draw);
}

/**
 * One practice question { kind, row, column } of the table. Options are fractions built from the table's own
 * numbers: the answer, the three most common mistakes of its kind and then other mistakes (wrong denominator,
 * reversed condition, ignored condition, complement, ...), at most five that print differently, shuffled with
 * `random`. Returns { key, kind, row, column, prompt, hint, options: [{ text, numerator, denominator, value,
 * correct, mistake, feedback, numeratorCells, denominatorCell, wrongCells }], answer, formula, solution }, where
 * `wrongCells` are the table cells a wrong option used in place of the right ones.
 * 这张表的一道练习题。选项都是用表里的数字组成的分数：正确答案、这类题最常见的三种错误，再加其他错误
 * （分母错、条件弄反、忽略条件、补集……），最多五个且打印出来互不相同，用 random 打乱顺序。
 * wrongCells 是错误选项用错（本该用别的格子）的那些格子。
 */
export function buildQuestion(model, table, { kind, row, column }, random = Math.random) {
  const draw = typeof random === 'function' ? random : Math.random;
  const key = questionKey(kind, row, column);
  const set = choicesFor(model, table, kind, row, column);
  const ordered = distinctChoices([set.correct, ...set.core, ...shuffleWith(set.extra, draw)], model.decimals)
    .slice(0, PRACTICE_LIMITS.maxOptions);
  const options = shuffleWith(ordered, draw).map((item) => ({
    ...item,
    correct: item.mistake === null,
    text: optionText(item, model),
    wrongCells: wrongCells(item, set.correct),
  }));
  const part = set.correct;
  const family = kind === 'joint' ? 'joint' : kind.startsWith('marginal') ? 'marginal' : 'conditional';
  return {
    key,
    kind,
    row,
    column,
    prompt: questionPrompt(model, kind, row, column),
    hint: HINTS[family],
    options,
    answer: options.findIndex((option) => option.correct),
    formula: fractionFormula(part, model),
    solution: questionSolution(model, kind, row, column, part),
  };
}

/**
 * Judges a chosen option: { correct, option, feedback } where the feedback names the mistake behind a wrong
 * option, or repeats the worked answer for the right one. Null for an index that is not an option.
 * 判断选中的选项：答错时 feedback 说出这个选项背后的错误，答对时给出完整的计算。下标不是选项时返回 null。
 */
export function judgeAnswer(question, index) {
  const option = question?.options?.[index];
  if (!option) return null;
  if (option.correct) {
    return {
      correct: true,
      option,
      feedback: { zh: `答对了！${question.formula}。${question.solution.zh}`, en: `Correct! ${question.formula}. ${question.solution.en}` },
    };
  }
  return { correct: false, option, feedback: option.feedback };
}

/** The worked answer with its option letter, for "Show answer". “看答案”时显示的完整答案和选项字母。 */
export function revealAnswer(question) {
  if (!question || question.answer < 0) return null;
  const letter = optionLetter(question.answer);
  return {
    zh: `正确答案是 ${letter}：${question.formula}。${question.solution.zh}`,
    en: `The answer is ${letter}: ${question.formula}. ${question.solution.en}`,
  };
}
