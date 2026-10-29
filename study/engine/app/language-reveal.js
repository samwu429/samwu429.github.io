/**
 * In English-practice mode Chinese text is blurred until the learner asks for it:
 *   - tapping blurred text reveals it, together with the other Chinese runs of the same mixed text;
 *   - Alt+Z reveals the Chinese of the block that holds the keyboard focus, or, when there is
 *     nothing blurred there, works like the header toggle;
 *   - the header toggle (revealToggle) shows or re-blurs all Chinese on every page.
 * Changes made from the keyboard are announced through a polite live region.
 * 英文练习模式下，中文先模糊，学习者需要时再显示：点击模糊的文字即可显示（同一段混排文字中的中文一起显示）；
 * Alt+Z 显示当前键盘焦点所在内容块的中文，那里没有模糊的中文时等同于页头开关；页头开关（revealToggle）
 * 让所有页面的中文全部显示或重新模糊。键盘操作的结果通过礼貌型实时区域播报。
 */
import { h, replaceContent } from '../core/dom/element.js';
import { icon } from '../core/dom/icons.js';
import { isTextEntry } from '../core/dom/keyboard.js';
import { BLURRED_CHINESE, REVEAL_ALL_CLASS, blurredChinese } from '../core/text/bilingual.js';

// Containers whose Chinese Alt+Z reveals together: the nearest container that a view marked with
// data-reveal-scope (a lesson block, for example), or else the nearest generic container around the focus.
// Alt+Z 一起显示其中中文的容器：优先使用视图用 data-reveal-scope 标记的容器（例如课程内容块），否则取焦点外最近的通用容器。
const MARKED_SCOPE = '[data-reveal-scope]';
const GENERIC_SCOPE = 'article, figure, li, [role="group"], [role="tabpanel"], section';

const toggles = new Set();
let live = null;

function practising() {
  return document.documentElement.dataset.langMode === 'en-practice';
}

function isChineseRevealed() {
  return document.documentElement.classList.contains(REVEAL_ALL_CLASS);
}

function setChineseRevealed(on) {
  document.documentElement.classList.toggle(REVEAL_ALL_CLASS, on);
  for (const toggle of toggles) toggle.setAttribute('aria-pressed', String(on));
}

function announce(zh, en) {
  if (!live) return;
  replaceContent(live, h('span', { lang: 'zh-CN' }, zh), ' ', h('span', { lang: 'en' }, en));
}

function announceAll() {
  if (isChineseRevealed()) announce('已显示全部中文', 'All Chinese is shown');
  else announce('中文已重新模糊', 'Chinese is blurred again');
}

// Reveals the blurred Chinese in and under `root`; returns how many nodes changed.
// 显示 `root` 本身及其内部被模糊的中文，返回改变的节点数。
function revealIn(root) {
  const nodes = [...root.querySelectorAll(BLURRED_CHINESE)];
  if (root.matches(BLURRED_CHINESE)) nodes.push(root);
  for (const node of nodes) node.classList.add('is-revealed');
  return nodes.length;
}

function onClick(event) {
  const target = blurredChinese(event.target);
  if (!target) return;
  event.preventDefault();
  revealIn(target.closest('.bi-mixed') || target);
}

function onKeydown(event) {
  if (!practising() || !event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.code !== 'KeyZ' && String(event.key).toLowerCase() !== 'z') return;
  const active = document.activeElement;
  if (isTextEntry(active)) return;
  event.preventDefault();
  const scope = !isChineseRevealed() && active instanceof Element
    ? active.closest(MARKED_SCOPE) || active.closest(GENERIC_SCOPE)
    : null;
  if (scope && revealIn(scope)) {
    announce('已显示这一块的中文', 'Chinese shown for this block');
    return;
  }
  setChineseRevealed(!isChineseRevealed());
  announceAll();
}

/**
 * Installs the tap and keyboard handlers once per page. Leaving English-practice mode clears the
 * "show all" state, so the next practice session starts blurred again.
 * 每个页面安装一次点击与键盘处理。离开英文练习模式时清除“全部显示”状态，下次练习重新从模糊开始。
 */
export function installLanguageReveal(preferences) {
  live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  document.body.append(live);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  if (preferences?.EVENT) {
    window.addEventListener(preferences.EVENT, () => {
      if (!practising()) setChineseRevealed(false);
    });
  }
}

/**
 * Header button that shows or re-blurs all Chinese; CSS shows it only in English-practice mode.
 * 显示或重新模糊全部中文的页头按钮；CSS 只在英文练习模式下显示它。
 */
export function revealToggle({ className } = {}) {
  const toggle = h('button', {
    type: 'button',
    class: ['shell-tool', className],
    'aria-pressed': String(isChineseRevealed()),
    title: '显示全部中文 Reveal all Chinese（Alt+Z：只显示当前这一块 Alt+Z: current block only）',
    onclick: () => {
      setChineseRevealed(!isChineseRevealed());
      announceAll();
    },
  },
  icon('eye', { size: 16 }),
  h('span', { class: 'visually-hidden' },
    h('span', { lang: 'zh-CN' }, '显示全部中文'), ' ',
    h('span', { lang: 'en' }, 'Reveal all Chinese')));
  toggles.add(toggle);
  return toggle;
}
