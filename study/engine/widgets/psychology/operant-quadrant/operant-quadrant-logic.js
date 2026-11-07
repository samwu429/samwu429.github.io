/**
 * The four operant consequences for the "operant-quadrant" widget: the config reader, the 2 x 2 table, the two-step
 * drill (state changes, grading, seeded shuffling) and every sentence the widget shows. DOM-free.
 * 操作性条件反射的四种后果，供 operant-quadrant 组件使用：读取配置、2 × 2 表、两步练习（状态变化、判分、可设种子的洗牌），
 * 以及组件显示的每一句话；不依赖 DOM。
 *
 * Facts kept here (King & Urbszat 2024, The Science of Psychology, 2nd Canadian ed., Chapter 6, pp. 224-229, and the
 * lecture slides 10-12):
 * - "Positive" means a stimulus is added and "negative" means a stimulus is removed; the words have nothing to do with
 *   good or bad (p.224, p.228).
 * - Reinforcement makes a behaviour more likely to happen again, punishment makes it less likely (p.224, p.228).
 * - Negative reinforcement removes something unpleasant and increases the behaviour, so it is not punishment
 *   (p.224, Figure 6.11).
 * - The table examples retell the textbook's own ones: a dog given food for lifting its paw (p.224), ibuprofen ending a
 *   headache (p.224 and Figure 6.11), a student scolded for interrupting (p.228), a teen losing driving privileges for
 *   staying out too late (p.229, also lecture slide 12).
 * 这里沿用的事实（King & Urbszat 2024 教材第 6 章第 224-229 页，以及讲课第 10-12 页）：
 * - “正”表示加上一个刺激，“负”表示拿走一个刺激，与好坏无关（第 224、228 页）。
 * - 强化让行为以后更可能发生，惩罚让行为更不可能发生（第 224、228 页）。
 * - 负强化拿走让人难受的东西、让行为增加，所以不是惩罚（第 224 页、图 6.11）。
 * - 表中的例子用自己的话转述教材的例子：狗抬爪得到食物（第 224 页）、布洛芬让头痛消失（第 224 页与图 6.11）、
 *   学生插嘴被批评（第 228 页）、青少年晚归被取消开车的权利（第 229 页，讲课第 12 页也有）。
 */
import { shuffleWith } from '../../../core/util/random.js';
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { scriptMix } from '../../../core/text/script-runs.js';

/* ---------- Constants 常量 ---------- */

