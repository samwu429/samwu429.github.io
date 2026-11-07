/**
 * A night's sleep cycle (King & Urbszat, The Science of Psychology: An Appreciative View, 2nd Canadian ed.,
 * Chapter 5, pp. 173-179) for the "sleep-cycle" widget: the config reader, a stylised hypnogram of a typical
 * young adult's 8-hour night, the facts of every stage and EEG wave, and every number, sentence and chart
 * position the widget shows. DOM-free.
 * 一夜的睡眠周期（King & Urbszat《心理学》加拿大第 2 版第 5 章第 173-179 页），供 sleep-cycle 组件使用：读取配置，
 * 给出一个典型年轻成年人 8 小时夜晚的简化睡眠图，每个阶段与每种脑电波的知识点，以及组件显示的每个数字、句子和图上位置；不依赖 DOM。
 *
 * The night is drawn by hand to agree with the textbook, not taken from a real recording; tests check each of
 * these statements against the data:
 * - p.175 and Figure 5.7: a cycle lasts about 90 to 100 minutes and recurs several times a night;
 * - p.175: much more deep sleep (N3) in the first half of the night than in the second half;
 * - p.175: most REM sleep comes toward the end of the night, each REM stage longer than the one before: the
 *   first might last only 10 minutes, the final one up to an hour;
 * - p.175: about 60% of sleep is light sleep (N1 and N2), 20% N3 and 20% REM (Webb, 2000);
 * - p.174: after N1 to N3, sleepers drift up and enter REM instead of re-entering N1;
 * - Figure 5.5: N1 lasts up to 10 minutes and N2 up to 20 minutes at a time;
 * - p.176: without an alarm we are most likely to wake up just after a REM period.
 * 这一夜是按教材描述手工画出的，不是真实记录；测试会逐条检查数据是否符合下面这些说法：
 * - 第 175 页与图 5.7：一个周期约 90-100 分钟，一夜重复好几次；
 * - 第 175 页：前半夜的深睡眠（N3）远多于后半夜；
 * - 第 175 页：REM 大多在后半夜，而且一次比一次长：第一次可能只有 10 分钟，最后一次可长达 1 小时；
 * - 第 175 页：约 60% 的睡眠是浅睡眠（N1 和 N2），20% 是 N3，20% 是 REM（Webb, 2000）；
 * - 第 174 页：经过 N1 到 N3 之后，人往上“浮”，进入 REM，而不是重新进入 N1；
 * - 图 5.5：N1 一次最长约 10 分钟，N2 一次最长约 20 分钟；
 * - 第 176 页：没有闹钟打扰时，人最可能在一个 REM 期刚结束时醒来。
 *
 * Textbook wording kept here: theta waves follow the text of p.174 ("slower in frequency and greater in
 * amplitude than alpha waves"), although the box of Figure 5.5 calls them "low frequency, low amplitude"; the
 * text calls REM waves "fast waves similar to those of relaxed wakefulness" (p.174) and names no wave type, but the
 * chapter's own Quiz Yourself (p.203, LO2 question 2) answers beta, as the lecture slides do (Consciousness, slide 9),
 * so the widget teaches beta (course brief). The textbook says nothing about the muscles in REM sleep; the one REM
 * fact from the lecture slides is labelled as coming from them.
 * 保留的教材说法：theta 波按第 174 页正文写（“比 alpha 波频率更低、波幅更大”），虽然图 5.5 的方框写的是“低频、低波幅”；
 * 正文把 REM 的脑电波写作“和放松清醒时相似的快波”（第 174 页），没有点名是哪种波，但本章 Quiz Yourself（第 203 页
 * LO2 第 2 题）的答案是 beta，和讲课幻灯片（Consciousness 第 9 张）一样，所以组件按课程说明教 beta。教材没有讲 REM 时
 * 肌肉怎样；唯一一条来自讲课幻灯片的 REM 知识点会注明出处。
 */

/* ---------- Config 配置 ---------- */

// Presets the content validator accepts (tools/validate_content.py, SLEEP_PRESETS).
// 内容校验器接受的预设（tools/validate_content.py 的 SLEEP_PRESETS）。
export const SLEEP_PRESETS = Object.freeze(['typical-night']);
export const DEFAULT_PRESET = 'typical-night';
export const DEFAULT_TITLE = Object.freeze({ zh: '一夜的睡眠周期', en: "A night's sleep cycle" });

// Reads one key without ever throwing (a getter or a proxy could). 读取一个键，绝不抛错（getter 或代理对象可能会抛错）。
function readKey(source, key) {
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

// A title the widget can show: {zh, en} with both languages non-empty, as the validator requires.
// 组件可以使用的标题：zh 和 en 都不为空的 {zh, en}，与校验器的要求一致。
function readTitle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const zh = readKey(value, 'zh');
  const en = readKey(value, 'en');
  const usable = (text) => typeof text === 'string' && text.trim() !== '';
  return usable(zh) && usable(en) ? { zh, en } : null;
}

/**
 * Reads a content config defensively into { title, preset, usedDefaultTitle, usedDefaultPreset }.
 * - title: a Bi value with both zh and en (the validator's rule), kept as written; anything else, including a
 *   title in one language only, shows DEFAULT_TITLE so every visible string stays bilingual.
 * - preset: "typical-night", the only preset; a missing preset is the default, any other value falls back to it
 *   (usedDefaultPreset tells an author that the value was not understood).
 * Other keys (such as "prompt", which the validator allows for every psychology widget) are ignored. Never throws.
 * 防御性读取内容配置，得到 { title, preset, usedDefaultTitle, usedDefaultPreset }。
 * - title：zh 和 en 都有的双语值（校验器的规则），原样保留；其他情况（包括只有一种语言的标题）显示 DEFAULT_TITLE，
 *   保证所有可见文字都是双语。
 * - preset："typical-night"，唯一的预设；缺省时就是它，其他任何值也退回它（usedDefaultPreset 提示作者这个值没被读懂）。
 * 其他键（例如校验器对所有心理学组件都允许的 "prompt"）一律忽略。绝不抛错。
 */
export function normalizeSleepCycleConfig(config) {
  let title = null;
  let rawPreset;
  try {
    const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    title = readTitle(readKey(source, 'title'));
    rawPreset = readKey(source, 'preset');
  } catch {
    // Array.isArray throws on a revoked proxy; such a config is read as empty. 已撤销的代理会让 Array.isArray 抛错，这种配置按空配置处理。
    title = null;
    rawPreset = undefined;
  }
  const knownPreset = typeof rawPreset === 'string' && SLEEP_PRESETS.includes(rawPreset);
  return {
    title: title ?? { ...DEFAULT_TITLE },
    preset: knownPreset ? rawPreset : DEFAULT_PRESET,
    usedDefaultTitle: title === null,
    usedDefaultPreset: rawPreset !== undefined && !knownPreset,
  };
}

/* ---------- The night 一夜的数据 ---------- */

export const NIGHT_MINUTES = 480;
export const HALF_NIGHT = NIGHT_MINUTES / 2;
// Chart rows from top to bottom, the order of Figure 5.7 (W, R, N1, N2, N3). 图中从上到下的行，与图 5.7 的顺序一致。
export const STAGE_ORDER = Object.freeze(['W', 'REM', 'N1', 'N2', 'N3']);
const STAGE_SET = new Set(STAGE_ORDER);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

/**
 * The "typical-night" preset: 480 minutes in bed as contiguous stretches { stage, start, end } (minutes).
 * Five cycles of 91-98 minutes; N3 40, 32, 14, 6 and 0 minutes per cycle; REM periods of 10, 14, 18, 22 and 30
 * minutes; one brief awakening just after the fourth REM period, and waking up just after the fifth.
 * typical-night 预设：在床上的 480 分钟，写成首尾相接的若干段 { stage, start, end }（分钟）。5 个周期，每个 91-98 分钟；
 * 各周期的 N3 依次为 40、32、14、6、0 分钟；REM 期依次为 10、14、18、22、30 分钟；第 4 个 REM 期刚结束时短暂醒来一次，
 * 第 5 个 REM 期刚结束时醒来。
 */
