/**
 * Cheat sheet (#/cheatsheet): per-unit key points, formulas and must-know terms, the formula sheet
 * and easily confused pairs, with a unit filter ("?unit=<lessonId>") and a print layout.
 * 考前速记（#/cheatsheet）：每课要点、公式与必会术语，公式总表与易混概念；支持按单元筛选（"?unit=<课程 id>"）与打印。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, toBi, zhNode } from '../../core/text/bilingual.js';
import { renderInline } from '../../core/text/inline-markup.js';
import { unitName } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';
import { button, linkButton } from '../../components/controls/button.js';
import { emptyState, loadingState } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import {
  asList,
  filterValue,
  humanizeId,
  matchesFilter,
  termNames,
  unitFilterOptions,
} from './review-logic.js';

const DEFAULT_TITLE = { zh: '考前速记', en: 'Exam Cheat Sheet' };

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function englishFirst(value, className) {
  const bi = toBi(value);
  if (!bi) return null;
  return h('div', { class: ['cheatsheet__text', className] },
    enNode(bi.en, 'p', 'cheatsheet__en'),
    zhNode(bi.zh, 'gloss', 'p', 'cheatsheet__zh'));
}

function findUnit(units, lessonId) {
  return units.find((unit) => unit && unit.id === lessonId && isRouteId(unit.id)) || null;
}

function formulaItem(formula, extra) {
  const expr = typeof formula.expr === 'string' ? formula.expr.trim() : '';
  const text = englishFirst({ zh: formula.zh, en: formula.en }, 'cheatsheet__formula-text');
  if (!expr && !text) return null;
  return h('li', { class: 'cheatsheet__formula' },
    expr ? h('div', { class: 'cheatsheet__expr', lang: 'en' }, renderInline(expr)) : null,
    text,
    extra || null);
}

function termChip(id, names) {
  const name = names.get(id);
  const content = [
    enNode(name?.en || humanizeId(id), 'span', 'cheatsheet__term-en'),
    zhNode(name?.zh, 'gloss', 'span', 'cheatsheet__term-zh'),
  ];
  return h('li', {}, isRouteId(id)
    ? h('a', { class: 'cheatsheet__term', href: `#/glossary/${id}` }, content)
    : h('span', { class: 'cheatsheet__term' }, content));
}

function unitBlock(block, index, { units, names }) {
  const value = filterValue(block, index);
  const unit = findUnit(units, block.lessonId);
  const label = unit ? unitName(unit) : null;
  const title = toBi(block.title) || toBi(unit?.title);
  const points = asList(block.points).map(toBi).filter(Boolean);
  const formulas = asList(block.formulas).filter(isObject).map((formula) => formulaItem(formula)).filter(Boolean);
  const termIds = [...new Set(asList(block.mustKnowTerms).filter((id) => typeof id === 'string' && id.trim()))];
  const headingId = `cheatsheet-unit-${index + 1}`;

  return h('article', { class: 'cheatsheet__unit', dataset: { filter: value }, 'aria-labelledby': headingId },
    h('header', { class: 'cheatsheet__unit-head' },
      h('div', { class: 'cheatsheet__unit-heading' },
        label ? h('span', { class: 'cheatsheet__unit-label' }, `${label.zh} · ${label.en}`) : null,
        h('h3', { id: headingId, class: 'cheatsheet__unit-title' }, title ? biTitle(title) : String(block.lessonId || value))),
      unit
        ? h('a', { class: 'cheatsheet__unit-link', href: `#/learn/${unit.id}` }, '回到讲义 Open lesson', icon('arrowRight', { size: 14 }))
        : null),
    points.length
      ? h('ol', { class: 'cheatsheet__points' }, points.map((point) => h('li', { class: 'cheatsheet__point' },
        enNode(point.en, 'p', 'cheatsheet__en'),
        zhNode(point.zh, 'gloss', 'p', 'cheatsheet__zh'))))
      : null,
    formulas.length
      ? h('div', { class: 'cheatsheet__group' },
        h('h4', { class: 'cheatsheet__group-title' }, '公式 Formulas'),
        h('ul', { class: 'cheatsheet__formulas', role: 'list' }, formulas))
      : null,
    termIds.length
      ? h('div', { class: 'cheatsheet__group' },
        h('h4', { class: 'cheatsheet__group-title' }, '必会术语 Must-know terms'),
        h('ul', { class: 'cheatsheet__terms', role: 'list' }, termIds.map((id) => termChip(id, names))))
      : null);
}

function confusableItem(pair) {
  const a = toBi(pair.a);
  const b = toBi(pair.b);
  if (!a && !b) return null;
  const side = (value) => h('div', { class: 'cheatsheet__side' },
    value ? enNode(value.en, 'strong', 'cheatsheet__side-en') : null,
    value ? zhNode(value.zh, 'gloss', 'span', 'cheatsheet__side-zh') : null);
  return h('li', { class: 'cheatsheet__pair' },
    h('div', { class: 'cheatsheet__versus' },
      side(a),
      h('span', { class: 'cheatsheet__vs', lang: 'en' }, 'vs'),
      side(b)),
    englishFirst(pair.difference, 'cheatsheet__diff'));
}

function sectionHeading(id, title) {
  // tabindex lets the in-page jump buttons move keyboard focus to the heading.
  // tabindex 让页内跳转按钮可以把键盘焦点移到标题上。
  return h('h2', { id, class: 'section-heading cheatsheet__heading', tabindex: '-1' }, biTitle(title));
}

function setUnitInUrl(filter) {
  const target = filter === 'all' ? '#/cheatsheet' : `#/cheatsheet?unit=${encodeURIComponent(filter)}`;
  try {
    window.history.replaceState(window.history.state, '', target);
  } catch {
    // The address bar simply keeps the old query. 地址栏保持原样即可。
  }
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function notReady(context, header) {
  return h('div', { class: 'cheatsheet' }, header, emptyState({
    title: '考前速记还在整理中 The cheat sheet is not ready yet',
    body: '可以先用术语表和闪卡复习英文术语。Meanwhile, review the terms with the glossary and flashcards.',
    action: h('div', { class: 'cluster cheatsheet__empty-actions' },
      linkButton({ label: '术语表 Glossary', href: '#/glossary', iconName: 'translate' }),
      linkButton({ label: '闪卡 Flashcards', href: '#/flashcards', iconName: 'cards' }),
      button({ label: '重试 Retry', iconName: 'refresh', variant: 'ghost', onClick: () => context.navigate('/cheatsheet') })),
  }));
}

export async function render(container, context, params, query) {
  await ensureStylesheet(new URL('./cheatsheet-view.css', import.meta.url));
  context.setTitle('考前速记 Cheat sheet');
  replaceContent(container, loadingState());

  const [sheet, terms] = await Promise.all([
    context.repo.review('cheatsheet').catch(() => null),
    context.repo.allTerms().catch(() => []),
  ]);
  const title = toBi(sheet?.title) || DEFAULT_TITLE;
  const printButton = button({ label: '打印 Print', iconName: 'printer', onClick: () => window.print(), className: 'cheatsheet__print' });
  const header = pageHeader({
    eyebrow: '考前速记 Cheat sheet',
    title,
    subtitle: '每课最该记住的英文要点、公式和易混概念。打印时只打印当前筛选出的内容。Key points, formulas and confusable pairs; printing follows the filter.',
    actions: isObject(sheet) ? [printButton] : [],
  });
  if (!isObject(sheet)) {
    replaceContent(container, notReady(context, header));
    return undefined;
  }

  const units = asList(context.course.units);
  const names = termNames(terms);
  const blocks = asList(sheet.units);
  const unitCards = blocks
    .map((block, index) => (isObject(block) ? unitBlock(block, index, { units, names }) : null))
    .filter(Boolean);
  const options = unitFilterOptions(blocks, units);

  const sheetItems = asList(sheet.formulaSheet).filter(isObject).map((formula) => {
    const unit = findUnit(units, formula.lessonId);
    const tag = unit
      ? h('a', { class: 'cheatsheet__formula-tag', href: `#/learn/${unit.id}` }, unitName(unit).zh, ' ', h('span', { lang: 'en' }, unitName(unit).en))
      : null;
    const item = formulaItem(formula, tag);
    if (item) item.dataset.filter = typeof formula.lessonId === 'string' ? formula.lessonId : '';
    return item;
  }).filter(Boolean);
  const pairs = asList(sheet.confusables).filter(isObject).map(confusableItem).filter(Boolean);

  const live = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const noFormulas = h('p', { class: 'cheatsheet__none', hidden: true }, '这一课没有单独列出的公式。No formulas for this unit.');
  const noUnits = h('p', { class: 'cheatsheet__none', hidden: true }, '这一课还没有速记内容。Nothing for this unit yet.');

  const sections = [];
  if (unitCards.length) {
    sections.push(h('section', { class: 'cheatsheet__section', 'aria-labelledby': 'cheatsheet-units-title' },
      sectionHeading('cheatsheet-units-title', { zh: '按课要点', en: 'Key points by unit' }),
      h('div', { class: 'cheatsheet__units' }, unitCards),
      noUnits));
  }
  if (sheetItems.length) {
    sections.push(h('section', { class: 'cheatsheet__section', 'aria-labelledby': 'cheatsheet-formulas-title' },
      sectionHeading('cheatsheet-formulas-title', { zh: '公式总表', en: 'Formula sheet' }),
      h('ol', { class: 'cheatsheet__sheet', role: 'list' }, sheetItems),
      noFormulas));
  }
  if (pairs.length) {
    sections.push(h('section', { class: 'cheatsheet__section', 'aria-labelledby': 'cheatsheet-pairs-title' },
      sectionHeading('cheatsheet-pairs-title', { zh: '易混概念', en: 'Easily confused' }),
      h('p', { class: 'cheatsheet__section-note' }, '这些概念跨好几课，筛选时也一直显示。These pairs span several units and stay visible when filtering.'),
      h('ul', { class: 'cheatsheet__pairs', role: 'list' }, pairs)));
  }
  if (!sections.length) {
    replaceContent(container, notReady(context, header));
    return undefined;
  }

  function apply(filter, { announce = false } = {}) {
    let shown = 0;
    for (const card of unitCards) {
      const visible = matchesFilter(card.dataset.filter, filter);
      card.hidden = !visible;
      if (visible) shown += 1;
    }
    let formulasShown = 0;
    for (const item of sheetItems) {
      const visible = matchesFilter(item.dataset.filter, filter);
      item.hidden = !visible;
      if (visible) formulasShown += 1;
    }
    noUnits.hidden = shown > 0 || !unitCards.length;
    noFormulas.hidden = formulasShown > 0;
    if (announce) live.textContent = `显示 ${shown} 个单元、${formulasShown} 条公式 Showing ${shown} units and ${formulasShown} formulas`;
  }

  const requested = query?.get('unit');
  const initial = options.some((option) => option.value === requested) ? requested : 'all';
  const select = h('select', {
    id: 'cheatsheet-filter',
    class: 'select cheatsheet__select',
    onchange: () => {
      apply(select.value, { announce: true });
      setUnitInUrl(select.value);
    },
  },
  h('option', { value: 'all' }, '全部单元 All units'),
  options.map((option) => h('option', { value: option.value }, `${option.label.zh} — ${option.label.en}`)));
  select.value = initial;

  const jump = (id) => {
    const heading = container.querySelector(`#${id}`);
    if (!heading) return;
    heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
  };
  const tocItems = [
    unitCards.length && { id: 'cheatsheet-units-title', label: '按课要点 By unit', iconName: 'list' },
    sheetItems.length && { id: 'cheatsheet-formulas-title', label: '公式总表 Formulas', iconName: 'bolt' },
    pairs.length && { id: 'cheatsheet-pairs-title', label: '易混概念 Confusables', iconName: 'target' },
  ].filter(Boolean);

  const controls = h('div', { class: 'cheatsheet__controls' },
    options.length > 1
      ? h('div', { class: 'field cheatsheet__filter' },
        h('label', { class: 'field__label', for: 'cheatsheet-filter' }, '只看某一课 Show one unit'),
        select)
      : null,
    tocItems.length > 1
      ? h('nav', { class: 'cheatsheet__toc', 'aria-label': '本页目录 On this page' },
        tocItems.map((item) => button({ label: item.label, iconName: item.iconName, size: 'sm', variant: 'ghost', onClick: () => jump(item.id) })))
      : null);

  replaceContent(container, h('div', { class: 'cheatsheet' }, header, controls, live, sections));
  apply(initial);
  return undefined;
}
