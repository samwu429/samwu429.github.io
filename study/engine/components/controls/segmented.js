/**
 * Segmented single-choice control (radio-group semantics) for modes and filters.
 * 分段单选控件（单选组语义），用于模式切换与筛选。
 */
import { h } from '../../core/dom/element.js';

/**
 * Updates the checked option of an existing segmented control without firing onChange,
 * e.g. when the same preference was changed elsewhere on the page.
 * 更新已有分段控件的选中项而不触发 onChange，用于同一偏好在页面其他位置被修改时同步显示。
 */
export function setSegmentedValue(group, nextValue, focus = false) {
  for (const item of group.querySelectorAll('[role="radio"]')) {
    const checked = item.dataset.value === nextValue;
    item.setAttribute('aria-checked', String(checked));
    item.tabIndex = checked ? 0 : -1;
    if (checked && focus) item.focus();
  }
}

export function segmented({ options, value, onChange, ariaLabel, size = 'md', className } = {}) {
  const group = h('div', { class: ['segmented', `segmented--${size}`, className], role: 'radiogroup', 'aria-label': ariaLabel });
  const select = (nextValue, focus) => setSegmentedValue(group, nextValue, focus);

  options.forEach((option) => {
    group.append(h('button', {
      type: 'button',
      role: 'radio',
      class: 'segmented__option',
      title: option.title,
      dataset: { value: option.value },
      onclick: () => {
        select(option.value, false);
        onChange?.(option.value);
      },
    }, option.label));
  });

  // Arrow keys move the selection, matching native radio groups.
  // 方向键切换选项，与原生单选组行为一致。
  group.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const values = options.map((option) => option.value);
    const currentIndex = values.indexOf(group.querySelector('[aria-checked="true"]')?.dataset.value);
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextValue = values[(currentIndex + step + values.length) % values.length];
    select(nextValue, true);
    onChange?.(nextValue);
  });

  select(value, false);
  return group;
}
