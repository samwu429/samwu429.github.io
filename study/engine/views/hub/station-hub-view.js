/**
 * Station hub (study/index.html): a standalone page, outside the course shell, listing every course
 * of courses/registry.json plus a placeholder for courses to come.
 * 工作站总入口（study/index.html）：独立页面（不在课程外壳内），列出 registry.json 中的全部课程并预留新课位置。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, toBi, zhNode } from '../../core/text/bilingual.js';
import { renderInline } from '../../core/text/inline-markup.js';
import { badge } from '../../components/badges/badge.js';
import { themeToggle } from '../../components/controls/theme-toggle.js';
import { hubCourses } from './hub-logic.js';

const DEFAULT_TITLE = { zh: 'Topphi 复习工作站', en: 'Topphi Study Station' };

function courseCard(course) {
  const meta = [course.term, course.school].filter(Boolean).join(' · ');
  const content = [
    h('div', { class: 'station-hub__course-top' },
      course.code ? h('span', { class: 'station-hub__code' }, renderInline(course.code)) : null,
      course.status ? badge(`${course.status.zh} ${course.status.en}`, course.status.tone) : null),
    h('h3', { class: 'station-hub__course-title' }, course.title ? biTitle(course.title) : renderInline(course.code)),
    meta ? h('p', { class: 'station-hub__meta' }, renderInline(meta)) : null,
    course.description
      ? h('div', { class: 'station-hub__desc' },
        zhNode(course.description.zh, 'label', 'p', 'station-hub__desc-zh'),
        enNode(course.description.en, 'p', 'station-hub__desc-en'))
      : null,
    course.href
      ? h('span', { class: 'station-hub__cta' }, '进入复习站 Open course', icon('arrowRight', { size: 16 }))
      : h('span', { class: 'station-hub__cta station-hub__cta--muted' }, '即将开放 Opening soon'),
  ];
  return h('li', { class: 'station-hub__course-item' }, course.href
    ? h('a', { class: 'card card--link station-hub__course', href: course.href }, content)
    : h('div', { class: 'card station-hub__course station-hub__course--closed' }, content));
}

export async function render(root, { registry, studyRoot, preferences } = {}) {
  await ensureStylesheet(new URL('./station-hub-view.css', import.meta.url));
  const station = registry?.station && typeof registry.station === 'object' ? registry.station : {};
  const title = toBi(station.title) || DEFAULT_TITLE;
  const tagline = toBi(station.tagline);
  const courses = hubCourses(registry, studyRoot);
  const main = h('main', { id: 'station-hub-main', class: 'station-hub__main', tabindex: '-1' },
    h('section', { class: 'station-hub__intro', 'aria-labelledby': 'station-hub-title' },
      h('p', { class: 'station-hub__eyebrow' }, '复习工作站 Study Station'),
      h('h1', { id: 'station-hub-title', class: 'station-hub__title' }, biTitle(title)),
      tagline
        ? h('div', { class: 'station-hub__tagline' },
          zhNode(tagline.zh, 'label', 'p', 'station-hub__tagline-zh'),
          enNode(tagline.en, 'p', 'station-hub__tagline-en'))
        : null),
    h('section', { class: 'station-hub__courses', 'aria-labelledby': 'station-hub-courses-title' },
      h('h2', { id: 'station-hub-courses-title', class: 'section-heading' }, biTitle({ zh: '课程', en: 'Courses' })),
      h('ul', { class: 'station-hub__grid', role: 'list' },
        courses.map(courseCard),
        h('li', { class: 'station-hub__course-item' },
          h('div', { class: 'station-hub__placeholder' },
            h('span', { class: 'station-hub__placeholder-mark', 'aria-hidden': 'true' }, '+'),
            h('p', { class: 'station-hub__placeholder-title' }, '更多课程即将加入 More courses coming'),
            h('p', { class: 'station-hub__placeholder-text' }, '新学期的课程会陆续放到这里。New courses will be added here.'))))));

  replaceContent(root,
    h('a', {
      class: 'skip-link',
      href: '#station-hub-main',
      onclick: (event) => {
        event.preventDefault();
        main.focus();
      },
    }, '跳到正文 Skip to content'),
    h('header', { class: 'station-hub__header' },
      h('div', { class: 'station-hub__bar' },
        h('a', { class: 'shell-brand station-hub__brand', href: studyRoot ? String(studyRoot) : './' },
          h('span', { class: 'shell-brand__mark', 'aria-hidden': 'true' }, 'T'),
          h('span', { class: 'station-hub__brand-text' }, 'Topphi Study')),
        h('div', { class: 'station-hub__tools' },
          themeToggle(preferences, { className: 'station-hub__theme' }),
          h('a', { class: 'btn btn--sm btn--ghost station-hub__home', href: 'https://topphi.com/', 'aria-label': '返回主站 Back to topphi.com' },
            icon('arrowLeft', { size: 16 }),
            h('span', { class: 'btn__label' }, '返回主站', h('span', { class: 'station-hub__home-en', lang: 'en' }, ' topphi.com')))))),
    main,
    h('footer', { class: 'station-hub__footer' },
      h('p', {}, '非官方复习资料，内容依据课程课件整理；考试安排以课程官方通知为准。'),
      h('p', { lang: 'en' }, 'Unofficial study notes based on the course slides. Always confirm test details with the official course pages.'),
      h('p', { class: 'station-hub__credit' }, 'Built by Yihang (Sam) Wu · ', h('a', { href: 'https://topphi.com/' }, 'topphi.com'))));
}