export const TYPICAL_NIGHT = freezeDeep([
  { stage: 'W', start: 0, end: 6 },
  // Cycle 1: down through N1 and N2 to N3 twice (as in Figure 5.7), back up through N2, a 10-minute REM period.
  // 第 1 个周期：经过 N1、N2 两次沉到 N3（和图 5.7 一样），再经过 N2 往上，进入 10 分钟的 REM。
  { stage: 'N1', start: 6, end: 13 },
  { stage: 'N2', start: 13, end: 30 },
  { stage: 'N3', start: 30, end: 54 },
  { stage: 'N2', start: 54, end: 60 },
  { stage: 'N3', start: 60, end: 76 },
  { stage: 'N2', start: 76, end: 90 },
  { stage: 'REM', start: 90, end: 100 },
  // Cycle 2 第 2 个周期
  { stage: 'N1', start: 100, end: 105 },
  { stage: 'N2', start: 105, end: 125 },
  { stage: 'N3', start: 125, end: 157 },
  { stage: 'N2', start: 157, end: 177 },
  { stage: 'REM', start: 177, end: 191 },
  // Cycle 3 第 3 个周期
  { stage: 'N1', start: 191, end: 195 },
  { stage: 'N2', start: 195, end: 215 },
  { stage: 'N3', start: 215, end: 229 },
  { stage: 'N2', start: 229, end: 249 },
  { stage: 'N1', start: 249, end: 251 },
  { stage: 'N2', start: 251, end: 266 },
  { stage: 'REM', start: 266, end: 284 },
  // Cycle 4 第 4 个周期
  { stage: 'N1', start: 284, end: 287 },
  { stage: 'N2', start: 287, end: 307 },
  { stage: 'N3', start: 307, end: 313 },
  { stage: 'N2', start: 313, end: 333 },
  { stage: 'N1', start: 333, end: 336 },
  { stage: 'N2', start: 336, end: 354 },
  { stage: 'REM', start: 354, end: 376 },
  // Cycle 5 starts with a brief awakening just after the fourth REM period (p.176), then no N3 at all.
  // 第 5 个周期从第 4 个 REM 期刚结束时的短暂醒来开始（第 176 页），之后再也没有 N3。
  { stage: 'W', start: 376, end: 379 },
  { stage: 'N1', start: 379, end: 384 },
  { stage: 'N2', start: 384, end: 404 },
  { stage: 'N1', start: 404, end: 406 },
  { stage: 'N2', start: 406, end: 426 },
  { stage: 'N1', start: 426, end: 428 },
  { stage: 'N2', start: 428, end: 444 },
  { stage: 'REM', start: 444, end: 474 },
  { stage: 'W', start: 474, end: 480 },
]);

const PRESET_NIGHTS = Object.freeze({ 'typical-night': TYPICAL_NIGHT });

/** The stretches of a preset; an unknown preset gives the typical night. 预设对应的各段；未知预设给出典型的一夜。 */
export function nightSegments(preset = DEFAULT_PRESET) {
  return Object.hasOwn(PRESET_NIGHTS, preset) ? PRESET_NIGHTS[preset] : TYPICAL_NIGHT;
}

// The stretches a function works on: a non-empty list, or the typical night. 函数使用的各段：非空列表，否则用典型的一夜。
function listOf(segments) {
  return Array.isArray(segments) && segments.length ? segments : TYPICAL_NIGHT;
}

const lengthOf = (segment) => segment.end - segment.start;

/**
 * Checks that stretches start at 0, follow one another without gaps or overlaps, have positive lengths and
 * known stages, and never repeat the same stage twice in a row: { ok, problems }.
 * 检查各段是否从 0 开始、首尾相接（没有空隙或重叠）、长度为正、阶段已知，且相邻两段的阶段不同：{ ok, problems }。
 */
export function checkSegments(segments) {
  const problems = [];
  if (!Array.isArray(segments) || !segments.length) return { ok: false, problems: ['no stretches'] };
  segments.forEach((segment, index) => {
    const where = `stretch ${index}`;
    if (!segment || !STAGE_SET.has(segment.stage)) problems.push(`${where}: unknown stage`);
    if (!Number.isFinite(segment?.start) || !Number.isFinite(segment?.end) || !(segment.end > segment.start)) {
      problems.push(`${where}: needs start < end`);
    }
    const expectedStart = index === 0 ? 0 : segments[index - 1]?.end;
    if (segment?.start !== expectedStart) problems.push(`${where}: starts at ${segment?.start}, expected ${expectedStart}`);
    if (index > 0 && segment?.stage === segments[index - 1]?.stage) problems.push(`${where}: repeats ${segment.stage}`);
  });
  return { ok: problems.length === 0, problems };
}

/** The last minute of the night drawn by `segments`. 这些段画出的一夜的最后一分钟。 */
export function nightLength(segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  return list[list.length - 1].end;
}

/** A minute inside the night: numeric strings count, anything else is 0. 夜晚范围内的分钟数：数字字符串也算，其余为 0。 */
export function clampMinute(value, total = NIGHT_MINUTES) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return 0;
  return Math.min(total, Math.max(0, number));
}

/**
 * Index of the stretch at `minute`: a stretch holds its start but not its end, and the very end of the night
 * belongs to the last stretch.
 * `minute` 所在那一段的下标：每一段包含起点、不含终点；夜晚的最后一刻属于最后一段。
 */
export function segmentIndexAt(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const at = clampMinute(minute, nightLength(list));
  const index = list.findIndex((segment) => at >= segment.start && at < segment.end);
  return index >= 0 ? index : list.length - 1;
}

/**
 * The stretch at `minute`: { stage, start, end, minutes, index } (a new object each time).
 * `minute` 所在的那一段：{ stage, start, end, minutes, index }（每次返回新对象）。
 */
export function stageAt(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const index = segmentIndexAt(minute, list);
  const segment = list[index];
  return { stage: segment.stage, start: segment.start, end: segment.end, minutes: lengthOf(segment), index };
}

/** Minutes of `stage` between `from` and `to`. from 到 to 之间 stage 阶段的分钟数。 */
export function minutesBetween(stage, from, to, segments = TYPICAL_NIGHT) {
  return listOf(segments)
    .filter((segment) => segment.stage === stage)
    .reduce((sum, segment) => sum + Math.max(0, Math.min(to, segment.end) - Math.max(from, segment.start)), 0);
}

const percentOf = (part, whole) => (whole > 0 ? (100 * part) / whole : 0);

/**
 * Time in each stage: { night, sleep, stages: { W, REM, N1, N2, N3 }, light }, where each stage holds
 * { minutes, percentOfNight, percentOfSleep } (W has no share of sleep: null) and light is N1 + N2, the
 * textbook's "light sleep" (p.175). Shares of sleep leave the minutes awake out, as the textbook's 60/20/20 does.
 * 每个阶段的时间：{ night, sleep, stages: { W, REM, N1, N2, N3 }, light }；每个阶段为 { minutes, percentOfNight,
 * percentOfSleep }（W 不占睡眠的百分比：null），light 是 N1 + N2，即教材说的“浅睡眠”（第 175 页）。
 * 占睡眠的百分比不算醒着的时间，与教材的 60/20/20 一致。
 */
export function stageTotals(segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const night = nightLength(list);
  const minutes = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0]));
  for (const segment of list) minutes[segment.stage] += lengthOf(segment);
  const sleep = night - minutes.W;
  const stages = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, {
    minutes: minutes[stage],
    percentOfNight: percentOf(minutes[stage], night),
    percentOfSleep: stage === 'W' ? null : percentOf(minutes[stage], sleep),
  }]));
  const light = minutes.N1 + minutes.N2;
  return { night, sleep, stages, light: { minutes: light, percentOfSleep: percentOf(light, sleep) } };
}

/**
 * The REM periods in order: [{ number, start, end, minutes, index }] (index = position among the stretches).
 * 按顺序列出的 REM 期：[{ number, start, end, minutes, index }]（index 为它在各段中的位置）。
 */
export function remPeriods(segments = TYPICAL_NIGHT) {
  const periods = [];
  listOf(segments).forEach((segment, index) => {
    if (segment.stage === 'REM') {
      periods.push({ number: periods.length + 1, start: segment.start, end: segment.end, minutes: lengthOf(segment), index });
    }
  });
  return periods;
}

/**
 * The sleep cycles: the first starts when sleep begins, and every cycle ends when its REM period ends, so the
 * next one starts there (a brief awakening after a REM period opens the next cycle):
 * [{ number, start, end, minutes, remMinutes, n3Minutes }].
 * 睡眠周期：第一个从入睡开始；每个周期在它的 REM 期结束时结束，下一个周期从那里开始（REM 之后的短暂醒来算在下一个周期的开头）：
 * [{ number, start, end, minutes, remMinutes, n3Minutes }]。
 */
export function cycleBoundaries(segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const onset = list.find((segment) => segment.stage !== 'W');
  if (!onset) return [];
  let start = onset.start;
  return remPeriods(list).map((period) => {
    const cycle = {
      number: period.number,
      start,
      end: period.end,
      minutes: period.end - start,
      remMinutes: period.minutes,
      n3Minutes: minutesBetween('N3', start, period.end, list),
    };
    start = period.end;
    return cycle;
  });
}

/** The number of the cycle at `minute`, or null before sleep and after the last cycle. 该时刻所在的周期编号；入睡前和最后一个周期之后为 null。 */
export function cycleAt(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const at = clampMinute(minute, nightLength(list));
  const cycle = cycleBoundaries(list).find((item) => at >= item.start && at < item.end);
  return cycle ? cycle.number : null;
}

