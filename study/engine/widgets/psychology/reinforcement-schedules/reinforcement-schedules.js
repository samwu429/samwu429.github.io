/**
 * Widget "reinforcement-schedules": the four schedules of partial reinforcement (King & Urbszat 2024, Chapter 6,
 * p.226-228 and Figure 6.10; PSY100 lecture slide 14).
 * - Try it: pick FR-n, VR-n, FI-t s or VI-t s and press the lever (the big button; Space and Enter work). The
 *   counters, the reinforcer notice and the cumulative record follow every response; the clock pauses while the
 *   page or this tab is hidden, and a run ends after three minutes.
 * - Typical patterns: four small cumulative records, a simplified illustration drawn by simple rules, with the
 *   points of the textbook's Figure 6.10.
 * - Examples (only when the config gives examples): name the schedule behind each example, with feedback,
 *   the reason, a score and Try again.
 * 组件“reinforcement-schedules”：四种部分强化程序（教材第 6 章第 226-228 页与图 6.10；PSY100 课件第 14 页）。
 * - 动手试试：选 FR-n、VR-n、FI-t 秒或 VI-t 秒，按杠杆（大按钮；空格键和回车键也可以）。计数器、强化物提示和累积记录随每次反应更新；
 *   页面或这个分页被隐藏时时钟暂停，一轮最多 3 分钟。
 * - 典型模式：四张小的累积记录（按简单规则画的简化示意），配上教材图 6.10 的要点。
 * - 例子练习（配置里有 examples 时才有）：给每个例子选出背后的程序，看反馈、理由和得分，可以再做一遍。
 *
 * Config: { title: Bi, ratio: 5, interval: 8, examples: [{ text: Bi, answer: "VR", why: Bi }] }
 * Every number and sentence comes from reinforcement-schedules-logic.js; this module only builds and updates the DOM.
 * 所有数字和句子都来自 reinforcement-schedules-logic.js；本模块只负责构建和更新 DOM。
 */
import { h, replaceContent, s } from '../../../core/dom/element.js';
import { icon } from '../../../core/dom/icons.js';
import { ensureStylesheet } from '../../../core/dom/stylesheet.js';
import { biTitle, enNode, zhNode } from '../../../core/text/bilingual.js';
import { button, setButtonLabel } from '../../../components/controls/button.js';
import { segmented } from '../../../components/controls/segmented.js';
import { loadTabStripStyles, tabStrip } from '../../../components/controls/tab-strip.js';
import {
  INTERVAL_LIMITS, RATIO_LIMITS, SCHEDULE_IDS, SCHEDULE_INFO, TEXT, answerDrill, ariaText, createDrill,
  createSession, drillFeedback, drillProgress, drillScoreText, drillSummary, formatNumber, formatSeconds,
  historyText, nextDrill, noticeFor, normalizeReinforcementSchedulesConfig, patternDescription, patternGeometry,
  randomSeed, readInterval, readRatio, recordDescription, recordGeometry, recordHeight, resetAnnouncement,
  restartDrill, ruleText, runStatus, scheduleCode, selectionAnnouncement, sessionPause, sessionRespond,
  sessionResume, sessionStarted, sessionTick, sessionTime, sliderValueText, statusText, typicalRecords,
} from './reinforcement-schedules-logic.js';

const BLOCK = 'reinforcement-schedules';

let mountCount = 0;

// Width used before the record is on the page and can be measured. 记录图挂到页面、能测量宽度之前使用的宽度。
const FALLBACK_WIDTH = 480;

// The record and the timers refresh four times a second, or once a second when the learner asks for less motion.
// 记录图和计时每秒刷新 4 次；学习者要求减少动态效果时每秒 1 次。
const TICK_MS = 250;
const REDUCED_TICK_MS = 1000;

// How long the notice stays highlighted after a reinforcer. A new reinforcer extends it instead of switching it
// off and on, so the highlight never blinks.
// 得到强化物后提示框保持高亮的时间。新的强化物只会延长高亮，不会先关再开，所以不会闪烁。
const FRESH_MS = 1600;

const NOTICE_ICONS = { ready: 'info', waiting: 'clock', reinforcer: 'checkCircle', over: 'flag' };

/* ---------- Small builders 小型构件 ---------- */

/** Short UI label: Chinese first, English after. 简短界面文字：中文在前、英文在后。 */
function label(value, role = 'label') {
  return [zhNode(value.zh, role), ' ', enNode(value.en)];
}

