/**
 * Pure helpers of the course home page: countdowns, unit grouping, the continue target and the branch map.
 * 课程首页的纯逻辑：考试倒计时、单元分组、继续学习目标与知识地图分组。
 *
 * Nothing here touches the DOM, so every function is covered by node tests.
 * 本模块不访问 DOM，所有函数都有 node 单元测试。
 */
import { toBi } from '../../core/text/bilingual.js';
import { daysUntil } from '../../core/util/format.js';
import { isRouteId } from '../../core/util/ids.js';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Below this Dice overlap an overview branch is treated as a thread across branches, not a match.
// Dice 重合度低于此值时，总览里的分支视为“贯穿多条主线的线索”，而不是某条主线。
const BRANCH_MATCH_THRESHOLD = 0.6;

export function parseIsoDate(value) {
  const match = ISO_DATE.exec(String(value ?? ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // Date silently rolls 2026-02-31 over to March, so the parts must survive the round trip.
  // Date 会把 2026-02-31 自动进位到三月，因此要求年月日原样往返。
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

/**
 * Short month-day label in both languages, e.g. { zh: '11月10日', en: 'Nov 10' }.
 * 双语的月日短标签，例如 { zh: '11月10日', en: 'Nov 10' }。
 */
export function monthDay(value) {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  return { zh: `${parts.month}月${parts.day}日`, en: `${MONTHS_EN[parts.month - 1]} ${parts.day}` };
}

/**
 * Countdown state and text for an ISO date: past, today or upcoming.
 * ISO 日期的倒计时状态与文字：已结束、今天或未来。
 */
export function countdown(value, now = new Date()) {
  if (!parseIsoDate(value)) return null;
  const days = daysUntil(value, now);
  if (days < 0) return { state: 'past', days, zh: '已结束', en: 'Done' };
  if (days === 0) return { state: 'today', days, zh: '就是今天', en: 'Today' };
  if (days === 1) return { state: 'upcoming', days, zh: '明天', en: 'Tomorrow' };
  return { state: 'upcoming', days, zh: `还有 ${days} 天`, en: `in ${days} days` };
}

/**
 * Dated assessments in calendar order; the first one not yet past is flagged as next.
 * 按日期排序的有日期考核；第一个尚未结束的标记为“下一个”。
 */
export function datedAssessments(assessments, now = new Date()) {
  const list = (Array.isArray(assessments) ? assessments : [])
    .filter((item) => item && typeof item === 'object' && parseIsoDate(item.date))
    .map((item) => ({ assessment: item, date: item.date, day: monthDay(item.date), countdown: countdown(item.date, now), isNext: false }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const next = list.find((entry) => entry.countdown.state !== 'past');
  if (next) next.isNext = true;
  return list;
}

export function totalWeight(assessments) {
  return (Array.isArray(assessments) ? assessments : []).reduce((sum, item) => {
    const weight = typeof item?.weight === 'number' ? item.weight : Number.NaN;
    return Number.isFinite(weight) ? sum + weight : sum;
  }, 0);
}

/**
 * Splits course units into lectures, labs and anything else; lectures and labs sorted by number.
 * 把课程单元分成讲课、实验与其他三组；讲课与实验按编号排序。
 */
export function splitUnits(units) {
  const byNumber = (a, b) => (Number(a.number) || 0) - (Number(b.number) || 0);
  const list = (Array.isArray(units) ? units : []).filter((unit) => unit && isRouteId(unit.id));
  return {
    lectures: list.filter((unit) => unit.kind === 'lecture').sort(byNumber),
    labs: list.filter((unit) => unit.kind === 'lab').sort(byNumber),
    others: list.filter((unit) => unit.kind !== 'lecture' && unit.kind !== 'lab'),
  };
}

export function sectionIdsOf(unit) {
  return Array.isArray(unit?.sectionIds) ? unit.sectionIds.filter((id) => typeof id === 'string') : [];
}

/**
 * Sums finished sections over all units, using the progress store's unitProgress(unitId, sectionIds).
 * 汇总所有单元已学完的小节数，依赖进度库的 unitProgress(unitId, sectionIds)。
 */
export function overallProgress(units, unitProgress) {
  return (Array.isArray(units) ? units : []).reduce((sum, unit) => {
    const sectionIds = sectionIdsOf(unit);
    if (!unit || !sectionIds.length) return sum;
    const { done, total } = unitProgress(unit.id, sectionIds);
    return { done: sum.done + done, total: sum.total + total };
  }, { done: 0, total: 0 });
}

/**
 * Resolves the last visited lesson into a link target, or null when it no longer exists.
 * 将上次访问记录解析为跳转目标；对应单元已不存在时返回 null。
 */
export function resolveContinue(lastVisited, units) {
  if (!lastVisited || typeof lastVisited !== 'object') return null;
  const unit = (Array.isArray(units) ? units : []).find((candidate) => candidate && candidate.id === lastVisited.unitId);
  if (!unit || !isRouteId(unit.id)) return null;
  const sectionId = isRouteId(lastVisited.sectionId) ? lastVisited.sectionId : null;
  return {
    unit,
    sectionId,
    href: sectionId ? `#/learn/${unit.id}/${sectionId}` : `#/learn/${unit.id}`,
    at: Number.isFinite(lastVisited.at) ? lastVisited.at : null,
  };
}

/**
 * Calendar-day distance from a timestamp to now, as "today" / "yesterday" / "N days ago".
 * 时间戳到现在相隔的自然日，表述为“今天 / 昨天 / N 天前”。
 */
export function relativeDay(timestamp, now = new Date()) {
  if (!Number.isFinite(timestamp)) return null;
  const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOf(now) - startOf(new Date(timestamp))) / DAY_MS);
  if (days < 0) return null;
  if (days === 0) return { zh: '今天', en: 'today' };
  if (days === 1) return { zh: '昨天', en: 'yesterday' };
  return { zh: `${days} 天前`, en: `${days} days ago` };
}

/**
 * Groups units by the course branches and attaches the overview's branch texts.
 * 按课程主线给单元分组，并挂上课程总览中的分支说明。
 *
 * Overview branches are matched by id first, then by how much their lesson lists overlap a course
 * branch (the overview is written separately and may use other ids). Unmatched overview branches,
 * such as ethics running through the whole course, become threads; units without a known branch
 * end up in `others`.
 * 先按 id 匹配，再按课程列表的重合度匹配（总览文件单独编写，id 可能不同）。匹配不上的分支（如贯穿全课的伦理）
 * 作为“线索”单独展示；没有已知主线的单元归入 others。
 */
export function buildBranchMap({ courseBranches, units, overviewBranches } = {}) {
  const unitList = (Array.isArray(units) ? units : []).filter((unit) => unit && isRouteId(unit.id));
  const unitById = new Map(unitList.map((unit) => [unit.id, unit]));
  const lessonsOf = (branch) => [...new Set(Array.isArray(branch?.lessons) ? branch.lessons : [])]
    .map((id) => unitById.get(id))
    .filter(Boolean);
  const fromOverview = (branch, index) => ({
    id: typeof branch.id === 'string' && branch.id ? branch.id : `branch-${index + 1}`,
    title: toBi(branch.title),
    summary: toBi(branch.summary),
    units: lessonsOf(branch),
  });
  const extras = (Array.isArray(overviewBranches) ? overviewBranches : [])
    .filter((branch) => branch && typeof branch === 'object' && !Array.isArray(branch));
  const declared = (Array.isArray(courseBranches) ? courseBranches : [])
    .filter((branch) => branch && typeof branch.id === 'string' && branch.id);

  const coveredIds = (groups) => new Set(groups.flatMap((group) => group.units.map((unit) => unit.id)));

  if (!declared.length) {
    const branches = extras.map(fromOverview);
    const covered = coveredIds(branches);
    return { branches, threads: [], others: unitList.filter((unit) => !covered.has(unit.id)) };
  }

  const groups = declared.map((branch) => ({
    id: branch.id,
    title: toBi(branch.title),
    summary: null,
    units: unitList.filter((unit) => unit.branch === branch.id),
  }));
  const matched = new Set();
  const attach = (group, branch) => {
    matched.add(group);
    group.summary = toBi(branch.summary);
    if (!group.title) group.title = toBi(branch.title);
  };

  const unmatched = [];
  for (const branch of extras) {
    const group = groups.find((candidate) => candidate.id === branch.id && !matched.has(candidate));
    if (group) attach(group, branch);
    else unmatched.push(branch);
  }

  const pairs = [];
  unmatched.forEach((branch, index) => {
    const lessonIds = new Set(lessonsOf(branch).map((unit) => unit.id));
    for (const group of groups) {
      if (matched.has(group) || !lessonIds.size || !group.units.length) continue;
      const overlap = group.units.filter((unit) => lessonIds.has(unit.id)).length;
      const score = (2 * overlap) / (lessonIds.size + group.units.length);
      if (score >= BRANCH_MATCH_THRESHOLD) pairs.push({ index, group, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score);
  const used = new Set();
  for (const { index, group } of pairs) {
    if (used.has(index) || matched.has(group)) continue;
    attach(group, unmatched[index]);
    used.add(index);
  }

  const threads = unmatched
    .map((branch, index) => ({ branch, index }))
    .filter(({ index }) => !used.has(index))
    .map(({ branch, index }) => fromOverview(branch, index))
    .filter((thread) => thread.title || thread.summary || thread.units.length);
  const covered = coveredIds(groups);
  return { branches: groups, threads, others: unitList.filter((unit) => !covered.has(unit.id)) };
}
