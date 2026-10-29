/**
 * Practice sessions from the question bank: query parsing, link building, filtering, ordering, limits.
 * 由题库生成练习：解析查询参数、生成链接、筛选、排序与数量限制。
 *
 * Route: #/practice/run?units=<ids|all>&types=<types|all>&count=<n>&mode=<ordered|random|mistakes>&ids=<question ids>
 * `ids` pins an explicit list (used by "retry the wrong ones"). `ids` 指定题目清单（用于“重练错题”）。
 * `unit=` is read as `units=`, because the glossary, flashcards and cheat sheet name their unit list that way.
 * `unit=` 按 `units=` 读取，因为术语表、闪卡和速记页的单元参数都叫这个名字。
 */
import { shuffleWith } from '../../../core/util/random.js';
import { isRouteId } from '../../../core/util/ids.js';
import { OBJECTIVE_TYPES, QUESTION_TYPES, WRITTEN_TYPES, isKnownType } from './question-types.js';

export const SESSION_MODES = Object.freeze(['ordered', 'random', 'mistakes']);
export const DEFAULT_RANDOM_COUNT = 20;
export const MAX_SESSION_COUNT = 200;

const TYPE_GROUPS = { objective: OBJECTIVE_TYPES, written: WRITTEN_TYPES };

function readParam(query, key) {
  if (!query) return null;
  if (typeof query.get === 'function') return query.get(key);
  return Object.hasOwn(query, key) ? query[key] : null;
}

function splitList(value) {
  return String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

/**
 * "lec01,lab02" -> ['lec01', 'lab02']; missing, empty, "all" or only invalid ids -> 'all'.
 * 解析单元列表；缺失、为空、为 all 或全是非法 id 时返回 'all'。
 */
export function parseUnits(value) {
  if (value === null || value === undefined) return 'all';
  const items = splitList(value);
  if (!items.length || items.includes('all')) return 'all';
  const valid = [...new Set(items.filter(isRouteId))];
  return valid.length ? valid : 'all';
}

/**
 * "mcq,tf" -> ['mcq', 'tf'] in catalogue order; "objective" and "written" expand to their groups.
 * 解析题型列表，按题型目录排序；objective（客观题）与 written（主观题）会展开成对应的题型。
 */
export function parseTypes(value) {
  if (value === null || value === undefined) return 'all';
  const items = splitList(value);
  if (!items.length || items.includes('all')) return 'all';
  const expanded = new Set(items.flatMap((item) => TYPE_GROUPS[item] || [item]).filter(isKnownType));
  const types = QUESTION_TYPES.filter((type) => expanded.has(type));
  return types.length && types.length < QUESTION_TYPES.length ? types : 'all';
}

/**
 * Positive integer capped at MAX_SESSION_COUNT, otherwise null (meaning "use the default").
 * 正整数且不超过上限；否则返回 null，表示使用默认题量。
 */
export function parseCount(value) {
  const count = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.min(count, MAX_SESSION_COUNT);
}

export function parseIds(value) {
  if (value === null || value === undefined) return null;
  const ids = [...new Set(splitList(value).filter(isRouteId))];
  return ids.length ? ids.slice(0, MAX_SESSION_COUNT) : null;
}

/**
 * Normalised session settings from URLSearchParams or a plain object.
 * 从 URLSearchParams 或普通对象得到规范化的练习设置。
 */
export function parseSessionQuery(query) {
  const mode = String(readParam(query, 'mode') ?? '').trim().toLowerCase();
  return {
    units: parseUnits(readParam(query, 'units') ?? readParam(query, 'unit')),
    types: parseTypes(readParam(query, 'types')),
    count: parseCount(readParam(query, 'count')),
    mode: SESSION_MODES.includes(mode) ? mode : 'ordered',
    ids: parseIds(readParam(query, 'ids')),
  };
}

/**
 * Route path (without "#") of a session; parseSessionQuery() reads it back unchanged.
 * 练习会话的路由路径（不含 #）；parseSessionQuery() 能原样读回。
 */
export function sessionPath({ units = 'all', types = 'all', count = null, mode = 'ordered', ids = null } = {}) {
  const unitList = Array.isArray(units) ? units.filter(isRouteId) : [];
  const typeList = Array.isArray(types) ? QUESTION_TYPES.filter((type) => types.includes(type)) : [];
  const idList = Array.isArray(ids) ? ids.filter(isRouteId) : [];
  const parts = [];
  if (idList.length) parts.push(`ids=${idList.join(',')}`);
  parts.push(`units=${unitList.length ? unitList.join(',') : 'all'}`);
  parts.push(`types=${typeList.length && typeList.length < QUESTION_TYPES.length ? typeList.join(',') : 'all'}`);
  const limit = parseCount(count);
  if (limit) parts.push(`count=${limit}`);
  parts.push(`mode=${SESSION_MODES.includes(mode) ? mode : 'ordered'}`);
  return `/practice/run?${parts.join('&')}`;
}

/**
 * Questions matching units / types / ids, in bank order; unknown types and duplicate ids are dropped.
 * 按单元、题型、题号筛选，保持题库顺序；未知题型与重复题号会被丢弃。
 */
export function filterQuestions(questions, { units = 'all', types = 'all', ids = null } = {}) {
  const unitSet = Array.isArray(units) ? new Set(units) : null;
  const typeSet = Array.isArray(types) ? new Set(types) : null;
  const idSet = Array.isArray(ids) ? new Set(ids) : null;
  const seen = new Set();
  const kept = [];
  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question || typeof question.id !== 'string' || seen.has(question.id) || !isKnownType(question.type)) continue;
    if (unitSet && !unitSet.has(question.unitId)) continue;
    if (typeSet && !typeSet.has(question.type)) continue;
    if (idSet && !idSet.has(question.id)) continue;
    seen.add(question.id);
    kept.push(question);
  }
  return kept;
}

/**
 * Builds the question list of a session.
 *   ordered  - bank order (or the order of `ids`), all questions unless `count` is set
 *   random   - shuffled with `random`, DEFAULT_RANDOM_COUNT unless `count` is set
 *   mistakes - only ids in `mistakes`, bank order
 * 生成练习题单：ordered 按题库顺序（或 ids 的顺序）；random 随机打乱，默认 20 题；mistakes 只练错题本里的题。
 */
export function buildSession(questions, settings = {}, { mistakes = [], random = Math.random } = {}) {
  const mode = SESSION_MODES.includes(settings.mode) ? settings.mode : 'ordered';
  let pool = filterQuestions(questions, settings);
  if (mode === 'mistakes') {
    const wrong = new Set(Array.isArray(mistakes) ? mistakes : []);
    pool = pool.filter((question) => wrong.has(question.id));
  }
  if (Array.isArray(settings.ids) && mode !== 'random') {
    const order = new Map(settings.ids.map((id, index) => [id, index]));
    pool = [...pool].sort((a, b) => order.get(a.id) - order.get(b.id));
  }
  if (mode === 'random') pool = shuffleWith(pool, random);
  const limit = parseCount(settings.count) ?? (mode === 'random' ? DEFAULT_RANDOM_COUNT : pool.length);
  return pool.slice(0, limit);
}
