/**
 * z-scores as a measure of position (STA220 Module 4 p.25-39) for the "z-score" widget: the config reader
 * and every number, worked step, sentence and number-line position the widget shows. DOM-free.
 * z 分数——位置的度量（STA220 第 4 单元第 25-39 页），供 z-score 组件使用：读取配置，并算出组件显示的每个数字、
 * 解题步骤、句子和数轴位置；不依赖 DOM。
 *
 * Course conventions kept here:
 * - z = (y − ȳ) / s for sample data and (y − μ) / σ for a population (p.25). z is printed with 2 decimals
 *   (1.70, 1.83, 2.98, −1.42 on p.35 and p.39) and has no units, because it counts standard deviations.
 * - The z-score rule for outliers (p.26), for bell-shaped symmetric distributions only: |z| > 3 is a highly
 *   suspect outlier and 2 < |z| ≤ 3 a potential/suspect outlier. The slide does not say where exactly 2 and 3
 *   belong; the course brief puts exactly 3 with "suspect" and leaves exactly 2 unflagged, and so does this.
 * - Values from different distributions are compared by their z-scores (p.34-35): the larger z is the
 *   relatively higher value, which is the better performance when higher values are better.
 * - Reverse formula y = ȳ + z × s (p.37: IQ = 100 + (2.5 × 16) = 140).
 * 课程约定：
 * - 样本数据 z = (y − ȳ) / s，总体数据 z = (y − μ) / σ（第 25 页）。z 保留 2 位小数（第 35、39 页的 1.70、1.83、2.98、−1.42），
 *   没有单位，因为它数的是“几个标准差”。
 * - 判断离群值的 z 分数规则（第 26 页，只适用于钟形、对称的分布）：|z| > 3 为高度可疑离群值，2 < |z| ≤ 3 为可疑离群值。
 *   课件没有说正好等于 2 或 3 时归哪一类；课程简报把正好等于 3 归为可疑、正好等于 2 不标记，这里照此处理。
 * - 来自不同分布的值用 z 分数比较（第 34-35 页）：z 越大，相对位置越高；数值越高越好时，就是表现更好。
 * - 反推公式 y = ȳ + z × s（第 37 页：IQ = 100 + (2.5 × 16) = 140）。
 */
import { formatNonZero, isFiniteNumber, toBi, toNumber } from '../../machine-learning/shared/ml-math.js';
import {
  MINUS, STAT_DIGITS, TIMES, formatFixed, formatOperand, formatSigned, formatTrim, relationSign, roundTo,
} from '../shared/stat-format.js';
import { finiteNumbers, observationFromZ, zScore } from '../shared/stats-math.js';

// Sizes the content validator accepts (tools/validate_content.py, check_statistics_widget): 1-6 values,
// or 2-4 comparisons. Longer lists are cut to the maximum.
// 内容校验器接受的数量（tools/validate_content.py 的 check_statistics_widget）：1-6 个值，或 2-4 个比较项；更长的列表截到上限。
export const VALUE_LIMITS = Object.freeze({ min: 1, max: 6 });
export const COMPARE_LIMITS = Object.freeze({ min: 2, max: 4 });

// Cut-offs of the z-score rule for outliers (M4 p.26). z-score 判断离群值规则的分界（第 4 单元第 26 页）。
export const SUSPECT_Z = 2;
export const HIGHLY_SUSPECT_Z = 3;

// z keeps 2 decimals like the slides; numbers from the config are written as given, up to 6 decimals
// (the M4 practice key works with mean 5.752941 and sd 2.825236).
// z 与课件一样保留 2 位小数；配置里的数字按原样写出，最多 6 位小数（第 4 单元练习答案用的是 5.752941 和 2.825236）。
export const Z_DIGITS = STAT_DIGITS.z;
export const GIVEN_DIGITS = 6;

// The number line always shows ȳ ± 3s with half a standard deviation to spare, and stretches to fit the
// values up to ±6.5 s; a value even further out is drawn as an arrow at the end of the line.
// 数轴至少画出 ȳ ± 3s 并多留半个标准差，会随数值伸长到 ±6.5 s；更远的值在数轴末端画成箭头。
export const AXIS_LIMITS = Object.freeze({ min: 3.5, max: 6.5 });
// Average glyph width of the 11 px tick numbers and the 12 px bold point label, in pixels, for thinning labels.
// 11 px 刻度数字与 12 px 粗体点标签的平均字宽（像素），用来决定标签要不要隔一个显示。
export const TICK_CHAR_WIDTH = 6.6;
export const LABEL_CHAR_WIDTH = 7.4;

// The reverse panel starts at z = 2, whose answer is also the "ȳ + 2s" tick of the number line.
// 反推面板从 z = 2 开始，它的答案正好是数轴上“ȳ + 2s”那条刻度。
export const DEFAULT_REVERSE_Z = 2;

/**
 * M4 p.38-39: Tim Hortons donut calories, mean 251 and SD 50.06; the slide asks about the donuts with 400 and
 * 180 calories. Shown when a config gives neither a usable distribution nor a comparison.
 * 第 4 单元第 38-39 页：Tim Hortons 甜甜圈的热量，平均数 251、标准差 50.06；课件问 400 和 180 卡路里的甜甜圈。
 * 配置里既没有可用的分布也没有比较项时显示这个例子。
 */
export const SLIDE_EXAMPLE = Object.freeze({
  variable: Object.freeze({ zh: '甜甜圈的热量', en: 'Calories of a donut' }),
  unit: 'kcal',
  mean: 251,
  sd: 50.06,
  values: Object.freeze([400, 180]),
});

