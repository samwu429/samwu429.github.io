/**
 * Theme button shared by the course shell and the station hub; each press moves auto -> light -> dark.
 * The icon shows the scheme actually on screen (in auto mode it follows the device), and the name
 * says what the button does and which setting is active.
 * 课程外壳与工作站总入口共用的主题按钮，每按一次按 跟随系统 -> 浅色 -> 深色 切换。图标表示屏幕上实际显示的配色
 * （跟随系统时随设备变化），名称说明按钮的作用和当前设置。
 *
 * The button lives as long as the page, so its listeners are never removed.
 * 按钮与页面同生命周期，因此其监听器无需移除。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';

const ORDER = ['auto', 'light', 'dark'];
const NAMES = {
  auto: { zh: '跟随系统', en: 'Auto' },
  light: { zh: '浅色', en: 'Light' },
  dark: { zh: '深色', en: 'Dark' },
};

function darkQuery() {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}

export function themeToggle(preferences, { className } = {}) {
  if (!preferences || typeof preferences.current !== 'function') return null;
  const query = darkQuery();
  const toggle = h('button', {
    type: 'button',
    class: ['shell-tool', className],
    onclick: () => {
      // setTheme() fires preferences.EVENT, which runs sync(). setTheme() 会触发 preferences.EVENT，从而执行 sync()。
      preferences.setTheme(ORDER[(ORDER.indexOf(preferences.current().theme) + 1) % ORDER.length]);
    },
  });

  function sync() {
    const { theme } = preferences.current();
    const name = NAMES[theme] || NAMES.auto;
    const dark = theme === 'dark' || (theme !== 'light' && Boolean(query?.matches));
    toggle.title = `切换主题（现在：${name.zh}）Switch theme (now: ${name.en})`;
    replaceContent(toggle,
      icon(dark ? 'moon' : 'sun', { size: 16 }),
      h('span', { class: 'visually-hidden' },
        h('span', { lang: 'zh-CN' }, `切换主题，现在是${name.zh}`), ' ',
        h('span', { lang: 'en' }, `Switch theme, now ${name.en}`)));
  }

  window.addEventListener(preferences.EVENT, sync);
  if (typeof query?.addEventListener === 'function') query.addEventListener('change', sync);
  sync();
  return toggle;
}
