/**
 * One categorical variable (STA220 Module 2) for the category-chart widget: the config reader, the frequency
 * distribution table, the worked steps and sentences, and the geometry of the bar chart and the pie chart. DOM-free.
 * 一个分类变量（STA220 第 2 单元），供 category-chart 组件使用：配置读取、频数分布表、计算步骤与句子，
 * 以及条形图和饼图的几何计算；不依赖 DOM。
 *
 * Course conventions (M2 p.3, p.9-17): frequency = count; relative frequency (proportion) = frequency / total
 * count, a number between 0 and 1; percentage = proportion × 100. Proportions are written with 3 decimals and
 * percentages with 1, as in the typed tables ("885 (40.2%)", M2 p.16) and the midterm options ("30 / 96 ≈ 0.313").
 * Every percentage is the shown proportion × 100, so a step such as "0.402 × 100 = 40.2%" is always exact.
 * 课程约定（第 2 单元第 3、9-17 页）：频数 = 个数；相对频数（比例）= 频数 / 总数，是 0 到 1 之间的数；百分比 = 比例 × 100。
 * 比例写 3 位小数、百分比写 1 位，与课件的打字表格（“885 (40.2%)”，第 16 页）和期中考试选项（“30 / 96 ≈ 0.313”）一致。
 * 每个百分比都等于显示出来的比例 × 100，所以“0.402 × 100 = 40.2%”这样的步骤总是精确成立。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { isFiniteNumber, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import { countExtent } from '../shared/chart-scales.js';
import {
  STAT_DIGITS, TIMES, formatFixed, formatTerms, formatTrim, relationSign, roundTo,
} from '../shared/stat-format.js';
import { sum } from '../shared/stats-math.js';

// Limits shared with the content validator (content-spec 5.4: 2-10 categories, non-negative counts).
// 与内容校验器一致的上下限（content-spec 第 5.4 节：2 到 10 个类别，计数不能为负）。
export const MIN_CATEGORIES = 2;
export const MAX_CATEGORIES = 10;
// A hundred billion covers any real population (the world has about 8 billion people), so content counts are never
// changed; whole counts up to this size, their total and the axis numbers of the bar chart all stay exact. Larger
// counts are cut to it, because the plot frame misprints axis numbers from 5 × 10¹¹ on.
// 一千亿足以表示任何真实的人口（全世界约 80 亿人），所以内容里的计数不会被改动；不超过这个值的整数计数、它们的总和以及
// 条形图坐标轴上的数字都能精确表示。更大的计数会截到这个值，因为坐标框从 5 × 10¹¹ 起会把轴上的数字印错。
export const MAX_COUNT = 1e11;

export const DISPLAYS = Object.freeze(['bar', 'pie', 'both']);
export const BAR_MODES = Object.freeze(['count', 'percent']);

export const PROPORTION_DIGITS = STAT_DIGITS.proportion;
export const PERCENT_DIGITS = PROPORTION_DIGITS - 2;
// Decimals for counts that are not whole numbers; whole counts are always written exactly.
// 非整数计数保留的小数位；整数计数总是原样精确写出。
const COUNT_DIGITS = 2;
const ANGLE_DIGITS = 1;

// Space above the tallest bar for its value label, as a share of the bar.
// 最高的柱子上方给数值标签留出的空间（占柱高的比例）。
const BAR_HEADROOM = 1.12;
// Monospace digits are about 0.6 em wide; the estimate errs on the wide side.
// 等宽数字约 0.6 em 宽；估计值宁可偏宽。
const CHAR_WIDTH_EM = 0.62;

const FULL_TURN = 2 * Math.PI;
// Slices start at 12 o'clock; in SVG coordinates (y pointing down) growing angles turn clockwise.
// 扇形从 12 点钟方向开始；SVG 坐标中 y 轴向下，角度增大即顺时针转动。
const PIE_START = -Math.PI / 2;
// A narrow slice is wider further out, so a label that does not fit at 0.6 r may still fit nearer the edge.
// 窄扇形越靠外越宽，所以在 0.6 r 处放不下的标签，靠近边缘时可能放得下。
const INSIDE_RADII = Object.freeze([0.6, 0.7, 0.78]);
const LABEL_CLEARANCE = 3;
const OUTSIDE_RADIUS = 12;
const OUTSIDE_COLUMN = 18;
const LEADER_ELBOW = 8;
const LEADER_GAP = 4;

/** Pie drawing box in SVG user units; labels outside the circle sit in the side columns. 饼图的 SVG 绘图框；圆外的标签放在左右两侧。 */
export const PIE_VIEW = Object.freeze({ width: 300, height: 232, cx: 150, cy: 116, r: 84, labelSize: 12 });

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