/** Chinese teaching sentence with its English version on the next line. 中文讲解句，下一行是对应的英文。 */
function pair(value, className, role = 'teach') {
  if (!value) return null;
  return h('p', { class: [`${BLOCK}__pair`, className] },
    zhNode(value.zh, role, 'span', `${BLOCK}__zh`),
    enNode(value.en, 'span', `${BLOCK}__en`));
}

/** English wording first (what the test uses), its Chinese meaning below. 先写英文（考试用的说法），下面是中文意思。 */
function quote(value, className) {
  return h('p', { class: [`${BLOCK}__quote`, className] },
    enNode(value.en, 'span', `${BLOCK}__quote-en`),
    zhNode(value.zh, 'gloss', 'span', `${BLOCK}__quote-zh`));
}

function heading(value, id, tag = 'h4') {
  return h(tag, { class: `${BLOCK}__heading`, id }, label(value));
}

/**
 * A bilingual line that changes while the learner works. Its two nodes are made once by the bilingual helpers
 * and later only get new text, so Chinese the learner tapped open in English practice mode stays open.
 * 学习过程中会变化的双语句子。两个节点由双语工具只创建一次，之后只换文字，
 * 这样学习者在英文练习模式下点开的中文不会又被模糊。
 */
function livePair(initial, className, role = 'teach') {
  const zh = zhNode(initial.zh, role, 'span', `${BLOCK}__zh`);
  const en = enNode(initial.en, 'span', `${BLOCK}__en`);
  const element = h('p', { class: [`${BLOCK}__pair`, className] }, zh, en);
  return {
    element,
    set(value) {
      element.hidden = !value;
      if (!value) return;
      if (zh.textContent !== value.zh) zh.textContent = value.zh;
      if (en.textContent !== value.en) en.textContent = value.en;
    },
  };
}

/**
 * Polite live region. Repeating the same message is still announced because a no-break space is toggled.
 * 礼貌型朗读区域。末尾交替添加不换行空格，相同的消息也会再次播报。
 */
function liveRegion() {
  const element = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let toggle = false;
  return {
    element,
    announce(text) {
      toggle = !toggle;
      element.textContent = `${text}${toggle ? ' ' : ''}`;
    },
  };
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Redraws after the width of `element` changes (frame-throttled); returns a function that stops observing.
 * 元素宽度变化后重画（按动画帧节流）；返回停止监听的函数。
 */
function observeWidth(element, onResize) {
  if (typeof ResizeObserver !== 'function') return () => {};
  let frame = 0;
  let width = Math.round(element.clientWidth);
  const observer = new ResizeObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const measured = Math.round(element.clientWidth);
      if (measured > 0 && measured !== width) {
        width = measured;
        onResize();
      }
    });
  });
  observer.observe(element);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
  };
}

function measuredWidth(element) {
  const width = Math.round(element.clientWidth);
  return width > 0 ? width : FALLBACK_WIDTH;
}

/** Small key picture for the record legend. 记录图图例中的小图示。 */
function legendSwatch(kind) {
  return s('svg', { class: `${BLOCK}__swatch`, viewBox: '0 0 20 14', width: 20, height: 14, 'aria-hidden': 'true' },
    kind === 'mark'
      ? s('line', { class: `${BLOCK}__mark`, x1: 7, y1: 3, x2: 13, y2: 11 })
      : s('path', { class: `${BLOCK}__line`, d: 'M1 12H6V8H11V4H19' }));
}

/** Labelled range input with a visible value and aria-valuetext. 带标签、显示数值并设置 aria-valuetext 的滑块。 */
function slider({ id, kind, labelText, min, max, value, signal, onInput }) {
  const output = h('span', { class: `${BLOCK}__slider-value`, 'aria-hidden': 'true' });
  const input = h('input', {
    id,
    class: `${BLOCK}__range`,
    type: 'range',
    min: String(min),
    max: String(max),
    step: '1',
    value: String(value),
  });
  function show(next) {
    output.textContent = kind === 'ratio' ? `n = ${readRatio(next)}` : `t = ${formatNumber(readInterval(next))} s`;
    input.setAttribute('aria-valuetext', ariaText(sliderValueText(kind, next)));
  }
  input.addEventListener('input', () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) return;
    show(next);
    onInput(next);
  }, { signal });
  show(value);
  return h('div', { class: ['field', `${BLOCK}__slider`] },
    h('div', { class: `${BLOCK}__slider-head` },
      h('label', { class: 'field__label', for: id }, label(labelText)),
      output),
    input);
}

