/**
 * Mock exam (#/mock): a builder (units, question counts, time limit), a timed paper with every
 * question, automatic grading of objective questions, self-grading of written answers and a report by unit.
 * 模拟考试（#/mock）：组卷设置（单元、题量、时限）、限时整卷作答、客观题自动判分、主观题对照参考答案自评，
 * 最后给出按单元的成绩单。
 *
 * A running exam lives in module memory, so leaving the route and coming back resumes it (the clock
 * keeps running). Results are written to progress only when the report is produced.
 * 进行中的考试保存在模块内存里：离开再回来可以继续（计时不停）；出成绩单时才写入答题记录。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { icon } from '../../core/dom/icons.js';
import { biTitle } from '../../core/text/bilingual.js';
import { formatDuration } from '../../core/util/format.js';
import { button, linkButton, setButtonLabel } from '../../components/controls/button.js';
import { emptyState, loadingState, partialLoadNotice } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { createQuestionCard, ensureQuestionCardStyles } from './components/question-card.js';
import { kindLabel, unitKicker, unitsById } from './components/labels.js';
import { ensureResultsStyles, lessonLink, questionList, scoreBoard, unitBreakdown } from './components/results.js';
import {
  MOCK_DEFAULTS,
  MOCK_LIMITS,
  composeMockExam,
  crossedMilestone,
  mockAvailability,
  normalizeMockSettings,
  remainingSeconds,
} from './logic/mock-exam.js';
import { randomSeed } from './logic/rng.js';
import { filterQuestions, sessionPath } from './logic/session.js';
import { summarizeResults } from './logic/summary.js';

const MINUTE_CHOICES = [30, 45, 60, 90, 120, 0];

// Survive route changes while the page stays open. 页面打开期间跨路由保留。
let activeExam = null;
let lastSettings = null;
let lastOutcome = null;

export async function render(container, context) {
  await Promise.all([
    ensureStylesheet(new URL('./mock-exam-view.css', import.meta.url)),
    ensureQuestionCardStyles(),
    ensureResultsStyles(),
  ]);
  context.setTitle('模拟考试 Mock exam');
  replaceContent(container, loadingState());

  const loaded = await context.repo.allQuestions();
  // A newer navigation replaced this container while loading; do not move the live exam into it.
  // 加载期间已经发生新的跳转、容器被替换时，不要把进行中的考试挪进旧容器。
  if (!container.isConnected) return undefined;
  const bank = filterQuestions(loaded);
  const units = unitsById(context.course);
  const failedUnits = loaded.failedUnits || [];
  let mounted = null;

  const hooks = {
    showBuilder(notice) {
      if (mounted) mounted.detach();
      mounted = null;
      renderBuilder(notice);
      window.scrollTo({ top: 0 });
    },
  };

  function mount(exam) {
    mounted = exam;
    exam.attach(container, hooks);
  }

  function renderBuilder(notice) {
    replaceContent(container, builderView({
      bank,
      units,
      notice,
      loadNotice: partialLoadNotice({
        unitIds: failedUnits,
        units: context.course?.units,
        what: { zh: '题目', en: 'Questions' },
        onRetry: () => context.refresh(),
      }),
      onStart(settings) {
        activeExam?.dispose();
        lastSettings = settings;
        activeExam = createExam({ context, bank, units, settings });
        mount(activeExam);
        window.scrollTo({ top: 0 });
      },
      onViewResults() {
        if (!activeExam) return;
        mount(activeExam);
        window.scrollTo({ top: 0 });
      },
    }));
  }

  if (activeExam && activeExam.courseId !== context.courseId) activeExam.dispose();
  if (activeExam && activeExam.phase !== 'results') mount(activeExam);
  else renderBuilder();

  return () => {
    if (mounted) mounted.detach();
    mounted = null;
  };
}

/**
 * Builder form: units (default every lecture that has questions), counts and time limit.
 * 组卷表单：单元（默认所有有题的讲课）、题量与时限。
 */
