/**
 * Glossary page (#/glossary/:termId?): every exam term with search, unit filter and A-Z / by-unit order.
 * 术语表页面（#/glossary/:termId?）：全部考试术语，支持搜索、按单元筛选，以及 A-Z / 按单元两种排列。
 *
 * Filter state lives in the hash query (?q=&unit=&sort=) so Back and reload keep it, and other pages
 * can link to a filtered glossary, e.g. #/glossary?unit=lec03.
 * 筛选状态保存在哈希查询参数（?q=&unit=&sort=）中，后退和刷新都能保留，其他页面也可以直接链接到筛选后的术语表，
 * 例如 #/glossary?unit=lec03。
 */
import { appendChildren, h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, hasText, zhNode } from '../../core/text/bilingual.js';
import { renderInline, stripMarkup } from '../../core/text/inline-markup.js';
import { kindsText } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';
import { button, linkButton } from '../../components/controls/button.js';
import { segmented } from '../../components/controls/segmented.js';
import { createUnitFilter, loadUnitFilterStyles } from '../../components/controls/unit-filter.js';
import { emptyState, partialLoadNotice } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { speakButton } from '../../components/text/speak-button.js';
import { SORT_MODES, arrangeTerms, collectSources, countByUnit, prepareEntries } from './logic/term-list.js';
import { hashWithQuery, parseUnitParam, sourceLabel, unitChoices, unitShortLabel, unitTitleText } from './logic/unit-refs.js';

const SEARCH_DELAY_MS = 150;
const MAX_QUERY_LENGTH = 80;
const FIRST_SLICE_MS = 12;
const SLICE_MS = 10;
const MIN_FIRST_ITEMS = 24;
const ITEMS_AFTER_TARGET = 4;

// Term cards are kept between renders of this route (keyed by course and term id), so returning to
// the glossary or following a related-term link re-attaches nodes instead of rebuilding ~400 cards.
// 术语卡片在本路由的多次渲染之间保留（按课程与术语 id 缓存），返回术语表或点击相关术语时直接复用节点，无需重建约 400 张卡片。
const cardCache = new Map();
let highlightedCard = null;