/* ---------- Header and the two-question map 标题与“两个问题”表 ---------- */

function headerBlock(model, titleId) {
  return h('header', { class: `${BLOCK}__header` },
    h('p', { class: `${BLOCK}__eyebrow` }, label(TEXT.eyebrow)),
    h('h3', { class: `${BLOCK}__title`, id: titleId }, biTitle(model.title)),
    pair(TEXT.intro, `${BLOCK}__intro`));
}

function mapCell(id) {
  return h('td', { class: `${BLOCK}__map-cell` },
    h('span', { class: `${BLOCK}__code ${BLOCK}__map-code` }, id),
    h('span', { class: `${BLOCK}__map-name` }, label(SCHEDULE_INFO[id].short)));
}

function mapBlock() {
  const { map } = TEXT;
  return h('div', { class: `${BLOCK}__map` },
    h('div', { class: 'table-scroll' },
      h('table', { class: ['data-table', `${BLOCK}__map-table`] },
        h('caption', { class: `${BLOCK}__map-caption` }, label(map.caption)),
        h('thead', {}, h('tr', {},
          h('td', { class: `${BLOCK}__map-corner` }),
          h('th', { scope: 'col' }, label(map.ratio)),
          h('th', { scope: 'col' }, label(map.interval)))),
        h('tbody', {},
          h('tr', {}, h('th', { scope: 'row' }, label(map.fixed)), mapCell('FR'), mapCell('FI')),
          h('tr', {}, h('th', { scope: 'row' }, label(map.variable)), mapCell('VR'), mapCell('VI'))))),
    pair(map.partial, `${BLOCK}__note`),
    pair(map.lecture, `${BLOCK}__note`));
}

/* ---------- Try it 动手试试 ---------- */

