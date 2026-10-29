/**
 * Turns merged glossary terms into the filtered, ordered and grouped list the glossary page shows.
 * 把合并后的术语整理成术语表页面要显示的列表：筛选、排序并分组。
 *
 * DOM-free; the view only renders the groups returned by arrangeTerms().
 * 不依赖 DOM；视图只负责渲染 arrangeTerms() 返回的分组。
 */
import { buildSearchEntry, matchScore, normalizeText } from './term-search.js';

export const SORT_MODES = Object.freeze(['az', 'unit']);

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const LEADING_SYMBOLS = /^[^\p{L}\p{N}]+/u;

/**
 * Alphabetical sort key: normalised English name without leading quotes or symbols.
 * 字母排序键：去掉开头引号和符号后的归一化英文名。
 */
export function sortKey(text) {
  return normalizeText(text).replace(LEADING_SYMBOLS, '');
}

/**
 * Index letter for the A-Z view; names that do not start with a Latin letter go under "#".
 * A-Z 视图的索引字母；不以拉丁字母开头的名称归入 "#"。
 */
export function letterOf(key) {
  const first = String(key || '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/**
 * Collects where each term appears from the per-unit glossary files:
 * term id -> [{ unitId, slides, order }], where order is the term's position in that unit file.
 * 从各单元的术语文件收集每个术语的出处：术语 id -> [{ unitId, slides, order }]，order 为该术语在单元文件中的位置。
 */
export function collectSources(unitFiles) {
  const sources = new Map();
  for (const file of unitFiles || []) {
    if (!file || !file.unitId || !Array.isArray(file.terms)) continue;
    file.terms.forEach((term, order) => {
      if (!term || typeof term.id !== 'string') return;
      const list = sources.get(term.id) || [];
      if (!list.some((source) => source.unitId === file.unitId)) {
        list.push({ unitId: file.unitId, slides: textOrEmpty(term.slides), order });
      }
      sources.set(term.id, list);
    });
  }
  return sources;
}

/**
 * Prepares merged terms (from repo.allTerms(), each with units[]) for searching and sorting.
 * Slides per unit come from `sourcesById` when available; otherwise the merged term's own
 * slides belong to its first unit, because the merge keeps the first definition.
 * 为搜索与排序预处理合并后的术语（来自 repo.allTerms()，每项带 units[]）。
 * 每个单元的页码优先取自 `sourcesById`；否则合并术语自带的页码属于它的第一个单元，因为合并时保留的是首个定义。
 */
export function prepareEntries(terms, sourcesById = new Map()) {
  const valid = (Array.isArray(terms) ? terms : []).filter((term) => term && typeof term.id === 'string' && term.id);
  const seen = new Set();
  const entries = [];
  valid.forEach((term, index) => {
    if (seen.has(term.id)) return;
    seen.add(term.id);
    const known = sourcesById.get(term.id) || [];
    const unitIds = unique([...(Array.isArray(term.units) ? term.units : []), ...known.map((source) => source.unitId)])
      .filter((unitId) => typeof unitId === 'string' && unitId);
    const sources = unitIds.map((unitId, position) => known.find((source) => source.unitId === unitId) || {
      unitId,
      slides: position === 0 ? textOrEmpty(term.slides) : '',
      order: index,
    });
    entries.push({
      term,
      index,
      sources,
      search: buildSearchEntry(term),
      sortKey: sortKey(term.en || term.id),
    });
  });
  return entries;
}

/**
 * Number of terms per unit id, counting a shared term once in every unit that lists it.
 * 每个单元的术语数量；多个单元共享的术语在每个单元各计一次。
 */
export function countByUnit(entries) {
  const counts = new Map();
  for (const entry of entries || []) {
    for (const source of entry.sources || []) counts.set(source.unitId, (counts.get(source.unitId) || 0) + 1);
  }
  return counts;
}

/**
 * Filters, scores, orders and groups prepared entries.
 *   query     - free text; matched against names, definitions and examples (see term-search.js)
 *   units     - selected unit ids; empty means every unit
 *   sort      - "az": letter groups (or one ranked group while searching); "unit": one group per unit
 *   unitOrder - unit ids in course order, used to order unit groups
 * Returns { total, count, groups: [{ key, kind: 'letter'|'unit'|'results', letter?, unitId?, items: [entry] }] }.
 * A term appears once, under the first of its units that passes the unit filter.
 * 对预处理后的术语做筛选、打分、排序与分组：
 *   query 自由文本，匹配术语名、定义与例子；units 选中的单元，空数组表示全部；
 *   sort 为 "az" 时按首字母分组（搜索时合成一个按相关度排序的组），为 "unit" 时每个单元一组；
 *   unitOrder 为课程顺序的单元 id，用于排列单元分组。
 * 每个术语只出现一次，归入它第一个通过单元筛选的单元。
 */
export function arrangeTerms(entries, { query = '', units = [], sort = 'az', unitOrder = [] } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const normalizedQuery = normalizeText(query);
  const selected = new Set(units || []);
  const matches = [];
  for (const entry of list) {
    const source = selected.size
      ? entry.sources.find((candidate) => selected.has(candidate.unitId))
      : entry.sources[0];
    if (selected.size && !source) continue;
    const score = matchScore(entry.search, normalizedQuery);
    if (score <= 0) continue;
    matches.push({ entry, score, source: source || null });
  }

  const byScore = (a, b) => b.score - a.score;
  const byName = (a, b) => collator.compare(a.entry.sortKey, b.entry.sortKey) || a.entry.index - b.entry.index;
  let groups;

  if (sort === 'unit') {
    groups = groupByUnit(matches, unitOrder, byScore);
  } else if (normalizedQuery) {
    const items = matches.sort((a, b) => byScore(a, b) || byName(a, b)).map((match) => match.entry);
    groups = items.length ? [{ key: 'results', kind: 'results', items }] : [];
  } else {
    groups = [];
    for (const match of matches.sort(byName)) {
      const letter = letterOf(match.entry.sortKey);
      const last = groups[groups.length - 1];
      if (last && last.letter === letter) last.items.push(match.entry);
      else groups.push({ key: `letter:${letter}`, kind: 'letter', letter, items: [match.entry] });
    }
  }

  return { total: list.length, count: matches.length, groups };
}

function groupByUnit(matches, unitOrder, byScore) {
  const rank = new Map((unitOrder || []).map((unitId, position) => [unitId, position]));
  const rankOf = (unitId) => (rank.has(unitId) ? rank.get(unitId) : Number.MAX_SAFE_INTEGER);
  const buckets = new Map();
  for (const match of matches) {
    const unitId = match.source ? match.source.unitId : '';
    if (!buckets.has(unitId)) buckets.set(unitId, []);
    buckets.get(unitId).push(match);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b) || a.localeCompare(b))
    .map(([unitId, bucket]) => ({
      key: `unit:${unitId}`,
      kind: 'unit',
      unitId,
      items: bucket
        .sort((a, b) => byScore(a, b) || orderIn(a) - orderIn(b) || a.entry.index - b.entry.index)
        .map((match) => match.entry),
    }));
}

function orderIn(match) {
  return match.source && Number.isFinite(match.source.order) ? match.source.order : match.entry.index;
}

function textOrEmpty(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function unique(values) {
  return [...new Set(values)];
}
