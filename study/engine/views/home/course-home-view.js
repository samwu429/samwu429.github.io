/**
 * Course home (#/): hero with exam countdowns, continue card, newcomer guide, big-picture map,
 * lecture and lab cards, study tools, assessments and course links.
 * 课程首页（#/）：考试倒计时、继续学习、新手指南、知识地图、讲课与实验卡片、复习工具、考核方式与课程链接。
 *
 * Everything comes from course.json; course-overview.json only adds texts and is optional.
 * 所有结构都来自 course.json；course-overview.json 只补充文字，缺失时页面照常可用。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { PLAN_UNIT_PREFIX } from '../../core/state/progress-store.js';
import { biTitle, enNode, toBi, zhNode } from '../../core/text/bilingual.js';
import { renderInline } from '../../core/text/inline-markup.js';
import { unitName } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';
import { linkButton } from '../../components/controls/button.js';
import { badge } from '../../components/badges/badge.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { loadingState } from '../../components/feedback/states.js';
import {
  buildBranchMap,
  countdown,
  datedAssessments,
  monthDay,
  overallProgress,
  relativeDay,
  resolveContinue,
  sectionIdsOf,
  splitUnits,
  totalWeight,
} from './home-logic.js';
import { normalizePlans, planTaskKeys } from './study-plan-logic.js';

const TOOLS = [
  { href: '#/practice', iconName: 'pencil', zh: '刷题练习', en: 'Practice', desc: '按课做题，马上看解析 By unit, with explanations' },
  { href: '#/mock', iconName: 'clock', zh: '模拟考试', en: 'Mock exam', desc: '限时模拟真实测验 Timed, like the real test' },
  { href: '#/mistakes', iconName: 'flag', zh: '错题本', en: 'Mistakes', desc: '答错的题自动收集 Wrong answers, collected', showMistakes: true },
  { href: '#/glossary', iconName: 'translate', zh: '术语表', en: 'Glossary', desc: '英文定义 + 中文解释 Terms explained' },
  { href: '#/flashcards', iconName: 'cards', zh: '闪卡', en: 'Flashcards', desc: '一张张记住英文术语 Learn terms card by card' },
  { href: '#/cheatsheet', iconName: 'bolt', zh: '考前速记', en: 'Cheat sheet', desc: '每课要点一页看完 Key points on one page' },
  { href: '#/toolkit', iconName: 'target', zh: '英文答题工具箱', en: 'Exam English', desc: '答题模板与常用句型 Templates and phrases' },
  { href: '#/plan', iconName: 'calendar', zh: '学习计划', en: 'Study plan', desc: '按天打勾的冲刺计划 Day-by-day checklist' },
  { href: '#/settings', iconName: 'grid', zh: '设置与备份', en: 'Settings', desc: '语言模式、主题、进度备份 Modes and backup' },
];

// Shown when course-overview.json is missing, so newcomers still get a starting route.
// course-overview.json 缺失时使用，保证新同学仍然知道从哪里开始。
const DEFAULT_GUIDE = [
  { zh: '先在“学习”里按顺序读讲义：中文把概念讲明白，英文术语跟着记。', en: 'Read the lessons in order: Chinese explains, English terms come along.' },
  { zh: '每学完一课就去“刷题”，做错的题会自动进“错题本”。', en: 'Practise after each lesson; wrong answers go to the mistake book.' },
  { zh: '用“闪卡”和“术语表”记英文术语，因为考试只用英文。', en: 'Use flashcards and the glossary, because the tests are in English.' },
  { zh: '考前看“考前速记”和“英文答题工具箱”，再做一次模拟考。', en: 'Before a test: cheat sheet, exam toolkit, then a mock exam.' },
];

const BRANCH_TONES = 4;

function list(value) {
  return Array.isArray(value) ? value : [];
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Chinese teaching text followed by its English version.
 * 中文讲解在前，英文对照在后。
 */
function pair(value, className) {
  const bi = toBi(value);
  if (!bi) return null;
  return h('div', { class: ['course-home__pair', className] },
    zhNode(bi.zh, 'teach', 'p', 'course-home__zh'),
    enNode(bi.en, 'p', 'course-home__en'));
}

function section(id, title, ...children) {
  return h('section', { class: 'course-home__section', 'aria-labelledby': id },
    h('h2', { id, class: 'section-heading' }, biTitle(title)),
    children);
}

function unitText(unit) {
  const label = unitName(unit);
  return `${label.zh} · ${label.en}`;
}

