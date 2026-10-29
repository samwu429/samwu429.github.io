/**
 * Mistake book (#/mistakes): wrong answers grouped by unit; each one can be retried inline or removed.
 * 错题本（#/mistakes）：按单元分组列出答错的题，可以就地重做，也可以移出错题本。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle } from '../../core/text/bilingual.js';
import { badge } from '../../components/badges/badge.js';
import { button, linkButton, setButtonLabel } from '../../components/controls/button.js';
import { emptyState, loadingState, partialLoadNotice } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { createQuestionCard, ensureQuestionCardStyles } from './components/question-card.js';
import { difficultyBadge, promptLang, promptPreview, typeBadge, unitKicker, unitsById } from './components/labels.js';
import { filterQuestions, sessionPath } from './logic/session.js';

export async function render(container, context) {
  await Promise.all([
    ensureStylesheet(new URL('./mistakes-view.css', import.meta.url)),
    ensureQuestionCardStyles(),
  ]);
  context.setTitle('错题本 Mistake book');

  const header = pageHeader({
    eyebrow: '刷题 Practice',
    title: { zh: '错题本', en: 'Mistake book' },
    subtitle: '答错的题会自动收进来；之后再答对，就会自动移出。Wrong answers land here and leave once you get them right.',
  });
  replaceContent(container, header, loadingState());

  const loaded = await context.repo.allQuestions();
  // Ids missing from a bank that did not fully load may belong to the units that failed, so they are
  // never offered for clean-up then.
  // 题库没有完整加载时，找不到的题号可能正属于加载失败的单元，此时绝不提供清理。
  const failedUnits = loaded.failedUnits || [];
  const bank = filterQuestions(loaded);
  const byId = new Map(bank.map((question) => [question.id, question]));
  const units = unitsById(context.course);
  const live = h('p', { class: 'visually-hidden', role: 'status' });
  const body = h('div', { class: 'mistakes' });
  const notice = partialLoadNotice({
    unitIds: failedUnits,
    units: context.course?.units,
    what: { zh: '题目', en: 'Questions' },
    onRetry: () => context.refresh(),
  });
  replaceContent(container, header, notice, live, body);

  const savedIds = context.progress.mistakes();
  const present = new Set(savedIds.filter((id) => byId.has(id)));
  const missing = savedIds.filter((id) => !byId.has(id));

  if (!present.size && !missing.length) {
    showEmpty();
    return undefined;
  }

  const countText = h('p', { class: 'mistakes__count', tabindex: '-1' });
  const retryAll = linkButton({ label: '全部重练 Retry all', href: `#${sessionPath({ mode: 'mistakes' })}`, iconName: 'refresh', variant: 'primary' });
  const groups = groupByUnit(bank.filter((question) => present.has(question.id)));

  replaceContent(body,
    h('div', { class: 'mistakes__toolbar' },
      countText,
      h('div', { class: 'mistakes__toolbar-actions' },
        retryAll,
        linkButton({ label: '刷题首页 Practice home', href: '#/practice', iconName: 'home', variant: 'ghost' }))),
    missing.length ? missingNotice(missing) : null,
    groups.map(({ unitId, questions }) => groupSection(unitId, questions)));
  refreshCount();

  function remainingCount() {
    return context.progress.mistakes().filter((id) => byId.has(id)).length;
  }

  function refreshCount() {
    const count = remainingCount();
    countText.textContent = `还有 ${count} 道错题 ${count} mistake${count === 1 ? '' : 's'} to fix`;
    retryAll.hidden = count === 0;
  }

  function announce(text) {
    live.textContent = text;
  }

  function showEmpty() {
    const empty = emptyState({
      title: '错题本是空的 No mistakes yet',
      body: '做题时答错的题会出现在这里。Questions you get wrong will show up here.',
      action: linkButton({ label: '去刷题 Start practising', href: '#/practice', iconName: 'pencil', variant: 'primary' }),
    });
    empty.tabIndex = -1;
    replaceContent(body, empty);
    return empty;
  }

  function groupByUnit(questions) {
    const map = new Map();
    for (const question of questions) {
      if (!map.has(question.unitId)) map.set(question.unitId, []);
      map.get(question.unitId).push(question);
    }
    const order = [...units.keys()];
    return [...map.entries()]
      .sort(([a], [b]) => (order.indexOf(a) === -1 ? Infinity : order.indexOf(a)) - (order.indexOf(b) === -1 ? Infinity : order.indexOf(b)))
      .map(([unitId, list]) => ({ unitId, questions: list }));
  }

  function groupSection(unitId, questions) {
    const unit = units.get(unitId);
    const kicker = unitKicker(unit) || unitId;
    const headingId = `mistakes-${unitId}`;
    return h('section', { class: 'mistakes__group', 'aria-labelledby': headingId },
      h('div', { class: 'mistakes__group-head' },
        h('h2', { class: 'mistakes__group-title', id: headingId },
          h('span', { class: 'mistakes__kicker' }, kicker),
          unit?.title ? biTitle(unit.title) : null),
        linkButton({
          label: '重练本单元 Retry unit',
          href: `#${sessionPath({ units: [unitId], mode: 'mistakes' })}`,
          iconName: 'refresh',
          size: 'sm',
          ariaLabel: `重练本单元错题 Retry mistakes: ${kicker}`,
        })),
      h('ul', { class: 'mistakes__list' }, questions.map((question) => mistakeItem(question))));
  }

  function mistakeItem(question) {
    const attempt = context.progress.attempt(question.id);
    const tries = Math.max(0, Number(attempt?.tries) || 0);
    const wrongCount = Math.max(0, tries - (Number(attempt?.correct) || 0));
    const panelId = `mistake-panel-${question.id}`;
    const panel = h('div', { class: 'mistakes__panel', id: panelId, hidden: true });
    const status = h('span', { class: 'mistakes__status' });
    let card = null;

    const toggle = button({ label: '重做 Retry', iconName: 'chevronDown', size: 'sm', variant: 'primary', className: 'mistakes__toggle', onClick: () => setOpen(toggle.getAttribute('aria-expanded') !== 'true') });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panelId);
    const remove = button({ label: '移出错题本 Remove', iconName: 'cross', size: 'sm', variant: 'ghost', onClick: () => removeItem() });

    const item = h('li', { class: 'mistakes__item' },
      h('div', { class: 'mistakes__meta' },
        typeBadge(question.type),
        difficultyBadge(question.difficulty),
        tries ? h('span', { class: 'mistakes__tries' }, `错 ${wrongCount} 次 / 共 ${tries} 次 Wrong ${wrongCount} of ${tries}`) : null,
        status),
      h('p', { class: 'mistakes__prompt', lang: promptLang(question) }, promptPreview(question, 220)),
      h('div', { class: 'mistakes__actions' }, toggle, remove),
      panel);

    function newCard() {
      card = createQuestionCard(question, {
        context,
        unit: units.get(question.unitId),
        headingLevel: 3,
        onAnswered: (result) => onRetried(result),
      });
      replaceContent(panel, card.element);
    }

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      setButtonLabel(toggle, open ? '收起 Close' : '重做 Retry');
      panel.hidden = !open;
      item.classList.toggle('is-open', open);
      if (!open) return;
      if (!card) newCard();
      card.focus();
    }

    function onRetried(result) {
      if (result.correct) {
        item.classList.add('is-mastered');
        replaceContent(status, badge('已掌握，已移出 Mastered, removed', 'accent'));
        remove.hidden = true;
        announce('答对了，这道题已移出错题本。Correct; this question has left the mistake book.');
      } else {
        replaceContent(status, badge('还没掌握 Not yet', 'danger'));
        panel.append(h('div', { class: 'mistakes__again' },
          button({
            label: '再做一次 Try again',
            iconName: 'refresh',
            size: 'sm',
            onClick: () => {
              newCard();
              card.focus();
            },
          })));
      }
      refreshCount();
    }

    function removeItem() {
      context.progress.removeMistake(question.id);
      const list = item.parentElement;
      const neighbour = item.nextElementSibling || item.previousElementSibling;
      item.remove();
      if (list && !list.children.length) list.closest('.mistakes__group')?.remove();
      refreshCount();
      announce('已移出错题本 Removed from the mistake book');
      if (!body.querySelector('.mistakes__item')) {
        showEmpty().focus();
      } else {
        (neighbour?.querySelector('.mistakes__toggle') || countText).focus();
      }
    }

    return item;
  }

  function missingNotice(ids) {
    if (failedUnits.length) {
      return h('div', { class: ['callout', 'callout--info', 'mistakes__missing'] },
        h('p', {}, `还有 ${ids.length} 道错题暂时显示不出来：它们可能在没加载出来的单元里，重新加载后就会出现。`),
        h('p', { lang: 'en' }, `${ids.length} more mistake${ids.length === 1 ? ' is' : 's are'} hidden for now: they may belong to the units that did not load and come back after a reload.`));
    }
    let armed = false;
    const notice = h('div', { class: ['callout', 'callout--warn', 'mistakes__missing'] });
    const clean = button({
      label: `清理这 ${ids.length} 条 Clean up`,
      iconName: 'cross',
      size: 'sm',
      variant: 'danger',
      onClick: () => {
        if (!armed) {
          armed = true;
          setButtonLabel(clean, '再点一次确认清理 Click again to confirm');
          return;
        }
        for (const id of ids) context.progress.removeMistake(id);
        notice.remove();
        announce('已清理找不到的错题 Missing entries removed');
        if (!body.querySelector('.mistakes__item')) showEmpty().focus();
        else countText.focus();
      },
    });
    replaceContent(notice,
      h('p', {}, `有 ${ids.length} 道错题在现在的题库里找不到（题库可能更新过，题目被删掉或改了编号）。`),
      h('p', { lang: 'en' }, `${ids.length} saved mistake${ids.length === 1 ? ' is' : 's are'} not in the current question bank.`),
      clean);
    return notice;
  }
}
