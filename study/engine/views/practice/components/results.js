/**
 * Result widgets shared by the practice-session summary and the mock-exam report:
 * a score board, a per-unit breakdown table and a list of questions to revisit.
 * 练习总结与模拟考成绩单共用的结果组件：总分板、按单元的得分表、需要回看的题目列表。
 */
import { h } from '../../../core/dom/element.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle } from '../../../core/text/bilingual.js';
import { lessonHref, promptLang, promptPreview, typeBadge, unitKicker } from './labels.js';

const STYLESHEET = new URL('./results.css', import.meta.url);

let tableCounter = 0;

export function ensureResultsStyles() {
  return ensureStylesheet(STYLESHEET);
}

/**
 * Big score with supporting numbers. stats: [{ label, value }].
 * 大号总分与若干辅助数字。
 */
export function scoreBoard({ label, earned, possible, percent = null, stats = [] }) {
  return h('div', { class: 'practice-results__score' },
    h('p', { class: 'practice-results__score-label' }, label),
    h('p', { class: 'practice-results__score-main' },
      h('span', { class: 'practice-results__score-value' }, String(earned)),
      h('span', { class: 'practice-results__score-total' }, `/ ${possible}`),
      Number.isFinite(percent) ? h('span', { class: 'practice-results__score-percent' }, `${Math.round(percent)}%`) : null),
    stats.length
      ? h('dl', { class: 'practice-results__stats' }, stats.map((stat) => h('div', { class: 'practice-results__stat' },
        h('dt', {}, stat.label),
        h('dd', {}, String(stat.value)))))
      : null);
}

function toneOf(percent) {
  if (!Number.isFinite(percent)) return null;
  if (percent >= 80) return 'is-good';
  if (percent >= 50) return 'is-mid';
  return 'is-low';
}

/**
 * Per-unit table (rows from summarizeResults().byUnit); wide tables scroll inside their own box, which
 * is a labelled, focusable region so keyboard users can scroll it too.
 * 按单元的得分表（数据来自 summarizeResults().byUnit）；表格过宽时在自身容器内横向滚动，该容器是带名称、可聚焦的区域，键盘也能滚动。
 */
export function unitBreakdown(rows, units, { caption = '按单元得分 Score by unit' } = {}) {
  tableCounter += 1;
  const captionId = `practice-results-caption-${tableCounter}`;
  const body = rows.map((row) => {
    const unit = units.get(row.unitId);
    const percent = Number.isFinite(row.percent) ? Math.round(row.percent) : null;
    return h('tr', {},
      h('th', { scope: 'row' },
        h('span', { class: 'practice-results__unit-kicker' }, unitKicker(unit) || row.unitId),
        unit?.title ? biTitle(unit.title, { className: 'practice-results__unit-title' }) : null),
      h('td', {}, row.objectiveQuestions ? `${row.objectiveCorrect} / ${row.objectiveQuestions}` : '—'),
      h('td', {}, row.writtenPossible ? `${row.writtenEarned} / ${row.writtenPossible}` : '—'),
      h('td', {},
        h('div', { class: 'practice-results__bar' },
          h('span', { class: 'practice-results__bar-track', 'aria-hidden': 'true' },
            h('span', { class: ['practice-results__bar-fill', toneOf(percent)], style: { width: `${percent ?? 0}%` } })),
          h('span', { class: 'practice-results__bar-text' }, percent === null ? '—' : `${percent}%`))));
  });
  return h('div', { class: ['table-scroll', 'practice-results__table-wrap'], tabindex: '0', role: 'region', 'aria-labelledby': captionId },
    h('table', { class: ['data-table', 'practice-results__table'] },
      h('caption', { class: 'visually-hidden', id: captionId }, caption),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, '单元 Unit'),
        h('th', { scope: 'col' }, '客观题 Objective'),
        h('th', { scope: 'col' }, '主观要点 Written points'),
        h('th', { scope: 'col' }, '得分率 Score'))),
      h('tbody', {}, body)));
}

/** "复习课文 Review lesson" link for a question, or null. 题目出处课文的链接。 */
export function lessonLink(question) {
  const href = lessonHref(question);
  return href ? h('a', { class: 'practice-results__lesson', href }, icon('book', { size: 14 }), '复习课文 Review lesson') : null;
}

/**
 * List of questions to revisit. items: [{ question, number, unit, status: 'wrong' | 'skipped', actions: [Node] }].
 * 需要回看的题目列表。
 */
export function questionList(items, { label } = {}) {
  return h('ol', { class: 'practice-results__list', 'aria-label': label },
    items.map(({ question, number, unit, status, actions = [] }) => h('li', { class: ['practice-results__item', status ? `is-${status}` : null] },
      h('div', { class: 'practice-results__item-meta' },
        number ? h('span', { class: 'practice-results__item-number' }, `第 ${number} 题 Q${number}`) : null,
        typeBadge(question.type),
        unit ? h('span', { class: 'practice-results__item-unit' }, unitKicker(unit)) : null),
      h('p', { class: 'practice-results__item-prompt', lang: promptLang(question) }, promptPreview(question)),
      actions.filter(Boolean).length ? h('div', { class: 'practice-results__item-actions' }, actions) : null)));
}