// M2 p.16 (R's built-in Titanic data), used when a config has fewer than two usable categories.
// 第 2 单元第 16 页的例子（R 自带的 Titanic 数据），配置里可用的类别不到两个时使用。
export const SLIDE_EXAMPLE = freezeDeep({
  title: { zh: '泰坦尼克号上的船票等级', en: 'Ticket Class on the Titanic' },
  variable: { zh: '船票等级', en: 'Ticket Class' },
  categories: [
    { label: { zh: '船员', en: 'Crew' }, count: 885 },
    { label: { zh: '头等舱', en: 'First' }, count: 325 },
    { label: { zh: '二等舱', en: 'Second' }, count: 285 },
    { label: { zh: '三等舱', en: 'Third' }, count: 706 },
  ],
});

export const DEFAULT_TITLE = freezeDeep({ zh: '一个分类变量的频数分布', en: 'Frequency distribution of one categorical variable' });
export const DEFAULT_VARIABLE = freezeDeep({ zh: '类别', en: 'Category' });

/**
 * Teaching sentences of the widget, Chinese teaching text with the English terms of the course (M2 p.3, p.10,
 * p.12; M3 p.9).
 * 组件中的讲解句：中文讲解，配上课程的英文术语（第 2 单元第 3、10、12 页；第 3 单元第 9 页）。
 */
export const TEXT = freezeDeep({
  intro: {
    zh: '一个分类变量（categorical variable）的分布可以画成三种样子：频数分布表、条形图和饼图。三者用的是同一组数，只是表达方式不同。',
    en: 'The distribution of one categorical variable can be shown as a frequency distribution table, a bar chart or a pie chart. All three use the same numbers.',
  },
  pickHint: {
    zh: '在表格里选一个类别（也可以直接点图里的柱子或扇形），下面会一步一步算出它的比例和百分比，两张图里也会标出这一类。键盘：按 Tab 移到类别按钮，再按 Enter。',
    en: 'Choose a category in the table, or click its bar or slice, to see its proportion and percentage worked out; the graphs highlight it too. Keyboard: Tab to a category button, then press Enter.',
  },
  fallback: {
    zh: '这个演示的配置里不到两个可用的类别，所以先显示课件 Module 2 第 16 页的例子：泰坦尼克号上的船票等级。',
    en: 'This demo config has fewer than two usable categories, so it shows the Module 2 p.16 example instead: ticket class on the Titanic.',
  },
  stepFrequency: {
    title: { zh: '第 1 步：频数', en: 'Step 1: Frequency (count)' },
    body: {
      zh: '频数（frequency）就是个数（count）：数一数有多少个个案（case）属于这一类，记作 f。',
      en: 'Frequency is a count: how many cases fall in the category, written f.',
    },
  },
  stepTotal: {
    zh: '把每一类的频数加起来，得到总数 n。',
    en: 'Add the frequencies of all the categories to get the total n.',
  },
  stepProportion: {
    title: { zh: '第 2 步：相对频数（比例）', en: 'Step 2: Relative frequency (proportion)' },
    body: {
      zh: '相对频数（relative frequency），也叫比例（proportion）= 这一类的频数 ÷ 总数，也就是 f / n。比例一定是 0 到 1 之间的数。',
      en: 'Relative frequency (proportion) = frequency of the category / total count = f / n. A proportion is a number between 0 and 1.',
    },
  },
  stepPercent: {
    title: { zh: '第 3 步：百分比', en: 'Step 3: Percentage' },
    body: {
      zh: '百分比（percentage）= 比例 × 100，后面写上 % 号。',
      en: 'Percentage = proportion × 100.',
    },
  },
  stepInterpret: {
    title: { zh: '第 4 步：写出结论（考试用英文）', en: 'Step 4: Interpret in context' },
  },
  casesTip: {
    zh: '考试时把句子里的 cases 换成题目里的对象，例如泰坦尼克号例子里的 passengers and crew members。',
    en: 'On a test, replace "cases" with the people or things in the question, such as "passengers and crew members" in the Titanic example.',
  },
  noTotal: {
    zh: '总数 n = 0：不能除以 0，所以比例和百分比都无法计算。',
    en: 'The total n is 0. We cannot divide by 0, so the proportion and the percentage cannot be computed.',
  },
  nothingToInterpret: {
    zh: '所有频数都是 0，没有可以解释的比例。',
    en: 'All the counts are 0, so there is no proportion to interpret.',
  },
  emptySummary: {
    zh: '所有频数都是 0，没有分布可以描述。',
    en: 'All the counts are 0, so there is no distribution to describe.',
  },
  barCount: {
    zh: '条形图（bar chart，课件里也叫 bar plot）：每一类一根柱子，柱子一样宽，柱子之间留空隙。柱子的高度表示这一类的频数。',
    en: 'Bar chart (bar plot): one bar per category, all of the same width, with spaces between them. The height of a bar shows the count of its category.',
  },
  barPercent: {
    zh: '现在纵轴是百分比（percent）。每根柱子仍然和它的频数成正比，所以柱子之间的高低关系不变，变的只是纵轴上的数字。',
    en: 'The y-axis now shows percent. Each bar is still proportional to its count, so the bars compare the same way; only the numbers on the axis change.',
  },
  pieAngle: {
    zh: '一整圈是 360°，所以一块扇形的角度 = 比例 × 360°。',
    en: 'A full circle is 360°, so the angle of a slice = proportion × 360°.',
  },
  pieEmpty: {
    zh: '所有频数都是 0：没有可以分成扇形的整体，所以画不出饼图。',
    en: 'All the counts are 0, so there is no whole to divide into slices and no pie chart to draw.',
  },
  notesTitle: { zh: '该用哪种图', en: 'Which graph?' },
  notes: [
    {
      zh: '条形图（bar chart）和饼图（pie chart）用来展示分类变量（categorical variable）；直方图（histogram）用来展示数值变量（quantitative variable）。',
      en: 'Bar charts and pie charts display a categorical variable; a histogram displays a quantitative variable.',
    },
    {
      zh: '条形图的柱子之间要留空隙，因为各个类别是分开的，可以按任何顺序排列；直方图的柱子是连在一起的，因为相邻的组（bin）在数轴上是连着的。',
      en: 'A bar chart has spaces between its bars because the categories are separate and could be arranged in any order; a histogram has attached bars because its bins sit next to each other on a number line.',
    },
    {
      zh: '面积原则（Area Principle）：图中一部分所占的面积，应该和它代表的数值大小相对应。条形图的柱子一样宽，面积只由高度决定，所以符合面积原则。',
      en: 'Area Principle: the area of a part of a graph should match the size of the value it represents. Bars of equal width follow it, because their heights decide their areas.',
    },
    {
      zh: '饼图把全部个案画成一个圆（100%），每一块扇形的大小和这一类占整体的比例成正比。',
      en: 'A pie chart shows the whole group of cases as a circle (100%); each slice is proportional to its fraction of the whole.',
    },
  ],
});

