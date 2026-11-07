import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHART,
  DEFAULT_PRESET,
  DEFAULT_TITLE,
  HALF_NIGHT,
  LEGEND,
  NIGHT_EXAM_SENTENCES,
  NIGHT_MINUTES,
  SHARE_ROWS,
  SLEEP_PRESETS,
  STAGE_INFO,
  STAGE_KEY,
  STAGE_ORDER,
  TEXTBOOK,
  TRACE_BOX,
  TRACE_KINDS,
  TRACE_LABELS,
  TRACE_SECONDS,
  TYPICAL_NIGHT,
  UI_TEXT,
  WAVES,
  announcement,
  arrowList,
  chartDescription,
  chartLayout,
  checkSegments,
  clampMinute,
  cycleAt,
  cycleBands,
  cycleBoundaries,
  cycleText,
  formatClock,
  formatLength,
  hourTicks,
  hypnogramPath,
  minutesBetween,
  nextRemStart,
  nightLength,
  nightSegments,
  nightSummary,
  normalizeSleepCycleConfig,
  remPeriods,
  segmentIndexAt,
  sliderValueText,
  stageAt,
  stageBoxes,
  stageInfo,
  stageTotals,
  stepStretch,
  stretchNotes,
  stretchText,
  summaryBars,
  summaryTexts,
  traceBursts,
  tracePath,
  traceSamples,
} from '../../../engine/widgets/psychology/sleep-cycle/sleep-cycle-logic.js';

const bi = (zh, en) => ({ zh, en });
// The pictographic ranges the content validator rejects (tools/validate_content.py, EMOJI), and every other
// emoji-like code point. 内容校验器拒绝的图形符号范围（tools/validate_content.py 的 EMOJI），以及其他所有类似表情的字符。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const CJK = /[\u3400-\u9fff]/u;
const HTML_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const lengthOf = (segment) => segment.end - segment.start;
const MINUTES = Array.from({ length: NIGHT_MINUTES + 1 }, (_, minute) => minute);

/* ---------- Config 配置 ---------- */

test('normalizeSleepCycleConfig reads the content-spec example as written', () => {
  const config = { title: bi('一夜的睡眠', 'One night of sleep'), preset: 'typical-night' };
  assert.deepEqual(normalizeSleepCycleConfig(config), {
    title: config.title, preset: 'typical-night', usedDefaultTitle: false, usedDefaultPreset: false,
  });
});

test('every config the validator accepts is read without falling back', () => {
  const accepted = [
    {},
    { preset: 'typical-night' },
    { title: bi('睡眠周期', 'Sleep cycle') },
    // Inline markup is allowed in content strings; the title keeps it for the bilingual helpers to render.
    // 内容字符串允许行内标记；标题原样保留，交给双语工具渲染。
    { title: bi('**睡眠**周期', 'The **sleep** cycle'), preset: 'typical-night' },
    // The validator checks "prompt" for every psychology widget; this widget simply ignores it.
    // 校验器对每个心理学组件都检查 "prompt"；这个组件直接忽略它。
    { title: bi('睡眠', 'Sleep'), prompt: bi('看看', 'Look'), preset: 'typical-night' },
    { preset: 'typical-night', somethingElse: 3 },
  ];
  for (const config of accepted) {
    const model = normalizeSleepCycleConfig(config);
    assert.equal(model.preset, 'typical-night');
    assert.equal(model.usedDefaultPreset, false);
    if (config.title) {
      assert.deepEqual(model.title, config.title);
      assert.equal(model.usedDefaultTitle, false);
    } else {
      assert.deepEqual(model.title, DEFAULT_TITLE);
      assert.equal(model.usedDefaultTitle, true);
    }
  }
});

test('anything else falls back to the defaults and never throws', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostile = {};
  Object.defineProperty(hostile, 'title', { get() { throw new Error('no'); }, enumerable: true });
  const odd = [
    undefined, null, 42, 'text', true, [], [{ title: bi('a', 'b') }], revoked.proxy, hostile,
    { title: 'A plain string title' },
    { title: { zh: '只有中文' } },
    { title: { en: 'English only' } },
    { title: { zh: '   ', en: 'Blank Chinese' } },
    { title: { zh: 1, en: 2 } },
    { title: ['睡眠', 'Sleep'] },
    { title: null },
  ];
  for (const config of odd) {
    let model;
    assert.doesNotThrow(() => {
      model = normalizeSleepCycleConfig(config);
    });
    assert.deepEqual(model.title, DEFAULT_TITLE);
    assert.equal(model.usedDefaultTitle, true);
    assert.equal(model.preset, DEFAULT_PRESET);
  }
  for (const preset of ['other-night', 'Typical-Night', '', 7, null, false, ['typical-night']]) {
    const model = normalizeSleepCycleConfig({ preset });
    assert.equal(model.preset, 'typical-night');
    assert.equal(model.usedDefaultPreset, true, `preset ${JSON.stringify(preset)} should be reported`);
  }
  assert.equal(normalizeSleepCycleConfig({}).usedDefaultPreset, false);
});

test('the default title is bilingual, frozen, and handed out as a copy', () => {
  assert.deepEqual(DEFAULT_TITLE, { zh: '一夜的睡眠周期', en: "A night's sleep cycle" });
  assert.ok(Object.isFrozen(DEFAULT_TITLE));
  const model = normalizeSleepCycleConfig(undefined);
  model.title.zh = 'changed';
  assert.equal(normalizeSleepCycleConfig(undefined).title.zh, '一夜的睡眠周期');
});

test('the presets match the validator and every preset name gives the typical night', () => {
  assert.deepEqual(SLEEP_PRESETS, ['typical-night']);
  assert.equal(DEFAULT_PRESET, 'typical-night');
  assert.equal(nightSegments('typical-night'), TYPICAL_NIGHT);
  assert.equal(nightSegments(), TYPICAL_NIGHT);
  assert.equal(nightSegments('unknown'), TYPICAL_NIGHT);
  assert.equal(nightSegments('toString'), TYPICAL_NIGHT);
});