export async function render(container, context, params = {}, query = new URLSearchParams()) {
  await Promise.all([
    ensureStylesheet(new URL('./glossary-view.css', import.meta.url)),
    loadUnitFilterStyles(),
  ]);
  context.setTitle('术语表 Glossary');

  const course = context.course || {};
  const courseUnits = Array.isArray(course.units) ? course.units : [];
  const unitById = new Map(courseUnits.map((unit) => [unit.id, unit]));
  const terms = await context.repo.allTerms();
  const loadNotice = partialLoadNotice({
    unitIds: terms.failedUnits || [],
    units: courseUnits,
    what: { zh: '术语', en: 'Terms' },
    onRetry: () => context.refresh(),
  });
  const entries = prepareEntries(terms, await loadSources(context.repo, terms));
  const entryById = new Map(entries.map((entry) => [entry.term.id, entry]));

  const flashcardsLink = linkButton({ label: '用闪卡背 Practise with flashcards', href: '#/flashcards', iconName: 'cards', size: 'sm' });
  const header = pageHeader({
    eyebrow: course.shortCode || course.code,
    title: { zh: '术语表', en: 'Glossary' },
    subtitle: '每个术语：考试用的英文定义 + 大白话中文解释，点喇叭听发音。 English exam definitions with plain Chinese explanations.',
    actions: [flashcardsLink],
  });

  if (highlightedCard) {
    highlightedCard.classList.remove('glossary-term--target');
    highlightedCard = null;
  }

  if (!entries.length) {
    replaceContent(container, header, loadNotice || emptyState({
      title: '还没有术语 No terms yet',
      body: '这门课的术语表还在整理中，稍后再来看看。 The glossary for this course is still being prepared.',
    }));
    return undefined;
  }

  const choices = unitChoices(courseUnits, countByUnit(entries));
  const choiceIds = choices.map((choice) => choice.id);
  const state = {
    query: (query.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH),
    units: parseUnitParam(query.get('unit'), choiceIds),
    sort: SORT_MODES.includes(query.get('sort')) ? query.get('sort') : 'az',
  };
  const arrangeOptions = () => ({ query: state.query, units: state.units, sort: state.sort, unitOrder: choiceIds });

  const requestedId = params.termId || null;
  const targetId = requestedId && entryById.has(requestedId) ? requestedId : null;
  // A linked term must be visible, so filters from the URL that would hide it are dropped.
  // 链接指向的术语必须可见，若链接里的筛选条件会把它藏起来，就清除这些条件。
  if (targetId && !arrangeTerms(entries, arrangeOptions()).groups.some((group) => group.items.some((entry) => entry.term.id === targetId))) {
    state.query = '';
    state.units = [];
  }

  let generation = 0;
  let frame = 0;
  let searchTimer = 0;
  let focusTimer = 0;

  const searchInput = h('input', {
    id: 'glossary-search-input',
    class: 'input glossary-search__input',
    type: 'search',
    value: state.query,
    maxlength: MAX_QUERY_LENGTH,
    placeholder: '英文或中文，如 minimax、准确率',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-describedby': 'glossary-search-hint',
    oninput: scheduleSearch,
    onkeydown: onSearchKeydown,
  });

  const unitFilter = createUnitFilter({
    units: choices,
    selected: state.units,
    totalCount: entries.length,
    countLabel: '个术语 terms',
    ariaLabel: '按单元筛选 Filter by unit',
    onChange: (units) => {
      state.units = units;
      refresh();
    },
  });

  // The by-unit tooltip names the course's own kinds, e.g. "按讲课和实验分组 Grouped by lecture and lab".
  // “按单元”的提示文字使用本课程的单元类型，例如“按讲课和实验分组 Grouped by lecture and lab”。
  const kinds = kindsText(courseUnits);
  const sortControl = segmented({
    options: [
      { value: 'az', label: 'A-Z', title: '按英文字母排列 Alphabetical' },
      { value: 'unit', label: '按单元 By unit', title: `按${kinds.zh}分组 Grouped by ${kinds.en}` },
    ],
    value: state.sort,
    ariaLabel: '排列方式 Order',
    size: 'sm',
    onChange: (sort) => {
      state.sort = sort;
      refresh();
    },
  });

  const countLine = h('p', { class: 'glossary-toolbar__count', role: 'status' });

  const toolbar = h('section', { class: 'glossary-toolbar', 'aria-label': '搜索与筛选 Search and filters' },
    h('div', { class: 'glossary-search', role: 'search' },
      h('label', { class: 'field__label', for: 'glossary-search-input' }, '搜索术语 Search terms'),
      h('div', { class: 'glossary-search__box' }, icon('search'), searchInput),
      h('p', { class: 'glossary-search__hint', id: 'glossary-search-hint' },
        '中英文都能搜，也会搜定义和例子。 Searches names, definitions and examples.',
        h('span', { class: 'glossary-search__key' }, ' 按 ', h('kbd', {}, '/'), ' 直接搜索 Press / to search.'))),
    h('div', { class: 'glossary-toolbar__row' },
      h('span', { class: 'glossary-toolbar__label', 'aria-hidden': 'true' }, '单元 Units'),
      unitFilter.element),
    h('div', { class: 'glossary-toolbar__row glossary-toolbar__row--split' },
      h('div', { class: 'glossary-toolbar__sort' },
        h('span', { class: 'glossary-toolbar__label', 'aria-hidden': 'true' }, '排列 Order'),
        sortControl),
      countLine));

  const notice = requestedId && !targetId
    ? h('p', { class: 'callout callout--warn glossary-notice', role: 'status' }, `没有找到这个术语 Term not found: ${requestedId}`)
    : null;

  const results = h('div', { class: 'glossary-results' });
  replaceContent(container, header, loadNotice, toolbar, notice, results);
  updateFlashcardsLink();
  renderResults(targetId);

  if (targetId) revealTarget(targetId);
  else if (requestedId) window.scrollTo({ top: 0 });

  document.addEventListener('keydown', onDocumentKeydown);

  return () => {
    generation += 1;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(searchTimer);
    window.clearTimeout(focusTimer);
    document.removeEventListener('keydown', onDocumentKeydown);
  };

  /**
   * Renders the arranged groups in time slices: the first slice always reaches the target card,
   * later slices run once per animation frame until the list is complete.
   * 分时渲染分组列表：第一批必定渲染到目标卡片为止，之后每个动画帧渲染一批，直到列表完成。
   */
  function renderResults(focusId) {
    generation += 1;
    const current = generation;
    window.cancelAnimationFrame(frame);

    const arranged = arrangeTerms(entries, arrangeOptions());
    countLine.textContent = countText(arranged);
    if (!arranged.count) {
      replaceContent(results, emptyState({
        title: '没有找到匹配的术语 No matching terms',
        body: '换个关键词试试，或者清除筛选。 Try another word, or clear the filters.',
        action: button({ label: '清除筛选 Clear filters', iconName: 'refresh', onClick: clearFilters }),
      }));
      return;
    }

    const tasks = [];
    for (const group of arranged.groups) {
      tasks.push({ group });
      for (const entry of group.items) tasks.push({ entry });
    }
    const targetIndex = focusId ? tasks.findIndex((task) => task.entry && task.entry.term.id === focusId) : -1;
    const mustReach = Math.max(MIN_FIRST_ITEMS, targetIndex + 1 + ITEMS_AFTER_TARGET);

    const groupsBox = h('div', { class: 'glossary-results__groups' });
    replaceContent(results, groupsBox);
    let cursor = 0;
    let currentList = null;

    const run = (budgetMs, minimum = 0) => {
      const start = window.performance.now();
      while (cursor < tasks.length && (cursor < minimum || window.performance.now() - start < budgetMs)) {
        const task = tasks[cursor];
        cursor += 1;
        if (task.group) {
          currentList = h('ul', { class: 'glossary-group__list', role: 'list' });
          groupsBox.append(h('section', { class: ['glossary-group', `glossary-group--${task.group.kind}`] }, groupHeading(task.group), currentList));
        } else {
          currentList.append(cardFor(task.entry));
        }
      }
    };

    const pump = () => {
      if (current !== generation) return;
      run(SLICE_MS);
      if (cursor < tasks.length) frame = window.requestAnimationFrame(pump);
    };

    run(FIRST_SLICE_MS, mustReach);
    if (cursor < tasks.length) frame = window.requestAnimationFrame(pump);
  }

  function countText({ count, total }) {
    const filtered = Boolean(state.query.trim()) || state.units.length > 0;
    return filtered
      ? `找到 ${count} 个，共 ${total} 个 · ${count} of ${total} terms`
      : `共 ${total} 个术语 · ${total} terms`;
  }

  function groupHeading(group) {
    if (group.kind === 'unit') {
      const unit = unitById.get(group.unitId);
      return h('h2', { class: 'glossary-group__title' },
        h('span', { class: 'glossary-group__tag' }, unitShortLabel(unit, group.unitId)),
        unit && unit.title ? biTitle(unit.title, { className: 'glossary-group__name' }) : null);
    }
    if (group.kind === 'letter') {
      return h('h2', { class: 'glossary-group__title glossary-group__title--letter', lang: 'en' }, group.letter);
    }
    return h('h2', { class: 'visually-hidden' }, '搜索结果 Search results');
  }

  function cardFor(entry) {
    const key = `${context.courseId}:${entry.term.id}`;
    let item = cardCache.get(key);
    if (!item) {
      item = buildCard(entry);
      cardCache.set(key, item);
    }
    return item;
  }

  function buildCard(entry) {
    const { term } = entry;
    const titleId = `glossary-term-${term.id}-title`;
    const definition = term.def && typeof term.def === 'object' ? term.def : {};
    const example = term.example && typeof term.example === 'object' ? term.example : {};

    const card = h('article', { class: 'glossary-term', id: `glossary-term-${term.id}`, tabindex: '-1', 'aria-labelledby': titleId },
      h('header', { class: 'glossary-term__head' },
        h('h3', { class: 'glossary-term__en en', id: titleId, lang: 'en' }, renderInline(hasText(term.en) ? term.en : term.id)),
        speakButton(term.en, { className: 'glossary-term__speak' }),
        zhNode(term.zh, 'gloss', 'p', 'glossary-term__zh')),
      hasText(definition.en) || hasText(definition.zh)
        ? h('div', { class: 'glossary-term__def' },
          h('p', { class: 'glossary-term__label' }, '考试定义 Exam definition'),
          withSpeech(enNode(definition.en, 'p', 'glossary-term__def-en'), definition.en),
          zhNode(definition.zh, 'teach', 'p', 'glossary-term__def-zh'))
        : null,
      hasText(example.en) || hasText(example.zh)
        ? h('div', { class: 'glossary-term__example' },
          h('p', { class: 'glossary-term__label' }, '例子 Example'),
          zhNode(example.zh, 'teach', 'p', 'glossary-term__example-zh'),
          enNode(example.en, 'p', 'glossary-term__example-en'))
        : null,
      h('footer', { class: 'glossary-term__foot' },
        metaRow('出处 Source', sourceLinks(entry)),
        metaRow('相关 Related', relatedLinks(term))));
    return h('li', { class: 'glossary-group__item' }, card);
  }

  function sourceLinks(entry) {
    return entry.sources.filter((source) => isRouteId(source.unitId)).map((source) => {
      const unit = unitById.get(source.unitId);
      const title = unitTitleText(unit);
      return h('a', { class: 'glossary-term__chip glossary-term__chip--unit', href: `#/learn/${source.unitId}`, title: title || undefined },
        sourceLabel(unit, source.slides, source.unitId),
        title ? h('span', { class: 'visually-hidden' }, `：${title}`) : null);
    });
  }

  function relatedLinks(term) {
    const ids = [...new Set(Array.isArray(term.related) ? term.related : [])]
      .filter((id) => typeof id === 'string' && id && id !== term.id);
    return ids.map((id) => {
      const target = entryById.get(id);
      if (target && isRouteId(id)) {
        return h('a', { class: 'glossary-term__chip glossary-term__chip--related', href: `#/glossary/${id}`, title: stripMarkup(target.term.zh) || undefined },
          h('span', { lang: 'en' }, renderInline(hasText(target.term.en) ? target.term.en : id)));
      }
      // Related ids without a glossary entry (yet) are shown as plain text instead of a dead link.
      // 还没有词条的相关术语显示为普通文字，而不是无效链接。
      return h('span', { class: 'glossary-term__chip glossary-term__chip--plain', lang: 'en' }, id.replace(/-/g, ' '));
    });
  }

  function revealTarget(id) {
    const item = cardFor(entryById.get(id));
    const card = item.firstElementChild;
    if (!card || !card.isConnected) return;
    card.classList.add('glossary-term--target');
    highlightedCard = card;
    card.scrollIntoView({ block: 'start' });
    // The router focuses <main> after render() resolves, so the card takes focus one task later.
    // 路由会在 render() 完成后把焦点放到 <main>，因此卡片在下一个任务中再获取焦点。
    focusTimer = window.setTimeout(() => {
      if (card.isConnected) card.focus({ preventScroll: true });
    }, 0);
  }

  function refresh() {
    if (highlightedCard) {
      highlightedCard.classList.remove('glossary-term--target');
      highlightedCard = null;
    }
    syncUrl();
    updateFlashcardsLink();
    renderResults(null);
  }

  // Mirrors the filters into the hash without a hashchange, so the router does not re-render.
  // 把筛选条件写回哈希但不触发 hashchange，路由因此不会重新渲染。
  function syncUrl() {
    const hash = hashWithQuery('/glossary', {
      q: state.query.trim(),
      unit: state.units,
      sort: state.sort === 'az' ? '' : state.sort,
    });
    if (window.location.hash === hash) return;
    try {
      window.history.replaceState(window.history.state, '', hash);
    } catch {
      // Some sandboxed previews forbid history changes; the filters still work.
      // 部分沙盒预览环境禁止修改历史记录；筛选功能仍然可用。
    }
  }

  function updateFlashcardsLink() {
    flashcardsLink.setAttribute('href', hashWithQuery('/flashcards', { unit: state.units }));
  }

  function scheduleSearch() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(applySearch, SEARCH_DELAY_MS);
  }

  function applySearch() {
    window.clearTimeout(searchTimer);
    const next = searchInput.value.slice(0, MAX_QUERY_LENGTH);
    if (next.trim() === state.query.trim()) return;
    state.query = next;
    refresh();
  }

  function onSearchKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applySearch();
    } else if (event.key === 'Escape' && searchInput.value) {
      event.preventDefault();
      searchInput.value = '';
      applySearch();
    }
  }

  function clearFilters() {
    searchInput.value = '';
    state.query = '';
    state.units = [];
    unitFilter.set([]);
    refresh();
    searchInput.focus();
  }

  // "/" jumps to the search box from anywhere on the page, unless the learner is typing.
  // 在页面任意位置按 "/" 跳到搜索框（正在输入时除外）。
  function onDocumentKeydown(event) {
    if (event.key !== '/' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return;
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
}

function withSpeech(node, text) {
  if (node) appendChildren(node, [speakButton(text, { className: 'glossary-term__speak' })]);
  return node;
}

function metaRow(label, items) {
  if (!items.length) return null;
  return h('div', { class: 'glossary-term__meta' },
    h('span', { class: 'glossary-term__meta-label' }, label),
    h('span', { class: 'glossary-term__chips' }, items));
}

// Loads each unit's glossary file (already cached by fetchJson after allTerms) to learn the slide
// pages of a term in every unit, not only in the first one.
// 读取各单元的术语文件（allTerms 之后已被 fetchJson 缓存），得到术语在每个单元的课件页码，而不只是第一个单元。
async function loadSources(repo, terms) {
  if (!repo || typeof repo.glossary !== 'function') return new Map();
  const unitIds = [...new Set((Array.isArray(terms) ? terms : []).flatMap((term) => (term && Array.isArray(term.units) ? term.units : [])))];
  const files = await Promise.all(unitIds.map((unitId) => Promise.resolve()
    .then(() => repo.glossary(unitId))
    .then((data) => ({ unitId, terms: data && Array.isArray(data.terms) ? data.terms : [] }))
    .catch(() => null)));
  return collectSources(files.filter(Boolean));
}
