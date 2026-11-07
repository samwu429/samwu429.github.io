/**
 * Schedules of reinforcement for the "reinforcement-schedules" widget (King & Urbszat 2024, The Science of
 * Psychology: An Appreciative View, 2nd Canadian ed., Chapter 6, p.226-228 with Figure 6.10; PSY100 lecture
 * slide 14): the config reader, the four schedule engines and the learner's timed run, the cumulative-record
 * geometry, the simplified typical patterns, the examples drill and every text the widget shows. DOM-free.
 * 强化程序（King & Urbszat 2024《心理学》加拿大第 2 版第 6 章第 226-228 页与图 6.10；PSY100 课件第 14 页），
 * 供 reinforcement-schedules 组件使用：读取配置、四种强化程序的规则引擎与学习者的计时练习、累积记录的几何计算、
 * 简化示意的典型反应模式、例子练习，以及组件显示的全部文字；不依赖 DOM。
 *
 * Textbook facts kept here:
 * - Continuous reinforcement reinforces a behaviour every time it occurs: learning is rapid, and extinction is
 *   quick once reinforcement stops. Partial reinforcement follows a behaviour only a portion of the time and is
 *   particularly resistant to extinction (p.226). The lecture calls these intermittent schedules (slide 14).
 * - Ratio schedules count behaviours, interval schedules count the time since the last reinforcer; fixed means
 *   always the same (predictable), variable means it changes (not predictable) (p.227).
 * - Figure 6.10: VR gives the highest and most steady rate and is the most resistant to extinction; FR a high
 *   rate with a pause after each reinforcer; FI a pause, then a higher rate as the time nears; VI a moderate,
 *   steady rate and more resistance than FI.
 * Demo rules (pure, with an injectable seeded random source and explicit time in seconds):
 * - FR-n reinforces every n-th response; VR-n needs a number of responses drawn uniformly from 1..2n − 1
 *   (mean n); FI-t reinforces the first response at least t seconds after the last reinforcer; VI-t does the
 *   same after a wait drawn uniformly from 0.5t..1.5t (mean t). The start of a run counts as the last reinforcer.
 * 教材事实：
 * - 连续强化每次都强化：学得快，但强化一停，消退也快。部分强化只在一部分时候强化，特别难消退（第 226 页）。
 *   课件把它们叫作间歇程序（第 14 页）。
 * - 比率程序数行为的次数，间隔程序看离上一个强化物过了多少时间；固定 = 每次一样（可预测），可变 = 每次在变（不可预测）（第 227 页）。
 * - 图 6.10：VR 反应速度最高最稳、最难消退；FR 速度高、强化物之后停顿；FI 先停顿、越接近时间越快；VI 中等而稳定，比 FI 更难消退。
 * 演示规则（纯函数，随机源可注入、可设种子，时间以秒为单位显式传入）：
 * - FR-n 每第 n 次反应强化；VR-n 需要的次数从 1..2n − 1 中均匀抽取（平均 n）；FI-t 离上一个强化物满 t 秒后的第一次反应强化；
 *   VI-t 同理，等待时间从 0.5t..1.5t 中均匀抽取（平均 t）。练习开始的时刻算作“上一个强化物”。
 */

/* ---------- Limits 取值范围 ---------- */

export const SCHEDULE_IDS = Object.freeze(['FR', 'VR', 'FI', 'VI']);

// The config limits of content-spec 5.5 and tools/validate_content.py (check_psychology_widget).
// content-spec 第 5.5 节与校验器 check_psychology_widget 规定的配置范围。
export const RATIO_LIMITS = Object.freeze({ min: 2, max: 20, fallback: 5 });
export const INTERVAL_LIMITS = Object.freeze({ min: 3, max: 30, fallback: 8 });
export const EXAMPLE_LIMITS = Object.freeze({ min: 1, max: 10 });

export const DEFAULT_TITLE = Object.freeze({ zh: '强化程序', en: 'Schedules of reinforcement' });

// One try-it run lasts at most three minutes, so the record stays readable and nothing runs forever.
// 一轮“动手试试”最多 3 分钟：记录保持清楚，也不会一直运行下去。
export const RUN_SECONDS = 180;

// How many past requirements the history line lists. 历史行最多列出几个过去的要求。
export const HISTORY_LIMIT = 12;

// Slack for "t seconds have passed": absorbs binary noise such as 0.1 + 0.2. 判断“满 t 秒”的容差，吸收二进制误差。
const TIME_EPSILON = 1e-9;

