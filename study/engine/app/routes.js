/**
 * Route table of a course site. Views are loaded lazily so the first page stays light.
 * 课程站点的路由表。视图按需加载，保证首屏轻量。
 *
 * `nav` names the top-navigation item highlighted for the route.
 * `nav` 指定该路由高亮的顶部导航项。
 *
 * Query parameters each view reads (all optional; lists are comma-separated ids):
 * 各视图读取的查询参数（均可省略；列表为逗号分隔的 id）：
 *   /practice/run  units=<ids|all> (unit= also works), types=<types|all>, count=<n>,
 *                  mode=ordered|random|mistakes, ids=<question ids>
 *   /glossary      q=<search>, unit=<ids>, sort=az|unit
 *   /flashcards    unit=<ids>, dir=en-zh|zh-en, only=unfamiliar, size=20|40|all, order=course
 *   /cheatsheet    unit=<lesson id>
 *   /toolkit       tab=<section id>
 *   /plan          plan=<plan id>
 */

export const NAV_ITEMS = [
  { id: 'home', href: '#/', zh: '首页', en: 'Home', iconName: 'home' },
  { id: 'learn', href: '#/learn', zh: '学习', en: 'Learn', iconName: 'book' },
  { id: 'practice', href: '#/practice', zh: '刷题', en: 'Practice', iconName: 'pencil' },
  { id: 'glossary', href: '#/glossary', zh: '术语', en: 'Glossary', iconName: 'translate' },
  { id: 'flashcards', href: '#/flashcards', zh: '闪卡', en: 'Cards', iconName: 'cards' },
  { id: 'cheatsheet', href: '#/cheatsheet', zh: '速记', en: 'Cheat sheet', iconName: 'bolt' },
  { id: 'toolkit', href: '#/toolkit', zh: '答题', en: 'Exam English', iconName: 'target' },
];

export const ROUTES = [
  { name: 'home', path: '/', nav: 'home', load: () => import('../views/home/course-home-view.js') },
  { name: 'plan', path: '/plan', nav: 'home', load: () => import('../views/home/study-plan-view.js') },
  { name: 'settings', path: '/settings', nav: null, load: () => import('../views/settings/settings-view.js') },
  { name: 'units', path: '/learn', nav: 'learn', load: () => import('../views/lesson/unit-list-view.js') },
  { name: 'lesson', path: '/learn/:unitId/:sectionId?', nav: 'learn', load: () => import('../views/lesson/lesson-view.js') },
  { name: 'practice', path: '/practice', nav: 'practice', load: () => import('../views/practice/practice-hub-view.js') },
  { name: 'practice-run', path: '/practice/run', nav: 'practice', load: () => import('../views/practice/practice-session-view.js') },
  { name: 'mistakes', path: '/mistakes', nav: 'practice', load: () => import('../views/practice/mistakes-view.js') },
  { name: 'mock', path: '/mock', nav: 'practice', load: () => import('../views/practice/mock-exam-view.js') },
  { name: 'glossary', path: '/glossary/:termId?', nav: 'glossary', load: () => import('../views/glossary/glossary-view.js') },
  { name: 'flashcards', path: '/flashcards', nav: 'flashcards', load: () => import('../views/flashcards/flashcards-view.js') },
  { name: 'cheatsheet', path: '/cheatsheet', nav: 'cheatsheet', load: () => import('../views/review/cheatsheet-view.js') },
  { name: 'toolkit', path: '/toolkit', nav: 'toolkit', load: () => import('../views/review/exam-toolkit-view.js') },
];