/* ---------- Config 配置 ---------- */

function readDisplay(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DISPLAYS.includes(key) ? key : 'both';
}

// Entries that are not objects, or whose count is not a number, carry no data and are skipped; a negative count
// becomes 0 and a huge one MAX_COUNT. Only the first MAX_CATEGORIES usable entries are kept.
// 不是对象、或计数不是数字的条目没有数据，直接跳过；负数计数改为 0，过大的计数改为 MAX_COUNT。只保留前 MAX_CATEGORIES 个可用条目。
function readCategories(list) {
  const categories = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (categories.length >= MAX_CATEGORIES) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const count = toNumber(raw.count);
    if (count === null) continue;
    const index = categories.length;
    categories.push({
      index,
      label: toBi(raw.label, { zh: `类别 ${index + 1}`, en: `Category ${index + 1}` }),
      count: Math.min(MAX_COUNT, Math.max(0, count)),
    });
  }
  return categories;
}

function exampleCategories() {
  return SLIDE_EXAMPLE.categories.map((category, index) => ({ index, label: { ...category.label }, count: category.count }));
}

/**
 * Reads a content config defensively: { title, variable, categories: [{ index, label, count }], display, usedDefault }.
 * Labels may be Bi objects or plain strings; counts may be numbers or numeric strings. With fewer than two usable
 * categories the M2 p.16 example is shown instead (usedDefault), with its own title and variable.
 * 防御性读取内容配置，返回 { title, variable, categories: [{ index, label, count }], display, usedDefault }。
 * 标签可以是双语对象或普通字符串；计数可以是数字或数字字符串。可用类别不到两个时改用第 2 单元第 16 页的例子（usedDefault），
 * 标题与变量名也随之换成例子的。
 */
export function normalizeCategoryChartConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const categories = readCategories(source.categories);
  const usedDefault = categories.length < MIN_CATEGORIES;
  return {
    title: usedDefault ? { ...SLIDE_EXAMPLE.title } : toBi(source.title, DEFAULT_TITLE),
    variable: usedDefault ? { ...SLIDE_EXAMPLE.variable } : toBi(source.variable, DEFAULT_VARIABLE),
    categories: usedDefault ? exampleCategories() : categories,
    display: readDisplay(source.display),
    usedDefault,
  };
}

