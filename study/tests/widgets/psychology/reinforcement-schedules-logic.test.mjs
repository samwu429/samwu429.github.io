import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_TITLE,
  EXAMPLE_LIMITS,
  HISTORY_LIMIT,
  INTERVAL_LIMITS,
  PATTERN_SETTINGS,
  RATIO_LIMITS,
  RUN_SECONDS,
  SCHEDULE_IDS,
  SCHEDULE_INFO,
  TEXT,
  answerDrill,
  ariaText,
  axisTicks,
  createDrill,
  createRun,
  createSeededRandom,
  createSession,
  createStopwatch,
  cumulativePath,
  drawIntervalWait,
  drawRatioRequirement,
  drillFeedback,
  drillProgress,
  drillScore,
  drillScoreText,
  drillSummary,
  formatNumber,
  formatSeconds,
  historyText,
  isCleanText,
  isFixedSchedule,
  isRatioSchedule,
  joinBi,
  nextDrill,
  nextRandom,
  normalizeReinforcementSchedulesConfig as normalize,
  noticeFor,
  ordinal,
  patternDescription,
  patternGeometry,
  pauseStopwatch,
  randomSeed,
  readExamples,
  readInterval,
  readRatio,
  readSchedule,
  readStopwatch,
  recordDescription,
  recordGeometry,
  recordHeight,
  recordScale,
  recordXMax,
  recordYMax,
  reinforcerDetail,
  reinforcerMarks,
  reinforcerTitle,
  requirementHistory,
  resetAnnouncement,
  respond,
  restartDrill,
  ruleText,
  runStatus,
  scheduleBreakdown,
  scheduleCode,
  selectionAnnouncement,
  sessionPause,
  sessionRespond,
  sessionResume,
  sessionStarted,
  sessionTick,
  sessionTime,
  sliderValueText,
  startStopwatch,
  statusText,
  typicalRecord,
  typicalRecords,
} from '../../../engine/widgets/psychology/reinforcement-schedules/reinforcement-schedules-logic.js';

const bi = (zh, en) => ({ zh, en });
const example = (answer, extra = {}) => ({ text: bi('一个例子', 'An example'), answer, why: bi('因为', 'Because'), ...extra });
// The pictographic ranges the content validator rejects (tools/validate_content.py, EMOJI).
// 内容校验器拒绝的图形符号范围（tools/validate_content.py 中的 EMOJI）。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const HAN = /[一-鿿]/;
// The textbook prints Canadian spelling: behaviour, colour, centre. 教材用加拿大拼写。
const AMERICAN = /\b(behavior|color|center|favor|honor|labor|neighbor)/i;
const gaps = (times) => times.slice(1).map((time, index) => time - times[index]);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/* ---------- Config 配置 ---------- */

test('the limits match the validator and content-spec 5.5', () => {
  assert.deepEqual(RATIO_LIMITS, { min: 2, max: 20, fallback: 5 });
  assert.deepEqual(INTERVAL_LIMITS, { min: 3, max: 30, fallback: 8 });
  assert.deepEqual(EXAMPLE_LIMITS, { min: 1, max: 10 });
  assert.deepEqual(SCHEDULE_IDS, ['FR', 'VR', 'FI', 'VI']);
  assert.deepEqual(DEFAULT_TITLE, { zh: '强化程序', en: 'Schedules of reinforcement' });
  const validator = readFileSync(new URL('../../../tools/validate_content.py', import.meta.url), 'utf8');
  assert.match(validator, /SCHEDULE_NAMES = \("FR", "VR", "FI", "VI"\)/);
  assert.match(validator, /whole_number\(config\["ratio"\], 2, 20\)/);
  assert.match(validator, /3 <= config\["interval"\] <= 30/);
  assert.match(validator, /config\["examples"\], 1, 10, SCHEDULE_NAMES/);
  const spec = readFileSync(new URL('../../../tools/content-spec.md', import.meta.url), 'utf8');
  assert.match(spec, /`ratio` \(whole number 2–20, default 5\)/);
  assert.match(spec, /`interval` \(3–30 seconds, default 8\)/);
});

test('normalize reads the content-spec example as written', () => {
  const config = {
    title: bi('强化程序练习', 'Schedules practice'),
    ratio: 5,
    interval: 8,
    examples: [{ text: bi('老虎机', 'A slot machine'), answer: 'VR', why: bi('次数在变', 'The number changes') }],
  };
  assert.deepEqual(normalize(config), { title: config.title, ratio: 5, interval: 8, examples: config.examples });
});

test('normalize gives the defaults for a missing or unusable config and never throws', () => {
  const defaults = { title: { ...DEFAULT_TITLE }, ratio: 5, interval: 8, examples: [] };
  for (const config of [undefined, null, 0, 42, 'text', true, [], [1, 2], {}, { title: null, examples: null }]) {
    assert.deepEqual(normalize(config), defaults, JSON.stringify(config));
  }
  // The default title is a copy, so a caller cannot change the shared constant.
  // 默认标题是副本，调用方改动它不会影响共享常量。
  normalize({}).title.zh = 'changed';
  assert.equal(DEFAULT_TITLE.zh, '强化程序');
});

test('every ratio, interval and example list the validator accepts is read as written', () => {
  for (let ratio = 2; ratio <= 20; ratio += 1) assert.equal(normalize({ ratio }).ratio, ratio);
  for (const interval of [3, 3.5, 7.25, 8, 12, 29.9, 30]) assert.equal(normalize({ interval }).interval, interval);
  for (let count = 1; count <= 10; count += 1) {
    const examples = Array.from({ length: count }, (_, index) => example(SCHEDULE_IDS[index % 4], { text: bi(`例子 ${index}`, `Example ${index}`) }));
    assert.deepEqual(normalize({ examples }).examples, examples);
  }
  // why may be Chinese only, items may carry other keys, and inline markup is allowed.
  // why 可以只有中文，条目可以带别的键，行内标记也可以用。
  const item = { text: bi('**每三周**考一次', 'An exam every **three weeks**'), answer: 'FI', why: { zh: '时间固定，用 `FI`' }, note: 'ignored' };
  assert.deepEqual(normalize({ examples: [item] }).examples, [{ text: item.text, answer: 'FI', why: { zh: '时间固定，用 `FI`', en: '' } }]);
  assert.deepEqual(normalize({ title: bi(' 练习 ', ' Practice ') }).title, { zh: '练习', en: 'Practice' });
  // Keys the validator does not check do not matter. 校验器不检查的键不影响读取。
  assert.equal(normalize({ ratio: 7, prompt: bi('题目', 'Prompt'), extra: 1 }).ratio, 7);
});

