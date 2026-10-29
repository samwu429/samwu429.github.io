/**
 * Flashcards page (#/flashcards): choose a deck, flip cards, mark "Again" / "Know", then review the round.
 * 闪卡页面（#/flashcards）：选卡组、翻卡、标记“不熟 / 认识”，最后查看本轮小结。
 *
 * Deck choices can come from the hash query so other pages can link to a ready deck, e.g.
 * #/flashcards?unit=lec03,lab03&dir=zh-en&only=unfamiliar&size=40&order=course.
 * 卡组设置可以来自哈希查询参数，方便其他页面直接链接到设好的卡组，例如
 * #/flashcards?unit=lec03,lab03&dir=zh-en&only=unfamiliar&size=40&order=course。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { isActivatable, isTextEntry, withinPage } from '../../core/dom/keyboard.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { enNode, hasText, uiText, zhNode } from '../../core/text/bilingual.js';
import { isRouteId } from '../../core/util/ids.js';
import { shuffleWith } from '../../core/util/random.js';
import { button, linkButton } from '../../components/controls/button.js';
import { segmented } from '../../components/controls/segmented.js';
import { createUnitFilter, loadUnitFilterStyles } from '../../components/controls/unit-filter.js';
import { progressBar } from '../../components/feedback/progress-bar.js';
import { emptyState, partialLoadNotice } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { hashWithQuery, parseUnitParam, unitChoices, unitShortLabel } from '../glossary/logic/unit-refs.js';
import { DIRECTIONS, createFlashcard } from './flashcards-card.js';
import { STATUS, buildDeck, readStatuses, statusCounts, termsInUnits } from './logic/deck-builder.js';
import { RATING, createSession, currentCard, rateCard, sessionStats } from './logic/deck-queue.js';

const REQUEUE_GAP = 3;
const SIZE_OPTIONS = ['20', '40', 'all'];
const DEFAULT_SIZE = '20';
const DIRECTION_LABELS = {
  [DIRECTIONS.EN_ZH]: { title: '英→中 EN to ZH', hint: '看英文，想中文意思（认得） Recognise the meaning', short: '英→中' },
  [DIRECTIONS.ZH_EN]: { title: '中→英 ZH to EN', hint: '看中文，想出英文术语（考试要写） Recall the English for the exam', short: '中→英' },
};

export async function render(container, context, params = {}, query = new URLSearchParams()) {
  await Promise.all([
    ensureStylesheet(new URL('./flashcards-view.css', import.meta.url)),
    loadUnitFilterStyles(),
  ]);
  context.setTitle('闪卡 Flashcards');

  const course = context.course || {};
  const courseUnits = Array.isArray(course.units) ? course.units : [];
  const unitById = new Map(courseUnits.map((unit) => [unit.id, unit]));
  const loaded = await context.repo.allTerms();
  const terms = uniqueTerms(loaded);
  const termById = new Map(terms.map((term) => [term.id, term]));
  const loadNotice = () => partialLoadNotice({
    unitIds: loaded.failedUnits || [],
    units: courseUnits,
    what: { zh: '术语', en: 'Terms' },
    onRetry: () => context.refresh(),
  });

  if (!terms.length) {
    replaceContent(container, setupHeader(), loadNotice() || emptyState({
      title: '还没有闪卡 No cards yet',
      body: '术语表准备好以后，这里就能背卡了。 Cards appear here once the glossary is ready.',
      action: linkButton({ label: '去学习 Go to lessons', href: '#/learn', iconName: 'book' }),
    }));
    return undefined;
  }

  const unitCounts = new Map();
  for (const term of terms) {
    for (const unitId of new Set(term.units)) unitCounts.set(unitId, (unitCounts.get(unitId) || 0) + 1);
  }
  const choices = unitChoices(courseUnits, unitCounts);

  const setup = {
    units: parseUnitParam(query.get('unit'), choices.map((choice) => choice.id)),
    direction: query.get('dir') === DIRECTIONS.ZH_EN ? DIRECTIONS.ZH_EN : DIRECTIONS.EN_ZH,
    onlyUnfamiliar: query.get('only') === 'unfamiliar',
    size: SIZE_OPTIONS.includes(query.get('size')) ? query.get('size') : DEFAULT_SIZE,
    shuffle: query.get('order') !== 'course',
  };

  let statuses = new Map();
  let screen = 'setup';
  let session = null;
  let deckIds = [];
  let flipped = false;
  let cardView = null;
  let ui = null;
  const statusOf = (termId) => statuses.get(termId) || null;

  document.addEventListener('keydown', onKeydown);
  showSetup();

  return () => {
    screen = 'closed';
    document.removeEventListener('keydown', onKeydown);
  };

  function setupHeader() {
    return pageHeader({
      eyebrow: course.shortCode || course.code,
      title: { zh: '闪卡', en: 'Flashcards' },
      subtitle: '先在心里回答，再翻面核对；不熟的卡过几张会再出现。 Answer in your head, then flip. Missed cards come back a few cards later.',
      actions: [linkButton({ label: '术语表 Glossary', href: '#/glossary', iconName: 'translate', size: 'sm' })],
    });
  }

  function showSetup({ focusHeading = false } = {}) {
    screen = 'setup';
    session = null;
    cardView = null;
    ui = null;
    statuses = readStatuses(context.progress, terms.map((term) => term.id));
    const overall = statusCounts(terms, statusOf);
    const header = setupHeader();

    const unitFilter = createUnitFilter({
      units: choices,
      selected: setup.units,
      totalCount: terms.length,
      countLabel: '张卡 cards',
      ariaLabel: '选择单元 Choose units',
      onChange: (units) => {
        setup.units = units;
        update();
      },
    });

    const directionOptions = Object.values(DIRECTIONS).map((value) => {
      const input = h('input', {
        type: 'radio',
        name: 'flashcards-direction',
        value,
        class: 'flashcards-setup__radio',
        checked: setup.direction === value,
        onchange: () => {
          if (!input.checked) return;
          setup.direction = value;
          update();
        },
      });
      return h('label', { class: 'flashcards-setup__option' },
        input,
        h('span', { class: 'flashcards-setup__option-text' },
          h('span', { class: 'flashcards-setup__option-title' }, DIRECTION_LABELS[value].title),
          h('span', { class: 'flashcards-setup__option-hint' }, DIRECTION_LABELS[value].hint)));
    });

    const onlyCount = h('span', { class: 'flashcards-setup__count' });
    const onlyInput = h('input', {
      type: 'checkbox',
      checked: setup.onlyUnfamiliar,
      onchange: () => {
        setup.onlyUnfamiliar = onlyInput.checked;
        update();
      },
    });
    const shuffleInput = h('input', {
      type: 'checkbox',
      checked: setup.shuffle,
      onchange: () => {
        setup.shuffle = shuffleInput.checked;
        update();
      },
    });
    const sizeControl = segmented({
      options: [
        { value: '20', label: '20' },
        { value: '40', label: '40' },
        { value: 'all', label: '全部 All' },
      ],
      value: setup.size,
      ariaLabel: '每轮张数 Cards per round',
      size: 'sm',
      onChange: (size) => {
        setup.size = size;
        update();
      },
    });

    const summary = h('p', { class: 'flashcards-setup__summary', role: 'status' });
    const startButton = h('button', { type: 'submit', class: 'btn btn--primary btn--lg flashcards-setup__start' },
      icon('play'), h('span', { class: 'btn__label' }, uiText('开始 Start')));

    const form = h('form', {
      class: 'flashcards-setup',
      'aria-label': '卡组设置 Deck setup',
      onsubmit: (event) => {
        event.preventDefault();
        start();
      },
    },
    h('fieldset', { class: 'flashcards-setup__group' },
      h('legend', { class: 'flashcards-setup__legend' }, '1. 选单元 Units'),
      unitFilter.element),
    h('fieldset', { class: 'flashcards-setup__group' },
      h('legend', { class: 'flashcards-setup__legend' }, '2. 方向 Direction'),
      h('div', { class: 'flashcards-setup__options' }, directionOptions)),
    h('fieldset', { class: 'flashcards-setup__group' },
      h('legend', { class: 'flashcards-setup__legend' }, '3. 范围 Options'),
      h('label', { class: 'check-row' }, onlyInput, h('span', {}, '只练不熟的卡 Only unfamiliar cards ', onlyCount)),
      h('label', { class: 'check-row' }, shuffleInput, h('span', {}, '随机顺序 Shuffle')),
      h('div', { class: 'flashcards-setup__size' },
        h('span', { class: 'flashcards-setup__size-label', 'aria-hidden': 'true' }, '每轮张数 Cards per round'),
        sizeControl)),
    h('div', { class: 'flashcards-setup__footer' }, summary, startButton));

    replaceContent(container, header, loadNotice(), overviewPanel(overall), form);
    update();
    if (focusHeading) {
      const heading = header.querySelector('h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }

    function update() {
      const pool = termsInUnits(terms, setup.units);
      const unfamiliar = pool.filter((term) => statusOf(term.id) !== STATUS.KNOWN).length;
      const available = setup.onlyUnfamiliar ? unfamiliar : pool.length;
      const limit = deckLimit(setup.size);
      const count = limit ? Math.min(limit, available) : available;
      onlyCount.textContent = `（${unfamiliar} 张 cards）`;
      if (count) {
        summary.textContent = `这一轮 ${count} 张，可选 ${available} 张 · ${count} of ${available} cards this round`;
      } else if (setup.onlyUnfamiliar && pool.length) {
        summary.textContent = '这些单元的卡你都认识了！关掉“只练不熟的卡”可以再复习一遍。 You know every card here.';
      } else {
        summary.textContent = '没有可以练的卡 No cards to practise';
      }
      startButton.disabled = count === 0;
      syncUrl();
    }

    function start() {
      const ids = buildDeck(terms, {
        units: setup.units,
        onlyUnfamiliar: setup.onlyUnfamiliar,
        statusOf,
        size: deckLimit(setup.size),
        shuffle: setup.shuffle,
      });
      if (ids.length) startSession(ids);
    }
  }

  function overviewPanel(overall) {
    return h('section', { class: 'flashcards-overview', 'aria-label': '全部术语进度 Progress on all terms' },
      h('div', { class: 'flashcards-overview__tiles' },
        statTile('全部术语 All terms', overall.total),
        statTile('已认识 Known', overall.known, 'good'),
        statTile('不熟 Learning', overall.learning, overall.learning ? 'warn' : null),
        statTile('没学过 New', overall.fresh)),
      progressBar(overall.known, overall.total, { label: '已认识的术语 Known terms' }));
  }

  // Mirrors the deck choices into the hash without a hashchange, so reload and Back keep them.
  // 把卡组设置写回哈希但不触发 hashchange，刷新和后退时设置都能保留。
  function syncUrl() {
    const hash = hashWithQuery('/flashcards', {
      unit: setup.units,
      dir: setup.direction === DIRECTIONS.EN_ZH ? '' : setup.direction,
      only: setup.onlyUnfamiliar ? 'unfamiliar' : '',
      size: setup.size === DEFAULT_SIZE ? '' : setup.size,
      order: setup.shuffle ? '' : 'course',
    });
    if (window.location.hash === hash) return;
    try {
      window.history.replaceState(window.history.state, '', hash);
    } catch {
      // Some sandboxed previews forbid history changes; the page still works.
      // 部分沙盒预览环境禁止修改历史记录；页面功能不受影响。
    }
  }

  function startSession(ids) {
    deckIds = [...ids];
    session = createSession(deckIds);
    screen = 'session';
    renderSessionScreen();
    showCard({ focusCard: true });
  }

  function renderSessionScreen() {
    const count = h('p', { class: 'flashcards-session__count' });
    const progressSlot = h('div', { class: 'flashcards-session__progress' });
    const cardSlot = h('div', { class: 'flashcards-session__card' });
    const flipLabel = h('span', { class: 'btn__label' }, uiText('看背面 Show back'));
    const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    // detail is 0 when a button is pressed from the keyboard; then focus stays on that button.
    // 用键盘按下按钮时 detail 为 0，此时焦点留在该按钮上。
    const ratingButton = (rating, iconName, label, key, className) => h('button', {
      type: 'button',
      class: ['btn', 'btn--lg', 'flashcards-session__rate', className],
      onclick: (event) => rate(rating, { keepFocus: event.detail === 0 }),
    }, icon(iconName), h('span', { class: 'btn__label' }, uiText(label)), h('kbd', { class: 'flashcards-session__key', 'aria-hidden': 'true' }, key));

    replaceContent(container, h('section', { class: 'flashcards-session', 'aria-labelledby': 'flashcards-session-title' },
      h('div', { class: 'flashcards-session__bar' },
        button({ label: '结束 End', iconName: 'arrowLeft', variant: 'ghost', size: 'sm', onClick: () => showDone() }),
        h('h1', { class: 'flashcards-session__title', id: 'flashcards-session-title' },
          '闪卡 Flashcards',
          h('span', { class: 'flashcards-session__mode' }, DIRECTION_LABELS[setup.direction].short)),
        count),
      progressSlot,
      cardSlot,
      h('div', { class: 'flashcards-session__actions' },
        h('button', { type: 'button', class: 'btn btn--secondary btn--lg flashcards-session__flip', onclick: flip }, icon('refresh'), flipLabel),
        ratingButton(RATING.AGAIN, 'cross', '不熟 Again', '1', 'flashcards-session__again'),
        ratingButton(RATING.KNOW, 'check', '认识 Know', '2', 'btn--primary flashcards-session__know')),
      h('p', { class: 'kbd-hint flashcards-session__keys' },
        '快捷键 Keys: ', h('kbd', {}, 'Space'), ' 翻面 Flip · ',
        h('kbd', {}, '1'), ' / ', h('kbd', {}, '←'), ' 不熟 Again · ',
        h('kbd', {}, '2'), ' / ', h('kbd', {}, '→'), ' 认识 Know'),
      live));

    ui = { count, progressSlot, cardSlot, flipLabel, live };
  }

  function showCard({ focusCard = false } = {}) {
    const termId = currentCard(session);
    const term = termId ? termById.get(termId) : null;
    if (!term) {
      showDone();
      return;
    }
    flipped = false;
    cardView = createFlashcard(term, {
      direction: setup.direction,
      unitLabel: unitLabelOf(term),
      status: statusOf(term.id),
      onFlip: flip,
    });
    ui.cardSlot.replaceChildren(cardView.element);
    replaceContent(ui.flipLabel, uiText('看背面 Show back'));

    const stats = sessionStats(session);
    replaceContent(ui.count,
      h('strong', {}, `${stats.known} / ${stats.total}`),
      h('span', { class: 'flashcards-session__count-label' }, ' 已认识 known'));
    replaceContent(ui.progressSlot, progressBar(stats.known, stats.total, { label: '本轮已认识 Known this round', showText: false, size: 'sm' }));
    // Focus follows the new card so Space and the arrow keys keep working without a mouse.
    // 焦点跟随新卡片，不用鼠标也能继续用空格和方向键。
    if (focusCard) cardView.element.focus({ preventScroll: true });
  }

  function flip() {
    if (screen !== 'session' || !cardView) return;
    flipped = !flipped;
    cardView.setFlipped(flipped);
    replaceContent(ui.flipLabel, uiText(flipped ? '看正面 Show front' : '看背面 Show back'));
    announce(flipped ? `背面 Back: ${cardView.answerText}` : `正面 Front: ${cardView.promptText}`);
  }

  function rate(rating, { keepFocus = false } = {}) {
    if (screen !== 'session' || !session) return;
    const termId = currentCard(session);
    if (!termId) return;
    const status = rating === RATING.KNOW ? STATUS.KNOWN : STATUS.LEARNING;
    context.progress.setFlashcard(termId, status);
    statuses.set(termId, status);
    session = rateCard(session, rating, { gap: REQUEUE_GAP });
    const stats = sessionStats(session);
    if (stats.finished) {
      showDone();
      return;
    }
    showCard({ focusCard: !keepFocus });
    const verdict = rating === RATING.KNOW ? '认识 Know' : '不熟，过几张再来 Again later';
    announce(`${verdict} · ${stats.known} / ${stats.total} · 下一张 Next: ${cardView.promptText}`);
  }

  function announce(text) {
    if (ui) ui.live.textContent = text;
  }

  // Space flips (unless a button has focus), 1 / Left marks "Again", 2 / Right marks "Know".
  // Up and Down keep scrolling the page. Keys pressed in the site header or navigation are ignored.
  // 空格翻面（焦点在按钮上时除外），1 或左方向键为“不熟”，2 或右方向键为“认识”；上下方向键仍用于滚动页面。
  // 焦点在站点页头或导航中时不响应。
  function onKeydown(event) {
    if (screen !== 'session' || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { target } = event;
    if (!withinPage(target, container) || isTextEntry(target)) return;
    const { key } = event;
    if (key === ' ' || key === 'Spacebar') {
      if (isActivatable(target)) return;
      event.preventDefault();
      if (!event.repeat) flip();
    } else if (key === '1' || key === 'ArrowLeft') {
      event.preventDefault();
      if (!event.repeat) rate(RATING.AGAIN);
    } else if (key === '2' || key === 'ArrowRight') {
      event.preventDefault();
      if (!event.repeat) rate(RATING.KNOW);
    }
  }

  function showDone() {
    if (!session) {
      showSetup({ focusHeading: true });
      return;
    }
    screen = 'done';
    cardView = null;
    ui = null;
    const stats = sessionStats(session);
    const overall = statusCounts(terms, statusOf);
    const title = h('h1', { class: 'flashcards-done__title', id: 'flashcards-done-title', tabindex: '-1' },
      stats.finished ? '这一轮完成了 Round complete' : '这一轮先到这里 Round ended');
    const retryIds = stats.finished ? stats.missedIds : stats.reviewIds;
    const retryLabel = stats.finished
      ? `再练不熟的 ${retryIds.length} 张 Practise the ${retryIds.length} you missed`
      : `接着练剩下的 ${retryIds.length} 张 Continue with ${retryIds.length} cards`;

    replaceContent(container, h('section', { class: 'flashcards-done', 'aria-labelledby': 'flashcards-done-title' },
      h('header', { class: 'flashcards-done__head' },
        h('span', { class: 'page-header__eyebrow' }, '闪卡 Flashcards'),
        title,
        h('p', { class: 'flashcards-done__lead' }, doneMessage(stats))),
      h('div', { class: 'flashcards-overview__tiles' },
        statTile('本轮卡片 Cards', stats.total),
        statTile('一次就认识 First try', stats.firstTry, 'good'),
        statTile('不熟过 Needed again', stats.neededAgain, stats.neededAgain ? 'warn' : null),
        statTile('评价次数 Ratings', stats.reviews),
        stats.finished ? null : statTile('还没认识 Not yet known', stats.remaining, 'warn')),
      h('div', { class: 'flashcards-done__overall' },
        h('p', { class: 'flashcards-done__overall-text' }, `全部 ${overall.total} 个术语中已认识 ${overall.known} 个 · Known ${overall.known} of ${overall.total} terms`),
        progressBar(overall.known, overall.total, { label: '已认识的术语 Known terms' })),
      stats.missedIds.length
        ? h('section', { class: 'flashcards-done__missed', 'aria-labelledby': 'flashcards-missed-title' },
          h('h2', { class: 'flashcards-done__subtitle', id: 'flashcards-missed-title' }, '刚才不熟的卡 Cards you missed'),
          h('ul', { class: 'flashcards-done__list', role: 'list' }, stats.missedIds.map((termId) => missedItem(termById.get(termId)))))
        : null,
      h('div', { class: 'flashcards-done__actions' },
        button({ label: '再来一遍 Same deck again', iconName: 'refresh', variant: 'primary', onClick: () => startSession(ordered(deckIds)) }),
        retryIds.length ? button({ label: retryLabel, iconName: 'target', onClick: () => startSession(ordered(retryIds)) }) : null,
        button({ label: '重新选卡组 New deck', iconName: 'cards', onClick: () => showSetup({ focusHeading: true }) }),
        linkButton({ label: '查术语表 Open glossary', href: '#/glossary', iconName: 'translate', variant: 'ghost' }))));
    title.focus();
  }

  function doneMessage(stats) {
    if (!stats.reviews) return '这一轮还没有评价任何卡片。 No cards were rated in this round.';
    if (stats.finished && !stats.neededAgain) return '全部一次就认识，很棒！ Every card on the first try.';
    if (stats.finished) return '下面是这一轮不熟过的卡，趁热再练一遍记得更牢。 The cards you missed are listed below; one more pass now helps them stick.';
    return '已评价的卡都保存好了，随时可以接着练。 Your ratings are saved, so you can pick up later.';
  }

  function missedItem(term) {
    if (!term) return null;
    const label = [enNode(hasText(term.en) ? term.en : term.id, 'span', 'flashcards-done__term'), zhNode(term.zh, 'gloss', 'span', 'flashcards-done__zh')];
    return h('li', { class: 'flashcards-done__item' },
      isRouteId(term.id) ? h('a', { class: 'flashcards-done__link', href: `#/glossary/${term.id}` }, label) : h('span', { class: 'flashcards-done__link' }, label));
  }

  function ordered(ids) {
    return setup.shuffle ? shuffleWith(ids) : [...ids];
  }

  function unitLabelOf(term) {
    return [...new Set(term.units)].map((unitId) => unitShortLabel(unitById.get(unitId), unitId)).join(' · ');
  }
}

function statTile(label, value, tone) {
  return h('div', { class: ['flashcards-stat', tone ? `flashcards-stat--${tone}` : null] },
    h('span', { class: 'flashcards-stat__value' }, String(value)),
    h('span', { class: 'flashcards-stat__label' }, label));
}

function deckLimit(size) {
  const number = Number(size);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Keeps terms that can make a card (an id plus an English or Chinese name), once each, with units[].
// 只保留能做成卡片的术语（有 id，且有英文或中文名），去重并保证带有 units[]。
function uniqueTerms(terms) {
  const seen = new Set();
  const result = [];
  for (const term of Array.isArray(terms) ? terms : []) {
    if (!term || typeof term.id !== 'string' || !term.id || seen.has(term.id)) continue;
    if (!hasText(term.en) && !hasText(term.zh)) continue;
    seen.add(term.id);
    result.push({ ...term, units: Array.isArray(term.units) ? term.units.filter((unitId) => typeof unitId === 'string') : [] });
  }
  return result;
}
