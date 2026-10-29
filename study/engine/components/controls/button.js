/**
 * Shared button and link-button factories in the station's visual language.
 * 全站统一视觉风格的按钮与链接按钮工厂函数。
 *
 * Bilingual labels such as "提交 Submit" get their English part marked lang="en" (see uiText).
 * “提交 Submit”这类双语文字中的英文部分会标上 lang="en"（见 uiText）。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { uiText } from '../../core/text/bilingual.js';

function labelNode(label) {
  if (!label) return null;
  return h('span', { class: 'btn__label' }, typeof label === 'string' ? uiText(label) : label);
}

/**
 * Variants: primary | secondary | ghost | danger. Sizes: sm | md | lg.
 * 样式变体：primary 主按钮 | secondary 次按钮 | ghost 幽灵按钮 | danger 危险操作；尺寸：sm | md | lg。
 */
export function button({ label, iconName, variant = 'secondary', size = 'md', onClick, type = 'button', title, pressed, disabled, className, ariaLabel } = {}) {
  return h('button', {
    type,
    class: ['btn', `btn--${variant}`, `btn--${size}`, className],
    title,
    'aria-label': ariaLabel,
    'aria-pressed': pressed === undefined ? undefined : String(Boolean(pressed)),
    disabled,
    onclick: onClick,
  }, iconName ? icon(iconName) : null, labelNode(label));
}

export function linkButton({ label, href, iconName, variant = 'secondary', size = 'md', className, ariaLabel } = {}) {
  return h('a', {
    href,
    class: ['btn', `btn--${variant}`, `btn--${size}`, className],
    'aria-label': ariaLabel,
  }, iconName ? icon(iconName) : null, labelNode(label));
}

/** Changes the visible text of a button made by button() or linkButton(). 修改按钮的显示文字。 */
export function setButtonLabel(element, label) {
  const target = element?.querySelector('.btn__label');
  if (target) replaceContent(target, typeof label === 'string' ? uiText(label) : label);
}
