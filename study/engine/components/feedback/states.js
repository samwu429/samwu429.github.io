/**
 * Loading, error and empty placeholders shared by every view, plus the notice for a partly loaded page.
 * 所有视图共用的加载中、出错与空状态占位组件，以及“只加载了一部分”的提示。
 */
import { h } from '../../core/dom/element.js';
import { uiText } from '../../core/text/bilingual.js';
import { unitLabels } from '../../core/text/unit-labels.js';
import { button } from '../controls/button.js';

export function loadingState(text = '正在加载… Loading') {
  return h('div', { class: 'state state--loading', role: 'status' },
    h('span', { class: 'state__spinner', 'aria-hidden': 'true' }),
    h('span', { class: 'state__text' }, uiText(text)));
}

export function errorState(error, onRetry) {
  return h('div', { class: 'state state--error', role: 'alert' },
    h('p', { class: 'state__title' }, uiText('出错了 Something went wrong')),
    h('p', { class: 'state__text' }, String(error?.message || error || '')),
    onRetry ? button({ label: '重试 Retry', iconName: 'refresh', onClick: onRetry }) : null);
}

export function emptyState({ title, body, action } = {}) {
  return h('div', { class: 'state state--empty' },
    title ? h('p', { class: 'state__title' }, typeof title === 'string' ? uiText(title) : title) : null,
    body ? h('p', { class: 'state__text' }, typeof body === 'string' ? uiText(body) : body) : null,
    action || null);
}

/**
 * Warns that some units' files did not load, so the page below is incomplete; null when nothing failed.
 *   unitIds - ids of the units that failed (see failedUnits in core/data/course-repository.js)
 *   units   - course.json units, used to name them
 *   what    - { zh, en } naming the missing content, e.g. { zh: '题目', en: 'Questions' }
 * 提示部分单元的文件没有加载出来、下方内容不完整；没有失败时返回 null。unitIds 为失败单元的 id，units 为 course.json
 * 中的单元（用于显示名称），what 说明缺的是什么内容。
 */
export function partialLoadNotice({ unitIds = [], units = [], what = { zh: '内容', en: 'Content' }, onRetry } = {}) {
  if (!unitIds.length) return null;
  const byId = new Map((Array.isArray(units) ? units : []).filter(Boolean).map((unit) => [unit.id, unit]));
  const names = unitIds.map((id) => unitLabels(byId.get(id), id));
  return h('div', { class: ['callout', 'callout--warn', 'state-partial'], role: 'status' },
    h('span', { class: 'callout__label' }, uiText('部分内容没加载出来 Some content did not load')),
    h('p', { class: 'state-partial__text' },
      `${names.map((name) => name.zh).join('、')}的${what.zh}没加载出来，下面显示的内容不完整。`, ' ',
      h('span', { lang: 'en' }, `${what.en} for ${names.map((name) => name.en).join(', ')} did not load, so this page is incomplete.`)),
    onRetry ? button({ label: '重新加载 Retry', iconName: 'refresh', size: 'sm', onClick: onRetry }) : null);
}
