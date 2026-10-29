/**
 * Study plan (#/plan): the studyPlans of course-overview.json as day-by-day checklists.
 * 学习计划（#/plan）：把 course-overview.json 的 studyPlans 渲染成按天打勾的清单。
 *
 * Ticks are stored with progress.setSectionDone("plan-<planId>", "d<day>-t<task>"), so they travel
 * with progress export and import. "?plan=<planId>" opens a plan directly.
 * 勾选状态通过 progress.setSectionDone("plan-<planId>", "d<天>-t<任务>") 保存，会随进度一起导出导入；
 * 链接加 "?plan=<planId>" 可直接打开指定计划。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { PLAN_UNIT_PREFIX } from '../../core/state/progress-store.js';
import { biTitle, enNode, zhNode } from '../../core/text/bilingual.js';
import { linkButton } from '../../components/controls/button.js';
import { loadTabStripStyles, tabStrip } from '../../components/controls/tab-strip.js';
import { badge } from '../../components/badges/badge.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { emptyState, loadingState } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { detectTaskLinks, firstOpenDay, normalizePlans, planTaskKeys } from './study-plan-logic.js';

function bilingualText(value, fallback) {
  if (!value) return fallback;
  return [value.zh, value.en].filter((part) => part && part.trim()).join(' ') || fallback;
}

function taskRow(plan, task, { isDone, progress, units, onChange }) {
  const id = `${plan.storageId}-${task.key}`;
  const links = detectTaskLinks(task.text, units);
  const row = h('li', { class: ['study-plan__task', isDone(task.key) && 'study-plan__task--done'] });
  const input = h('input', {
    type: 'checkbox',
    id,
    class: 'study-plan__checkbox',
    checked: isDone(task.key),
    onchange: () => {
      progress.setSectionDone(plan.storageId, task.key, input.checked);
      row.classList.toggle('study-plan__task--done', input.checked);
      onChange();
    },
  });
  row.append(
    h('label', { class: 'check-row study-plan__check', for: id },
      input,
      h('span', { class: 'study-plan__task-text' },
        zhNode(task.text.zh, 'teach', 'span', 'study-plan__task-zh'),
        enNode(task.text.en, 'span', 'study-plan__task-en'))),
    links.length
      ? h('div', { class: 'study-plan__links' },
        h('span', { class: 'visually-hidden' }, '相关页面 Related pages:'),
        links.map((link) => h('a', { class: 'study-plan__link', href: link.href },
          link.label.zh, ' ', h('span', { class: 'study-plan__link-en', lang: 'en' }, link.label.en),
          icon('arrowRight', { size: 14 }))))
      : null);
  return row;
}

function dayView(plan, day, position, helpers) {
  const label = day.label || { zh: `第 ${position + 1} 天`, en: `Day ${position + 1}` };
  const count = h('span', { class: 'study-plan__day-count' });
  const nextBadge = badge('下一步 Up next', 'accent', { className: 'study-plan__next' });
  const doneMark = h('span', { class: 'study-plan__done-mark' }, icon('check', { size: 14 }), '完成 Done');
  const isComplete = () => day.tasks.every((task) => helpers.isDone(task.key));
  const view = { label, isComplete };
  const rowHelpers = { ...helpers, onChange: () => helpers.onChange(view) };

  // Finished days start folded so the open work stays in view.
  // 已完成的天默认折叠，让还没做的任务留在视线里。
  const details = h('details', { class: 'study-plan__day-box', open: !isComplete() },
    h('summary', { class: 'study-plan__day-summary' },
      h('span', { class: 'study-plan__day-label' }, biTitle(label)),
      h('span', { class: 'study-plan__day-meta' }, nextBadge, doneMark, count),
      h('span', { class: 'study-plan__chevron' }, icon('chevronDown', { size: 18 }))),
    h('ul', { class: 'study-plan__tasks', role: 'list' }, day.tasks.map((task) => taskRow(plan, task, rowHelpers))));
  const element = h('li', { class: 'study-plan__day' }, details);

  return Object.assign(view, {
    element,
    update(isNext) {
      const done = day.tasks.filter((task) => helpers.isDone(task.key)).length;
      const finished = done === day.tasks.length;
      count.textContent = `${done}/${day.tasks.length}`;
      element.classList.toggle('study-plan__day--done', finished);
      element.classList.toggle('study-plan__day--next', isNext);
      nextBadge.hidden = !isNext;
      doneMark.hidden = !finished;
    },
  });
}

function planPanel(plan, { progress, units, announce }) {
  const keys = planTaskKeys(plan);
  const isDone = (key) => progress.isSectionDone(plan.storageId, key);
  const titleText = bilingualText(plan.title, '学习计划 Study plan');
  const headingId = `${plan.storageId}-title`;
  const summarySlot = h('div', { class: 'study-plan__summary' });
  const days = [];

  function refresh() {
    const { done, total } = progress.unitProgress(plan.storageId, keys);
    replaceContent(summarySlot,
      progressBar(done, total, { label: `${titleText} 完成度 Plan progress` }),
      h('p', { class: 'study-plan__summary-text' },
        done >= total ? '整个计划都完成了，考试加油！Plan complete. Good luck!' : `已完成 ${done} / ${total} 项 tasks done`));
    const next = firstOpenDay(plan, isDone);
    days.forEach((day, index) => day.update(index === next));
    return { done, total };
  }

  const helpers = {
    isDone,
    progress,
    units,
    onChange(day) {
      const { done, total } = refresh();
      if (done >= total) announce('整个计划都完成了 Plan complete');
      else if (day.isComplete()) announce(`${bilingualText(day.label, '')} 全部完成 Day complete. 还剩 ${total - done} 项 ${total - done} tasks left.`);
    },
  };

  plan.days.forEach((day, position) => days.push(dayView(plan, day, position, helpers)));
  refresh();

  return h('section', { class: 'study-plan__plan', 'aria-labelledby': headingId },
    h('header', { class: 'study-plan__head' },
      h('h2', { id: headingId, class: 'study-plan__title' }, plan.title ? biTitle(plan.title) : '学习计划 Study plan'),
      summarySlot,
      plan.note
        ? h('div', { class: 'callout callout--warn study-plan__note' },
          h('span', { class: 'callout__label' }, '注意 Note'),
          zhNode(plan.note.zh, 'teach', 'p', 'study-plan__note-zh'),
          enNode(plan.note.en, 'p', 'study-plan__note-en'))
        : null),
    h('ol', { class: 'study-plan__days', role: 'list' }, days.map((day) => day.element)));
}

function tabLabel(plan, index) {
  const title = plan.title;
  if (!title) return `计划 ${index + 1} Plan ${index + 1}`;
  return [
    zhNode(title.zh, 'label', 'span'),
    enNode(title.en, 'span', title.zh ? 'tab-strip__en' : undefined),
  ];
}

function setPlanInUrl(storageId) {
  const slug = storageId.slice(PLAN_UNIT_PREFIX.length);
  try {
    window.history.replaceState(window.history.state, '', `#/plan?plan=${encodeURIComponent(slug)}`);
  } catch {
    // The address bar simply keeps the old query. 地址栏保持原样即可。
  }
}

export async function render(container, context, params, query) {
  await Promise.all([
    ensureStylesheet(new URL('./study-plan-view.css', import.meta.url)),
    loadTabStripStyles(),
  ]);
  context.setTitle('学习计划 Study plan');
  replaceContent(container, loadingState());

  const overview = await context.repo.review('overview').catch(() => null);
  const plans = normalizePlans(overview?.studyPlans);
  const header = pageHeader({
    eyebrow: '学习计划 Study plan',
    title: { zh: '按天打勾的复习计划', en: 'Day-by-day study plans' },
    subtitle: '做完一项就打个勾，进度保存在这台设备的浏览器里。Tick each task when it is done; progress stays in this browser.',
  });

  if (!plans.length) {
    replaceContent(container, h('div', { class: 'study-plan' }, header, emptyState({
      title: '学习计划还在准备中 Study plans are not ready yet',
      body: '可以先按顺序学习每一课，学完就去刷题。Meanwhile, go through the lessons in order and practise after each one.',
      action: h('div', { class: 'cluster study-plan__empty-actions' },
        linkButton({ label: '去学习 Lessons', href: '#/learn', iconName: 'book', variant: 'primary' }),
        linkButton({ label: '回到首页 Home', href: '#/', iconName: 'home' })),
    })));
    return undefined;
  }

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const announce = (text) => {
    live.textContent = text;
  };
  const units = Array.isArray(context.course.units) ? context.course.units : [];
  const panels = plans.map((plan) => planPanel(plan, { progress: context.progress, units, announce }));

  let body = panels;
  if (plans.length > 1) {
    const requested = query?.get('plan');
    const hasOpenTask = (plan) => planTaskKeys(plan).some((key) => !context.progress.isSectionDone(plan.storageId, key));
    const initial = plans.find((plan) => requested && plan.storageId === `${PLAN_UNIT_PREFIX}${requested}`)
      || plans.find(hasOpenTask)
      || plans[0];
    let ready = false;
    const strip = tabStrip({
      tabs: plans.map((plan, index) => ({ id: plan.storageId, label: tabLabel(plan, index), iconName: 'calendar', panel: panels[index] })),
      selected: initial.storageId,
      label: '选择学习计划 Choose a study plan',
      idPrefix: 'study-plan',
      className: 'study-plan__tabs',
      onSelect: (id) => {
        if (ready) setPlanInUrl(id);
      },
    });
    ready = true;
    body = [strip.element, panels];
  }

  replaceContent(container, h('div', { class: 'study-plan' }, header, body, live));
  return undefined;
}
