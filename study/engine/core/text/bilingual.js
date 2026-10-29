/**
 * Helpers for bilingual values of the form { zh, en }.
 * 处理 { zh, en } 双语值的工具函数。
 *
 * Chinese nodes carry a role class that the language-mode CSS reacts to:
 *   zh-teach  - Chinese teaching text (blurred in English practice mode)
 *   zh-gloss  - Chinese meaning attached to English content (blurred in English practice mode)
 *   zh-assist - Chinese translation of English questions (hidden unless requested)
 *   zh-label  - navigation/titles, always visible
 * 中文节点带有角色类名，供语言模式 CSS 控制显示：
 *   zh-teach 讲解正文（英文练习模式下模糊）；zh-gloss 英文内容的中文释义（英文练习模式下模糊）；
 *   zh-assist 题目的中文翻译（默认隐藏，按需显示）；zh-label 导航与标题，始终可见。
 */
import { h } from '../dom/element.js';
import { renderInline } from './inline-markup.js';
import { scriptMix, scriptRuns } from './script-runs.js';

/**
 * Chinese that English practice mode blurs, and the <html> class that shows all of it again
 * (see app/language-reveal.js and styles/foundation/language-modes.css).
 * 英文练习模式下被模糊的中文，以及让它们全部重新显示的 <html> 类名（见 app/language-reveal.js 与 styles/foundation/language-modes.css）。
 */
export const BLURRED_CHINESE = '.zh-teach:not(.is-revealed), .zh-gloss:not(.is-revealed)';
export const REVEAL_ALL_CLASS = 'reveal-zh';

/**
 * The Chinese node at or around `element` that is blurred right now, or null.
 * 当前被模糊、且位于 `element` 本身或其外层的中文节点；没有时返回 null。
 */
export function blurredChinese(element) {
  const root = document.documentElement;
  if (root.dataset.langMode !== 'en-practice' || root.classList.contains(REVEAL_ALL_CLASS)) return null;
  return element instanceof Element ? element.closest(BLURRED_CHINESE) : null;
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Normalises a bilingual value to { zh, en } strings, or null when both are empty; a bare string
 * is filed under the language it is written in.
 * 把双语值规范化为 { zh, en } 字符串，两者都为空时返回 null；纯字符串按其书写语言归入 zh 或 en。
 */
export function toBi(value) {
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    const mix = scriptMix(value);
    return mix === 'zh' || mix === 'mixed' ? { zh: value, en: '' } : { zh: '', en: value };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const zh = typeof value.zh === 'string' ? value.zh : '';
  const en = typeof value.en === 'string' ? value.en : '';
  return zh.trim() || en.trim() ? { zh, en } : null;
}

/**
 * Returns the preferred language string of a bilingual value, falling back to the other.
 * 返回双语值中首选语言的文本，缺失时回退到另一种语言。
 */
export function pickText(value, prefer = 'zh') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const other = prefer === 'zh' ? 'en' : 'zh';
  return hasText(value[prefer]) ? value[prefer] : (value[other] || '');
}

export function zhNode(text, role = 'teach', tag = 'span', extraClass) {
  if (!hasText(text)) return null;
  return h(tag, { class: ['zh', `zh-${role}`, extraClass], lang: 'zh-CN' }, renderInline(text));
}

export function enNode(text, tag = 'span', extraClass) {
  if (!hasText(text)) return null;
  return h(tag, { class: ['en', extraClass], lang: 'en' }, renderInline(text));
}

/**
 * Wraps the text nodes under `node` by script: English runs get lang="en"; Chinese runs get
 * lang="zh-CN" plus the role class, or stay plain text when `role` is null (UI labels, which are
 * always visible and already sit in a zh-CN page).
 * 按文字系统包裹 `node` 下的文本节点：英文段加 lang="en"；中文段加 lang="zh-CN" 与角色类名，
 * `role` 为 null 时保持纯文本（界面文字始终可见，本身就处在 zh-CN 页面中）。
 */
export function markLanguages(node, { role = null } = {}) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      markLanguages(child, { role });
      continue;
    }
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const runs = scriptRuns(child.nodeValue);
    if (runs.every((run) => run.script === null)) continue;
    child.replaceWith(...runs.map((run) => {
      if (run.script === 'en') return h('span', { class: 'en', lang: 'en' }, run.text);
      if (run.script === 'zh' && role) return h('span', { class: ['zh', `zh-${role}`], lang: 'zh-CN' }, run.text);
      return document.createTextNode(run.text);
    }));
  }
  return node;
}

/**
 * Renders content text whose language is not declared, such as a table cell: Chinese-only text
 * becomes a role node, English-only text an English node, and mixed text a `bi-mixed` node whose
 * Chinese runs carry the role, so the language modes treat every part correctly. The Chinese runs of
 * one mixed node are revealed together in English practice mode.
 * 渲染没有声明语言的内容文字（例如表格单元格）：纯中文为带角色的中文节点，纯英文为英文节点，中英混排为 `bi-mixed`
 * 节点，其中的中文段带上角色类名，使语言模式对每一部分都生效。英文练习模式下，同一个混排节点里的中文段会一起显示。
 */
export function scriptText(text, { role = 'teach', tag = 'span', className } = {}) {
  if (!hasText(text)) return null;
  const mix = scriptMix(text);
  if (mix === 'zh') return zhNode(text, role, tag, className);
  if (mix === 'en') return enNode(text, tag, className);
  if (mix === null) return h(tag, { class: className }, renderInline(text));
  return markLanguages(h(tag, { class: ['bi-mixed', className] }, renderInline(text)), { role });
}

/**
 * A bilingual UI string such as "提交 Submit", with its English part marked lang="en" so screen
 * readers switch voice.
 * 双语界面文字（如“提交 Submit”），其中英文部分标为 lang="en"，读屏软件会切换发音。
 */
export function uiText(text) {
  const fragment = document.createDocumentFragment();
  for (const run of scriptRuns(text)) {
    fragment.append(run.script === 'en' ? h('span', { lang: 'en' }, run.text) : document.createTextNode(run.text));
  }
  return fragment;
}

/**
 * Renders English first, then its Chinese counterpart, as two stacked lines.
 * 先渲染英文，再渲染对应中文，上下两行排列。
 */
export function biStack(value, { role = 'gloss', tag = 'div', lineTag = 'p', className } = {}) {
  if (!value) return null;
  return h(tag, { class: ['bi', className] },
    enNode(value.en, lineTag, 'bi__en'),
    zhNode(value.zh, role, lineTag, 'bi__zh'));
}

/**
 * Renders a title as Chinese main text with a smaller English subtitle.
 * 将标题渲染为中文主标题加较小的英文副标题。
 */
export function biTitle(value, { tag = 'span', className } = {}) {
  if (!value) return null;
  return h(tag, { class: ['bi-title', className] },
    zhNode(value.zh, 'label', 'span', 'bi-title__zh'),
    enNode(value.en, 'span', 'bi-title__en'));
}