function createTryIt(model, { prefix, signal, announce }) {
  const ids = {
    heading: `${prefix}-try-heading`,
    picker: `${prefix}-picker`,
    rule: `${prefix}-rule`,
    record: `${prefix}-record`,
    ratio: `${prefix}-ratio`,
    interval: `${prefix}-interval`,
  };
  const settings = { ratio: model.ratio, interval: model.interval };
  const fresh = (id) => createSession({ schedule: id, ratio: settings.ratio, interval: settings.interval, seed: randomSeed() });
  const sessions = Object.fromEntries(SCHEDULE_IDS.map((id) => [id, fresh(id)]));
  let current = SCHEDULE_IDS[0];
  let visible = true;
  let disposed = false;
  let ticker = 0;
  let freshTimer = 0;
  let noticeTone = '';
  let stopObserving = () => {};

  /* Picker 选择程序 */
  const codes = {};
  const picker = segmented({
    options: SCHEDULE_IDS.map((id) => {
      codes[id] = h('span', { class: `${BLOCK}__option-code` }, scheduleCode(id, settings.ratio, settings.interval));
      return { value: id, label: [codes[id], h('span', { class: `${BLOCK}__option-name` }, label(SCHEDULE_INFO[id].short))] };
    }),
    value: current,
    ariaLabel: ariaText(TEXT.tryIt.picker),
    className: `${BLOCK}__picker`,
    onChange: (id) => choose(id),
  });
  picker.removeAttribute('aria-label');
  picker.setAttribute('aria-labelledby', ids.picker);

  /* Rule and lever 规则与杠杆 */
  const rule = livePair(ruleText(current, settings.ratio, settings.interval), `${BLOCK}__rule`);
  rule.element.id = ids.rule;
  const lever = button({
    label: label(TEXT.tryIt.respond),
    iconName: 'arrowDown',
    variant: 'primary',
    size: 'lg',
    className: `${BLOCK}__lever`,
  });
  lever.setAttribute('aria-describedby', ids.rule);
  lever.addEventListener('click', respondNow, { signal });
  // Holding Enter repeats clicks; one press of the lever is one response. 按住回车会连续触发点击；按一下杠杆只算一次反应。
  lever.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  }, { signal });

  /* Counters, progress and the notice 计数器、进度与提示 */
  const countValue = () => h('dd', { class: `${BLOCK}__count-value` }, '0');
  const counts = { responses: countValue(), reinforcers: countValue(), time: countValue() };
  const counter = (text, node) => h('div', { class: `${BLOCK}__count` },
    h('dt', { class: `${BLOCK}__count-label` }, label(text)), node);
  const counterList = h('dl', { class: `${BLOCK}__counts` },
    counter(TEXT.tryIt.responses, counts.responses),
    counter(TEXT.tryIt.reinforcers, counts.reinforcers),
    counter(TEXT.tryIt.time, counts.time));
  const progress = livePair(statusText(sessions[current].run, 0), `${BLOCK}__status`);

  // Only the short title is live, so quick reinforcers do not queue long announcements.
  // 只有简短的标题是朗读区域，强化物来得很快时也不会排起一长串播报。
  const noticeIcon = h('span', { class: `${BLOCK}__notice-icon`, 'aria-hidden': 'true' });
  const noticeTitle = livePair(TEXT.tryIt.ready, `${BLOCK}__notice-title`, 'label');
  noticeTitle.element.setAttribute('role', 'status');
  noticeTitle.element.setAttribute('aria-live', 'polite');
  noticeTitle.element.setAttribute('aria-atomic', 'true');
  const noticeDetail = livePair(TEXT.tryIt.ready, `${BLOCK}__notice-detail`);
  const notice = h('div', { class: `${BLOCK}__notice` },
    noticeIcon,
    h('div', { class: `${BLOCK}__notice-text` }, noticeTitle.element, noticeDetail.element));

  /* Cumulative record 累积记录 */
  const svg = s('svg', { class: `${BLOCK}__svg`, role: 'img', 'aria-label': '' });
  const recordHost = h('div', { class: `${BLOCK}__record-host` }, svg);
  const history = livePair(TEXT.record.heading, `${BLOCK}__history`);
  history.set(null);
  const record = h('section', { class: `${BLOCK}__record`, 'aria-labelledby': ids.record },
    h('h5', { class: `${BLOCK}__subheading`, id: ids.record }, label(TEXT.record.heading)),
    h('figure', { class: `${BLOCK}__figure` },
      h('p', { class: `${BLOCK}__axis` }, icon('arrowUp', { size: 14 }), label(TEXT.record.yAxis)),
      recordHost,
      h('p', { class: `${BLOCK}__axis ${BLOCK}__axis--x` }, label(TEXT.record.xAxis), icon('arrowRight', { size: 14 })),
      h('figcaption', { class: `${BLOCK}__caption` },
        h('ul', { class: `${BLOCK}__legend` },
          h('li', {}, legendSwatch('line'), label(TEXT.record.line)),
          h('li', {}, legendSwatch('mark'), label(TEXT.record.mark))),
        pair(TEXT.record.read))),
    history.element);

  /* Settings and reset 设置与重新开始 */
  const settingsBox = h('details', { class: `${BLOCK}__settings` },
    h('summary', { class: `${BLOCK}__settings-summary` }, icon('sliders', { size: 16 }), ' ', label(TEXT.tryIt.settings)),
    h('div', { class: `${BLOCK}__settings-body` },
      slider({
        id: ids.ratio, kind: 'ratio', labelText: TEXT.tryIt.ratioLabel, min: RATIO_LIMITS.min, max: RATIO_LIMITS.max,
        value: settings.ratio, signal, onInput: changeRatio,
      }),
      slider({
        id: ids.interval, kind: 'interval', labelText: TEXT.tryIt.intervalLabel, min: INTERVAL_LIMITS.min, max: INTERVAL_LIMITS.max,
        value: settings.interval, signal, onInput: changeInterval,
      }),
      pair(TEXT.tryIt.settingsNote, `${BLOCK}__note`)));
  const resetButton = button({ label: label(TEXT.tryIt.reset), iconName: 'refresh', variant: 'ghost', size: 'sm' });
  resetButton.addEventListener('click', () => {
    const now = performance.now();
    sessions[current] = fresh(current);
    notice.classList.remove('is-fresh');
    syncClock(now);
    renderLive(now);
    announce(ariaText(resetAnnouncement(current, settings.ratio, settings.interval)));
  }, { signal });

  const element = h('div', { class: `${BLOCK}__tab-body` },
    heading(TEXT.tryIt.heading, ids.heading),
    pair(TEXT.tryIt.how),
    h('div', { class: `${BLOCK}__picker-block` },
      h('p', { class: `${BLOCK}__picker-label`, id: ids.picker }, label(TEXT.tryIt.picker)),
      picker),
    h('div', { class: `${BLOCK}__rule-box` },
      h('p', { class: `${BLOCK}__rule-label` }, label(TEXT.tryIt.rule)),
      rule.element),
    lever,
    counterList,
    notice,
    progress.element,
    record,
    h('div', { class: `${BLOCK}__actions` }, resetButton),
    pair(TEXT.tryIt.keep, `${BLOCK}__note`),
    pair(TEXT.tryIt.seconds, `${BLOCK}__note`),
    settingsBox);

  // The clock stops while the page is hidden. 页面被隐藏时时钟停止。
  document.addEventListener('visibilitychange', () => syncClock(), { signal });

  /* Clock 时钟 */
  function shouldRun(session) {
    return !disposed && visible && !document.hidden && sessionStarted(session) && !session.ended;
  }

  function stopTicker() {
    if (!ticker) return;
    window.clearInterval(ticker);
    ticker = 0;
  }

  function startTicker() {
    if (ticker || disposed) return;
    ticker = window.setInterval(tick, prefersReducedMotion() ? REDUCED_TICK_MS : TICK_MS);
  }

  /** Runs the current clock only while the run is on screen; pauses it otherwise. 只有这一轮显示在屏幕上时时钟才走，否则暂停。 */
  function syncClock(now = performance.now()) {
    const session = sessions[current];
    if (shouldRun(session)) {
      sessions[current] = sessionResume(session, now);
      startTicker();
    } else {
      sessions[current] = sessionPause(session, now);
      stopTicker();
    }
  }

  function tick() {
    if (disposed) return;
    const now = performance.now();
    const before = sessions[current];
    const after = sessionTick(before, now);
    sessions[current] = after;
    if (after.ended && !before.ended) stopTicker();
    renderLive(now);
  }

  /* Actions 操作 */
  function respondNow() {
    const before = sessions[current];
    if (disposed || before.ended) return;
    const now = performance.now();
    const result = sessionRespond(before, now);
    sessions[current] = result.session;
    if (result.reinforced) markFresh();
    syncClock(now);
    renderLive(now);
  }

  function markFresh() {
    notice.classList.add('is-fresh');
    window.clearTimeout(freshTimer);
    freshTimer = window.setTimeout(() => {
      freshTimer = 0;
      notice.classList.remove('is-fresh');
    }, FRESH_MS);
  }

  function choose(id) {
    if (!SCHEDULE_IDS.includes(id) || id === current) return;
    const now = performance.now();
    sessions[current] = sessionPause(sessions[current], now);
    stopTicker();
    current = id;
    notice.classList.remove('is-fresh');
    syncClock(now);
    renderAll(now);
    announce(ariaText(selectionAnnouncement(id, settings.ratio, settings.interval)));
  }

  /** New n or t: the schedules that use it start again with the new rule. n 或 t 改变后，用到它的程序按新规则重新开始。 */
  function restart(idsToReset) {
    const now = performance.now();
    if (idsToReset.includes(current)) {
      stopTicker();
      notice.classList.remove('is-fresh');
    }
    idsToReset.forEach((id) => { sessions[id] = fresh(id); });
    SCHEDULE_IDS.forEach((id) => { codes[id].textContent = scheduleCode(id, settings.ratio, settings.interval); });
    syncClock(now);
    renderAll(now);
  }

  function changeRatio(value) {
    const next = readRatio(value);
    if (next === settings.ratio) return;
    settings.ratio = next;
    restart(['FR', 'VR']);
  }

  function changeInterval(value) {
    const next = readInterval(value);
    if (next === settings.interval) return;
    settings.interval = next;
    restart(['FI', 'VI']);
  }

  /* Rendering 渲染 */
  function renderNotice(session) {
    const next = noticeFor(session);
    if (next.tone !== noticeTone) {
      noticeTone = next.tone;
      notice.dataset.tone = next.tone;
      replaceContent(noticeIcon, icon(NOTICE_ICONS[next.tone], { size: 20 }));
    }
    noticeTitle.set(next.title);
    noticeDetail.set(next.detail);
  }

  function drawRecord(session, time) {
    const width = measuredWidth(recordHost);
    const height = recordHeight(width);
    const geometry = recordGeometry(session.run, time, { width, height });
    const { plot } = geometry;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('aria-label', recordDescription(session.run, time));
    replaceContent(svg,
      geometry.yTicks.map((tick) => s('line', { class: `${BLOCK}__grid`, x1: plot.left, x2: plot.right, y1: tick.y, y2: tick.y })),
      geometry.yTicks.map((tick) => s('text', {
        class: `${BLOCK}__tick-label`, x: Number(plot.left) - 6, y: tick.y, dy: '0.35em', 'text-anchor': 'end',
      }, tick.label)),
      geometry.xTicks.map((tick) => s('text', {
        class: `${BLOCK}__tick-label`, x: tick.x, y: Number(plot.bottom) + 17, 'text-anchor': 'middle',
      }, tick.label)),
      s('line', { class: `${BLOCK}__axis-line`, x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }),
      s('line', { class: `${BLOCK}__axis-line`, x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom }),
      s('path', { class: `${BLOCK}__line`, d: geometry.path }),
      geometry.marks.map((mark) => s('line', { class: `${BLOCK}__mark`, ...mark })),
      s('circle', { class: `${BLOCK}__pen`, cx: geometry.pen.x, cy: geometry.pen.y, r: 4 }));
  }

  function renderLive(now = performance.now()) {
    const session = sessions[current];
    const time = sessionTime(session, now);
    const state = runStatus(session.run, time);
    counts.responses.textContent = String(state.responses);
    counts.reinforcers.textContent = String(state.reinforcers);
    counts.time.textContent = formatSeconds(time);
    progress.set(session.ended ? null : statusText(session.run, time));
    renderNotice(session);
    history.set(historyText(session.run));
    if (session.ended) lever.setAttribute('aria-disabled', 'true');
    else lever.removeAttribute('aria-disabled');
    drawRecord(session, time);
  }

  function renderAll(now = performance.now()) {
    rule.set(ruleText(current, settings.ratio, settings.interval));
    renderLive(now);
  }

  return {
    element,
    /** Called once the widget is on the page, so the record can be measured. 组件挂到页面后调用，这时记录图才能测量宽度。 */
    start() {
      renderAll();
      stopObserving = observeWidth(recordHost, () => drawRecord(sessions[current], sessionTime(sessions[current], performance.now())));
    },
    setVisible(next) {
      visible = next;
      if (disposed) return;
      syncClock();
      if (next) renderLive();
    },
    destroy() {
      disposed = true;
      stopTicker();
      window.clearTimeout(freshTimer);
      freshTimer = 0;
      stopObserving();
    },
  };
}

