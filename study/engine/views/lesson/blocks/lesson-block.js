/**
 * Shared parts of lesson blocks: role tags, secondary English lines, the "Show Chinese" toggle and
 * lenient readers for content fields.
 * 课程内容块的公共部件：角色标签、次要英文行、“显示中文”开关，以及宽松读取内容字段的工具。
 */
import { h } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { enNode, hasText, toBi, zhNode } from '../../../core/text/bilingual.js';
import { speakButton } from '../../../components/text/speak-button.js';

export const stylesheet = new URL('./lesson-block.css', import.meta.url);

export function listOf(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

/**
 * Reads a bilingual field leniently with toBi(): a plain string is filed under the language it is
 * written in, and an empty value gives null.
 * 用 toBi() 宽松读取双语字段：纯字符串按其书写语言归类，空值返回 null。
 */
export function asBi(value) {
  return toBi(value);
}

/**
 * The small label that tells a beginner what kind of block this is, e.g. "生活类比 Analogy".
 * 告诉初学者“这是什么内容块”的小标签，例如“生活类比 Analogy”。
 */
export function blockTag({ zh, en, iconName, tone = 'ink', size = 'md', className } = {}) {
  return h('p', { class: ['lesson-block__tag', `lesson-block__tag--${tone}`, size === 'sm' ? 'lesson-block__tag--sm' : null, className] },
    iconName ? icon(iconName, { size: size === 'sm' ? 14 : 16 }) : null,
    zhNode(zh, 'label', 'span', 'lesson-block__tag-zh'),
    enNode(en, 'span', 'lesson-block__tag-en'));
}

/**
 * Muted English line under Chinese teaching text, optionally with a read-aloud button.
 * 中文讲解下方的浅色英文行，可附朗读按钮。
 */
export function secondaryEn(text, { speak = false, className } = {}) {
  if (!hasText(text)) return null;
  return h('p', { class: ['lesson-block__en', className] },
    enNode(text, 'span', 'lesson-block__en-text'),
    speak ? speakButton(text) : null);
}

/**
 * Toggle that reveals the zh-assist translations inside one block by adding `show-assist` to it.
 * The target is resolved lazily so the toggle can be built before the block element exists.
 * 在单个内容块上添加 `show-assist` 类，显示其中的 zh-assist 翻译。目标元素延迟获取，所以开关可以先于内容块创建。
 */
export function assistToggle(getTarget) {
  const control = h('button', {
    type: 'button',
    class: 'lesson-block__assist',
    'aria-pressed': 'false',
    onclick: () => {
      const target = getTarget();
      if (!target) return;
      const on = !target.classList.contains('show-assist');
      target.classList.toggle('show-assist', on);
      control.setAttribute('aria-pressed', String(on));
    },
  }, icon('translate', { size: 16 }), h('span', {}, '显示中文 Show Chinese'));
  return control;
}
