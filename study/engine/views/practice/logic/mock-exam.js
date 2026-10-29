/**
 * Mock-exam composer: N objective + M written questions from the chosen units, balanced across units,
 * reproducible from a seed, plus small helpers for the exam timer. A course may limit the objective
 * question types a paper uses (see mock-config.js).
 * 模拟考组卷：从所选单元抽 N 道客观题 + M 道主观题，在单元之间均衡分配，可凭种子复现；另含计时器小工具。
 * 课程可以限定试卷使用的客观题题型（见 mock-config.js）。
 */
import { shuffleWith } from '../../../core/util/random.js';
import { OBJECTIVE_TYPES, isObjectiveType, isWrittenType } from './question-types.js';
import { createRng } from './rng.js';

export const MOCK_DEFAULTS = Object.freeze({ objectiveCount: 20, writtenCount: 3, minutes: 60 });
export const MOCK_LIMITS = Object.freeze({ objectiveMax: 60, writtenMax: 10, minutesMax: 180 });

// Seconds left at which the paper announces the remaining time once. 剩余时间到这些秒数时各提醒一次。
export const TIMER_MILESTONES = Object.freeze([600, 300, 60]);

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * Builder input -> safe settings (counts and minutes clamped, units de-duplicated); missing or invalid
 * values take `defaults` (a course's own defaults, MOCK_DEFAULTS when not given).
 * 组卷输入的规范化（题量与时间限定在范围内，单元去重）；缺失或无效的值取 defaults（课程自己的默认值，未提供时为 MOCK_DEFAULTS）。
 */
export function normalizeMockSettings({ units = [], objectiveCount, writtenCount, minutes } = {}, defaults = MOCK_DEFAULTS) {
  return {
    units: [...new Set((Array.isArray(units) ? units : []).filter((id) => typeof id === 'string' && id))],
    objectiveCount: clampInt(objectiveCount, 0, MOCK_LIMITS.objectiveMax, defaults.objectiveCount),
    writtenCount: clampInt(writtenCount, 0, MOCK_LIMITS.writtenMax, defaults.writtenCount),
    minutes: clampInt(minutes, 0, MOCK_LIMITS.minutesMax, defaults.minutes),
  };
}

// The objective types a paper may use: the objective types listed in `objectiveTypes`, or every one
// when no list is given.
// 试卷可用的客观题题型：objectiveTypes 中列出的客观题题型；没有给出列表时为全部客观题题型。
function allowedObjectiveTypes(objectiveTypes) {
  return new Set(Array.isArray(objectiveTypes) ? objectiveTypes.filter(isObjectiveType) : OBJECTIVE_TYPES);
}

/**
 * Splits `total` across keys as evenly as their capacities allow (round robin, so a small unit that
 * runs out passes its share on). Ties for the remainder are broken by the shuffled key order.
 * 在各单元之间尽量平均地分配 total（轮流发题；题少的单元发完后，余量转给其他单元）。余数的归属由打乱后的顺序决定。
 * Returns Map(key -> count). 返回 Map(key -> 数量)。
 */
export function allocateBalanced(capacities, total, random = Math.random) {
  const list = (Array.isArray(capacities) ? capacities : [])
    .map(({ key, available }) => ({ key, available: Math.max(0, Math.floor(Number(available) || 0)) }));
  const counts = new Map(list.map(({ key }) => [key, 0]));
  let remaining = Math.max(0, Math.floor(Number(total) || 0));
  let active = shuffleWith(list.filter(({ available }) => available > 0), random);
  while (remaining > 0 && active.length) {
    for (const { key, available } of active) {
      if (remaining === 0) break;
      if (counts.get(key) < available) {
        counts.set(key, counts.get(key) + 1);
        remaining -= 1;
      }
    }
    active = active.filter(({ key, available }) => counts.get(key) < available);
  }
  return counts;
}

/**
 * How many objective / written questions each chosen unit offers; objective questions count only when
 * their type is in `objectiveTypes` (every objective type when not given).
 * 每个所选单元可用的客观题、主观题数量；客观题只统计 objectiveTypes 中的题型（未提供时为全部客观题题型）。
 */
export function mockAvailability(questions, units, { objectiveTypes } = {}) {
  const allowed = allowedObjectiveTypes(objectiveTypes);
  const chosen = new Set(Array.isArray(units) ? units : []);
  const perUnit = new Map([...chosen].map((id) => [id, { objective: 0, written: 0 }]));
  const seen = new Set();
  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question || seen.has(question.id) || !chosen.has(question.unitId)) continue;
    seen.add(question.id);
    const entry = perUnit.get(question.unitId);
    if (allowed.has(question.type)) entry.objective += 1;
    else if (isWrittenType(question.type)) entry.written += 1;
  }
  let objective = 0;
  let written = 0;
  for (const entry of perUnit.values()) {
    objective += entry.objective;
    written += entry.written;
  }
  return { objective, written, perUnit };
}

