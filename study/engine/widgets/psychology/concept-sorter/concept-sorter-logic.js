/**
 * Pure logic of the "concept-sorter" widget, a general sorting drill (content-spec section 5.5): the config
 * reader, the seeded order of the items, the state of one round (choose a category, go on to the next item,
 * start again), grading, the summary of a round and every sentence the widget shows. DOM-free.
 * concept-sorter 组件（通用分类练习，内容规范第 5.5 节）的纯逻辑：读取配置、带种子的题目顺序、一轮练习的状态
 * （选类别、下一题、重新开始）、判分、本轮总结，以及组件显示的每一句话。不依赖 DOM。
 *
 * Config: { title: Bi, prompt: Bi, categories: [{ id: "monocular", label: Bi }], items: [{ text: Bi, answer: "monocular", why: Bi }] }
 * The reader keeps everything tools/validate_content.py accepts (check_psychology_widget) exactly as written and
 * degrades gracefully otherwise: a bad category or item is dropped, a missing title or prompt gets the default.
 * 读取器原样保留校验器（check_psychology_widget）接受的一切配置；其余情况尽量降级：不合格的类别或题目被丢弃，缺少的标题或提问用默认值。
 *
 * A round is a plain object that the state functions never change; each returns a new object, or the same one
 * when the action does not apply (choosing twice, "next" before choosing):
 *   { round, seed, order: [item index...], position, phase: "asking" | "feedback" | "done",
 *     answers: [{ position, itemIndex, choice, correct }] }
 * 一轮练习是一个普通对象，状态函数从不修改它：每次返回新对象；动作不适用时（重复作答、还没作答就点“下一题”）原样返回同一个对象。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { scriptMix } from '../../../core/text/script-runs.js';
import { shuffleWith } from '../../../core/util/random.js';

// Sizes the content validator accepts (tools/validate_content.py, check_psychology_widget): 2-6 categories and
// 4-20 items. Longer lists are cut to the maximum; fewer usable entries than the minimum stop the drill.
// 内容校验器接受的数量：2-6 个类别、4-20 道题目。更长的列表截到上限；可用条目少于下限时不开始练习。
export const CATEGORY_LIMITS = Object.freeze({ min: 2, max: 6 });
export const ITEM_LIMITS = Object.freeze({ min: 4, max: 20 });

// Lowercase kebab-case ids, the validator's TERM_ID: "monocular", "positive-reinforcement", "stage-3".
// 小写短横线 id，与校验器的 TERM_ID 相同。
export const CATEGORY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DEFAULT_TITLE = Object.freeze({ zh: '分类练习', en: 'Sorting drill' });
export const DEFAULT_PROMPT = Object.freeze({ zh: '这一条属于哪一类？', en: 'Which category does this belong to?' });

export const PHASE = Object.freeze({ asking: 'asking', feedback: 'feedback', done: 'done' });

// "Try again" moves to the next seed while the new order would repeat the old one, at most this many times.
// “再练一次”时，如果新顺序和上一轮完全一样就换下一个种子，最多换这么多次。
const MAX_RESHUFFLES = 8;
// Step between the seeds of consecutive rounds (the golden-ratio constant, an odd number, so seeds do not cycle soon).
// 相邻两轮种子之间的步长（黄金分割常数，是奇数，种子不会很快循环）。
const SEED_STEP = 0x9e3779b9;

const bi = (zh, en) => Object.freeze({ zh, en });

/**
 * Fixed interface text of the widget, Chinese and English. The view takes every label from here, so the tests
 * can check all of it (both languages present, no emoji).
 * 组件固定的界面文字（中英双语）。视图的所有标签都从这里取，测试因此能检查全部文字（两种语言齐全、没有表情符号）。
 */
