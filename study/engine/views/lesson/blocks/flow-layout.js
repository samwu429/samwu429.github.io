/**
 * DOM-free layout rule of the flow block: two to four short steps may run left to right, anything
 * longer runs top to bottom (and every flow does on a phone, see flow-block.css).
 * 流程块的布局规则（不依赖 DOM）：2 到 4 个简短步骤可以从左到右排列，更长的流程从上到下排列（手机上一律从上到下，见 flow-block.css）。
 */

// Beyond these lengths a step needs a full-width row to stay readable.
// 超过这些长度的步骤需要整行宽度才易读。
export const COMPACT_EN = 56;
export const COMPACT_ZH = 32;

/**
 * The row modifier class for the steps, or null for the default column layout.
 * 步骤横排时使用的修饰类名；使用默认的纵向排列时返回 null。
 */
export function rowClass(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length < 2 || list.length > 4) return null;
  const compact = list.every((item) => String(item?.en || '').length <= COMPACT_EN && String(item?.zh || '').length <= COMPACT_ZH);
  if (!compact) return null;
  return list.length <= 3 ? 'flow-block--row-short' : 'flow-block--row-long';
}