/**
 * The figures of the summary row: { cycleCount, cycleMinutes { min, max }, remLengths, remGrows, n3 { first,
 * second }, rem { first, second }, totals, shares { light, N3, REM } } where halves are the first and last
 * 4 hours of the night and shares are whole percentages of sleep.
 * 汇总行用到的数字：{ cycleCount, cycleMinutes { min, max }, remLengths, remGrows, n3 { first, second },
 * rem { first, second }, totals, shares { light, N3, REM } }；前后两半指一夜的前 4 小时和后 4 小时，shares 为占睡眠的整数百分比。
 */
export function nightSummary(segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const night = nightLength(list);
  const half = night / 2;
  const cycles = cycleBoundaries(list);
  const remLengths = remPeriods(list).map((period) => period.minutes);
  const totals = stageTotals(list);
  const lengths = cycles.map((cycle) => cycle.minutes);
  return {
    cycleCount: cycles.length,
    cycleMinutes: { min: lengths.length ? Math.min(...lengths) : 0, max: lengths.length ? Math.max(...lengths) : 0 },
    remLengths,
    remGrows: remLengths.every((length, index) => index === 0 || length > remLengths[index - 1]),
    n3: { first: minutesBetween('N3', 0, half, list), second: minutesBetween('N3', half, night, list) },
    rem: { first: minutesBetween('REM', 0, half, list), second: minutesBetween('REM', half, night, list) },
    totals,
    shares: {
      light: Math.round(totals.light.percentOfSleep),
      N3: Math.round(totals.stages.N3.percentOfSleep),
      REM: Math.round(totals.stages.REM.percentOfSleep),
    },
  };
}

/* ---------- Moving the cursor 移动光标 ---------- */

/**
 * Where the "previous" or "next" stretch button goes: { minute, index, moved }, the start of the neighbouring
 * stretch (direction -1 or +1). At either end of the night the cursor stays where it is (moved: false).
 * “上一段/下一段”按钮的目标：相邻那一段的起点 { minute, index, moved }（direction 为 -1 或 +1）。到了一夜的两端，光标留在原处（moved 为 false）。
 */
export function stepStretch(minute, direction, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const current = segmentIndexAt(minute, list);
  const index = Math.min(list.length - 1, Math.max(0, current + (direction < 0 ? -1 : 1)));
  if (index === current) return { minute: clampMinute(minute, nightLength(list)), index, moved: false };
  return { minute: list[index].start, index, moved: true };
}

/**
 * Start of the next REM period after the stretch at `minute`; after the last one it wraps to the first:
 * { minute, number, wrapped }.
 * `minute` 所在那一段之后的下一个 REM 期的起点；过了最后一个就回到第一个：{ minute, number, wrapped }。
 */
export function nextRemStart(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const periods = remPeriods(list);
  if (!periods.length) return { minute: clampMinute(minute, nightLength(list)), number: null, wrapped: false };
  const current = segmentIndexAt(minute, list);
  const next = periods.find((period) => period.index > current);
  return next
    ? { minute: next.start, number: next.number, wrapped: false }
    : { minute: periods[0].start, number: periods[0].number, wrapped: true };
}

/* ---------- Stage and wave facts 阶段与脑电波的知识点 ---------- */

// Sources shown under the facts: textbook pages, a figure, or the lecture slides.
// 知识点下方显示的出处：教材页码、教材图或讲课幻灯片。
function textbook(pages) {
  const several = String(pages).includes('–');
  return { zh: `教材第 ${pages} 页`, en: `Textbook ${several ? 'pp.' : 'p.'} ${pages}` };
}

function figure(number, page) {
  return { zh: `教材图 ${number}（第 ${page} 页）`, en: `Textbook Figure ${number} (p. ${page})` };
}

const LECTURE_REM_SLIDE = {
  zh: '讲课幻灯片 Consciousness 第 9 张；教材第 203 页 Quiz Yourself（LO2 第 2 题）',
  en: 'Lecture slides, Consciousness, slide 9; textbook p. 203, Quiz Yourself (LO2, question 2)',
};
// REM's waves: the textbook text (p.174), its own quiz (p.203) and the lecture slide. REM 的脑电波：教材正文、教材自测题与讲课幻灯片。
const REM_WAVE_SOURCE = {
  zh: '教材第 174 页；第 203 页 Quiz Yourself（LO2 第 2 题）；讲课幻灯片 Consciousness 第 9 张',
  en: 'Textbook p. 174; p. 203, Quiz Yourself (LO2, question 2); lecture slides, Consciousness, slide 9',
};

/** The page range of the widget's sources, for the illustration note. 组件出处的页码范围，用在简化示意的说明里。 */
export const SOURCE_PAGES = '173–179';

/**
 * The EEG waves the textbook names (p.174 and Figure 5.5), with REM's "fast waves similar to those of relaxed
 * wakefulness" as their own entry.
 * 教材提到的脑电波（第 174 页与图 5.5）；REM 的“和放松清醒时相似的快波”单独列为一项。
 */
export const WAVES = freezeDeep({
  beta: {
    name: { zh: 'beta 波', en: 'beta waves' },
    text: {
      zh: '专心、警觉时出现：频率最高、波幅最低，而且不同步（desynchronous），没有固定的规律。',
      en: 'Concentration and alertness: the highest frequency, the lowest amplitude, and desynchronous (no consistent pattern).',
    },
    source: textbook('174'),
  },
  alpha: {
    name: { zh: 'alpha 波', en: 'alpha waves' },
    text: {
      zh: '放松或犯困、但还醒着时出现：比 beta 波慢、波幅更大、更同步（synchronous，更规律）。冥想时和快睡着之前也有。',
      en: 'Relaxed or drowsy but still awake: slower, larger and more synchronous (regular) than beta waves; also present during meditation and just before we fall asleep.',
    },
    source: textbook('174'),
  },
  theta: {
    name: { zh: 'theta 波', en: 'theta waves' },
    text: {
      zh: '比 alpha 波频率更低、波幅更大。N1 的脑电波就是 theta 波，到了 N2 还会继续出现。',
      en: 'Slower in frequency and greater in amplitude than alpha waves. They mark N1 and continue into N2.',
    },
    source: textbook('174'),
  },
  spindles: {
    name: { zh: '睡眠纺锤波', en: 'sleep spindles' },
    text: {
      zh: '突然冒出的一阵高频波，夹在 theta 波中间，是 N2 的标志。',
      en: 'A sudden burst of high-frequency waves among the theta waves: the defining characteristic of N2.',
    },
    source: textbook('174'),
  },
  delta: {
    name: { zh: 'delta 波', en: 'delta waves' },
    text: {
      zh: '睡眠中最慢、波幅最高的脑电波：又大又慢。',
      en: 'The slowest and highest-amplitude brain waves during sleep: large, slow waves.',
    },
    source: textbook('174'),
  },
  rem: {
    name: { zh: 'REM 的快波', en: 'fast REM waves' },
    text: {
      zh: '快波，和放松清醒时的脑电波相似（教材正文）。讲课幻灯片和教材第 5 章 Quiz Yourself 的答案都说是 beta 波，考试答 beta。',
      en: 'Fast waves similar to those of relaxed wakefulness (textbook text). The lecture slides and the answer to the textbook\'s Chapter 5 Quiz Yourself both say beta waves, so answer beta on a test.',
    },
    source: REM_WAVE_SOURCE,
  },
});

/** Captions of the drawn EEG traces. 示意脑电波形的标题。 */
export const TRACE_LABELS = freezeDeep({
  beta: { zh: '警觉时：beta 波', en: 'Alert: beta waves' },
  alpha: { zh: '放松时：alpha 波', en: 'Relaxed: alpha waves' },
  theta: { zh: 'N1：theta 波', en: 'N1: theta waves' },
  spindles: { zh: 'N2：theta 波中夹着睡眠纺锤波（浅色区域）', en: 'N2: theta waves with sleep spindles (shaded)' },
  delta: { zh: 'N3：delta 波', en: 'N3: delta waves' },
  rem: { zh: 'REM：快波，像放松清醒时', en: 'REM: fast waves, like relaxed wakefulness' },
});

// Non-REM sleep in general (p.174-175), listed under each of N1, N2 and N3. 非快速眼动睡眠的共同点（第 174-175 页），列在 N1、N2、N3 下面。
const NON_REM_FACT = {
  zh: '非快速眼动睡眠（non-REM sleep）没有快速眼动，也很少做梦：这几期也会做梦，但次数相对少，醒来也不太记得。',
  en: 'Non-REM sleep has no rapid eye movements and little dreaming: dreams do occur, but less often, and we are less likely to remember them.',
  source: textbook('174–175'),
};