export const UI_TEXT = Object.freeze({
  eyebrow: bi('互动练习', 'Interactive drill'),
  intro: bi(
    '一次出一道题：读完以后，点它属于的类别，马上就能看到对错和原因。全部做完，再把答错的题目复习一遍。',
    'One item at a time: choose the category it belongs to and see right away whether you are right, and why. At the end, review the items you missed.'),
  item: bi('题目', 'Item'),
  progress: bi('完成进度', 'Progress'),
  correct: bi('答对了！', 'Correct!'),
  wrong: bi('不对。', 'Not quite.'),
  yourChoice: bi('你的选择', 'Your choice'),
  correctCategory: bi('正确类别', 'Correct category'),
  why: bi('为什么', 'Why'),
  next: bi('下一题', 'Next'),
  results: bi('看结果', 'See results'),
  summaryTitle: bi('练习结果', 'Results'),
  missedTitle: bi('答错的题目', 'Items you missed'),
  noneMissed: bi('这一轮没有答错的题目。', 'You did not miss any item this round.'),
  tryAgain: bi('再练一次', 'Try again'),
  tryAgainNote: bi('题目会重新打乱顺序，类别按钮的顺序不变。', 'The items are reshuffled; the category buttons keep their order.'),
  markChosenCorrect: bi('你的选择，正确', 'Your choice, correct'),
  markCorrect: bi('正确类别', 'Correct category'),
  markWrong: bi('你的选择，不正确', 'Your choice, incorrect'),
  restarted: bi('已重新打乱题目顺序，从第 1 题开始。', 'The items are reshuffled: starting again from item 1.'),
});

/* ---------- Config 配置 ---------- */

// A bilingual value with trimmed { zh, en } strings, or null when both are empty; a bare string is filed under
// the language it is written in (Chinese or mixed text goes to zh).
// 去掉首尾空白的双语值 { zh, en }；两者都为空时返回 null。纯字符串按书写语言归入 zh 或 en（中文或中英混排归入 zh）。
function readBi(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    const mix = scriptMix(text);
    return mix === 'zh' || mix === 'mixed' ? { zh: text, en: '' } : { zh: '', en: text };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const zh = typeof value.zh === 'string' ? value.zh.trim() : '';
  const en = typeof value.en === 'string' ? value.en.trim() : '';
  return zh || en ? { zh, en } : null;
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A trimmed id string, or '' (the validator's TERM_ID also lets one trailing newline through).
// 去掉首尾空白的 id 字符串，否则为 ''（校验器的 TERM_ID 也会放过末尾的一个换行符）。
function readId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Categories in config order: entries without a kebab-case id, repeats of an earlier id and entries past the
 * sixth are dropped (and counted). A category without a usable label is still shown, named after its id
 * ("positive-reinforcement" becomes "positive reinforcement").
 * 按配置顺序读取类别：没有短横线 id 的、重复前面 id 的、第 6 个以后的都被丢弃（并计数）。没有可用标签的类别仍然显示，用它的 id 当名字。
 */
function readCategories(list) {
  const categories = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const id = isRecord(raw) ? readId(raw.id) : '';
    if (!CATEGORY_ID.test(id) || seen.has(id) || categories.length >= CATEGORY_LIMITS.max) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    categories.push({ id, label: readBi(raw.label) ?? { zh: '', en: id.replace(/-/g, ' ') } });
  }
  return { categories, dropped };
}

/**
 * Items in config order: entries without text, with an answer that is not one of the kept category ids, and
 * entries past the twentieth are dropped (and counted). A missing `why` leaves the item without an explanation.
 * 按配置顺序读取题目：没有题面的、answer 不是保留下来的类别 id 的、第 20 道以后的都被丢弃（并计数）。缺少 why 时该题只是没有解释。
 */
function readItems(list, ids) {
  const items = [];
  let dropped = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const text = isRecord(raw) ? readBi(raw.text) : null;
    const answer = isRecord(raw) ? readId(raw.answer) : '';
    if (!text || !ids.has(answer) || items.length >= ITEM_LIMITS.max) {
      dropped += 1;
      continue;
    }
    items.push({ index: items.length, text, answer, why: readBi(raw.why) });
  }
  return { items, dropped };
}

/**
 * Reads a content config defensively; never throws. Returns
 *   { ok, problem, title, prompt, categories: [{ id, label }], items: [{ index, text, answer, why }],
 *     dropped: { categories, items } }
 * where title and prompt fall back to DEFAULT_TITLE and DEFAULT_PROMPT, label, text and why are trimmed
 * { zh, en } values (why may be null), and ok is false with problem "categories" (fewer than 2 usable
 * categories) or "items" (fewer than 4 usable items), in which case the widget shows invalidText() instead.
 * 防御性读取内容配置，绝不抛错。title 与 prompt 缺少时用默认值；label、text、why 是去掉首尾空白的 { zh, en }（why 可以是 null）；
 * 可用类别少于 2 个时 problem 为 "categories"，可用题目少于 4 道时为 "items"，此时 ok 为 false，组件改为显示 invalidText()。
 */