function builderView({ bank, units, notice, loadNotice, onStart, onViewResults }) {
  const header = pageHeader({
    eyebrow: '刷题 Practice',
    title: { zh: '模拟考试', en: 'Mock exam' },
    subtitle: '像真实考试一样限时作答：先做选择题，再用英文写长答题。交卷后客观题自动判分，主观题对照参考答案自评。A timed paper like the real test: multiple choice first, then written answers in English. Objective questions are graded at hand-in; you grade the written ones against the model answers.',
  });
  const scope = h('div', { class: ['callout', 'callout--warn', 'mock-exam__scope'] },
    h('span', { class: 'callout__label' }, '考试范围 Test scope'),
    h('p', {}, '真实测验考哪几讲，一定以老师在 Quercus / Piazza 上的通知为准；这里的范围由你自己选。'),
    h('p', { lang: 'en' }, 'Always confirm the real test scope on Quercus / Piazza. Here you pick the units yourself.'));
  const noticeBox = notice ? h('p', { class: ['callout', 'callout--info', 'mock-exam__notice-box'] }, notice) : null;

  if (!bank.length) {
    return h('div', { class: ['mock-exam', 'mock-exam--builder'] }, header, noticeBox, loadNotice, scope, loadNotice ? null : emptyState({
      title: '题库还在准备中 Questions are on the way',
      body: '这门课的练习题上线后就能组卷了。The mock exam needs the practice questions, which are not published yet.',
      action: linkButton({ label: '去学习 Go to lessons', href: '#/learn', iconName: 'book', variant: 'primary' }),
    }));
  }

  const allUnits = [...units.values()];
  const availability = mockAvailability(bank, allUnits.map((unit) => unit.id)).perUnit;
  const usable = (unitId) => {
    const counts = availability.get(unitId);
    return Boolean(counts && counts.objective + counts.written > 0);
  };
  const usableUnits = allUnits.filter((unit) => usable(unit.id));
  const lectures = usableUnits.filter((unit) => unit.kind === 'lecture').map((unit) => unit.id);
  const initial = normalizeMockSettings(lastSettings || {
    units: lectures.length ? lectures : usableUnits.map((unit) => unit.id),
    ...MOCK_DEFAULTS,
  });

  const checkboxes = new Map();
  const kinds = [];
  for (const unit of allUnits) if (!kinds.includes(unit.kind)) kinds.push(unit.kind);
  const unitGroups = kinds.map((kind) => h('div', { class: 'mock-exam__unit-group' },
    h('p', { class: 'mock-exam__group-title' }, kindLabel(kind)),
    h('ul', { class: 'mock-exam__units' }, allUnits.filter((unit) => unit.kind === kind).map((unit) => {
      const counts = availability.get(unit.id) || { objective: 0, written: 0 };
      const enabled = usable(unit.id);
      const input = h('input', {
        type: 'checkbox',
        value: unit.id,
        checked: enabled && initial.units.includes(unit.id),
        disabled: !enabled,
        onchange: update,
      });
      checkboxes.set(unit.id, input);
      return h('li', {}, h('label', { class: ['mock-exam__unit', enabled ? null : 'is-disabled'] },
        input,
        h('span', { class: 'mock-exam__unit-text' },
          h('span', { class: 'mock-exam__unit-kicker' }, unitKicker(unit)),
          unit.title ? biTitle(unit.title, { className: 'mock-exam__unit-title' }) : null,
          h('span', { class: 'mock-exam__unit-count' }, enabled
            ? `客观 ${counts.objective} · 主观 ${counts.written} | Objective ${counts.objective} · Written ${counts.written}`
            : '题库准备中 Coming soon'))));
    }))));

  const selectWhere = (predicate) => {
    for (const [unitId, input] of checkboxes) {
      if (!input.disabled) input.checked = predicate(units.get(unitId));
    }
    update();
  };

  const objective = numberField('mock-exam-objective', '客观题数量 Objective questions',
    '单选、多选、判断、计算 Multiple choice, select-all, true/false, calculation', initial.objectiveCount, MOCK_LIMITS.objectiveMax);
  const written = numberField('mock-exam-written', '主观题数量 Written questions',
    '简答、论述，用英文写 Short and long answers, written in English', initial.writtenCount, MOCK_LIMITS.writtenMax);
  const minutes = h('select', { class: 'select', id: 'mock-exam-minutes', onchange: update },
    MINUTE_CHOICES.map((value) => h('option', { value: String(value), selected: value === initial.minutes },
      value ? `${value} 分钟 minutes` : '不限时 No limit')));

  const availabilityText = h('p', { class: 'mock-exam__availability', 'aria-live': 'polite' });
  const error = h('p', { class: 'mock-exam__error', role: 'alert' });

  function selectedUnits() {
    return [...checkboxes].filter(([, input]) => input.checked && !input.disabled).map(([unitId]) => unitId);
  }

  function currentSettings() {
    return normalizeMockSettings({
      units: selectedUnits(),
      objectiveCount: objective.input.value,
      writtenCount: written.input.value,
      minutes: minutes.value,
    });
  }

  function update() {
    for (const input of checkboxes.values()) input.closest('.mock-exam__unit')?.classList.toggle('is-checked', input.checked);
    const settings = currentSettings();
    const counts = mockAvailability(bank, settings.units);
    const short = [];
    if (settings.objectiveCount > counts.objective) short.push(`客观题只有 ${counts.objective} 道 only ${counts.objective} objective`);
    if (settings.writtenCount > counts.written) short.push(`主观题只有 ${counts.written} 道 only ${counts.written} written`);
    availabilityText.classList.toggle('is-warn', short.length > 0);
    availabilityText.textContent = settings.units.length
      ? `已选 ${settings.units.length} 个单元：可用客观题 ${counts.objective} 道、主观题 ${counts.written} 道。${settings.units.length} units: ${counts.objective} objective and ${counts.written} written questions available.${short.length ? ` ${short.join('；')}，会全部用上 (all will be used).` : ''}`
      : '还没选单元 No units selected yet.';
    error.textContent = '';
  }

  const form = h('form', {
    class: 'mock-exam__form',
    novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const settings = currentSettings();
      const counts = mockAvailability(bank, settings.units);
      if (!settings.units.length) {
        error.textContent = '先选至少一个单元 Choose at least one unit.';
      } else if (!settings.objectiveCount && !settings.writtenCount) {
        error.textContent = '题量不能都是 0 Ask for at least one question.';
      } else if (Math.min(counts.objective, settings.objectiveCount) + Math.min(counts.written, settings.writtenCount) === 0) {
        error.textContent = '所选单元里没有可用的题 No questions are available for this selection.';
      } else {
        onStart(settings);
      }
    },
  },
  h('fieldset', { class: 'mock-exam__fieldset' },
    h('legend', { class: 'mock-exam__legend' }, '考试范围 Units'),
    h('div', { class: 'mock-exam__quick' },
      button({ label: '全部讲课 All lectures', size: 'sm', onClick: () => selectWhere((unit) => unit?.kind === 'lecture') }),
      button({ label: '全选 All', size: 'sm', onClick: () => selectWhere(() => true) }),
      button({ label: '清空 None', size: 'sm', variant: 'ghost', onClick: () => selectWhere(() => false) })),
    unitGroups),
  h('fieldset', { class: 'mock-exam__fieldset' },
    h('legend', { class: 'mock-exam__legend' }, '题量与时间 Questions and time'),
    h('div', { class: 'mock-exam__numbers' },
      objective.field,
      written.field,
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'mock-exam-minutes' }, '时间限制 Time limit'),
        minutes,
        h('p', { class: 'mock-exam__field-hint' }, `默认 ${MOCK_DEFAULTS.minutes} 分钟 Default ${MOCK_DEFAULTS.minutes} minutes`)))),
  availabilityText,
  error,
  button({ label: '开始考试 Start exam', iconName: 'play', variant: 'primary', size: 'lg', type: 'submit', className: 'mock-exam__start' }));

  update();

  const last = activeExam?.phase === 'results' && lastOutcome
    ? h('div', { class: ['callout', 'callout--tip', 'mock-exam__last'] },
      h('span', { class: 'callout__label' }, '上次模拟考 Last mock exam'),
      h('p', {}, `得分 Score ${lastOutcome.earned} / ${lastOutcome.possible}${Number.isFinite(lastOutcome.percent) ? `（${Math.round(lastOutcome.percent)}%）` : ''}`),
      button({ label: '查看成绩单 View results', iconName: 'eye', size: 'sm', onClick: onViewResults }))
    : null;

  return h('div', { class: ['mock-exam', 'mock-exam--builder'] }, header, noticeBox, loadNotice, scope, last, form);

  function numberField(id, label, hint, value, max) {
    const input = h('input', {
      class: 'input',
      id,
      type: 'number',
      min: '0',
      max: String(max),
      step: '1',
      inputmode: 'numeric',
      value: String(value),
      'aria-describedby': `${id}-hint`,
      onchange: update,
    });
    return {
      input,
      field: h('div', { class: 'field' },
        h('label', { class: 'field__label', for: id }, label),
        input,
        h('p', { class: 'mock-exam__field-hint', id: `${id}-hint` }, hint)),
    };
  }
}