/**
 * Every stage: { id, name, short, waves, traces, facts: [{ zh, en, source }], exam: { en, zh } }. `name` is the
 * panel title, `short` the plain name used in the slider text and announcements, `waves` the WAVES entries the
 * stage shows, `traces` the EEG drawings, and `exam` an English sentence to write on a test with its gloss.
 * 每个阶段：{ id, name, short, waves, traces, facts: [{ zh, en, source }], exam: { en, zh } }。name 是面板标题，
 * short 是滑块文字和播报里用的简称，waves 是要显示的 WAVES 条目，traces 是示意脑电波形，exam 是考试时可以写的英文句子及中文释义。
 */
export const STAGE_INFO = freezeDeep({
  W: {
    id: 'W',
    name: { zh: 'W 期：清醒', en: 'Stage W: wake' },
    short: { zh: 'W 期（清醒）', en: 'stage W (awake)' },
    waves: ['beta', 'alpha'],
    traces: ['beta', 'alpha'],
    facts: [
      {
        zh: 'W 代表 wake（清醒）。醒着的时候，脑电图（EEG）上有两种波：**beta 波**和 **alpha 波**。',
        en: 'The "W" stands for wake. While we are awake, the EEG shows two types of waves: **beta** and **alpha**.',
        source: textbook('174'),
      },
      {
        zh: '专心、警觉的时候是 beta 波：频率最高、波幅最低，没有固定的规律。',
        en: 'Beta waves reflect concentration and alertness: the highest frequency and lowest amplitude, with no consistent pattern.',
        source: textbook('174'),
      },
      {
        zh: '放松但还醒着的时候，脑电波变慢、波幅变大、更规律，这就是 alpha 波；快睡着之前也会出现。',
        en: 'When we are relaxed but still awake, the waves slow down, grow in amplitude and become more regular: alpha waves, also present just before we fall asleep.',
        source: textbook('174'),
      },
    ],
    exam: {
      en: 'Stage W is wakefulness: beta waves when we are alert, alpha waves when we are relaxed or drowsy.',
      zh: 'W 期就是清醒：警觉时是 beta 波，放松或犯困时是 alpha 波。',
    },
  },
  N1: {
    id: 'N1',
    name: { zh: 'N1 期：非快速眼动 1 期', en: 'Stage N1 (non-REM1)' },
    short: { zh: 'N1 期', en: 'stage N1' },
    waves: ['theta'],
    traces: ['theta'],
    facts: [
      {
        zh: '刚要睡着时，人进入非快速眼动睡眠的第一期 N1：迷迷糊糊的浅睡眠。N 代表 non（非）：这一期没有快速眼动。',
        en: 'People just falling asleep enter N1, the first stage of non-REM sleep: drowsy sleep. The "N" means "non": no rapid eye movements occur.',
        source: textbook('174'),
      },
      {
        zh: '可能突然抽动一下，叫**肌阵挛抽动**（**myoclonic jerks**），入睡时的这种抽动也叫 **hypnic jerks**，常常伴随“往下掉”的感觉。',
        en: 'Sudden muscle movements called **myoclonic jerks**, or **hypnic jerks**, may occur, often with a feeling of falling.',
        source: textbook('174'),
      },
      {
        zh: '脑电波是 **theta 波**：比 alpha 波频率更低、波幅更大。从放松清醒到 N1 的变化是逐渐的。',
        en: 'The EEG shows **theta waves**, slower in frequency and greater in amplitude than alpha waves. The change from being relaxed to N1 is gradual.',
        source: textbook('174'),
      },
      {
        zh: '图 5.5：浅睡眠，一次最长约 10 分钟。',
        en: 'Figure 5.5: light sleep lasting up to 10 minutes.',
        source: figure('5.5', '175'),
      },
      {
        zh: 'N1 和 N2 都是比较浅的睡眠：这时被叫醒，人常常说自己根本没睡着。',
        en: 'N1 and N2 are both relatively light sleep: people woken now often report not having been asleep at all.',
        source: textbook('174'),
      },
      NON_REM_FACT,
    ],
    exam: {
      en: 'Stage N1 is drowsy, light sleep with theta waves; hypnic jerks and a feeling of falling may occur.',
      zh: 'N1 期是迷迷糊糊的浅睡眠，脑电波是 theta 波；可能突然抽动、觉得往下掉。',
    },
  },
  N2: {
    id: 'N2',
    name: { zh: 'N2 期：非快速眼动 2 期', en: 'Stage N2 (non-REM2)' },
    short: { zh: 'N2 期', en: 'stage N2' },
    waves: ['theta', 'spindles'],
    traces: ['spindles'],
    facts: [
      {
        zh: '肌肉活动减少，人不再有意识地察觉周围环境。',
        en: 'Muscle activity decreases, and the person is no longer consciously aware of the environment.',
        source: textbook('174'),
      },
      {
        zh: 'theta 波继续出现，中间夹着 N2 的标志：**睡眠纺锤波**（**sleep spindles**），也就是突然冒出的一阵高频波。',
        en: 'Theta waves continue, interspersed with the defining characteristic of N2: **sleep spindles**, sudden bursts of high-frequency waves.',
        source: textbook('174'),
      },
      {
        zh: '图 5.5：比 N1 更深的睡眠，偶尔出现睡眠纺锤波，一次最长约 20 分钟。',
        en: 'Figure 5.5: deeper sleep with occasional sleep spindles, lasting up to 20 minutes.',
        source: figure('5.5', '175'),
      },
      {
        zh: 'N1 和 N2 都是比较浅的睡眠：这时被叫醒，人常常说自己根本没睡着。所以你睡着的时间可能比你以为的多。',
        en: 'N1 and N2 are both relatively light sleep: people woken now often report not having been asleep at all, so you may have slept more than you think.',
        source: textbook('174'),
      },
      {
        zh: '**梦游**（**somnambulism**）发生在 N2 和 N3，通常在前半夜，这时人不太可能在做梦。',
        en: '**Sleepwalking** (**somnambulism**) takes place during stages N2 and N3, usually early in the night, when a person is unlikely to be dreaming.',
        source: textbook('178'),
      },
      NON_REM_FACT,
    ],
    exam: {
      en: 'Stage N2 is relatively light sleep marked by sleep spindles, bursts of high-frequency waves; muscle activity decreases.',
      zh: 'N2 期是比较浅的睡眠，标志是睡眠纺锤波（一阵阵高频波）；肌肉活动减少。',
    },
  },
  N3: {
    id: 'N3',
    name: { zh: 'N3 期：非快速眼动 3 期（深睡眠）', en: 'Stage N3 (non-REM3): deep sleep' },
    short: { zh: 'N3 期', en: 'stage N3' },
    waves: ['delta'],
    traces: ['delta'],
    facts: [
      {
        zh: '脑电波是 **delta 波**：睡眠中最慢、波幅最高的脑电波。',
        en: 'The EEG shows **delta waves**, the slowest and highest-amplitude brain waves during sleep.',
        source: textbook('174'),
      },
      {
        zh: 'delta 睡眠是最深的睡眠，这时的脑电波和清醒时最不像。它也叫**慢波睡眠**（**slow-wave sleep**）。',
        en: 'Delta sleep is our deepest sleep, when brain waves are least like those of wakefulness. It is also called **slow-wave sleep**.',
        source: textbook('174'),
      },
      {
        zh: '很难叫醒；被叫醒时人通常迷迷糊糊、搞不清方向。',
        en: 'The sleeper is difficult to rouse; people woken in N3 are usually confused and disoriented.',
        source: textbook('174–175'),
      },
      {
        zh: '儿童尿床、梦游和说梦话都发生在这一期。',
        en: 'Bedwetting (in children), sleepwalking and sleep talking occur in this stage.',
        source: textbook('174'),
      },
      {
        zh: '**夜惊**（**night terrors**）发生在慢波的 N3（非快速眼动）睡眠；**噩梦**（**nightmares**）则是把人从 REM 睡眠中惊醒的可怕的梦。',
        en: '**Night terrors** occur during slow-wave stage N3 (non-REM) sleep, unlike **nightmares**, which awaken a dreamer from REM sleep.',
        source: textbook('179'),
      },
      {
        zh: '入睡后，网状结构（reticular formation）送往前脑的神经递质越来越少，在 N3 降到最低。',
        en: 'As sleep begins, the neurotransmitters the reticular formation sends to the forebrain keep falling until they reach their lowest levels in N3.',
        source: textbook('176'),
      },
      NON_REM_FACT,
    ],
    exam: {
      en: 'Stage N3 is deep, slow-wave sleep with delta waves; the sleeper is difficult to rouse.',
      zh: 'N3 期是深的慢波睡眠，脑电波是 delta 波；很难把人叫醒。',
    },
  },
  REM: {
    id: 'REM',
    name: { zh: 'R 期：REM 睡眠（快速眼动睡眠）', en: 'Stage R: REM (rapid eye movement) sleep' },
    short: { zh: 'REM 睡眠', en: 'REM sleep' },
    waves: ['rem'],
    traces: ['rem'],
    facts: [
      {
        zh: '经过 N1 到 N3 以后，人会往上“浮”回较浅的阶段，但不会重新进入 N1，而是进入 R 期，也就是 **REM（快速眼动）睡眠**。',
        en: 'After N1 to N3, sleepers drift up toward wakefulness, but instead of re-entering N1 they enter stage R, **REM (rapid eye movement) sleep**.',
        source: textbook('174'),
      },
      {
        zh: 'REM 睡眠是一种活跃的睡眠，最生动的梦发生在这一期。',
        en: 'REM sleep is an active stage of sleep during which the most vivid dreaming occurs.',
        source: textbook('174'),
      },
      {
        zh: '脑电波是快波，和放松清醒时的脑电波相似；眼球上下、左右快速转动。',
        en: 'The EEG shows fast waves similar to those of relaxed wakefulness, and the eyes move up and down and from left to right.',
        source: textbook('174'),
      },
      {
        zh: '在 REM 期被叫醒，人比在其他任何阶段都更可能说自己在做梦；REM 期越长，越可能报告做梦。',
        en: 'People woken during REM are more likely to report dreaming than at any other stage, and the longer the REM period, the more likely.',
        source: textbook('175'),
      },
      {
        zh: '一夜中第一个 REM 期可能只有约 10 分钟，最后一个可能长达 1 小时。',
        en: "The night's first REM period might last only about 10 minutes; the final one might go on for as long as an hour.",
        source: textbook('175'),
      },
      {
        zh: '乙酰胆碱（acetylcholine）升高会启动 REM：大脑皮层被激活，大脑其他部分相对不活跃。血清素和去甲肾上腺素升高时，REM 结束。',
        en: 'A rise in acetylcholine starts REM sleep, activating the cerebral cortex while the rest of the brain stays relatively inactive; REM ends when serotonin and norepinephrine rise.',
        source: textbook('176'),
      },
      {
        zh: '讲课幻灯片说：REM 的脑电图和清醒时相似，是 **beta 波**；还列出自主神经系统活动增加、肌肉运动麻痹（膈肌除外）。教材正文没有点名是哪种波，但第 5 章 Quiz Yourself 的答案也是 beta；后两点教材没有讲。题目问 REM 是什么波时，选 beta。',
        en: 'The lecture slides say the REM EEG resembles the awake state (**beta waves**) and add increased autonomic nervous system activity and motor paralysis (except for the diaphragm). The textbook text names no wave type, but the answer to its Chapter 5 Quiz Yourself is also beta; the textbook does not mention the last two. If a question asks which waves characterize REM, choose beta.',
        source: LECTURE_REM_SLIDE,
      },
    ],
    exam: {
      en: 'REM sleep is an active stage of sleep with rapid eye movements, fast EEG waves similar to relaxed wakefulness (beta waves), and the most vivid dreams.',
      zh: 'REM 睡眠是一种活跃的睡眠：眼球快速转动，脑电波快、像放松清醒时（beta 波），最生动的梦发生在这一期。',
    },
  },
});