/* ---------- The data 数据 ---------- */

test('the typical night is 480 contiguous minutes of known stages', () => {
  assert.deepEqual(checkSegments(TYPICAL_NIGHT), { ok: true, problems: [] });
  assert.equal(TYPICAL_NIGHT[0].start, 0);
  assert.equal(TYPICAL_NIGHT[TYPICAL_NIGHT.length - 1].end, NIGHT_MINUTES);
  assert.equal(nightLength(), 480);
  assert.equal(HALF_NIGHT, 240);
  TYPICAL_NIGHT.forEach((segment, index) => {
    assert.ok(STAGE_ORDER.includes(segment.stage));
    assert.ok(Number.isInteger(segment.start) && Number.isInteger(segment.end));
    assert.ok(segment.end > segment.start);
    if (index > 0) {
      assert.equal(segment.start, TYPICAL_NIGHT[index - 1].end, `gap or overlap before stretch ${index}`);
      assert.notEqual(segment.stage, TYPICAL_NIGHT[index - 1].stage, `stage repeated at stretch ${index}`);
    }
  });
  assert.ok(Object.isFrozen(TYPICAL_NIGHT) && TYPICAL_NIGHT.every(Object.isFrozen));
  assert.deepEqual(STAGE_ORDER, ['W', 'REM', 'N1', 'N2', 'N3']);
});

test('checkSegments reports gaps, overlaps, unknown stages, empty stretches and repeats', () => {
  const problems = (segments) => checkSegments(segments).problems.length;
  assert.equal(checkSegments([]).ok, false);
  assert.equal(checkSegments('night').ok, false);
  assert.ok(problems([{ stage: 'W', start: 0, end: 5 }, { stage: 'N1', start: 6, end: 9 }]) > 0);
  assert.ok(problems([{ stage: 'W', start: 0, end: 5 }, { stage: 'N1', start: 4, end: 9 }]) > 0);
  assert.ok(problems([{ stage: 'W', start: 1, end: 5 }]) > 0);
  assert.ok(problems([{ stage: 'X', start: 0, end: 5 }]) > 0);
  assert.ok(problems([{ stage: 'W', start: 0, end: 0 }]) > 0);
  assert.ok(problems([{ stage: 'W', start: 0, end: 5 }, { stage: 'W', start: 5, end: 9 }]) > 0);
  assert.ok(problems([null]) > 0);
  assert.equal(checkSegments([{ stage: 'W', start: 0, end: 5 }, { stage: 'N1', start: 5, end: 9 }]).ok, true);
});

test('textbook p.175 and Figure 5.7: about five cycles of about 90 to 100 minutes each', () => {
  const cycles = cycleBoundaries();
  assert.equal(cycles.length, 5);
  const onset = TYPICAL_NIGHT.find((segment) => segment.stage !== 'W');
  assert.equal(cycles[0].start, onset.start, 'the first cycle starts when sleep begins');
  const remEnds = remPeriods().map((period) => period.end);
  cycles.forEach((cycle, index) => {
    assert.equal(cycle.number, index + 1);
    assert.ok(cycle.minutes >= TEXTBOOK.cycleMinutes.min && cycle.minutes <= TEXTBOOK.cycleMinutes.max,
      `cycle ${cycle.number} lasts ${cycle.minutes} min`);
    assert.equal(cycle.end, remEnds[index], 'a cycle ends when its REM period ends');
    if (index > 0) assert.equal(cycle.start, cycles[index - 1].end);
  });
  assert.deepEqual(cycles.map((cycle) => cycle.minutes), [94, 91, 93, 92, 98]);
});

test('textbook p.175: much more N3 in the first half of the night than in the second half', () => {
  const summary = nightSummary();
  assert.equal(summary.n3.first + summary.n3.second, stageTotals().stages.N3.minutes);
  assert.ok(summary.n3.first >= 3 * summary.n3.second, `${summary.n3.first} vs ${summary.n3.second}`);
  assert.deepEqual(summary.n3, { first: 86, second: 6 });
  const perCycle = cycleBoundaries().map((cycle) => cycle.n3Minutes);
  assert.deepEqual(perCycle, [40, 32, 14, 6, 0]);
  perCycle.forEach((minutes, index) => {
    if (index > 0) assert.ok(minutes <= perCycle[index - 1], 'N3 shrinks from cycle to cycle');
  });
});

test('textbook p.175: REM periods grow longer, the first about 10 minutes, the last up to an hour, most REM late', () => {
  const lengths = remPeriods().map((period) => period.minutes);
  assert.deepEqual(lengths, [10, 14, 18, 22, 30]);
  lengths.forEach((length, index) => {
    if (index > 0) assert.ok(length > lengths[index - 1], 'each REM period is longer than the one before');
  });
  assert.equal(lengths[0], TEXTBOOK.firstRemMinutes);
  assert.ok(lengths[lengths.length - 1] <= TEXTBOOK.lastRemMaxMinutes);
  const summary = nightSummary();
  assert.equal(summary.remGrows, true);
  assert.ok(summary.rem.second > summary.rem.first, 'most REM sleep comes toward the end of the night');
  assert.deepEqual(summary.rem, { first: 24, second: 70 });
});

test('textbook p.175: about 60% light sleep (N1 + N2), 20% N3 and 20% REM', () => {
  const totals = stageTotals();
  const near = (actual, expected) => Math.abs(actual - expected) <= 2;
  assert.ok(near(totals.light.percentOfSleep, TEXTBOOK.shares.light), `light ${totals.light.percentOfSleep}`);
  assert.ok(near(totals.stages.N3.percentOfSleep, TEXTBOOK.shares.N3), `N3 ${totals.stages.N3.percentOfSleep}`);
  assert.ok(near(totals.stages.REM.percentOfSleep, TEXTBOOK.shares.REM), `REM ${totals.stages.REM.percentOfSleep}`);
  assert.deepEqual(nightSummary().shares, { light: 60, N3: 20, REM: 20 });
  assert.deepEqual(TEXTBOOK.shares, { light: 60, N3: 20, REM: 20 });
});