/** Freezes an object and everything inside it, so shared tables cannot be changed by accident. 冻结对象及其内部所有对象，防止共享数据被意外修改。 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// The answer ids of content-spec 5.5, in table order (row by row). content-spec 5.5 规定的答案 id，按表格顺序（逐行）排列。
export const QUADRANT_IDS = Object.freeze([
  'positive-reinforcement', 'positive-punishment', 'negative-reinforcement', 'negative-punishment',
]);

// Step 1: "positive" = a stimulus is added, "negative" = a stimulus is removed (the table rows).
// 第 1 步：“正”= 加上一个刺激，“负”= 拿走一个刺激（表格的行）。
export const SIGNS = Object.freeze(['positive', 'negative']);

// Step 2: the behaviour becomes more likely (reinforcement) or less likely (punishment) (the table columns).
// 第 2 步：行为更可能发生（强化）或更不可能发生（惩罚）（表格的列）。
export const DIRECTIONS = Object.freeze(['increase', 'decrease']);

// content-spec 5.5: 3-12 scenarios; with fewer the drill is hidden, extra ones are not read.
// content-spec 5.5：3-12 个情境；少于 3 个时隐藏练习，多出的不读取。
export const SCENARIO_LIMITS = Object.freeze({ min: 3, max: 12 });

export const DEFAULT_TITLE = Object.freeze({ zh: '强化与惩罚', en: 'Reinforcement and punishment' });

// Pause between lighting the learner's quadrant and showing the correct one; 0 when motion is reduced.
// 先点亮学习者选的格子、再显示正确格子之间的停顿；减少动态效果时为 0。
export const REVEAL_DELAY_MS = 700;

export const SIGN_INFO = deepFreeze({
  positive: { symbol: '+', word: { zh: '加上', en: 'added' }, term: { zh: '正', en: 'positive' } },
  negative: { symbol: '−', word: { zh: '拿走', en: 'removed' }, term: { zh: '负', en: 'negative' } },
});

export const DIRECTION_INFO = deepFreeze({
  increase: { symbol: '↑', word: { zh: '更可能发生', en: 'more likely' }, term: { zh: '强化', en: 'reinforcement' } },
  decrease: { symbol: '↓', word: { zh: '更不可能发生', en: 'less likely' }, term: { zh: '惩罚', en: 'punishment' } },
});

// Each quadrant: its row (sign), its column (direction), its name and a one-line example retold from the textbook.
// 每一格：所在的行（正负）、所在的列（行为方向）、名称，以及用自己的话转述的教材例子。
export const QUADRANTS = deepFreeze({
  'positive-reinforcement': {
    id: 'positive-reinforcement',
    sign: 'positive',
    direction: 'increase',
    name: { zh: '正强化', en: 'positive reinforcement' },
    example: {
      zh: '狗抬起爪子就得到零食，以后更常抬爪。',
      en: 'A dog gets a treat for lifting its paw, so it lifts its paw more often.',
    },
  },
  'positive-punishment': {
    id: 'positive-punishment',
    sign: 'positive',
    direction: 'decrease',
    name: { zh: '正惩罚', en: 'positive punishment' },
    example: {
      zh: '学生上课插嘴，被老师批评，以后少插嘴。',
      en: 'A student who interrupts is scolded, so they interrupt less.',
    },
  },
  'negative-reinforcement': {
    id: 'negative-reinforcement',
    sign: 'negative',
    direction: 'increase',
    name: { zh: '负强化', en: 'negative reinforcement' },
    example: {
      zh: '吃了布洛芬，头痛消失了，下次头痛还会吃。',
      en: 'Taking ibuprofen ends a headache, so you take it again next time.',
    },
  },
  'negative-punishment': {
    id: 'negative-punishment',
    sign: 'negative',
    direction: 'decrease',
    name: { zh: '负惩罚', en: 'negative punishment' },
    example: {
      zh: '青少年晚归，被取消开车的权利，以后不再晚归。',
      en: 'A teen who stays out too late loses driving privileges, so they stop staying out late.',
    },
  },
});

// Every fixed string the widget shows, in both languages. 组件显示的所有固定文字，中英两种语言。
export const TEXT = deepFreeze({
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  intro: {
    zh: '操作性条件反射（**operant conditioning**）里，跟在行为后面的后果分四种。先看下面的 2 × 2 表，再做练习：'
      + '每个情境分两步判断——第 1 步，刺激是被加上还是被拿走；第 2 步，这个行为以后更可能还是更不可能发生。',
    en: 'In operant conditioning, the consequence that follows a behaviour is one of four kinds. Read the 2 × 2 table, '
      + 'then try the drill: for each scenario, decide first whether a stimulus is added or removed, then whether the '
      + 'behaviour becomes more or less likely.',
  },
  introTableOnly: {
    zh: '操作性条件反射（**operant conditioning**）里，跟在行为后面的后果分四种。表格的行看刺激是被加上还是被拿走，'
      + '列看这个行为以后更可能还是更不可能发生。',
    en: 'In operant conditioning, the consequence that follows a behaviour is one of four kinds. The rows of the table '
      + 'say whether a stimulus is added or removed; the columns say whether the behaviour becomes more or less likely.',
  },
  tableHeading: { zh: '四种后果：2 × 2 表', en: 'The four consequences: a 2 × 2 table' },
  tableCaption: {
    zh: '四种后果。行：刺激被加上还是被拿走；列：行为以后更可能还是更不可能发生。',
    en: 'The four consequences. Rows: a stimulus is added or removed. Columns: the behaviour becomes more or less likely.',
  },
  rows: {
    positive: { zh: '加上一个刺激（正，+）', en: 'A stimulus is added (positive, +)' },
    negative: { zh: '拿走一个刺激（负，−）', en: 'A stimulus is removed (negative, −)' },
  },
  columns: {
    increase: { zh: '行为更可能发生 → 强化', en: 'Behaviour more likely → reinforcement' },
    decrease: { zh: '行为更不可能发生 → 惩罚', en: 'Behaviour less likely → punishment' },
  },
  ruleSign: {
    zh: '正（**positive**）= 加上一个刺激（+）；负（**negative**）= 拿走一个刺激（−）。正和负只说“加上还是拿走”，跟好、坏没有关系。',
    en: 'Positive means a stimulus is added (+); negative means a stimulus is removed (−). They do not mean good or bad.',
  },
  ruleDirection: {
    zh: '强化（**reinforcement**）让行为以后更可能发生；惩罚（**punishment**）让行为以后更不可能发生。',
    en: 'Reinforcement makes a behaviour more likely to happen again; punishment makes it less likely.',
  },
  warningLabel: { zh: '注意', en: 'Watch out' },
  warning: {
    zh: '负强化不是惩罚！负强化拿走的是让人难受的东西（比如头痛），所以行为以后会变多；惩罚一定让行为变少。',
    en: 'Negative reinforcement is **not** punishment. It takes away something unpleasant (such as a headache), so the '
      + 'behaviour becomes more likely. Punishment always makes a behaviour less likely.',
  },
  drillHeading: { zh: '练习：这是哪一种？', en: 'Drill: which one is it?' },
  step1: {
    zh: '第 1 步：行为发生以后，是加上了一个刺激，还是拿走了一个刺激？',
    en: 'Step 1: After the behaviour, is a stimulus added or removed?',
  },
  step2: {
    zh: '第 2 步：这个后果让行为以后更可能发生，还是更不可能发生？',
    en: 'Step 2: Does this consequence make the behaviour more likely or less likely in the future?',
  },
  choices: {
    positive: { zh: '**加上**了一个刺激', en: 'Something is **added**' },
    negative: { zh: '**拿走**了一个刺激', en: 'Something is **removed**' },
    increase: { zh: '行为**更可能**发生', en: 'The behaviour becomes **more** likely' },
    decrease: { zh: '行为**更不可能**发生', en: 'The behaviour becomes **less** likely' },
  },
  boardCaption: { zh: '你的答案落在表格的哪一格', en: 'Where your answer falls in the table' },
  // Badges of the lit quadrants in the table; the small answer board uses the shorter boardBadges with the same icons.
  // 表格中被点亮格子的徽标；小号答案表用更短的 boardBadges，图标相同。
  badges: {
    chosen: { zh: '你的答案', en: 'Your answer' },
    right: { zh: '你的答案：对', en: 'Your answer: right' },
    wrong: { zh: '你的答案：不对', en: 'Your answer: wrong' },
    correct: { zh: '正确答案', en: 'Correct answer' },
  },
  boardBadges: {
    chosen: { zh: '你的答案', en: 'Your answer' },
    right: { zh: '答对了', en: 'Right' },
    wrong: { zh: '你的答案', en: 'Your answer' },
    correct: { zh: '正确答案', en: 'Correct' },
  },
  whyLabel: { zh: '为什么', en: 'Why' },
  next: { zh: '下一题', en: 'Next scenario' },
  finish: { zh: '看总结', en: 'See the summary' },
  summaryHeading: { zh: '练习完成', en: 'Drill complete' },
  allCorrect: { zh: '全部答对！四种后果你都分清楚了。', en: 'All correct! You can tell all four consequences apart.' },
  missedHeading: { zh: '做错的题，再看一遍', en: 'Review the ones you missed' },
  yourAnswer: { zh: '你的答案', en: 'Your answer' },
  correctAnswer: { zh: '正确答案', en: 'Correct answer' },
  tryAgain: { zh: '再练一次（打乱顺序）', en: 'Try again (shuffled)' },
  restarted: { zh: '重新开始，题目顺序已打乱。', en: 'Starting again in a new order.' },
  hints: {
    notPunishment: {
      zh: '负强化不是惩罚：让人难受的东西被拿走了，行为以后会变多，所以是强化。',
      en: 'Negative reinforcement is not punishment: something unpleasant is taken away, so the behaviour becomes more likely. That is reinforcement.',
    },
    notNegativeReinforcement: {
      zh: '惩罚让行为变少，负强化让行为变多。先问自己：这个行为以后是变多了，还是变少了？',
      en: 'Punishment makes a behaviour less likely; negative reinforcement makes it more likely. Ask yourself first: does the behaviour happen more or less afterwards?',
    },
    sign: {
      zh: '正和负只看刺激是被加上还是被拿走，不看这件事是好是坏。',
      en: 'Positive and negative only ask whether a stimulus is added or removed, not whether it is good or bad.',
    },
    direction: {
      zh: '是强化还是惩罚，只看这个行为以后变多了还是变少了。',
      en: 'Whether it is reinforcement or punishment depends only on whether the behaviour becomes more or less likely afterwards.',
    },
  },
});

/* ---------- Config 配置 ---------- */

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A bilingual value as trimmed { zh, en } strings, or null when both are empty. A bare string is filed under the
 * language it is written in.
 * 把双语值读成去掉首尾空白的 { zh, en }；两者都为空时返回 null。纯字符串按书写语言归入 zh 或 en。
 */
