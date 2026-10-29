/**
 * Lesson index (#/learn): a "continue" banner, overall progress, then lecture and lab cards with
 * their branch, section progress and links to learn or practise each unit.
 * 课程目录页（#/learn）：“继续学习”横幅、总进度，然后是讲课与实验卡片，显示所属方向、小节进度以及学习、练习入口。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, pickText, toBi, zhNode } from '../../core/text/bilingual.js';
import { isRouteId } from '../../core/util/ids.js';
import { badge } from '../../components/badges/badge.js';
import { linkButton } from '../../components/controls/button.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { emptyState } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { groupUnits, lessonHref, minutesLabel, practiceHref, unitKindLabel } from './lesson-model.js';

// A unit without a usable title shows its id, which is not Chinese, so it goes in the English slot.
// 没有可用标题的单元显示其 id；id 不是中文，因此放在英文位置。
function asTitle(value, fallback) {
  return toBi(value) || { zh: '', en: fallback };
}

function sectionIdsOf(unit) {
  return Array.isArray(unit.sectionIds) ? unit.sectionIds.filter((id) => typeof id === 'string') : [];
}

function unitCard(unit, { progress, branches }) {
  const kind = unitKindLabel(unit);
  const title = asTitle(unit.title, unit.id);
  const sectionIds = sectionIdsOf(unit);
  const { done, total } = progress.unitProgress(unit.id, sectionIds);
  const complete = total > 0 && done >= total;
  const branch = branches.get(unit.branch);
  const minutes = minutesLabel(unit.estimatedMinutes);
  const titleId = `unit-list-${unit.id}`;
  const plainTitle = `${kind.en} ${pickText(title, 'en')}`;
  const oneLiner = unit.oneLiner && typeof unit.oneLiner === 'object' ? unit.oneLiner : null;

  return h('li', { class: 'unit-list__item' },
    h('article', {
      class: ['unit-list__card', `unit-list__card--${unit.kind === 'lab' ? 'lab' : 'lecture'}`, complete ? 'is-complete' : null],
      'aria-labelledby': titleId,
    },
    h('div', { class: 'unit-list__card-head' },
      h('span', { class: 'unit-list__number', 'aria-hidden': 'true' }, Number.isInteger(unit.number) ? String(unit.number) : '·'),
      h('div', { class: 'unit-list__heading' },
        h('p', { class: 'unit-list__kind' }, `${kind.zh} · ${kind.en}`),
        h('h3', { class: 'unit-list__title', id: titleId }, biTitle(title)))),
    oneLiner ? h('div', { class: 'unit-list__oneliner' },
      zhNode(oneLiner.zh, 'teach', 'p', 'unit-list__oneliner-zh'),
      enNode(oneLiner.en, 'p', 'unit-list__oneliner-en')) : null,
    h('div', { class: 'unit-list__meta' },
      branch ? badge(pickText(branch.title, 'zh'), 'accent', { title: pickText(branch.title, 'en') }) : null,
      total ? h('span', { class: 'unit-list__meta-item' }, icon('list', { size: 14 }), `${total} 节 sections`) : null,
      minutes ? h('span', { class: 'unit-list__meta-item' }, icon('clock', { size: 14 }), `${minutes.zh} · ${minutes.en}`) : null,
      complete ? badge('已学完 Done', 'core') : null),
    total ? h('div', { class: 'unit-list__progress' },
      progressBar(done, total, { label: `${plainTitle} 学习进度 Progress`, size: 'sm' })) : null,
    h('div', { class: 'unit-list__actions' },
      linkButton({
        label: '开始学习 Learn',
        href: lessonHref(unit.id),
        iconName: 'book',
        variant: 'primary',
        size: 'sm',
        ariaLabel: `开始学习 Learn: ${plainTitle}`,
      }),
      linkButton({
        label: '练习 Practice',
        href: practiceHref(unit.id),
        iconName: 'pencil',
        size: 'sm',
        ariaLabel: `练习 Practice: ${plainTitle}`,
      }))));
}

function overallProgress(units, progress) {
  let done = 0;
  let total = 0;
  for (const unit of units) {
    const result = progress.unitProgress(unit.id, sectionIdsOf(unit));
    done += result.done;
    total += result.total;
  }
  if (!total) return null;
  return h('div', { class: 'unit-list__overall' },
    h('span', { class: 'unit-list__overall-label' }, '全部小节 All sections'),
    progressBar(done, total, { label: '全部课程学习进度 Overall progress' }));
}

/**
 * "Continue" banner for the last visited unit. The section title needs the lesson file, so it is
 * filled in after the page renders (the request is cached and reused when the lesson opens).
 * 上次学习单元的“继续学习”横幅。小节标题要读取讲义文件才能知道，所以在页面渲染后再补上（请求会被缓存，打开课程时复用）。
 */