test('Figure 5.5: every N1 stretch lasts up to 10 minutes and every N2 stretch up to 20', () => {
  for (const segment of TYPICAL_NIGHT) {
    if (segment.stage === 'N1') assert.ok(lengthOf(segment) <= TEXTBOOK.n1MaxMinutes, `N1 at ${segment.start}`);
    if (segment.stage === 'N2') assert.ok(lengthOf(segment) <= TEXTBOOK.n2MaxMinutes, `N2 at ${segment.start}`);
  }
});

test('textbook p.174: sleepers reach REM from N2 instead of re-entering N1, and N3 is entered and left through N2', () => {
  TYPICAL_NIGHT.forEach((segment, index) => {
    if (segment.stage === 'REM') assert.equal(TYPICAL_NIGHT[index - 1].stage, 'N2', `REM at ${segment.start}`);
    if (segment.stage === 'N3') {
      assert.equal(TYPICAL_NIGHT[index - 1].stage, 'N2', `N3 at ${segment.start} is entered from N2`);
      assert.equal(TYPICAL_NIGHT[index + 1].stage, 'N2', `N3 at ${segment.start} is left through N2`);
    }
  });
});

test('the night starts awake and falls asleep through N1; every awakening comes just after REM (p.174, p.176)', () => {
  assert.equal(TYPICAL_NIGHT[0].stage, 'W');
  assert.equal(TYPICAL_NIGHT[1].stage, 'N1');
  const last = TYPICAL_NIGHT[TYPICAL_NIGHT.length - 1];
  assert.equal(last.stage, 'W');
  TYPICAL_NIGHT.forEach((segment, index) => {
    if (segment.stage !== 'W' || index === 0) return;
    assert.equal(TYPICAL_NIGHT[index - 1].stage, 'REM', `the awakening at ${segment.start} follows a REM period`);
    if (TYPICAL_NIGHT[index + 1]) assert.equal(TYPICAL_NIGHT[index + 1].stage, 'N1', 'falling asleep again goes through N1');
  });
  const awakenings = TYPICAL_NIGHT.filter((segment, index) => segment.stage === 'W' && index > 0 && index < TYPICAL_NIGHT.length - 1);
  assert.equal(awakenings.length, 1, 'one brief awakening');
  assert.ok(lengthOf(awakenings[0]) <= 5, 'the awakening is brief');
});

/* ---------- Reading the night 读取数据 ---------- */

test('clampMinute keeps minutes inside the night', () => {
  assert.equal(clampMinute(135), 135);
  assert.equal(clampMinute(12.5), 12.5);
  assert.equal(clampMinute('135'), 135);
  assert.equal(clampMinute(-4), 0);
  assert.equal(clampMinute(999), 480);
  assert.equal(clampMinute(999, 100), 100);
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, '', ' ', 'abc', {}, []]) assert.equal(clampMinute(bad), 0);
});

test('stageAt holds the start of a stretch but not its end, and the end of the night belongs to the last stretch', () => {
  assert.deepEqual(stageAt(0), { stage: 'W', start: 0, end: 6, minutes: 6, index: 0 });
  assert.equal(stageAt(5.99).stage, 'W');
  assert.equal(stageAt(6).stage, 'N1');
  assert.deepEqual(stageAt(135), { stage: 'N3', start: 125, end: 157, minutes: 32, index: 10 });
  assert.equal(stageAt(90).stage, 'REM');
  assert.equal(stageAt(99.9).stage, 'REM');
  assert.equal(stageAt(100).stage, 'N1');
  assert.deepEqual(stageAt(480), { stage: 'W', start: 474, end: 480, minutes: 6, index: TYPICAL_NIGHT.length - 1 });
  assert.equal(stageAt(-10).index, 0);
  assert.equal(stageAt(10000).index, TYPICAL_NIGHT.length - 1);
  assert.equal(stageAt(NaN).index, 0);
  assert.equal(stageAt(undefined).index, 0);
  assert.equal(stageAt('135').stage, 'N3');
  for (const minute of MINUTES) assert.equal(stageAt(minute).index, segmentIndexAt(minute));
  const copy = stageAt(135);
  copy.stage = 'W';
  assert.equal(stageAt(135).stage, 'N3', 'stageAt hands out copies');
  assert.equal(stageAt(135, 'not a list').stage, 'N3', 'a bad list falls back to the typical night');
});

test('stageAt follows a custom night too', () => {
  const night = [{ stage: 'W', start: 0, end: 10 }, { stage: 'N1', start: 10, end: 20 }, { stage: 'REM', start: 20, end: 30 }];
  assert.equal(nightLength(night), 30);
  assert.equal(stageAt(15, night).stage, 'N1');
  assert.equal(stageAt(30, night).stage, 'REM');
  assert.equal(stageAt(45, night).stage, 'REM');
});

test('minutesBetween counts the overlap of every stretch of a stage', () => {
  assert.equal(minutesBetween('N3', 0, 480), 92);
  assert.equal(minutesBetween('REM', 0, 240), 24);
  assert.equal(minutesBetween('REM', 240, 480), 70);
  // N3 30-54 and 60-76 overlap 40-70 by 14 and 10 minutes. N3 的 30-54 和 60-76 与 40-70 分别重叠 14 和 10 分钟。
  assert.equal(minutesBetween('N3', 40, 70), 24);
  assert.equal(minutesBetween('W', 0, 480), 15);
  assert.equal(minutesBetween('N3', 470, 480), 0);
});