test('normalize rounds and clamps the ratio and clamps the interval', () => {
  const ratios = [[1, 2], [0, 2], [-3, 2], [1.4, 2], [2.4, 2], [5.4, 5], [5.5, 6], [19.6, 20], [21, 20], [1000, 20]];
  for (const [given, read] of ratios) assert.equal(normalize({ ratio: given }).ratio, read, String(given));
  const intervals = [[2.9, 3], [0, 3], [-1, 3], [30.01, 30], [31, 30], [1e9, 30]];
  for (const [given, read] of intervals) assert.equal(normalize({ interval: given }).interval, read, String(given));
  for (const bad of ['5', '12', '', true, false, null, NaN, Infinity, -Infinity, [5], { value: 5 }]) {
    assert.equal(normalize({ ratio: bad }).ratio, 5, String(bad));
    assert.equal(normalize({ interval: bad }).interval, 8, String(bad));
  }
  assert.deepEqual([readRatio(9), readRatio('9'), readInterval(4.5), readInterval(undefined)], [9, 5, 4.5, 8]);
  assert.deepEqual(['FR', 'VR', 'FI', 'VI', 'vr', 'CR', null].map(readSchedule), ['FR', 'VR', 'FI', 'VI', 'FR', 'FR', 'FR']);
});

test('a title the validator would reject gives the default title', () => {
  const rejected = [
    '强化程序', ['强化程序'], { zh: '只有中文' }, { en: 'English only' }, { zh: '标题', en: '' }, { zh: '   ', en: 'Title' },
    { zh: '标题', en: 'Title', note: 'x' }, { zh: '标题<b>粗</b>', en: 'Title' }, { zh: '标题', en: 'Title \u{1F600}' },
    { zh: '标题', en: 'Title ✅' }, { zh: '**标题', en: 'Title' }, { zh: '标题', en: 'a `b' }, { zh: 5, en: 'Title' }, {},
  ];
  for (const title of rejected) assert.deepEqual(normalize({ title }).title, DEFAULT_TITLE, JSON.stringify(title));
});

test('unusable examples are skipped, and a long list is cut to 10', () => {
  const good = example('VI');
  const rejected = [
    null, 'text', [], 5,
    { text: bi('例', 'An example'), answer: 'vr', why: bi('因为', 'Because') },
    { text: bi('例', 'An example'), answer: 'CR', why: bi('因为', 'Because') },
    { text: bi('例', 'An example'), why: bi('因为', 'Because') },
    { text: bi('例', 'An example'), answer: 'VR' },
    { text: { zh: '只有中文' }, answer: 'VR', why: bi('因为', 'Because') },
    { text: 'An example', answer: 'VR', why: bi('因为', 'Because') },
    { text: bi('例', 'An example'), answer: 'VR', why: { en: 'English only' } },
    { text: bi('例', 'An example'), answer: 'VR', why: { zh: '因为', en: '' } },
    { text: bi('例', 'An example ✅'), answer: 'FR', why: bi('因为', 'Because') },
    { text: bi('例', 'An <i>example</i>'), answer: 'FR', why: bi('因为', 'Because') },
  ];
  assert.deepEqual(normalize({ examples: [...rejected, good] }).examples, [good]);
  assert.deepEqual(normalize({ examples: rejected }).examples, []);
  for (const notList of [null, 'VR', { text: bi('例', 'An example') }, 3]) assert.deepEqual(readExamples(notList), []);
  const many = Array.from({ length: 14 }, (_, index) => example(SCHEDULE_IDS[index % 4], { text: bi(`例子 ${index}`, `Example ${index}`) }));
  const read = normalize({ examples: many }).examples;
  assert.equal(read.length, EXAMPLE_LIMITS.max);
  assert.deepEqual(read.map((item) => item.text.en), many.slice(0, 10).map((item) => item.text.en));
  // Skipped items do not use up places. 被跳过的条目不占名额。
  assert.equal(normalize({ examples: [...rejected, ...many] }).examples.length, 10);
});

test('isCleanText follows the validator string rules', () => {
  for (const text of ['text', '**bold** and `code`', '中文', 'a < b', 'one\ntwo']) assert.equal(isCleanText(text), true, text);
  for (const text of ['', '   ', '<b>x</b>', 'x \u{1F600}', 'x ☀', '**open', 'one ` tick', 5, null, undefined]) {
    assert.equal(isCleanText(text), false, String(text));
  }
});

/* ---------- Random numbers 随机数 ---------- */

test('the seeded random source is repeatable, stays in [0, 1) and is built on nextRandom', () => {
  const draw = (seed, count) => Array.from({ length: count }, createSeededRandom(seed));
  const first = draw(42, 500);
  assert.deepEqual(first, draw(42, 500));
  assert.notDeepEqual(draw(43, 5), first.slice(0, 5));
  assert.ok(first.every((value) => value >= 0 && value < 1));
  let state = 42;
  const steps = [];
  for (let index = 0; index < 5; index += 1) {
    const step = nextRandom(state);
    steps.push(step.value);
    state = step.state;
  }
  assert.deepEqual(steps, first.slice(0, 5));
  for (const seed of [NaN, 'x', undefined, -1, 2 ** 40, 1.7]) {
    const { value, state: next } = nextRandom(seed);
    assert.ok(value >= 0 && value < 1 && Number.isInteger(next) && next >= 0);
  }
  assert.equal(randomSeed(() => 0.5), 2147483648);
  for (const roll of [NaN, -2, 0]) assert.equal(randomSeed(() => roll), 0);
  assert.equal(randomSeed(() => 7), 4294967295);
  assert.ok(Number.isInteger(randomSeed()));
});

test('VR requirements are uniform over 1..2n − 1 with mean n', () => {
  for (let n = RATIO_LIMITS.min; n <= RATIO_LIMITS.max; n += 1) {
    const most = 2 * n - 1;
    assert.equal(drawRatioRequirement(n, () => 0), 1);
    assert.equal(drawRatioRequirement(n, () => 0.9999999999), most);
    // One roll in the middle of each of the 2n − 1 equal slices gives every value once: mean exactly n.
    // 在 2n − 1 个等宽区间的正中各取一次，每个值正好出现一次：平均数正好是 n。
    const values = Array.from({ length: most }, (_, slice) => drawRatioRequirement(n, () => (slice + 0.5) / most));
    assert.deepEqual(values, Array.from({ length: most }, (_, index) => index + 1));
    assert.equal(mean(values), n);
    const random = createSeededRandom(n);
    const draws = Array.from({ length: 20000 }, () => drawRatioRequirement(n, random));
    assert.deepEqual([...new Set(draws)].sort((a, b) => a - b), values);
    assert.ok(Math.abs(mean(draws) - n) < 0.05 * n, `mean ${mean(draws)} for n = ${n}`);
  }
  for (const roll of [NaN, -1, 1, 7, undefined]) {
    const value = drawRatioRequirement(5, () => roll);
    assert.ok(value >= 1 && value <= 9, String(roll));
  }
  assert.equal(drawRatioRequirement(5, 'not a function'), 1);
  assert.equal(drawRatioRequirement(99, () => 0.9999999999), 39);
});

