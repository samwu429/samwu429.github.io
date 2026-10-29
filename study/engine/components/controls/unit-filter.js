/**
 * Unit filter chips shared by the glossary and flashcards: "All" plus one toggle chip per unit.
 * 术语表与闪卡共用的单元筛选标签：一个“全部”加上每个单元一个可切换的标签。
 *
 * An empty selection means every unit, so "All" is pressed exactly when no unit chip is.
 * 空选择表示全部单元，因此只有在没有任何单元被选中时，“全部”才处于按下状态。
 */
import { h } from '../../core/dom/element.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { uiText } from '../../core/text/bilingual.js';

export function loadUnitFilterStyles() {
  return ensureStylesheet(new URL('./unit-filter.css', import.meta.url));
}

/**
 * units: [{ id, label, title?, count? }] in display order (see unitChoices in views/glossary/logic/unit-refs.js).
 * countLabel names what the counts measure for screen readers, e.g. "个术语 terms".
 * Returns { element, value(), set(ids) }; onChange(ids) runs after every user change.
 * units 为按显示顺序排列的 [{ id, label, title?, count? }]（见 views/glossary/logic/unit-refs.js 的 unitChoices）；
 * countLabel 告诉读屏软件数字的含义，例如 "个术语 terms"。返回 { element, value(), set(ids) }；用户每次修改后调用 onChange(ids)。
 */
export function createUnitFilter({ units = [], selected = [], totalCount, countLabel = '', ariaLabel, onChange, className } = {}) {
  const order = units.map((unit) => unit.id);
  let current = new Set();
  const chips = new Map();

  const allChip = chip({ label: '全部 All', count: totalCount, countLabel, onClick: () => change([]) });
  for (const unit of units) {
    chips.set(unit.id, chip({
      label: unit.label,
      title: unit.title,
      count: unit.count,
      countLabel,
      onClick: () => toggle(unit.id),
    }));
  }

  const element = h('div', { class: ['unit-filter', className], role: 'group', 'aria-label': ariaLabel }, allChip, [...chips.values()]);

  function value() {
    return order.filter((id) => current.has(id));
  }

  function set(ids) {
    const next = new Set((ids || []).filter((id) => chips.has(id)));
    // Choosing every unit is the same as "All", so the selection collapses back to empty.
    // 选中全部单元等同于“全部”，因此选择会收回为空。
    current = next.size === chips.size ? new Set() : next;
    allChip.setAttribute('aria-pressed', String(current.size === 0));
    for (const [id, button] of chips) button.setAttribute('aria-pressed', String(current.has(id)));
  }

  function change(ids) {
    set(ids);
    onChange?.(value());
  }

  function toggle(id) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    change([...next]);
  }

  set(selected);
  return { element, value, set };
}

function chip({ label, title, count, countLabel, onClick }) {
  const hasCount = count !== undefined && count !== null;
  return h('button', { type: 'button', class: 'unit-filter__chip', title: title || undefined, onclick: onClick },
    h('span', { class: 'unit-filter__label' }, typeof label === 'string' ? uiText(label) : label),
    hasCount ? h('span', { class: 'unit-filter__count' },
      String(count),
      countLabel ? h('span', { class: 'visually-hidden' }, ` ${countLabel}`) : null) : null);
}