test('stageTotals gives the minutes and shares of every stage', () => {
  const totals = stageTotals();
  assert.equal(totals.night, 480);
  assert.equal(totals.sleep, 465);
  const minutes = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, totals.stages[stage].minutes]));
  assert.deepEqual(minutes, { W: 15, REM: 94, N1: 33, N2: 246, N3: 92 });
  assert.equal(Object.values(minutes).reduce((sum, value) => sum + value, 0), 480);
  const ofNight = STAGE_ORDER.reduce((sum, stage) => sum + totals.stages[stage].percentOfNight, 0);
  assert.ok(Math.abs(ofNight - 100) < 1e-9);
  const ofSleep = STAGE_ORDER.filter((stage) => stage !== 'W').reduce((sum, stage) => sum + totals.stages[stage].percentOfSleep, 0);
  assert.ok(Math.abs(ofSleep - 100) < 1e-9);
  assert.equal(totals.stages.W.percentOfSleep, null);
  assert.equal(totals.light.minutes, minutes.N1 + minutes.N2);
  assert.ok(Math.abs(totals.light.percentOfSleep - (100 * 279) / 465) < 1e-9);
});

test('remPeriods numbers the REM stretches in order and points at them', () => {
  const periods = remPeriods();
  assert.deepEqual(periods.map((period) => period.number), [1, 2, 3, 4, 5]);
  assert.deepEqual(periods.map((period) => period.start), [90, 177, 266, 354, 444]);
  for (const period of periods) {
    assert.equal(TYPICAL_NIGHT[period.index].stage, 'REM');
    assert.equal(TYPICAL_NIGHT[period.index].start, period.start);
    assert.equal(period.minutes, period.end - period.start);
  }
  assert.deepEqual(remPeriods([{ stage: 'W', start: 0, end: 5 }]), []);
  assert.deepEqual(cycleBoundaries([{ stage: 'W', start: 0, end: 5 }]), []);
});

test('cycleAt places a minute in its cycle; before sleep and after the last REM period there is none', () => {
  assert.equal(cycleAt(0), null);
  assert.equal(cycleAt(5), null);
  assert.equal(cycleAt(6), 1);
  assert.equal(cycleAt(99), 1);
  assert.equal(cycleAt(100), 2);
  assert.equal(cycleAt(135), 2);
  assert.equal(cycleAt(377), 5, 'the brief awakening opens cycle 5');
  assert.equal(cycleAt(473), 5);
  assert.equal(cycleAt(474), null);
  assert.equal(cycleAt(480), null);
});

test('nightSummary gathers the numbers of the summary row', () => {
  const summary = nightSummary();
  assert.equal(summary.cycleCount, 5);
  assert.deepEqual(summary.cycleMinutes, { min: 91, max: 98 });
  assert.deepEqual(summary.remLengths, [10, 14, 18, 22, 30]);
  assert.equal(summary.totals.sleep, 465);
});

/* ---------- Moving the cursor 移动光标 ---------- */

test('stepStretch moves to the start of the neighbouring stretch and stops at either end', () => {
  assert.deepEqual(stepStretch(135, 1), { minute: 157, index: 11, moved: true });
  assert.deepEqual(stepStretch(135, -1), { minute: 105, index: 9, moved: true });
  assert.deepEqual(stepStretch(125, -1), { minute: 105, index: 9, moved: true });
  assert.deepEqual(stepStretch(0, -1), { minute: 0, index: 0, moved: false });
  assert.deepEqual(stepStretch(3, -1), { minute: 3, index: 0, moved: false });
  assert.deepEqual(stepStretch(476, 1), { minute: 476, index: TYPICAL_NIGHT.length - 1, moved: false });
  assert.deepEqual(stepStretch(479, -1), { minute: 444, index: TYPICAL_NIGHT.length - 2, moved: true });
  // Walking forward from the start visits every stretch once. 从头一直往后走，每一段正好经过一次。
  let minute = 0;
  const visited = [segmentIndexAt(minute)];
  for (;;) {
    const step = stepStretch(minute, 1);
    if (!step.moved) break;
    minute = step.minute;
    visited.push(step.index);
  }
  assert.deepEqual(visited, TYPICAL_NIGHT.map((_, index) => index));
});

test('nextRemStart jumps to the next REM period and wraps after the last one', () => {
  assert.deepEqual(nextRemStart(0), { minute: 90, number: 1, wrapped: false });
  assert.deepEqual(nextRemStart(89), { minute: 90, number: 1, wrapped: false });
  assert.deepEqual(nextRemStart(95), { minute: 177, number: 2, wrapped: false });
  assert.deepEqual(nextRemStart(300), { minute: 354, number: 4, wrapped: false });
  assert.deepEqual(nextRemStart(450), { minute: 90, number: 1, wrapped: true });
  assert.deepEqual(nextRemStart(478), { minute: 90, number: 1, wrapped: true });
  assert.deepEqual(nextRemStart(3, [{ stage: 'W', start: 0, end: 5 }]), { minute: 3, number: null, wrapped: false });
});

/* ---------- Text 文字 ---------- */

test('formatClock and formatLength write hours and minutes in both languages', () => {
  assert.deepEqual(formatClock(135), { zh: '2 小时 15 分', en: '2 h 15 min' });
  assert.deepEqual(formatClock(0), { zh: '0 小时 0 分', en: '0 h 0 min' });
  assert.deepEqual(formatClock(480), { zh: '8 小时 0 分', en: '8 h 0 min' });
  assert.deepEqual(formatClock(59.6), { zh: '1 小时 0 分', en: '1 h 0 min' });
  assert.deepEqual(formatClock(-3), { zh: '0 小时 0 分', en: '0 h 0 min' });
  assert.deepEqual(formatLength(18), { zh: '18 分钟', en: '18 min' });
  assert.deepEqual(formatLength(NaN), { zh: '0 分钟', en: '0 min' });
  assert.equal(arrowList([10, 14, 18]), '10 → 14 → 18');
  assert.equal(arrowList(null), '');
});