test('VI waits are uniform over [0.5t, 1.5t) with mean t', () => {
  for (const t of [3, 8, 12.5, 30]) {
    assert.equal(drawIntervalWait(t, () => 0), 0.5 * t);
    assert.ok(drawIntervalWait(t, () => 0.9999999) < 1.5 * t);
    assert.equal(drawIntervalWait(t, () => 0.5), t);
    const random = createSeededRandom(t * 10);
    const waits = Array.from({ length: 20000 }, () => drawIntervalWait(t, random));
    assert.ok(Math.min(...waits) >= 0.5 * t && Math.max(...waits) < 1.5 * t);
    assert.ok(Math.min(...waits) < 0.51 * t && Math.max(...waits) > 1.49 * t, 'the whole range is used');
    assert.ok(Math.abs(mean(waits) - t) < 0.02 * t, `mean ${mean(waits)} for t = ${t}`);
  }
  assert.equal(drawIntervalWait(99, () => 0.5), 30);
  assert.equal(drawIntervalWait('8', () => 0), 4);
});

/* ---------- Schedule engines 强化程序引擎 ---------- */

test('createRun reads its options like the config', () => {
  const run = createRun();
  assert.deepEqual(
    { schedule: run.schedule, ratio: run.ratio, interval: run.interval, need: run.need, wait: run.wait, since: run.since, lastTime: run.lastTime },
    { schedule: 'FR', ratio: 5, interval: 8, need: 5, wait: null, since: 0, lastTime: 0 },
  );
  assert.deepEqual([run.responses, run.reinforcers], [[], []]);
  const odd = createRun({ schedule: 'XY', ratio: 50, interval: 1 });
  assert.deepEqual([odd.schedule, odd.ratio, odd.interval], ['FR', 20, 3]);
  assert.deepEqual([createRun({ schedule: 'FI', interval: 12 }).wait, createRun({ schedule: 'FI' }).need], [12, null]);
  const vr = createRun({ schedule: 'VR', ratio: 4, seed: 9 });
  assert.ok(vr.need >= 1 && vr.need <= 7 && vr.wait === null);
  const vi = createRun({ schedule: 'VI', interval: 6, seed: 9 });
  assert.ok(vi.wait >= 3 && vi.wait < 9 && vi.need === null);
  assert.deepEqual(createRun({ schedule: 'VR', seed: 9 }), createRun({ schedule: 'VR', seed: 9 }));
});

test('FR-n reinforces exactly every n-th response, whatever the timing', () => {
  for (const n of [2, 5, 13, 20]) {
    let run = createRun({ schedule: 'FR', ratio: n });
    const reinforced = [];
    for (let response = 1; response <= 5 * n; response += 1) {
      const result = respond(run, response % 3 === 0 ? response * 0.1 : response * 2);
      run = result.run;
      if (result.reinforced) reinforced.push(response);
    }
    assert.deepEqual(reinforced, [1, 2, 3, 4, 5].map((k) => k * n));
    assert.ok(run.reinforcers.every((item, index) => item.responses === n && item.need === n && item.wait === null && item.number === index + 1));
    assert.deepEqual(run.reinforcers.map((item) => item.count), [1, 2, 3, 4, 5].map((k) => k * n));
  }
});