function unitDone(progress, unit) {
  const sectionIds = sectionIdsOf(unit);
  if (!sectionIds.length) return { done: 0, total: 0, complete: false };
  const { done, total } = progress.unitProgress(unit.id, sectionIds);
  return { done, total, complete: total > 0 && done >= total };
}

function countdownList(assessments, now) {
  const entries = datedAssessments(assessments, now);
  if (!entries.length) return null;
  return h('ul', { class: 'course-home__countdown', role: 'list', 'aria-label': '考试倒计时 Countdown' },
    entries.map((entry) => {
      const name = toBi(entry.assessment.name);
      const nameText = name ? name.en || name.zh : String(entry.assessment.id || '');
      const { state } = entry.countdown;
      return h('li', {
        class: ['course-home__chip', `course-home__chip--${state}`, entry.isNext && 'course-home__chip--next'],
        title: `${nameText}: ${entry.day.en}, ${entry.countdown.en}`,
      },
      icon(state === 'past' ? 'check' : 'clock', { size: 16 }),
      h('span', { class: 'course-home__chip-name' }, renderInline(nameText)),
      h('span', { class: 'course-home__chip-sep', 'aria-hidden': 'true' }, '·'),
      h('span', {}, entry.day.zh),
      h('span', { class: 'course-home__chip-sep', 'aria-hidden': 'true' }, '·'),
      h('strong', { class: 'course-home__chip-count' }, entry.countdown.zh));
    }));
}

function heroSection(course, overview, now) {
  const title = toBi(course.title);
  const meta = [course.code || course.shortCode, course.term, course.school].filter(hasText);
  return h('section', { class: 'course-home__hero', 'aria-labelledby': 'course-home-title' },
    meta.length ? h('p', { class: 'course-home__eyebrow' }, renderInline(meta.join(' · '))) : null,
    h('h1', { id: 'course-home-title', class: 'course-home__title' }, title ? biTitle(title) : renderInline(course.code || course.id || '')),
    hasText(course.instructor)
      ? h('p', { class: 'course-home__instructor' }, h('span', { class: 'course-home__muted' }, '授课老师 Instructor'), ' ', renderInline(course.instructor))
      : null,
    pair(overview?.welcome, 'course-home__welcome'),
    countdownList(course.assessments, now));
}

function continueCard(context, units, now) {
  const { progress, repo } = context;
  const target = resolveContinue(progress.lastVisited(), units);
  const overall = overallProgress(units, (unitId, sectionIds) => progress.unitProgress(unitId, sectionIds));
  const firstUnit = splitUnits(units).lectures[0] || units.find((unit) => unit && isRouteId(unit.id));

  let body;
  if (target) {
    const title = toBi(target.unit.title);
    const sectionSlot = h('span', { class: 'course-home__continue-section' });
    const when = relativeDay(target.at, now);
    if (target.sectionId) {
      // The section title lives in the lesson file, which the lesson page will need anyway.
      // 小节标题在讲义文件里；反正点进去也要加载这个文件，这里顺便取标题。
      repo.lesson(target.unit.id)
        .then((lesson) => {
          const found = list(lesson?.sections).find((candidate) => candidate && candidate.id === target.sectionId);
          const sectionTitle = toBi(found?.title);
          if (sectionTitle) replaceContent(sectionSlot, h('span', { class: 'course-home__muted' }, '上次学到 Last time:'), ' ', biTitle(sectionTitle));
        })
        .catch(() => {});
    }
    body = [
      h('p', { class: 'course-home__kicker' }, icon('book', { size: 16 }), '继续学习 Continue'),
      h('h2', { class: 'course-home__card-title' },
        h('span', { class: 'course-home__unit-tag' }, unitText(target.unit)),
        title ? biTitle(title) : target.unit.id),
      h('p', { class: 'course-home__continue-meta' },
        sectionSlot,
        when ? h('span', { class: 'course-home__muted course-home__when' }, icon('clock', { size: 14 }), `${when.zh} ${when.en}`) : null),
      linkButton({ label: '接着学 Continue', href: target.href, iconName: 'arrowRight', variant: 'primary' }),
    ];
  } else {
    body = [
      h('p', { class: 'course-home__kicker' }, icon('book', { size: 16 }), '从这里开始 Start here'),
      h('h2', { class: 'course-home__card-title' }, '还没开始？从第一课读起 New here? Begin with the first lesson'),
      h('p', { class: 'course-home__continue-meta course-home__muted' }, '每课都从零讲起，不需要任何基础。Every lesson starts from zero.'),
      firstUnit ? linkButton({ label: `开始 ${unitName(firstUnit).zh} Start`, href: `#/learn/${firstUnit.id}`, iconName: 'arrowRight', variant: 'primary' }) : null,
    ];
  }

  return h('section', { class: 'card course-home__continue', 'aria-label': '继续学习 Continue learning' },
    h('div', { class: 'course-home__continue-main' }, body),
    overall.total
      ? h('div', { class: 'course-home__overall' },
        h('p', { class: 'course-home__overall-label' }, '全课进度 Course progress'),
        progressBar(overall.done, overall.total, { label: '全课进度 Course progress' }),
        h('p', { class: 'course-home__muted course-home__small' }, `已学完 ${overall.done} / ${overall.total} 个小节 sections done`))
      : null);
}