/** Facts of a stage; an unknown stage gives W. 某个阶段的知识点；未知阶段给出 W。 */
export function stageInfo(stage) {
  return Object.hasOwn(STAGE_INFO, stage) ? STAGE_INFO[stage] : STAGE_INFO.W;
}

/* ---------- Text 文字 ---------- */

/** A moment of the night as hours and minutes since going to bed: "2 h 15 min", "2 小时 15 分". 上床后的时刻：几小时几分。 */
export function formatClock(minute) {
  const total = Math.round(clampMinute(minute, Number.MAX_SAFE_INTEGER));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return { zh: `${hours} 小时 ${minutes} 分`, en: `${hours} h ${minutes} min` };
}

/** A length of time in minutes: "18 min", "18 分钟". 以分钟计的时长。 */
export function formatLength(minutes) {
  const value = Math.round(clampMinute(minutes, Number.MAX_SAFE_INTEGER));
  return { zh: `${value} 分钟`, en: `${value} min` };
}

/** Numbers joined by arrows: "10 → 14 → 18". 用箭头连起来的数。 */
export function arrowList(values) {
  return (Array.isArray(values) ? values : []).join(' → ');
}

/**
 * aria-valuetext of the time slider, Chinese then English: "2 小时 15 分：N3 期。2 h 15 min: stage N3".
 * 时间滑块的 aria-valuetext，先中文后英文。
 */
export function sliderValueText(minute, segments = TYPICAL_NIGHT) {
  const clock = formatClock(clampMinute(minute, nightLength(segments)));
  const info = stageInfo(stageAt(minute, segments).stage);
  return `${clock.zh}：${info.short.zh}。${clock.en}: ${info.short.en}`;
}

/** Which cycle a moment belongs to, in words. 某个时刻属于第几个周期（文字）。 */
export function cycleText(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const number = cycleAt(minute, list);
  if (number !== null) return { zh: `第 ${number} 个睡眠周期`, en: `sleep cycle ${number}` };
  const onset = list.find((segment) => segment.stage !== 'W');
  return clampMinute(minute, nightLength(list)) < (onset ? onset.start : 0)
    ? { zh: '还没睡着', en: 'before falling asleep' }
    : { zh: '最后一个周期之后', en: 'after the last cycle' };
}

/**
 * The stretch under the cursor in words: "1 小时 0 分 – 1 小时 16 分，共 16 分钟" / "1 h 0 min – 1 h 16 min, 16 min".
 * 光标所在那一段的文字说明。
 */
export function stretchText(minute, segments = TYPICAL_NIGHT) {
  const stretch = stageAt(minute, segments);
  const from = formatClock(stretch.start);
  const to = formatClock(stretch.end);
  const length = formatLength(stretch.minutes);
  return { zh: `${from.zh} – ${to.zh}，共 ${length.zh}`, en: `${from.en} – ${to.en}, ${length.en}` };
}

/**
 * Notes about this particular stretch, beyond the stage facts: falling asleep, the climb back to REM, which half
 * of the night an N3 stretch is in, how this REM period compares with the others, the brief awakening and
 * waking up. Each note is { zh, en }.
 * 这一段本身的说明（阶段知识点之外）：入睡、往上回到 REM、N3 在前半夜还是后半夜、这个 REM 期和其他 REM 期比较、短暂醒来与醒来。每条为 { zh, en }。
 */
export function stretchNotes(minute, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const stretch = stageAt(minute, list);
  const before = list[stretch.index - 1] ?? null;
  const after = list[stretch.index + 1] ?? null;
  const night = nightLength(list);
  const notes = [];
  if (stretch.stage === 'W') {
    if (!before) {
      notes.push({
        zh: '还没睡着：躺在床上放松，脑电波以 alpha 波为主，快睡着之前就会出现 alpha 波。',
        en: 'Not asleep yet: relaxing in bed with alpha waves, which appear just before we fall asleep.',
      });
    } else if (before.stage === 'REM' && after) {
      notes.push({
        zh: '短暂醒来，刚好在一个 REM 期结束之后。没有闹钟打扰时，人最可能在 REM 期刚结束时醒来；没醒的话，就进入下一个周期。',
        en: 'A brief awakening just after a REM period. Without an alarm, we are most likely to wake up just after a REM period; if we do not, another sleep cycle begins.',
      });
    } else if (!after) {
      notes.push({
        zh: before.stage === 'REM' ? '醒来：最后一个、也是最长的 REM 期刚刚结束。' : '醒来：这一夜的睡眠结束了。',
        en: before.stage === 'REM' ? 'Waking up just after the last and longest REM period.' : 'Waking up: the night of sleep is over.',
      });
    } else {
      notes.push({ zh: '短暂醒来。', en: 'A brief awakening.' });
    }
  } else if (stretch.stage === 'N1') {
    if (!before || before.stage === 'W') {
      notes.push({ zh: '正在入睡：从放松清醒到 N1 是逐渐变化的。', en: 'Falling asleep: the change from being relaxed to N1 is gradual.' });
    } else if (before.stage === 'REM') {
      notes.push({ zh: 'REM 期结束了：新的周期从浅睡眠 N1 开始。', en: 'The REM period is over: a new cycle starts in light sleep (N1).' });
    } else {
      notes.push({ zh: '睡眠短暂变浅，回到 N1。', en: 'Sleep briefly gets lighter again: back in N1.' });
    }
  } else if (stretch.stage === 'N2' && after?.stage === 'REM') {
    notes.push({
      zh: '往上“浮”：这段 N2 之后直接进入 REM，不会重新进入 N1。',
      en: 'Drifting up: after this N2 stretch the sleeper enters REM instead of re-entering N1.',
    });
  } else if (stretch.stage === 'N3') {
    notes.push(stretch.start < night / 2
      ? { zh: '这是前半夜：深睡眠（N3）主要集中在前半夜。', en: 'First half of the night: this is when most deep sleep (N3) happens.' }
      : { zh: '这是后半夜：后半夜的 N3 比前半夜少得多。', en: 'Second half of the night: there is much less N3 now than in the first half.' });
  } else if (stretch.stage === 'REM') {
    const periods = remPeriods(list);
    const position = periods.findIndex((period) => period.index === stretch.index);
    const period = periods[position];
    const count = periods.length;
    notes.push({
      zh: `这是第 ${period.number} 个 REM 期（共 ${count} 个），长 ${period.minutes} 分钟。`,
      en: `This is REM period ${period.number} of ${count}: ${period.minutes} min long.`,
    });
    if (position === 0) {
      notes.push({
        zh: '第一个 REM 期最短：教材说它可能只有 10 分钟。',
        en: 'The first REM period is the shortest: the textbook says it might last only 10 minutes.',
      });
    } else {
      const longer = period.minutes - periods[position - 1].minutes;
      notes.push(longer > 0
        ? { zh: `比上一个 REM 期长 ${longer} 分钟：REM 期越来越长。`, en: `${longer} min longer than the previous REM period: REM keeps getting longer.` }
        : { zh: '和上一个 REM 期一样长或更短。', en: 'No longer than the previous REM period.' });
    }
    if (position === count - 1 && count > 1) {
      notes.push({
        zh: '最后一个 REM 期最长：教材说它可能长达 1 小时。',
        en: 'The last REM period is the longest: the textbook says it might go on for as long as an hour.',
      });
    }
  }
  return notes;
}