function readBi(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    const mix = scriptMix(text);
    return mix === 'zh' || mix === 'mixed' ? { zh: text, en: '' } : { zh: '', en: text };
  }
  if (!isRecord(value)) return null;
  const zh = trimmed(value.zh);
  const en = trimmed(value.en);
  return zh || en ? { zh, en } : null;
}

/** One of the four answer ids (spaces and capitals forgiven), or null. 四个答案 id 之一（容忍空格和大小写），否则为 null。 */
function readAnswer(value) {
  const id = trimmed(value).toLowerCase();
  return QUADRANT_IDS.includes(id) ? id : null;
}

/**
 * A scenario needs a text and a known answer; without them it is dropped. A missing "why" is null, and the widget
 * then explains with the rule of the quadrant alone.
 * 情境必须有文字和合法答案，否则丢弃。缺少 why 时为 null，组件只用这一格的规则来解释。
 */
function readScenario(item) {
  if (!isRecord(item)) return null;
  const text = readBi(item.text);
  const answer = readAnswer(item.answer);
  if (!text || !answer) return null;
  return { text, answer, why: readBi(item.why) };
}

/**
 * Reads { title: Bi, scenarios: [{ text: Bi, answer, why: Bi }] } (content-spec 5.5). Invalid scenarios are dropped,
 * at most 12 are kept, and with fewer than 3 the drill is hidden and only the table shows. Never throws.
 * 读取 { title, scenarios }（content-spec 5.5）。无效情境被丢弃，最多保留 12 个；少于 3 个时隐藏练习、只显示表格。不会抛出异常。
 *
 * Returns { title, usedDefaultTitle, scenarios: [{ id, text, answer, why }], drill, dropped }; `id` is the position in
 * `scenarios`, and `dropped` counts the items not read (invalid ones and those past the twelfth).
 * 返回 { title, usedDefaultTitle, scenarios, drill, dropped }；id 是情境在 scenarios 中的位置，dropped 是没有读取的条目数
 * （无效的，以及第 12 个之后的）。
 */