function plansCard(plans, progress) {
  if (!plans.length) return null;
  return h('section', { class: 'card course-home__plans', 'aria-labelledby': 'course-home-plans-title' },
    h('h2', { id: 'course-home-plans-title', class: 'course-home__kicker' }, icon('calendar', { size: 16 }), '学习计划 Study plans'),
    h('ul', { class: 'course-home__plan-list', role: 'list' }, plans.map((plan) => {
      const { done, total } = progress.unitProgress(plan.storageId, planTaskKeys(plan));
      const slug = plan.storageId.slice(PLAN_UNIT_PREFIX.length);
      return h('li', { class: 'course-home__plan' },
        h('a', { class: 'course-home__plan-link', href: `#/plan?plan=${encodeURIComponent(slug)}` },
          plan.title ? biTitle(plan.title) : '学习计划 Study plan',
          icon('arrowRight', { size: 14 })),
        progressBar(done, total, { label: `${plan.title?.zh || plan.title?.en || '学习计划'} 完成度 Plan progress`, size: 'sm' }));
    })));
}

function guideSection(overview, isNewcomer) {
  const steps = list(overview?.howToUse).map(toBi).filter(Boolean);
  return h('details', { class: 'course-home__guide', open: isNewcomer },
    h('summary', { class: 'course-home__guide-summary' },
      icon('map', { size: 20 }),
      h('h2', { class: 'course-home__guide-title' }, biTitle({ zh: '新手指南', en: 'How to use this site' })),
      h('span', { class: 'course-home__guide-chevron' }, icon('chevronDown', { size: 18 }))),
    h('ol', { class: 'course-home__guide-steps', role: 'list' },
      (steps.length ? steps : DEFAULT_GUIDE).map((step) => h('li', { class: 'course-home__guide-step' }, pair(step)))));
}

function unitLink(unit, progress) {
  const title = toBi(unit.title);
  const { complete } = unitDone(progress, unit);
  return h('a', { class: ['course-home__map-unit', complete && 'course-home__map-unit--done'], href: `#/learn/${unit.id}`, title: title?.en || undefined },
    h('span', { class: 'course-home__unit-tag' }, unitName(unit).zh),
    zhNode(title?.zh, 'label', 'span', 'course-home__map-unit-title')
      || enNode(title?.en || unit.id, 'span', 'course-home__map-unit-title'),
    complete ? h('span', { class: 'course-home__map-check', title: '已学完 Done' }, icon('check', { size: 14, label: '已学完 Done' })) : null);
}

function unitChip(unit) {
  if (!unit) return null;
  const title = toBi(unit.title);
  const label = unitName(unit);
  return h('a', { class: 'course-home__chip-link', href: `#/learn/${unit.id}`, title: title ? `${title.zh} ${title.en}`.trim() : undefined },
    label.zh, ' ', h('span', { lang: 'en', class: 'course-home__chip-link-en' }, label.en));
}

