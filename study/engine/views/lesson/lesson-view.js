/**
 * Lesson page (#/learn/:unitId/:sectionId?): header with outcomes and progress, the contents, every
 * section with its blocks and a "learned" toggle, then summary, exam focus and next steps.
 * 课程页：页头（学习目标与进度）、目录、各小节的内容块与“我学会了”开关，最后是总结、考点清单与下一步。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, hasText, pickText, zhNode } from '../../core/text/bilingual.js';
import { canSpeak } from '../../core/text/speech.js';
import { badge, levelBadge } from '../../components/badges/badge.js';
import { button, linkButton } from '../../components/controls/button.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { emptyState, errorState, loadingState } from '../../components/feedback/states.js';
import { speakButton } from '../../components/text/speak-button.js';
import { createBlockScope, ensureBlockStyles, renderBlocks } from './blocks/block-registry.js';
import { asBi, listOf } from './blocks/lesson-block.js';
import { createLessonToc, stylesheet as tocStylesheet } from './toc/lesson-toc.js';
import { observeSections } from './section-spy.js';
import {
  displayTitle,
  isPlainClick,
  lessonHref,
  minutesLabel,
  neighbourUnits,
  normalizeSections,
  practiceHref,
  sectionNumber,
  slidesLabel,
  unitKindLabel,
} from './lesson-model.js';

// The reading position is saved only after real scrolling, so the router's scroll-to-top on entry
// cannot overwrite the place where the learner stopped last time.
// 阅读位置要等到真正的滚动之后才保存，避免进入页面时路由自带的“回到顶部”覆盖上次停下的位置。
const ARM_DELAY_MS = 600;
// After a jump, the scroll spy stays quiet briefly so sections passed on the way do not take over.
// 跳转后短暂忽略滚动侦测，避免途经的小节抢走“当前小节”。
const JUMP_LOCK_MS = 900;
const LEVELS = ['core', 'exam', 'extra'];

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runSafely(fn) {
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
}

function replaceRoute(unitId, sectionId) {
  const href = lessonHref(unitId, sectionId);
  if (window.location.hash === href) return;
  try {
    window.history.replaceState(window.history.state, '', href);
  } catch {
    // Some browsers rate-limit history updates; the address bar then simply stays as it was.
    // 部分浏览器会限制历史记录的更新频率，此时地址栏保持不变即可。
  }
}

function backToLessons() {
  return linkButton({ label: '回到课程目录 All lessons', href: '#/learn', iconName: 'arrowLeft' });
}

// A section title on one line, in Chinese when it has one, for compact links and banners.
// 单行显示的小节标题（有中文时用中文），用于紧凑的链接与横幅。
function sectionName(section, className) {
  const title = asBi(section.title);
  return title?.zh ? zhNode(title.zh, 'label', 'span', className) : enNode(title?.en || section.id, 'span', className);
}

function metaItem(iconName, ...content) {
  return h('li', { class: 'lesson-view__meta-item' }, icon(iconName, { size: 16 }), h('span', {}, content));
}

function sourceText(source) {
  const pages = Number(source.pages);
  return Number.isFinite(pages) && pages > 0 ? `${source.file} · ${pages} 页 pages` : source.file;
}

function renderHeader({ lesson, unit, kind, title, sectionCount, branch, headerProgress, resume }) {
  const minutes = minutesLabel(lesson.estimatedMinutes ?? unit.estimatedMinutes);
  const sources = listOf(lesson.sources).filter((source) => hasText(source.file));
  const outcomes = listOf(lesson.outcomes).filter((item) => hasText(item.en) || hasText(item.zh));
  const oneLiner = asBi(lesson.oneLiner) || asBi(unit.oneLiner);

  return h('header', { class: 'lesson-view__header' },
    h('nav', { class: 'lesson-view__crumbs', 'aria-label': '当前位置 Breadcrumb' },
      h('ol', { class: 'lesson-view__crumbs-list' },
        h('li', {}, h('a', { href: '#/learn' }, '学习 Learn')),
        h('li', {}, h('span', { 'aria-current': 'page' }, `${kind.zh} · ${pickText(title, 'zh')}`)))),
    h('p', { class: 'lesson-view__eyebrow' }, `${kind.zh} · ${kind.en}`),
    h('h1', { class: 'lesson-view__title' }, biTitle(title)),
    oneLiner ? h('div', { class: 'lesson-view__oneliner' },
      zhNode(oneLiner.zh, 'teach', 'p', 'lesson-view__oneliner-zh'),
      enNode(oneLiner.en, 'p', 'lesson-view__oneliner-en')) : null,
    h('ul', { class: 'lesson-view__meta', role: 'list' },
      minutes ? metaItem('clock', `${minutes.zh} · ${minutes.en}`) : null,
      metaItem('list', `${sectionCount} 节 sections`),
      sources.map((source) => metaItem('book', '课件 Slides: ', h('span', { lang: 'en' }, sourceText(source)))),
      branch ? h('li', { class: 'lesson-view__meta-item' }, badge(pickText(branch, 'zh'), 'accent', { title: pickText(branch, 'en') })) : null),
    h('div', { class: 'lesson-view__progress' },
      h('span', { class: 'lesson-view__progress-label' }, icon('checkCircle', { size: 18 }), '已学会 Learned'),
      headerProgress),
    resume,
    outcomes.length ? h('section', { class: ['lesson-view__box', 'lesson-view__outcomes'], 'aria-labelledby': 'lesson-outcomes-title' },
      h('h2', { class: 'lesson-view__box-title', id: 'lesson-outcomes-title' },
        icon('flag', { size: 20 }),
        biTitle({ zh: '学完这一课你能…', en: 'Learning outcomes' })),
      h('ol', { class: 'lesson-view__outcomes-list', role: 'list' }, outcomes.map((item, index) => h('li', { class: 'lesson-view__outcome' },
        h('span', { class: 'lesson-view__outcome-num', 'aria-hidden': 'true' }, String(index + 1)),
        h('div', { class: 'lesson-view__outcome-body' },
          enNode(item.en, 'p', 'lesson-view__outcome-en'),
          zhNode(item.zh, hasText(item.en) ? 'gloss' : 'teach', 'p', 'lesson-view__outcome-zh')))))) : null);
}

function renderSection(section, index, { unitId, scope, progress }) {
  const titleId = `${section.id}--title`;
  const slides = slidesLabel(section.slides);
  const heading = h('h2', { class: 'lesson-section__title', id: titleId, tabindex: '-1' },
    h('span', { class: 'visually-hidden' }, `第 ${index + 1} 节 Section ${index + 1}: `),
    biTitle(asBi(section.title) || { en: section.id }));
  const doneFlag = h('span', { class: 'lesson-section__flag', hidden: true }, icon('checkCircle', { size: 14 }), '已学会 Learned');
  const toggle = button({
    label: '我学会了 Mark as learned',
    iconName: 'circle',
    variant: 'secondary',
    pressed: false,
    className: 'lesson-section__done',
    onClick: () => progress.setSectionDone(unitId, section.id, !progress.isSectionDone(unitId, section.id)),
  });

  const element = h('article', {
    class: 'lesson-section',
    id: section.id,
    'aria-labelledby': titleId,
    dataset: { level: LEVELS.includes(section.level) ? section.level : 'core' },
  },
  h('header', { class: 'lesson-section__header' },
    h('span', { class: 'lesson-section__number', 'aria-hidden': 'true' }, sectionNumber(index)),
    h('div', { class: 'lesson-section__heading' },
      heading,
      h('div', { class: 'lesson-section__meta' },
        levelBadge(section.level),
        slides ? badge(`课件 Slides ${slides}`, 'neutral', { title: '课件页码 Slide pages' }) : null,
        doneFlag))),
  h('div', { class: 'lesson-section__body' }, renderBlocks(section.blocks, scope)),
  h('footer', { class: 'lesson-section__footer' }, toggle));

  let shown = null;
  return {
    id: section.id,
    element,
    heading,
    setDone(done) {
      if (shown === done) return;
      shown = done;
      element.classList.toggle('is-done', done);
      doneFlag.hidden = !done;
      toggle.setAttribute('aria-pressed', String(done));
      toggle.querySelector('.icon')?.replaceWith(icon(done ? 'checkCircle' : 'circle'));
    },
  };
}

function sectionLink({ unitId, section, index, onGo }) {
  return h('a', {
    class: 'lesson-view__focus-link',
    href: lessonHref(unitId, section.id),
    onclick: (event) => {
      if (!isPlainClick(event)) return;
      event.preventDefault();
      onGo(section.id);
    },
  },
  icon('arrowRight', { size: 14 }),
  h('span', {}, `第 ${index + 1} 节 `, h('span', { lang: 'en' }, `Section ${index + 1}`), ' · '),
  sectionName(section));
}

function pagerLink(target, direction) {
  const kind = unitKindLabel(target);
  const isNext = direction === 'next';
  return h('a', {
    class: ['lesson-view__pager-link', `lesson-view__pager-link--${direction}`],
    href: lessonHref(target.id),
    rel: isNext ? 'next' : 'prev',
  },
  h('span', { class: 'lesson-view__pager-dir' },
    isNext ? null : icon('arrowLeft', { size: 16 }),
    isNext ? '下一课 Next' : '上一课 Previous',
    isNext ? icon('arrowRight', { size: 16 }) : null),
  h('span', { class: 'lesson-view__pager-kind' }, `${kind.zh} · ${kind.en}`),
  biTitle(asBi(target.title) || { en: target.id }, { className: 'lesson-view__pager-title' }));
}

function renderEnd({ lesson, unit, units, sections, onGo }) {
  const summary = listOf(lesson.summary).filter((item) => hasText(item.en) || hasText(item.zh));
  const focus = listOf(lesson.examFocus).filter((item) => hasText(item.en) || hasText(item.zh));
  const indexById = new Map(sections.map((section, index) => [section.id, index]));
  const { previous, next } = neighbourUnits(units, unit.id);

  return h('div', { class: 'lesson-view__end' },
    summary.length ? h('section', { class: ['lesson-view__box', 'lesson-view__summary'], 'aria-labelledby': 'lesson-summary-title' },
      h('h2', { class: 'lesson-view__box-title', id: 'lesson-summary-title' },
        icon('bolt', { size: 20 }),
        biTitle({ zh: '本课总结', en: 'Summary' })),
      h('p', { class: 'lesson-view__box-hint' }, canSpeak()
        ? '每一句都可以直接写进答案，点喇叭听读音。Every sentence is exam-ready; tap the speaker to hear it.'
        : '每一句都可以直接写进答案。Every sentence is exam-ready.'),
      h('ol', { class: 'lesson-view__summary-list', role: 'list' }, summary.map((item) => h('li', { class: 'lesson-view__summary-item' },
        hasText(item.en)
          ? h('p', { class: 'lesson-view__summary-en' }, enNode(item.en, 'span', 'lesson-view__summary-text'), speakButton(item.en))
          : null,
        zhNode(item.zh, hasText(item.en) ? 'gloss' : 'teach', 'p', 'lesson-view__summary-zh'))))) : null,
    focus.length ? h('section', { class: ['lesson-view__box', 'lesson-view__focus'], 'aria-labelledby': 'lesson-focus-title' },
      h('h2', { class: 'lesson-view__box-title', id: 'lesson-focus-title' },
        icon('target', { size: 20 }),
        biTitle({ zh: '考点清单', en: 'Exam focus' })),
      h('ul', { class: 'lesson-view__focus-list', role: 'list' }, focus.map((item) => {
        const index = indexById.get(item.sectionId);
        return h('li', { class: 'lesson-view__focus-item' },
          enNode(item.en, 'p', 'lesson-view__focus-en'),
          zhNode(item.zh, 'teach', 'p', 'lesson-view__focus-zh'),
          index === undefined ? null : sectionLink({ unitId: unit.id, section: sections[index], index, onGo }));
      }))) : null,
    h('nav', { class: 'lesson-view__next', 'aria-label': '下一步 Next steps' },
      linkButton({
        label: '练习这一课 Practice this lesson',
        href: practiceHref(unit.id),
        iconName: 'pencil',
        variant: 'primary',
        size: 'lg',
        className: 'lesson-view__practice',
      }),
      previous || next ? h('div', { class: 'lesson-view__pager' },
        previous ? pagerLink(previous, 'previous') : null,
        next ? pagerLink(next, 'next') : null) : null));
}

function mountLesson(container, context, unit, lesson, sections, requestedSectionId) {
  const { progress } = context;
  const unitId = unit.id;
  const units = Array.isArray(context.course?.units) ? context.course.units : [];
  const kind = unitKindLabel({
    kind: lesson.kind === 'lecture' || lesson.kind === 'lab' ? lesson.kind : unit.kind,
    number: Number.isInteger(lesson.number) ? lesson.number : unit.number,
  });
  const title = displayTitle(asBi(lesson.title) || asBi(unit.title) || { en: unitId }, kind);
  const branch = (context.course?.branches || []).find((candidate) => candidate.id === unit.branch)?.title || null;
  const scope = createBlockScope(context, { unitId });
  const cleanups = [];
  const previousVisit = progress.lastVisited();
  const target = sections.find((section) => section.id === requestedSectionId) || null;

  let armed = Boolean(target);
  let pending = null;
  let persisted = target ? target.id : null;
  let lockUntil = 0;

  const toc = createLessonToc({ unitId, sections, onSelect: (sectionId) => goToSection(sectionId) });
  const sectionViews = sections.map((section, index) => renderSection(section, index, { unitId, scope, progress }));
  const viewsById = new Map(sectionViews.map((view) => [view.id, view]));
  const headerProgress = h('div', { class: 'lesson-view__progress-bar' });

  const resumeIndex = !target && previousVisit?.unitId === unitId
    ? sections.findIndex((section) => section.id === previousVisit.sectionId)
    : -1;
  const resume = resumeIndex >= 0 ? h('div', { class: 'lesson-view__resume' },
    button({
      label: `继续上次 Resume · 第 ${resumeIndex + 1} 节 Section ${resumeIndex + 1}`,
      iconName: 'bookmark',
      variant: 'primary',
      onClick: () => goToSection(sections[resumeIndex].id),
    }),
    sectionName(sections[resumeIndex], 'lesson-view__resume-title')) : null;

  function persist(sectionId) {
    if (!sectionId || sectionId === persisted) return;
    persisted = sectionId;
    progress.setLastVisited(unitId, sectionId);
    replaceRoute(unitId, sectionId);
  }

  function goToSection(sectionId) {
    const view = viewsById.get(sectionId);
    if (!view) return;
    toc.close();
    lockUntil = Date.now() + JUMP_LOCK_MS;
    view.element.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    view.heading.focus({ preventScroll: true });
    toc.setActive(sectionId);
    armed = true;
    persist(sectionId);
  }

  function onActive(sectionId) {
    if (Date.now() < lockUntil) return;
    toc.setActive(sectionId);
    if (armed) persist(sectionId);
    else pending = sectionId;
  }

  function refreshProgress() {
    let done = 0;
    for (const view of sectionViews) {
      const isDone = progress.isSectionDone(unitId, view.id);
      if (isDone) done += 1;
      view.setDone(isDone);
      toc.setDone(view.id, isDone);
    }
    toc.setProgress(done, sectionViews.length);
    replaceContent(headerProgress, progressBar(done, sectionViews.length, { label: '本课学习进度 Lesson progress' }));
  }

  replaceContent(container, h('div', { class: 'lesson-view' },
    renderHeader({ lesson, unit, kind, title, sectionCount: sections.length, branch, headerProgress, resume }),
    h('div', { class: 'lesson-view__layout' },
      h('div', { class: 'lesson-view__aside' }, toc.element),
      h('div', { class: 'lesson-view__main' },
        sectionViews.map((view) => view.element),
        renderEnd({ lesson, unit, units, sections, onGo: goToSection }))),
    toc.fab,
    toc.backdrop));
  scope.attach();
  context.setTitle(`${kind.en} · ${pickText(title, 'zh')}`);

  refreshProgress();
  const progressEvent = progress.EVENT || 'study:progress';
  window.addEventListener(progressEvent, refreshProgress);
  cleanups.push(() => window.removeEventListener(progressEvent, refreshProgress));

  if (!armed) {
    const armAt = Date.now() + ARM_DELAY_MS;
    const onScroll = () => {
      if (Date.now() < armAt) return;
      armed = true;
      window.removeEventListener('scroll', onScroll);
      if (pending) persist(pending);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScroll));
  }
  cleanups.push(observeSections(sectionViews.map((view) => view.element), onActive));

  if (target) {
    progress.setLastVisited(unitId, target.id);
    const frame = window.requestAnimationFrame(() => {
      const view = viewsById.get(target.id);
      if (!view || !view.element.isConnected) return;
      lockUntil = Date.now() + JUMP_LOCK_MS;
      view.element.scrollIntoView({ block: 'start' });
      view.heading.focus({ preventScroll: true });
      toc.setActive(target.id);
    });
    cleanups.push(() => window.cancelAnimationFrame(frame));
  }

  return () => {
    cleanups.splice(0).reverse().forEach(runSafely);
    scope.dispose();
  };
}

export async function render(container, context, params = {}) {
  const stylesReady = Promise.all([
    ensureStylesheet(new URL('./lesson-view.css', import.meta.url)),
    ensureStylesheet(tocStylesheet),
    ensureBlockStyles(),
  ]);
  const units = Array.isArray(context.course?.units) ? context.course.units : [];
  const unit = units.find((candidate) => candidate && candidate.id === params.unitId);
  let teardown = null;

  if (!unit) {
    await stylesReady;
    context.setTitle('找不到这一课 Lesson not found');
    replaceContent(container, emptyState({
      title: '找不到这一课 Lesson not found',
      body: '这个链接指向的课程不存在。This link points to a lesson that does not exist.',
      action: backToLessons(),
    }));
    return undefined;
  }

  async function load() {
    teardown?.();
    teardown = null;
    replaceContent(container, loadingState('正在打开这一课… Opening the lesson'));
    let lesson;
    try {
      [lesson] = await Promise.all([context.repo.lesson(unit.id), stylesReady]);
    } catch (error) {
      if (!container.isConnected) return;
      replaceContent(container, h('div', { class: 'lesson-view__failure' },
        errorState(error, () => load()),
        backToLessons()));
      return;
    }
    if (!container.isConnected) return;
    const sections = normalizeSections(lesson?.sections);
    if (!sections.length) {
      context.setTitle(pickText(unit.title, 'zh'));
      replaceContent(container, emptyState({
        title: '这一课的讲义还在准备中 This lesson is not ready yet',
        body: '可以先去练习，或者看看其他课。You can practise or open another lesson meanwhile.',
        action: backToLessons(),
      }));
      return;
    }
    teardown = mountLesson(container, context, unit, lesson, sections, params.sectionId);
  }

  await load();
  return () => {
    teardown?.();
    teardown = null;
  };
}