/** Which graphs a display value shows: { bar, pie }. display 取值对应要画的图。 */
export function chartFlags(display) {
  const key = readDisplay(display);
  return { bar: key !== 'pie', pie: key !== 'bar' };
}

/* ---------- Text helpers 文字工具 ---------- */

function plainText(text) {
  return typeof text === 'string' ? stripMarkup(text).trim() : '';
}

/** Plain text of a Bi value for aria labels and announcements: "船员 Crew". 双语值的纯文本，用于无障碍标签与朗读。 */
export function plainBi(value) {
  const zh = plainText(value?.zh);
  const en = plainText(value?.en);
  return zh && en && zh !== en ? `${zh} ${en}` : (zh || en);
}

// The name of a category in each language, borrowing the other language when one is missing.
// 类别在两种语言里的名字；缺少一种时借用另一种。
function labelNames(label) {
  const zh = plainText(label?.zh);
  const en = plainText(label?.en);
  return { zh: zh || en, en: en || zh };
}

function joinEn(names) {
  const quoted = names.map((name) => `"${name}"`);
  if (quoted.length < 2) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

function joinZh(names) {
  const quoted = names.map((name) => `“${name}”`);
  if (quoted.length < 2) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join('、')}和${quoted[quoted.length - 1]}`;
}

/**
 * A count as written in the table: whole counts exactly ("2201", "106576"), others with up to 2 decimals.
 * 表格里计数的写法：整数原样精确写出，非整数最多保留 2 位小数。
 */
export function formatCount(value) {
  if (!isFiniteNumber(value)) return '—';
  return Number.isInteger(value) ? String(value) : formatTrim(value, COUNT_DIGITS);
}

function percentOf(shownProportion) {
  return isFiniteNumber(shownProportion) ? `${formatFixed(shownProportion * 100, PERCENT_DIGITS)}%` : '—';
}

/* ---------- Frequency distribution 频数分布 ---------- */

/**
 * The frequency distribution table (M2 p.3, p.14, p.16): for each category its frequency f, relative frequency
 * (proportion) f / n and percentage, with the texts the table prints, and the total n. When n = 0 the proportions
 * are NaN and print as "—".
 * Returns { k, total, hasTotal, rows: [{ index, label, count, proportion, percent, countText, proportionText,
 * percentText }], totalText, proportionTotalText, percentTotalText, shownProportionSum }.
 * 频数分布表（第 2 单元第 3、14、16 页）：每一类的频数 f、相对频数（比例）f / n 和百分比，以及表格中显示的文字和总数 n。
 * n = 0 时比例为 NaN，显示为“—”。
 */
export function frequencyDistribution(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const total = sum(list.map((category) => category?.count));
  const hasTotal = total > 0;
  const rows = list.map((category, index) => {
    const count = category.count;
    const proportion = hasTotal ? count / total : NaN;
    return {
      index,
      label: category.label,
      count,
      proportion,
      percent: proportion * 100,
      countText: formatCount(count),
      proportionText: formatFixed(proportion, PROPORTION_DIGITS),
      percentText: percentOf(roundTo(proportion, PROPORTION_DIGITS)),
    };
  });
  const shown = rows.reduce((running, row) => running + roundTo(row.proportion, PROPORTION_DIGITS), 0);
  return {
    k: rows.length,
    total,
    hasTotal,
    rows,
    totalText: formatCount(total),
    proportionTotalText: hasTotal ? formatFixed(1, PROPORTION_DIGITS) : '—',
    percentTotalText: hasTotal ? percentOf(1) : '—',
    shownProportionSum: hasTotal ? roundTo(shown, PROPORTION_DIGITS) : NaN,
  };
}

/**
 * When the rounded proportions of the table do not add up to exactly 1, the note that explains why (as in the
 * practice solutions, where rounded proportions add up to 1.01); otherwise null.
 * 表中四舍五入后的比例加起来不正好是 1 时，返回解释原因的说明（练习答案里也出现过加起来是 1.01 的情况）；否则返回 null。
 */
export function roundingCheck(distribution) {
  if (!distribution?.hasTotal) return null;
  const shown = distribution.shownProportionSum;
  if (Math.abs(shown - 1) < 1e-9) return null;
  const proportionSum = formatFixed(shown, PROPORTION_DIGITS);
  const percentSum = percentOf(shown);
  return {
    proportionSum,
    percentSum,
    zh: `表中四舍五入后的比例加起来是 ${proportionSum}（${percentSum}），不是正好 1（100%）。这是每个比例分别四舍五入造成的，不是算错了。`,
    en: `The rounded proportions in the table add up to ${proportionSum} (${percentSum}), not exactly 1 (100%). This happens because each proportion was rounded, not because of a mistake.`,
  };
}

function rowAt(distribution, index) {
  const rows = distribution?.rows ?? [];
  if (!rows.length) return null;
  return Number.isInteger(index) && index >= 0 && index < rows.length ? rows[index] : rows[0];
}

/**
 * Worked steps for one category (M2 p.3, p.14): f; n written as a sum; f / n = 885 / 2201 ≈ 0.402;
 * 0.402 × 100 = 40.2%; the slice angle for the pie; and the interpretation sentence in English and Chinese.
 * An index outside the table falls back to the first category; with n = 0 the division is shown and `warning`
 * explains why it cannot be done.
 * Returns { index, label, frequency, total, proportion, percent, angle, warning, sentence } or null without rows.
 * 某一类的计算步骤（第 2 单元第 3、14 页）：f；写成加法的 n；f / n = 885 / 2201 ≈ 0.402；0.402 × 100 = 40.2%；
 * 饼图扇形的角度；以及中英文的结论句。下标超出表格时退回第一类；n = 0 时只写出除法，并由 warning 说明为什么算不了。
 */
export function categorySteps(distribution, index) {
  const row = rowAt(distribution, index);
  if (!row) return null;
  const { rows, totalText } = distribution;
  const terms = formatTerms(rows.map((item) => item.count), { maxTerms: MAX_CATEGORIES, term: formatCount });
  const base = {
    index: row.index,
    label: row.label,
    frequency: `f = ${row.countText}`,
    total: `n = ${terms} = ${totalText}`,
  };
  if (!distribution.hasTotal) {
    return {
      ...base,
      proportion: `f / n = ${row.countText} / ${totalText}`,
      percent: null,
      angle: null,
      warning: { ...TEXT.noTotal },
      sentence: { ...TEXT.nothingToInterpret },
    };
  }
  const names = labelNames(row.label);
  const angle = row.proportion * 360;
  const verb = row.count === 1 ? 'is' : 'are';
  return {
    ...base,
    proportion: `f / n = ${row.countText} / ${totalText} ${relationSign(row.proportion, PROPORTION_DIGITS)} ${row.proportionText}`,
    percent: `${row.proportionText} ${TIMES} 100 = ${row.percentText}`,
    angle: `${row.countText} / ${totalText} ${TIMES} 360° ${relationSign(angle, ANGLE_DIGITS)} ${formatTrim(angle, ANGLE_DIGITS)}°`,
    warning: null,
    sentence: {
      zh: `${totalText} 个个案中，有 ${row.countText} 个（${row.percentText}）属于“${names.zh}”这一类。`,
      en: `${row.countText} of the ${totalText} cases (${row.percentText}) ${verb} in the category "${names.en}".`,
    },
  };
}

/**
 * Screen-reader message after a category is chosen: "已选 Selected: 船员 Crew. f / n = 885 / 2201 ≈ 0.402 = 40.2%".
 * 选中一个类别后给读屏软件的提示。
 */
export function selectionAnnouncement(distribution, index) {
  const steps = categorySteps(distribution, index);
  if (!steps) return '';
  const row = rowAt(distribution, index);
  const result = distribution.hasTotal ? `${steps.proportion} = ${row.percentText}` : `${steps.frequency}, n = ${distribution.totalText}`;
  return `已选 Selected: ${plainBi(row.label)}. ${result}`;
}

/**
 * The "Interpret the graph" sentence (M2 p.11, p.17): a majority (more than half), exactly half, the most common
 * category (the mode, M3 p.36) followed by the next one, a tie, equal frequencies, or no data.
 * Returns { kind: 'majority' | 'half' | 'plurality' | 'tie' | 'all-equal' | 'empty', indices, zh, en }, where
 * `indices` lists the most common categories.
 * “读图”结论句（第 2 单元第 11、17 页）：过半数（多数）、正好一半、最常见的一类（众数，第 3 单元第 36 页）及其次的一类、
 * 并列、各类一样多，或没有数据。indices 列出最常见的类别。
 */
export function distributionSummary(distribution) {
  const rows = distribution?.rows ?? [];
  if (!distribution?.hasTotal || !rows.length) return { kind: 'empty', indices: [], ...TEXT.emptySummary };
  const top = Math.max(...rows.map((row) => row.count));
  const leaders = rows.filter((row) => row.count === top);
  const indices = leaders.map((row) => row.index);
  const share = leaders[0].percentText;
  if (leaders.length === rows.length) {
    return {
      kind: 'all-equal',
      indices,
      zh: `每一类的频数都一样（各占 ${share}），没有哪一类比别的类更常见。`,
      en: `Every category has the same frequency (${share} each), so no category is more common than another.`,
    };
  }
  if (leaders.length > 1) {
    return {
      kind: 'tie',
      indices,
      zh: `${joinZh(leaders.map((row) => labelNames(row.label).zh))}并列最常见，各占 ${share}，它们都是众数（mode）。`,
      en: `${joinEn(leaders.map((row) => labelNames(row.label).en))} are tied as the most common categories (the modes), with ${share} each.`,
    };
  }
  const names = labelNames(leaders[0].label);
  // Compare counts, not rounded percentages, so 50.04% is not mistaken for exactly half.
  // 比较计数而不是四舍五入后的百分比，避免把 50.04% 当成正好一半。
  if (2 * top > distribution.total) {
    return {
      kind: 'majority',
      indices,
      zh: `超过一半（${share}）的个案属于“${names.zh}”这一类，所以它是最常见的一类，也就是众数（mode）。`,
      en: `The majority of the cases (${share}) are in the category "${names.en}", so it is the most common category (the mode).`,
    };
  }
  if (2 * top === distribution.total) {
    return {
      kind: 'half',
      indices,
      zh: `正好一半（${share}）的个案属于“${names.zh}”这一类，它是最常见的一类，也就是众数（mode）。`,
      en: `Exactly half of the cases (${share}) are in the category "${names.en}", the most common category (the mode).`,
    };
  }
  const second = Math.max(...rows.filter((row) => row.count < top).map((row) => row.count));
  const runners = rows.filter((row) => row.count === second);
  const each = runners.length > 1;
  const runnerShare = runners[0].percentText;
  return {
    kind: 'plurality',
    indices,
    zh: `没有哪一类超过一半（50%）。最常见的一类（众数 mode）是“${names.zh}”（${share}），其次是`
      + `${joinZh(runners.map((row) => labelNames(row.label).zh))}（${each ? '各占 ' : ''}${runnerShare}）。`,
    en: `No category has a majority (more than 50% of the cases). The most common category (the mode) is "${names.en}" (${share}), `
      + `followed by ${joinEn(runners.map((row) => labelNames(row.label).en))} (${runnerShare}${each ? ' each' : ''}).`,
  };
}

/* ---------- Bar chart 条形图 ---------- */

/**
 * Bar heights and value labels: counts, or percentages (M2 p.11 plots Frequency, p.17 plots Percent).
 * Returns [{ index, value, text }]; a percentage that cannot be computed has height 0 and text "—".
 * 柱子的高度与数值标签：频数，或百分比（第 2 单元第 11 页画频数，第 17 页画百分比）。无法计算的百分比高度为 0、文字为“—”。
 */
export function barValues(distribution, mode = 'count') {
  const rows = distribution?.rows ?? [];
  if (mode === 'percent') {
    return rows.map((row) => ({
      index: row.index,
      value: isFiniteNumber(row.percent) ? row.percent : 0,
      text: row.percentText,
    }));
  }
  return rows.map((row) => ({ index: row.index, value: row.count, text: row.countText }));
}

/**
 * The y-axis of the bar chart from 0 with whole-number ticks and room above the tallest bar for its label; a
 * percent axis never goes past 100.
 * 条形图的纵轴：从 0 开始、刻度为整数，并在最高的柱子上方留出标签的位置；百分比轴不会超过 100。
 */
export function barAxis(distribution, mode = 'count') {
  const top = Math.max(0, ...barValues(distribution, mode).map((bar) => bar.value));
  const room = top * BAR_HEADROOM;
  return countExtent(mode === 'percent' ? Math.min(room, 100) : room);
}

/** Estimated width of a monospace label in SVG units. 等宽字体标签在 SVG 中的估计宽度。 */
export function estimateLabelWidth(text, size) {
  return String(text ?? '').length * size * CHAR_WIDTH_EM;
}

/**
 * Whether every value label fits above its own bar without touching the neighbours; otherwise only the chosen
 * bar is labelled.
 * 每个数值标签能否放在自己的柱子上方而不碰到相邻的标签；放不下时只标出选中的柱子。
 */
export function valueLabelsFit(bars, slotWidth, size) {
  return (bars ?? []).every((bar) => estimateLabelWidth(bar.text, size) <= slotWidth - 2);
}

/** Text alternative of the bar chart: every category with its bar value. 条形图的文字替代：每一类及其柱子的数值。 */
export function barChartLabel(distribution, variable, mode = 'count') {
  const axis = mode === 'percent' ? '百分比 Percent' : '频数 Frequency';
  const values = barValues(distribution, mode);
  const parts = (distribution?.rows ?? []).map((row, index) => `${plainBi(row.label)} ${values[index].text}`);
  return `条形图 Bar chart: ${plainBi(variable)}; 纵轴 y-axis: ${axis}. ${parts.join('; ')}.`;
}

/* ---------- Pie chart 饼图 ---------- */

/**
 * Pie slices in table order from 12 o'clock, clockwise; each angle is proportion × 2π. Categories with a count of 0
 * have no slice; with n = 0 there are none.
 * Returns [{ index, start, end, mid, sweep, degrees }] (angles in radians, SVG orientation).
 * 按表格顺序、从 12 点钟方向顺时针排列的扇形，每块的角度为比例 × 2π。计数为 0 的类别没有扇形；n = 0 时一块都没有。
 */
export function pieSlices(distribution) {
  if (!distribution?.hasTotal) return [];
  const slices = [];
  let start = PIE_START;
  for (const row of distribution.rows) {
    if (!(row.proportion > 0)) continue;
    const sweep = row.proportion * FULL_TURN;
    slices.push({ index: row.index, start, end: start + sweep, mid: start + sweep / 2, sweep, degrees: row.proportion * 360 });
    start += sweep;
  }
  return slices;
}

const round1 = (value) => roundTo(value, 1);
const round2 = (value) => roundTo(value, 2);

function isFullTurn(slice) {
  return slice.sweep >= FULL_TURN - 1e-9;
}

function polar(view, angle, radius) {
  return [round1(view.cx + radius * Math.cos(angle)), round1(view.cy + radius * Math.sin(angle))];
}

/**
 * SVG path data of a slice ("M cx cy L … A … Z"), or null for a slice that fills the whole circle (draw a circle).
 * 扇形的 SVG 路径；占满整个圆的扇形返回 null（改画一个圆）。
 */
export function slicePath(slice, view = PIE_VIEW) {
  if (!slice || isFullTurn(slice)) return null;
  const { cx, cy, r } = view;
  const x1 = round2(cx + r * Math.cos(slice.start));
  const y1 = round2(cy + r * Math.sin(slice.start));
  const x2 = round2(cx + r * Math.cos(slice.end));
  const y2 = round2(cy + r * Math.sin(slice.end));
  const large = slice.sweep > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

/** How far a chosen slice moves out along its middle: { dx, dy }. 选中的扇形沿中线向外移动的距离。 */
export function sliceOffset(slice, distance) {
  if (!slice || isFullTurn(slice)) return { dx: 0, dy: 0 };
  return { dx: round1(distance * Math.cos(slice.mid)), dy: round1(distance * Math.sin(slice.mid)) };
}

function normalizeAngle(angle) {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

// A label fits inside a slice when the four corners of its box lie inside the wedge with a small clearance. A
// wedge of half a turn or more always has room on its middle line.
// 标签框的四个角都落在扇形内（留一点余量）时，标签放得进扇形；半圈及以上的扇形在中线上总有空间。
function fitsInside(slice, box, view) {
  if (slice.sweep >= Math.PI) return true;
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const corners = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [-halfWidth, halfHeight], [halfWidth, halfHeight]];
  return corners.every(([offsetX, offsetY]) => {
    const dx = box.x + offsetX - view.cx;
    const dy = box.y + offsetY - view.cy;
    const distance = Math.hypot(dx, dy);
    if (distance <= LABEL_CLEARANCE || distance > view.r - LABEL_CLEARANCE) return false;
    const margin = Math.asin(Math.min(1, LABEL_CLEARANCE / distance));
    const angle = normalizeAngle(Math.atan2(dy, dx) - slice.start);
    return angle >= margin && angle <= slice.sweep - margin;
  });
}

// Whether the straight segment from p to q stays clear of the circle (with a small margin).
// 从 p 到 q 的线段是否不碰到圆（留一点余量）。
function clearsCircle([x1, y1], [x2, y2], view) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.min(1, Math.max(0, ((view.cx - x1) * dx + (view.cy - y1) * dy) / length)) : 0;
  return Math.hypot(x1 + t * dx - view.cx, y1 + t * dy - view.cy) >= view.r + 2;
}

// Keeps the labels of one side in their order and at least `gap` apart, inside [top, bottom].
// 让同一侧的标签保持原有顺序、彼此至少相隔 gap，并留在 [top, bottom] 之内。
function spread(labels, { top, bottom, gap }) {
  labels.sort((a, b) => a.y - b.y);
  for (let index = 0; index < labels.length; index += 1) {
    const floor = index ? labels[index - 1].y + gap : top;
    if (labels[index].y < floor) labels[index].y = floor;
  }
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const ceiling = index === labels.length - 1 ? bottom : labels[index + 1].y - gap;
    if (labels[index].y > ceiling) labels[index].y = ceiling;
  }
}

// Where a label fits inside its slice: the centre for a full circle, else the first radius on the middle line
// whose label box fits; null when none does.
// 标签在扇形内的位置：整圆放在圆心，否则取中线上第一个放得下标签框的半径；都放不下时返回 null。
function insidePoint(slice, text, view) {
  if (isFullTurn(slice)) return { x: view.cx, y: view.cy };
  const width = estimateLabelWidth(text, view.labelSize);
  for (const share of INSIDE_RADII) {
    const x = view.cx + share * view.r * Math.cos(slice.mid);
    const y = view.cy + share * view.r * Math.sin(slice.mid);
    if (fitsInside(slice, { x, y, width, height: view.labelSize + 2 }, view)) return { x, y };
  }
  return null;
}

/**
 * Percent labels of the pie (the same text as the table). A label sits inside its slice when it fits; otherwise it
 * goes to a column beside the circle with a leader line, and the labels of each side are spread so they never
 * overlap.
 * Returns [{ index, text, inside, x, y, anchor, leader }], where (x, y) is the anchor of the text's middle line and
 * `leader` is null or the points of a line from the slice edge to the label that never crosses the circle.
 * 饼图的百分比标签（文字与表格相同）。放得下时标签写在扇形里；放不下时移到圆旁边的一列，用引线连到扇形，
 * 并把同一侧的标签错开，保证互不重叠。(x, y) 是文字中线的锚点；leader 为 null，或从扇形边缘到标签、不穿过圆的折线各点。
 */
export function pieLabels(distribution, view = PIE_VIEW) {
  const rowsByIndex = new Map((distribution?.rows ?? []).map((row) => [row.index, row]));
  const size = view.labelSize;
  const labels = [];
  const sides = { left: [], right: [] };
  for (const slice of pieSlices(distribution)) {
    const text = rowsByIndex.get(slice.index)?.percentText ?? '';
    const point = insidePoint(slice, text, view);
    if (point) {
      labels.push({ index: slice.index, text, inside: true, x: round1(point.x), y: round1(point.y), anchor: 'middle', leader: null });
      continue;
    }
    const side = Math.cos(slice.mid) >= 0 ? 'right' : 'left';
    sides[side].push({ slice, text, y: view.cy + (view.r + OUTSIDE_RADIUS) * Math.sin(slice.mid) });
  }
  for (const [side, group] of Object.entries(sides)) {
    spread(group, { top: size / 2 + 2, bottom: view.height - size / 2 - 2, gap: size + 3 });
    const sign = side === 'right' ? 1 : -1;
    const x = view.cx + sign * (view.r + OUTSIDE_COLUMN);
    const endX = round1(x - sign * LEADER_GAP);
    for (const item of group) {
      const elbow = polar(view, item.slice.mid, view.r + LEADER_ELBOW);
      const end = [endX, round1(item.y)];
      // A label spread far from its slice is reached around the circle: across to the column, then along it.
      // 被错开到离扇形较远处的标签，引线绕过圆：先横向走到标签列，再沿列走到标签。
      const route = clearsCircle(elbow, end, view) ? [end] : [[endX, elbow[1]], end];
      labels.push({
        index: item.slice.index,
        text: item.text,
        inside: false,
        x: round1(x),
        y: round1(item.y),
        anchor: side === 'right' ? 'start' : 'end',
        leader: [polar(view, item.slice.mid, view.r + 1), elbow, ...route],
      });
    }
  }
  return labels.sort((a, b) => a.index - b.index);
}

/** Text alternative of the pie chart: every category with its percentage. 饼图的文字替代：每一类及其百分比。 */
export function pieChartLabel(distribution, variable) {
  const parts = (distribution?.rows ?? []).map((row) => `${plainBi(row.label)} ${row.percentText}`);
  return `饼图 Pie chart: ${plainBi(variable)}, n = ${distribution?.totalText ?? '0'}. ${parts.join('; ')}.`;
}

/** What the whole pie stands for and how the slices are ordered. 整个饼代表什么、扇形按什么顺序排列。 */
export function pieNote(distribution) {
  const n = distribution?.totalText ?? '0';
  return {
    zh: `整个圆代表全部 n = ${n} 个个案（100%）。扇形从 12 点钟方向开始，按表格里的顺序顺时针排列。`,
    en: `The whole circle is all n = ${n} cases (100%). The slices start at 12 o'clock and go clockwise in the order of the table.`,
  };
}