test('the slider text names the time and the stage: "2 h 15 min: stage N3"', () => {
  assert.equal(sliderValueText(135), '2 小时 15 分：N3 期。2 h 15 min: stage N3');
  assert.ok(sliderValueText(95).endsWith('1 h 35 min: REM sleep'));
  assert.ok(sliderValueText(3).endsWith('0 h 3 min: stage W (awake)'));
  assert.ok(sliderValueText(20).endsWith('0 h 20 min: stage N2'));
  assert.ok(sliderValueText(8).endsWith('0 h 8 min: stage N1'));
  assert.ok(sliderValueText(999).endsWith('8 h 0 min: stage W (awake)'));
});

test('announcement, stretchText and cycleText describe the cursor position', () => {
  assert.equal(announcement(135), '2 小时 15 分：N3 期，这一段 32 分钟。2 h 15 min: stage N3, this stretch 32 min.');
  assert.deepEqual(stretchText(135), { zh: '2 小时 5 分 – 2 小时 37 分，共 32 分钟', en: '2 h 5 min – 2 h 37 min, 32 min' });
  assert.deepEqual(cycleText(3), { zh: '还没睡着', en: 'before falling asleep' });
  assert.deepEqual(cycleText(135), { zh: '第 2 个睡眠周期', en: 'sleep cycle 2' });
  assert.deepEqual(cycleText(478), { zh: '最后一个周期之后', en: 'after the last cycle' });
});

test('stretchNotes explain each kind of stretch', () => {
  const english = (minute) => stretchNotes(minute).map((note) => note.en).join(' ');
  assert.match(english(0), /alpha waves/);
  assert.match(english(8), /Falling asleep/);
  assert.match(english(101), /REM period is over/);
  assert.match(english(250), /lighter/);
  assert.match(english(80), /instead of re-entering N1/);
  assert.match(english(135), /First half of the night/);
  assert.match(english(310), /Second half of the night/);
  assert.match(english(95), /REM period 1 of 5: 10 min/);
  assert.match(english(95), /might last only 10 minutes/);
  assert.match(english(270), /4 min longer than the previous REM period/);
  assert.match(english(450), /REM period 5 of 5: 30 min/);
  assert.match(english(450), /as long as an hour/);
  assert.match(english(377), /brief awakening just after a REM period/);
  assert.match(english(478), /last and longest REM period/);
  assert.deepEqual(stretchNotes(20), [], 'an ordinary N2 stretch needs no extra note');
  for (const minute of MINUTES) {
    for (const note of stretchNotes(minute)) {
      assert.ok(note.zh && note.en, `note at minute ${minute} is bilingual`);
    }
  }
});

test('chartDescription states the numbers of the drawn night', () => {
  const description = chartDescription();
  assert.match(description.en, /5 sleep cycles of 91–98 min/);
  assert.match(description.en, /86 min in the first 4 hours, 6 min in the last 4/);
  assert.match(description.en, /10 → 14 → 18 → 22 → 30 min/);
  assert.match(description.en, /simplified illustration/);
  assert.match(description.zh, /简化示意/);
  assert.match(description.zh, /5 个睡眠周期/);
});

test('summaryTexts and summaryBars come from the same numbers', () => {
  const summary = nightSummary();
  const texts = summaryTexts(summary);
  assert.match(texts.cycles.text.en, /5 cycles of 91–98 min/);
  assert.match(texts.n3.text.en, /86 min in the first 4 hours, only 6 min in the last 4/);
  assert.match(texts.rem.text.en, /10 → 14 → 18 → 22 → 30 min/);
  assert.match(texts.rem.text.en, /70 min of REM in the last 4 hours, only 24 min in the first 4/);
  assert.match(texts.shares.text.en, /light sleep \(N1 and N2\) 60%, N3 20%, REM 20%/);
  assert.match(texts.cycles.textbook.en, /90 to 100 minutes/);
  assert.match(texts.shares.textbook.en, /Webb, 2000/);
  const bars = summaryBars(summary);
  assert.deepEqual(bars.cycles.map((bar) => bar.minutes), [94, 91, 93, 92, 98]);
  assert.deepEqual(bars.n3.map((bar) => bar.minutes), [86, 6]);
  assert.deepEqual(bars.n3.map((bar) => bar.label.en), ['first 4 h', 'last 4 h']);
  assert.deepEqual(bars.rem.map((bar) => bar.minutes), [10, 14, 18, 22, 30]);
  assert.deepEqual(bars.shares.night.map((part) => part.percent), [60, 20, 20]);
  assert.deepEqual(bars.shares.textbook.map((part) => part.percent), [60, 20, 20]);
  assert.equal(bars.shares.night.reduce((sum, part) => sum + part.percent, 0), 100);
});

/* ---------- Stage and wave facts 阶段与脑电波 ---------- */

test('every stage has its facts, waves and traces', () => {
  assert.deepEqual(Object.keys(STAGE_INFO).sort(), [...STAGE_ORDER].sort());
  for (const stage of STAGE_ORDER) {
    const info = STAGE_INFO[stage];
    assert.equal(info.id, stage);
    assert.ok(info.facts.length >= 3, `${stage} has facts`);
    for (const wave of info.waves) assert.ok(Object.hasOwn(WAVES, wave), `${stage}: unknown wave ${wave}`);
    for (const trace of info.traces) assert.ok(TRACE_KINDS.includes(trace), `${stage}: unknown trace ${trace}`);
    for (const fact of info.facts) assert.ok(fact.source?.zh && fact.source?.en, `${stage}: a fact without its source`);
    assert.ok(info.exam.en && info.exam.zh);
  }
  assert.equal(stageInfo('N3'), STAGE_INFO.N3);
  assert.equal(stageInfo('nonsense'), STAGE_INFO.W);
  assert.ok(Object.isFrozen(STAGE_INFO.N3.facts));
});