function bigPictureSection(course, overview, progress) {
  const bigPicture = overview?.bigPicture && typeof overview.bigPicture === 'object' ? overview.bigPicture : {};
  const map = buildBranchMap({ courseBranches: course.branches, units: course.units, overviewBranches: bigPicture.branches });
  const branches = map.branches.filter((branch) => branch.units.length || branch.summary);
  const unitById = new Map(list(course.units).filter((unit) => unit && isRouteId(unit.id)).map((unit) => [unit.id, unit]));
  const connections = list(overview?.lessonLinks)
    .filter((link) => link && typeof link === 'object')
    .map((link) => ({ from: unitById.get(link.from), to: unitById.get(link.to), why: toBi(link.why) }))
    .filter((link) => link.from && link.to);
  const intro = toBi(bigPicture.intro);
  if (!branches.length && !map.threads.length && !connections.length) return null;

  return section('course-home-map', { zh: '知识地图', en: 'The big picture' },
    intro ? pair(intro, 'course-home__intro') : null,
    branches.length || map.others.length
      ? h('ol', { class: 'course-home__branches', role: 'list' },
        branches.map((branch, index) => h('li', { class: ['course-home__branch', `course-home__branch--${(index % BRANCH_TONES) + 1}`] },
          h('span', { class: 'course-home__branch-index', 'aria-hidden': 'true' }, String(index + 1)),
          h('h3', { class: 'course-home__branch-title' }, branch.title ? biTitle(branch.title) : branch.id),
          pair(branch.summary, 'course-home__branch-summary'),
          branch.units.length
            ? h('ul', { class: 'course-home__map-units', role: 'list' }, branch.units.map((unit) => h('li', {}, unitLink(unit, progress))))
            : null)),
        map.others.length
          ? h('li', { class: 'course-home__branch course-home__branch--other' },
            h('h3', { class: 'course-home__branch-title' }, biTitle({ zh: '其他单元', en: 'Other units' })),
            h('ul', { class: 'course-home__map-units', role: 'list' }, map.others.map((unit) => h('li', {}, unitLink(unit, progress)))))
          : null)
      : null,
    map.threads.length
      ? h('div', { class: 'course-home__threads' },
        h('h3', { class: 'course-home__sub-title' }, biTitle({ zh: '贯穿全课的主线', en: 'Threads across the course' })),
        map.threads.map((thread) => h('article', { class: 'course-home__thread' },
          h('h4', { class: 'course-home__thread-title' }, thread.title ? biTitle(thread.title) : thread.id),
          pair(thread.summary),
          thread.units.length ? h('ul', { class: 'course-home__map-units course-home__map-units--inline', role: 'list' }, thread.units.map((unit) => h('li', {}, unitLink(unit, progress)))) : null)))
      : null,
    connections.length
      ? h('div', { class: 'course-home__connections' },
        h('h3', { class: 'course-home__sub-title' }, biTitle({ zh: '课与课怎么连起来', en: 'How the lessons connect' })),
        h('ul', { class: 'course-home__connection-list', role: 'list' }, connections.map((link) => h('li', { class: 'course-home__connection' },
          h('div', { class: 'course-home__connection-route' },
            unitChip(link.from),
            h('span', { class: 'course-home__connection-arrow' }, icon('arrowRight', { size: 16, label: '通向 leads to' })),
            unitChip(link.to)),
          pair(link.why)))))
      : null);
}

function unitCard(unit, progress) {
  const title = toBi(unit.title);
  const { done, total, complete } = unitDone(progress, unit);
  const label = unitName(unit);
  let status = null;
  if (complete) status = badge('已学完 Done', 'accent');
  else if (done) status = badge('学习中 In progress', 'neutral');
  return h('li', { class: 'course-home__unit-item' },
    h('a', { class: ['card', 'card--link', 'course-home__unit', complete && 'course-home__unit--done'], href: `#/learn/${unit.id}` },
      h('span', { class: 'course-home__unit-label' }, `${label.zh} · ${label.en}`),
      h('h3', { class: 'course-home__unit-title' }, title ? biTitle(title) : unit.id),
      h('div', { class: 'course-home__unit-foot' },
        total
          ? progressBar(done, total, { label: `${label.zh} 学习进度 ${label.en} progress`, size: 'sm' })
          : h('span', { class: 'course-home__unit-start' }, '开始学习 Start', icon('arrowRight', { size: 14 })),
        status)));
}

function unitsSection(id, title, units, progress) {
  if (!units.length) return null;
  return section(id, title, h('ul', { class: 'course-home__units', role: 'list' }, units.map((unit) => unitCard(unit, progress))));
}

function toolsSection(progress) {
  const mistakes = list(progress.mistakes()).length;
  return section('course-home-tools', { zh: '复习工具', en: 'Study tools' },
    h('ul', { class: 'course-home__tools', role: 'list' }, TOOLS.map((tool) => h('li', {},
      h('a', { class: 'course-home__tool', href: tool.href },
        h('span', { class: 'course-home__tool-icon' }, icon(tool.iconName, { size: 20 })),
        h('span', { class: 'course-home__tool-body' },
          h('span', { class: 'course-home__tool-name' }, tool.zh, ' ', h('span', { class: 'course-home__tool-en', lang: 'en' }, tool.en)),
          h('span', { class: 'course-home__tool-desc' }, tool.desc)),
        tool.showMistakes && mistakes ? badge(`${mistakes} 道待复习 to review`, 'danger', { className: 'course-home__tool-badge' }) : null)))));
}

