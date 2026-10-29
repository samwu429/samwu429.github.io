/**
 * Keyboard helpers for page-level shortcuts: whether a key press belongs to a form field, to a
 * control that Enter or Space already activates, or to the current page at all.
 * 页面级快捷键的键盘小工具：判断按键是否属于输入控件、属于回车或空格本身就会触发的控件，以及是否发生在当前页面里。
 */

const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'tel', 'password', 'date', 'time']);

/** Elements where digits, letters and Enter are typed text, not shortcuts. 数字、字母与回车属于输入内容的元素。 */
export function isTextEntry(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((target.getAttribute('type') || 'text').toLowerCase());
}

/** Elements that Enter or Space already activates natively (buttons, links). 回车或空格本身就会触发的元素（按钮、链接）。 */
export function isActivatable(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, a[href], summary, [role="button"], [role="link"], [role="radio"]'));
}

/**
 * True when a key event target belongs to the page rendered in `container`: the container itself,
 * anything inside it, its parent (the focused <main> after navigation) or the document body. Keys
 * pressed in the site header or navigation do not count.
 * 判断按键目标是否属于 `container` 中渲染的页面：容器本身及其内部、它的父元素（跳转后获得焦点的 <main>）或 body。
 * 在站点页头或导航中按下的键不算。
 */
export function withinPage(target, container) {
  if (!(target instanceof Node) || !container) return false;
  return target === document.body
    || target === document.documentElement
    || target === container.parentElement
    || container.contains(target);
}
