/**
 * Standard page header: eyebrow label, bilingual title, subtitle and action buttons.
 * 标准页面标题区：眉标、双语标题、副标题与操作按钮。
 *
 * String eyebrows, titles and subtitles are bilingual UI text: their English parts get lang="en".
 * 字符串形式的眉标、标题与副标题属于双语界面文字，其中英文部分会标上 lang="en"。
 */
import { h } from '../../core/dom/element.js';
import { biTitle, markLanguages, uiText } from '../../core/text/bilingual.js';
import { renderInline } from '../../core/text/inline-markup.js';

export function pageHeader({ eyebrow, title, subtitle, actions } = {}) {
  return h('header', { class: 'page-header' },
    eyebrow ? h('span', { class: 'page-header__eyebrow' }, typeof eyebrow === 'string' ? uiText(eyebrow) : eyebrow) : null,
    h('h1', { class: 'page-header__title' }, typeof title === 'string' ? uiText(title) : biTitle(title)),
    subtitle
      ? (typeof subtitle === 'string'
        ? markLanguages(h('p', { class: 'page-header__subtitle' }, renderInline(subtitle)))
        : h('p', { class: 'page-header__subtitle' }, subtitle))
      : null,
    actions && actions.length ? h('div', { class: 'page-header__actions' }, actions) : null);
}