/**
 * What the live region says after a button or a tap on the chart moves the cursor, Chinese then English.
 * 按钮或点按图表移动光标后，朗读区域播报的内容（先中文后英文）。
 */
export function announcement(minute, segments = TYPICAL_NIGHT) {
  const stretch = stageAt(minute, segments);
  const clock = formatClock(clampMinute(minute, nightLength(segments)));
  const info = stageInfo(stretch.stage);
  const length = formatLength(stretch.minutes);
  return `${clock.zh}：${info.short.zh}，这一段 ${length.zh}。${clock.en}: ${info.short.en}, this stretch ${length.en}.`;
}

/**
 * Text alternative of the hypnogram, built from the data: { zh, en }.
 * 睡眠图的文字说明，由数据生成：{ zh, en }。
 */
export function chartDescription(segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const summary = nightSummary(list);
  const hours = nightLength(list) / 60;
  const onset = list.find((segment) => segment.stage !== 'W');
  const awake = onset ? onset.start : 0;
  const rem = arrowList(summary.remLengths);
  const { min, max } = summary.cycleMinutes;
  return {
    zh: `睡眠图（简化示意）：上床后 ${hours} 小时。先清醒 ${awake} 分钟，然后是 ${summary.cycleCount} 个睡眠周期，每个 ${min}–${max} 分钟。`
      + `N3 前 4 小时共 ${summary.n3.first} 分钟，后 4 小时 ${summary.n3.second} 分钟。REM 期依次为 ${rem} 分钟。最后一个 REM 期结束后醒来。`,
    en: `Hypnogram (simplified illustration) of ${hours} hours in bed: awake for ${awake} min, then ${summary.cycleCount} sleep cycles of ${min}–${max} min. `
      + `N3: ${summary.n3.first} min in the first 4 hours, ${summary.n3.second} min in the last 4. REM periods: ${rem} min. Waking up after the last REM period.`,
  };
}

/**
 * The textbook's numbers that the summary compares the night with (p.175, Figure 5.5).
 * 汇总时拿来和这一夜比较的教材数字（第 175 页、图 5.5）。
 */
export const TEXTBOOK = freezeDeep({
  cycleMinutes: { min: 90, max: 100 },
  firstRemMinutes: 10,
  lastRemMaxMinutes: 60,
  n1MaxMinutes: 10,
  n2MaxMinutes: 20,
  shares: { light: 60, N3: 20, REM: 20 },
});

const SHARE_LABELS = freezeDeep({
  light: { zh: '浅睡眠（N1 + N2）', en: 'light sleep' },
  N3: { zh: '深睡眠（N3）', en: 'deep sleep' },
  REM: { zh: '快速眼动睡眠', en: 'REM sleep' },
});

/**
 * Numbers of the small bar charts in the summary row, each bar { id, label, minutes } or { id, label, percent }:
 * cycles (the length of each cycle), n3 (the two halves of the night), rem (each REM period), and shares
 * { night, textbook } (light sleep, N3 and REM as percentages of sleep).
 * 汇总行小条形图的数字，每根条为 { id, label, minutes } 或 { id, label, percent }：cycles（每个周期的长度）、
 * n3（前后两半夜）、rem（每个 REM 期）、shares { night, textbook }（浅睡眠、N3、REM 占睡眠的百分比）。
 */
export function summaryBars(summary = nightSummary(), segments = TYPICAL_NIGHT) {
  const halfHours = summary.totals.night / 2 / 60;
  const share = (source) => ['light', 'N3', 'REM'].map((id) => ({ id, label: SHARE_LABELS[id], percent: source[id] }));
  return {
    cycles: cycleBoundaries(segments).map((cycle) => ({
      id: `cycle-${cycle.number}`,
      label: { zh: `第 ${cycle.number} 个`, en: `cycle ${cycle.number}` },
      minutes: cycle.minutes,
    })),
    n3: [
      { id: 'first', label: { zh: `前 ${halfHours} 小时`, en: `first ${halfHours} h` }, minutes: summary.n3.first },
      { id: 'second', label: { zh: `后 ${halfHours} 小时`, en: `last ${halfHours} h` }, minutes: summary.n3.second },
    ],
    rem: summary.remLengths.map((minutes, index) => ({
      id: `rem-${index + 1}`,
      label: { zh: `第 ${index + 1} 个`, en: `REM ${index + 1}` },
      minutes,
    })),
    shares: {
      night: share(summary.shares),
      textbook: share(TEXTBOOK.shares),
    },
  };
}

/** Row labels of the two share bars. 两条比例条的行标签。 */
export const SHARE_ROWS = freezeDeep({
  night: { zh: '这一夜', en: 'this night' },
  textbook: { zh: '教材', en: 'textbook' },
});

/**
 * Sentences of the summary row, all built from nightSummary(segments): one tile per pattern, each
 * { title, text, textbook } of Bi values, plus the closing sentence.
 * 汇总行的句子，全部由 nightSummary(segments) 生成：每种规律一块，每块为双语的 { title, text, textbook }，另有一句总结。
 */
export function summaryTexts(summary = nightSummary()) {
  const { min, max } = summary.cycleMinutes;
  const rem = arrowList(summary.remLengths);
  const halfHours = summary.totals.night / 2 / 60;
  return {
    cycles: {
      title: { zh: '睡眠周期', en: 'Sleep cycles' },
      text: { zh: `这一夜有 ${summary.cycleCount} 个周期，每个 ${min}–${max} 分钟。`, en: `This night has ${summary.cycleCount} cycles of ${min}–${max} min each.` },
      textbook: { zh: '教材：一个周期约 90–100 分钟，一夜重复好几次。', en: 'Textbook: a cycle lasts about 90 to 100 minutes and recurs several times a night.' },
    },
    n3: {
      title: { zh: 'N3 主要在前半夜', en: 'N3 comes early' },
      text: {
        zh: `深睡眠 N3：前 ${halfHours} 小时 ${summary.n3.first} 分钟，后 ${halfHours} 小时只有 ${summary.n3.second} 分钟。`,
        en: `Deep sleep (N3): ${summary.n3.first} min in the first ${halfHours} hours, only ${summary.n3.second} min in the last ${halfHours}.`,
      },
      textbook: { zh: '教材：前半夜的深睡眠（N3）远多于后半夜。', en: 'Textbook: much more deep sleep (N3) in the first half of the night than in the second half.' },
    },
    rem: {
      title: { zh: 'REM 越来越长', en: 'REM gets longer' },
      text: {
        zh: `REM 期一次比一次长（${rem} 分钟）；后 ${halfHours} 小时有 ${summary.rem.second} 分钟 REM，前 ${halfHours} 小时只有 ${summary.rem.first} 分钟。`,
        en: `Each REM period is longer than the one before (${rem} min): ${summary.rem.second} min of REM in the last ${halfHours} hours, only ${summary.rem.first} min in the first ${halfHours}.`,
      },
      textbook: {
        zh: '教材：大部分 REM 在夜里靠后的时间；第一个 REM 期可能只有 10 分钟，最后一个可长达 1 小时。',
        en: 'Textbook: most REM sleep comes toward the end of the night; the first REM period might last only 10 minutes, the final one up to an hour.',
      },
    },
    shares: {
      title: { zh: '各阶段占睡眠的比例', en: 'Share of sleep' },
      text: {
        zh: `这一夜睡着的 ${summary.totals.sleep} 分钟里：浅睡眠（N1 和 N2）${summary.shares.light}%，N3 ${summary.shares.N3}%，REM ${summary.shares.REM}%。`,
        en: `Of the ${summary.totals.sleep} min asleep: light sleep (N1 and N2) ${summary.shares.light}%, N3 ${summary.shares.N3}%, REM ${summary.shares.REM}%.`,
      },
      textbook: {
        zh: '教材：约 60% 是浅睡眠（N1 和 N2），20% 是慢波睡眠 N3，20% 是 REM（Webb, 2000）。',
        en: 'Textbook: about 60% light sleep (N1 and N2), 20% slow-wave sleep (N3) and 20% REM sleep (Webb, 2000).',
      },
    },
    closing: {
      zh: '一夜的睡眠从深睡眠开始，以越来越长的 REM 期结束。',
      en: 'A night of sleep starts out with deep sleep and ends with the longest REM periods.',
    },
  };
}

