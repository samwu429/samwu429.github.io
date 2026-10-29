/**
 * Question type catalogue of the practice system (CONTENT_SPEC 4.3), shared by grading, sessions and views.
 * 练习系统的题型目录（CONTENT_SPEC 4.3），供评分、组卷与视图共用。
 *
 * DOM-free so it runs under node --test. 不依赖 DOM，可直接用 node --test 测试。
 */

export const QUESTION_TYPES = Object.freeze(['mcq', 'multi', 'tf', 'calc', 'short', 'long']);
export const OBJECTIVE_TYPES = Object.freeze(['mcq', 'multi', 'tf', 'calc']);
export const WRITTEN_TYPES = Object.freeze(['short', 'long']);

export const TYPE_LABELS = Object.freeze({
  mcq: Object.freeze({ zh: '单选', en: 'Multiple choice' }),
  multi: Object.freeze({ zh: '多选', en: 'Select all' }),
  tf: Object.freeze({ zh: '判断', en: 'True / False' }),
  calc: Object.freeze({ zh: '计算', en: 'Calculation' }),
  short: Object.freeze({ zh: '简答', en: 'Short answer' }),
  long: Object.freeze({ zh: '论述', en: 'Long answer' }),
});

export function isKnownType(type) {
  return QUESTION_TYPES.includes(type);
}

export function isObjectiveType(type) {
  return OBJECTIVE_TYPES.includes(type);
}

export function isWrittenType(type) {
  return WRITTEN_TYPES.includes(type);
}

/**
 * A written question without scoring points is self-graded against one overall point.
 * 没有评分要点的主观题，用一条整体要点来自评。
 */
export const FALLBACK_POINT = Object.freeze({
  zh: '我的答案和参考答案讲的是同一个意思',
  en: 'My answer makes the same argument as the model answer.',
});

/**
 * Scoring points of a written question as Bi values; plain strings are treated as English.
 * 主观题的评分要点（双语对象）；纯字符串视为英文。
 */
export function scoringPoints(question) {
  const raw = Array.isArray(question?.points) ? question.points : [];
  const points = raw
    .map((point) => (typeof point === 'string' ? { en: point } : point))
    .filter((point) => point && typeof point === 'object' && (point.en || point.zh));
  return points.length ? points : [FALLBACK_POINT];
}

/**
 * Marks a question is worth: objective questions 1, written questions one per scoring point.
 * 每道题的分值：客观题 1 分，主观题每个评分要点 1 分。
 */
export function questionMarks(question) {
  return isWrittenType(question?.type) ? scoringPoints(question).length : 1;
}
