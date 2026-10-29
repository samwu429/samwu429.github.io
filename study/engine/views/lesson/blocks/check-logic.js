/**
 * DOM-free rules of the inline quick check: answer validation and the verdict (option letters come
 * from core/util/format.js).
 * 课内小测验的纯逻辑（不依赖 DOM）：答案校验与对错判定（选项字母见 core/util/format.js）。
 */

/**
 * The answer index when it points at a real option, otherwise null (malformed content).
 * 答案下标指向真实选项时返回该下标，否则返回 null（内容有误）。
 */
export function answerIndex(answer, optionCount) {
  return Number.isInteger(answer) && answer >= 0 && answer < optionCount ? answer : null;
}

/**
 * Verdict for a choice: "correct", "wrong", or "unknown" when the content has no valid answer.
 * 判定一次选择：correct 正确、wrong 错误；内容没有有效答案时为 unknown。
 */
export function judgeChoice(answer, chosen) {
  if (answer === null || answer === undefined) return 'unknown';
  return answer === chosen ? 'correct' : 'wrong';
}

/**
 * Display state of every option after a choice: the right answer is always revealed, a wrong pick
 * is marked, and the remaining options fade.
 * 作答后每个选项的显示状态：总是标出正确答案，选错的选项单独标记，其余选项淡化。
 */
export function optionStates(answer, chosen, optionCount) {
  return Array.from({ length: Math.max(0, optionCount) }, (_, index) => {
    if (answer !== null && answer !== undefined && index === answer) return 'correct';
    if (index === chosen) return answer === null || answer === undefined ? 'chosen' : 'wrong';
    return 'dimmed';
  });
}