test('the EEG waves of each stage are the ones the textbook names (p.174, Figure 5.5)', () => {
  assert.deepEqual(STAGE_INFO.W.waves, ['beta', 'alpha']);
  assert.deepEqual(STAGE_INFO.N1.waves, ['theta']);
  assert.deepEqual(STAGE_INFO.N2.waves, ['theta', 'spindles']);
  assert.deepEqual(STAGE_INFO.N3.waves, ['delta']);
  assert.deepEqual(STAGE_INFO.REM.waves, ['rem']);
  assert.match(WAVES.beta.text.en, /highest frequency, the lowest amplitude/);
  assert.match(WAVES.alpha.text.en, /relaxed or drowsy/i);
  assert.match(WAVES.theta.text.en, /slower in frequency and greater in amplitude than alpha/i);
  assert.match(WAVES.spindles.text.en, /high-frequency/);
  assert.match(WAVES.delta.text.en, /slowest and highest-amplitude/);
  assert.match(WAVES.rem.text.en, /similar to those of relaxed wakefulness/);
  // REM is taught as beta waves (course brief): the lecture slide and the textbook's own Quiz Yourself key say so.
  // REM 按 beta 波教（课程说明）：讲课幻灯片和教材自己的 Quiz Yourself 答案都这样说。
  assert.match(WAVES.rem.text.en, /lecture slides and the answer to the textbook's Chapter 5 Quiz Yourself both say beta waves/);
  assert.match(WAVES.rem.text.zh, /beta 波/);
  assert.equal(WAVES.rem.source.en, 'Textbook p. 174; p. 203, Quiz Yourself (LO2, question 2); lecture slides, Consciousness, slide 9');
  assert.match(STAGE_INFO.REM.exam.en, /\(beta waves\)/);
  assert.match(STAGE_INFO.REM.exam.zh, /beta 波/);
});

test('the stage facts say what the textbook says happens in each stage', () => {
  const english = (stage) => STAGE_INFO[stage].facts.map((fact) => fact.en).join(' ');
  assert.match(english('W'), /"W" stands for wake/);
  assert.match(english('N1'), /myoclonic jerks/);
  assert.match(english('N1'), /hypnic jerks/);
  assert.match(english('N1'), /feeling of falling/);
  assert.match(english('N1'), /up to 10 minutes/);
  assert.match(english('N2'), /Muscle activity decreases/);
  assert.match(english('N2'), /sleep spindles/);
  assert.match(english('N2'), /up to 20 minutes/);
  assert.match(english('N2'), /not having been asleep at all/);
  assert.match(english('N3'), /deepest sleep/);
  assert.match(english('N3'), /slow-wave sleep/);
  assert.match(english('N3'), /difficult to rouse/);
  assert.match(english('N3'), /confused and disoriented/);
  assert.match(english('N3'), /sleepwalking and sleep talking/);
  assert.match(english('N3'), /Night terrors/);
  assert.match(english('REM'), /instead of re-entering N1/);
  assert.match(english('REM'), /most vivid dreaming/);
  assert.match(english('REM'), /up and down and from left to right/);
  assert.match(english('REM'), /first REM period might last only about 10 minutes/);
  assert.match(english('REM'), /acetylcholine/);
  // The one REM fact that is not in the textbook says that it comes from the lecture slides.
  // 唯一一条教材里没有的 REM 知识点会说明它来自讲课幻灯片。
  const lecture = STAGE_INFO.REM.facts.filter((fact) => /Lecture/.test(fact.source.en));
  assert.equal(lecture.length, 1);
  assert.match(lecture[0].en, /^The lecture slides say the REM EEG resembles the awake state \(\*\*beta waves\*\*\)/);
  // The textbook text names no wave type, but its Chapter 5 Quiz Yourself answers beta (p.203, LO2 question 2).
  // 教材正文没有点名，但第 5 章 Quiz Yourself 的答案是 beta（第 203 页 LO2 第 2 题）。
  assert.match(lecture[0].en, /textbook text names no wave type, but the answer to its Chapter 5 Quiz Yourself is also beta/);
  assert.doesNotMatch(lecture[0].en, /Chapter 5 of the textbook names no wave type/);
  assert.match(lecture[0].en, /does not mention the last two/);
  assert.match(lecture[0].source.en, /p\. 203, Quiz Yourself/);
  assert.match(lecture[0].en, /choose beta/);
  for (const stage of ['W', 'N1', 'N2', 'N3']) {
    assert.ok(STAGE_INFO[stage].facts.every((fact) => /^Textbook/.test(fact.source.en)), `${stage} facts come from the textbook`);
  }
});

/* ---------- Chart geometry 图表几何 ---------- */

test('chartLayout maps minutes to x and back, and stages to rows from W at the top to N3 at the bottom', () => {
  const layout = chartLayout(640);
  assert.equal(layout.width, 640);
  assert.equal(layout.height, CHART.height);
  assert.equal(layout.x(0), layout.plot.left);
  assert.equal(layout.x(480), layout.plot.right);
  assert.equal(layout.x(-30), layout.plot.left);
  assert.equal(layout.x(9999), layout.plot.right);
  for (const minute of [0, 1, 59, 135, 240, 377, 479, 480]) assert.equal(layout.minuteAt(layout.x(minute)), minute);
  assert.equal(layout.minuteAt(-100), 0);
  assert.equal(layout.minuteAt(10000), 480);
  const rows = STAGE_ORDER.map((stage) => layout.rowY(stage));
  rows.forEach((y, index) => {
    assert.ok(y > layout.plot.top && y < layout.plot.bottom);
    if (index > 0) assert.ok(y > rows[index - 1], 'rows go down in the order W, REM, N1, N2, N3');
  });
  assert.equal(chartLayout(100).width, CHART.minWidth, 'narrow widths are drawn at the minimum and scaled down');
  assert.equal(chartLayout(NaN).width, CHART.fallbackWidth);
  assert.equal(chartLayout(0).width, CHART.fallbackWidth);
});

test('hypnogramPath draws one level per stretch and one step per change of stage', () => {
  const layout = chartLayout(640);
  const path = hypnogramPath(layout);
  const commands = path.split(' ');
  assert.ok(path.startsWith(`M${Number(layout.x(0).toFixed(1))} ${Number(layout.rowY('W').toFixed(1))}`));
  assert.equal(commands.filter((command) => command.startsWith('H')).length, TYPICAL_NIGHT.length);
  assert.equal(commands.filter((command) => command.startsWith('V')).length, TYPICAL_NIGHT.length - 1);
  assert.equal(commands[commands.length - 1], `H${Number(layout.x(480).toFixed(1))}`);
});

test('stageBoxes, cycleBands and hourTicks place the shading, the cycle numbers and the hours', () => {
  const layout = chartLayout(640);
  const rem = stageBoxes('REM', layout);
  assert.equal(rem.length, 5);
  rem.forEach((box, index) => {
    assert.ok(Math.abs(box.width - (layout.x(remPeriods()[index].end) - layout.x(remPeriods()[index].start))) < 0.11);
    assert.ok(Math.abs(box.y + box.height / 2 - layout.rowY('REM')) < 0.11);
  });
  assert.equal(stageBoxes('N3', layout).length, 5);
  const bands = cycleBands(layout);
  assert.deepEqual(bands.map((band) => band.number), [1, 2, 3, 4, 5]);
  bands.forEach((band, index) => {
    assert.ok(band.labelX > band.x && band.labelX < band.x + band.width);
    if (index > 0) assert.ok(Math.abs(band.x - (bands[index - 1].x + bands[index - 1].width)) < 0.11, 'bands touch');
  });
  const ticks = hourTicks(layout);
  assert.equal(ticks.length, 9);
  assert.deepEqual(ticks.map((tick) => tick.label), ['0', '1', '2', '3', '4', '5', '6', '7', '8 h']);
  assert.ok(ticks.every((tick) => tick.showLabel));
  assert.ok(hourTicks(chartLayout(CHART.minWidth)).every((tick) => tick.showLabel), 'every hour fits at the minimum width');
  // A squeezed axis shows every other hour and always the last one. 坐标轴太挤时隔一个显示，最后一个总是显示。
  const squeezed = hourTicks({ plot: { left: 0, right: 160 }, x: (minute) => minute / 3 });
  assert.deepEqual(squeezed.filter((tick) => tick.showLabel).map((tick) => tick.hour), [0, 2, 4, 6, 8]);
});

/* ---------- EEG traces 示意脑电波形 ---------- */

const peak = (kind) => Math.max(...traceSamples(kind).map((sample) => Math.abs(sample.y)));
function crossings(samples) {
  const times = [];
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1].y < 0) !== (samples[index].y < 0)) times.push(samples[index].t);
  }
  return times;
}
const rate = (kind) => crossings(traceSamples(kind)).length;

