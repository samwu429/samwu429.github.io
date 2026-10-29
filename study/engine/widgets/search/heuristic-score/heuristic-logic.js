/**
 * Pure logic for the heuristic-score widget: a weighted-sum heuristic in the course's
 * material-advantage format, Score = sum of weight x (count for A - count for B). DOM-free.
 * heuristic-score 组件的纯逻辑：课程“子力优势”格式的加权和启发式，分数 = Σ 权重 × (A 的数量 − B 的数量)；不依赖 DOM。
 *
 * Lecture 3 p.55 / Lab 3 p.11-14: each feature is compared for both players (always ours minus
 * the opponent's), and the difference is multiplied by a weight that says how important it is.
 * 第 3 讲第 55 页 / 实验 3 第 11–14 页：每个特征都比较双方（永远是我方减对方），差值再乘上表示重要程度的权重。
 */

export const MINUS = '−';
export const TIMES = '×';
export const COUNT_LIMITS = Object.freeze({ min: 0, max: 99 });
export const WEIGHT_LIMITS = Object.freeze({ min: -99, max: 99 });
export const MAX_FEATURES = 12;
export const DEFAULT_SYMBOLS = Object.freeze(['A', 'B']);
export const DEFAULT_FORMULA_NAME = 'Score';
// Course convention (Lecture 3 p.52): only a guaranteed win or loss reaches +100 or -100.
// 课程约定（第 3 讲第 52 页）：只有确定的赢或输才到 +100 或 −100。
export const REWARD_LIMIT = 100;

const HAN = /[㐀-鿿]/;

/**
 * Rounds away floating-point noise (0.1 + 0.2) and never returns -0.
 * 去掉浮点误差（如 0.1 + 0.2），并且不会返回 -0。
 */
export function roundNumber(value, digits = 6) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Accepts the Unicode minus sign and the full-width digits of Chinese input methods.
 * 接受 Unicode 减号与中文输入法的全角数字。
 */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim()
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xFF10))
    .replace(/[−–—－]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[．。]/g, '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Feature counts are whole numbers from 0 to 99. 特征数量是 0 到 99 的整数。 */
export function clampCount(value, fallback = 0) {
  const number = parseNumber(value);
  if (number === null) return fallback;
  return Math.min(COUNT_LIMITS.max, Math.max(COUNT_LIMITS.min, Math.round(number)));
}

/** Weights may be negative or fractional, within -99 to 99. 权重可以是负数或小数，范围 −99 到 99。 */
export function clampWeight(value, fallback = 1) {
  const number = parseNumber(value);
  if (number === null) return fallback;
  return roundNumber(Math.min(WEIGHT_LIMITS.max, Math.max(WEIGHT_LIMITS.min, number)), 4);
}

function toBi(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return HAN.test(value) ? { zh: value, en: '' } : { zh: '', en: value };
  }
  if (value && typeof value === 'object') {
    const zh = typeof value.zh === 'string' ? value.zh : '';
    const en = typeof value.en === 'string' ? value.en : '';
    if (zh.trim() || en.trim()) return { zh, en };
  }
  return { ...fallback };
}

// A player symbol is one or two letters or digits, so it fits the round tag and reads like the slides ("W").
// 玩家符号是一到两个字母或数字，放得进圆形标记，也和课件的写法一样（例如 "W"）。
function readSymbols(value) {
  const read = (item) => (typeof item === 'string' && /^[\p{L}\p{N}]{1,2}$/u.test(item.trim()) ? item.trim() : null);
  const symbols = Array.isArray(value) ? [read(value[0]), read(value[1])] : [null, null];
  return symbols[0] && symbols[1] && symbols[0] !== symbols[1] ? symbols : [...DEFAULT_SYMBOLS];
}

function readFormulaName(value) {
  const text = typeof value === 'string' ? value : (value && typeof value === 'object' ? value.en : '');
  return typeof text === 'string' && text.trim() && text.trim().length <= 40 ? text.trim() : DEFAULT_FORMULA_NAME;
}

/**
 * Reads a widget config defensively: every missing or broken field gets a safe default.
 * Returns { title, players: [Bi, Bi], symbols: [a, b], formulaName, features: [{ id, name, weight, counts: [a, b] }] }.
 * `symbols` and `formulaName` let the formula read like the slide, e.g.
 * "Material Advantage = 1 × [(# W pawns) − (# B pawns)]"; they default to A, B and "Score".
 * 防御性地读取组件配置：缺失或错误的字段都换成安全的默认值。symbols 与 formulaName 让公式和课件写法一致，
 * 默认分别为 A、B 和 "Score"。
 */
