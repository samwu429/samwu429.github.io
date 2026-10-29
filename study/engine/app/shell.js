/**
 * Application chrome shared by every course page: header, navigation, language/theme controls, footer.
 * 所有课程页面共用的外壳：页头、导航、语言/主题切换与页脚。
 */
import { h } from '../core/dom/element.js';
import { icon } from '../core/dom/icons.js';
import { pickText } from '../core/text/bilingual.js';
import { segmented, setSegmentedValue } from '../components/controls/segmented.js';
import { themeToggle } from '../components/controls/theme-toggle.js';
import { revealToggle } from './language-reveal.js';
import { NAV_ITEMS } from './routes.js';

const LANGUAGE_OPTIONS = [
  { value: 'balanced', label: '中英', title: '中文讲解 + 英文术语（推荐）Balanced' },
  { value: 'zh-first', label: '中文', title: '显示全部中文翻译 Show all Chinese' },
  { value: 'en-practice', label: 'EN', title: '英文练习：中文先模糊，点一下才显示 English practice' },
];

/**
 * Keeps --header-height equal to the sticky header's real height. The header wraps onto two rows on
 * narrow screens, and section jumps (scroll-padding-top), the sticky contents and the lesson's
 * reading band all sit below it.
 * 让 --header-height 始终等于吸顶页头的实际高度。窄屏时页头会折成两行，而小节跳转（scroll-padding-top）、
 * 吸顶目录与课程页的阅读带都要排在页头下方。
 */
function trackHeaderHeight(header) {
  if (typeof window.ResizeObserver !== 'function') return;
  const observer = new window.ResizeObserver(() => {
    const height = Math.ceil(header.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty('--header-height', `${height}px`);
  });
  observer.observe(header);
}

export function createShell(root, { course, studyRoot, preferences }) {
  const navLinks = new Map();
  const nav = h('nav', { class: 'shell-nav', 'aria-label': '课程导航 Course navigation' },
    h('div', { class: 'shell-nav__inner' }, NAV_ITEMS.map((item) => {
      const link = h('a', { class: 'shell-nav__link', href: item.href },
        icon(item.iconName, { size: 16 }),
        h('span', { class: 'shell-nav__zh', lang: 'zh-CN' }, item.zh),
        h('span', { class: 'shell-nav__en', lang: 'en' }, item.en));
      navLinks.set(item.id, link);
      return link;
    })));

  const languageControl = segmented({
    options: LANGUAGE_OPTIONS,
    value: preferences.current().languageMode,
    ariaLabel: '语言模式 Language mode',
    size: 'sm',
    className: 'shell-language',
    onChange: (mode) => preferences.setLanguageMode(mode),
  });

  // The settings page can change the same preferences, so the header mirrors every change.
  // 设置页也能修改同一组偏好，因此页头控件随每次修改同步更新。
  window.addEventListener(preferences.EVENT, () => {
    setSegmentedValue(languageControl, preferences.current().languageMode);
  });

  const header = h('header', { class: 'shell-header' },
    h('div', { class: 'shell-header__bar' },
      h('a', { class: 'shell-brand', href: String(studyRoot), title: '复习工作站首页 Study Station' },
        h('span', { class: 'shell-brand__mark', 'aria-hidden': 'true' }, 'T'),
        h('span', { class: 'shell-brand__text' }, 'Topphi Study')),
      h('a', { class: 'shell-course', href: '#/', title: pickText(course.title, 'en') },
        h('span', { class: 'shell-course__code' }, course.shortCode || course.code),
        h('span', { class: 'shell-course__title', lang: 'zh-CN' }, pickText(course.title, 'zh'))),
      h('div', { class: 'shell-header__tools' },
        languageControl,
        revealToggle({ className: 'shell-reveal' }),
        themeToggle(preferences),
        h('a', { class: 'shell-tool', href: '#/settings', title: '设置与进度 Settings' },
          icon('grid', { size: 16 }),
          h('span', { class: 'visually-hidden' }, h('span', { lang: 'zh-CN' }, '设置与进度'), ' ', h('span', { lang: 'en' }, 'Settings'))))),
    nav);

  const main = h('main', { id: 'main', class: 'shell-main', tabindex: '-1' });

  const footer = h('footer', { class: 'shell-footer' },
    h('p', {}, '非官方复习资料，内容依据课程课件整理；考试安排以 Quercus / Piazza 为准。'),
    h('p', { lang: 'en' }, 'Unofficial study notes based on the course slides. Always confirm test details on Quercus and Piazza.'),
    h('p', { class: 'shell-footer__credit', lang: 'en' },
      'Built by Yihang (Sam) Wu · ',
      h('a', { href: 'https://topphi.com/' }, 'topphi.com')));

  root.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onclick: (event) => { event.preventDefault(); main.focus(); } },
      '跳到正文 ', h('span', { lang: 'en' }, 'Skip to content')),
    header, main, footer);
  trackHeaderHeight(header);

  return {
    main,
    setActiveNav(navId) {
      for (const [id, link] of navLinks) {
        if (id === navId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
  };
}