/**
 * Composes a paper. Objective questions come first, then written ones; inside each part questions
 * follow the unit order given in `units` and then the bank order, so a built paper never reshuffles.
 * Objective questions are drawn only from `objectiveTypes` (every objective type when not given).
 * 组卷：先客观题后主观题；每部分内部按 units 的单元顺序、再按题库顺序排列，组好的试卷顺序固定不变。
 * 客观题只从 objectiveTypes 的题型中抽取（未提供时为全部客观题题型）。
 */
export function composeMockExam(questions, { units = [], objectiveCount = MOCK_DEFAULTS.objectiveCount, writtenCount = MOCK_DEFAULTS.writtenCount, objectiveTypes, seed = 1 } = {}) {
  const random = createRng(seed);
  const allowed = allowedObjectiveTypes(objectiveTypes);
  const unitOrder = [...new Set(Array.isArray(units) ? units : [])];
  const unitIndex = new Map(unitOrder.map((id, index) => [id, index]));
  const bankIndex = new Map();
  const pools = new Map(unitOrder.map((id) => [id, { objective: [], written: [] }]));

  (Array.isArray(questions) ? questions : []).forEach((question, index) => {
    if (!question || typeof question.id !== 'string' || bankIndex.has(question.id)) return;
    const pool = pools.get(question.unitId);
    if (!pool) return;
    bankIndex.set(question.id, index);
    if (allowed.has(question.type)) pool.objective.push(question);
    else if (isWrittenType(question.type)) pool.written.push(question);
  });

  const byPaperOrder = (a, b) => (unitIndex.get(a.unitId) - unitIndex.get(b.unitId)) || (bankIndex.get(a.id) - bankIndex.get(b.id));

  function pick(kind, requested) {
    const allocation = allocateBalanced(
      unitOrder.map((id) => ({ key: id, available: pools.get(id)[kind].length })), requested, random);
    const chosen = unitOrder.flatMap((id) => shuffleWith(pools.get(id)[kind], random).slice(0, allocation.get(id) || 0));
    return { chosen: chosen.sort(byPaperOrder), allocation };
  }

  const objectiveTarget = Math.max(0, Math.floor(Number(objectiveCount) || 0));
  const writtenTarget = Math.max(0, Math.floor(Number(writtenCount) || 0));
  const objective = pick('objective', objectiveTarget);
  const written = pick('written', writtenTarget);

  const allocation = {};
  for (const id of unitOrder) {
    allocation[id] = { objective: objective.allocation.get(id) || 0, written: written.allocation.get(id) || 0 };
  }
  const objectiveIds = objective.chosen.map((question) => question.id);
  const writtenIds = written.chosen.map((question) => question.id);
  return {
    seed,
    units: unitOrder,
    objectiveIds,
    writtenIds,
    questionIds: [...objectiveIds, ...writtenIds],
    allocation,
    shortfall: {
      objective: Math.max(0, objectiveTarget - objectiveIds.length),
      written: Math.max(0, writtenTarget - writtenIds.length),
    },
  };
}

/** Whole seconds left before `endAt` (ms timestamp), never negative. 距离结束还剩的整秒数（不为负）。 */
export function remainingSeconds(endAt, now = Date.now()) {
  if (!Number.isFinite(endAt)) return null;
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

/**
 * The milestone crossed between two timer readings (e.g. 301 s -> 299 s gives 300), or null.
 * 两次读数之间跨过的提醒点（例如 301 秒到 299 秒返回 300），没有则返回 null。
 */
export function crossedMilestone(previousSeconds, currentSeconds, milestones = TIMER_MILESTONES) {
  if (!Number.isFinite(previousSeconds) || !Number.isFinite(currentSeconds)) return null;
  const crossed = milestones.filter((mark) => previousSeconds > mark && currentSeconds <= mark);
  return crossed.length ? Math.min(...crossed) : null;
}
