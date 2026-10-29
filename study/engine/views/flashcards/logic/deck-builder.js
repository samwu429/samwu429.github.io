/**
 * Builds a flashcard deck from glossary terms: unit filter, "only unfamiliar", size limit and order.
 * 根据术语生成闪卡卡组：单元筛选、“只练不熟的”、张数上限与顺序。
 *
 * DOM-free; randomness is injectable so tests stay deterministic.
 * 不依赖 DOM；随机函数可注入，测试结果可复现。
 */
import { shuffleWith } from '../../../core/util/random.js';

/** Statuses stored through context.progress.setFlashcard(). 通过 context.progress.setFlashcard() 保存的状态。 */
export const STATUS = Object.freeze({ KNOWN: 'known', LEARNING: 'learning' });

/**
 * Terms that belong to at least one of the given units; an empty unit list keeps every term.
 * 返回至少属于所选单元之一的术语；单元列表为空时保留全部术语。
 */
export function termsInUnits(terms, units = []) {
  const list = (Array.isArray(terms) ? terms : []).filter((term) => term && typeof term.id === 'string' && term.id);
  const selected = new Set(units || []);
  if (!selected.size) return list;
  return list.filter((term) => Array.isArray(term.units) && term.units.some((unitId) => selected.has(unitId)));
}

/**
 * Counts terms by stored status: known, learning (marked "Again" before) and fresh (never rated).
 * 按已保存的状态统计术语：known 已认识、learning 不熟过、fresh 从未评价。
 */
export function statusCounts(terms, statusOf = () => null) {
  let known = 0;
  let learning = 0;
  const list = Array.isArray(terms) ? terms : [];
  for (const term of list) {
    const status = statusOf(term.id);
    if (status === STATUS.KNOWN) known += 1;
    else if (status === STATUS.LEARNING) learning += 1;
  }
  return { total: list.length, known, learning, fresh: list.length - known - learning };
}

/**
 * Returns the ordered term ids of a new deck.
 *   units          - unit ids to include (empty = all)
 *   onlyUnfamiliar - drop cards already marked "known"
 *   statusOf       - (termId) => 'known' | 'learning' | null
 *   size           - maximum number of cards (0 or Infinity = no limit)
 *   shuffle        - random order instead of course order
 * When the size limit cuts the deck, cards that need work win: learning first, then fresh, then known.
 * 返回新卡组中按顺序排列的术语 id。参数：units 包含的单元（空 = 全部）；onlyUnfamiliar 去掉已认识的卡；
 * statusOf 查询状态；size 张数上限（0 或 Infinity 表示不限）；shuffle 随机顺序（否则按课程顺序）。
 * 张数上限截断卡组时，优先保留需要练的卡：先“不熟过”，再“没学过”，最后“已认识”。
 */
export function buildDeck(terms, {
  units = [],
  onlyUnfamiliar = false,
  statusOf = () => null,
  size = 0,
  shuffle = true,
  random = Math.random,
} = {}) {
  const seen = new Set();
  let pool = termsInUnits(terms, units).filter((term) => {
    if (seen.has(term.id)) return false;
    seen.add(term.id);
    return true;
  });
  if (onlyUnfamiliar) pool = pool.filter((term) => statusOf(term.id) !== STATUS.KNOWN);

  const ordered = shuffle ? shuffleWith(pool, random) : pool;
  const limit = Number.isFinite(size) && size > 0 ? Math.floor(size) : Infinity;
  if (ordered.length <= limit) return ordered.map((term) => term.id);

  const courseIndex = new Map(pool.map((term, index) => [term.id, index]));
  const chosen = ordered
    .map((term, position) => ({ term, position, priority: priorityOf(statusOf(term.id)) }))
    .sort((a, b) => a.priority - b.priority || a.position - b.position)
    .slice(0, limit)
    .map((item) => item.term);
  // Re-mix after picking so the learning cards are not all bunched at the start.
  // 选完之后重新打乱，避免“不熟过”的卡全部挤在开头。
  const finalOrder = shuffle
    ? shuffleWith(chosen, random)
    : chosen.sort((a, b) => courseIndex.get(a.id) - courseIndex.get(b.id));
  return finalOrder.map((term) => term.id);
}

/**
 * Snapshot of the stored flashcard status of every given term id: Map(termId -> status | null).
 * Reads all statuses at once with progress.flashcards() when possible instead of one read per term.
 * 读取给定术语的闪卡状态快照：Map(术语 id -> 状态或 null)。尽量用 progress.flashcards() 一次读出全部状态，而不是每个术语各读一次。
 */
export function readStatuses(progress, termIds) {
  const statuses = new Map();
  let all = null;
  try {
    const stored = progress && typeof progress.flashcards === 'function' ? progress.flashcards() : undefined;
    if (stored !== undefined) all = stored && typeof stored === 'object' ? stored : {};
  } catch {
    all = null;
  }
  for (const termId of termIds || []) {
    let record = null;
    if (all) {
      record = Object.prototype.hasOwnProperty.call(all, termId) ? all[termId] : null;
    } else if (progress && typeof progress.flashcard === 'function') {
      record = progress.flashcard(termId);
    }
    statuses.set(termId, record && typeof record.status === 'string' ? record.status : null);
  }
  return statuses;
}

function priorityOf(status) {
  if (status === STATUS.LEARNING) return 0;
  if (status === STATUS.KNOWN) return 2;
  return 1;
}