export function normalizeOperantQuadrantConfig(config) {
  const source = isRecord(config) ? config : {};
  const ownTitle = readBi(source.title);
  const list = Array.isArray(source.scenarios) ? source.scenarios : [];
  const valid = [];
  for (const item of list) {
    const scenario = readScenario(item);
    if (scenario) valid.push(scenario);
  }
  const scenarios = valid.slice(0, SCENARIO_LIMITS.max).map((scenario, id) => ({ id, ...scenario }));
  return {
    title: ownTitle ?? { ...DEFAULT_TITLE },
    usedDefaultTitle: !ownTitle,
    scenarios,
    drill: scenarios.length >= SCENARIO_LIMITS.min,
    dropped: list.length - scenarios.length,
  };
}

/* ---------- Quadrants 四格 ---------- */

/** The quadrant in row `sign` and column `direction`, or null. 位于 sign 行、direction 列的那一格；没有时为 null。 */
export function quadrantOf(sign, direction) {
  if (!SIGNS.includes(sign) || !DIRECTIONS.includes(direction)) return null;
  return QUADRANT_IDS.find((id) => QUADRANTS[id].sign === sign && QUADRANTS[id].direction === direction) ?? null;
}

/** The sign and direction an answer id stands for, or null. 答案 id 对应的正负与行为方向；不是答案 id 时为 null。 */
export function partsOf(id) {
  if (!QUADRANT_IDS.includes(id)) return null;
  const { sign, direction } = QUADRANTS[id];
  return { sign, direction };
}