// The string rules of the content validator (tools/validate_content.py: HTML_TAG, EMOJI, ** and ` pairs).
// 内容校验器的字符串规则（HTML 标签、表情符号、成对的 ** 与 `）。
const HTML_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/* ---------- Small helpers 小工具 ---------- */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function occurrences(text, token) {
  return text.split(token).length - 1;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Joins bilingual parts: Chinese without spaces, English with spaces. 拼接双语片段：中文不加空格，英文用空格分隔。 */
export function joinBi(...parts) {
  const items = parts.filter(Boolean);
  return {
    zh: items.map((part) => part.zh).filter(Boolean).join(''),
    en: items.map((part) => part.en).filter(Boolean).join(' '),
  };
}

/** One plain string for aria-label and announcements: Chinese, then English. 供 aria-label 与朗读使用的纯文本：先中文后英文。 */
export function ariaText(value) {
  if (!value) return '';
  return [value.zh, value.en].filter((part) => typeof part === 'string' && part.trim()).join(' ');
}

/* ---------- Config 配置 ---------- */

/**
 * A string the validator accepts: non-empty, no HTML tag, no emoji, balanced ** and ` markers.
 * 校验器接受的字符串：非空、没有 HTML 标签、没有表情符号、** 与 ` 成对出现。
 */
export function isCleanText(value) {
  return typeof value === 'string' && value.trim() !== ''
    && !HTML_TAG.test(value) && !EMOJI.test(value)
    && occurrences(value, '**') % 2 === 0 && occurrences(value, '`') % 2 === 0;
}

// A Bi value as the validator reads it: only zh and en keys, the `need` ones present, every present one clean.
// 按校验器的规则读取双语值：只能有 zh、en 两个键，need 中的语言必须有，出现的每种语言都必须是合格的字符串。
function readBi(value, need = ['zh', 'en']) {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  if (!keys.length || keys.some((key) => key !== 'zh' && key !== 'en')) return null;
  if (need.some((key) => !Object.hasOwn(value, key))) return null;
  if (keys.some((key) => !isCleanText(value[key]))) return null;
  return {
    zh: Object.hasOwn(value, 'zh') ? value.zh.trim() : '',
    en: Object.hasOwn(value, 'en') ? value.en.trim() : '',
  };
}

/**
 * n of FR-n and the average of VR-n: a number is rounded to a whole number and clamped to 2-20; anything that
 * is not a number (a string, true, null) gives the default 5.
 * FR-n 的 n 与 VR-n 的平均数：数字取整后限制在 2-20；不是数字（字符串、true、null）时用默认值 5。
 */
export function readRatio(value) {
  return finiteNumber(value) ? clamp(Math.round(value), RATIO_LIMITS.min, RATIO_LIMITS.max) : RATIO_LIMITS.fallback;
}

/**
 * The FI and VI time in seconds: a number is clamped to 3-30 (decimals are kept); anything else gives 8.
 * FI 与 VI 的时间（秒）：数字限制在 3-30（保留小数）；其他情况用默认值 8。
 */
export function readInterval(value) {
  return finiteNumber(value) ? clamp(value, INTERVAL_LIMITS.min, INTERVAL_LIMITS.max) : INTERVAL_LIMITS.fallback;
}

export function readSchedule(value) {
  return SCHEDULE_IDS.includes(value) ? value : 'FR';
}

// One drill example { text: Bi (zh and en), answer: FR | VR | FI | VI, why: Bi with zh }, or null.
// 一道例子 { text：中英都有, answer：FR/VR/FI/VI, why：至少有中文 }；不合格时返回 null。
function readExample(item) {
  if (!isPlainObject(item)) return null;
  const text = readBi(item.text);
  const why = readBi(item.why, ['zh']);
  if (!text || !why || !SCHEDULE_IDS.includes(item.answer)) return null;
  return { text, answer: item.answer, why };
}

/**
 * The usable examples in their order: items the validator would reject are skipped, and a longer list is cut
 * to 10. Anything that is not a list gives no examples.
 * 按原顺序读出可用的例子：校验器会拒绝的条目被跳过，超过 10 个时截到 10 个；不是列表时没有例子。
 */
export function readExamples(list) {
  if (!Array.isArray(list)) return [];
  const examples = [];
  for (const item of list) {
    if (examples.length >= EXAMPLE_LIMITS.max) break;
    const example = readExample(item);
    if (example) examples.push(example);
  }
  return examples;
}

/**
 * Reads a content config into { title, ratio, interval, examples } and never throws. A config the validator
 * accepts is read as written (title and example strings trimmed). Otherwise: a title that is not a clean Bi
 * with both languages gives the default 强化程序 / Schedules of reinforcement; ratio and interval are clamped
 * (ratio rounded) or default to 5 and 8; unusable examples are dropped. With no examples the drill is hidden.
 * 读取配置得到 { title, ratio, interval, examples }，任何输入都不会抛错。校验器接受的配置原样读取（标题与例子文字去掉首尾空格）。
 * 否则：标题不是中英都有的合格双语值时，用默认标题“强化程序 / Schedules of reinforcement”；ratio 与 interval 超出范围时截到范围内
 * （ratio 先取整），不是数字时用 5 和 8；不可用的例子被丢掉。没有例子时不显示例子练习。
 */
export function normalizeReinforcementSchedulesConfig(config) {
  const source = isPlainObject(config) ? config : {};
  return {
    title: readBi(source.title) ?? { ...DEFAULT_TITLE },
    ratio: readRatio(source.ratio),
    interval: readInterval(source.interval),
    examples: readExamples(source.examples),
  };
}

/* ---------- Random numbers 随机数 ---------- */

const SEED_STEP = 0x6d2b79f5;

function toSeed(seed) {
  const number = Number(seed);
  return Number.isFinite(number) ? Math.floor(number) >>> 0 : 1;
}

// A roll in [0, 1); a broken source (NaN, negative, 1 or more) still gives a usable value.
// [0, 1) 之间的随机数；随机源出错（NaN、负数、大于等于 1）时仍给出可用的值。
function unitRoll(random) {
  const value = Number(typeof random === 'function' ? random() : 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 - Number.EPSILON : value;
}

/**
 * One step of the mulberry32 generator as a pure function: { value in [0, 1), state }.
 * mulberry32 生成器的一步（纯函数）：返回 { value：[0, 1) 的数, state：下一个状态 }。
 */
export function nextRandom(state) {
  const next = (toSeed(state) + SEED_STEP) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, state: next };
}

/** A seeded random source (floats in [0, 1)) built on nextRandom. 基于 nextRandom 的可设种子随机源。 */
export function createSeededRandom(seed = 1) {
  let state = toSeed(seed);
  return function random() {
    const step = nextRandom(state);
    state = step.state;
    return step.value;
  };
}

/** A fresh 32-bit seed from a random source (Math.random by default). 从随机源得到一个新的 32 位种子。 */
export function randomSeed(random = Math.random) {
  return Math.floor(unitRoll(random) * 4294967296) >>> 0;
}

/** VR: how many responses this reinforcer needs, uniform over 1..2n − 1 (mean n). VR：这一次需要几次反应，在 1..2n − 1 中均匀抽取。 */
export function drawRatioRequirement(ratio, random = Math.random) {
  const most = 2 * readRatio(ratio) - 1;
  return 1 + Math.min(most - 1, Math.floor(unitRoll(random) * most));
}

/** VI: how long this reinforcer waits, uniform over [0.5t, 1.5t) seconds (mean t). VI：这一次要等多久，在 [0.5t, 1.5t) 秒中均匀抽取。 */
export function drawIntervalWait(interval, random = Math.random) {
  return readInterval(interval) * (0.5 + unitRoll(random));
}

/* ---------- Schedule engines 强化程序引擎 ---------- */

export function isRatioSchedule(schedule) {
  return schedule === 'FR' || schedule === 'VR';
}

export function isFixedSchedule(schedule) {
  return schedule === 'FR' || schedule === 'FI';
}

// The requirement for the next reinforcer: { need (ratio) or wait (interval), rng }.
// 下一个强化物的要求：比率程序给 need，间隔程序给 wait，并返回新的随机状态 rng。
function nextRequirement(schedule, ratio, interval, rng) {
  if (schedule === 'FR') return { need: ratio, wait: null, rng };
  if (schedule === 'FI') return { need: null, wait: interval, rng };
  const step = nextRandom(rng);
  const roll = () => step.value;
  return schedule === 'VR'
    ? { need: drawRatioRequirement(ratio, roll), wait: null, rng: step.state }
    : { need: null, wait: drawIntervalWait(interval, roll), rng: step.state };
}

/**
 * A new run of one schedule: { schedule, ratio, interval, rng, need, wait, since, lastTime, responses,
 * reinforcers }. `since` counts the responses after the last reinforcer and `lastTime` is its time (0 = start).
 * The seed makes VR and VI repeatable.
 * 某一种程序的新一轮记录。since 是上一个强化物之后的反应次数，lastTime 是上一个强化物的时间（0 = 开始）。种子让 VR、VI 可以复现。
 */
export function createRun({ schedule, ratio, interval, seed = 1 } = {}) {
  const id = readSchedule(schedule);
  const n = readRatio(ratio);
  const t = readInterval(interval);
  const next = nextRequirement(id, n, t, toSeed(seed));
  return {
    schedule: id,
    ratio: n,
    interval: t,
    rng: next.rng,
    need: next.need,
    wait: next.wait,
    since: 0,
    lastTime: 0,
    responses: [],
    reinforcers: [],
  };
}

/**
 * One response at `time` seconds (never earlier than the previous response). Returns { run, reinforced,
 * reinforcer }; a reinforcer is { number, time, count, responses, elapsed, need, wait }: `count` is the
 * cumulative number of responses, `responses` how many it took, `elapsed` the seconds since the last reinforcer.
 * 在 time 秒做一次反应（不早于上一次反应）。返回 { run, reinforced, reinforcer }；强化物记录 { number 第几个, time 时间,
 * count 累计反应数, responses 用了几次反应, elapsed 离上一个强化物几秒, need, wait }。
 */
export function respond(run, time) {
  const previous = run.responses.length ? run.responses[run.responses.length - 1] : 0;
  const at = finiteNumber(time) ? Math.max(time, previous, 0) : previous;
  const since = run.since + 1;
  const elapsed = at - run.lastTime;
  const reinforced = isRatioSchedule(run.schedule) ? since >= run.need : elapsed >= run.wait - TIME_EPSILON;
  const responses = [...run.responses, at];
  if (!reinforced) return { run: { ...run, since, responses }, reinforced: false, reinforcer: null };
  const reinforcer = {
    number: run.reinforcers.length + 1,
    time: at,
    count: responses.length,
    responses: since,
    elapsed,
    need: run.need,
    wait: run.wait,
  };
  const next = nextRequirement(run.schedule, run.ratio, run.interval, run.rng);
  return {
    run: {
      ...run,
      rng: next.rng,
      need: next.need,
      wait: next.wait,
      since: 0,
      lastTime: at,
      responses,
      reinforcers: [...run.reinforcers, reinforcer],
    },
    reinforced: true,
    reinforcer,
  };
}

/**
 * What the counters show at `now` seconds: responses, reinforcers, responses and seconds since the last
 * reinforcer, FR's remaining responses and whether FI's time has passed. The hidden VR and VI requirements are
 * not part of it.
 * now 秒时计数器显示的内容：反应数、强化物数、上一个强化物之后的反应数与秒数、FR 还差几次、FI 是否已满时间。
 * VR 与 VI 保密的要求不在其中。
 */
export function runStatus(run, now) {
  const count = run.responses.length;
  const lastResponse = count ? run.responses[count - 1] : 0;
  const time = Math.max(finiteNumber(now) ? now : 0, lastResponse);
  const sinceTime = Math.max(0, time - run.lastTime);
  return {
    schedule: run.schedule,
    started: count > 0,
    responses: count,
    reinforcers: run.reinforcers.length,
    since: run.since,
    sinceTime,
    time,
    remaining: run.schedule === 'FR' ? run.need - run.since : null,
    available: run.schedule === 'FI' ? sinceTime >= run.wait - TIME_EPSILON : null,
    last: run.reinforcers.length ? run.reinforcers[run.reinforcers.length - 1] : null,
  };
}

/**
 * The requirement of every reinforcer so far (responses for ratio schedules, seconds for interval ones) and
 * their mean, which the variable schedules show to make "on average" visible.
 * 到目前为止每个强化物的要求（比率程序是反应次数，间隔程序是秒数）及其平均数；可变程序用它说明“平均”是什么意思。
 */
export function requirementHistory(run) {
  const values = run.reinforcers.map((item) => (isRatioSchedule(run.schedule) ? item.need : item.wait));
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { values, mean };
}

/* ---------- Clock and session 时钟与一轮练习 ---------- */

/** A stopwatch counted in seconds from explicit millisecond times. 用显式毫秒时间计秒的秒表。 */
export function createStopwatch() {
  return { running: false, base: 0, since: 0 };
}

export function readStopwatch(watch, nowMs) {
  if (!watch.running) return watch.base;
  const now = finiteNumber(nowMs) ? nowMs : watch.since;
  return watch.base + Math.max(0, now - watch.since) / 1000;
}

export function startStopwatch(watch, nowMs) {
  return watch.running ? watch : { running: true, base: watch.base, since: finiteNumber(nowMs) ? nowMs : 0 };
}

export function pauseStopwatch(watch, nowMs) {
  return watch.running ? { running: false, base: readStopwatch(watch, nowMs), since: 0 } : watch;
}

/**
 * The learner's run of one schedule: { run, watch, ended }. The clock starts with the first response, pauses
 * while the run is not on screen, and the run ends after RUN_SECONDS.
 * 学习者某一种程序的一轮练习：{ run, watch, ended }。时钟从第一次反应开始走，不在屏幕上时暂停，满 RUN_SECONDS 秒结束。
 */
export function createSession(options = {}) {
  return { run: createRun(options), watch: createStopwatch(), ended: false };
}

export function sessionStarted(session) {
  return session.run.responses.length > 0;
}

/** Seconds of the run at `nowMs`, at most RUN_SECONDS. 这一轮在 nowMs 时已经过了几秒，最多 RUN_SECONDS。 */
export function sessionTime(session, nowMs) {
  return Math.min(RUN_SECONDS, readStopwatch(session.watch, nowMs));
}

function endSession(session) {
  return { ...session, watch: { running: false, base: RUN_SECONDS, since: 0 }, ended: true };
}

/** Ends the run once its time is up; otherwise returns it unchanged. 时间到了就结束这一轮，否则原样返回。 */
export function sessionTick(session, nowMs) {
  if (session.ended || readStopwatch(session.watch, nowMs) < RUN_SECONDS) return session;
  return endSession(session);
}

/**
 * A response at `nowMs`: starts (or resumes) the clock, then applies the schedule. Returns { session,
 * reinforced, reinforcer, accepted }; a response after the run has ended is not accepted.
 * 在 nowMs 做一次反应：先启动（或恢复）时钟，再按程序规则处理。返回 { session, reinforced, reinforcer, accepted }；
 * 这一轮结束后的反应不被接受。
 */
export function sessionRespond(session, nowMs) {
  if (session.ended) return { session, reinforced: false, reinforcer: null, accepted: false };
  const watch = startStopwatch(session.watch, nowMs);
  const time = readStopwatch(watch, nowMs);
  if (time >= RUN_SECONDS) return { session: endSession(session), reinforced: false, reinforcer: null, accepted: false };
  const result = respond(session.run, time);
  return { session: { ...session, watch, run: result.run }, reinforced: result.reinforced, reinforcer: result.reinforcer, accepted: true };
}

export function sessionPause(session, nowMs) {
  return session.watch.running ? { ...session, watch: pauseStopwatch(session.watch, nowMs) } : session;
}

/** Resumes the clock of a started run that has not ended. 恢复已开始、未结束的一轮的时钟。 */
export function sessionResume(session, nowMs) {
  if (session.ended || session.watch.running || !sessionStarted(session)) return session;
  return { ...session, watch: startStopwatch(session.watch, nowMs) };
}

/* ---------- Cumulative record 累积记录 ---------- */

// Space around the plot of the try-it record, in pixels: the left side holds the response numbers.
// “动手试试”记录图四周的留白（像素）：左边放反应次数的刻度。
export const RECORD_PADDING = Object.freeze({ left: 40, right: 14, top: 12, bottom: 26 });

const X_STEPS = Object.freeze([10, 15, 30, 60]);
const Y_STEPS = Object.freeze([5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]);

function pickStep(top, steps, most) {
  return steps.find((step) => top / step <= most) ?? steps[steps.length - 1];
}

/** Right end of the time axis: 60 s at first, then growing in 30 s steps up to RUN_SECONDS. 时间轴右端：先是 60 秒，之后每次加 30 秒，最多 RUN_SECONDS。 */
export function recordXMax(time) {
  const seconds = finiteNumber(time) ? Math.max(0, time) : 0;
  return Math.min(RUN_SECONDS, Math.max(60, Math.ceil((seconds + 5) / 30) * 30));
}

/** Top of the response axis: at least 20, with room above the count, on a round step. 反应轴顶端：至少 20，比当前次数多留一些空间，取整到刻度。 */
export function recordYMax(count) {
  const n = finiteNumber(count) ? Math.max(0, count) : 0;
  const top = Math.max(20, n + Math.max(3, Math.ceil(n * 0.1)));
  const step = pickStep(top, Y_STEPS, 5);
  return Math.ceil(top / step) * step;
}

/** Tick values 0, step, 2·step, ... up to `max`, with at most `most` steps. 刻度 0、step、2·step……到 max，最多 most 段。 */
export function axisTicks(max, kind = 'x') {
  const steps = kind === 'y' ? Y_STEPS : X_STEPS;
  const step = pickStep(max, steps, kind === 'y' ? 5 : 6);
  const values = [];
  for (let value = 0; value <= max + TIME_EPSILON; value += step) values.push(value);
  return { step, values };
}

/** Maps seconds and response counts to pixels inside the padding. 把秒数和反应次数换算成留白之内的像素坐标。 */
export function recordScale({ width, height, xMax, yMax, padding = RECORD_PADDING }) {
  const left = padding.left;
  const right = Math.max(left + 1, width - padding.right);
  const top = padding.top;
  const bottom = Math.max(top + 1, height - padding.bottom);
  return {
    left,
    right,
    top,
    bottom,
    x: (time) => left + (clamp(finiteNumber(time) ? time : 0, 0, xMax) / xMax) * (right - left),
    y: (count) => bottom - (clamp(finiteNumber(count) ? count : 0, 0, yMax) / yMax) * (bottom - top),
  };
}

function coord(value) {
  return String(Math.round(value * 10) / 10);
}

/**
 * SVG path of a cumulative record: flat while time passes, one step up at each response, flat again up to `end`.
 * 累积记录的 SVG 路径：时间流逝时是平的，每次反应升高一格，最后平着延伸到 end。
 */
export function cumulativePath(responses, end, scale) {
  const parts = [`M${coord(scale.x(0))} ${coord(scale.y(0))}`];
  let last = 0;
  responses.forEach((time, index) => {
    last = Math.max(last, time);
    parts.push(`H${coord(scale.x(time))}V${coord(scale.y(index + 1))}`);
  });
  parts.push(`H${coord(scale.x(Math.max(finiteNumber(end) ? end : 0, last)))}`);
  return parts.join('');
}

/** A short slash below and to the right of the record at each reinforcer. 每个强化物处，记录线右下方的一道短斜线。 */
export function reinforcerMarks(reinforcers, scale, size = 8) {
  return reinforcers.map((item) => {
    const x = scale.x(item.time);
    const y = scale.y(item.count);
    return { x1: coord(x), y1: coord(y), x2: coord(x + size * 0.75), y2: coord(y + size) };
  });
}

/**
 * Everything the try-it record draws at `now` seconds in a width × height box: the axes' extents and ticks, the
 * step path, the reinforcer slashes and the pen (the current end of the line).
 * “动手试试”记录图在 now 秒、width × height 大小时要画的全部内容：坐标轴范围与刻度、阶梯路径、强化物斜线，以及笔尖（线的当前末端）。
 */
export function recordGeometry(run, now, { width = 480, height = 220 } = {}) {
  const status = runStatus(run, now);
  const xMax = recordXMax(status.time);
  const yMax = recordYMax(status.responses);
  const scale = recordScale({ width, height, xMax, yMax });
  return {
    width,
    height,
    xMax,
    yMax,
    plot: { left: coord(scale.left), right: coord(scale.right), top: coord(scale.top), bottom: coord(scale.bottom) },
    path: cumulativePath(run.responses, status.time, scale),
    marks: reinforcerMarks(run.reinforcers, scale),
    pen: { x: coord(scale.x(status.time)), y: coord(scale.y(status.responses)) },
    xTicks: axisTicks(xMax, 'x').values.map((value) => ({ value, x: coord(scale.x(value)), label: String(value) })),
    yTicks: axisTicks(yMax, 'y').values.map((value) => ({ value, y: coord(scale.y(value)), label: String(value) })),
  };
}

/** Pixel height of the try-it record for a given width. 给定宽度时“动手试试”记录图的高度（像素）。 */
export function recordHeight(width) {
  return Math.round(clamp((finiteNumber(width) ? width : 480) * 0.45, 170, 260));
}

/* ---------- Typical patterns (simplified illustration) 典型模式（简化示意） ---------- */

/**
 * Made-up numbers of the simplified drawing, chosen so the four shapes are easy to see on the same scales:
 * 60 s; FR-15 and VR-15 at 2 responses a second (FR pauses 4 s after each reinforcer); FI-15 s whose rate climbs
 * from 0 to 2.7 a second by the end of each interval; VI-15 s at a steady 0.6 a second. The totals keep the
 * textbook's order of rates: VR highest, then FR, then FI, and VI slowest. Not real data.
 * 简化示意图用的假设数字，选它们是为了让四种形状在相同刻度下容易看清：共 60 秒；FR-15、VR-15 每秒 2 次反应（FR 每个强化物之后停 4 秒）；
 * FI-15 秒，每个间隔内反应速度从 0 升到每秒 2.7 次；VI-15 秒，稳定的每秒 0.6 次。总反应数保持教材的速度顺序：VR 最高，
 * 其次 FR、FI，VI 最慢。不是真实数据。
 */
export const PATTERN_SETTINGS = Object.freeze({
  duration: 60,
  ratio: 15,
  interval: 15,
  ratioRate: 2,
  ratioPause: 4,
  fixedIntervalPeak: 2.7,
  variableIntervalRate: 0.6,
  // Picked so the VR and VI slashes come at visibly uneven times. 选它是为了让 VR 与 VI 的斜线间隔明显不均匀。
  seed: 1181,
});

// The simple behaviour rule of each drawing: when the next response comes.
// 每张示意图的简单行为规则：下一次反应在什么时候。
function nextPatternTime(schedule, state, settings) {
  if (schedule === 'FR') return state.time + (state.reinforced ? settings.ratioPause : 0) + 1 / settings.ratioRate;
  if (schedule === 'VR') return state.time + 1 / settings.ratioRate;
  if (schedule === 'VI') return state.time + 1 / settings.variableIntervalRate;
  // FI: peak·τ³ / (3t²) responses by τ seconds after the last reinforcer, a rate rising from 0 to `peak` at τ = t.
  // FI：上一个强化物之后 τ 秒内共有 peak·τ³ / (3t²) 次反应，速度从 0 升到 τ = t 时的 peak。
  const t = settings.interval;
  return state.lastReinforcer + Math.cbrt((3 * t * t * (state.since + 1)) / settings.fixedIntervalPeak);
}

/**
 * One simplified record { schedule, duration, responses, reinforcers }: a simple behaviour rule makes the
 * responses and the schedule engine above decides which ones are reinforced.
 * 一张简化记录 { schedule, duration, responses, reinforcers }：用简单的行为规则产生反应，再由上面的程序引擎决定哪些反应得到强化。
 */
export function typicalRecord(schedule, overrides) {
  const settings = { ...PATTERN_SETTINGS, ...(isPlainObject(overrides) ? overrides : {}) };
  const id = readSchedule(schedule);
  let run = createRun({ schedule: id, ratio: settings.ratio, interval: settings.interval, seed: settings.seed });
  const state = { time: 0, lastReinforcer: 0, since: 0, reinforced: false };
  for (let guard = 0; guard < 5000; guard += 1) {
    const time = nextPatternTime(id, state, settings);
    if (!(time <= settings.duration)) break;
    const result = respond(run, time);
    run = result.run;
    state.time = time;
    state.reinforced = result.reinforced;
    state.since = result.reinforced ? 0 : state.since + 1;
    if (result.reinforced) state.lastReinforcer = time;
  }
  return {
    schedule: id,
    duration: settings.duration,
    responses: run.responses,
    reinforcers: run.reinforcers.map(({ time, count }) => ({ time, count })),
  };
}

/** The four simplified records with one shared response scale `yMax`. 四张简化记录，共用同一个反应刻度 yMax。 */
export function typicalRecords(overrides) {
  const records = Object.fromEntries(SCHEDULE_IDS.map((id) => [id, typicalRecord(id, overrides)]));
  const most = Math.max(1, ...SCHEDULE_IDS.map((id) => records[id].responses.length));
  return { duration: records.FR.duration, yMax: Math.ceil(most * 1.05), records };
}

// The small drawings use a fixed viewBox that scales with the card. 小图使用固定的 viewBox，随卡片缩放。
export const PATTERN_BOX = Object.freeze({
  width: 240,
  height: 150,
  padding: Object.freeze({ left: 8, right: 8, top: 8, bottom: 8 }),
});

/** Path, slashes and plot box of one small drawing. 一张小图的路径、斜线与绘图区。 */
export function patternGeometry(record, yMax, box = PATTERN_BOX) {
  const scale = recordScale({ width: box.width, height: box.height, xMax: record.duration, yMax, padding: box.padding });
  return {
    viewBox: `0 0 ${box.width} ${box.height}`,
    plot: { left: coord(scale.left), right: coord(scale.right), top: coord(scale.top), bottom: coord(scale.bottom) },
    path: cumulativePath(record.responses, record.duration, scale),
    marks: reinforcerMarks(record.reinforcers, scale, 7),
  };
}

/* ---------- Examples drill 例子练习 ---------- */

/** Drill state over the answers of the examples, in their order. 按例子顺序建立的练习状态。 */
export function createDrill(examples) {
  const answers = (Array.isArray(examples) ? examples : []).map((example) => (isPlainObject(example) ? readSchedule(example.answer) : 'FR'));
  return { answers, index: 0, picked: null, results: [], finished: answers.length === 0 };
}

/** Records the first pick for the current example; later picks and unknown names are ignored. 记录当前例子的第一次选择；之后的选择和未知名称被忽略。 */
export function answerDrill(drill, pick) {
  if (drill.finished || drill.picked !== null || !SCHEDULE_IDS.includes(pick)) return drill;
  const correct = pick === drill.answers[drill.index];
  return { ...drill, picked: pick, results: [...drill.results, { index: drill.index, picked: pick, correct }] };
}

/** Moves on after an answer; after the last example the drill is finished. 答完后进入下一题；最后一题之后练习结束。 */
export function nextDrill(drill) {
  if (drill.finished || drill.picked === null) return drill;
  const index = drill.index + 1;
  return index >= drill.answers.length ? { ...drill, picked: null, finished: true } : { ...drill, index, picked: null };
}

export function restartDrill(drill) {
  return { ...drill, index: 0, picked: null, results: [], finished: drill.answers.length === 0 };
}

export function drillScore(drill) {
  const correct = drill.results.filter((result) => result.correct).length;
  return { correct, answered: drill.results.length, total: drill.answers.length };
}

/* ---------- Number words 数字写法 ---------- */

/** A number with at most `digits` decimals and no trailing zeros: 8 -> "8", 7.5 -> "7.5". 最多 digits 位小数并去掉末尾的 0。 */
export function formatNumber(value, digits = 2) {
  if (!finiteNumber(value)) return '?';
  const factor = 10 ** digits;
  const text = (Math.round(value * factor) / factor).toFixed(digits);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Seconds with one decimal: 12.34 -> "12.3". 秒数保留一位小数。 */
export function formatSeconds(value) {
  return finiteNumber(value) ? (Math.round(Math.max(0, value) * 10) / 10).toFixed(1) : '0.0';
}

/** English ordinal: 2nd, 3rd, 5th, 11th, 21st. 英文序数词。 */
export function ordinal(value) {
  const n = Math.trunc(Number(value)) || 0;
  const last2 = Math.abs(n) % 100;
  if (last2 >= 11 && last2 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[Math.abs(n) % 10] ?? 'th';
  return `${n}${suffix}`;
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

function capitalize(text) {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

/** "FR-5", "VR-5", "FI-8 s" (or "FI-8 秒" for Chinese text). 程序代号：FR-5、VR-5、FI-8 s（中文写 FI-8 秒）。 */
export function scheduleCode(schedule, ratio, interval, lang = 'en') {
  const id = readSchedule(schedule);
  if (isRatioSchedule(id)) return `${id}-${readRatio(ratio)}`;
  return `${id}-${formatNumber(readInterval(interval))}${lang === 'zh' ? ' 秒' : ' s'}`;
}

/* ---------- Texts 文字 ---------- */

/**
 * Every fixed text of the widget, as { zh, en } pairs. English uses the textbook's terms and Canadian spelling.
 * 组件中所有固定文字（{ zh, en }）。英文使用教材术语与加拿大拼写。
 */
export const TEXT = deepFreeze({
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  intro: {
    zh: '强化程序（schedules of reinforcement）：规定一个行为什么时候会得到强化的具体规则。先自己按按钮，看看在四种程序下，强化物（reinforcer）分别什么时候来。',
    en: 'Schedules of reinforcement are specific patterns that determine when a behaviour will be reinforced. Press the lever yourself and see when the reinforcers come under each of the four schedules.',
  },
  map: {
    caption: { zh: '两个问题分清四种程序', en: 'Two questions sort the four schedules' },
    corner: { zh: '程序', en: 'Schedule' },
    ratio: { zh: '比率：数反应次数', en: 'Ratio: a number of responses' },
    interval: { zh: '间隔：看过了多少时间', en: 'Interval: an amount of time' },
    fixed: { zh: '固定：每次一样，可以预测', en: 'Fixed: always the same, predictable' },
    variable: { zh: '可变：每次在变，没法预测', en: 'Variable: it changes, not predictable' },
    partial: {
      zh: '这四种都是部分强化（partial reinforcement）：只有一部分时候得到强化，这样学会的行为特别难消退（extinction）。连续强化（continuous reinforcement）是每次都强化：学得快，可是强化一停，消退也快。',
      en: 'All four are partial reinforcement: a reinforcer follows the behaviour only a portion of the time, and the behaviour is particularly resistant to extinction. In continuous reinforcement the behaviour is reinforced every time it occurs: learning is rapid, but extinction is quick once reinforcement stops.',
    },
    lecture: {
      zh: '课件第 14 页把它们叫作间歇程序（intermittent schedules）：不是每次反应都有强化物。',
      en: 'Lecture slide 14 calls them intermittent schedules: the reinforcer is not obtained for every response.',
    },
  },
  tabs: {
    label: { zh: '强化程序演示', en: 'Schedules demo' },
    try: { zh: '动手试试', en: 'Try it' },
    patterns: { zh: '典型模式', en: 'Typical patterns' },
    examples: { zh: '例子练习', en: 'Examples' },
  },
  tryIt: {
    heading: { zh: '你来按杠杆', en: 'You press the lever' },
    how: {
      zh: '先选一种程序，再按下面的大按钮（按钮选中后，也可以按空格键或回车键）。按一次就是一次反应（response）；规则说该给的时候，你就得到一个强化物（reinforcer）。',
      en: 'Pick a schedule, then press the big button (once it has focus, Space and Enter work too). Each press is one response; when the rule says so, you get a reinforcer.',
    },
    picker: { zh: '选择强化程序', en: 'Choose a schedule' },
    rule: { zh: '现在的规则', en: 'The rule now' },
    respond: { zh: '按杠杆（做出反应）', en: 'Respond (press the lever)' },
    responses: { zh: '反应次数', en: 'Responses' },
    reinforcers: { zh: '强化物', en: 'Reinforcers' },
    time: { zh: '时间（秒）', en: 'Time (s)' },
    reset: { zh: '重新开始', en: 'Reset' },
    ready: { zh: '按下按钮就开始：时钟从你的第一次反应开始走。', en: 'Press the button to start: the clock starts with your first response.' },
    waiting: { zh: '还没有强化物。', en: 'No reinforcer yet.' },
    over: {
      zh: `${RUN_SECONDS / 60} 分钟到了，这一轮结束。看看你的累积记录，或者按“重新开始”。`,
      en: `${RUN_SECONDS / 60} minutes are up, so this run is over. Look at your cumulative record, or press Reset.`,
    },
    keep: {
      zh: '每种程序有自己的记录：切换到别的程序再切回来，记录还在。',
      en: 'Each schedule keeps its own record, so you can switch to another one and come back.',
    },
    seconds: {
      zh: '生活里的间隔常常是几分钟，甚至几周（比如每三周考一次试）；这里用秒，免得你等太久。',
      en: 'Real intervals are often minutes or even weeks (such as an exam every three weeks); the demo uses seconds so you do not wait long.',
    },
    settings: { zh: '调整 n 和 t', en: 'Adjust n and t' },
    ratioLabel: { zh: '比率 n（FR 和 VR 用）', en: 'Ratio n (for FR and VR)' },
    intervalLabel: { zh: '间隔 t（FI 和 VI 用，单位：秒）', en: 'Interval t (for FI and VI, in seconds)' },
    settingsNote: {
      zh: '改了 n，FR 和 VR 的记录会重新开始；改了 t，FI 和 VI 的记录会重新开始。',
      en: 'Changing n starts FR and VR again; changing t starts FI and VI again.',
    },
  },
  record: {
    heading: { zh: '累积记录', en: 'Cumulative record' },
    yAxis: { zh: '累计反应次数', en: 'Cumulative responses' },
    xAxis: { zh: '时间（秒）', en: 'Time (seconds)' },
    read: {
      zh: '每做一次反应，线就往上走一格；时间一直往右走。线越陡，反应越快；线变平，就是停下来没有反应。短斜线表示在这里得到一个强化物。',
      en: 'The line climbs one step with every response while time moves to the right. A steeper line means faster responding; a flat stretch means a pause. A short slash marks a reinforcer.',
    },
    line: { zh: '反应', en: 'responses' },
    mark: { zh: '强化物', en: 'reinforcer' },
  },
  patterns: {
    heading: { zh: '四种程序的典型反应模式', en: 'Typical response patterns of the four schedules' },
    illustration: { zh: '简化示意', en: 'Simplified illustration' },
    intro: {
      zh: '下面四张小图是按简单规则画出来的，不是真实数据。四张图的时间轴和反应轴刻度相同，可以直接比较：线越陡，反应越快；短斜线表示得到一个强化物。',
      en: 'The four small records below are drawn by simple rules, not from real data. They share the same time and response scales, so you can compare them directly: a steeper line means faster responding, and a short slash marks a reinforcer.',
    },
    axes: { zh: '横轴：时间；纵轴：累计反应次数', en: 'Across: time. Up: cumulative responses.' },
    drawing: { zh: '图上看到的', en: 'In the drawing' },
    facts: { zh: '教材图 6.10 要点', en: 'Textbook Figure 6.10 in brief' },
    rows: {
      rule: { zh: '什么时候强化', en: 'When it reinforces' },
      rate: { zh: '反应速度', en: 'Response rate' },
      pattern: { zh: '反应模式', en: 'Response pattern' },
      resistance: { zh: '抗消退能力', en: 'Resistance to extinction' },
      example: { zh: '例子', en: 'Example' },
    },
    more: { zh: '教材正文里的更多例子', en: 'More examples from the textbook' },
    remember: {
      zh: '记住：可变比率（VR）的反应速度最高、最稳定，而且是四种程序里最难消退的（想想老虎机）。',
      en: 'Remember: variable ratio (VR) gives the highest and steadiest rate of response and is the most resistant to extinction of the four (think of slot machines).',
    },
    source: {
      zh: '依据：教材第 226–228 页与图 6.10（意译），课件第 14 页。',
      en: 'Based on textbook pages 226-228 and Figure 6.10 (in our own words), and lecture slide 14.',
    },
  },
  drill: {
    heading: { zh: '这是哪一种强化程序？', en: 'Which schedule is it?' },
    intro: {
      zh: '读一个例子，选出它背后的强化程序。先问自己两个问题：数的是反应次数，还是过了多少时间？每次都一样（固定），还是每次在变（可变）？',
      en: 'Read an example and pick the schedule behind it. Ask two questions: does it count responses or time? Is it always the same (fixed), or does it change (variable)?',
    },
    options: { zh: '选一个程序', en: 'Pick a schedule' },
    correct: { zh: '答对了！', en: 'Correct!' },
    why: { zh: '为什么', en: 'Why' },
    next: { zh: '下一题', en: 'Next' },
    results: { zh: '看结果', en: 'See results' },
    tryAgain: { zh: '再做一遍', en: 'Try again' },
    allCorrect: { zh: '全部答对！', en: 'All correct!' },
    review: { zh: '答错的题，再看一眼：', en: 'The ones you missed:' },
    yourPick: { zh: '你的选择', en: 'your pick' },
    answer: { zh: '正确答案', en: 'answer' },
  },
  parts: {
    ratio: { zh: '数的是反应次数，所以是比率（ratio）程序', en: 'it counts responses, so it is a ratio schedule' },
    interval: { zh: '看的是过了多少时间，所以是间隔（interval）程序', en: 'it counts time, so it is an interval schedule' },
    fixed: { zh: '每次一样、可以预测，所以是固定（fixed）的', en: 'it is always the same and predictable, so it is fixed' },
    variable: { zh: '每次在变、没法预测，所以是可变（variable）的', en: 'it changes and cannot be predicted, so it is variable' },
  },
  from: {
    start: { zh: '开始', en: 'the start' },
    last: { zh: '上一个强化物', en: 'the last reinforcer' },
  },
});

/**
 * The four schedules: names, the textbook's Figure 6.10 points in our own words, the shape of the simplified
 * drawing, one note from the text and the text's other examples (p.226-228).
 * 四种程序：名称、教材图 6.10 的要点（意译）、简化示意图的形状、正文的一条补充说明，以及正文里的其他例子（第 226-228 页）。
 */
export const SCHEDULE_INFO = deepFreeze({
  FR: {
    id: 'FR',
    basis: 'ratio',
    regularity: 'fixed',
    name: { zh: '固定比率程序', en: 'Fixed-ratio schedule' },
    short: { zh: '固定比率', en: 'Fixed ratio' },
    figure: {
      rule: { zh: '做满固定次数的反应后强化', en: 'Reinforcement after a set number of responses' },
      rate: { zh: '反应速度高', en: 'High rate of response' },
      pattern: { zh: '快速反应；得到强化物以后停顿一下', en: 'A high rate of response, then a pause after the reinforcer is given' },
      resistance: { zh: '看比率：比率越高，越难消退', en: 'Depends on the ratio: a higher ratio leads to more resistance' },
      example: { zh: '孩子在家务表上每攒满 5 颗星，就能挑一个游戏玩。', en: 'A child gets to choose a game every time they earn five stars on their chore chart.' },
    },
    drawing: {
      zh: '像楼梯：一段很陡的快速反应，每个强化物之后平一小段（停顿）。',
      en: 'Like stairs: a steep run of fast responding, then a short flat pause after each reinforcer.',
    },
    note: {
      zh: '教材：固定比率对人来说一点也不神秘。假如老虎机每第 20 次一定中奖，你看到别人玩了 18、19 次没中就走了，就该马上上去投币。',
      en: 'Textbook: fixed-ratio schedules are not very mysterious to human learners. If a slot machine paid out every 20th time, you would step up right after someone played it 18 or 19 times and walked away.',
    },
    more: [
      { zh: '往自动售货机里投 6 个 25 分硬币（quarter），出来一块巧克力。', en: 'You put six quarters in a vending machine and get a chocolate bar.' },
      { zh: '拿提成：卖满 20 把电动勺子，才拿到一张奖金支票。', en: 'On commission, you must sell 20 electric spoons before you receive a bonus cheque.' },
      { zh: '工厂按件计酬：生产够一定数量的产品，才拿到一笔钱。', en: 'A factory pays a line worker a set amount for producing a certain number of items.' },
    ],
  },
  VR: {
    id: 'VR',
    basis: 'ratio',
    regularity: 'variable',
    name: { zh: '可变比率程序', en: 'Variable-ratio schedule' },
    short: { zh: '可变比率', en: 'Variable ratio' },
    figure: {
      rule: { zh: '做了不固定次数的反应后强化', en: 'Reinforcement after a variable number of responses' },
      rate: { zh: '反应速度最高、最稳定', en: 'Highest and most steady rate of response' },
      pattern: { zh: '稳定地反应，几乎没有停顿', en: 'Steady responding with very few or no pauses' },
      resistance: { zh: '最难消退', en: 'Most resistant to extinction' },
      example: { zh: '玩老虎机的人一直玩下去，因为时不时会随机中一次奖。', en: 'A gambler keeps playing a slot machine because a payoff comes at random now and then.' },
    },
    drawing: {
      zh: '一条又陡又直的线：一直快速反应，不停顿。',
      en: 'A steep, straight line: fast responding without pauses.',
    },
    note: {
      zh: '教材：可变比率产生又高又稳的行为速度，比另外三种都更难消退。光等着没有用，必须做够一定次数的行为（老虎机得投币），所以它是比率程序。',
      en: 'Textbook: variable-ratio schedules produce high, steady rates of behaviour that are more resistant to extinction than the other three schedules. Waiting does not help: a certain number of behaviours must occur, which is what makes it a ratio schedule.',
    },
    more: [
      { zh: '老虎机可能平均每 20 次中一次，但赌的人不知道是哪一次：可能连中两次，然后投了 58 个硬币才再中。', en: 'A slot machine might pay off every 20th time on average, but the gambler cannot tell when: it might pay off twice in a row and then not again for 58 coins.' },
    ],
  },
  FI: {
    id: 'FI',
    basis: 'interval',
    regularity: 'fixed',
    name: { zh: '固定间隔程序', en: 'Fixed-interval schedule' },
    short: { zh: '固定间隔', en: 'Fixed interval' },
    figure: {
      rule: { zh: '固定的时间过去以后，第一次合适的反应得到强化', en: 'The first appropriate behaviour after a fixed amount of time is reinforced' },
      rate: { zh: '反应速度稳定', en: 'Steady rate of response' },
      pattern: { zh: '得到强化物以后先停顿；快到下一次强化的时间，反应越来越快', en: 'A pause after the reinforcer, then a higher rate as the time for the next reinforcement nears' },
      resistance: { zh: '看间隔：间隔越长，越难消退', en: 'Depends on the interval: a longer interval leads to more resistance' },
      example: { zh: '只要房间干净，孩子每周五能拿零花钱。于是孩子每周四晚上才打扫，拿到钱以后又让房间乱掉。', en: 'A child gets an allowance every Friday if their room is clean, so they clean it every Thursday evening and let it get messy again after being paid.' },
    },
    drawing: {
      zh: '一个个“扇贝”形：强化物之后几乎是平的（停顿），越接近时间，线越陡。',
      en: 'Scallops: almost flat after each reinforcer (a pause), then steeper and steeper as the time comes near.',
    },
    note: {
      zh: '注意：图 6.10 的“反应速度”一栏给 FI 写的是稳定（steady），但“反应模式”一栏和正文都说：得到强化物以后先停顿，越接近时间，反应越快。',
      en: 'Note: Figure 6.10 lists a steady rate of response for FI, but its response-pattern column and the text both say that responding pauses after a reinforcer and speeds up as the time nears.',
    },
    more: [
      { zh: '每三周考一次试：平时拖着不学，每次考前才突击（cram）。', en: 'With an exam every three weeks, you might procrastinate and cram just before each test.' },
      { zh: '宠物到了下午 5 点就凑到饭盆边，等着吃晚饭。', en: 'Pets wait by their food dish at 5 p.m. for dinner.' },
      { zh: '烤饼干时定了计时器：越接近时间，越频繁地去看饼干。', en: 'Baking cookies with a timer, you check them more often as the set time gets closer.' },
      { zh: '医院的止痛药按钮：按一次给一小剂，之后要等一段固定的时间再按才有用。要是改成固定比率，有的病人可能会把按钮按坏。', en: 'Hospital painkiller buttons: after a dose, the patient must wait a set time before pressing again works. On a fixed-ratio schedule, some patients might wear out the buttons.' },
    ],
  },
  VI: {
    id: 'VI',
    basis: 'interval',
    regularity: 'variable',
    name: { zh: '可变间隔程序', en: 'Variable-interval schedule' },
    short: { zh: '可变间隔', en: 'Variable interval' },
    figure: {
      rule: { zh: '不固定的时间过去以后，反应得到强化', en: 'A behaviour is reinforced after a variable amount of time' },
      rate: { zh: '反应速度稳定', en: 'Steady rate of response' },
      pattern: { zh: '中等速度，稳定地反应', en: 'A moderate and steady rate of response' },
      resistance: { zh: '比固定间隔更难消退', en: 'More resistant than fixed interval' },
      example: { zh: '主管一周到员工办公室转几次，看到工作有进展就表扬。', en: 'A supervisor drops by employees\' offices a few times a week and praises progress on their duties.' },
    },
    drawing: {
      zh: '一条平缓的直线：慢慢地、稳定地反应。',
      en: 'A gentle, straight line: slow, steady responding.',
    },
    note: {
      zh: '教材：因为很难预测奖励什么时候来，可变间隔下的行为又慢又稳定（slow and consistent）。所以随堂小测比定期考试更能让人稳定地学习，而不是考前突击。',
      en: 'Textbook: because it is hard to predict when a reward will come, behaviour is slow and consistent on a variable-interval schedule. That is why pop quizzes lead to more consistent studying than the cramming seen with scheduled tests.',
    },
    more: [
      { zh: '随堂小测（pop quiz）：事先不通知，不知道哪天考。', en: 'Pop quizzes: you never know which day one will come.' },
      { zh: '随机药检（random drug testing）。', en: 'Random drug testing.' },
      { zh: '钓鱼：不知道鱼会在一分钟、一小时还是一天以后上钩。', en: 'Fishing: the fish might bite after one minute, one hour or a day.' },
    ],
  },
});

/** The current rule of the try-it mode in words. “动手试试”中当前规则的文字说明。 */
export function ruleText(schedule, ratio, interval) {
  const id = readSchedule(schedule);
  const n = readRatio(ratio);
  const t = readInterval(interval);
  const seconds = formatNumber(t);
  const low = formatNumber(t * 0.5);
  const high = formatNumber(t * 1.5);
  if (id === 'FR') {
    return {
      zh: `FR-${n}（固定比率）：每做满 ${n} 次反应，就得到一个强化物。次数永远一样，所以可以预测。`,
      en: `FR-${n} (fixed ratio): every ${ordinal(n)} response is reinforced. The number never changes, so you can predict the reinforcer.`,
    };
  }
  if (id === 'VR') {
    return {
      zh: `VR-${n}（可变比率）：需要的反应次数每次都变，平均 ${n} 次，所以没法预测哪一次会得到强化物。本演示每次从 1 到 ${2 * n - 1} 里随机抽一个次数。`,
      en: `VR-${n} (variable ratio): the number of responses needed changes every time, ${n} on average, so you cannot predict which response pays off. In this demo the number is drawn at random from 1 to ${2 * n - 1} each time.`,
    };
  }
  if (id === 'FI') {
    return {
      zh: `FI-${seconds} 秒（固定间隔）：离上一个强化物满 ${seconds} 秒以后，第一次反应得到强化物；不满 ${seconds} 秒，按多少次都没用。一开始从你的第一次反应算起。`,
      en: `FI-${seconds} s (fixed interval): the first response after ${seconds} seconds since the last reinforcer is reinforced; responses before that earn nothing. At the start, time counts from your first response.`,
    };
  }
  return {
    zh: `VI-${seconds} 秒（可变间隔）：要等的时间每次都变，平均 ${seconds} 秒；时间到了以后的第一次反应得到强化物，所以没法预测是什么时候。本演示每次在 ${low} 到 ${high} 秒之间随机抽一个等待时间。一开始从你的第一次反应算起。`,
    en: `VI-${seconds} s (variable interval): the wait changes every time, ${seconds} seconds on average, and the first response after the wait is reinforced, so you cannot predict when. In this demo the wait is drawn at random between ${low} and ${high} seconds each time. At the start, time counts from your first response.`,
  };
}

/**
 * The progress line under the counters at `now` seconds. Fixed schedules show the target; variable ones keep
 * it hidden, as the learner cannot know it.
 * now 秒时计数器下面的进度说明。固定程序显示目标；可变程序把目标保密，因为学习者本来就不可能知道。
 */
export function statusText(run, now) {
  const status = runStatus(run, now);
  const from = status.reinforcers ? TEXT.from.last : TEXT.from.start;
  const seconds = formatSeconds(status.sinceTime);
  const t = formatNumber(run.interval);
  if (run.schedule === 'FR') {
    return {
      zh: `这一轮已做 ${status.since} / ${run.ratio} 次反应，还差 ${status.remaining} 次。`,
      en: `${status.since} of ${run.ratio} responses done; ${status.remaining} more to the next reinforcer.`,
    };
  }
  if (run.schedule === 'VR') {
    return {
      zh: `${from.zh}以来做了 ${status.since} 次反应。这次需要几次？保密（平均 ${run.ratio} 次）。`,
      en: `${status.since} ${plural(status.since, 'response', 'responses')} since ${from.en}. The number needed this time is hidden (${run.ratio} on average).`,
    };
  }
  if (run.schedule === 'FI') {
    return status.available
      ? {
        zh: `离${from.zh}已经满 ${t} 秒：你的下一次反应就会得到强化物。`,
        en: `${t} seconds have passed since ${from.en}: your next response will be reinforced.`,
      }
      : {
        zh: `离${from.zh}过了 ${seconds} 秒；满 ${t} 秒以后的第一次反应才有强化物。`,
        en: `${seconds} s since ${from.en}; only the first response after ${t} s is reinforced.`,
      };
  }
  return {
    zh: `离${from.zh}过了 ${seconds} 秒。这次要等多久？保密（平均 ${t} 秒）。`,
    en: `${seconds} s since ${from.en}. The length of this wait is hidden (${t} s on average).`,
  };
}

/** The short live notice of a reinforcer. 得到强化物时的简短提示。 */
export function reinforcerTitle(reinforcer) {
  const number = reinforcer?.number ?? 1;
  return { zh: `强化物！第 ${number} 个。`, en: `Reinforcer! Number ${number}.` };
}

/** How this reinforcer was earned, revealing the hidden requirement afterwards. 这个强化物是怎么得到的；事后揭晓保密的要求。 */
export function reinforcerDetail(run, reinforcer) {
  const from = reinforcer.number > 1 ? TEXT.from.last : TEXT.from.start;
  const elapsed = formatSeconds(reinforcer.elapsed);
  const t = formatNumber(run.interval);
  if (run.schedule === 'FR') {
    return {
      zh: `正好做满 ${reinforcer.responses} 次反应：次数固定，可以预测。`,
      en: `It came after exactly ${reinforcer.responses} responses: the number is fixed and predictable.`,
    };
  }
  if (run.schedule === 'VR') {
    return {
      zh: `这一个用了 ${reinforcer.responses} 次反应（平均 ${run.ratio} 次）：次数在变，没法预测。`,
      en: `This one took ${reinforcer.responses} ${plural(reinforcer.responses, 'response', 'responses')} (${run.ratio} on average): the number changes, so you cannot predict it.`,
    };
  }
  if (run.schedule === 'FI') {
    return {
      zh: `满 ${t} 秒以后的第一次反应得到了它（离${from.zh} ${elapsed} 秒）。`,
      en: `The first response after ${t} s earned it (${elapsed} s after ${from.en}).`,
    };
  }
  return {
    zh: `这次要等 ${formatSeconds(reinforcer.wait)} 秒（平均 ${t} 秒）；你在离${from.zh} ${elapsed} 秒时的反应得到了它。`,
    en: `This wait was ${formatSeconds(reinforcer.wait)} s (${t} s on average); your response ${elapsed} s after ${from.en} earned it.`,
  };
}

/**
 * The notice of a session: { tone: ready | waiting | reinforcer | over, title, detail }.
 * 一轮练习的提示：{ tone：ready 准备 | waiting 等待 | reinforcer 强化物 | over 结束, title, detail }。
 */
export function noticeFor(session) {
  const { run } = session;
  if (session.ended) return { tone: 'over', title: TEXT.tryIt.over, detail: null };
  if (!run.responses.length) return { tone: 'ready', title: TEXT.tryIt.ready, detail: null };
  const last = run.reinforcers[run.reinforcers.length - 1];
  if (!last) return { tone: 'waiting', title: TEXT.tryIt.waiting, detail: null };
  return { tone: 'reinforcer', title: reinforcerTitle(last), detail: reinforcerDetail(run, last) };
}

/**
 * The requirements so far, or null before the first reinforcer: fixed schedules repeat the same number, the
 * variable ones list theirs with the mean, so "on average" can be seen.
 * 到目前为止的要求；第一个强化物之前为 null。固定程序每次一样，可变程序列出每次的要求和平均数，让“平均”看得见。
 */
export function historyText(run) {
  if (!run.reinforcers.length) return null;
  const t = formatNumber(run.interval);
  if (run.schedule === 'FR') {
    return {
      zh: `每个强化物都正好用了 ${run.ratio} 次反应：固定，可以预测。`,
      en: `Every reinforcer took exactly ${run.ratio} responses: fixed and predictable.`,
    };
  }
  if (run.schedule === 'FI') {
    return {
      zh: `每次都要等满 ${t} 秒：固定，可以预测。`,
      en: `Every wait is ${t} s: fixed and predictable.`,
    };
  }
  const { values, mean } = requirementHistory(run);
  const shown = values.slice(-HISTORY_LIMIT);
  const cut = values.length > shown.length;
  if (run.schedule === 'VR') {
    const list = shown.map((value) => String(value));
    return {
      zh: `每个强化物用的反应次数：${cut ? '……、' : ''}${list.join('、')}；平均 ${formatNumber(mean, 1)} 次（规则的平均是 ${run.ratio} 次）。`,
      en: `Responses each reinforcer took: ${cut ? '..., ' : ''}${list.join(', ')}; average ${formatNumber(mean, 1)} (the rule's average is ${run.ratio}).`,
    };
  }
  const list = shown.map((value) => formatSeconds(value));
  return {
    zh: `每次的等待时间（秒）：${cut ? '……、' : ''}${list.join('、')}；平均 ${formatSeconds(mean)} 秒（规则的平均是 ${t} 秒）。`,
    en: `Each wait in seconds: ${cut ? '..., ' : ''}${list.join(', ')}; average ${formatSeconds(mean)} s (the rule's average is ${t} s).`,
  };
}

/** Text alternative of the try-it record. “动手试试”记录图的文字替代。 */
export function recordDescription(run, now) {
  const status = runStatus(run, now);
  const seconds = formatSeconds(status.time);
  return ariaText({
    zh: `累积记录：${scheduleCode(run.schedule, run.ratio, run.interval, 'zh')}，${seconds} 秒内 ${status.responses} 次反应、${status.reinforcers} 个强化物。`,
    en: `Cumulative record: ${scheduleCode(run.schedule, run.ratio, run.interval)}, ${status.responses} ${plural(status.responses, 'response', 'responses')} and ${status.reinforcers} ${plural(status.reinforcers, 'reinforcer', 'reinforcers')} in ${seconds} s.`,
  });
}

/** Text alternative of one simplified drawing. 一张简化示意图的文字替代。 */
export function patternDescription(schedule) {
  const info = SCHEDULE_INFO[readSchedule(schedule)];
  return ariaText({
    zh: `${TEXT.patterns.illustration.zh}：${info.name.zh}的累积记录。${info.drawing.zh}`,
    en: `${TEXT.patterns.illustration.en}: cumulative record of a ${info.name.en.toLowerCase()}. ${info.drawing.en}`,
  });
}

/** Announced when the learner picks a schedule: its code and rule. 学习者选择程序时朗读：代号与规则。 */
export function selectionAnnouncement(schedule, ratio, interval) {
  return joinBi(
    { zh: `已选择 ${scheduleCode(schedule, ratio, interval, 'zh')}。`, en: `Selected ${scheduleCode(schedule, ratio, interval)}.` },
    ruleText(schedule, ratio, interval),
  );
}

/** Announced after Reset. 按“重新开始”后朗读。 */
export function resetAnnouncement(schedule, ratio, interval) {
  return {
    zh: `${scheduleCode(schedule, ratio, interval, 'zh')} 重新开始。`,
    en: `${scheduleCode(schedule, ratio, interval)} starts again.`,
  };
}

/** aria-valuetext of the n and t sliders. n 与 t 滑块的 aria-valuetext。 */
export function sliderValueText(kind, value) {
  if (kind === 'ratio') {
    const n = readRatio(value);
    return { zh: `n = ${n}：FR-${n} 和 VR-${n}`, en: `n = ${n}: FR-${n} and VR-${n}` };
  }
  const t = formatNumber(readInterval(value));
  return { zh: `t = ${t} 秒`, en: `t = ${t} seconds` };
}

/** "Responses or time? ... Fixed or variable? ..." for one schedule. 用两个问题拆解一种程序。 */
export function scheduleBreakdown(schedule) {
  const info = SCHEDULE_INFO[readSchedule(schedule)];
  const basis = TEXT.parts[info.basis];
  const regularity = TEXT.parts[info.regularity];
  return {
    zh: `${basis.zh}；${regularity.zh}。所以是 ${info.id}（${info.short.zh}）。`,
    en: `${capitalize(basis.en)}; ${regularity.en}. So it is ${info.id} (${info.short.en.toLowerCase()}).`,
  };
}

/** Feedback after a pick: { correct, title, breakdown }. 选择之后的反馈：{ correct, title, breakdown }。 */
export function drillFeedback(answer, picked) {
  const id = readSchedule(answer);
  const correct = picked === id;
  const chosen = SCHEDULE_IDS.includes(picked) ? picked : '?';
  const info = SCHEDULE_INFO[id];
  const title = correct
    ? TEXT.drill.correct
    : {
      zh: `不对。你选了 ${chosen}，答案是 ${id}（${info.short.zh}）。`,
      en: `Not quite. You chose ${chosen}; the answer is ${id} (${info.short.en.toLowerCase()}).`,
    };
  return { correct, title, breakdown: scheduleBreakdown(id) };
}

export function drillProgress(drill) {
  const total = drill.answers.length;
  const number = Math.min(drill.index + 1, total);
  return { zh: `第 ${number} 题，共 ${total} 题`, en: `Example ${number} of ${total}` };
}

export function drillScoreText(drill) {
  const { correct, answered } = drillScore(drill);
  return { zh: `得分：${correct} / ${answered}`, en: `Score: ${correct} / ${answered}` };
}

export function drillSummary(drill) {
  const { correct, total } = drillScore(drill);
  return { zh: `你答对了 ${correct} / ${total} 题。`, en: `You got ${correct} of ${total} right.` };
}