/* ---------- Typical patterns 典型模式 ---------- */

function patternCard(id, data, prefix) {
  const info = SCHEDULE_INFO[id];
  const titleId = `${prefix}-pattern-${id}`;
  const geometry = patternGeometry(data.records[id], data.yMax);
  const { plot } = geometry;
  const drawing = s('svg', {
    class: `${BLOCK}__pattern-svg`, viewBox: geometry.viewBox, role: 'img', 'aria-label': patternDescription(id),
  },
  s('line', { class: `${BLOCK}__axis-line`, x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }),
  s('line', { class: `${BLOCK}__axis-line`, x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom }),
  s('path', { class: `${BLOCK}__line`, d: geometry.path }),
  geometry.marks.map((mark) => s('line', { class: `${BLOCK}__mark`, ...mark })));
  return h('article', { class: `${BLOCK}__pattern`, 'aria-labelledby': titleId },
    h('h5', { class: `${BLOCK}__pattern-title`, id: titleId },
      h('span', { class: `${BLOCK}__code` }, id), ' ', biTitle(info.name)),
    h('figure', { class: `${BLOCK}__pattern-figure` },
      drawing,
      h('figcaption', { class: `${BLOCK}__caption` },
        h('span', { class: `${BLOCK}__caption-label` }, label(TEXT.patterns.drawing)),
        pair(info.drawing))),
    h('p', { class: `${BLOCK}__facts-title` }, label(TEXT.patterns.facts)),
    h('dl', { class: `${BLOCK}__facts` },
      ['rule', 'rate', 'pattern', 'resistance', 'example'].map((key) => h('div', { class: `${BLOCK}__fact` },
        h('dt', { class: `${BLOCK}__fact-label` }, label(TEXT.patterns.rows[key])),
        h('dd', { class: `${BLOCK}__fact-value` }, quote(info.figure[key]))))),
    pair(info.note, `${BLOCK}__note`),
    h('details', { class: `${BLOCK}__more` },
      h('summary', { class: `${BLOCK}__more-summary` }, label(TEXT.patterns.more)),
      h('ul', { class: `${BLOCK}__more-list` }, info.more.map((item) => h('li', {}, quote(item))))));
}