// Relative tolerance for binary noise, as in stats-math: 3.0000000000000004 still counts as 3.
// 吸收二进制误差的相对容差，与 stats-math 一致：3.0000000000000004 仍算作 3。
const EPSILON = 1e-9;
// Much tighter slack for "y equals the mean": only the noise of one subtraction (0.1 + 0.2 against 0.3),
// so 1000000.0005 is still above a mean of 1000000.
// 判断“y 等于平均数”用更小的容差：只吸收一次减法的误差（0.1 + 0.2 对 0.3），所以 1000000.0005 仍在平均数 1000000 上方。
const ZERO_TOLERANCE = 1e-12;

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

/* ---------- Config 配置 ---------- */

// A bilingual label, or null when the config has none. 双语标签；配置里没有时为 null。
function readBi(value) {
  const bi = toBi(value, { zh: '', en: '' });
  return bi.zh.trim() || bi.en.trim() ? bi : null;
}

// The unit is kept whole, as the validator accepts any string; the number lines never print it, only HTML text does.
// 单位原样完整保留（校验器接受任何字符串）；数轴上不印单位，只有会换行的 HTML 文字里才有。
function readUnit(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// A name that states the entry's own value after a colon: "Exam 2: 62 (mean 40, SD 12)", "考试 2：62 分（…）".
// 在冒号后面写出自己数值的名称：“Exam 2: 62 (mean 40, SD 12)”“考试 2：62 分（…）”。
const NAME_WITH_VALUE = /^(.+?)\s*[:：]\s*(?:[$€£¥]\s*)?([+\-−]?\d+(?:\.\d+)?)(?![\d.])/u;

// The part of a name before ": <value>" when that value is the entry's own, otherwise the whole name. Sentences
// print the value themselves ("62 (Exam 2)"), so they use this part and never repeat the value, which also keeps
// them right after the learner types another value.
// 名称中“: <数值>”前面的部分（当这个数值就是该项自己的数值时），否则是整个名称。句子自己会写出数值（“62 (Exam 2)”），
// 所以用这一部分，不会重复数值；学习者改了数值以后句子也不会出错。
function withoutStatedValue(text, value) {
  const name = typeof text === 'string' ? text.trim() : '';
  const match = NAME_WITH_VALUE.exec(name);
  if (!match) return name;
  const head = match[1].trim();
  return head && nearlyEqual(Number(match[2].replace('−', '-')), value) ? head : name;
}

// One comparison entry, or null when it lacks a number mean or value or a positive sd (the validator's rule).
// `sentenceName` is the name the sentences use (see withoutStatedValue).
// 一个比较项；缺少数字形式的平均数、数值或正的标准差时（校验器的规则）返回 null。sentenceName 是句子里使用的名称（见 withoutStatedValue）。
function readEntry(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const mean = toNumber(raw.mean);
  const sd = toNumber(raw.sd);
  const value = toNumber(raw.value);
  if (mean === null || sd === null || value === null || !(sd > 0)) return null;
  const letter = String.fromCharCode(65 + index);
  const name = readBi(raw.name) ?? { zh: `分布 ${letter}`, en: `Distribution ${letter}` };
  const sentenceName = { zh: withoutStatedValue(name.zh, value), en: withoutStatedValue(name.en, value) };
  return { index, name, sentenceName, mean, sd, value };
}

function readEntries(list) {
  const entries = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (entries.length >= COMPARE_LIMITS.max) break;
    const entry = readEntry(raw, entries.length);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * Reads a content config defensively into { mode, title, variable, unit, mean, sd, values, entries, usedDefault }.
 * - "compare" mode needs 2-4 usable entries { name, mean, sd > 0, value }; more are cut to 4.
 * - "single" mode needs a number mean and a positive sd; values keeps 1-6 numbers (more are cut to 6), and
 *   a missing list becomes the one value 1 standard deviation above the mean.
 * A config the validator accepts is read as it is written. Anything else falls back step by step: a single
 * usable comparison entry becomes single mode, and nothing usable gives the slide example (usedDefault).
 * Numeric strings count as numbers; title and variable are Bi values (a plain string is filed by script).
 * 防御性读取内容配置，得到 { mode, title, variable, unit, mean, sd, values, entries, usedDefault }。
 * - compare 模式需要 2-4 个可用的比较项 { name, mean, sd > 0, value }，多出的截到 4 个。
 * - single 模式需要数字形式的平均数和正的标准差；values 保留 1-6 个数（多出的截到 6 个），缺少时用“比平均数高 1 个标准差”的那个值。
 * 校验器接受的配置原样读取；其余情况逐步退回：只有一个可用比较项时按 single 模式显示，什么都不可用时显示课件例子（usedDefault）。
 * 数字字符串也算数字；title 与 variable 是双语值（普通字符串按文字归入 zh 或 en）。
 */
export function normalizeZScoreConfig(config) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const title = readBi(source.title);
  const variable = readBi(source.variable);
  const unit = readUnit(source.unit);
  const entries = readEntries(source.compare);
  if (entries.length >= COMPARE_LIMITS.min) {
    return { mode: 'compare', title, variable, unit, mean: null, sd: null, values: [], entries, usedDefault: false };
  }
  const mean = toNumber(source.mean);
  const sd = toNumber(source.sd);
  if (mean !== null && sd !== null && sd > 0) {
    const listed = finiteNumbers(source.values).slice(0, VALUE_LIMITS.max);
    const values = listed.length ? listed : [roundTo(mean + sd, GIVEN_DIGITS)];
    return { mode: 'single', title, variable, unit, mean, sd, values, entries: [], usedDefault: false };
  }
  if (entries.length === 1) {
    const [entry] = entries;
    return {
      mode: 'single', title, variable: variable ?? entry.name, unit, mean: entry.mean, sd: entry.sd, values: [entry.value],
      entries: [], usedDefault: false,
    };
  }
  // The config's own labels would mislabel the slide's numbers, so the example brings its own.
  // 配置自己的标签会把课件例子的数字标错，所以例子使用它自己的标签。
  return {
    mode: 'single',
    title: null,
    variable: { ...SLIDE_EXAMPLE.variable },
    unit: SLIDE_EXAMPLE.unit,
    mean: SLIDE_EXAMPLE.mean,
    sd: SLIDE_EXAMPLE.sd,
    values: [...SLIDE_EXAMPLE.values],
    entries: [],
    usedDefault: true,
  };
}

/**
 * Reads a number the learner typed. A number box hands over '' for text it cannot read; text from a Chinese
 * input method (full-width digits, minus signs and points) is accepted here as well. Returns null otherwise.
 * 读取学习者输入的数字。数字框读不懂的内容会变成 ''；中文输入法打出的全角数字、减号和小数点这里也能接受。其余情况返回 null。
 */
export function parseNumberInput(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10))
    .replace(/[−–—－]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[．。]/g, '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/* ---------- Number text 数字文本 ---------- */

// Currency signs go in front ("$82"), percent and degree signs stick to the number ("12%"); other units
// follow after a space ("400 kcal").
// 货币符号写在前面（“$82”），百分号和度数符号紧贴数字（“12%”），其他单位空一格写在后面（“400 kcal”）。
const PREFIX_UNITS = new Set(['$', '€', '£', '¥', 'US$', 'C$', 'CA$']);
const TIGHT_UNITS = new Set(['%', '°', '‰']);

/** A number text with its unit: "400 kcal", "$82", "−$5", "+$12", "12%". 带单位的数字文本。 */
export function withUnit(text, unit = '') {
  if (!unit || text === '—') return text;
  if (PREFIX_UNITS.has(unit)) {
    const signed = text.startsWith(MINUS) || text.startsWith('+');
    return signed ? `${text[0]}${unit}${text.slice(1)}` : `${unit}${text}`;
  }
  if (TIGHT_UNITS.has(unit)) return `${text}${unit}`;
  return `${text} ${unit}`;
}

/** A number from the config or the learner, written as given (up to 6 decimals). 按原样写出配置或学习者给的数（最多 6 位小数）。 */
export function formatGiven(value) {
  return formatTrim(value, GIVEN_DIGITS);
}

/**
 * z with 2 decimals, as the slides print it: "2.98", "−1.42", "1.70"; a comparison may need more (zDigits).
 * 按课件写法保留 2 位小数的 z；比较时可能需要更多位（见 zDigits）。
 */
export function formatZ(z, digits = Z_DIGITS) {
  return formatFixed(z, digits);
}

/** A distance from the mean with its sign and unit: "+149 kcal", "−71 kcal", "0". 带正负号和单位的“离平均数的距离”。 */
export function formatDeviation(deviation, unit = '') {
  return withUnit(formatSigned(deviation, GIVEN_DIGITS, { trim: true }), unit);
}

// |z| for sentences: 2 decimals, more only when a z that is not 0 would print as 0.00.
// 句子里的 |z|：保留 2 位小数；只有非 0 的 z 会显示成 0.00 时才多保留几位。
function sizeText(z) {
  const size = Math.abs(z);
  return size > 0 && roundTo(size, Z_DIGITS) === 0 ? formatNonZero(size, Z_DIGITS, GIVEN_DIGITS) : formatFixed(size, Z_DIGITS);
}

// |z| beside the rule's cut-offs, with enough decimals that the comparison stays visible: 3.004 is not "3.00".
// 与规则分界值并列时的 |z|，小数位足以看出大小关系：3.004 不会写成“3.00”。
function sizeAgainstCutoffs(size) {
  for (let digits = Z_DIGITS; digits < GIVEN_DIGITS; digits += 1) {
    const rounded = roundTo(size, digits);
    const blurred = [SUSPECT_Z, HIGHLY_SUSPECT_Z].some((cut) => rounded === cut && !nearlyEqual(size, cut));
    if (!blurred) return formatFixed(size, digits);
  }
  return formatFixed(size, GIVEN_DIGITS);
}

/* ---------- One value 单个值 ---------- */

/**
 * Where a z-score falls under the z-score rule (M4 p.26): "highly-suspect" for |z| > 3, "suspect" for
 * 2 < |z| ≤ 3, otherwise "none" (the key names of stats-math's OUTLIER_LEVELS).
 * z 分数按第 4 单元第 26 页规则的归类：|z| > 3 为 "highly-suspect"，2 < |z| ≤ 3 为 "suspect"，其余为 "none"（与 stats-math 的 OUTLIER_LEVELS 键名相同）。
 */
export function zOutlierLevel(z) {
  if (!isFiniteNumber(z)) return 'none';
  const size = Math.abs(z);
  if (size > HIGHLY_SUSPECT_Z && !nearlyEqual(size, HIGHLY_SUSPECT_Z)) return 'highly-suspect';
  if (size > SUSPECT_Z && !nearlyEqual(size, SUSPECT_Z)) return 'suspect';
  return 'none';
}

/**
 * Everything about one observation: { value, mean, sd, deviation = y − ȳ, z, direction, level }, where
 * direction is "above", "below" or "at" the mean ("none" when y is not a number) and level comes from
 * zOutlierLevel. z is NaN unless s > 0.
 * 一个观测值的全部信息：{ value, mean, sd, deviation = y − ȳ, z, direction, level }；direction 为 "above"、"below"
 * 或 "at"（y 不是数字时为 "none"），level 来自 zOutlierLevel。s > 0 时才有 z，否则为 NaN。
 */
export function zDetails(value, mean, sd) {
  const y = toNumber(value, NaN);
  const centre = toNumber(mean, NaN);
  const spread = toNumber(sd, NaN);
  const raw = y - centre;
  const atMean = Number.isFinite(raw) && Math.abs(raw) <= ZERO_TOLERANCE * Math.max(1, Math.abs(y), Math.abs(centre));
  const deviation = atMean ? 0 : raw;
  const score = atMean ? zScore(centre, centre, spread) : zScore(y, centre, spread);
  const z = Number.isFinite(score) ? score : NaN;
  let direction = 'none';
  if (Number.isFinite(z)) direction = deviation > 0 ? 'above' : deviation < 0 ? 'below' : 'at';
  return { value: y, mean: centre, sd: spread, deviation, z, direction, level: zOutlierLevel(z) };
}

/**
 * The substituted formula, like M4 p.35 and p.39: { general, substituted, quotient, result, line }, where line
 * reads "z = (400 − 251) / 50.06 = 149 / 50.06 ≈ 2.98". A negative mean gets parentheses: "(3 − (−2))".
 * 代入数字后的公式，与第 4 单元第 35、39 页一致；line 为“z = (400 − 251) / 50.06 = 149 / 50.06 ≈ 2.98”。负的平均数加括号。
 */
export function zWorking(value, mean, sd) {
  const details = zDetails(value, mean, sd);
  const spread = formatGiven(details.sd);
  const substituted = `z = (${formatGiven(details.value)} ${MINUS} ${formatOperand(details.mean, GIVEN_DIGITS)}) / ${spread}`;
  const quotient = `${formatGiven(details.deviation)} / ${spread}`;
  const result = `${relationSign(details.z, Z_DIGITS)} ${formatZ(details.z)}`;
  return {
    general: `z = (y ${MINUS} ȳ) / s`,
    substituted,
    quotient,
    result,
    line: `${substituted} ${relationSign(details.deviation, GIVEN_DIGITS)} ${quotient} ${result}`,
  };
}

/**
 * The two hand steps of a z-score as [{ id, math, zh, en }]: subtract the mean, then divide by the standard
 * deviation, each with its numbers and a sentence saying what the step means.
 * 手算 z 分数的两步，返回 [{ id, math, zh, en }]：先减平均数，再除以标准差；每一步都带数字和一句含义说明。
 */
export function zSteps(value, mean, sd, unit = '') {
  const details = zDetails(value, mean, sd);
  const deviation = formatGiven(details.deviation);
  const distance = withUnit(formatGiven(Math.abs(details.deviation)), unit);
  const spread = formatGiven(details.sd);
  const spreadWithUnit = withUnit(spread, unit);
  const zText = formatZ(details.z);
  const exact = relationSign(details.z, Z_DIGITS) === '=';
  const size = sizeText(details.z);

  const subtract = {
    id: 'subtract',
    math: `y ${MINUS} ȳ = ${formatGiven(details.value)} ${MINUS} ${formatOperand(details.mean, GIVEN_DIGITS)} `
      + `${relationSign(details.deviation, GIVEN_DIGITS)} ${deviation}`,
  };
  if (details.direction === 'above') {
    subtract.zh = `先用 y 减去平均数 ȳ，看 y 离平均数多远。差是正数：y 在平均数上方，高出 ${distance}。`;
    subtract.en = `Subtract the mean ȳ from y to see how far y is from the mean. The difference is positive: y is ${distance} above the mean.`;
  } else if (details.direction === 'below') {
    subtract.zh = `先用 y 减去平均数 ȳ，看 y 离平均数多远。差是负数：y 在平均数下方，低了 ${distance}。`;
    subtract.en = `Subtract the mean ȳ from y to see how far y is from the mean. The difference is negative: y is ${distance} below the mean.`;
  } else {
    subtract.zh = '先用 y 减去平均数 ȳ，看 y 离平均数多远。差是 0：y 正好等于平均数。';
    subtract.en = 'Subtract the mean ȳ from y to see how far y is from the mean. The difference is 0: y equals the mean.';
  }

  const divide = { id: 'divide', math: `z = ${deviation} / ${spread} ${relationSign(details.z, Z_DIGITS)} ${zText}` };
  if (details.direction === 'above' || details.direction === 'below') {
    const below = details.direction === 'below';
    divide.zh = `再除以标准差 s，把这段距离换算成“几个标准差”：${distance} ${exact ? '正好' : '大约'}是 ${size} 个 ${spreadWithUnit}。`
      + (below ? '负号表示 y 在平均数下方。' : '');
    divide.en = `Divide by the standard deviation s to count how many standard deviations this distance is: ${distance} is `
      + `${exact ? '' : 'about '}${size} times ${spreadWithUnit}.${below ? ' The minus sign means y is below the mean.' : ''}`;
  } else {
    divide.zh = '再除以标准差 s：0 除以任何正数都是 0，所以 z = 0。';
    divide.en = 'Divide by the standard deviation s: 0 divided by a positive number is 0, so z = 0.';
  }
  return [subtract, divide];
}

/**
 * The interpretation sentence in the style of M4 p.39 ("Donut with 400 calories is 2.98 standard deviation
 * above the mean."): { en, zh, template }, where template is the instructor's fill-in pattern from the M4
 * practice key with this z filled in.
 * 第 4 单元第 39 页风格的解释句：{ en, zh, template }；template 是第 4 单元练习答案里老师的填空句式，已填入这个 z。
 */
export function interpretZ(value, mean, sd, unit = '') {
  const details = zDetails(value, mean, sd);
  const y = withUnit(formatGiven(details.value), unit);
  const size = sizeText(details.z);
  if (details.direction === 'above' || details.direction === 'below') {
    const word = details.direction;
    return {
      en: `A value of ${y} is ${size} standard deviations ${word} the mean.`,
      zh: `${y} 比平均数${word === 'above' ? '高' : '低'} ${size} 个标准差。`,
      template: `[Variable] for [case] is ${size} standard deviations ${word} the mean [variable].`,
    };
  }
  if (details.direction === 'at') {
    return {
      en: `A value of ${y} is equal to the mean, so its z-score is 0.`,
      zh: `${y} 正好等于平均数，所以 z = 0。`,
      template: '[Variable] for [case] is equal to the mean [variable] (z = 0).',
    };
  }
  return { en: 'This z-score cannot be computed.', zh: '这个 z 分数无法计算。', template: '' };
}

/**
 * The z-score rule for outliers (M4 p.26) applied to z: { level, size, zh, en, extreme }, where extreme is
 * { answer, en, zh } in the M4 practice key's wording ("Yes; it is beyond a z-score of 3 in absolute value.").
 * 把第 4 单元第 26 页的 z 分数规则用在这个 z 上：{ level, size, zh, en, extreme }；extreme 为 { answer, en, zh }，
 * 用第 4 单元练习答案的说法（“Yes; it is beyond a z-score of 3 in absolute value.”）。
 */
export function zRule(z) {
  const level = zOutlierLevel(z);
  const size = isFiniteNumber(z) ? sizeAgainstCutoffs(Math.abs(z)) : '—';
  const texts = {
    'highly-suspect': {
      zh: `|z| = ${size}，大于 3：在钟形、对称的分布里，离平均数超过 3 个标准差非常少见（unlikely, rare），`
        + '所以它是高度可疑离群值（highly suspect outlier）。',
      en: `|z| = ${size} is larger than 3, so the value is unlikely (rare): a highly suspect outlier.`,
    },
    suspect: {
      zh: `|z| = ${size}，在 2 和 3 之间：它是可疑离群值（potential/suspect outlier），但还不是高度可疑离群值。`,
      en: `|z| = ${size} is between 2 and 3 in absolute value: a potential/suspect outlier.`,
    },
    none: {
      zh: `|z| = ${size}，不大于 2：按 z 分数规则，它不算离群值。`,
      en: `|z| = ${size} is not larger than 2, so the z-score rule does not flag it as an outlier.`,
    },
  };
  const beyond = level === 'highly-suspect';
  return {
    level,
    size,
    ...texts[level],
    extreme: beyond
      ? { answer: true, en: 'Yes; it is beyond a z-score of 3 in absolute value.', zh: '是：它的 |z| 超过了 3。' }
      : { answer: false, en: 'No; it is not beyond a z-score of 3 in absolute value.', zh: '不是：它的 |z| 没有超过 3。' },
  };
}

/**
 * From a z-score back to the observation, y = ȳ + z × s, written like M4 p.37 ("IQ = 100 + (2.5 x 16) = 140"):
 * { z, value, line, zh, en }. value is NaN when z is not a number.
 * 由 z 分数反推观测值 y = ȳ + z × s，写法与第 4 单元第 37 页一致：{ z, value, line, zh, en }；z 不是数字时 value 为 NaN。
 */
export function reverseFromZ(z, mean, sd, unit = '') {
  const score = toNumber(z, NaN);
  const value = observationFromZ(score, mean, sd);
  const general = `y = ȳ + z ${TIMES} s`;
  if (!Number.isFinite(value)) {
    return { z: score, value, line: general, zh: '先输入一个 z 分数。', en: 'Enter a z-score first.' };
  }
  const zText = formatGiven(score);
  const yText = withUnit(formatGiven(value), unit);
  const line = `${general} = ${formatGiven(mean)} + (${zText} ${TIMES} ${formatGiven(sd)}) `
    + `${relationSign(value, GIVEN_DIGITS)} ${formatGiven(value)}`;
  // The learner typed z, so the sentence repeats it as typed (2.5, not 2.50). 学习者输入了 z，所以句子按输入的样子重复它。
  const size = formatGiven(Math.abs(score));
  if (score > 0) {
    return {
      z: score, value, line,
      zh: `z = ${zText} 对应的值是 ${yText}：比平均数高 ${size} 个标准差。`,
      en: `The value with z = ${zText} is ${yText}: ${size} standard deviations above the mean.`,
    };
  }
  if (score < 0) {
    return {
      z: score, value, line,
      zh: `z = ${zText} 对应的值是 ${yText}：比平均数低 ${size} 个标准差。`,
      en: `The value with z = ${zText} is ${yText}: ${size} standard deviations below the mean.`,
    };
  }
  return {
    z: score, value, line,
    zh: `z = 0 对应的值是 ${yText}，就是平均数本身。`,
    en: `The value with z = 0 is ${yText}, the mean itself.`,
  };
}

/* ---------- Several distributions 多个分布 ---------- */

const zKey = (z) => (Number.isFinite(z) ? z : -Infinity);

// Indices of the rows tied for the largest value of `key`. key 取最大值的那些行（并列时全部给出）的下标。
function topIndices(rows, key) {
  const finite = rows.filter((row) => Number.isFinite(row[key]));
  if (!finite.length) return [];
  const best = Math.max(...finite.map((row) => row[key]));
  return finite.filter((row) => nearlyEqual(row[key], best)).map((row) => row.index);
}

// Decimals (2 to 6) that print neighbouring, different z-scores differently, so "1.833 > 1.832" never reads "1.83 > 1.83".
// 让相邻而不相等的 z 分数打印出来也不同所需的小数位数（2 到 6 位），避免出现“1.83 > 1.83”。
function separatingDigits(sorted) {
  for (let digits = Z_DIGITS; digits < GIVEN_DIGITS; digits += 1) {
    const clash = sorted.some((z, index) => index > 0 && !nearlyEqual(z, sorted[index - 1])
      && formatFixed(z, digits) === formatFixed(sorted[index - 1], digits));
    if (!clash) return digits;
  }
  return GIVEN_DIGITS;
}

/**
 * Compares values from different distributions (M4 p.34-35). Returns { rows, order, ranks, top, rawTop,
 * deviationTop, sameMeans, sameSds, zDigits }: rows hold { index, name, sentenceName, value, mean, sd, deviation, z,
 * direction } in entry order (sentenceName falls back to name); order lists the indices from the largest z down;
 * ranks gives each entry's rank by z (ties share a rank); top, rawTop and deviationTop are the indices tied for the
 * largest z, raw value and y − ȳ; zDigits is the number of decimals that keeps different z-scores apart in print.
 * 比较来自不同分布的值（第 4 单元第 34-35 页）。rows 按比较项顺序给出每项的 { index, name, sentenceName, value, mean, sd,
 * deviation, z, direction }（没有 sentenceName 时用 name）；order 是按 z 从大到小排列的下标；ranks 是每项按 z 的名次（并列同名次）；
 * top、rawTop、deviationTop 分别是 z、原始数值、y − ȳ 最大（含并列）的下标；zDigits 是让不同的 z 分数打印出来也不同所需的小数位数。
 */
export function compareValues(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const rows = list.map((entry, index) => {
    const details = zDetails(entry?.value, entry?.mean, entry?.sd);
    return {
      index,
      name: entry?.name ?? null,
      sentenceName: entry?.sentenceName ?? entry?.name ?? null,
      value: details.value,
      mean: details.mean,
      sd: details.sd,
      deviation: details.deviation,
      z: details.z,
      direction: details.direction,
    };
  });
  const order = rows.map((row) => row.index).sort((a, b) => zKey(rows[b].z) - zKey(rows[a].z) || a - b);
  const ranks = rows.map((row) => 1 + rows.filter((other) => zKey(other.z) > zKey(row.z)
    && !nearlyEqual(other.z, row.z)).length);
  const sameAs = (key) => rows.every((row) => nearlyEqual(row[key], rows[0][key]));
  const sortedZ = order.map((index) => rows[index].z).filter(Number.isFinite);
  return {
    rows,
    order,
    ranks,
    top: topIndices(rows, 'z'),
    rawTop: topIndices(rows, 'value'),
    deviationTop: topIndices(rows, 'deviation'),
    sameMeans: rows.length > 0 && sameAs('mean'),
    sameSds: rows.length > 0 && sameAs('sd'),
    zDigits: separatingDigits(sortedZ),
  };
}

// Each language of a name, falling back to the other. 名称的两种语言，缺一种时用另一种代替。
function nameIn(name, language) {
  const own = typeof name?.[language] === 'string' ? name[language].trim() : '';
  const other = typeof name?.[language === 'zh' ? 'en' : 'zh'] === 'string' ? name[language === 'zh' ? 'en' : 'zh'].trim() : '';
  return own || other;
}

// "A and B", "A, B and C"; Chinese joins with "、" and "和". 英文用 “A, B and C”，中文用“、”和“和”连接。
function joinNames(items, language) {
  if (items.length <= 1) return items.join('');
  const last = items[items.length - 1];
  const rest = items.slice(0, -1);
  return language === 'zh' ? `${rest.join('、')}和${last}` : `${rest.join(', ')} and ${last}`;
}

/**
 * Sentences of the comparison (M4 p.34-35), all built from compareValues(entries):
 * - chain: the z-scores from the largest down, "1.83 > 1.70" ("=" between ties);
 * - conclusion { zh, en }: which value is relatively highest, relative to its own mean and standard deviation;
 * - exam { zh, en }: the slide's sentence ("So, 62 exam mark is a (slightly) better performance, relative to its
 *   mean and its standard deviation."), meant for variables where higher is better;
 * - ways: the three ways of comparing on p.34-35 (raw value, distance from the mean, z-score), each
 *   { id, fair, picks [{ index, text }], pick { zh, en }, reason { zh, en } }, where picks are the entries that
 *   way chooses with the number it goes by. Raw values compare fairly only when every mean and every standard
 *   deviation is the same; distances from the mean only when every standard deviation is the same.
 * 比较的句子（第 4 单元第 34-35 页），全部由 compareValues(entries) 的结果生成：
 * - chain：z 分数从大到小，“1.83 > 1.70”（并列用“=”）；
 * - conclusion：相对于各自的平均数和标准差，哪个值的相对位置最高；
 * - exam：课件的结论句，适用于数值越高越好的变量；
 * - ways：第 34-35 页的三种比较方法（原始数值、离平均数的距离、z 分数），每种为 { id, fair, picks, pick, reason }，
 *   picks 是这种方法选出的比较项及其依据的数字。只有所有平均数和标准差都相同时，直接比原始数值才公平；
 *   只有所有标准差都相同时，比离平均数的距离才公平。
 */
export function comparisonText(result, unit = '') {
  const rows = result?.rows ?? [];
  const digits = result?.zDigits ?? Z_DIGITS;
  const zText = (row) => formatZ(row.z, digits);
  const valueText = (row) => withUnit(formatGiven(row.value), unit);
  // "62 (Exam 2)": the sentence name, so a name that states its value does not print it twice.
  // “62（考试 2）”：使用句子名称，名称里写了数值时不会印两遍。
  const labelled = (row, language, text = valueText(row)) => (language === 'zh'
    ? `${text}（${nameIn(row.sentenceName ?? row.name, 'zh')}）`
    : `${text} (${nameIn(row.sentenceName ?? row.name, 'en')})`);
  const pick = (indices, write) => ({
    zh: joinNames(indices.map((index) => labelled(rows[index], 'zh', write(rows[index]))), 'zh'),
    en: joinNames(indices.map((index) => labelled(rows[index], 'en', write(rows[index]))), 'en'),
  });
  const picks = (indices, write) => indices.map((index) => ({ index, text: write(rows[index]) }));

  const ordered = (result?.order ?? []).map((index) => rows[index]).filter((row) => Number.isFinite(row?.z));
  const chain = ordered.map((row, position) => {
    if (position === 0) return zText(row);
    return `${nearlyEqual(row.z, ordered[position - 1].z) ? '=' : '>'} ${zText(row)}`;
  }).join(' ');

  const top = result?.top ?? [];
  let conclusion;
  let exam;
  if (top.length === 1) {
    const row = rows[top[0]];
    conclusion = {
      zh: `相对于各自的平均数和标准差，${labelled(row, 'zh')}的相对位置最高：它的 z 分数最大（z = ${zText(row)}）。`,
      en: `Relative to its own mean and standard deviation, ${labelled(row, 'en')} is the highest: it has the largest z-score (z = ${zText(row)}).`,
    };
    exam = {
      zh: `所以，相对于自己的平均数和标准差，${labelled(row, 'zh')}的表现${rows.length > 2 ? '最好' : '更好'}。`,
      en: `So, ${labelled(row, 'en')} is the ${rows.length > 2 ? 'best' : 'better'} performance, relative to its mean and its standard deviation.`,
    };
  } else if (top.length > 1) {
    const tied = pick(top, valueText);
    conclusion = {
      zh: `${tied.zh}的 z 分数相同（z = ${zText(rows[top[0]])}）：相对于各自的平均数和标准差，它们一样高。`,
      en: `${tied.en} have the same z-score (z = ${zText(rows[top[0]])}): relative to their own means and standard deviations, they are equally high.`,
    };
    exam = {
      zh: '所以，相对于各自的平均数和标准差，它们的表现一样好。',
      en: 'So, they are equally good performances, relative to their own means and standard deviations.',
    };
  } else {
    conclusion = { zh: '这些 z 分数无法比较。', en: 'These z-scores cannot be compared.' };
    exam = { zh: '', en: '' };
  }

  const sameMeans = Boolean(result?.sameMeans);
  const sameSds = Boolean(result?.sameSds);
  let rawReason;
  if (sameMeans && sameSds) {
    rawReason = {
      zh: '这里所有分布的平均数和标准差都相同，所以直接比原始数值也可以。',
      en: 'Fair here: every mean and every standard deviation is the same.',
    };
  } else if (!sameMeans && !sameSds) {
    rawReason = { zh: '不公平：各分布的平均数和标准差都不一样。', en: 'Not fair: the means and the standard deviations differ.' };
  } else if (!sameMeans) {
    rawReason = { zh: '不公平：各分布的平均数不一样。', en: 'Not fair: the means differ.' };
  } else {
    rawReason = { zh: '不公平：各分布的标准差不一样。', en: 'Not fair: the standard deviations differ.' };
  }
  const deviationReason = sameSds
    ? {
      zh: '这里所有分布的标准差都相同，所以比离平均数的距离和比 z 分数的结论一样。',
      en: 'Fair here: every standard deviation is the same, so it ranks the values the way z does.',
    }
    : {
      zh: '不公平：它只看离平均数多远，没有考虑各分布的标准差不一样。',
      en: 'Not fair: it ignores that the standard deviations differ.',
    };

  const deviationText = (row) => formatDeviation(row.deviation, unit);
  const zWithSymbol = (row) => `z = ${zText(row)}`;
  const rawTop = result?.rawTop ?? [];
  const deviationTop = result?.deviationTop ?? [];
  const ways = [
    {
      id: 'raw',
      fair: sameMeans && sameSds,
      picks: picks(rawTop, valueText),
      pick: pick(rawTop, valueText),
      reason: rawReason,
    },
    {
      id: 'deviation',
      fair: sameSds,
      picks: picks(deviationTop, deviationText),
      pick: pick(deviationTop, deviationText),
      reason: deviationReason,
    },
    {
      id: 'z',
      fair: true,
      picks: picks(top, zWithSymbol),
      pick: pick(top, zWithSymbol),
      reason: {
        zh: '公平：z 分数把每个值都换成“离自己的平均数有几个标准差”，同时考虑了平均数和标准差。',
        en: 'Fair: each value is measured in standard deviations from its own mean.',
      },
    },
  ];
  return { chain, conclusion, exam, ways };
}

/* ---------- Number line 数轴 ---------- */

/**
 * Half-width of the number line in standard deviations: ȳ ± 3.5 s at least, enough for the largest |z| with
 * half a standard deviation to spare, at most ±6.5 s.
 * 数轴的半宽（以标准差为单位）：至少 ȳ ± 3.5 s，足以容纳最大的 |z| 并多留半个标准差，最多 ±6.5 s。
 */
export function axisSpan(zs) {
  const sizes = (Array.isArray(zs) ? zs : []).filter(isFiniteNumber).map(Math.abs);
  const largest = sizes.length ? Math.max(...sizes) : 0;
  return Math.min(AXIS_LIMITS.max, Math.max(AXIS_LIMITS.min, Math.ceil(largest - EPSILON) + 0.5));
}

/**
 * Horizontal scale of a number line `width` pixels wide covering z from −span to span:
 * { left, right, unit (pixels per standard deviation), x(z) }.
 * 宽 width 像素、覆盖 z 从 −span 到 span 的数轴的横向比例尺：{ left, right, unit（每个标准差的像素数）, x(z) }。
 */
export function axisScale(width, span, padding = 18) {
  const half = span > 0 ? span : AXIS_LIMITS.min;
  const left = padding;
  const right = Math.max(left + 1, width - padding);
  const unit = (right - left) / (2 * half);
  return { left, right, unit, x: (z) => left + (z + half) * unit };
}

/**
 * The ticks ȳ + k·s for the whole numbers k inside ±span: [{ k, value, valueLabel, zLabel }]. The values are
 * labelled with at most 2 decimals, since they only guide the eye; the steps show the exact numbers.
 * 数轴刻度 ȳ + k·s（k 为 ±span 以内的整数）：[{ k, value, valueLabel, zLabel }]。刻度数值最多保留 2 位小数，
 * 只用来帮助看图；精确的数字在步骤里。
 */
export function axisTicks(mean, sd, span) {
  const last = Math.floor(span + EPSILON);
  return Array.from({ length: 2 * last + 1 }, (_, index) => {
    const k = index - last;
    const value = mean + k * sd;
    return { k, value, valueLabel: formatTrim(value, 2), zLabel: formatTrim(k, 0) };
  });
}

/**
 * Show every `stride`-th tick label (1, 2, 3, 4 or 6) so labels of this many characters do not touch when
 * neighbouring ticks are `unit` pixels apart.
 * 相邻刻度相距 unit 像素时，每隔 stride 个刻度（1、2、3、4 或 6）显示一个标签，使这些字数的标签不会挨在一起。
 */
export function labelStride(unit, labels) {
  const longest = Math.max(1, ...(Array.isArray(labels) ? labels : []).map((label) => String(label).length));
  const needed = longest * TICK_CHAR_WIDTH + 8;
  return [1, 2, 3, 4, 6].find((stride) => unit * stride >= needed) ?? 6;
}

/**
 * Where a point is drawn: { z, side, visible }. A z beyond ±span is pinned to the end of the line with side ±1
 * (drawn as an arrow); a z that is not a number is not drawn.
 * 点画在哪里：{ z, side, visible }。超出 ±span 的 z 固定在数轴末端，side 为 ±1（画成箭头）；不是数字的 z 不画。
 */
export function placeOnAxis(z, span) {
  if (!isFiniteNumber(z)) return { z: 0, side: 0, visible: false };
  if (z > span) return { z: span, side: 1, visible: true };
  if (z < -span) return { z: -span, side: -1, visible: true };
  return { z, side: 0, visible: true };
}

/** The label above the highlighted point: "y = 400, z ≈ 2.98". 高亮点上方的标签。 */
export function pointLabel(value, mean, sd) {
  const details = zDetails(value, mean, sd);
  return `y = ${formatGiven(details.value)}, z ${relationSign(details.z, Z_DIGITS)} ${formatZ(details.z)}`;
}

/**
 * Centre x of a label of `length` characters near `x`, kept inside the drawing (bold 12 px text).
 * 长度为 length 个字符的标签在 x 附近的中心位置，保证不超出画面（12 px 粗体字）。
 */
export function labelCenter(x, length, width, padding = 4) {
  const half = (length * LABEL_CHAR_WIDTH) / 2;
  if (width - 2 * padding <= 2 * half) return width / 2;
  return Math.min(width - padding - half, Math.max(padding + half, x));
}

/**
 * Text alternative of one number line, for its aria-label: the mean, the standard deviation, the range of
 * the ticks and every plotted value with its z-score.
 * 一条数轴的文字说明，用作 aria-label：平均数、标准差、刻度范围，以及每个画出的值和它的 z 分数。
 */
export function numberLineDescription({ mean, sd, span, values = [], unit = '' }) {
  const ticks = axisTicks(mean, sd, span);
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const points = values.map((value) => {
    const details = zDetails(value, mean, sd);
    return `y = ${withUnit(formatGiven(details.value), unit)}, z ${relationSign(details.z, Z_DIGITS)} ${formatZ(details.z)}`;
  });
  return `数轴 Number line: ȳ = ${withUnit(formatGiven(mean), unit)}, s = ${withUnit(formatGiven(sd), unit)}; `
    + `ticks from ȳ ${MINUS} ${Math.abs(first.k)}s = ${first.valueLabel} to ȳ + ${last.k}s = ${last.valueLabel}. `
    + `${points.join('; ')}.`;
}

/**
 * What the live region says after the value changes: "y = 400 kcal，z ≈ 2.98。…" in both languages.
 * 数值改变后朗读区域播报的内容（中英双语）。
 */
export function announcement(value, mean, sd, unit = '') {
  const details = zDetails(value, mean, sd);
  const sentence = interpretZ(value, mean, sd, unit);
  const head = `y = ${withUnit(formatGiven(details.value), unit)}, z ${relationSign(details.z, Z_DIGITS)} ${formatZ(details.z)}`;
  return `${head}。${sentence.zh} ${sentence.en}`;
}
