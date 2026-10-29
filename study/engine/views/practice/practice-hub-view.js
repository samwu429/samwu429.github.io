/**
 * Practice hub (#/practice): quick starts, a question-type filter and one card per unit with its
 * question count, progress and accuracy.
 * 刷题首页（#/practice）：快速开始入口、题型筛选，以及每个单元一张卡片（题量、进度与正确率）。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { icon } from '../../core/dom/icons.js';
import { biTitle } from '../../core/text/bilingual.js';
import { button, linkButton } from '../../components/controls/button.js';
import { emptyState, loadingState, partialLoadNotice } from '../../components/feedback/states.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { OBJECTIVE_TYPES, QUESTION_TYPES, TYPE_LABELS, WRITTEN_TYPES } from './logic/question-types.js';
import { DEFAULT_RANDOM_COUNT, filterQuestions, sessionPath } from './logic/session.js';
import { combineStats, unitPracticeStats } from './logic/summary.js';
import { formatRatio, kindLabel, unitKicker, unitsById } from './components/labels.js';

// The type filter is kept while the page stays open, so coming back keeps the learner's choice.
// 题型筛选在页面打开期间保留，回到本页时仍是学习者上次的选择。
let selectedTypes = new Set(QUESTION_TYPES);

export async function render(container, context) {
  await ensureStylesheet(new URL('./practice-hub-view.css', import.meta.url));
  context.setTitle('刷题 Practice');

  const header = pageHeader({
    eyebrow: '刷题 Practice',
    title: { zh: '刷题练习', en: 'Practice' },
    subtitle: '题目和真实考试一样用英文出；看不懂就点题目上的“显示中文”。答错的题自动进错题本，之后答对会自动移出。Questions are in English, like the real test; tap Show Chinese when you are stuck. Wrong answers go to the mistake book and leave once you get them right.',
  });
  replaceContent(container, header, loadingState());

  const loaded = await context.repo.allQuestions();
  const bank = filterQuestions(loaded);
  const units = [...unitsById(context.course).values()];
  const notice = partialLoadNotice({
    unitIds: loaded.failedUnits || [],
    units: context.course?.units,
    what: { zh: '题目', en: 'Questions' },
    onRetry: () => context.refresh(),
  });

  if (!bank.length) {
    // With failed units the bank is empty because of the network, not because nothing is published.
    // 有单元加载失败时，题库为空是网络问题，而不是题目还没上线。
    replaceContent(container, header, notice || emptyState({
      title: '题库还在准备中 Questions are on the way',
      body: '这门课的练习题还没上线，可以先去学习页面看讲义。Practice questions are not published yet; start with the lessons.',
      action: linkButton({ label: '去学习 Go to lessons', href: '#/learn', iconName: 'book', variant: 'primary' }),
    }));
    return undefined;
  }

  const fullStats = unitPracticeStats(bank, {}, []);
  const dynamic = h('div', { class: 'practice-hub__dynamic' });
  replaceContent(container, header, notice, h('div', { class: 'practice-hub' }, typeFilter(bank, drawDynamic), dynamic));
  drawDynamic();

  function drawDynamic() {
    const types = QUESTION_TYPES.filter((type) => selectedTypes.has(type));
    const typeParam = types.length === QUESTION_TYPES.length ? 'all' : types;
    const pool = filterQuestions(bank, { types: typeParam });
    const stats = unitPracticeStats(pool, context.progress.attempts(), context.progress.mistakes());
    replaceContent(dynamic,
      overview(combineStats(stats), types.length),
      quickStart(pool, stats, typeParam),
      unitSections(stats, typeParam));
  }

  function overview(total, typeCount) {
    if (!typeCount) {
      return h('p', { class: ['callout', 'callout--warn', 'practice-hub__overview'] }, '至少选一种题型才能开始练习。Pick at least one question type to start.');
    }
    return h('dl', { class: 'practice-hub__overview' },
      stat('题目 Questions', String(total.total)),
      stat('做过 Attempted', `${total.attempted} / ${total.total}`),
      stat('正确率 Accuracy', formatRatio(total.accuracy)),
      stat('错题 Mistakes', String(total.mistakes)));
  }

  function stat(label, value) {
    return h('div', { class: 'practice-hub__stat' }, h('dt', {}, label), h('dd', {}, value));
  }

  function quickStart(pool, stats, typeParam) {
    const mistakeCount = combineStats(stats).mistakes;
    const mixedCount = Math.min(DEFAULT_RANDOM_COUNT, pool.length);
    return h('section', { class: 'practice-hub__section', 'aria-labelledby': 'practice-hub-quick' },
      h('h2', { class: 'section-heading', id: 'practice-hub-quick' }, '快速开始 Quick start'),
      h('div', { class: 'practice-hub__tiles' },
        tile({
          href: pool.length ? `#${sessionPath({ units: 'all', types: typeParam, count: DEFAULT_RANDOM_COUNT, mode: 'random' })}` : null,
          iconName: 'refresh',
          title: `随机 ${mixedCount || DEFAULT_RANDOM_COUNT} 题 Mixed ${mixedCount || DEFAULT_RANDOM_COUNT}`,
          text: pool.length ? '从所有单元随机抽题 Random questions from every unit' : '没有符合筛选的题 Nothing matches the filter',
        }),
        tile({
          href: mistakeCount ? `#${sessionPath({ units: 'all', types: typeParam, mode: 'mistakes' })}` : null,
          iconName: 'flag',
          title: mistakeCount ? `只练错题 Mistakes (${mistakeCount})` : '只练错题 Mistakes',
          text: mistakeCount ? `${mistakeCount} 道待攻克 ${mistakeCount} to fix` : '还没有错题 No mistakes yet',
        }),
        tile({
          href: '#/mock',
          iconName: 'clock',
          title: '模拟考试 Mock exam',
          text: '限时整卷，交卷判分 Timed paper, graded at the end',
        }),
        tile({
          href: '#/mistakes',
          iconName: 'list',
          title: '错题本 Mistake book',
          text: '按单元查看，单题重做 Browse by unit, retry one by one',
        })));
  }

  function tile({ href, iconName, title, text }) {
    const content = [
      h('span', { class: 'practice-hub__tile-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 22 })),
      h('span', { class: 'practice-hub__tile-title' }, title),
      h('span', { class: 'practice-hub__tile-text' }, text),
    ];
    return href
      ? h('a', { class: ['practice-hub__tile', 'card', 'card--link'], href }, content)
      : h('div', { class: ['practice-hub__tile', 'card', 'card--flat', 'is-disabled'] }, content);
  }

  function unitSections(stats, typeParam) {
    const kinds = [];
    for (const unit of units) {
      if (!kinds.includes(unit.kind)) kinds.push(unit.kind);
    }
    return h('section', { class: 'practice-hub__section', 'aria-labelledby': 'practice-hub-units' },
      h('h2', { class: 'section-heading', id: 'practice-hub-units' }, '按单元练习 By unit'),
      kinds.map((kind) => h('div', { class: 'practice-hub__group' },
        h('h3', { class: 'practice-hub__group-title' }, kindLabel(kind)),
        h('div', { class: 'grid-auto' },
          units.filter((unit) => unit.kind === kind).map((unit) => unitCard(unit, stats.get(unit.id), typeParam))))));
  }

  function unitCard(unit, stats, typeParam) {
    const kicker = unitKicker(unit);
    const head = [
      h('p', { class: 'practice-hub__kicker' }, kicker),
      h('h4', { class: 'practice-hub__unit-title' }, unit.title ? biTitle(unit.title) : unit.id),
    ];
    if (!stats || !stats.total) {
      const exists = Boolean(fullStats.get(unit.id)?.total);
      return h('article', { class: ['practice-hub__unit', 'card', 'card--flat', 'is-empty'] }, head,
        h('p', { class: 'practice-hub__empty' }, exists ? '当前筛选下没有题 No questions of the selected types' : '题库准备中 Questions coming soon'));
    }
    const typeSummary = QUESTION_TYPES.filter((type) => stats.byType[type])
      .map((type) => `${TYPE_LABELS[type].zh} ${stats.byType[type]}`).join(' · ');
    const link = (mode) => `#${sessionPath({ units: [unit.id], types: typeParam, mode })}`;
    return h('article', { class: ['practice-hub__unit', 'card'] }, head,
      h('p', { class: 'practice-hub__count' }, h('strong', {}, String(stats.total)), ' 题 questions'),
      h('p', { class: 'practice-hub__types' }, typeSummary),
      progressBar(stats.attempted, stats.total, { label: `已做 Attempted · ${kicker}`, size: 'sm' }),
      h('p', { class: 'practice-hub__stats' },
        stats.accuracy === null ? '还没做过 Not started' : `正确率 Accuracy ${formatRatio(stats.accuracy)}`,
        stats.mistakes ? ` · 错题 Mistakes ${stats.mistakes}` : ''),
      h('div', { class: 'practice-hub__actions' },
        linkButton({ label: '按课练习 Practice', href: link('ordered'), iconName: 'play', variant: 'primary', size: 'sm', ariaLabel: `按课练习 Practice: ${kicker}` }),
        linkButton({ label: '随机 Random', href: link('random'), iconName: 'refresh', size: 'sm', ariaLabel: `随机练习 Random practice: ${kicker}` }),
        stats.mistakes
          ? linkButton({ label: `错题 Mistakes ${stats.mistakes}`, href: link('mistakes'), iconName: 'flag', variant: 'ghost', size: 'sm', ariaLabel: `只练错题 Mistakes: ${kicker}` })
          : null));
  }
}

/**
 * Checkbox chips for question types plus presets; changes call onChange().
 * 题型筛选：复选框标签加快捷预设，变化时调用 onChange()。
 */
