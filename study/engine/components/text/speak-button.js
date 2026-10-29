/**
 * Small button that reads an English sentence aloud; renders nothing when speech is unsupported.
 * 朗读英文句子的小按钮；浏览器不支持语音时不渲染。
 *
 * The button sits right next to its sentence, so its name stays short instead of repeating the
 * sentence, and each half of the name carries its own language.
 * 按钮紧挨着要朗读的句子，所以名称保持简短、不再重复整句，名称的中英两半各自带上语言标记。
 */
import { h } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { canSpeak, speak } from '../../core/text/speech.js';

export function speakButton(text, { className } = {}) {
  if (!canSpeak() || !text) return null;
  return h('button', {
    type: 'button',
    class: ['speak-btn', className],
    title: '朗读英文 Read aloud',
    onclick: (event) => {
      event.stopPropagation();
      speak(text);
    },
  },
  icon('speaker', { size: 16 }),
  h('span', { class: 'visually-hidden' },
    h('span', { lang: 'zh-CN' }, '朗读英文'), ' ',
    h('span', { lang: 'en' }, 'Read aloud')));
}
