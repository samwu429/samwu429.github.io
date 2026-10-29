/**
 * Grading for every question type of CONTENT_SPEC 4.3. Responses are plain values:
 *   mcq -> option index, multi -> array of option indices, tf -> boolean,
 *   calc -> the typed text (or a number), short/long -> { text, covered: ticked point indices }.
 * 按 CONTENT_SPEC 4.3 为每种题型判分。作答都是简单值：单选为选项下标，多选为下标数组，判断为布尔值，
 * 计算为输入的文字（或数字），简答/论述为 { text, covered: 自评时勾选的要点下标 }。
 *
 * Every grader tolerates malformed content and returns { type, answered, correct, ... }.
 * 每个判分函数都能容忍格式有误的内容，统一返回 { type, answered, correct, ... }。
 */
import { optionLetter } from '../../../core/util/format.js';
import { isWrittenType, scoringPoints } from './question-types.js';

// Relative slack for floating-point noise such as 0.1 + 0.2. 浮点误差（例如 0.1 + 0.2）的相对容差。
const EPSILON = 1e-9;

const MINUS_SIGNS = /[‐-―−﹘﹣－]/g;
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/;
const THOUSANDS = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const DECIMAL_COMMA = /^[+-]?\d+,\d+$/;
const FRACTION = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\/([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/;
const LEADING_NOISE = /^(?:=|≈|~|approx\.?|about)+/;
const TRAILING_UNIT = /[a-z%㐀-鿿]+$/u;
const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[㐀-鿿]/g;
const CJK = /[㐀-鿿]/;

function optionCount(question) {
  return Array.isArray(question?.options) ? question.options.length : 0;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) return parseNumber(value);
  return null;
}

function normalizeTyped(raw) {
  // A Chinese input method types the ideographic full stop for "." 中文输入法会把小数点打成句号“。”。
  return raw.normalize('NFKC').replace(MINUS_SIGNS, '-').replace(/。/g, '.').replace(/\s+/g, '').toLowerCase();
}

/**
 * Reads a number the way a learner might type it: "87.5", "87.5%", "-14 pp", "180 cm²", "1,000", "87,5",
 * "7/8", full-width digits from a Chinese keyboard, or a Unicode minus sign. The question's own unit
 * is removed first, so units containing digits or slashes still work. Returns null if unreadable.
 * 按学习者可能的输入方式读出数字：带百分号或单位、千分位、逗号小数、分数、中文输入法的全角数字或
 * Unicode 负号都能识别。会先去掉题目自带的单位，所以含数字或斜杠的单位也没问题；无法识别时返回 null。
 */
export function parseNumber(raw, { unit = '' } = {}) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let text = normalizeTyped(raw);
  const unitText = typeof unit === 'string' ? normalizeTyped(unit) : '';
  if (unitText && text.length > unitText.length && text.endsWith(unitText)) text = text.slice(0, -unitText.length);
  text = text.replace(LEADING_NOISE, '').replace(TRAILING_UNIT, '');
  if (!text) return null;
  const fraction = FRACTION.exec(text);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : numerator / denominator;
  }
  if (THOUSANDS.test(text)) text = text.replace(/,/g, '');
  else if (DECIMAL_COMMA.test(text)) text = text.replace(',', '.');
  if (!PLAIN_NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Display form of a number without float noise: 86.50000001 -> "86.5". 去掉浮点噪声的显示形式。 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Appends a calc unit: "87.5%" or "-14 pp". 拼接计算题单位。 */
export function withUnit(text, unit) {
  const clean = typeof unit === 'string' ? unit.trim() : '';
  if (!clean || !text) return text;
  return clean === '%' ? `${text}%` : `${text} ${clean}`;
}

/** Sorted, de-duplicated correct indices of a multi question. 多选题正确选项下标（排序去重）。 */
export function correctIndices(question) {
  const raw = Array.isArray(question?.answer) ? question.answer : [question?.answer];
  return [...new Set(raw.filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b);
}

/** Expected value of a true/false question, accepting "true"/"false" strings; null if missing. 判断题标准答案。 */
export function expectedBoolean(question) {
  const answer = question?.answer;
  if (typeof answer === 'boolean') return answer;
  if (typeof answer === 'string') {
    const text = answer.trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
  }
  return null;
}

export function gradeMcq(question, choice) {
  const expected = Number.isInteger(question?.answer) ? question.answer : null;
  const answered = Number.isInteger(choice) && choice >= 0 && choice < optionCount(question);
  return {
    type: 'mcq',
    answered,
    correct: answered && expected !== null && choice === expected,
    choice: answered ? choice : null,
    expected,
  };
}

/**
 * Select-all-that-apply: correct only on an exact set match; hits, misses and extras explain partial work.
 * 多选题：只有选项集合完全一致才算对；hits / missed / extra 说明部分正确的情况。
 */
export function gradeMulti(question, selection) {
  const expected = correctIndices(question);
  const count = optionCount(question);
  const picked = Array.isArray(selection) ? selection : [];
  const selected = [...new Set(picked.filter((index) => Number.isInteger(index) && index >= 0 && index < count))]
    .sort((a, b) => a - b);
  const expectedSet = new Set(expected);
  const selectedSet = new Set(selected);
  const hits = selected.filter((index) => expectedSet.has(index));
  const extra = selected.filter((index) => !expectedSet.has(index));
  const missed = expected.filter((index) => !selectedSet.has(index));
  const answered = selected.length > 0;
  return {
    type: 'multi',
    answered,
    correct: answered && expected.length > 0 && extra.length === 0 && missed.length === 0,
    selected,
    expected,
    hits,
    missed,
    extra,
    hitRatio: expected.length ? hits.length / expected.length : 0,
  };
}

export function gradeTf(question, value) {
  const expected = expectedBoolean(question);
  const answered = typeof value === 'boolean';
  return {
    type: 'tf',
    answered,
    correct: answered && expected !== null && value === expected,
    value: answered ? value : null,
    expected,
  };
}

/**
 * Numeric answer within an absolute tolerance. A wrong answer may carry a hint about the likely slip:
 *   'sign' (subtracted in the wrong order), 'ratio-for-percent' (0.875 instead of 87.5%),
 *   'close' (rounding), 'unreadable' (not a number).
 * 计算题：与标准答案之差不超过绝对容差即为正确。答错时附带可能的失误提示：
 *   sign 正负号反了；ratio-for-percent 写成了小数比例；close 四舍五入问题；unreadable 不是数字。
 */
export function gradeCalc(question, raw) {
  const expected = toNumber(question?.answer);
  const tolerance = Math.abs(toNumber(question?.tolerance) ?? 0);
  const unit = typeof question?.unit === 'string' ? question.unit.trim() : '';
  const value = parseNumber(raw, { unit });
  const answered = value !== null;
  const within = (candidate) => expected !== null
    && Math.abs(candidate - expected) <= tolerance + EPSILON * Math.max(1, Math.abs(expected));
  const correct = answered && within(value);

  let hint = null;
  if (!answered && typeof raw === 'string' && raw.trim()) {
    hint = 'unreadable';
  } else if (answered && !correct && expected !== null) {
    if (expected !== 0 && within(-value)) hint = 'sign';
    else if ((unit === '%' || unit === 'pp') && value !== 0 && within(value * 100)) hint = 'ratio-for-percent';
    else if (tolerance > 0 && Math.abs(value - expected) <= tolerance * 5) hint = 'close';
  }
  return { type: 'calc', answered, correct, value: answered ? value : null, expected, tolerance, unit, hint };
}

/**
 * Self-assessed written answer: correct once the learner covered at least half of the scoring points.
 * Ticked points only count when something was written, so a blank answer is never correct.
 * 自评的主观题：勾选的要点达到一半或以上即算答对。只有写了答案，勾选的要点才算数，空白答案永远不算对。
 */
export function gradeWritten(question, covered = [], { text = '' } = {}) {
  const total = scoringPoints(question).length;
  const content = typeof text === 'string' ? text : '';
  const answered = content.trim().length > 0;
  const picked = answered && Array.isArray(covered) ? covered : [];
  const indices = [...new Set(picked.filter((index) => Number.isInteger(index) && index >= 0 && index < total))]
    .sort((a, b) => a - b);
  const coveredCount = indices.length;
  return {
    type: isWrittenType(question?.type) ? question.type : 'short',
    answered,
    correct: coveredCount > 0 && coveredCount * 2 >= total,
    covered: indices,
    coveredCount,
    total,
    needed: Math.ceil(total / 2),
    words: countWords(content),
  };
}

/** Dispatches to the grader of the question's type. 按题型分派判分函数。 */
export function gradeQuestion(question, response) {
  switch (question?.type) {
    case 'mcq': return gradeMcq(question, response);
    case 'multi': return gradeMulti(question, response);
    case 'tf': return gradeTf(question, response);
    case 'calc': return gradeCalc(question, response);
    case 'short':
    case 'long':
      return gradeWritten(question, response?.covered, { text: response?.text });
    default:
      return { type: question?.type ?? null, answered: false, correct: false, unsupported: true };
  }
}

/** True when the learner has given something gradable. 学习者是否已经作答。 */
export function hasResponse(question, response) {
  switch (question?.type) {
    case 'mcq': return Number.isInteger(response);
    case 'multi': return Array.isArray(response) && response.length > 0;
    case 'tf': return typeof response === 'boolean';
    case 'calc': return typeof response === 'number' ? Number.isFinite(response) : typeof response === 'string' && response.trim().length > 0;
    case 'short':
    case 'long':
      return Boolean(response && typeof response.text === 'string' && response.text.trim());
    default:
      return false;
  }
}

/** The correct answer in exam notation: "B", "A, C, D", "True", "87.5%". 用考试记法表示的正确答案。 */
export function correctAnswerText(question) {
  switch (question?.type) {
    case 'mcq': return Number.isInteger(question.answer) ? optionLetter(question.answer) : '';
    case 'multi': return correctIndices(question).map(optionLetter).join(', ');
    case 'tf': {
      const expected = expectedBoolean(question);
      if (expected === null) return '';
      return expected ? 'True' : 'False';
    }
    case 'calc': {
      const expected = toNumber(question.answer);
      return expected === null ? '' : withUnit(formatNumber(expected), question.unit);
    }
    default:
      return '';
  }
}

/** English words (and single CJK characters) in a written answer. 统计英文单词数（中文按字计）。 */
export function countWords(text) {
  return (String(text ?? '').match(WORD) || []).length;
}

/** True if the text contains Chinese characters; exam answers must be in English. 是否含中文字符。 */
export function containsChinese(text) {
  return CJK.test(String(text ?? ''));
}