function typeFilter(bank, onChange) {
  const counts = Object.fromEntries(QUESTION_TYPES.map((type) => [type, bank.filter((question) => question.type === type).length]));
  const inputs = new Map();

  const sync = () => {
    for (const [type, input] of inputs) {
      input.checked = selectedTypes.has(type);
      input.closest('.practice-hub__chip')?.classList.toggle('is-checked', input.checked);
    }
  };

  const chips = QUESTION_TYPES.map((type) => {
    const input = h('input', {
      type: 'checkbox',
      class: 'practice-hub__chip-input',
      value: type,
      onchange: () => {
        if (input.checked) selectedTypes.add(type);
        else selectedTypes.delete(type);
        sync();
        onChange();
      },
    });
    inputs.set(type, input);
    return h('label', { class: 'practice-hub__chip' },
      input,
      h('span', { class: 'practice-hub__chip-text' }, `${TYPE_LABELS[type].zh} ${TYPE_LABELS[type].en}`),
      h('span', { class: 'practice-hub__chip-count' }, String(counts[type])));
  });

  const preset = (label, types) => button({
    label,
    size: 'sm',
    variant: 'ghost',
    onClick: () => {
      selectedTypes = new Set(types);
      sync();
      onChange();
    },
  });

  sync();
  return h('fieldset', { class: 'practice-hub__filter' },
    h('legend', { class: 'practice-hub__filter-title' }, '题型筛选 Question types'),
    h('div', { class: 'practice-hub__chips' }, chips),
    h('div', { class: 'practice-hub__presets' },
      preset('全部 All', QUESTION_TYPES),
      preset('只做客观题 Objective only', OBJECTIVE_TYPES),
      preset('只做主观题 Written only', WRITTEN_TYPES)));
}
