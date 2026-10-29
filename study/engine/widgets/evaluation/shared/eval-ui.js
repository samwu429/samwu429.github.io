/**
 * Small DOM building blocks shared by the evaluation widgets (frame, bilingual lines, live region, status).
 * 评估类组件共用的小型 DOM 构件（外框、双语行、朗读区域、结论徽标）。
 */
import { h } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { biTitle, enNode, hasText, zhNode } from '../../../core/text/bilingual.js';

let nextId = 0;

/** Unique id for label/aria wiring when a page shows several widgets. 页面上有多个组件时用于关联标签的唯一 id。 */
export function uniqueId(prefix) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/**
 * Outer panel of a widget: eyebrow, bilingual title, short intro, then the body.
 * 组件外框：眉标、双语标题、简短说明，然后是主体。
 */
export function widgetFrame({ className, title, intro }) {
  const titleId = uniqueId('eval-title');
  const body = h('div', { class: 'eval-widget__body' });
  const root = h('section', { class: ['eval-widget', className], 'aria-labelledby': titleId },
    h('header', { class: 'eval-widget__header' },
      h('span', { class: 'eval-widget__eyebrow' }, '互动演示 Interactive'),
      h('h3', { class: 'eval-widget__title', id: titleId }, biTitle(title)),
      intro ? teachPair(intro, { className: 'eval-widget__intro' }) : null),
    body);
  return { root, body };
}

/**
 * Chinese teaching sentence followed by its English version (Chinese first, English after).
 * 中文讲解句在前、英文对应句在后。
 */
export function teachPair(value, { className, tag = 'div', role = 'teach' } = {}) {
  if (!value || (!hasText(value.zh) && !hasText(value.en))) return null;
  return h(tag, { class: ['eval-pair', className] },
    zhNode(value.zh, role, 'p', 'eval-pair__zh'),
    enNode(value.en, 'p', 'eval-pair__en'));
}

/** Section heading inside a widget (h4). 组件内部的小节标题。 */
export function subheading(value, { className, id } = {}) {
  return h('h4', { class: ['eval-subheading', className], id }, biTitle(value));
}

/**
 * Polite live region. Repeating the same message still gets announced because a
 * non-breaking space is toggled at the end.
 * 礼貌型朗读区域。末尾交替添加不换行空格，使相同的消息也会被再次朗读。
 */
export function liveRegion() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let toggle = false;
  return {
    element,
    announce(text) {
      toggle = !toggle;
      element.textContent = `${text}${toggle ? ' ' : ''}`;
    },
  };
}

const STATUS = {
  pass: { tone: 'pass', iconName: 'check', zh: '满足', en: 'Satisfied' },
  fail: { tone: 'fail', iconName: 'cross', zh: '不满足', en: 'Not satisfied' },
  unknown: { tone: 'unknown', iconName: null, zh: '无法判断', en: 'Cannot tell' },
  insufficient: { tone: 'muted', iconName: null, zh: '至少要两组', en: 'Needs 2+ groups' },
  info: { tone: 'muted', iconName: 'eye', zh: '表格看不出', en: 'Not in the counts' },
};

export function statusText(status) {
  const meta = STATUS[status] || STATUS.unknown;
  return `${meta.zh} ${meta.en}`;
}

/**
 * Verdict badge with an icon, so the result never depends on colour alone.
 * 带图标的结论徽标，结果不只依赖颜色来表达。
 */
export function statusBadge(status) {
  const meta = STATUS[status] || STATUS.unknown;
  return h('span', { class: ['eval-status', `eval-status--${meta.tone}`] },
    meta.iconName ? icon(meta.iconName, { size: 14 }) : null,
    zhNode(meta.zh, 'label'),
    enNode(meta.en));
}

/** A formula or substituted calculation in monospace that wraps instead of overflowing. 等宽字体公式，会自动换行而不是撑破布局。 */
export function formulaLine(text, { general = false, className } = {}) {
  return h('p', { class: ['eval-formula', general ? 'eval-formula--general' : null, className], lang: 'en' }, text);
}

/**
 * Callout for knowledge that is not on the slides, prefixed as the content spec requires.
 * 课件外补充知识的提示框，按内容规范加上“补充（课件外）”前缀。
 */
export function outsideNote(value, { className } = {}) {
  return h('div', { class: ['callout', 'callout--info', 'eval-note', className] },
    teachPair({ zh: `补充（课件外）：${value.zh}`, en: value.en }));
}
