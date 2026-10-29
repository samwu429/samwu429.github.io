/**
 * One flashcard round as an immutable queue: "Again" sends the card a few places back,
 * "Know" retires it. The round ends when every card has been marked "Know" once.
 * 用不可变队列表示一轮闪卡：“不熟”把当前卡往后放几张，“认识”让它离开本轮；
 * 每张卡都被标记过一次“认识”时，本轮结束。
 *
 * DOM-free; every function returns a new session object and never mutates its input.
 * 不依赖 DOM；每个函数都返回新的会话对象，从不修改传入的对象。
 */

export const RATING = Object.freeze({ AGAIN: 'again', KNOW: 'know' });

/** Number of other cards shown before an "Again" card comes back. “不熟”的卡回来之前先出现的其他卡片数。 */
export const DEFAULT_GAP = 3;

/**
 * Starts a round. Duplicate and non-string ids are dropped; the first id is shown first.
 * 开始一轮。重复或非字符串的 id 会被丢弃；第一个 id 最先出现。
 */
export function createSession(cardIds) {
  const deck = [...new Set((Array.isArray(cardIds) ? cardIds : []).filter((id) => typeof id === 'string' && id))];
  return { deck, queue: [...deck], known: [], againCounts: {}, reviews: 0 };
}

export function currentCard(session) {
  return session && session.queue.length ? session.queue[0] : null;
}

export function isFinished(session) {
  return !session || session.queue.length === 0;
}

/**
 * Where an "Again" card is re-inserted among the cards still waiting: after `gap` of them,
 * or at the end when fewer remain.
 * “不熟”的卡重新插入等待队列的位置：排在 `gap` 张之后，剩余不足时放到最后。
 */
export function requeueIndex(waitingCount, gap = DEFAULT_GAP) {
  const safeGap = Number.isFinite(gap) && gap >= 1 ? Math.floor(gap) : DEFAULT_GAP;
  return Math.min(safeGap, Math.max(0, Math.floor(waitingCount) || 0));
}

/**
 * Applies a rating to the current card and returns the next session state.
 * Unknown ratings and finished sessions are returned unchanged.
 * 对当前卡片应用评价并返回新的会话状态；未知评价或已结束的会话原样返回。
 */
export function rateCard(session, rating, { gap = DEFAULT_GAP } = {}) {
  if (isFinished(session)) return session;
  const [cardId, ...waiting] = session.queue;
  if (rating === RATING.KNOW) {
    return {
      ...session,
      queue: waiting,
      known: [...session.known, cardId],
      reviews: session.reviews + 1,
    };
  }
  if (rating === RATING.AGAIN) {
    const index = requeueIndex(waiting.length, gap);
    return {
      ...session,
      queue: [...waiting.slice(0, index), cardId, ...waiting.slice(index)],
      againCounts: { ...session.againCounts, [cardId]: againCount(session, cardId) + 1 },
      reviews: session.reviews + 1,
    };
  }
  return session;
}

/**
 * Times the card was marked "Again" in this round.
 * 本轮中这张卡被标记“不熟”的次数。
 */
export function againCount(session, cardId) {
  // Own-property check, so ids such as "constructor" never read Object.prototype.
  // 只读自身属性，避免 "constructor" 这类 id 读到 Object.prototype 上的成员。
  const counts = session ? session.againCounts : null;
  return counts && Object.prototype.hasOwnProperty.call(counts, cardId) ? counts[cardId] : 0;
}

/**
 * Summary of a round, finished or ended early:
 *   total, known, remaining, neededAgain (cards marked "Again" at least once),
 *   firstTry (known without any "Again"), reviews (ratings given),
 *   missedIds (deck order) and reviewIds (missed or not yet known, deck order) for a follow-up round.
 * 一轮的小结（无论完成还是提前结束）：total 总数、known 已认识、remaining 未完成、
 * neededAgain 至少“不熟”过一次的卡、firstTry 一次就认识的卡、reviews 评价次数，
 * 以及供下一轮使用的 missedIds（按卡组顺序）和 reviewIds（不熟过或还没认识的卡）。
 */
export function sessionStats(session) {
  const deck = session ? session.deck : [];
  const knownSet = new Set(session ? session.known : []);
  const missedIds = deck.filter((cardId) => againCount(session, cardId) > 0);
  const missedSet = new Set(missedIds);
  const remaining = session ? new Set(session.queue).size : 0;
  return {
    total: deck.length,
    known: knownSet.size,
    remaining,
    neededAgain: missedIds.length,
    firstTry: [...knownSet].filter((cardId) => !missedSet.has(cardId)).length,
    reviews: session ? session.reviews : 0,
    missedIds,
    reviewIds: deck.filter((cardId) => missedSet.has(cardId) || !knownSet.has(cardId)),
    finished: remaining === 0,
  };
}
