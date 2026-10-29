/**
 * Data table with an optional bilingual caption. Wide tables scroll inside their own focusable box.
 * 带可选双语标题的数据表。较宽的表格在自身可聚焦的容器内横向滚动。
 *
 * Cells may mix Chinese and English (CONTENT_SPEC 4.2), so each cell is split by script: Chinese
 * cell text is teaching text and follows the language modes, header cells are labels and stay visible.
 * 单元格可以中英混排（CONTENT_SPEC 4.2），因此每个单元格按文字系统拆分：单元格里的中文属于讲解文字，
 * 随语言模式变化；表头属于标签，始终可见。
 */
import { h } from '../../../core/dom/element.js';
import { biTitle, scriptText } from '../../../core/text/bilingual.js';
import { asBi, listOf } from './lesson-block.js';

export const stylesheet = new URL('./table-block.css', import.meta.url);

function cellText(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function render(block, scope) {
  const headers = listOf(block.headers).map(cellText);
  const rows = listOf(block.rows).filter(Array.isArray);
  const columns = Math.max(headers.length, ...rows.map((row) => row.length), 1);
  const caption = asBi(block.caption);
  const captionId = caption ? scope.uid('table-caption') : null;
  // Short rows are padded so every row lines up with the header, even if the content is uneven.
  // 较短的行会补齐空格，即使内容行列数不一致也能与表头对齐。
  const pad = (row) => Array.from({ length: columns }, (_, index) => cellText(row[index]));

  return h('figure', { class: 'table-block' },
    caption ? h('figcaption', { class: 'table-block__caption', id: captionId }, biTitle(caption)) : null,
    h('div', {
      class: ['table-scroll', 'table-block__scroll'],
      tabindex: '0',
      role: 'region',
      'aria-labelledby': captionId || undefined,
      'aria-label': captionId ? undefined : '表格 Table',
    },
    h('table', { class: ['data-table', 'table-block__table'] },
      headers.length
        ? h('thead', {}, h('tr', {}, pad(headers).map((text) => h('th', { scope: 'col' }, scriptText(text, { role: 'label' })))))
        : null,
      h('tbody', {}, rows.map((row) => h('tr', {}, pad(row).map((text) => h('td', {}, scriptText(text, { role: 'teach' })))))))));
}