/** English sentences to write on a test about the whole night, each with its gloss. 关于整夜睡眠、考试可以写的英文句子及中文释义。 */
export const NIGHT_EXAM_SENTENCES = freezeDeep([
  {
    en: 'A sleep cycle lasts about 90 to 100 minutes and recurs several times during the night.',
    zh: '一个睡眠周期约 90–100 分钟，一夜重复好几次。',
  },
  {
    en: 'Deep sleep (stage N3) is much greater in the first half of the night than in the second half.',
    zh: '前半夜的深睡眠（N3）远多于后半夜。',
  },
  {
    en: 'REM periods get longer toward morning: about 10 minutes at first, up to an hour at the end.',
    zh: 'REM 期越到早上越长：开始约 10 分钟，最后可长达 1 小时。',
  },
  {
    en: 'About 60% of sleep is light sleep (N1 and N2), 20% is N3 and 20% is REM sleep.',
    zh: '约 60% 的睡眠是浅睡眠（N1 和 N2），20% 是 N3，20% 是 REM 睡眠。',
  },
]);

/**
 * Fixed texts of the widget: the header, notes, labels, button names and announcements the view shows, kept here
 * so the tests can check every one of them.
 * 组件中固定的文字：标题区、说明、标签、按钮名称和播报内容；放在这里，测试就能逐一检查。
 */
export const UI_TEXT = freezeDeep({
  slider: { zh: '时间（上床后）', en: 'Time since going to bed' },
  previous: { zh: '上一段', en: 'Previous stretch' },
  next: { zh: '下一段', en: 'Next stretch' },
  nextRem: { zh: '下一个 REM 期', en: 'Next REM period' },
  play: { zh: '播放', en: 'Play' },
  pause: { zh: '暂停', en: 'Pause' },
  controls: { zh: '移动光标', en: 'Move the cursor' },
  stretch: { zh: '这一段', en: 'This stretch' },
  moment: { zh: '这一刻', en: 'At this moment' },
  waves: { zh: '脑电波（EEG）', en: 'EEG waves' },
  facts: { zh: '这一期会发生什么', en: 'What happens in this stage' },
  exam: { zh: '考试这样写', en: 'Write it like this' },
  summary: { zh: '一整夜的规律', en: 'The pattern of the whole night' },
  table: { zh: '每个阶段的时间', en: 'Time in each stage' },
  stage: { zh: '阶段', en: 'Stage' },
  minutes: { zh: '分钟', en: 'Minutes' },
  unit: { zh: '单位：分钟', en: 'in minutes' },
  ofNight: { zh: '占整夜', en: '% of the night' },
  ofSleep: { zh: '占睡眠', en: '% of sleep' },
  light: { zh: '浅睡眠（N1 + N2）', en: 'Light sleep (N1 + N2)' },
  total: { zh: '合计', en: 'Total' },
  cursor: { zh: '时间光标', en: 'time cursor' },
  key: { zh: '图中代号', en: 'Codes in the chart' },
  first: { zh: '已经是第一段。', en: 'This is the first stretch.' },
  last: { zh: '已经是最后一段。', en: 'This is the last stretch.' },
  playing: { zh: '开始播放：光标一段一段往后走。', en: 'Playing: the cursor moves on one stretch at a time.' },
  paused: { zh: '已暂停。', en: 'Paused.' },
  finished: { zh: '播放结束，这一夜结束了。', en: 'Finished: the end of the night.' },
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  intro: {
    zh: '拖动时间滑块，或者直接点图上的任意位置，看看那一刻在哪个睡眠阶段、脑电波是什么样、会发生什么。也可以用“下一段”一段一段地看，或者按“播放”自动走完一整夜。',
    en: 'Move the time slider or tap the chart to see the stage at that moment, its EEG waves and what happens in it. Step through the stretches with Next, or press Play to walk through the whole night.',
  },
  illustration: {
    zh: `简化示意：按教材第 ${SOURCE_PAGES} 页的描述和图 5.7 画出，不是某一晚的真实记录。`,
    en: `Simplified illustration based on the textbook's description (pp. ${SOURCE_PAGES}, Figure 5.7); not a recording of a real night.`,
  },
  axes: {
    zh: '横轴：上床后的时间（小时）。纵轴从上到下：W、REM、N1、N2、N3，和教材图 5.7 的顺序一样；N1 到 N3 越来越深。上方的数字是第几个睡眠周期。',
    en: 'Across: hours since going to bed. Down the side: W, REM, N1, N2, N3, the order of Figure 5.7; sleep gets deeper from N1 to N3. The numbers on top count the sleep cycles.',
  },
  remPosition: {
    zh: '注意：图里 REM 画在 W 正下方（和教材图 5.7 一样），它的脑电波也像放松清醒时的脑电波；但 REM 不算浅睡眠：教材说的浅睡眠（light sleep）只指 N1 和 N2。',
    en: 'Note: REM is drawn right under W, as in Figure 5.7, and its EEG looks like relaxed wakefulness, but REM is not light sleep: the textbook\'s "light sleep" means N1 and N2 only.',
  },
  traceNote: {
    zh: '简化示意：波形按简单规则画出，只表示快慢、高低和规律程度的区别，不是真实的脑电图。',
    en: 'Simplified illustration: the wave shapes follow a simple rule that only shows fast versus slow, small versus large and regular versus irregular; they are not real EEG recordings.',
  },
});

/** The key of the chart's codes and shading. 图中代号与色块的说明。 */
export const LEGEND = freezeDeep([
  { id: 'rem', label: { zh: 'REM 期', en: 'REM periods' } },
  { id: 'n3', label: { zh: 'N3 深睡眠', en: 'N3 deep sleep' } },
  { id: 'cycle', label: { zh: '一个睡眠周期', en: 'one sleep cycle' } },
  { id: 'current', label: { zh: '光标所在的这一段', en: 'stretch under the cursor' } },
]);

export const STAGE_KEY = freezeDeep([
  { code: 'W', label: { zh: '清醒', en: 'wake' } },
  { code: 'REM', label: { zh: '快速眼动睡眠（R 期）', en: 'rapid eye movement sleep (stage R)' } },
  { code: 'N1', label: { zh: '非快速眼动 1 期', en: 'non-REM1' } },
  { code: 'N2', label: { zh: '非快速眼动 2 期', en: 'non-REM2' } },
  { code: 'N3', label: { zh: '非快速眼动 3 期，深睡眠', en: 'non-REM3, deep sleep' } },
]);

/* ---------- Chart geometry 图表几何 ---------- */

// Pixel layout of the hypnogram; the view sets the viewBox to the measured width, so 1 unit is 1 pixel.
// 睡眠图的像素布局；视图把 viewBox 设为测得的宽度，所以 1 个单位就是 1 像素。
export const CHART = Object.freeze({
  height: 214,
  top: 26,
  bottom: 30,
  left: 46,
  right: 14,
  minWidth: 280,
  fallbackWidth: 640,
});

/**
 * Geometry of a hypnogram `width` pixels wide: { width, height, plot { left, right, top, bottom }, rowHeight,
 * rowY(stage), x(minute), minuteAt(x) }. Widths below CHART.minWidth are drawn at the minimum and scaled down.
 * 宽 width 像素的睡眠图几何：{ width, height, plot, rowHeight, rowY(stage), x(minute), minuteAt(x) }。
 * 窄于 CHART.minWidth 时按最小宽度画、再整体缩小。
 */
