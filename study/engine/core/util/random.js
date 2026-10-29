/**
 * Shuffling shared by practice sessions, mock exams and flashcard decks.
 * 练习、模拟考与闪卡卡组共用的洗牌工具。
 */

/**
 * Returns a shuffled copy (Fisher-Yates) driven by `random`, a source of floats in [0, 1); the input
 * is not modified. A broken source (NaN, 1 or more) still yields a permutation.
 * 用 `random`（返回 [0, 1) 浮点数的随机源）做 Fisher-Yates 洗牌并返回副本，不修改原数组；随机源异常（NaN、大于等于 1）时仍得到一个排列。
 */
export function shuffleWith(items, random = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const roll = Number(random());
    const swap = Math.min(index, Math.max(0, Math.floor((Number.isFinite(roll) ? roll : 0) * (index + 1))));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