export function normalizeConceptSorterConfig(config) {
  const source = isRecord(config) ? config : {};
  const title = readBi(source.title) ?? { ...DEFAULT_TITLE };
  const prompt = readBi(source.prompt) ?? { ...DEFAULT_PROMPT };
  const { categories, dropped: droppedCategories } = readCategories(source.categories);
  const { items, dropped: droppedItems } = readItems(source.items, new Set(categories.map((category) => category.id)));
  let problem = null;
  if (categories.length < CATEGORY_LIMITS.min) problem = 'categories';
  else if (items.length < ITEM_LIMITS.min) problem = 'items';
  return {
    ok: problem === null,
    problem,
    title,
    prompt,
    categories,
    items,
    dropped: { categories: droppedCategories, items: droppedItems },
  };
}

/** The category with this id, or null. 指定 id 的类别；没有时为 null。 */
export function findCategory(model, id) {
  return (model?.categories ?? []).find((category) => category.id === id) ?? null;
}

/* ---------- Seeded order 带种子的顺序 ---------- */

/**
 * Small seeded generator (mulberry32) returning floats in [0, 1), so an order can be reproduced from its seed.
 * 小型可设种子的随机数生成器（mulberry32），返回 [0, 1) 的浮点数，同一个种子总能得到同样的顺序。
 */