export function chartLayout(width, segments = TYPICAL_NIGHT) {
  const night = nightLength(segments);
  const measured = Number.isFinite(width) && width > 0 ? Math.round(width) : CHART.fallbackWidth;
  const chartWidth = Math.max(CHART.minWidth, measured);
  const plot = { left: CHART.left, right: chartWidth - CHART.right, top: CHART.top, bottom: CHART.height - CHART.bottom };
  const span = plot.right - plot.left;
  const rowHeight = (plot.bottom - plot.top) / STAGE_ORDER.length;
  return {
    width: chartWidth,
    height: CHART.height,
    plot,
    rowHeight,
    rowY: (stage) => plot.top + (Math.max(0, STAGE_ORDER.indexOf(stage)) + 0.5) * rowHeight,
    x: (minute) => plot.left + (clampMinute(minute, night) / night) * span,
    minuteAt: (x) => Math.round(clampMinute(((Number(x) - plot.left) / span) * night, night)),
  };
}

const fixed = (value) => Number(value.toFixed(1));

/**
 * The hypnogram as one SVG step path: a level line through each stretch at its stage's row and a vertical
 * line at every change of stage.
 * 睡眠图的 SVG 阶梯路径：每一段在所属阶段的那一行画水平线，阶段改变处画竖线。
 */
export function hypnogramPath(layout, segments = TYPICAL_NIGHT) {
  const list = listOf(segments);
  const parts = [`M${fixed(layout.x(list[0].start))} ${fixed(layout.rowY(list[0].stage))}`];
  list.forEach((segment, index) => {
    parts.push(`H${fixed(layout.x(segment.end))}`);
    const next = list[index + 1];
    if (next) parts.push(`V${fixed(layout.rowY(next.stage))}`);
  });
  return parts.join(' ');
}

/**
 * Boxes of the stretches of one stage within its row (REM periods and N3 are shaded): [{ x, y, width, height,
 * index }].
 * 某个阶段各段在所属行里的方框（REM 期和 N3 会加底色）：[{ x, y, width, height, index }]。
 */
export function stageBoxes(stage, layout, segments = TYPICAL_NIGHT) {
  const boxes = [];
  listOf(segments).forEach((segment, index) => {
    if (segment.stage !== stage) return;
    const left = layout.x(segment.start);
    boxes.push({
      x: fixed(left),
      y: fixed(layout.rowY(stage) - layout.rowHeight / 2),
      width: fixed(layout.x(segment.end) - left),
      height: fixed(layout.rowHeight),
      index,
    });
  });
  return boxes;
}

/** The background band of each cycle with the position of its number: [{ number, x, width, labelX }]. 每个周期的背景带及其编号的位置。 */
export function cycleBands(layout, segments = TYPICAL_NIGHT) {
  return cycleBoundaries(segments).map((cycle) => {
    const left = layout.x(cycle.start);
    const right = layout.x(cycle.end);
    return { number: cycle.number, x: fixed(left), width: fixed(right - left), labelX: fixed((left + right) / 2) };
  });
}

/**
 * The hour ticks of the x axis: [{ hour, x, label, showLabel }]; labels are thinned when hours sit closer than
 * 26 pixels, and the last label carries the unit ("8 h").
 * 横轴的整点刻度：[{ hour, x, label, showLabel }]；整点相距不到 26 像素时隔一个显示标签，最后一个标签带单位（“8 h”）。
 */
export function hourTicks(layout, segments = TYPICAL_NIGHT) {
  const hours = Math.floor(nightLength(segments) / 60);
  const perHour = (layout.plot.right - layout.plot.left) / Math.max(1, nightLength(segments) / 60);
  const stride = perHour >= 26 ? 1 : 2;
  return Array.from({ length: hours + 1 }, (_, hour) => ({
    hour,
    x: fixed(layout.x(hour * 60)),
    label: hour === hours ? `${hour} h` : String(hour),
    showLabel: hour % stride === 0 || hour === hours,
  }));
}

/* ---------- EEG traces (simplified illustration) 示意脑电波形（简化示意） ---------- */

/**
 * The rule each drawn trace follows: sums of sine waves over a 2-second window, [frequency in hertz, amplitude,
 * phase]. Only the comparisons the textbook makes are meant: beta fastest and smallest, alpha slower, larger and
 * more regular, theta slower and larger than alpha, delta slowest and largest, spindles short bursts of faster
 * waves among theta waves, REM fast waves like relaxed wakefulness. Sizes share one scale across traces.
 * 每条示意波形的规则：2 秒窗口里若干正弦波之和，[频率（赫兹）, 波幅, 相位]。只表达教材做的比较：beta 最快最小；alpha 更慢、更大、更规律；
 * theta 比 alpha 更慢更大；delta 最慢最大；纺锤波是 theta 波中间一小阵更快的波；REM 是像放松清醒时的快波。所有波形使用同一个比例。
 */
export const TRACE_SECONDS = 2;
const TRACE_RULES = freezeDeep({
  beta: { waves: [[21, 0.13, 0.3], [29, 0.09, 1.7], [15, 0.07, 4.1]] },
  alpha: { waves: [[10, 0.36, 0], [20, 0.04, 2.2]] },
  theta: { waves: [[6, 0.52, 0.4], [3, 0.1, 1.1], [11, 0.05, 2.9]] },
  spindles: {
    waves: [[6, 0.45, 0.4], [3, 0.08, 1.1]],
    bursts: { frequency: 14, amplitude: 0.5, centres: [0.55, 1.4], width: 0.1 },
  },
  delta: { waves: [[1.6, 0.92, 0.3], [3.1, 0.16, 1.4], [0.8, 0.1, 2]] },
  rem: { waves: [[17, 0.13, 0.2], [9, 0.17, 1.3], [26, 0.07, 3.3]] },
});
export const TRACE_KINDS = Object.freeze(Object.keys(TRACE_RULES));
// Half the burst length counts as "inside a spindle" for shading: ±2 widths of the bell-shaped envelope.
// 纺锤波阴影的范围：钟形包络的 ±2 个宽度。
const BURST_REACH = 2;

/**
 * Samples of a trace: [{ t, y }] for t from 0 to TRACE_SECONDS; an unknown kind gives a flat line.
 * 示意波形的采样点：[{ t, y }]，t 从 0 到 TRACE_SECONDS；未知种类给出一条平线。
 */
export function traceSamples(kind, count = 640) {
  const rule = Object.hasOwn(TRACE_RULES, kind) ? TRACE_RULES[kind] : { waves: [] };
  const total = Math.max(2, Math.round(count));
  return Array.from({ length: total }, (_, index) => {
    const t = (index / (total - 1)) * TRACE_SECONDS;
    let y = rule.waves.reduce((sum, [frequency, amplitude, phase]) => sum + amplitude * Math.sin(2 * Math.PI * frequency * t + phase), 0);
    if (rule.bursts) {
      const { frequency, amplitude, centres, width } = rule.bursts;
      for (const centre of centres) {
        const envelope = Math.exp(-(((t - centre) / width) ** 2));
        y += amplitude * envelope * Math.sin(2 * Math.PI * frequency * (t - centre));
      }
    }
    return { t, y };
  });
}

/** The time windows of the spindle bursts, in seconds: [{ from, to }]. 纺锤波出现的时间窗口（秒）。 */
export function traceBursts(kind) {
  const bursts = Object.hasOwn(TRACE_RULES, kind) ? TRACE_RULES[kind].bursts : null;
  if (!bursts) return [];
  return bursts.centres.map((centre) => ({
    from: Math.max(0, centre - BURST_REACH * bursts.width),
    to: Math.min(TRACE_SECONDS, centre + BURST_REACH * bursts.width),
  }));
}

// Pixel box of a drawn trace (scaled with its viewBox) and the vertical pixels per unit of amplitude.
// 示意波形的像素框（随 viewBox 缩放）与每单位波幅对应的竖直像素。
export const TRACE_BOX = Object.freeze({ width: 320, height: 64, scale: 26 });

/**
 * A trace as an SVG path inside TRACE_BOX, with its spindle windows in the same units:
 * { d, bursts: [{ x, width }] }.
 * TRACE_BOX 里的示意波形 SVG 路径，以及同一单位下的纺锤波窗口：{ d, bursts: [{ x, width }] }。
 */
export function tracePath(kind) {
  const { width, height, scale } = TRACE_BOX;
  const middle = height / 2;
  const toX = (t) => (t / TRACE_SECONDS) * width;
  const d = traceSamples(kind).map((sample, index) => (
    `${index ? 'L' : 'M'}${toX(sample.t).toFixed(1)} ${(middle - sample.y * scale).toFixed(1)}`)).join(' ');
  return {
    d,
    bursts: traceBursts(kind).map((burst) => ({ x: fixed(toX(burst.from)), width: fixed(toX(burst.to) - toX(burst.from)) })),
  };
}