function createPatterns({ prefix }) {
  const data = typicalRecords();
  return h('div', { class: `${BLOCK}__tab-body` },
    heading(TEXT.patterns.heading, `${prefix}-patterns-heading`),
    h('p', { class: `${BLOCK}__badge` }, icon('info', { size: 14 }), label(TEXT.patterns.illustration)),
    pair(TEXT.patterns.intro),
    h('p', { class: `${BLOCK}__axes-note` },
      label(TEXT.patterns.axes), ' ', legendSwatch('mark'), label(TEXT.record.mark)),
    h('div', { class: `${BLOCK}__patterns` }, SCHEDULE_IDS.map((id) => patternCard(id, data, prefix))),
    pair(TEXT.patterns.remember, `${BLOCK}__remember`),
    pair(TEXT.patterns.source, `${BLOCK}__note`));
}

/* ---------- Examples drill 例子练习 ---------- */

function createDrillPanel(examples, { prefix, signal }) {
  let drill = createDrill(examples);
  // The example now in the box. The box is rebuilt only for another example or a new round, so Chinese the learner
  // tapped open in English practice mode stays open while they answer.
  // 框里正在显示的例子。只有换了例子或开始新一轮时才重建这个框，这样学习者在英文练习模式下点开的中文，作答时不会又被模糊。
  let shownExample = null;
  const optionsId = `${prefix}-drill-options`;

  const progress = livePair(drillProgress(drill), `${BLOCK}__progress`, 'label');
  const score = livePair(drillScoreText(drill), `${BLOCK}__score`, 'label');
  const exampleBox = h('div', { class: `${BLOCK}__example`, tabindex: '-1' });
  const choices = SCHEDULE_IDS.map((id) => {
    const mark = h('span', { class: `${BLOCK}__choice-mark` });
    const element = button({
      label: [
        h('span', { class: `${BLOCK}__code` }, id),
        h('span', { class: `${BLOCK}__choice-name` }, label(SCHEDULE_INFO[id].short)),
        mark,
      ],
      className: `${BLOCK}__choice`,
    });
    element.addEventListener('click', () => pick(id), { signal });
    return { id, element, mark };
  });
  const feedback = h('div', { class: `${BLOCK}__feedback`, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const nextButton = button({ label: label(TEXT.drill.next), iconName: 'arrowRight', variant: 'primary', size: 'sm', className: `${BLOCK}__next` });
  nextButton.addEventListener('click', goNext, { signal });
  const againButton = button({ label: label(TEXT.drill.tryAgain), iconName: 'refresh' });
  againButton.addEventListener('click', again, { signal });

  const quiz = h('div', { class: `${BLOCK}__quiz` },
    exampleBox,
    h('p', { class: `${BLOCK}__choices-label`, id: optionsId }, label(TEXT.drill.options)),
    h('div', { class: `${BLOCK}__choices`, role: 'group', 'aria-labelledby': optionsId }, choices.map((choice) => choice.element)),
    feedback,
    h('div', { class: `${BLOCK}__actions` }, nextButton));
  const summary = h('div', { class: `${BLOCK}__summary`, tabindex: '-1', hidden: true });

  const element = h('div', { class: `${BLOCK}__tab-body` },
    heading(TEXT.drill.heading, `${prefix}-drill-heading`),
    pair(TEXT.drill.intro),
    h('div', { class: `${BLOCK}__drill-bar` }, progress.element, score.element),
    quiz,
    summary);

  function pick(id) {
    const next = answerDrill(drill, id);
    if (next === drill) return;
    drill = next;
    render();
  }

  function goNext() {
    drill = nextDrill(drill);
    render();
    (drill.finished ? summary : exampleBox).focus();
  }

  function again() {
    drill = restartDrill(drill);
    shownExample = null;
    render();
    exampleBox.focus();
  }

  function renderChoices(example) {
    const answered = drill.picked !== null;
    choices.forEach((choice) => {
      const isAnswer = answered && choice.id === example.answer;
      const isPick = answered && choice.id === drill.picked;
      choice.element.classList.toggle('is-answer', isAnswer);
      choice.element.classList.toggle('is-picked', isPick);
      if (answered) choice.element.setAttribute('aria-disabled', 'true');
      else choice.element.removeAttribute('aria-disabled');
      let markContent = null;
      if (isAnswer) markContent = [icon('check', { size: 14 }), label(TEXT.drill.answer)];
      else if (isPick) markContent = [icon('cross', { size: 14 }), label(TEXT.drill.yourPick)];
      replaceContent(choice.mark, markContent);
    });
  }

  function renderFeedback(example) {
    if (drill.picked === null) {
      replaceContent(feedback);
      delete feedback.dataset.tone;
      return;
    }
    const result = drillFeedback(example.answer, drill.picked);
    feedback.dataset.tone = result.correct ? 'correct' : 'wrong';
    replaceContent(feedback,
      h('p', { class: `${BLOCK}__feedback-title` }, icon(result.correct ? 'checkCircle' : 'cross', { size: 18 }), label(result.title)),
      pair(result.breakdown),
      h('div', { class: `${BLOCK}__why` },
        h('p', { class: `${BLOCK}__why-label` }, label(TEXT.drill.why)),
        pair(example.why)));
  }

  function renderSummary() {
    const missed = drill.results.filter((result) => !result.correct);
    replaceContent(summary,
      h('p', { class: `${BLOCK}__summary-title` }, icon(missed.length ? 'flag' : 'checkCircle', { size: 18 }), label(drillSummary(drill))),
      missed.length
        ? [
          h('p', { class: `${BLOCK}__summary-label` }, label(TEXT.drill.review)),
          h('ul', { class: `${BLOCK}__missed` }, missed.map((result) => {
            const example = examples[result.index];
            return h('li', { class: `${BLOCK}__missed-item` },
              quote(example.text),
              h('p', { class: `${BLOCK}__missed-answer` },
                h('span', { class: `${BLOCK}__code` }, example.answer), ' ', label(SCHEDULE_INFO[example.answer].short)));
          })),
        ]
        : pair(TEXT.drill.allCorrect, `${BLOCK}__all-correct`),
      h('div', { class: `${BLOCK}__actions` }, againButton));
  }

  function render() {
    quiz.hidden = drill.finished;
    summary.hidden = !drill.finished;
    progress.set(drill.finished ? null : drillProgress(drill));
    score.set(drillScoreText(drill));
    if (drill.finished) {
      renderSummary();
      return;
    }
    const example = examples[drill.index];
    if (example !== shownExample) {
      shownExample = example;
      replaceContent(exampleBox,
        enNode(example.text.en, 'p', `${BLOCK}__example-en`),
        zhNode(example.text.zh, 'gloss', 'p', `${BLOCK}__example-zh`));
    }
    renderChoices(example);
    renderFeedback(example);
    nextButton.hidden = drill.picked === null;
    setButtonLabel(nextButton, label(drill.index + 1 >= drill.answers.length ? TEXT.drill.results : TEXT.drill.next));
  }

  render();
  return { element };
}

/* ---------- Mount 挂载 ---------- */

export async function mount(container, config, context) {
  await Promise.all([
    ensureStylesheet(new URL('./reinforcement-schedules.css', import.meta.url)),
    loadTabStripStyles(),
  ]);
  mountCount += 1;
  const prefix = `${BLOCK}-${mountCount}`;
  const titleId = `${prefix}-title`;
  const model = normalizeReinforcementSchedulesConfig(config);
  // Every listener is registered with this signal, so the cleanup removes them all at once.
  // 所有事件监听都用这个 signal 注册，清理时一次全部移除。
  const controller = new AbortController();
  const live = liveRegion();
  const tools = { prefix, signal: controller.signal, announce: live.announce };

  const tryIt = createTryIt(model, tools);
  const patterns = createPatterns(tools);
  const drill = model.examples.length ? createDrillPanel(model.examples, tools) : null;
  const tabs = [
    { id: 'try', label: label(TEXT.tabs.try), iconName: 'target', panel: tryIt.element },
    { id: 'patterns', label: label(TEXT.tabs.patterns), iconName: 'grid', panel: patterns },
    drill ? { id: 'examples', label: label(TEXT.tabs.examples), iconName: 'pencil', panel: drill.element } : null,
  ].filter(Boolean);
  const strip = tabStrip({
    tabs,
    selected: 'try',
    label: ariaText(TEXT.tabs.label),
    idPrefix: prefix,
    className: `${BLOCK}__tabs`,
    // The try-it clock runs only while its tab is shown. “动手试试”的时钟只在它的分页显示时走。
    onSelect: (id) => tryIt.setVisible(id === 'try'),
  });

  const root = h('section', { class: BLOCK, 'aria-labelledby': titleId },
    headerBlock(model, titleId),
    mapBlock(),
    strip.element,
    tabs.map((tab) => tab.panel),
    live.element);

  container.replaceChildren(root);
  tryIt.start();

  return () => {
    controller.abort();
    tryIt.destroy();
  };
}