/**
 * Grades the two steps against the answer: which quadrant was chosen, whether each step was right, and the list of
 * wrong steps (1 = added or removed, 2 = more or less likely). Null for an unknown answer or choice.
 * 按答案给两步判分：选中了哪一格、每一步对不对，以及错了哪几步（1 = 加上还是拿走，2 = 更可能还是更不可能）。答案或选择无效时为 null。
 */
export function gradeAnswer(answer, sign, direction) {
  const expected = partsOf(answer);
  const chosen = quadrantOf(sign, direction);
  if (!expected || !chosen) return null;
  const signCorrect = sign === expected.sign;
  const directionCorrect = direction === expected.direction;
  const wrongSteps = [];
  if (!signCorrect) wrongSteps.push(1);
  if (!directionCorrect) wrongSteps.push(2);
  return { answer, chosen, sign, direction, signCorrect, directionCorrect, correct: wrongSteps.length === 0, wrongSteps };
}

/**
 * How each quadrant is drawn now: 'idle'; 'row' once step 1 picked its row; 'chosen' for the learner's quadrant before
 * the reveal; after it 'right' (chosen and correct), or 'wrong' for the chosen one and 'correct' for the answer.
 * 每一格现在的样子：idle；第 1 步选了它所在的行时为 row；揭晓前学习者选的格子为 chosen；揭晓后，选对为 right，
 * 选错时选中的格子为 wrong、正确的格子为 correct。
 */
export function cellStates({ sign = null, direction = null, answer = null, revealed = false } = {}) {
  const states = Object.fromEntries(QUADRANT_IDS.map((id) => [id, 'idle']));
  const chosen = quadrantOf(sign, direction);
  if (!chosen) {
    if (SIGNS.includes(sign)) {
      for (const id of QUADRANT_IDS) if (QUADRANTS[id].sign === sign) states[id] = 'row';
    }
    return states;
  }
  if (!revealed || !QUADRANT_IDS.includes(answer)) {
    states[chosen] = 'chosen';
    return states;
  }
  if (chosen === answer) {
    states[chosen] = 'right';
  } else {
    states[chosen] = 'wrong';
    states[answer] = 'correct';
  }
  return states;
}

/** Which row and column labels of the answer board are active. 答案小表里哪一行、哪一列的标签处于选中状态。 */
export function axisStates({ sign = null, direction = null } = {}) {
  return {
    rows: Object.fromEntries(SIGNS.map((value) => [value, value === sign])),
    columns: Object.fromEntries(DIRECTIONS.map((value) => [value, value === direction])),
  };
}

/* ---------- Seeded order 可设种子的顺序 ---------- */