function assessmentRow(item, now) {
  const name = toBi(item.name);
  const detail = toBi(item.detail);
  const day = monthDay(item.date);
  const state = countdown(item.date, now)?.state;
  return h('tr', { class: state === 'past' ? 'course-home__row--past' : null },
    h('th', { scope: 'row', class: 'course-home__assess-name' },
      h('span', { class: 'course-home__assess-title' }, name ? biTitle(name) : String(item.id || '')),
      detail
        ? h('span', { class: 'course-home__assess-detail' }, zhNode(detail.zh, 'teach', 'span', 'course-home__zh'), enNode(detail.en, 'span', 'course-home__en'))
        : null),
    h('td', { class: 'course-home__assess-weight' }, typeof item.weight === 'number' && Number.isFinite(item.weight) ? `${item.weight}%` : '—'),
    h('td', { class: 'course-home__assess-date' },
      day
        ? [h('span', { class: 'course-home__date-zh' }, day.zh), h('span', { class: 'course-home__en', lang: 'en' }, day.en), state === 'past' ? badge('已结束 Done', 'muted') : null]
        : h('span', { class: 'course-home__muted', title: '日期待定 To be announced' }, '待定 TBA')));
}

function assessmentsSection(course, now) {
  const items = list(course.assessments).filter((item) => item && typeof item === 'object');
  const format = toBi(course.examFormat);
  if (!items.length && !format) return null;
  const total = totalWeight(items);
  return section('course-home-assessments', { zh: '考核与考试', en: 'Assessments and exams' },
    items.length
      ? h('div', { class: 'table-scroll course-home__table-wrap', tabindex: '0', role: 'region', 'aria-labelledby': 'course-home-assessments-caption' },
        h('table', { class: 'data-table course-home__table' },
          h('caption', { class: 'visually-hidden', id: 'course-home-assessments-caption' }, '考核方式、占比与日期 Assessments, weights and dates'),
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col' }, '考核 Assessment'),
            h('th', { scope: 'col' }, '占比 Weight'),
            h('th', { scope: 'col' }, '日期 Date'))),
          h('tbody', {}, items.map((item) => assessmentRow(item, now))),
          total ? h('tfoot', {}, h('tr', {},
            h('th', { scope: 'row' }, '合计 Total'),
            h('td', { class: 'course-home__assess-weight' }, `${total}%`),
            h('td', {}))) : null))
      : null,
    format
      ? h('div', { class: 'callout callout--info course-home__format' },
        h('span', { class: 'callout__label' }, '考试形式 Exam format'),
        pair(format))
      : null);
}

function linksSection(course) {
  const links = list(course.links).filter((link) => link && hasText(link.href) && /^https?:\/\//i.test(link.href));
  if (!links.length) return null;
  return section('course-home-links', { zh: '课程链接', en: 'Course links' },
    h('ul', { class: 'course-home__ext-list', role: 'list' }, links.map((link) => {
      const label = toBi(link.label) || { zh: '', en: link.href };
      return h('li', {},
        h('a', { class: 'course-home__ext', href: link.href, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'course-home__ext-text' },
            zhNode(label.zh, 'label', 'span'),
            enNode(label.en, 'span', 'course-home__ext-en')),
          icon('external', { size: 16 }),
          h('span', { class: 'visually-hidden' }, '（在新标签页打开 opens in a new tab）')));
    })));
}

export async function render(container, context) {
  await ensureStylesheet(new URL('./course-home-view.css', import.meta.url));
  replaceContent(container, loadingState());

  // The overview only adds texts, so any failure degrades to the course.json-only page.
  // 课程总览只补充文字，加载失败时退回仅用 course.json 的页面。
  const overview = await context.repo.review('overview').catch(() => null);
  const { course, progress } = context;
  const units = list(course.units).filter((unit) => unit && isRouteId(unit.id));
  const groups = splitUnits(units);
  const now = new Date();
  const plans = normalizePlans(overview?.studyPlans);
  const isNewcomer = !resolveContinue(progress.lastVisited(), units);

  replaceContent(container, h('div', { class: 'course-home' },
    heroSection(course, overview, now),
    h('div', { class: ['course-home__start', plans.length && 'course-home__start--split'] },
      continueCard(context, units, now),
      plansCard(plans, progress)),
    guideSection(overview, isNewcomer),
    bigPictureSection(course, overview, progress),
    unitsSection('course-home-lectures', { zh: '讲课', en: 'Lectures' }, groups.lectures, progress),
    unitsSection('course-home-labs', { zh: '实验课', en: 'Labs' }, groups.labs, progress),
    unitsSection('course-home-other', { zh: '其他内容', en: 'More units' }, groups.others, progress),
    toolsSection(progress),
    assessmentsSection(course, now),
    linksSection(course)));
}