export function normalizeHeuristicConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const players = Array.isArray(source.players) ? source.players : [];
  const features = Array.isArray(source.features) ? source.features : [];
  return {
    title: toBi(source.title, { zh: '启发式打分', en: 'Heuristic score' }),
    players: [
      toBi(players[0], { zh: '玩家 A', en: 'Player A' }),
      toBi(players[1], { zh: '玩家 B', en: 'Player B' }),
    ],
    symbols: readSymbols(source.symbols),
    formulaName: readFormulaName(source.formulaName),
    features: features
      .filter((feature) => feature && typeof feature === 'object')
      .slice(0, MAX_FEATURES)
      .map((feature, index) => {
        const counts = Array.isArray(feature.counts) ? feature.counts : [];
        return {
          id: `feature-${index}`,
          name: toBi(feature.name, { zh: `特征 ${index + 1}`, en: `Feature ${index + 1}` }),
          weight: clampWeight(feature.weight, 1),
          counts: [clampCount(counts[0], 0), clampCount(counts[1], 0)],
        };
      }),
  };
}

export function termValue({ weight, counts }) {
  return roundNumber(weight * (counts[0] - counts[1]));
}

export function totalScore(features) {
  return roundNumber(features.reduce((sum, feature) => sum + termValue(feature), 0));
}

/**
 * Display text with a true minus sign; `signed` adds "+" to positive numbers ("+4").
 * 数字的显示文本，负号用真正的减号；signed 时正数前加“+”（如“+4”）。
 */
export function formatNumber(value, { signed = false, digits = 2 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '?';
  const rounded = roundNumber(value, digits);
  const magnitude = String(Math.abs(rounded));
  if (rounded < 0) return `${MINUS}${magnitude}`;
  return signed && rounded > 0 ? `+${magnitude}` : magnitude;
}

function shownWeight(weight) {
  return weight < 0 ? `(${formatNumber(weight)})` : formatNumber(weight);
}

/**
 * One term with the counts substituted: "1 × (8 − 7)"; a negative weight is bracketed: "(−2) × (3 − 1)".
 * 代入数量后的一项：“1 × (8 − 7)”；负权重加括号：“(−2) × (3 − 1)”。
 */
export function termExpression({ weight, counts }) {
  return `${shownWeight(weight)} ${TIMES} (${formatNumber(counts[0])} ${MINUS} ${formatNumber(counts[1])})`;
}

/**
 * One term written like the slide formula, before any number is filled in:
 * "1 × [(# W pawns) − (# B pawns)]". Uses the English feature name, as the exam does.
 * 按课件公式的样子写出一项（还没代入数字）：“1 × [(# W pawns) − (# B pawns)]”；和考试一样使用英文特征名。
 */
export function symbolicTerm({ weight, name }, symbols = DEFAULT_SYMBOLS) {
  const label = (name && (name.en || name.zh)) || 'feature';
  return `${shownWeight(weight)} ${TIMES} [(# ${symbols[0]} ${label}) ${MINUS} (# ${symbols[1]} ${label})]`;
}

/**
 * Joins term values as a sum, turning "+ −3" into "− 3": "1 + 0 − 3 + 5".
 * 把各项的值连成加法式，“+ −3”写成“− 3”：“1 + 0 − 3 + 5”。
 */
export function joinSum(values) {
  if (!values.length) return '0';
  return values.map((value, index) => {
    const rounded = roundNumber(value, 2);
    if (index === 0) return formatNumber(rounded);
    return rounded < 0 ? `${MINUS} ${formatNumber(-rounded)}` : `+ ${formatNumber(rounded)}`;
  }).join(' ');
}

/**
 * The whole calculation in four lines, from the slide formula down to the score, e.g.
 *   Score = 1 × [(# A pawns) − (# B pawns)] + 3 × [(# A knights) − (# B knights)]
 *   = 1 × (8 − 7) + 3 × (2 − 2)
 *   = 1 + 0
 *   = +1
 * 从课件公式一直算到分数的四行算式。
 */
export function formulaLines(features, { name = DEFAULT_FORMULA_NAME, symbols = DEFAULT_SYMBOLS } = {}) {
  const join = (parts) => (parts.length ? parts.join(' + ') : '0');
  return {
    symbolic: `${name} = ${join(features.map((feature) => symbolicTerm(feature, symbols)))}`,
    substituted: `= ${join(features.map(termExpression))}`,
    terms: `= ${joinSum(features.map(termValue))}`,
    total: `= ${formatNumber(totalScore(features), { signed: true })}`,
  };
}

/**
 * "positive" (good for player A), "negative" (good for player B) or "zero" (equal position).
 * “positive”对 A 有利，“negative”对 B 有利，“zero”双方一样好。
 */
export function scoreTone(total) {
  const rounded = roundNumber(total, 2);
  if (rounded > 0) return 'positive';
  if (rounded < 0) return 'negative';
  return 'zero';
}

export function exceedsRewardRange(total) {
  return Math.abs(roundNumber(total, 2)) >= REWARD_LIMIT;
}

/**
 * Share of an advantage bar given to player A: 0.5 at 0, approaching 1 (or 0) as the score
 * grows (or falls). tanh keeps small scores visible and large ones inside the bar.
 * 优势条中属于 A 的比例：分数为 0 时是 0.5，分数越大越接近 1（越小越接近 0）。
 * 用 tanh 让小分数也看得见，大分数也不会超出条的范围。
 */
export function advantageShare(total, scale = 10) {
  if (!Number.isFinite(total)) return 0.5;
  return 0.5 + 0.5 * Math.tanh(total / scale);
}