function continueBanner(context, units) {
  const last = context.progress.lastVisited();
  if (!last || !isRouteId(last.unitId)) return null;
  const unit = units.find((candidate) => candidate.id === last.unitId);
  if (!unit) return null;
  const kind = unitKindLabel(unit);
  const sectionId = isRouteId(last.sectionId) ? last.sectionId : null;
  const sectionLine = h('p', { class: 'unit-list__continue-section' });
  const element = h('section', { class: 'unit-list__continue', 'aria-labelledby': 'unit-list-continue-title' },
    h('div', { class: 'unit-list__continue-body' },
      h('p', { class: 'unit-list__continue-label', id: 'unit-list-continue-title' }, icon('bookmark', { size: 16 }), '继续学习 Continue'),
      h('p', { class: 'unit-list__continue-unit' },
        h('span', { class: 'unit-list__continue-kind' }, `${kind.zh} · ${kind.en}`),
        biTitle(asTitle(unit.title, unit.id))),
      sectionLine),
    linkButton({
      label: '继续 Continue',
      href: lessonHref(unit.id, sectionId),
      iconName: 'arrowRight',
      variant: 'primary',
      ariaLabel: `继续学习 Continue: ${kind.en} ${pickText(unit.title, 'en')}`,
    }));

  async function fillSection() {
    if (!sectionId) return;
    let sections = Array.isArray(unit.sections) ? unit.sections : null;
    if (!sections) {
      try {
        sections = (await context.repo.lesson(unit.id))?.sections;
      } catch {
        return;
      }
    }
    const index = Array.isArray(sections) ? sections.findIndex((section) => section?.id === sectionId) : -1;
    if (index < 0 || !element.isConnected) return;
    const title = toBi(sections[index].title);
    replaceContent(sectionLine,
      h('span', { class: 'unit-list__continue-num' }, `第 ${index + 1} 节 `, h('span', { lang: 'en' }, `Section ${index + 1}`)),
      title?.zh ? zhNode(title.zh, 'label', 'span') : enNode(title?.en || sectionId, 'span'));
  }

  return { element, fillSection };
}

export async function render(container, context) {
  await ensureStylesheet(new URL('./unit-list-view.css', import.meta.url));
  context.setTitle('学习 Learn');
  const course = context.course || {};
  const units = (Array.isArray(course.units) ? course.units : []).filter((unit) => unit && isRouteId(unit.id));
  const branches = new Map((Array.isArray(course.branches) ? course.branches : []).map((branch) => [branch.id, branch]));
  const banner = continueBanner(context, units);
  const groups = groupUnits(units);

  replaceContent(container, h('div', { class: 'unit-list' },
    pageHeader({
      eyebrow: course.shortCode || course.code || '',
      title: { zh: '按课学习', en: 'Lessons' },
      subtitle: '每一课都从零讲起。读完一节就点“我学会了”，进度会记在这台设备上。Every lesson starts from zero; mark each section when you have learned it.',
    }),
    banner ? banner.element : null,
    overallProgress(units, context.progress),
    groups.length ? groups.map((group) => {
      const headingId = `unit-list-group-${group.kind}`;
      return h('section', { class: 'unit-list__group', 'aria-labelledby': headingId },
        h('h2', { class: ['section-heading', 'unit-list__group-title'], id: headingId },
          biTitle(group.title),
          h('span', { class: 'unit-list__group-count' }, `${group.units.length}`)),
        h('ul', { class: 'unit-list__grid', role: 'list' }, group.units.map((unit) => unitCard(unit, { progress: context.progress, branches }))));
    }) : emptyState({ title: '还没有课程内容 No lessons yet', body: '课程内容正在准备中。Lessons are being prepared.' })));

  banner?.fillSection();
  return undefined;
}
