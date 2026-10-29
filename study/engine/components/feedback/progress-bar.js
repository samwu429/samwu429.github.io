/**
 * Accessible progress bar showing done / total.
 * 显示 已完成 / 总数 的无障碍进度条。
 */
import { h } from '../../core/dom/element.js';

export function progressBar(done, total, { label = '学习进度 Progress', showText = true, size = 'md' } = {}) {
  const ratio = total ? Math.min(1, done / total) : 0;
  return h('div', { class: ['progress', `progress--${size}`] },
    h('div', {
      class: 'progress__track',
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': total,
      'aria-valuenow': done,
    }, h('div', { class: 'progress__fill', style: { width: `${(ratio * 100).toFixed(1)}%` } })),
    showText ? h('span', { class: 'progress__text' }, `${done}/${total}`) : null);
}