test('VR-n reinforces when the hidden requirement is met, and the requirements average n', () => {
  let run = createRun({ schedule: 'VR', ratio: 5, seed: 11 });
  const needs = [];
  let since = 0;
  for (let response = 1; response <= 5000; response += 1) {
    const { need } = run;
    const result = respond(run, response);
    since += 1;
    assert.equal(result.reinforced, since === need, `response ${response}`);
    if (result.reinforced) {
      needs.push(need);
      assert.equal(result.reinforcer.responses, need);
      since = 0;
    }
    run = result.run;
  }
  assert.ok(needs.every((need) => need >= 1 && need <= 9));
  assert.deepEqual([...new Set(needs)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(Math.abs(mean(needs) - 5) < 0.25, `mean ${mean(needs)}`);
  assert.deepEqual(requirementHistory(run).values, needs);
  assert.ok(Math.abs(requirementHistory(run).mean - mean(needs)) < 1e-9);
  const replay = (seed) => {
    let replayed = createRun({ schedule: 'VR', ratio: 5, seed });
    for (let response = 1; response <= 60; response += 1) replayed = respond(replayed, response).run;
    return replayed.reinforcers.map((item) => item.count);
  };
  assert.deepEqual(replay(11), replay(11));
  assert.notDeepEqual(replay(11), replay(12));
});

test('FI-t reinforces the first response at least t seconds after the last reinforcer', () => {
  let run = createRun({ schedule: 'FI', interval: 8 });
  const reinforced = [];
  for (const time of [0, 1, 7.9, 8, 8.5, 12, 15.9, 16.1, 16.2, 30]) {
    const result = respond(run, time);
    run = result.run;
    if (result.reinforced) reinforced.push(time);
  }
  // The start counts as the last reinforcer. 开始的时刻算作“上一个强化物”。
  assert.deepEqual(reinforced, [8, 16.1, 30]);
  assert.deepEqual(run.reinforcers.map((item) => item.responses), [4, 4, 2]);
  run.reinforcers.forEach((item, index) => {
    assert.ok(Math.abs(item.elapsed - [8, 8.1, 13.9][index]) < 1e-9);
    assert.deepEqual([item.wait, item.need], [8, null]);
  });
  // Binary noise is absorbed, a real shortfall is not. 吸收二进制误差，真正不足的时间不算。
  const fresh = createRun({ schedule: 'FI', interval: 8 });
  assert.equal(respond(fresh, 8 - 1e-12).reinforced, true);
  assert.equal(respond(fresh, 8 - 1e-6).reinforced, false);
});

test('VI-t reinforces the first response after a hidden wait drawn from 0.5t..1.5t', () => {
  let run = createRun({ schedule: 'VI', interval: 10, seed: 5 });
  const waits = [];
  for (let step = 1; step <= 6000; step += 1) {
    const time = step * 0.25;
    const { wait, lastTime } = run;
    const result = respond(run, time);
    assert.equal(result.reinforced, time - lastTime >= wait - 1e-9, `time ${time}`);
    if (result.reinforced) {
      waits.push(wait);
      assert.ok(result.reinforcer.elapsed >= wait - 1e-9 && result.reinforcer.elapsed < wait + 0.25 + 1e-9);
    }
    run = result.run;
  }
  assert.ok(waits.length > 100);
  assert.ok(waits.every((wait) => wait >= 5 && wait < 15));
  assert.ok(Math.abs(mean(waits) - 10) < 0.6, `mean ${mean(waits)}`);
  assert.deepEqual(requirementHistory(run).values, waits);
});

test('respond never moves time backwards', () => {
  const run = respond(createRun({ schedule: 'FI', interval: 3 }), 5).run;
  assert.equal(run.reinforcers.length, 1);
  assert.equal(respond(run, 2).run.responses.at(-1), 5);
  assert.equal(respond(run, NaN).run.responses.at(-1), 5);
  assert.equal(respond(run, '9').run.responses.at(-1), 5);
  assert.equal(respond(createRun(), -4).run.responses[0], 0);
  // The run passed in is never changed. 传入的记录不会被修改。
  assert.equal(run.responses.length, 1);
});

test('runStatus counts since the last reinforcer and keeps the VR and VI requirements out', () => {
  let fr = createRun({ schedule: 'FR', ratio: 4 });
  for (const time of [0, 1, 2, 3, 4, 5]) fr = respond(fr, time).run;
  const status = runStatus(fr, 6.5);
  assert.deepEqual(
    [status.started, status.responses, status.reinforcers, status.since, status.remaining, status.sinceTime, status.time],
    [true, 6, 1, 2, 2, 3.5, 6.5],
  );
  assert.equal(status.last.time, 3);
  let fi = respond(createRun({ schedule: 'FI', interval: 5 }), 0).run;
  assert.deepEqual([runStatus(fi, 4.9).available, runStatus(fi, 5).available, runStatus(fi, 1).sinceTime], [false, true, 1]);
  fi = respond(fi, 3).run;
  assert.equal(runStatus(fi, -3).time, 3);
  for (const schedule of ['VR', 'VI']) {
    const hidden = runStatus(createRun({ schedule, seed: 4 }), 0);
    assert.deepEqual([hidden.started, hidden.remaining, hidden.available, hidden.last], [false, null, null, null]);
    assert.ok(!('need' in hidden) && !('wait' in hidden));
  }
});

test('the four schedules are sorted by the two questions', () => {
  assert.deepEqual(
    SCHEDULE_IDS.map((id) => [SCHEDULE_INFO[id].id, SCHEDULE_INFO[id].basis, SCHEDULE_INFO[id].regularity]),
    [['FR', 'ratio', 'fixed'], ['VR', 'ratio', 'variable'], ['FI', 'interval', 'fixed'], ['VI', 'interval', 'variable']],
  );
  assert.deepEqual(SCHEDULE_IDS.map(isRatioSchedule), [true, true, false, false]);
  assert.deepEqual(SCHEDULE_IDS.map(isFixedSchedule), [true, false, true, false]);
  // Figure 6.10 points the cards state. 卡片上写的图 6.10 要点。
  assert.equal(SCHEDULE_INFO.VR.figure.rate.en, 'Highest and most steady rate of response');
  assert.equal(SCHEDULE_INFO.VR.figure.resistance.en, 'Most resistant to extinction');
  assert.equal(SCHEDULE_INFO.VI.figure.resistance.en, 'More resistant than fixed interval');
  assert.equal(SCHEDULE_INFO.FR.figure.rate.en, 'High rate of response');
});

/* ---------- Clock and session 时钟与一轮练习 ---------- */

test('the stopwatch counts only the time it runs', () => {
  let watch = createStopwatch();
  assert.equal(readStopwatch(watch, 5000), 0);
  watch = startStopwatch(watch, 1000);
  assert.equal(readStopwatch(watch, 3500), 2.5);
  assert.equal(startStopwatch(watch, 9999), watch);
  watch = pauseStopwatch(watch, 4000);
  assert.equal(readStopwatch(watch, 60000), 3);
  assert.equal(pauseStopwatch(watch, 70000), watch);
  watch = startStopwatch(watch, 100000);
  assert.equal(readStopwatch(watch, 101000), 4);
  // A clock reading from before the start adds nothing. 早于开始时刻的读数不会增加时间。
  assert.equal(readStopwatch(watch, 99000), 3);
  assert.equal(readStopwatch(watch, NaN), 3);
});

test('a session starts its clock with the first response, pauses while hidden and ends after RUN_SECONDS', () => {
  assert.equal(RUN_SECONDS, 180);
  let session = createSession({ schedule: 'FI', interval: 4 });
  assert.equal(sessionStarted(session), false);
  assert.equal(sessionResume(session, 0), session);
  let result = sessionRespond(session, 10000);
  session = result.session;
  assert.deepEqual([result.accepted, result.reinforced, session.run.responses], [true, false, [0]]);
  assert.equal(sessionTime(session, 13000), 3);
  session = sessionPause(session, 13000);
  assert.equal(sessionPause(session, 14000), session);
  assert.equal(sessionTime(session, 50000), 3);
  session = sessionResume(session, 50000);
  assert.equal(sessionResume(session, 50500), session);
  result = sessionRespond(session, 51500);
  assert.deepEqual([result.reinforced, result.reinforcer.time], [true, 4.5]);
  session = result.session;
  assert.equal(sessionTick(session, 52500), session);
  const end = 50000 + (RUN_SECONDS - 3) * 1000;
  session = sessionTick(session, end);
  assert.equal(session.ended, true);
  assert.equal(sessionTime(session, end + 99999), RUN_SECONDS);
  const late = sessionRespond(session, end + 10);
  assert.deepEqual([late.accepted, late.session], [false, session]);
  assert.equal(sessionResume(session, end + 20), session);
  assert.equal(sessionTick(session, end + 30), session);
  // A response that arrives after the limit ends the run instead of counting. 超时后到来的反应结束这一轮，不再计数。
  const started = sessionRespond(createSession({ schedule: 'FR' }), 0).session;
  const over = sessionRespond(started, RUN_SECONDS * 1000 + 1);
  assert.deepEqual([over.accepted, over.session.ended, over.session.run.responses.length], [false, true, 1]);
});

/* ---------- Cumulative record 累积记录 ---------- */

test('the record axes grow in round steps', () => {
  assert.deepEqual([0, 30, 55, 55.1, 85, 120, 179, 500, NaN].map(recordXMax), [60, 60, 60, 90, 90, 150, 180, 180, 60]);
  assert.deepEqual([0, 10, 17, 18, 30, 100, 600, -5].map(recordYMax), [20, 20, 20, 25, 40, 125, 800, 20]);
  assert.deepEqual(axisTicks(60, 'x').values, [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(axisTicks(90, 'x').values, [0, 15, 30, 45, 60, 75, 90]);
  assert.deepEqual(axisTicks(150, 'x').values, [0, 30, 60, 90, 120, 150]);
  assert.deepEqual(axisTicks(180, 'x').values, [0, 30, 60, 90, 120, 150, 180]);
  assert.deepEqual(axisTicks(25, 'y').values, [0, 5, 10, 15, 20, 25]);
  assert.deepEqual(axisTicks(125, 'y').values, [0, 25, 50, 75, 100, 125]);
  assert.deepEqual(axisTicks(800, 'y').values, [0, 200, 400, 600, 800]);
  assert.deepEqual([300, 480, 700, 2000, undefined].map(recordHeight), [170, 216, 260, 260, 216]);
});

test('recordGeometry draws a step line, one slash per reinforcer and the pen at the current time', () => {
  let run = createRun({ schedule: 'FR', ratio: 2 });
  for (const time of [1, 2, 6]) run = respond(run, time).run;
  // A 300 x 200 plot inside the padding: 5 px per second (60 s) and 10 px per response (20). 留白内 300 x 200 的绘图区。
  const geometry = recordGeometry(run, 9, { width: 354, height: 238 });
  assert.deepEqual(geometry.plot, { left: '40', right: '340', top: '12', bottom: '212' });
  assert.equal(geometry.path, 'M40 212H45V202H50V192H70V182H85');
  assert.deepEqual(geometry.marks, [{ x1: '50', y1: '192', x2: '56', y2: '200' }]);
  assert.deepEqual(geometry.pen, { x: '85', y: '182' });
  assert.deepEqual(geometry.xTicks.map((tick) => tick.label), ['0', '10', '20', '30', '40', '50', '60']);
  assert.deepEqual(geometry.yTicks.map((tick) => [tick.label, tick.y]), [['0', '212'], ['5', '162'], ['10', '112'], ['15', '62'], ['20', '12']]);
  // Before the first response the line is a point at the origin. 第一次反应之前，线只是原点上的一个点。
  assert.equal(recordGeometry(createRun(), 0, { width: 354, height: 238 }).path, 'M40 212H40');
});

test('cumulativePath and reinforcerMarks follow the scale and stay inside it', () => {
  const scale = recordScale({ width: 120, height: 120, xMax: 10, yMax: 10, padding: { left: 10, right: 10, top: 10, bottom: 10 } });
  assert.deepEqual([scale.x(5), scale.y(5), scale.x(-3), scale.x(99), scale.y(99), scale.x(NaN)], [60, 60, 10, 110, 10, 10]);
  assert.equal(cumulativePath([2, 4], 3, scale), 'M10 110H30V100H50V90H50');
  assert.equal(cumulativePath([], 10, scale), 'M10 110H110');
  assert.deepEqual(reinforcerMarks([{ time: 4, count: 2 }], scale, 8), [{ x1: '50', y1: '90', x2: '56', y2: '98' }]);
});

/* ---------- Typical patterns 典型模式 ---------- */

test('the simplified patterns keep the textbook shapes and order of rates', () => {
  const { records, yMax, duration } = typicalRecords();
  assert.equal(duration, PATTERN_SETTINGS.duration);
  const counts = Object.fromEntries(SCHEDULE_IDS.map((id) => [id, records[id].responses.length]));
  // Figure 6.10 and p.227: VR highest, FR high, VI slow and steady. 图 6.10 与第 227 页：VR 最高，FR 高，VI 慢而稳。
  assert.ok(counts.VR > counts.FR && counts.FR > counts.FI && counts.FI > counts.VI, JSON.stringify(counts));
  assert.ok(yMax >= counts.VR && yMax <= counts.VR * 1.1);
  for (const id of SCHEDULE_IDS) assert.ok(records[id].responses.every((time) => time > 0 && time <= duration));

  // FR: every reinforcer after exactly n responses, then a pause much longer than the gaps inside a run.
  // FR：每个强化物正好在 n 次反应之后，之后的停顿比一段快速反应内部的间隔长得多。
  const fr = records.FR;
  const frGaps = gaps(fr.responses);
  assert.ok(fr.reinforcers.length >= 4);
  fr.reinforcers.forEach((item, index) => {
    assert.equal(item.count, (index + 1) * PATTERN_SETTINGS.ratio);
    if (item.count < fr.responses.length) assert.ok(frGaps[item.count - 1] > 4 * frGaps[0]);
  });

  // VR and VI: one steady gap, VR faster, reinforcers at uneven times. VR 与 VI：间隔稳定，VR 更快，强化物的时间不均匀。
  for (const id of ['VR', 'VI']) {
    const steady = gaps(records[id].responses);
    assert.ok(Math.max(...steady) - Math.min(...steady) < 1e-9, `${id} is steady`);
    const between = gaps([0, ...records[id].reinforcers.map((item) => item.time)]);
    assert.ok(Math.max(...between) > 2 * Math.min(...between), `${id} reinforcers come at uneven times`);
  }
  assert.ok(gaps(records.VR.responses)[0] < gaps(records.VI.responses)[0]);

  // FI: each reinforcer at least t after the last one; inside each interval the gaps shrink (a scallop), so the
  // pause right after a reinforcer is the longest. FI：每个强化物离上一个至少 t 秒；每个间隔内的间隔越来越短（扇贝形）。
  const fi = records.FI;
  assert.ok(fi.reinforcers.length >= 3);
  const starts = [0, ...fi.reinforcers.map((item) => item.time)];
  starts.forEach((start, index) => {
    if (index > 0) assert.ok(start - starts[index - 1] >= PATTERN_SETTINGS.interval);
    const end = index + 1 < starts.length ? starts[index + 1] : Infinity;
    const inside = gaps([start, ...fi.responses.filter((time) => time > start && time <= end)]);
    for (let k = 1; k < inside.length; k += 1) assert.ok(inside[k] < inside[k - 1], `interval ${index} gap ${k}`);
  });

  assert.deepEqual(typicalRecords(), typicalRecords());
  assert.deepEqual(typicalRecord('XX'), typicalRecord('FR'));
  assert.equal(typicalRecord('FR', { duration: 10 }).responses.length, 15);
});

test('patternGeometry fits each record into the fixed viewBox', () => {
  const { records, yMax } = typicalRecords();
  for (const id of SCHEDULE_IDS) {
    const geometry = patternGeometry(records[id], yMax);
    assert.equal(geometry.viewBox, '0 0 240 150');
    assert.deepEqual(geometry.plot, { left: '8', right: '232', top: '8', bottom: '142' });
    assert.equal(geometry.marks.length, records[id].reinforcers.length);
    assert.ok(geometry.path.startsWith('M8 142') && geometry.path.endsWith('H232'));
    assert.ok(geometry.path.match(/\d+(\.\d+)?/g).map(Number).every((value) => value >= 8 && value <= 232));
  }
});

/* ---------- Examples drill 例子练习 ---------- */

test('the drill keeps the first answer of each example, moves on and starts again', () => {
  let drill = createDrill([example('VR'), example('FI'), example('FR')]);
  assert.deepEqual(drillScore(drill), { correct: 0, answered: 0, total: 3 });
  assert.equal(nextDrill(drill), drill);
  assert.equal(answerDrill(drill, 'XX'), drill);
  drill = answerDrill(drill, 'FR');
  assert.equal(answerDrill(drill, 'VR'), drill);
  assert.deepEqual(drillScore(drill), { correct: 0, answered: 1, total: 3 });
  drill = nextDrill(drill);
  drill = answerDrill(drill, 'FI');
  drill = nextDrill(answerDrill(nextDrill(drill), 'FR'));
  assert.equal(drill.finished, true);
  assert.deepEqual(drillScore(drill), { correct: 2, answered: 3, total: 3 });
  assert.deepEqual(drill.results.map((result) => [result.index, result.picked, result.correct]), [[0, 'FR', false], [1, 'FI', true], [2, 'FR', true]]);
  assert.equal(answerDrill(drill, 'VR'), drill);
  assert.equal(nextDrill(drill), drill);
  drill = restartDrill(drill);
  assert.deepEqual([drill.index, drill.picked, drill.results.length, drill.finished], [0, null, 0, false]);
  assert.equal(createDrill([]).finished, true);
  assert.equal(createDrill(null).finished, true);
});

test('drill texts: feedback with the two questions, progress, score and summary', () => {
  assert.deepEqual(drillFeedback('VI', 'VI'), { correct: true, title: TEXT.drill.correct, breakdown: scheduleBreakdown('VI') });
  const wrong = drillFeedback('VI', 'FI');
  assert.equal(wrong.correct, false);
  assert.deepEqual(wrong.title, {
    zh: '不对。你选了 FI，答案是 VI（可变间隔）。',
    en: 'Not quite. You chose FI; the answer is VI (variable interval).',
  });
  assert.equal(wrong.breakdown.en, 'It counts time, so it is an interval schedule; it changes and cannot be predicted, so it is variable. So it is VI (variable interval).');
  assert.equal(scheduleBreakdown('FR').en, 'It counts responses, so it is a ratio schedule; it is always the same and predictable, so it is fixed. So it is FR (fixed ratio).');
  assert.equal(scheduleBreakdown('VR').zh, '数的是反应次数，所以是比率（ratio）程序；每次在变、没法预测，所以是可变（variable）的。所以是 VR（可变比率）。');
  assert.equal(drillFeedback('FR', 'nonsense').title.en, 'Not quite. You chose ?; the answer is FR (fixed ratio).');
  let drill = createDrill([example('VR'), example('FI')]);
  assert.deepEqual(drillProgress(drill), { zh: '第 1 题，共 2 题', en: 'Example 1 of 2' });
  drill = nextDrill(answerDrill(drill, 'VR'));
  assert.deepEqual(drillProgress(drill), { zh: '第 2 题，共 2 题', en: 'Example 2 of 2' });
  assert.deepEqual(drillScoreText(drill), { zh: '得分：1 / 1', en: 'Score: 1 / 1' });
  drill = nextDrill(answerDrill(drill, 'VI'));
  assert.deepEqual(drillSummary(drill), { zh: '你答对了 1 / 2 题。', en: 'You got 1 of 2 right.' });
});

/* ---------- Texts 文字 ---------- */

test('number words and schedule codes', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 11, 12, 13, 20, 21, 22, 23, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '5th', '11th', '12th', '13th', '20th', '21st', '22nd', '23rd', '101st', '111th']);
  assert.deepEqual([8, 7.5, 8.25, 8.123, 3, 0.5].map((value) => formatNumber(value)), ['8', '7.5', '8.25', '8.12', '3', '0.5']);
  assert.equal(formatNumber(6.66, 1), '6.7');
  assert.equal(formatNumber(NaN), '?');
  assert.deepEqual([0, 12.34, 12.36, 180, -3, NaN].map(formatSeconds), ['0.0', '12.3', '12.4', '180.0', '0.0', '0.0']);
  assert.deepEqual(
    [scheduleCode('FR', 5, 8), scheduleCode('VR', 12, 8), scheduleCode('FI', 5, 7.5), scheduleCode('VI', 5, 8, 'zh'), scheduleCode('XX', 99, 99)],
    ['FR-5', 'VR-12', 'FI-7.5 s', 'VI-8 秒', 'FR-20'],
  );
});

test('the rule of each schedule is stated with its numbers', () => {
  assert.deepEqual(ruleText('FR', 5, 8), {
    zh: 'FR-5（固定比率）：每做满 5 次反应，就得到一个强化物。次数永远一样，所以可以预测。',
    en: 'FR-5 (fixed ratio): every 5th response is reinforced. The number never changes, so you can predict the reinforcer.',
  });
  assert.ok(ruleText('FR', 2, 8).en.startsWith('FR-2 (fixed ratio): every 2nd response is reinforced.'));
  assert.match(ruleText('VR', 5, 8).en, /^VR-5 \(variable ratio\): .*5 on average.*drawn at random from 1 to 9 each time\.$/);
  assert.match(ruleText('VR', 20, 8).zh, /平均 20 次.*从 1 到 39 里随机抽/);
  assert.match(ruleText('FI', 5, 7.5).en, /^FI-7\.5 s \(fixed interval\): the first response after 7\.5 seconds since the last reinforcer is reinforced; responses before that earn nothing\./);
  assert.match(ruleText('VI', 5, 8).en, /^VI-8 s \(variable interval\): the wait changes every time, 8 seconds on average.*between 4 and 12 seconds each time\./);
  assert.match(ruleText('VI', 5, 8).zh, /平均 8 秒.*在 4 到 12 秒之间随机抽/);
  assert.deepEqual(ruleText('XX', 0, 0), ruleText('FR', 2, 3));
});

test('the status line shows the fixed targets and keeps the variable ones hidden', () => {
  let fr = createRun({ schedule: 'FR', ratio: 5 });
  assert.equal(statusText(fr, 0).en, '0 of 5 responses done; 5 more to the next reinforcer.');
  fr = respond(respond(fr, 0).run, 1).run;
  assert.deepEqual(statusText(fr, 2), { zh: '这一轮已做 2 / 5 次反应，还差 3 次。', en: '2 of 5 responses done; 3 more to the next reinforcer.' });
  let vr = createRun({ schedule: 'VR', ratio: 5, seed: 1 });
  assert.deepEqual(statusText(vr, 0), {
    zh: '开始以来做了 0 次反应。这次需要几次？保密（平均 5 次）。',
    en: '0 responses since the start. The number needed this time is hidden (5 on average).',
  });
  // Respond until one unreinforced response follows a reinforcer. 一直反应，直到某个强化物之后有一次没被强化的反应。
  while (!(vr.reinforcers.length && vr.since === 1)) vr = respond(vr, vr.responses.length).run;
  assert.equal(statusText(vr, 100).en, '1 response since the last reinforcer. The number needed this time is hidden (5 on average).');
  let fi = respond(createRun({ schedule: 'FI', interval: 8 }), 0).run;
  assert.equal(statusText(fi, 3.04).en, '3.0 s since the start; only the first response after 8 s is reinforced.');
  assert.deepEqual(statusText(fi, 8), {
    zh: '离开始已经满 8 秒：你的下一次反应就会得到强化物。',
    en: '8 seconds have passed since the start: your next response will be reinforced.',
  });
  fi = respond(fi, 9).run;
  assert.deepEqual(statusText(fi, 10), {
    zh: '离上一个强化物过了 1.0 秒；满 8 秒以后的第一次反应才有强化物。',
    en: '1.0 s since the last reinforcer; only the first response after 8 s is reinforced.',
  });
  const vi = respond(createRun({ schedule: 'VI', interval: 8, seed: 2 }), 0).run;
  assert.equal(statusText(vi, 2.5).en, '2.5 s since the start. The length of this wait is hidden (8 s on average).');
});

test('the notice follows the session: ready, waiting, reinforcer, over', () => {
  let session = createSession({ schedule: 'FR', ratio: 2 });
  assert.deepEqual(noticeFor(session), { tone: 'ready', title: TEXT.tryIt.ready, detail: null });
  session = sessionRespond(session, 0).session;
  assert.deepEqual(noticeFor(session), { tone: 'waiting', title: TEXT.tryIt.waiting, detail: null });
  session = sessionRespond(session, 500).session;
  assert.deepEqual(noticeFor(session), {
    tone: 'reinforcer',
    title: { zh: '强化物！第 1 个。', en: 'Reinforcer! Number 1.' },
    detail: { zh: '正好做满 2 次反应：次数固定，可以预测。', en: 'It came after exactly 2 responses: the number is fixed and predictable.' },
  });
  session = sessionTick(session, RUN_SECONDS * 1000);
  assert.deepEqual(noticeFor(session), { tone: 'over', title: TEXT.tryIt.over, detail: null });
  assert.equal(TEXT.tryIt.over.en, '3 minutes are up, so this run is over. Look at your cumulative record, or press Reset.');
  assert.deepEqual(reinforcerTitle({ number: 12 }), { zh: '强化物！第 12 个。', en: 'Reinforcer! Number 12.' });
  assert.deepEqual(reinforcerTitle(null), { zh: '强化物！第 1 个。', en: 'Reinforcer! Number 1.' });
});

test('each reinforcer explains how it was earned and reveals the hidden requirement afterwards', () => {
  let vr = createRun({ schedule: 'VR', ratio: 5, seed: 8 });
  while (!vr.reinforcers.length) vr = respond(vr, vr.responses.length).run;
  const [first] = vr.reinforcers;
  assert.equal(reinforcerDetail(vr, first).en,
    `This one took ${first.need} ${first.need === 1 ? 'response' : 'responses'} (5 on average): the number changes, so you cannot predict it.`);
  assert.equal(reinforcerDetail(vr, first).zh, `这一个用了 ${first.need} 次反应（平均 5 次）：次数在变，没法预测。`);
  let fi = createRun({ schedule: 'FI', interval: 8 });
  for (const time of [0, 8.5, 20]) fi = respond(fi, time).run;
  assert.deepEqual(fi.reinforcers.map((item) => reinforcerDetail(fi, item).en), [
    'The first response after 8 s earned it (8.5 s after the start).',
    'The first response after 8 s earned it (11.5 s after the last reinforcer).',
  ]);
  assert.equal(reinforcerDetail(fi, fi.reinforcers[1]).zh, '满 8 秒以后的第一次反应得到了它（离上一个强化物 11.5 秒）。');
  let vi = createRun({ schedule: 'VI', interval: 8, seed: 3 });
  for (let time = 0; !vi.reinforcers.length; time += 0.5) vi = respond(vi, time).run;
  const viFirst = vi.reinforcers[0];
  assert.equal(reinforcerDetail(vi, viFirst).en,
    `This wait was ${formatSeconds(viFirst.wait)} s (8 s on average); your response ${formatSeconds(viFirst.elapsed)} s after the start earned it.`);
});

test('the history lists each requirement so that "on average" can be seen', () => {
  for (const schedule of SCHEDULE_IDS) assert.equal(historyText(createRun({ schedule })), null);
  let fr = createRun({ schedule: 'FR', ratio: 3 });
  for (let time = 0; time < 3; time += 1) fr = respond(fr, time).run;
  assert.deepEqual(historyText(fr), { zh: '每个强化物都正好用了 3 次反应：固定，可以预测。', en: 'Every reinforcer took exactly 3 responses: fixed and predictable.' });
  const fi = respond(createRun({ schedule: 'FI', interval: 7.5 }), 9).run;
  assert.equal(historyText(fi).en, 'Every wait is 7.5 s: fixed and predictable.');
  let vr = createRun({ schedule: 'VR', ratio: 5, seed: 21 });
  while (vr.reinforcers.length < 3) vr = respond(vr, vr.responses.length).run;
  const needs = vr.reinforcers.map((item) => item.need);
  assert.equal(historyText(vr).en, `Responses each reinforcer took: ${needs.join(', ')}; average ${formatNumber(mean(needs), 1)} (the rule's average is 5).`);
  assert.equal(historyText(vr).zh, `每个强化物用的反应次数：${needs.join('、')}；平均 ${formatNumber(mean(needs), 1)} 次（规则的平均是 5 次）。`);
  while (vr.reinforcers.length < HISTORY_LIMIT + 3) vr = respond(vr, vr.responses.length).run;
  const long = historyText(vr);
  assert.ok(long.en.startsWith('Responses each reinforcer took: ..., ') && long.zh.startsWith('每个强化物用的反应次数：……、'));
  assert.equal(long.en.split(';')[0].split(', ').length - 1, HISTORY_LIMIT);
  let vi = createRun({ schedule: 'VI', interval: 8, seed: 4 });
  for (let time = 0; vi.reinforcers.length < 2; time += 0.5) vi = respond(vi, time).run;
  const waits = vi.reinforcers.map((item) => formatSeconds(item.wait));
  assert.equal(historyText(vi).en, `Each wait in seconds: ${waits.join(', ')}; average ${formatSeconds(requirementHistory(vi).mean)} s (the rule's average is 8 s).`);
});

test('text alternatives and announcements are bilingual', () => {
  let run = createRun({ schedule: 'FR', ratio: 2 });
  for (const time of [1, 2, 6]) run = respond(run, time).run;
  assert.equal(recordDescription(run, 9), '累积记录：FR-2，9.0 秒内 3 次反应、1 个强化物。 Cumulative record: FR-2, 3 responses and 1 reinforcer in 9.0 s.');
  assert.equal(recordDescription(createRun({ schedule: 'FI' }), 0), '累积记录：FI-8 秒，0.0 秒内 0 次反应、0 个强化物。 Cumulative record: FI-8 s, 0 responses and 0 reinforcers in 0.0 s.');
  assert.match(patternDescription('FI'), /^简化示意：固定间隔程序的累积记录。.+ Simplified illustration: cumulative record of a fixed-interval schedule\. Scallops/);
  const selected = selectionAnnouncement('VR', 5, 8);
  assert.ok(selected.zh.startsWith('已选择 VR-5。VR-5（可变比率）：'));
  assert.ok(selected.en.startsWith('Selected VR-5. VR-5 (variable ratio): '));
  assert.equal(ariaText(resetAnnouncement('VI', 5, 8)), 'VI-8 秒 重新开始。 VI-8 s starts again.');
  assert.deepEqual(sliderValueText('ratio', 6), { zh: 'n = 6：FR-6 和 VR-6', en: 'n = 6: FR-6 and VR-6' });
  assert.deepEqual(sliderValueText('interval', 12.5), { zh: 't = 12.5 秒', en: 't = 12.5 seconds' });
  assert.deepEqual(sliderValueText('ratio', 40), sliderValueText('ratio', 20));
  assert.deepEqual(joinBi({ zh: '甲。', en: 'A.' }, null, { zh: '乙。', en: 'B.' }), { zh: '甲。乙。', en: 'A. B.' });
  assert.deepEqual([ariaText({ zh: '中', en: '' }), ariaText(null), ariaText({ zh: '中', en: 'En' })], ['中', '', '中 En']);
});

test('every fixed text is bilingual, uses Canadian spelling, has no emoji and is frozen', () => {
  const pairs = [];
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.zh === 'string' && typeof value.en === 'string') pairs.push(value);
    Object.values(value).forEach(walk);
  };
  walk(TEXT);
  walk(SCHEDULE_INFO);
  assert.ok(pairs.length >= 100, `${pairs.length} pairs`);
  for (const pair of pairs) {
    assert.ok(HAN.test(pair.zh), `missing Chinese: ${pair.en}`);
    assert.ok(pair.en.trim() && !HAN.test(pair.en), `missing or mixed English: ${pair.zh}`);
    assert.ok(!EMOJI.test(pair.zh) && !EMOJI.test(pair.en), `emoji: ${pair.en}`);
    assert.ok(!AMERICAN.test(pair.en), `American spelling: ${pair.en}`);
    assert.ok(isCleanText(pair.zh) && isCleanText(pair.en), `markup: ${pair.en}`);
  }
  for (const id of SCHEDULE_IDS) {
    const info = SCHEDULE_INFO[id];
    assert.deepEqual(Object.keys(info.figure), ['rule', 'rate', 'pattern', 'resistance', 'example']);
    assert.ok(info.more.length >= 1 && info.drawing.en && info.note.en);
  }
  assert.ok(Object.isFrozen(TEXT) && Object.isFrozen(TEXT.tryIt) && Object.isFrozen(TEXT.patterns.rows));
  assert.ok(Object.isFrozen(SCHEDULE_INFO) && Object.isFrozen(SCHEDULE_INFO.FI.more) && Object.isFrozen(SCHEDULE_INFO.FI.more[0]));
  assert.ok(Object.isFrozen(PATTERN_SETTINGS));
});

