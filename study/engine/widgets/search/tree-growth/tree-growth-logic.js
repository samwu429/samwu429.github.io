/**
 * Pure maths of the tree-growth widget (Lecture 3 "The Difficulty with Search"): nodes per depth,
 * total nodes, how long exhaustive search takes, readable big numbers and a small tree layout. No DOM.
 * 状态树增长组件的纯计算（Lecture 3 “The Difficulty with Search”）：每层节点数、节点总数、
 * 穷举搜索要花多久、易读的大数字以及小树的布局。不涉及 DOM。
 */

export const BRANCHING_RANGE = Object.freeze({ min: 1, max: 10 });
export const DEPTH_RANGE = Object.freeze({ min: 0, max: 12 });
export const DEFAULT_CONFIG = Object.freeze({ branching: 2, depth: 4 });

/** States a computer checks per second (the widget lets the learner pick one). 电脑每秒检查的状态数（可选）。 */
export const RATES = Object.freeze([
  Object.freeze({ value: 1e3, label: { zh: '1 千', en: '1 thousand' }, short: '1 千 1K' }),
  Object.freeze({ value: 1e6, label: { zh: '100 万', en: '1 million' }, short: '100 万 1M' }),
  Object.freeze({ value: 1e9, label: { zh: '10 亿', en: '1 billion' }, short: '10 亿 1B' }),
]);
export const DEFAULT_RATE = 1e6;

/** Depths asked about in the Lecture 3 p.27 Discuss prompt. Lecture 3 第 27 页讨论题问到的深度。 */
export const DISCUSS_DEPTHS = Object.freeze([10, 20, 40]);

const SECONDS = Object.freeze({ minute: 60, hour: 3600, day: 86400, year: 365.25 * 86400 });
const UNIVERSE_YEARS = 13.8e9;
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

function clampInteger(value, { min, max }, fallback) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Reads { branching, depth } from a content config, rounding and clamping into the slider ranges.
 * 从内容配置读取 { branching, depth }，取整并限制在滑块范围内。
 */
export function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    branching: clampInteger(source.branching, BRANCHING_RANGE, DEFAULT_CONFIG.branching),
    depth: clampInteger(source.depth, DEPTH_RANGE, DEFAULT_CONFIG.depth),
  };
}

/** b^d: nodes at depth d when every state has b children. 每个状态有 b 个孩子时，第 d 层的节点数。 */
export function nodesAtDepth(branching, depth) {
  return branching ** depth;
}

/** [b^0, b^1, ..., b^d]. 从第 0 层到第 d 层的节点数列表。 */
export function levelCounts(branching, depth) {
  const counts = [];
  let count = 1;
  for (let level = 0; level <= depth; level += 1) {
    counts.push(count);
    count *= branching;
  }
  return counts;
}

/** 1 + b + b^2 + ... + b^d, the whole tree down to depth d. 整棵树（第 0 层到第 d 层）的节点总数。 */
export function totalNodes(branching, depth) {
  if (branching === 1) return depth + 1;
  return (branching ** (depth + 1) - 1) / (branching - 1);
}

/** Seconds needed to generate `nodes` states at `rate` states per second. 以每秒 rate 个的速度生成 nodes 个状态所需秒数。 */
export function searchSeconds(nodes, rate) {
  return nodes / rate;
}

export function superscript(value) {
  return String(value).split('').map((char) => SUPERSCRIPT[char] ?? char).join('');
}

/** "3⁴" style power. 形如 3⁴ 的幂。 */
export function formatPower(base, exponent) {
  return `${base}${superscript(exponent)}`;
}