/**
 * One exam attempt: composes the paper and owns its DOM; attach() / detach() bind it to a route render.
 * 一次考试：组卷并持有试卷 DOM；attach() / detach() 把它挂到某次路由渲染上或取下。
 */
function createExam({ context, bank, units, settings }) {
  const composition = composeMockExam(bank, { ...settings, seed: randomSeed() });
  const byId = new Map(bank.map((question) => [question.id, question]));
  const questions = composition.questionIds.map((id) => byId.get(id)).filter(Boolean);
  const objectiveCount = composition.objectiveIds.length;
  const writtenCount = questions.length - objectiveCount;
  const startedAt = Date.now();
  const endAt = settings.minutes > 0 ? startedAt + settings.minutes * 60000 : null;

  let phase = 'paper';
  let submittedAt = null;
  let hooks = null;
  let timerId = null;
  let lastSeconds = null;
  let attachedBefore = false;
  let confirmKind = null;
  let pendingLink = null;
  let jumpFrom = -1;

  // The attempt lives only in memory, so until the report is produced (or the attempt is discarded)
  // the browser asks before a reload, a closed tab or Back past the site throws it away, even while
  // the learner is on another page of the station.
  // 这次作答只保存在内存里，因此在出成绩单（或放弃）之前，刷新、关闭标签页或后退离开本站都会先由浏览器确认，
  // 即使学习者此时在复习站的其他页面。
  const guardUnload = (event) => {
    event.preventDefault();
    event.returnValue = true;
  };
  window.addEventListener('beforeunload', guardUnload);
  const releaseUnload = () => window.removeEventListener('beforeunload', guardUnload);

  const cards = questions.map((question, position) => createQuestionCard(question, {
    context,
    mode: 'exam',
    number: position + 1,
    unit: units.get(question.unitId),
    headingLevel: 3,
    record: false,
    onChange: () => updateAnswered(),
  }));

  const courseCode = context.course?.shortCode || context.course?.code || '';
  const scopeText = settings.units.map((unitId) => unitKicker(units.get(unitId)) || unitId).join(' · ');
  const minutesText = endAt ? `${settings.minutes} 分钟 minutes` : '不限时 No time limit';

  const head = h('header', { class: 'mock-exam__head' },
    h('p', { class: 'page-header__eyebrow' }, '模拟考试 Mock exam'),
    h('h1', { class: 'mock-exam__title' }, `${courseCode} 模拟测验 Practice test`.trim()),
    h('p', { class: 'mock-exam__meta' },
      `${objectiveCount} 道客观题 + ${writtenCount} 道主观题 · ${objectiveCount} objective + ${writtenCount} written · ${minutesText}`),
    h('p', { class: ['mock-exam__meta', 'mock-exam__meta--muted'] }, `范围 Scope: ${scopeText}`));

  const rules = h('div', { class: ['callout', 'callout--info', 'mock-exam__rules'] },
    h('span', { class: 'callout__label' }, '考试说明 Instructions'),
    h('ul', { class: 'mock-exam__rules-list' },
      h('li', {}, '题目和真实考试一样是英文；实在看不懂可以点“显示中文”。Questions are in English; use Show Chinese only when you are stuck.'),
      h('li', {}, '主观题请用英文写。交卷后客观题自动判分，主观题对照参考答案自评。Write the written answers in English. Objective questions are graded at hand-in; you grade the written ones with the model answers.'),
      h('li', {}, '计时器在页面底部，时间到会自动交卷。The timer is at the bottom; the paper is submitted automatically when time runs out.')));

  const shortfall = composition.shortfall.objective || composition.shortfall.written
    ? `题库不够：这份卷子有 ${objectiveCount} 道客观题、${writtenCount} 道主观题。Not enough questions in the bank: this paper has ${objectiveCount} objective and ${writtenCount} written.`
    : '';
  const notice = h('p', { class: 'mock-exam__notice', role: 'status' }, shortfall);
  const reportSlot = h('section', { class: 'mock-exam__panel', 'aria-labelledby': 'mock-exam-report-title', hidden: true });
  const gradingSlot = h('section', { class: 'mock-exam__panel', 'aria-labelledby': 'mock-exam-grading-title', hidden: true });
  const milestoneLive = h('p', { class: 'visually-hidden', role: 'status' });

  const part = (id, title, list) => (list.length
    ? h('section', { class: 'mock-exam__part', 'aria-labelledby': id },
      h('h2', { class: ['section-heading', 'mock-exam__part-title'], id }, title),
      h('div', { class: 'mock-exam__questions' }, list.map((card) => card.element)))
    : null);

  const timerValue = h('span', { class: 'mock-exam__timer-value' });
  const timer = h('div', { class: 'mock-exam__timer', role: 'timer', 'aria-label': '剩余时间 Time left' }, icon('clock', { size: 18 }), timerValue);
  const answeredButton = h('button', { type: 'button', class: 'mock-exam__answered', onclick: jumpToUnanswered });
  const quitButton = button({ label: '放弃 Quit', iconName: 'cross', size: 'sm', variant: 'ghost', onClick: () => askConfirm('quit') });
  const submitButton = button({ label: '交卷 Submit', iconName: 'flag', variant: 'primary', onClick: () => askConfirm('submit') });
  const barMain = h('div', { class: 'mock-exam__bar-main' },
    timer, answeredButton, h('div', { class: 'mock-exam__bar-actions' }, quitButton, submitButton));

  // In-page confirmation instead of browser prompts: the bar switches to a confirm state.
  // 用页面内的确认状态代替浏览器弹窗：底栏切换成“确认”模式。
  const confirmText = h('p', { class: 'mock-exam__confirm-text', id: 'mock-exam-confirm-text' });
  const confirmNo = button({ label: '继续答题 Keep working', onClick: () => clearConfirm(true) });
  const confirmYes = button({ label: '确定 Confirm', variant: 'primary', onClick: () => confirmAction() });
  const confirmBox = h('div', {
    class: 'mock-exam__confirm',
    role: 'group',
    'aria-labelledby': 'mock-exam-confirm-text',
    hidden: true,
    onkeydown: (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      clearConfirm(true);
    },
  }, confirmText, h('div', { class: 'mock-exam__confirm-actions' }, confirmNo, confirmYes));
  const bar = h('div', { class: 'mock-exam__bar' }, barMain, confirmBox);

  const root = h('div', { class: ['mock-exam', 'mock-exam--paper'] },
    head,
    rules,
    notice,
    reportSlot,
    gradingSlot,
    part('mock-exam-part-a', `第一部分 客观题 Part A · Objective (${objectiveCount})`, cards.slice(0, objectiveCount)),
    part('mock-exam-part-b', `第二部分 主观题 Part B · Written (${writtenCount})`, cards.slice(objectiveCount)),
    bar,
    milestoneLive);

  updateAnswered();

  // ---- mounting 挂载 ----

  function attach(container, nextHooks) {
    hooks = nextHooks;
    replaceContent(container, root);
    document.addEventListener('click', onDocumentClick, true);
    if (phase === 'paper') {
      if (endAt !== null && remainingSeconds(endAt) <= 0) {
        submitPaper('timeout');
      } else {
        if (attachedBefore) notice.textContent = '已回到进行中的考试，计时没有暂停。Welcome back: the exam is still running.';
        startTimer();
      }
    }
    attachedBefore = true;
  }

  function detach() {
    stopTimer();
    if (confirmKind) clearConfirm(false);
    document.removeEventListener('click', onDocumentClick, true);
    hooks = null;
  }

  function dispose() {
    detach();
    releaseUnload();
    if (activeExam === controller) activeExam = null;
  }

  // ---- timer 计时 ----

  function startTimer() {
    stopTimer();
    if (endAt === null) {
      timerValue.textContent = '不限时 No limit';
      return;
    }
    lastSeconds = remainingSeconds(endAt);
    tick();
    timerId = window.setInterval(tick, 500);
  }

  function stopTimer() {
    if (timerId !== null) window.clearInterval(timerId);
    timerId = null;
  }

  function tick() {
    const seconds = remainingSeconds(endAt);
    timerValue.textContent = formatDuration(seconds);
    timer.classList.toggle('is-low', seconds <= 300);
    const milestone = crossedMilestone(lastSeconds, seconds);
    lastSeconds = seconds;
    if (milestone) {
      const minutesLeft = milestone / 60;
      milestoneLive.textContent = `还剩 ${minutesLeft} 分钟 ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} left`;
    }
    if (seconds <= 0) submitPaper('timeout');
  }

  // ---- answering 作答 ----

  function updateAnswered() {
    const answered = cards.filter((card) => card.hasResponse()).length;
    const remaining = cards.length - answered;
    replaceContent(answeredButton,
      h('span', { class: 'mock-exam__answered-count' }, `${answered} / ${cards.length}`),
      h('span', { class: 'mock-exam__answered-label' }, '已答 Answered'));
    const hint = remaining ? '跳到下一道没答的题 Jump to the next unanswered question' : '全部答完了 All answered';
    answeredButton.title = hint;
    answeredButton.setAttribute('aria-label', `已答 ${answered} / ${cards.length} Answered. ${hint}`);
  }

  function jumpToUnanswered() {
    for (let step = 1; step <= cards.length; step += 1) {
      const position = (jumpFrom + step) % cards.length;
      if (!cards[position].hasResponse()) {
        jumpFrom = position;
        cards[position].focus();
        return;
      }
    }
    submitButton.focus();
  }

  function askConfirm(kind, link = null) {
    if (phase !== 'paper') return;
    confirmKind = kind;
    pendingLink = link;
    const unanswered = cards.filter((card) => !card.hasResponse()).length;
    let text = '考试还没交卷，离开后计时不会暂停，回到“模拟考试”可以继续。The exam is still running; the clock keeps going while you are away.';
    let yes = '离开 Leave';
    let variant = 'secondary';
    if (kind === 'submit') {
      text = unanswered
        ? `还有 ${unanswered} 题没答，确定现在交卷吗？ ${unanswered} unanswered. Submit now?`
        : '确定交卷吗？交卷后不能再改答案。Submit now? Answers cannot be changed afterwards.';
      yes = '确定交卷 Submit';
      variant = 'primary';
    } else if (kind === 'quit') {
      text = '放弃后，这次的作答不会保存。Quit and discard this attempt?';
      yes = '确定放弃 Discard';
      variant = 'danger';
    }
    confirmText.textContent = text;
    setButtonLabel(confirmYes, yes);
    confirmYes.className = `btn btn--${variant} btn--md`;
    barMain.hidden = true;
    confirmBox.hidden = false;
    confirmNo.focus();
  }

  function clearConfirm(restoreFocus) {
    const kind = confirmKind;
    confirmKind = null;
    pendingLink = null;
    confirmBox.hidden = true;
    barMain.hidden = false;
    if (restoreFocus && phase === 'paper') (kind === 'quit' ? quitButton : submitButton).focus();
  }

  function confirmAction() {
    const kind = confirmKind;
    const link = pendingLink;
    clearConfirm(false);
    if (kind === 'submit') {
      submitPaper('manual');
    } else if (kind === 'quit') {
      const target = hooks;
      dispose();
      target?.showBuilder('已放弃这次模拟考试。The mock exam was discarded.');
    } else if (kind === 'leave' && link) {
      if (link.raw.startsWith('#')) window.location.hash = link.raw.slice(1);
      else window.location.assign(link.href);
    }
  }

  // Links elsewhere on the page ask first while the paper is open; modified clicks open new tabs untouched.
  // 作答期间点击页面上的其他链接会先确认；按住修饰键的点击（新标签页打开）不受影响。
  function onDocumentClick(event) {
    if (phase !== 'paper' || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || root.contains(link) || link.target === '_blank' || link.hasAttribute('download')) return;
    const raw = link.getAttribute('href') || '';
    if (raw === '#main' || raw === '#/mock') return;
    event.preventDefault();
    askConfirm('leave', { raw, href: link.href });
  }

  // ---- grading 判分 ----

  function submitPaper(reason) {
    if (phase !== 'paper') return;
    stopTimer();
    clearConfirm(false);
    phase = 'grading';
    submittedAt = endAt !== null && reason === 'timeout' ? Math.min(Date.now(), endAt) : Date.now();
    root.classList.remove('mock-exam--paper');
    root.classList.add('mock-exam--grading');
    for (const card of cards) card.reveal();

    const writtenCards = cards.slice(objectiveCount);
    if (!writtenCards.length) {
      showReport(reason);
      return;
    }
    const objectiveRight = cards.slice(0, objectiveCount).filter((card) => card.getResult()?.correct).length;
    const title = h('h2', { class: 'mock-exam__panel-title', id: 'mock-exam-grading-title', tabindex: '-1' },
      reason === 'timeout' ? '时间到，已自动交卷 Time is up: paper submitted' : '已交卷 Paper submitted');
    const seeResults = () => showReport(reason);
    replaceContent(gradingSlot,
      title,
      objectiveCount
        ? h('p', {}, `客观题已自动判分：答对 ${objectiveRight} / ${objectiveCount}。Objective questions are graded: ${objectiveRight} of ${objectiveCount} right.`)
        : null,
      h('p', {}, `接下来对照参考答案，给 ${writtenCards.length} 道主观题勾选你写到的要点，再点“看成绩”。Next, tick the points you covered in each written answer, then press See results.`),
      h('div', { class: 'mock-exam__panel-actions' },
        button({ label: '去自评 Go to written answers', iconName: 'arrowRight', onClick: () => writtenCards[0].focus() }),
        button({ label: '看成绩 See results', iconName: 'check', variant: 'primary', onClick: seeResults })));
    gradingSlot.hidden = false;
    replaceContent(barMain,
      h('p', { class: 'mock-exam__bar-note' }, '勾完主观题要点后看成绩 Tick the written points, then see results'),
      button({ label: '看成绩 See results', iconName: 'check', variant: 'primary', onClick: seeResults }));
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: 'start' });
  }

  function showReport(reason) {
    if (phase === 'results') return;
    phase = 'results';
    releaseUnload();
    const entries = questions.map((question, position) => ({
      question,
      result: cards[position].getResult() || cards[position].finalize(),
    }));
    // Only attempted questions count as tries; blanks are listed in the report instead.
    // 只有作答过的题记入答题记录；没做的题在成绩单里单独列出。
    if (typeof context.progress?.recordAnswer === 'function') {
      for (const { question, result } of entries) {
        if (result?.answered) context.progress.recordAnswer(question.id, Boolean(result.correct));
      }
    }
    const summary = summarizeResults(entries, { unitOrder: settings.units });
    lastOutcome = { earned: summary.totals.earned, possible: summary.totals.possible, percent: summary.totals.percent };

    root.classList.remove('mock-exam--paper', 'mock-exam--grading');
    root.classList.add('mock-exam--results');
    gradingSlot.hidden = true;
    bar.hidden = true;
    const title = h('h2', { class: 'mock-exam__panel-title', id: 'mock-exam-report-title', tabindex: '-1' }, '成绩单 Results');
    replaceContent(reportSlot, title, reportBody(summary, reason));
    reportSlot.hidden = false;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ block: 'start' });
  }

  function reportBody(summary, reason) {
    const totals = summary.totals;
    const used = Math.max(0, Math.round(((submittedAt ?? Date.now()) - startedAt) / 1000));
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
          button({ label: '看这题 View', iconName: 'eye', size: 'sm', onClick: () => cards[position].focus() }),
          lessonLink(question),
        ],
      };
    });
    const retryIds = [...summary.wrongIds, ...summary.unansweredIds];
    return [
      reason === 'timeout'
        ? h('p', { class: ['callout', 'callout--warn'] }, '时间到了，试卷已自动交卷。Time ran out, so the paper was submitted automatically.')
        : null,
      scoreBoard({
        label: '总分 Score',
        earned: totals.earned,
        possible: totals.possible,
        percent: totals.percent,
        stats: [
          { label: '客观题 Objective', value: totals.objectiveQuestions ? `${totals.objectiveCorrect} / ${totals.objectiveQuestions}` : '—' },
          { label: '主观要点 Written points', value: totals.writtenPossible ? `${totals.writtenEarned} / ${totals.writtenPossible}` : '—' },
          { label: '用时 Time used', value: formatDuration(used) },
          { label: '没做 Unanswered', value: summary.unansweredIds.length },
        ],
      }),
      h('p', { class: 'mock-exam__note' },
        '计分：客观题每题 1 分，主观题每个评分要点 1 分（按你的自评）。作答过的题已记入答题记录和错题本。',
        h('span', { lang: 'en' }, ' Scoring: 1 mark per objective question and 1 per written point you covered. Answered questions are saved to your progress and mistake book.')),
      h('h3', { class: 'mock-exam__report-heading' }, '按单元 By unit'),
      unitBreakdown(summary.byUnit, units),
      summary.wrongIds.length
        ? [h('h3', { class: 'mock-exam__report-heading' }, `答错的题 Wrong answers (${summary.wrongIds.length})`),
          questionList(items(summary.wrongIds, 'wrong'), { label: '答错的题 Wrong answers' })]
        : null,
      summary.unansweredIds.length
        ? [h('h3', { class: 'mock-exam__report-heading' }, `没做的题 Unanswered (${summary.unansweredIds.length})`),
          questionList(items(summary.unansweredIds, 'skipped'), { label: '没做的题 Unanswered questions' })]
        : null,
      h('div', { class: 'mock-exam__panel-actions' },
        retryIds.length
          ? button({
            label: `重练错题 Retry wrong (${retryIds.length})`,
            iconName: 'refresh',
            variant: 'primary',
            onClick: () => context.navigate(sessionPath({ ids: retryIds, mode: 'ordered' })),
          })
          : null,
        button({
          label: '再考一次 New mock exam',
          iconName: 'play',
          onClick: () => {
            const target = hooks;
            dispose();
            target?.showBuilder();
          },
        }),
        linkButton({ label: '错题本 Mistake book', href: '#/mistakes', iconName: 'list', variant: 'ghost' }),
        linkButton({ label: '刷题首页 Practice home', href: '#/practice', iconName: 'home', variant: 'ghost' })),
      h('p', { class: 'mock-exam__note' }, '下面是批改后的整份试卷，每道题都有解析。The marked paper follows; every question shows its explanation.'),
    ];
  }

  const controller = {
    courseId: context.courseId,
    get phase() {
      return phase;
    },
    attach,
    detach,
    dispose,
  };
  return controller;
}
