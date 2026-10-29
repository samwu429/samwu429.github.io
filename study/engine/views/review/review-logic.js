/**
 * Pure helpers of the review pages (cheat sheet, exam toolkit): blanks, term names, filters, tabs.
 * 复习页面（考前速记、答题工具箱）的纯逻辑：填空、术语名称、筛选与分页。
 */
import { toBi } from '../../core/text/bilingual.js';
import { unitName } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';

const BLANK = /_{3,}|＿{2,}/g;

export function asList(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

/**
 * Splits a sentence frame into text and blank ("___") segments, so blanks can be highlighted.
 * 把句子框架拆成普通文字与空格（“___”）片段，便于高亮空格。
 */
export function splitBlanks(text) {
  const source = String(text ?? '');
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(BLANK)) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index), blank: false });
    parts.push({ text: match[0], blank: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ text: source.slice(last), blank: false });
  return parts;
}

/**
 * Text handed to speech synthesis: blanks become a short pause instead of "underscore".
 * 交给语音朗读的文字：空格读成短暂停顿，而不是念出下划线。
 */
export function speechText(text) {
  return String(text ?? '').replace(BLANK, ' … ').replace(/\s{2,}/g, ' ').trim();
}

export function humanizeId(id) {
  return String(id ?? '').replace(/[-_]+/g, ' ').trim();
}

/**
 * Display names of glossary terms by id; the first definition of an id wins.
 * 按 id 索引的术语显示名；同一 id 以第一次出现的为准。
 */
export function termNames(terms) {
  const names = new Map();
  for (const term of asList(terms)) {
    if (typeof term.id !== 'string' || names.has(term.id)) continue;
    const en = typeof term.en === 'string' ? term.en : '';
    const zh = typeof term.zh === 'string' ? term.zh : '';
    if (en || zh) names.set(term.id, { en, zh });
  }
  return names;
}

/**
 * Filter options of the cheat sheet, one per unit block, labelled with the course unit when known.
 * 速记页的筛选选项，每个单元块一项；能找到课程单元时使用其编号作标签。
 */
export function unitFilterOptions(sheetUnits, courseUnits) {
  const units = asList(courseUnits);
  const seen = new Set();
  const options = [];
  asList(sheetUnits).forEach((block, index) => {
    if (typeof block !== 'object' || Array.isArray(block)) return;
    const value = filterValue(block, index);
    if (seen.has(value)) return;
    seen.add(value);
    const unit = units.find((candidate) => candidate && candidate.id === block.lessonId) || null;
    const title = toBi(block.title) || toBi(unit?.title);
    const prefix = unit ? unitName(unit) : null;
    const join = (left, right) => [left, right].filter(Boolean).join(' · ');
    options.push({
      value,
      unit,
      label: {
        zh: join(prefix?.zh, title?.zh || title?.en) || value,
        en: join(prefix?.en, title?.en) || value,
      },
    });
  });
  return options;
}

/**
 * Stable filter value of a cheat-sheet unit block: its lesson id, or its position when the id is unusable.
 * 速记单元块的筛选值：可用时为课程 id，否则为其位置序号。
 */
export function filterValue(block, index) {
  return isRouteId(block?.lessonId) ? block.lessonId : `unit-${index + 1}`;
}

export function matchesFilter(value, filter) {
  return !filter || filter === 'all' || value === filter;
}

/**
 * Ids of toolkit sections that have content, in the given display order.
 * 有内容的工具箱分区 id，按给定顺序返回。
 */
export function presentSections(data, order) {
  if (!data || typeof data !== 'object') return [];
  return order.filter((id) => asList(data[id]).length > 0);
}