export function createRandom(seed = 1) {
  let state = Number(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stable seed for a drill (FNV-1a over its items), so the first round of the same config always comes in the
 * same order while two different drills on one page do not share it.
 * 一个练习固定的种子（对题目做 FNV-1a 哈希）：同一份配置的第一轮顺序总是一样，同一页上两个不同的练习顺序不同。
 */
export function configSeed(model) {
  let hash = 0x811c9dc5;
  const text = (model?.items ?? []).map((item) => `${item.answer}|${item.text?.en ?? ''}|${item.text?.zh ?? ''}`).join('\n');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The seed of the round after the one played with `seed`. 用 seed 练过一轮之后，下一轮的种子。 */
export function nextSeed(seed) {
  return ((Number(seed) >>> 0) + SEED_STEP) >>> 0;
}

/**
 * The indices 0..count-1 shuffled (Fisher-Yates) by the generator seeded with `seed`; [] for a count that is
 * not a positive number.
 * 用 seed 设定的随机数生成器把 0..count-1 洗牌（Fisher-Yates）；count 不是正数时返回 []。
 */
export function shuffledOrder(count, seed) {
  const size = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  return shuffleWith(Array.from({ length: size }, (_, index) => index), createRandom(seed));
}

function sameOrder(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]);
}

/* ---------- One round 一轮练习 ---------- */

/**
 * A fresh round over all items in a seeded order (configSeed by default). With `avoid` (the previous round's
 * order), seeds that would give exactly that order again are skipped, so "Try again" always looks reshuffled.
 * The categories are not part of the round: their buttons keep the config order.
 * 新的一轮：所有题目按带种子的顺序排列（默认用 configSeed）。给出 avoid（上一轮的顺序）时，跳过会得到完全相同顺序的种子，
 * 所以“再练一次”看起来一定是重新洗过的。类别不在轮次里：按钮始终按配置顺序排列。
 */
export function startRound(model, { seed, round = 0, avoid = null } = {}) {
  const count = model?.items?.length ?? 0;
  let roundSeed = seed === undefined ? configSeed(model) : Number(seed) >>> 0;
  let order = shuffledOrder(count, roundSeed);
  for (let attempt = 0; attempt < MAX_RESHUFFLES && count > 1 && sameOrder(order, avoid); attempt += 1) {
    roundSeed = nextSeed(roundSeed);
    order = shuffledOrder(count, roundSeed);
  }
  return {
    round: Number.isInteger(round) && round >= 0 ? round : 0,
    seed: roundSeed,
    order,
    position: 0,
    phase: count ? PHASE.asking : PHASE.done,
    answers: [],
  };
}

/** The item being asked or just answered, or null once the round is done. 正在作答或刚作答的题目；本轮结束后为 null。 */
export function currentItem(state, model) {
  if (!state || state.phase === PHASE.done) return null;
  return model?.items?.[state.order?.[state.position]] ?? null;
}

/** The answer given to the current item (feedback phase), or null. 当前题目的作答记录（反馈阶段）；没有时为 null。 */
export function currentAnswer(state) {
  if (!state || state.phase !== PHASE.feedback) return null;
  const last = state.answers?.[state.answers.length - 1];
  return last && last.position === state.position ? last : null;
}

/** True while the current item is the last of the round. 当前题目是本轮最后一道时为 true。 */
export function isLastItem(state) {
  const total = Array.isArray(state?.order) ? state.order.length : 0;
  return total > 0 && state.position >= total - 1;
}

/**
 * Records the learner's category for the current item and moves to the feedback phase. Anything else (no
 * current question, an unknown category, a second choice) returns the same state unchanged.
 * 记录学习者为当前题目选的类别，进入反馈阶段。其他情况（没有正在作答的题、未知类别、重复作答）原样返回同一个状态。
 */
export function chooseCategory(state, model, categoryId) {
  if (!state || state.phase !== PHASE.asking) return state;
  const item = currentItem(state, model);
  const category = findCategory(model, categoryId);
  if (!item || !category) return state;
  const answer = { position: state.position, itemIndex: item.index, choice: category.id, correct: category.id === item.answer };
  return { ...state, phase: PHASE.feedback, answers: [...(state.answers ?? []), answer] };
}

/**
 * After the feedback, moves to the next item, or to the "done" phase after the last one. In any other phase it
 * returns the same state unchanged.
 * 看完反馈后进入下一题，最后一题之后进入 done 阶段。其他阶段原样返回同一个状态。
 */
export function goToNext(state) {
  if (!state || state.phase !== PHASE.feedback) return state;
  const position = state.position + 1;
  const total = Array.isArray(state.order) ? state.order.length : 0;
  return { ...state, position, phase: position >= total ? PHASE.done : PHASE.asking };
}

/** "Try again": a new round with the next seed and a different order of the same items. “再练一次”：换下一个种子、同样的题目换一个顺序重新开始。 */
export function restartRound(state, model) {
  const seed = nextSeed(state?.seed ?? configSeed(model));
  return startRound(model, { seed, round: (state?.round ?? 0) + 1, avoid: state?.order ?? null });
}

/**
 * Where the round stands: { position (1-based number of the current item, the total once done), total,
 * answered, correct, ratio (answered / total, for the progress bar), done }.
 * 本轮进度：{ position（当前题目的序号，从 1 开始；结束后等于总数）, total, answered, correct, ratio（已答 / 总数，用于进度条）, done }。
 */
export function progressOf(state) {
  const total = state?.order?.length ?? 0;
  const answers = state?.answers ?? [];
  const position = total ? Math.min(total, (state?.position ?? 0) + 1) : 0;
  return {
    position,
    total,
    answered: answers.length,
    correct: answers.filter((answer) => answer.correct).length,
    ratio: total ? Math.min(1, answers.length / total) : 0,
    done: state?.phase === PHASE.done,
  };
}

/* ---------- Grading 判分 ---------- */

/**
 * Grades a category for an item: { correct, choice, answer }, where choice and answer are the chosen and the
 * correct category (choice is null for an unknown id); null when there is no item.
 * 给某道题的某个类别判分：{ correct, choice, answer }，choice 与 answer 分别是所选类别和正确类别（未知 id 时 choice 为 null）；没有题目时返回 null。
 */
export function gradeChoice(model, item, categoryId) {
  if (!item) return null;
  const choice = findCategory(model, categoryId);
  return { correct: Boolean(choice) && choice.id === item.answer, choice, answer: findCategory(model, item.answer) };
}

/**
 * How each category button looks after a choice, in category order: [{ id, state, chosen }], where state is
 * "correct" for the right category, "wrong" for a wrong choice and "other" for the rest.
 * 作答后每个类别按钮的样子（按类别顺序）：[{ id, state, chosen }]；正确类别为 "correct"，选错的为 "wrong"，其余为 "other"。
 */
export function choiceStates(model, item, categoryId) {
  return (model?.categories ?? []).map((category) => {
    const chosen = category.id === categoryId;
    let state = 'other';
    if (item && category.id === item.answer) state = 'correct';
    else if (chosen) state = 'wrong';
    return { id: category.id, state, chosen };
  });
}

/**
 * The category index a number key picks: "1" to the number of categories give 0 to count - 1, anything else -1.
 * 数字键对应的类别下标：“1”到类别数分别对应 0 到 count - 1，其他按键为 -1。
 */
export function shortcutIndex(key, count) {
  if (typeof key !== 'string' || !/^[1-9]$/.test(key)) return -1;
  const index = Number(key) - 1;
  return index < Math.min(Number(count) || 0, CATEGORY_LIMITS.max) ? index : -1;
}

/**
 * True for the second (or a later) click of a double-click, from the click event's `detail` (1 for a single
 * click, 0 when the keyboard pressed the button). Each press changes what lies under the pointer: "Try again"
 * brings back the category buttons about where it was, and a choice low on the screen scrolls the feedback, with
 * its Next button, up under the pointer. The second click of a double-click would then answer the first item of
 * the new round unread, or skip the feedback, so the category, Next and Try again buttons ignore such a click.
 * 根据 click 事件的 detail（单击为 1，键盘按下按钮时为 0）判断这是不是双击中的第二次（或之后的）点击。每按一次，指针下面的东西都会变：
 * “再练一次”之后类别按钮出现在差不多它原来的位置；在屏幕下方选类别时，反馈连同“下一题”按钮会滚到指针下面。双击的第二次点击于是会在
 * 还没读题时替新一轮的第一题作答，或者跳过反馈；所以类别按钮、“下一题”和“再练一次”都忽略这种点击。
 */
export function isRepeatClick(detail) {
  return typeof detail === 'number' && detail > 1;
}

/** Whole-number percentage, 0 when there is nothing to count. 取整的百分数；总数为 0 时为 0。 */
export function percentOf(part, total) {
  return total > 0 ? Math.round((100 * part) / total) : 0;
}

/**
 * The summary of a round: { total, answered, correct, wrong, percent, perfect, missed }, where missed lists
 * { item, choice, answer } for every wrong answer, in the order the items were asked.
 * 一轮的总结：{ total, answered, correct, wrong, percent, perfect, missed }；missed 按出题顺序列出每道答错的题 { item, choice, answer }。
 */
export function summarizeRound(state, model) {
  const total = state?.order?.length ?? 0;
  const answers = state?.answers ?? [];
  const correct = answers.filter((answer) => answer.correct).length;
  const missed = answers
    .filter((answer) => !answer.correct)
    .map((answer) => {
      const item = model?.items?.[answer.itemIndex] ?? null;
      return { item, choice: findCategory(model, answer.choice), answer: item ? findCategory(model, item.answer) : null };
    })
    .filter((entry) => entry.item);
  return {
    total,
    answered: answers.length,
    correct,
    wrong: answers.length - correct,
    percent: percentOf(correct, total),
    perfect: total > 0 && correct === total,
    missed,
  };
}

/* ---------- Text 文字 ---------- */

/**
 * One language of a bilingual value, falling back to the other (trimmed); '' when both are missing.
 * 双语值的一种语言，缺失时用另一种代替（去掉首尾空白）；两者都没有时为 ''。
 */
export function textIn(value, language) {
  const read = (key) => (typeof value?.[key] === 'string' ? value[key].trim() : '');
  return read(language) || read(language === 'zh' ? 'en' : 'zh');
}

// Content text for the live region: inline markup removed and line breaks turned into spaces.
// 用于朗读区域的内容文字：去掉行内标记，换行变成空格。
function plain(text) {
  return stripMarkup(text).replace(/\s*\n\s*/g, ' ').trim();
}

// "1 category", "3 categories". 英文单复数。
function counted(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "第 3 题，共 10 题" / "Item 3 of 10". */
export function progressText(progress) {
  const position = progress?.position ?? 0;
  const total = progress?.total ?? 0;
  return { zh: `第 ${position} 题，共 ${total} 题`, en: `Item ${position} of ${total}` };
}

/** The progress bar's value text: "已完成 2 题，共 10 题" / "2 of 10 answered". 进度条的数值说明。 */
export function progressValueText(progress) {
  const answered = progress?.answered ?? 0;
  const total = progress?.total ?? 0;
  return { zh: `已完成 ${answered} 题，共 ${total} 题`, en: `${answered} of ${total} answered` };
}

/** The verdict line after a choice. 作答后的判断语。 */
export function verdictText(correct) {
  return correct ? UI_TEXT.correct : UI_TEXT.wrong;
}

/** The label of the button after the feedback: "下一题 Next", or "看结果 See results" on the last item. 反馈后按钮的文字。 */
export function nextLabel(state) {
  return isLastItem(state) ? UI_TEXT.results : UI_TEXT.next;
}

/** The keyboard hint under the category buttons. 类别按钮下方的键盘提示。 */
export function keyHintText(count) {
  const last = Math.max(1, Math.min(Number(count) || 0, CATEGORY_LIMITS.max));
  return {
    zh: `键盘：按数字键 1–${last} 也能选择类别。`,
    en: `Keyboard: you can also press 1–${last} to choose a category.`,
  };
}

/** "答对 8 题，共 10 题（80%）。" / "You got 8 of 10 right (80%)." */
export function scoreText(summary) {
  const correct = summary?.correct ?? 0;
  const total = summary?.total ?? 0;
  const percent = summary?.percent ?? percentOf(correct, total);
  return {
    zh: `答对 ${correct} 题，共 ${total} 题（${percent}%）。`,
    en: `You got ${correct} of ${total} right (${percent}%).`,
  };
}

/** What to do next, after the score. 成绩之后的建议。 */
export function scoreAdvice(summary) {
  if (summary?.perfect) {
    return {
      zh: '全部答对！再练一次时题目会换一个顺序，可以检查自己是真的会分，而不是记住了顺序。',
      en: 'All correct! Try again with the items in a new order to check that you really know them and did not just remember the order.',
    };
  }
  return {
    zh: '先看下面答错的题目和原因，弄明白以后再练一次。',
    en: 'Read the items you missed and why, then try again.',
  };
}

/** "答错的题目（2）" / "Items you missed (2)". */
export function missedTitle(summary) {
  const count = summary?.missed?.length ?? 0;
  return { zh: `${UI_TEXT.missedTitle.zh}（${count}）`, en: `${UI_TEXT.missedTitle.en} (${count})` };
}

/**
 * The short message shown instead of the drill when the config has too few usable categories or items.
 * 配置里可用的类别或题目太少时，代替练习显示的简短说明。
 */
export function invalidText(model) {
  const categories = model?.categories?.length ?? 0;
  const items = model?.items?.length ?? 0;
  return {
    zh: `这个分类练习暂时用不了：至少需要 ${CATEGORY_LIMITS.min} 个有效的类别和 ${ITEM_LIMITS.min} 道有效的题目，`
      + `现在有 ${categories} 个类别、${items} 道题目。`,
    en: `This sorting drill cannot start: it needs at least ${CATEGORY_LIMITS.min} valid categories and `
      + `${ITEM_LIMITS.min} valid items, but it has ${counted(categories, 'category', 'categories')} and ${counted(items, 'item', 'items')}.`,
  };
}

/**
 * What the live region says after a choice, in both languages: the verdict, the chosen category when it was
 * wrong, the correct category and the reason. Inline markup is removed.
 * 作答后朗读区域播报的内容（中英双语）：判断、选错时所选的类别、正确类别和原因；去掉行内标记。
 */
export function choiceAnnouncement(model, item, categoryId) {
  const grade = gradeChoice(model, item, categoryId);
  if (!grade) return '';
  const zh = [UI_TEXT[grade.correct ? 'correct' : 'wrong'].zh];
  const en = [UI_TEXT[grade.correct ? 'correct' : 'wrong'].en];
  if (!grade.correct && grade.choice) {
    zh.push(`${UI_TEXT.yourChoice.zh}：${plain(textIn(grade.choice.label, 'zh'))}。`);
    en.push(`${UI_TEXT.yourChoice.en}: ${plain(textIn(grade.choice.label, 'en'))}.`);
  }
  if (grade.answer) {
    zh.push(`${UI_TEXT.correctCategory.zh}：${plain(textIn(grade.answer.label, 'zh'))}。`);
    en.push(`${UI_TEXT.correctCategory.en}: ${plain(textIn(grade.answer.label, 'en'))}.`);
  }
  if (item.why?.zh) zh.push(`${UI_TEXT.why.zh}：${plain(item.why.zh)}`);
  if (item.why?.en) en.push(`${UI_TEXT.why.en}: ${plain(item.why.en)}`);
  return `${zh.join('')} ${en.join(' ')}`;
}

/** What the live region says when the round is over. 本轮结束时朗读区域播报的内容。 */
export function summaryAnnouncement(summary) {
  const score = scoreText(summary);
  return `练习完成。${score.zh} Finished. ${score.en}`;
}

/** What the live region says after "Try again". 点“再练一次”后朗读区域播报的内容。 */
export function restartAnnouncement() {
  return `${UI_TEXT.restarted.zh} ${UI_TEXT.restarted.en}`;
}