/** mulberry32: floats in [0, 1) that repeat for the same seed. mulberry32：同一种子给出同一串 [0, 1) 的小数。 */
export function createSeededRandom(seed = 1) {
  let state = Number(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed after `seed` (one step of a linear congruential generator). 下一个种子（线性同余生成器走一步）。 */
export function nextSeed(seed) {
  return (Math.imul(Number(seed) >>> 0, 1664525) + 1013904223) >>> 0;
}

/** A 32-bit seed drawn from `random` (Math.random by default); a broken source gives 0. 从 random 取一个 32 位种子；随机源异常时为 0。 */
export function seedFrom(random = Math.random) {
  const roll = Number(random());
  const unit = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1 - 2 ** -32) : 0;
  return Math.floor(unit * 4294967296) >>> 0;
}

function wholeCount(count) {
  const number = Number(count);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isPermutation(list, count) {
  if (!Array.isArray(list) || list.length !== count) return false;
  const seen = new Set(list);
  return seen.size === count && list.every((value) => Number.isInteger(value) && value >= 0 && value < count);
}

/**
 * The scenario ids 0..count-1 shuffled by the seed. With two or more scenarios and a valid `previous` order, the new
 * order starts with a different scenario, so "Try again" visibly changes the round; the same seed and `previous` always
 * give the same order.
 * 用种子打乱情境 id 0..count-1。有两个及以上情境、且 previous 是有效顺序时，新顺序的第一题一定与上一轮不同，
 * “再练一次”看得出变化；同样的种子和 previous 总是给出同样的顺序。
 */
export function shuffledOrder(count, seed, previous = null) {
  const total = wholeCount(count);
  const base = Array.from({ length: total }, (_, index) => index);
  if (total < 2) return base;
  const last = isPermutation(previous, total) ? previous : null;
  let current = Number(seed) >>> 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const order = shuffleWith(base, createSeededRandom(current));
    if (!last || order[0] !== last[0]) return order;
    current = nextSeed(current);
  }
  // Eight shuffles in a row began like `previous` (only likely with two or three scenarios): rotate it by one instead.
  // 连续八次洗牌的第一题都和 previous 一样（只有两三个情境时才可能）：改为把 previous 轮转一位。
  return [...last.slice(1), last[0]];
}

/* ---------- Drill 练习 ---------- */

/**
 * A fresh drill over `count` scenarios in their written order. Phases: 'sign' (step 1), 'direction' (step 2, step 1 can
 * still be changed), 'feedback' (graded) and 'done'. The state is never changed in place.
 * 按书写顺序开始一轮练习。阶段：sign（第 1 步）、direction（第 2 步，第 1 步仍可修改）、feedback（已判分）、done（结束）。
 * 状态对象从不原地修改。
 */
export function startDrill(count) {
  const total = wholeCount(count);
  return {
    order: Array.from({ length: total }, (_, index) => index),
    position: 0,
    phase: total ? 'sign' : 'done',
    sign: null,
    direction: null,
    results: [],
    round: 1,
  };
}

/** The id of the scenario on screen, or null when the round is over. 当前情境的 id；本轮结束时为 null。 */
export function currentScenarioId(state) {
  if (!state || state.phase === 'done') return null;
  return state.order[state.position] ?? null;
}

/** Step 1: picks added (positive) or removed (negative); allowed again until step 2 is answered. 第 1 步：选加上或拿走；回答第 2 步之前可以改。 */
export function chooseSign(state, sign) {
  if (!SIGNS.includes(sign) || (state.phase !== 'sign' && state.phase !== 'direction') || state.sign === sign) return state;
  return { ...state, sign, phase: 'direction' };
}

function answerOf(scenarios, id) {
  const item = Array.isArray(scenarios) ? scenarios[id] : null;
  return typeof item === 'string' ? item : item?.answer;
}

/**
 * Step 2: picks more or less likely and grades the scenario against its answer (`scenarios` holds objects with an
 * `answer`, or the answer ids themselves). Only after step 1.
 * 第 2 步：选更可能或更不可能，并按答案给这个情境判分（scenarios 里是带 answer 的对象，或直接是答案 id）。必须先完成第 1 步。
 */
export function chooseDirection(state, direction, scenarios) {
  if (!DIRECTIONS.includes(direction) || state.phase !== 'direction' || !state.sign) return state;
  const id = currentScenarioId(state);
  const grade = gradeAnswer(answerOf(scenarios, id), state.sign, direction);
  if (!grade) return state;
  return { ...state, direction, phase: 'feedback', results: [...state.results, { id, ...grade }] };
}

/** The graded result of the scenario on screen, or null before it is graded. 当前情境的判分结果；还没判分时为 null。 */
export function lastResult(state) {
  if (!state || state.phase !== 'feedback') return null;
  return state.results[state.results.length - 1] ?? null;
}

/** Whether the scenario on screen is the last of the round. 当前情境是不是本轮最后一题。 */
export function isLastScenario(state) {
  return Boolean(state) && state.phase !== 'done' && state.position >= state.order.length - 1;
}

/** Moves on from the feedback to the next scenario, or to 'done' after the last one. 从反馈进入下一题；最后一题之后进入 done。 */
export function nextScenario(state) {
  if (state.phase !== 'feedback') return state;
  const position = state.position + 1;
  const done = position >= state.order.length;
  return { ...state, position: done ? state.order.length : position, phase: done ? 'done' : 'sign', sign: null, direction: null };
}

/** A new round of the same scenarios, shuffled by `seed` to start with another scenario. 同一组情境的新一轮，用 seed 打乱，第一题与上一轮不同。 */
export function restartDrill(state, seed) {
  const total = state.order.length;
  return {
    order: shuffledOrder(total, seed, state.order),
    position: 0,
    phase: total ? 'sign' : 'done',
    sign: null,
    direction: null,
    results: [],
    round: state.round + 1,
  };
}

/** Right answers, answered scenarios and scenarios in the round. 答对的题数、已答的题数和本轮总题数。 */
export function drillScore(state) {
  const results = state?.results ?? [];
  return {
    correct: results.filter((result) => result.correct).length,
    answered: results.length,
    total: state?.order?.length ?? 0,
  };
}

/** The wrong results of the round, in the order they were answered. 本轮答错的结果，按作答顺序排列。 */
export function missedResults(state) {
  return (state?.results ?? []).filter((result) => !result.correct);
}

/** Milliseconds between lighting the chosen quadrant and showing the correct one. 点亮所选格子与显示正确格子之间的毫秒数。 */
export function revealDelay(reducedMotion) {
  return reducedMotion ? 0 : REVEAL_DELAY_MS;
}

/* ---------- Sentences 句子 ---------- */

function other(list, value) {
  return list.find((item) => item !== value);
}

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function lowerFirst(text) {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

function plain(text) {
  return stripMarkup(text);
}

function wholeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** "Scenario 3 of 8" for position 2 (0-based) of 8. 第 3 题，共 8 题（position 从 0 开始）。 */
export function progressText(position, total) {
  const count = wholeNumber(total);
  const number = Math.min(wholeNumber(position) + 1, Math.max(count, 1));
  return { zh: `第 ${number} 题，共 ${count} 题`, en: `Scenario ${number} of ${count}` };
}

/** Right answers out of answered ones. 答对数 / 已答数。 */
export function scoreText({ correct = 0, answered = 0 } = {}) {
  const right = wholeNumber(correct);
  const done = wholeNumber(answered);
  return { zh: `得分 ${right} / ${done}`, en: `Score ${right} / ${done}` };
}

/** The end-of-round sentence. 一轮结束时的总结句。 */
export function summaryText({ correct = 0, total = 0 } = {}) {
  const right = wholeNumber(correct);
  const count = wholeNumber(total);
  return { zh: `一共 ${count} 题，你答对了 ${right} 题。`, en: `You got ${right} of ${count} right.` };
}

/** "Correct! This is ..." or "Not quite. You chose ...; the answer is ...". 答对或答错的结论句。 */
export function verdictText(grade) {
  if (!grade) return null;
  const answer = QUADRANTS[grade.answer].name;
  if (grade.correct) {
    return { zh: `答对了！这是**${answer.zh}**。`, en: `Correct! This is **${answer.en}**.` };
  }
  const chosen = QUADRANTS[grade.chosen].name;
  return {
    zh: `还不对。你选的是**${chosen.zh}**，正确答案是**${answer.zh}**。`,
    en: `Not quite. You chose **${chosen.en}**; the answer is **${answer.en}**.`,
  };
}

/**
 * One line per step saying whether it was right and what the scenario really shows; a wrong line also names the
 * option the learner picked instead.
 * 每一步一行：这一步对不对，以及情境里实际是什么；错的那一行还会说出学习者误选的那一项。
 */
export function stepLines(grade) {
  const expected = grade ? partsOf(grade.answer) : null;
  if (!expected) return [];
  const sign = SIGN_INFO[expected.sign];
  const otherSign = SIGN_INFO[other(SIGNS, expected.sign)];
  const direction = DIRECTION_INFO[expected.direction];
  const otherDirection = DIRECTION_INFO[other(DIRECTIONS, expected.direction)];
  const signLine = grade.signCorrect
    ? {
      zh: `第 1 步对了：刺激被**${sign.word.zh}**了，所以是“${sign.term.zh}”（**${sign.term.en}**）。`,
      en: `Step 1 is right: a stimulus is **${sign.word.en}**, so it is ${sign.term.en}.`,
    }
    : {
      zh: `第 1 步错了：这里刺激是被**${sign.word.zh}**了，所以是“${sign.term.zh}”（**${sign.term.en}**），不是“${otherSign.term.zh}”。`,
      en: `Step 1 is wrong: here a stimulus is **${sign.word.en}**, so it is ${sign.term.en}, not ${otherSign.term.en}.`,
    };
  const directionLine = grade.directionCorrect
    ? {
      zh: `第 2 步对了：行为以后**${direction.word.zh}**，所以是${direction.term.zh}（**${direction.term.en}**）。`,
      en: `Step 2 is right: the behaviour becomes **${direction.word.en}**, so it is ${direction.term.en}.`,
    }
    : {
      zh: `第 2 步错了：行为以后**${direction.word.zh}**，所以是${direction.term.zh}（**${direction.term.en}**），不是${otherDirection.term.zh}。`,
      en: `Step 2 is wrong: the behaviour becomes **${direction.word.en}**, so it is ${direction.term.en}, not ${otherDirection.term.en}.`,
    };
  return [
    { step: 1, correct: grade.signCorrect, text: signLine },
    { step: 2, correct: grade.directionCorrect, text: directionLine },
  ];
}

/** Which steps went wrong, in one short sentence. 用一句短话说出错在哪几步。 */
export function wrongStepsText(grade) {
  const steps = grade?.wrongSteps ?? [];
  if (steps.length >= 2) return { zh: '两步都错了。', en: 'Both steps were wrong.' };
  if (steps.length === 1) return { zh: `第 ${steps[0]} 步错了。`, en: `Step ${steps[0]} was wrong.` };
  return { zh: '两步都对。', en: 'Both steps are right.' };
}

/** "stimulus removed (negative) + behaviour more likely (reinforcement) = negative reinforcement". 一格的组成规则。 */
export function ruleLine(id) {
  const parts = partsOf(id);
  if (!parts) return null;
  const sign = SIGN_INFO[parts.sign];
  const direction = DIRECTION_INFO[parts.direction];
  const name = QUADRANTS[id].name;
  return {
    zh: `${sign.word.zh}一个刺激（${sign.term.zh}）+ 行为${direction.word.zh}（${direction.term.zh}）= **${name.zh}**`,
    en: `${capitalize(`stimulus ${sign.word.en}`)} (${sign.term.en}) + behaviour ${direction.word.en} (${direction.term.en}) = **${name.en}**`,
  };
}

/**
 * A tip aimed at the mix-up behind a wrong answer: negative reinforcement taken for punishment (or the reverse) first,
 * then the generic tip for the wrong step. Null for a right answer.
 * 针对答错原因的提示：先看是不是把负强化当成了惩罚（或反过来），再给出错的那一步的通用提示。答对时为 null。
 */
export function confusionHint(grade) {
  if (!grade || grade.correct) return null;
  const chosen = QUADRANTS[grade.chosen];
  const answer = QUADRANTS[grade.answer];
  if (grade.answer === 'negative-reinforcement' && chosen.direction === 'decrease') return TEXT.hints.notPunishment;
  if (answer.direction === 'decrease' && grade.chosen === 'negative-reinforcement') return TEXT.hints.notNegativeReinforcement;
  return grade.directionCorrect ? TEXT.hints.sign : TEXT.hints.direction;
}

/* ---------- Screen-reader announcements 读屏播报 ---------- */

/** After step 1. 第 1 步之后。 */
export function announceSign(sign) {
  if (!SIGNS.includes(sign)) return '';
  const choice = TEXT.choices[sign];
  return `已选：${plain(choice.zh)}。请回答第 2 步。 Chosen: ${lowerFirst(plain(choice.en))}. Now answer step 2.`;
}

/** When the correct quadrant is shown. 显示正确格子的时候。 */
export function announceResult(grade, score) {
  if (!grade) return '';
  const verdict = verdictText(grade);
  const steps = wrongStepsText(grade);
  const points = scoreText(score);
  const zh = `${plain(verdict.zh)}${grade.correct ? '' : steps.zh}${points.zh}。`;
  const en = `${plain(verdict.en)} ${grade.correct ? '' : `${steps.en} `}${points.en}.`;
  return `${zh} ${en}`;
}

/** At the end of a round. 一轮结束时。 */
export function announceSummary(score) {
  const summary = summaryText(score);
  return `${TEXT.summaryHeading.zh}。${summary.zh} ${TEXT.summaryHeading.en}. ${summary.en}`;
}

/** When a new shuffled round starts. 新一轮（已打乱）开始时。 */
export function announceRestart() {
  return `${TEXT.restarted.zh} ${TEXT.restarted.en}`;
}