/** "1.2 × 10¹⁹" with two significant digits. 两位有效数字的科学记数法。 */
export function scientific(value) {
  let exponent = Math.floor(Math.log10(value));
  let mantissa = Number((value / 10 ** exponent).toPrecision(2));
  if (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  return `${mantissa} × 10${superscript(exponent)}`;
}

/** Exact integer with thousands separators, or scientific notation beyond 10^15. 带千位分隔符的整数；超过 10^15 用科学记数法。 */
export function formatInteger(value) {
  if (value >= 1e15) return scientific(value);
  return Math.round(value).toLocaleString('en-US');
}

/** Two significant digits below 100 (1.2, 12, 0.12), whole numbers with separators above. 小于 100 保留两位有效数字，否则取整。 */
export function compactNumber(value) {
  if (value >= 100) return Math.round(value).toLocaleString('en-US');
  return String(Number(value.toPrecision(2)));
}

// Picks the largest unit not above the value; if rounding reaches the next unit, moves up one unit.
// 选不超过该值的最大单位；若四舍五入后达到下一个单位，则进一位。
function withUnits(value, units, step) {
  for (let index = 0; index < units.length; index += 1) {
    const [size, name] = units[index];
    if (value < size) continue;
    const scaled = value / size;
    if (index > 0 && Math.round(scaled) >= step) {
      const [biggerSize, biggerName] = units[index - 1];
      return { number: compactNumber(value / biggerSize), unit: biggerName };
    }
    return { number: compactNumber(scaled), unit: name };
  }
  return { number: compactNumber(value), unit: '' };
}

/** Chinese reading of a big number: 1.1 万亿, 105 万... 大数字的中文读法。 */
export function approxZh(value) {
  if (value >= 1e16) return scientific(value);
  const { number, unit } = withUnits(value, [[1e12, '万亿'], [1e8, '亿'], [1e4, '万']], 10000);
  return unit ? `${number} ${unit}` : number;
}

/** English reading of a big number: 1.1 trillion, 1 million... 大数字的英文读法。 */
export function approxEn(value) {
  if (value >= 1e15) return scientific(value);
  const { number, unit } = withUnits(value, [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']], 1000);
  return unit ? `${number} ${unit}` : number;
}

/** "about 1.1 trillion" for counts of 10,000 or more; null for smaller counts. 一万及以上给出大约读法，否则为 null。 */
export function describeCount(value) {
  if (!(value >= 1e4)) return null;
  return { zh: `约 ${approxZh(value)}`, en: `about ${approxEn(value)}` };
}

function unitPhrase(value, zhUnit, enUnit) {
  const number = compactNumber(value);
  return { zh: `约 ${number} ${zhUnit}`, en: `about ${number} ${enUnit}${number === '1' ? '' : 's'}` };
}

/**
 * Human time span, moving from milliseconds to seconds, minutes, hours, days and years.
 * 把秒数变成易读的时长：毫秒、秒、分钟、小时、天、年。
 */
export function describeDuration(seconds) {
  if (!(seconds > 0)) return { zh: '0 秒', en: '0 seconds' };
  if (seconds < 0.001) return { zh: '几乎一瞬间（不到 1 毫秒）', en: 'practically instant (under 1 millisecond)' };
  if (seconds < 1) return unitPhrase(seconds * 1000, '毫秒', 'millisecond');
  if (seconds < SECONDS.minute) return unitPhrase(seconds, '秒', 'second');
  if (seconds < SECONDS.hour) return unitPhrase(seconds / SECONDS.minute, '分钟', 'minute');
  if (seconds < SECONDS.day) return unitPhrase(seconds / SECONDS.hour, '小时', 'hour');
  if (seconds < SECONDS.year) return unitPhrase(seconds / SECONDS.day, '天', 'day');
  const years = seconds / SECONDS.year;
  if (years < 1e4) return unitPhrase(years, '年', 'year');
  // "58 万年" reads as one word; a plain number keeps the space ("3.5 × 10²⁶ 年").
  // “58 万年”连写；纯数字时保留空格（“3.5 × 10²⁶ 年”）。
  const zhYears = approxZh(years);
  return { zh: `约 ${zhYears}${/[万亿]$/.test(zhYears) ? '' : ' '}年`, en: `about ${approxEn(years)} years` };
}

/** A comparison for searches that would outlast the universe, otherwise null. 搜索时间超过宇宙年龄时的对比句，否则为 null。 */
export function universeNote(seconds) {
  if (!(seconds / SECONDS.year > UNIVERSE_YEARS)) return null;
  return {
    zh: '这比宇宙的年龄（约 138 亿年）还要长。',
    en: 'That is longer than the age of the universe (about 13.8 billion years).',
  };
}

/** "1 + 3 + 9 + 27 + 81", shortened with "…" when there are many terms. 求和式，项数多时用省略号缩短。 */
export function sumExpression(counts, maxTerms = 6) {
  const terms = counts.map((count) => formatInteger(count));
  if (terms.length <= maxTerms) return terms.join(' + ');
  return [...terms.slice(0, 3), '…', ...terms.slice(-2)].join(' + ');
}

/**
 * Layout of a small tree drawing: depths 0..drawnDepth, where b^drawnDepth stays within `maxLeaves`.
 * Node x is measured in leaf slots (a parent sits in the middle of its children); edges hold node indexes.
 * 小树图的布局：画第 0 层到 drawnDepth 层，使最底层节点数不超过 maxLeaves。
 * 节点 x 以叶子格为单位（父节点位于其孩子的正中间）；edges 存的是节点下标。
 */
export function treeLayout(branching, depth, maxLeaves = 64) {
  let drawnDepth = 0;
  while (drawnDepth < depth && branching ** (drawnDepth + 1) <= maxLeaves) drawnDepth += 1;
  const nodes = [];
  const edges = [];
  let previousLevelStart = 0;
  for (let level = 0; level <= drawnDepth; level += 1) {
    const levelStart = nodes.length;
    const count = branching ** level;
    const span = branching ** (drawnDepth - level);
    for (let index = 0; index < count; index += 1) {
      nodes.push({ level, index, x: (index + 0.5) * span });
      if (level > 0) edges.push([previousLevelStart + Math.floor(index / branching), nodes.length - 1]);
    }
    previousLevelStart = levelStart;
  }
  return {
    drawnDepth,
    leafCount: branching ** drawnDepth,
    truncated: drawnDepth < depth,
    nodes,
    edges,
  };
}

/**
 * Rows for "what if we search deeper": nodes at each depth, the whole tree, and the time at `rate`.
 * “继续往下搜会怎样”表格的每一行：该层节点数、整棵树节点数与所需时间。
 */
export function deeperRows(branching, rate, depths = DISCUSS_DEPTHS) {
  return depths.map((depth) => {
    const total = totalNodes(branching, depth);
    return { depth, atDepth: nodesAtDepth(branching, depth), total, seconds: searchSeconds(total, rate) };
  });
}