test('traceSamples are deterministic and cover the 2-second window', () => {
  for (const kind of TRACE_KINDS) {
    const samples = traceSamples(kind);
    assert.equal(samples.length, 640);
    assert.equal(samples[0].t, 0);
    assert.equal(samples[samples.length - 1].t, TRACE_SECONDS);
    assert.deepEqual(traceSamples(kind), samples);
    assert.ok(samples.every((sample) => Number.isFinite(sample.y)));
  }
  assert.ok(traceSamples('unknown', 10).every((sample) => sample.y === 0));
  assert.equal(traceSamples('beta', 1).length, 2);
});

test('the drawn waves keep the textbook comparisons of speed and size (simplified illustration)', () => {
  // Beta: highest frequency and lowest amplitude of all. beta：频率最高、波幅最低。
  for (const kind of TRACE_KINDS.filter((name) => name !== 'beta')) {
    assert.ok(rate('beta') > rate(kind), `beta is faster than ${kind}`);
    assert.ok(peak('beta') < peak(kind), `beta is smaller than ${kind}`);
  }
  // Alpha: slower and larger than beta; theta: slower and larger than alpha. alpha 比 beta 慢而大；theta 比 alpha 慢而大。
  assert.ok(rate('alpha') < rate('beta') && peak('alpha') > peak('beta'));
  assert.ok(rate('theta') < rate('alpha') && peak('theta') > peak('alpha'));
  // Delta: the slowest and highest-amplitude waves. delta：最慢、波幅最高。
  for (const kind of TRACE_KINDS.filter((name) => name !== 'delta')) {
    assert.ok(rate('delta') < rate(kind), `delta is slower than ${kind}`);
    assert.ok(peak('delta') > peak(kind), `delta is larger than ${kind}`);
  }
  // REM: fast waves like relaxed wakefulness: faster than theta and delta, about the size of alpha.
  // REM：像放松清醒时的快波：比 theta 和 delta 快，大小与 alpha 差不多。
  assert.ok(rate('rem') > rate('theta') && rate('rem') > rate('delta'));
  assert.ok(Math.abs(peak('rem') - peak('alpha')) / peak('alpha') < 0.3);
  // Every trace fits its drawing box. 每条波形都画得进自己的框。
  for (const kind of TRACE_KINDS) assert.ok(peak(kind) * TRACE_BOX.scale < TRACE_BOX.height / 2, `${kind} fits`);
});

test('alpha waves are more regular (synchronous) than beta waves', () => {
  const spread = (kind) => {
    const times = crossings(traceSamples(kind, 4000));
    const gaps = times.slice(1).map((time, index) => time - times[index]);
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const deviation = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length);
    return deviation / mean;
  };
  assert.ok(spread('alpha') < spread('beta'));
});