test('no string the widget builds contains an emoji, and every built sentence is bilingual', () => {
  const texts = [];
  const pairs = [];
  const collect = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if (typeof value.zh === 'string' && typeof value.en === 'string') pairs.push(value);
      Object.values(value).forEach(collect);
    }
  };
  for (const id of SCHEDULE_IDS) {
    for (const [ratio, interval] of [[2, 3], [5, 8], [20, 30], [7, 7.5]]) {
      let session = createSession({ schedule: id, ratio, interval, seed: 3 });
      collect([ruleText(id, ratio, interval), noticeFor(session), statusText(session.run, 0)]);
      for (let press = 0; press < 400; press += 1) session = sessionRespond(session, press * 400).session;
      const time = sessionTime(session, 400 * 400);
      collect([noticeFor(session), statusText(session.run, time), historyText(session.run), recordDescription(session.run, time)]);
      collect(session.run.reinforcers.map((item) => [reinforcerTitle(item), reinforcerDetail(session.run, item)]));
      collect([selectionAnnouncement(id, ratio, interval), resetAnnouncement(id, ratio, interval)]);
      collect([scheduleCode(id, ratio, interval), scheduleCode(id, ratio, interval, 'zh')]);
      collect(noticeFor(sessionTick(session, 1e12)));
    }
    collect([patternDescription(id), scheduleBreakdown(id), SCHEDULE_IDS.map((pick) => drillFeedback(id, pick))]);
  }
  collect([sliderValueText('ratio', 7), sliderValueText('interval', 9)]);
  let drill = createDrill([example('VR'), example('FI')]);
  collect([drillProgress(drill), drillScoreText(drill)]);
  drill = nextDrill(answerDrill(drill, 'VR'));
  drill = nextDrill(answerDrill(drill, 'VR'));
  collect([drillSummary(drill), drillScoreText(drill)]);
  assert.ok(texts.length > 1000, `${texts.length} strings`);
  for (const text of texts) assert.ok(!EMOJI.test(text), text);
  assert.ok(pairs.length > 400, `${pairs.length} sentences`);
  for (const pair of pairs) {
    assert.ok(HAN.test(pair.zh), `missing Chinese: ${pair.en}`);
    assert.ok(pair.en.trim() && !HAN.test(pair.en), `missing or mixed English: ${pair.zh}`);
    assert.ok(!AMERICAN.test(pair.en), `American spelling: ${pair.en}`);
  }
});
