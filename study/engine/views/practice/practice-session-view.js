/**
 * Practice session (#/practice/run): one question at a time with progress, previous / next,
 * a question map and an end-of-session summary.
 * 练习会话（#/practice/run）：一次一题，显示进度、上一题 / 下一题和题号导航，结束后给出总结。
 *
 * Query: units, types, count, mode (ordered | random | mistakes) and ids; see logic/session.js.
 * 查询参数：units、types、count、mode（ordered | random | mistakes）与 ids，详见 logic/session.js。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { isActivatable, isTextEntry, withinPage } from '../../core/dom/keyboard.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { button, linkButton, setButtonLabel } from '../../components/controls/button.js';
import { emptyState, loadingState, partialLoadNotice } from '../../components/feedback/states.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { createQuestionCard, ensureQuestionCardStyles } from './components/question-card.js';
import { formatRatio, typeLabel, unitKicker, unitsById } from './components/labels.js';
import { ensureResultsStyles, lessonLink, questionList, scoreBoard, unitBreakdown } from './components/results.js';
import { buildSession, parseSessionQuery, sessionPath } from './logic/session.js';
import { summarizeResults } from './logic/summary.js';

const MODE_LABELS = { ordered: '顺序练习 In order', random: '随机练习 Random', mistakes: '错题练习 Mistakes' };
const MAP_COLLAPSE_AT = 40;

export async function render(container, context, params, query) {
  await Promise.all([
    ensureStylesheet(new URL('./practice-session-view.css', import.meta.url)),
    ensureQuestionCardStyles(),
    ensureResultsStyles(),
  ]);
  context.setTitle('练习 Practice');
  const settings = parseSessionQuery(query);
  const units = unitsById(context.course);
  const unitOrder = [...units.keys()];
  replaceContent(container, loadingState());

  const bank = await context.repo.allQuestions();
  const questions = buildSession(bank, settings, { mistakes: context.progress.mistakes() });
  const header = sessionHeader(settings, units, questions.length);
  const notice = partialLoadNotice({
    unitIds: bank.failedUnits || [],
    units: context.course?.units,
    what: { zh: '题目', en: 'Questions' },
    onRetry: () => context.refresh(),
  });

  if (!questions.length) {
    const mistakesMode = settings.mode === 'mistakes';
    replaceContent(container, header, notice, emptyState({
      title: mistakesMode ? '这里没有错题 No mistakes here' : '没有符合条件的题目 No matching questions',
      body: mistakesMode
        ? '这个范围里没有错题，去练点新题吧。Nothing in your mistake book for this selection.'
        : '换个单元或题型再试试。Try other units or question types.',
      action: linkButton({ label: '回到刷题首页 Back to practice', href: '#/practice', iconName: 'arrowLeft', variant: 'primary' }),
    }));
    return undefined;
  }

  const total = questions.length;
  const cards = [];
  const results = new Map();
  let index = 0;
  let inSummary = false;
  let assistShown = false;

  const counter = h('p', { class: 'practice-session__counter' });
  const progressSlot = h('div', { class: 'practice-session__progress' });
  const tally = h('p', { class: 'practice-session__tally' });
  const finishButton = button({ label: '结束 Finish', iconName: 'flag', size: 'sm', variant: 'ghost', onClick: () => showSummary() });
  const bar = h('div', { class: 'practice-session__bar' }, counter, progressSlot, tally, finishButton);

  const dots = questions.map((question, position) => h('button', {
    type: 'button',
    class: 'practice-session__dot',
    onclick: () => show(position),
  }, String(position + 1)));
  const mapList = h('ol', { class: 'practice-session__map-list' }, dots.map((dot) => h('li', {}, dot)));
  let map = null;
  if (total > MAP_COLLAPSE_AT) {
    // Long runs (e.g. a big mistake book) keep the map folded so the question stays near the top.
    // 题目很多时（例如错题很多）把题号导航折叠起来，让题目留在页面上方。
    map = h('details', { class: 'practice-session__map' },
      h('summary', { class: 'practice-session__map-summary' }, `题号导航 Question map (${total})`),
      h('nav', { 'aria-label': '题号导航 Question map' }, mapList));
  } else if (total > 1) {
    map = h('nav', { class: 'practice-session__map', 'aria-label': '题号导航 Question map' }, mapList);
  }

  const stage = h('div', { class: 'practice-session__stage' });
  const prevButton = button({ label: '上一题 Previous', iconName: 'arrowLeft', onClick: () => show(index - 1) });
  const nextButton = button({ label: '下一题 Next', iconName: 'arrowRight', variant: 'primary', onClick: () => goNext() });
  const nav = h('div', { class: 'practice-session__nav' }, prevButton, nextButton);

  replaceContent(container, h('div', { class: 'practice-session' }, header, notice, bar, map, stage, nav));

  function cardAt(position) {
    if (!cards[position]) {
      const question = questions[position];
      cards[position] = createQuestionCard(question, {
        context,
        unit: units.get(question.unitId),
        headingLevel: 2,
        assistShown,
        onAssistToggle: (shown) => {
          assistShown = shown;
        },
        onAnswered: (result) => {
          results.set(question.id, result);
          updateChrome();
          // Enter on the focused "Next" button continues the run; the feedback stays in view.
          // 焦点移到“下一题”按钮，按回车即可继续；反馈内容仍留在视野中。
          if (!inSummary && index === position) nextButton.focus({ preventScroll: true });
        },
        onNext: () => goNext(),
      });
    }
    return cards[position];
  }

  function show(position, { focus = true } = {}) {
    index = Math.max(0, Math.min(total - 1, position));
    inSummary = false;
    const card = cardAt(index);
    card.setAssistShown(assistShown);
    replaceContent(stage, card.element);
    nav.hidden = false;
    finishButton.hidden = false;
    updateChrome();
    if (focus) {
      // Keep the progress bar in view above the new question. 让进度条和新题目一起出现在视野中。
      card.focus({ preventScroll: true });
      bar.scrollIntoView({ block: 'start' });
    }
  }

  function goNext() {
    if (index < total - 1) show(index + 1);
    else showSummary();
  }

  function updateChrome() {
    const answered = results.size;
    let right = 0;
    for (const result of results.values()) if (result.correct) right += 1;
    replaceContent(counter,
      h('span', { class: 'practice-session__counter-main' }, inSummary ? `${answered} / ${total}` : `${index + 1} / ${total}`),
      h('span', { class: 'practice-session__counter-label' }, inSummary ? '已答 Answered' : '当前题 Question'));
    replaceContent(progressSlot, progressBar(answered, total, { label: '已答题数 Answered', size: 'sm', showText: false }));
    tally.textContent = `已答 Answered ${answered} · 答对 Right ${right} · 答错 Wrong ${answered - right}`;
    prevButton.disabled = index === 0;
    setButtonLabel(nextButton, index === total - 1 ? '看结果 See results' : '下一题 Next');
    dots.forEach((dot, position) => {
      const result = results.get(questions[position].id);
      dot.classList.toggle('is-right', Boolean(result?.correct));
      dot.classList.toggle('is-wrong', Boolean(result && !result.correct));
      if (!inSummary && position === index) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
      let stateText = '未答 not answered';
      if (result) stateText = result.correct ? '答对 correct' : '答错 wrong';
      dot.setAttribute('aria-label', `第 ${position + 1} 题 Question ${position + 1}: ${stateText}`);
    });
  }

  function showSummary() {
    inSummary = true;
    const entries = questions.map((question) => ({ question, result: results.get(question.id) || null }));
    const summary = summarizeResults(entries, { unitOrder });
    const totals = summary.totals;
    const positionOf = new Map(questions.map((question, position) => [question.id, position]));
    const items = (ids, status) => ids.map((id) => {
      const position = positionOf.get(id);
      const question = questions[position];
      return {
        question,
        number: position + 1,
        unit: units.get(question.unitId),
        status,
        actions: [
          button({ label: '回到这题 Open', iconName: 'arrowRight', size: 'sm', onClick: () => show(position) }),
          lessonLink(question),
        ],
      };
    });

    const heading = h('h2', { class: 'practice-session__summary-title', id: 'practice-session-summary', tabindex: '-1' }, '练习结果 Results');
    const wrongIds = summary.wrongIds;
    const skippedIds = summary.unansweredIds;

    replaceContent(stage, h('section', { class: 'practice-session__summary', 'aria-labelledby': 'practice-session-summary' },
      heading,
      scoreBoard({
        label: '答对题数 Correct answers',
        earned: totals.correct,
        possible: totals.questions,
        percent: totals.questions ? (100 * totals.correct) / totals.questions : null,
        stats: [
          { label: '答对 Right', value: totals.correct },
          { label: '答错 Wrong', value: wrongIds.length },
          { label: '没做 Skipped', value: skippedIds.length },
          { label: '正确率 Accuracy', value: formatRatio(totals.accuracy) },
        ],
      }),
      totals.writtenQuestions
        ? h('p', { class: 'practice-session__note' }, '简答 / 论述题按你的自评计分：写到一半要点就算对。Written answers count as correct when you covered at least half of the points.')
        : null,
      totals.answered && !wrongIds.length && !skippedIds.length
        ? h('p', { class: ['callout', 'callout--tip'] }, '全部答对，干得漂亮！All correct. Well done!')
        : null,
      summary.byUnit.length > 1
        ? [h('h3', { class: 'practice-session__summary-heading' }, '按单元 By unit'), unitBreakdown(summary.byUnit, units)]
        : null,
      wrongIds.length
        ? [h('h3', { class: 'practice-session__summary-heading' }, `答错的题 Wrong answers (${wrongIds.length})`),
          questionList(items(wrongIds, 'wrong'), { label: '答错的题 Wrong answers' })]
        : null,
      skippedIds.length
        ? [h('h3', { class: 'practice-session__summary-heading' }, `没做的题 Skipped (${skippedIds.length})`),
          questionList(items(skippedIds, 'skipped'), { label: '没做的题 Skipped questions' })]
        : null,
      h('div', { class: 'practice-session__actions' },
        wrongIds.length
          ? button({
            label: `重练错题 Retry wrong (${wrongIds.length})`,
            iconName: 'refresh',
            variant: 'primary',
            onClick: () => context.navigate(sessionPath({ ids: wrongIds, mode: 'ordered' })),
          })
          : null,
        button({
          label: settings.ids ? '再练一遍 Practise again' : '再来一组 New set',
          iconName: 'play',
          onClick: () => context.navigate(sessionPath(settings)),
        }),
        button({ label: '回到题目 Back to questions', iconName: 'arrowLeft', variant: 'ghost', onClick: () => show(index) }),
        linkButton({ label: '错题本 Mistake book', href: '#/mistakes', iconName: 'list', variant: 'ghost' }),
        linkButton({ label: '刷题首页 Practice home', href: '#/practice', iconName: 'home', variant: 'ghost' }))));

    nav.hidden = true;
    finishButton.hidden = true;
    updateChrome();
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start' });
  }

  // Page-level shortcuts reach the current card even when focus sits outside it (e.g. on <main>),
  // but not while focus is in the site header or navigation.
  // 页面级快捷键：即使焦点不在卡片内（例如在 <main> 上），按键也会转给当前题目；焦点在站点页头或导航中时除外。
  function onKeydown(event) {
    if (event.defaultPrevented || inSummary || event.altKey || event.ctrlKey || event.metaKey) return;
    const card = cards[index];
    if (!card || card.element.contains(event.target) || !withinPage(event.target, container)) return;
    if (isTextEntry(event.target)) return;
    if (event.key === 'Enter' && isActivatable(event.target)) return;
    if (card.handleKey(event)) event.preventDefault();
  }

  document.addEventListener('keydown', onKeydown);
  show(0, { focus: false });
  return () => document.removeEventListener('keydown', onKeydown);
}

function sessionHeader(settings, units, count) {
  let title = { zh: '综合练习', en: 'Mixed practice' };
  if (settings.ids) title = { zh: '重练错题', en: 'Retry wrong answers' };
  else if (settings.mode === 'mistakes') title = { zh: '错题重练', en: 'Mistake review' };
  else if (Array.isArray(settings.units) && settings.units.length === 1 && units.get(settings.units[0])?.title) {
    title = units.get(settings.units[0]).title;
  }
  const scope = Array.isArray(settings.units)
    ? settings.units.map((id) => unitKicker(units.get(id)) || id).join(' · ')
    : '全部单元 All units';
  const types = Array.isArray(settings.types) ? settings.types.map(typeLabel).join(' · ') : '全部题型 All types';
  return pageHeader({
    eyebrow: `刷题 Practice · ${settings.ids ? '指定题目 Selected' : MODE_LABELS[settings.mode]}`,
    title,
    subtitle: `${scope} · ${types} · 共 ${count} 题 ${count} questions`,
  });
}