test('sleep spindles are short bursts of faster waves inside the N2 trace', () => {
  const bursts = traceBursts('spindles');
  assert.equal(bursts.length, 2);
  for (const burst of bursts) assert.ok(burst.from >= 0 && burst.to <= TRACE_SECONDS && burst.to > burst.from);
  for (const kind of TRACE_KINDS.filter((name) => name !== 'spindles')) assert.deepEqual(traceBursts(kind), []);
  assert.deepEqual(traceBursts('unknown'), []);
  const samples = traceSamples('spindles', 4000);
  const inside = (t) => bursts.some((burst) => t >= burst.from && t <= burst.to);
  const insideTime = bursts.reduce((sum, burst) => sum + (burst.to - burst.from), 0);
  const times = crossings(samples);
  const insideRate = times.filter(inside).length / insideTime;
  const outsideRate = times.filter((t) => !inside(t)).length / (TRACE_SECONDS - insideTime);
  assert.ok(insideRate > 1.5 * outsideRate, `${insideRate.toFixed(1)} vs ${outsideRate.toFixed(1)} crossings per second`);
  assert.ok(peak('spindles') > peak('theta') * 0.9, 'the spindles stand out from the theta background');
});

test('tracePath draws inside its box and converts the spindle windows to the same units', () => {
  for (const kind of TRACE_KINDS) {
    const { d, bursts } = tracePath(kind);
    const points = d.split(/(?=[ML])/).map((part) => part.slice(1).trim().split(' ').map(Number));
    assert.equal(points.length, 640);
    assert.ok(d.startsWith('M0.0 '));
    for (const [x, y] of points) {
      assert.ok(x >= 0 && x <= TRACE_BOX.width);
      assert.ok(y >= 0 && y <= TRACE_BOX.height);
    }
    assert.equal(bursts.length, kind === 'spindles' ? 2 : 0);
    for (const burst of bursts) assert.ok(burst.x >= 0 && burst.x + burst.width <= TRACE_BOX.width + 0.1);
  }
});

/* ---------- Every visible string 每一个可见字符串 ---------- */

// Every { zh, en } pair the widget can show, with where it comes from.
// 组件可能显示的每一对 { zh, en }，以及它的来源。
function visiblePairs() {
  const pairs = [];
  const walk = (value, where) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${where}[${index}]`));
    } else if (value && typeof value === 'object') {
      if (typeof value.zh === 'string' && typeof value.en === 'string') pairs.push({ where, zh: value.zh, en: value.en });
      for (const [key, item] of Object.entries(value)) walk(item, `${where}.${key}`);
    }
  };
  walk(DEFAULT_TITLE, 'DEFAULT_TITLE');
  walk(STAGE_INFO, 'STAGE_INFO');
  walk(WAVES, 'WAVES');
  walk(TRACE_LABELS, 'TRACE_LABELS');
  walk(UI_TEXT, 'UI_TEXT');
  walk(LEGEND, 'LEGEND');
  walk(STAGE_KEY, 'STAGE_KEY');
  walk(NIGHT_EXAM_SENTENCES, 'NIGHT_EXAM_SENTENCES');
  walk(SHARE_ROWS, 'SHARE_ROWS');
  walk(summaryTexts(), 'summaryTexts');
  walk(summaryBars(), 'summaryBars');
  walk(chartDescription(), 'chartDescription');
  for (const minute of MINUTES) {
    walk(formatClock(minute), `formatClock(${minute})`);
    walk(stretchText(minute), `stretchText(${minute})`);
    walk(cycleText(minute), `cycleText(${minute})`);
    walk(stretchNotes(minute), `stretchNotes(${minute})`);
    walk(formatLength(stageAt(minute).minutes), `formatLength(${minute})`);
  }
  return pairs;
}

// Plain strings that go into aria-valuetext, the live region and the SVG labels.
// 放进 aria-valuetext、朗读区域和 SVG 标签的纯文本。
function plainStrings() {
  const layout = chartLayout(640);
  return [
    ...MINUTES.flatMap((minute) => [sliderValueText(minute), announcement(minute)]),
    ...hourTicks(layout).map((tick) => tick.label),
    ...STAGE_KEY.map((item) => item.code),
    ...STAGE_ORDER,
  ];
}

test('no string the widget shows contains an emoji', () => {
  const texts = [...visiblePairs().flatMap((pair) => [pair.zh, pair.en]), ...plainStrings()];
  assert.ok(texts.length > 1000);
  for (const text of texts) {
    assert.ok(!EMOJI.test(text), `emoji in: ${text}`);
    assert.ok(!PICTOGRAPHIC.test(text), `pictographic symbol in: ${text}`);
  }
});

test('every visible text is bilingual: Chinese with Chinese characters, English without them', () => {
  for (const pair of visiblePairs()) {
    assert.ok(pair.zh.trim() && pair.en.trim(), `${pair.where} has both languages`);
    assert.ok(CJK.test(pair.zh), `${pair.where}.zh has Chinese: ${pair.zh}`);
    assert.ok(!CJK.test(pair.en), `${pair.where}.en has no Chinese: ${pair.en}`);
  }
});

test('texts follow the content rules: no HTML, balanced markup, Canadian spelling, plain accessible text', () => {
  for (const pair of visiblePairs()) {
    for (const text of [pair.zh, pair.en]) {
      assert.ok(!HTML_TAG.test(text), `${pair.where}: HTML in ${text}`);
      assert.equal(text.split('**').length % 2, 1, `${pair.where}: unbalanced ** in ${text}`);
      assert.ok(!text.includes('`'), `${pair.where}: code marker in ${text}`);
    }
    assert.ok(!/\b(color|behavior|center|favorite|labeled)\b/i.test(pair.en), `${pair.where}: US spelling in ${pair.en}`);
  }
  for (const text of plainStrings()) {
    assert.ok(!text.includes('**') && !HTML_TAG.test(text), `markup in plain text: ${text}`);
  }
});

test('the simplified-illustration notes are on screen in both languages', () => {
  assert.match(UI_TEXT.illustration.zh, /简化示意/);
  assert.match(UI_TEXT.illustration.en, /Simplified illustration/);
  assert.match(UI_TEXT.traceNote.zh, /简化示意/);
  assert.match(UI_TEXT.traceNote.en, /Simplified illustration/);
  assert.match(UI_TEXT.remPosition.en, /"light sleep" means N1 and N2 only/);
});
