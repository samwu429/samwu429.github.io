import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_ID,
  CATEGORY_LIMITS,
  DEFAULT_PROMPT,
  DEFAULT_TITLE,
  ITEM_LIMITS,
  PHASE,
  UI_TEXT,
  choiceAnnouncement,
  choiceStates,
  chooseCategory,
  configSeed,
  createRandom,
  currentAnswer,
  currentItem,
  findCategory,
  goToNext,
  gradeChoice,
  invalidText,
  isLastItem,
  isRepeatClick,
  keyHintText,
  missedTitle,
  nextLabel,
  nextSeed,
  normalizeConceptSorterConfig,
  percentOf,
  progressOf,
  progressText,
  progressValueText,
  restartAnnouncement,
  restartRound,
  scoreAdvice,
  scoreText,
  shortcutIndex,
  shuffledOrder,
  startRound,
  summarizeRound,
  summaryAnnouncement,
  textIn,
  verdictText,
} from '../../../engine/widgets/psychology/concept-sorter/concept-sorter-logic.js';

const bi = (zh, en) => ({ zh, en });
// The pictographic ranges the content validator rejects (tools/validate_content.py, EMOJI).
// 内容校验器拒绝的图形符号范围（tools/validate_content.py 中的 EMOJI）。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const CJK = /[一-鿿]/u;
const range = (count) => Array.from({ length: count }, (_, index) => index);
const sorted = (list) => [...list].sort((a, b) => a - b);

// Textbook Chapter 4 p.141 (King & Urbszat): binocular cues (disparity, convergence) and monocular cues (linear
// perspective, overlap, texture gradient, clarity). Shaped like a lesson config the validator accepts.
// 教材第 4 章第 141 页：双眼线索（视差、辐合）与单眼线索（线性透视、遮挡、纹理梯度、清晰度）；形状与校验器接受的讲义配置相同。
const DEPTH_CUES = Object.freeze({
  title: bi('单眼线索还是双眼线索？', 'Monocular or binocular cue?'),
  prompt: bi('这是哪一种深度线索？', 'Which kind of depth cue is this?'),
  categories: [
    { id: 'monocular-cues', label: bi('单眼线索', 'Monocular cues') },
    { id: 'binocular-cues', label: bi('双眼线索', 'Binocular cues') },
  ],
  items: [
    {
      text: bi('铁轨的两条边在远处看起来汇合在一起。', 'The sides of a railway seem to come together in the distance.'),
      answer: 'monocular-cues',
      why: bi('线性透视（**linear perspective**）：平行线随距离看起来汇聚，只用一只眼也能看到。', 'Linear perspective is a **monocular** cue.'),
    },
    {
      text: bi('看鼻尖前的手指时，两只眼睛向内靠拢。', 'Your eyes move closer together to focus on a finger near your nose.'),
      answer: 'binocular-cues',
      why: bi('辐合（**convergence**）：两只眼睛的肌肉运动告诉大脑物体有多远。', 'Convergence uses the muscle movements of both eyes.'),
    },
    {
      text: bi('一棵树挡住了房子的一部分，所以树看起来更近。', 'A tree partly hides a house, so the tree looks closer.'),
      answer: 'monocular-cues',
      why: bi('遮挡（**overlap**）：挡住别的物体的那个更近。', 'Overlap is a monocular cue.'),
    },
    {
      text: bi('左眼和右眼看到的手的图像略有不同。', 'Your left and right eyes get slightly different images of your hand.'),
      answer: 'binocular-cues',
      why: bi('视差（**disparity**）：两只眼睛的图像差别越大，物体越近。', 'Disparity compares the images in the two eyes.'),
    },
    {
      text: bi('远处草地的纹理看起来更密、更细。', 'The texture of a field looks denser and finer farther away.'),
      answer: 'monocular-cues',
      why: bi('纹理梯度（**texture gradient**）：越远，纹理越密越细。', 'Texture gradient is a monocular cue.'),
    },
    {
      text: bi('看得更清楚的东西似乎更近。', 'Objects that look clearer seem closer.'),
      answer: 'monocular-cues',
      why: { zh: '清晰度（**clarity**）：空气里有水汽、污染物和热浪，看得清楚的东西往往更近。' },
    },
  ],
});

// A config with n categories and m items, every item answering category (index mod n).
// 生成 n 个类别、m 道题目的配置，第 i 道题的答案是第 (i mod n) 个类别。
function makeConfig(categoryCount, itemCount) {
  const categories = range(categoryCount).map((index) => ({ id: `type-${index + 1}`, label: bi(`类别 ${index + 1}`, `Type ${index + 1}`) }));
  const items = range(itemCount).map((index) => ({
    text: bi(`第 ${index + 1} 条`, `Statement ${index + 1}`),
    answer: categories[index % categoryCount].id,
    why: bi(`原因 ${index + 1}`, `Reason ${index + 1}`),
  }));
  return { categories, items };
}

// Plays a round, choosing `pick(item)` for every item, and returns the final state.
// 用 pick(item) 给每道题选类别，玩完一轮，返回最后的状态。
function playRound(model, pick, start = startRound(model)) {
  let state = start;
  while (state.phase !== PHASE.done) {
    state = chooseCategory(state, model, pick(currentItem(state, model)));
    state = goToNext(state);
  }
  return state;
}

const DEPTH = normalizeConceptSorterConfig(DEPTH_CUES);
const other = (item) => (item.answer === 'monocular-cues' ? 'binocular-cues' : 'monocular-cues');

/* ---------- Limits 上限 ---------- */

test('limits and the id pattern match the validator (2-6 categories, 4-20 items, kebab-case ids)', () => {
  assert.deepEqual(CATEGORY_LIMITS, { min: 2, max: 6 });
  assert.deepEqual(ITEM_LIMITS, { min: 4, max: 20 });
  for (const id of ['monocular', 'monocular-cues', 'stage-3', 'n1', 'positive-reinforcement', '3']) {
    assert.ok(CATEGORY_ID.test(id), id);
  }
  for (const id of ['', 'Monocular', 'depth cue', 'depth_cue', '-cue', 'cue-', 'a--b', 'café', 'cue\n']) {
    assert.ok(!CATEGORY_ID.test(id), JSON.stringify(id));
  }
  assert.deepEqual(PHASE, { asking: 'asking', feedback: 'feedback', done: 'done' });
});

/* ---------- Config 配置 ---------- */

test('normalizeConceptSorterConfig reads a full config exactly as written', () => {
  assert.equal(DEPTH.ok, true);
  assert.equal(DEPTH.problem, null);
  assert.deepEqual(DEPTH.title, DEPTH_CUES.title);
  assert.deepEqual(DEPTH.prompt, DEPTH_CUES.prompt);
  assert.deepEqual(DEPTH.categories, DEPTH_CUES.categories);
  assert.deepEqual(DEPTH.items.map((item) => item.index), range(6));
  DEPTH.items.forEach((item, index) => {
    const source = DEPTH_CUES.items[index];
    assert.deepEqual(item.text, source.text);
    assert.equal(item.answer, source.answer);
    assert.deepEqual(item.why, { zh: source.why.zh, en: source.why.en ?? '' });
  });
  assert.deepEqual(DEPTH.dropped, { categories: 0, items: 0 });
});

test('every config the validator accepts is kept whole', () => {
  const smallest = makeConfig(2, 4);
  const largest = { title: bi('学习的类型', 'Types of learning'), prompt: bi('哪一种？', 'Which type?'), ...makeConfig(6, 20) };
  // The validator ignores unknown keys on categories, items and the config, and needs only zh in why.
  // 校验器不管类别、题目和配置里多出来的键，why 也只要求有中文。
  const extras = {
    note: 'ignored',
    categories: [
      { id: 'stage-3', label: bi('第 3 期', 'Stage 3'), colour: 'green' },
      { id: 'n1', label: bi('N1 期', 'Stage N1') },
    ],
    items: range(4).map((index) => ({
      text: bi(`第 ${index} 条`, `Item ${index}`),
      answer: index % 2 ? 'n1' : 'stage-3',
      why: { zh: `只有中文的原因 ${index}` },
      source: 'p.141',
    })),
  };
  // Python's re.match lets "$" match before one trailing newline, so TERM_ID accepts "monocular\n".
  // Python 的 re.match 中 "$" 可以匹配末尾换行符之前的位置，所以 TERM_ID 接受 "monocular\n"。
  const newline = {
    categories: [{ id: 'monocular\n', label: bi('单眼', 'Monocular') }, { id: 'binocular', label: bi('双眼', 'Binocular') }],
    items: range(4).map((index) => ({ text: bi(`第 ${index} 条`, `Item ${index}`), answer: index % 2 ? 'binocular' : 'monocular\n', why: bi('原因', 'Reason') })),
  };
  for (const config of [smallest, largest, extras, newline]) {
    const model = normalizeConceptSorterConfig(config);
    assert.equal(model.ok, true);
    assert.deepEqual(model.dropped, { categories: 0, items: 0 });
    assert.deepEqual(model.categories.map((category) => category.label), config.categories.map((category) => category.label));
    assert.deepEqual(model.categories.map((category) => category.id), config.categories.map((category) => category.id.trim()));
    assert.deepEqual(model.items.map((item) => item.text), config.items.map((item) => item.text));
    assert.deepEqual(model.items.map((item) => item.answer), config.items.map((item) => item.answer.trim()));
    assert.deepEqual(model.items.map((item) => item.why.zh), config.items.map((item) => item.why.zh));
  }
  const model = normalizeConceptSorterConfig(largest);
  assert.deepEqual(model.title, largest.title);
  assert.deepEqual(model.prompt, largest.prompt);
});

test('title and prompt are optional and fall back to the defaults', () => {
  assert.deepEqual(DEFAULT_TITLE, { zh: '分类练习', en: 'Sorting drill' });
  assert.deepEqual(DEFAULT_PROMPT, { zh: '这一条属于哪一类？', en: 'Which category does this belong to?' });
  for (const value of [undefined, null, '', '   ', {}, { zh: ' ', en: '' }, [], 42, true]) {
    const model = normalizeConceptSorterConfig({ ...makeConfig(2, 4), title: value, prompt: value });
    assert.deepEqual(model.title, DEFAULT_TITLE);
    assert.deepEqual(model.prompt, DEFAULT_PROMPT);
  }
  // The defaults are copied, so changing a model cannot change them. 默认值是复制出来的，改模型改不到它们。
  const model = normalizeConceptSorterConfig(makeConfig(2, 4));
  model.title.en = 'changed';
  model.prompt.zh = '改了';
  assert.equal(DEFAULT_TITLE.en, 'Sorting drill');
  assert.equal(DEFAULT_PROMPT.zh, '这一条属于哪一类？');
  // One language is kept as it is; a bare string is filed by its script; spaces are trimmed.
  // 只有一种语言时原样保留；纯字符串按书写语言归类；首尾空白被去掉。
  const partial = normalizeConceptSorterConfig({ ...makeConfig(2, 4), title: { zh: ' 意识水平 ' }, prompt: 'Which level of awareness?' });
  assert.deepEqual(partial.title, { zh: '意识水平', en: '' });
  assert.deepEqual(partial.prompt, { zh: '', en: 'Which level of awareness?' });
  assert.deepEqual(normalizeConceptSorterConfig({ ...makeConfig(2, 4), title: '药物 drugs' }).title, { zh: '药物 drugs', en: '' });
});

test('long lists are cut to 6 categories and 20 items, and the cut entries are counted', () => {
  const config = makeConfig(8, 24);
  const model = normalizeConceptSorterConfig(config);
  assert.equal(model.ok, true);
  assert.deepEqual(model.categories.map((category) => category.id), range(6).map((index) => `type-${index + 1}`));
  // Items 7 and 8 of every 8 answer a category that was cut, so they go too; the first 20 others stay.
  // 每 8 道题里第 7、8 道的答案是被截掉的类别，所以也被丢弃；其余的保留前 20 道。
  const expected = config.items.filter((item) => !['type-7', 'type-8'].includes(item.answer));
  assert.equal(expected.length, 18);
  assert.deepEqual(model.items.map((item) => item.text), expected.map((item) => item.text));
  assert.deepEqual(model.dropped, { categories: 2, items: 6 });

  const many = normalizeConceptSorterConfig(makeConfig(2, 25));
  assert.equal(many.items.length, 20);
  assert.deepEqual(many.items.map((item) => item.index), range(20));
  assert.deepEqual(many.items.map((item) => item.text.en), range(20).map((index) => `Statement ${index + 1}`));
  assert.equal(many.dropped.items, 5);
});

test('categories the validator rejects are dropped; repeated ids keep the first one', () => {
  const [monocular, binocular] = DEPTH_CUES.categories;
  const model = normalizeConceptSorterConfig({
    categories: [
      null, 'monocular-cues', 42, [], {}, { id: '' }, { id: 7, label: bi('七', 'Seven') },
      { id: 'Monocular', label: bi('大写', 'Uppercase') }, { id: 'depth cue', label: bi('空格', 'Space') },
      { id: 'depth_cue', label: bi('下划线', 'Underscore') }, { id: '-cue', label: bi('开头', 'Leading') },
      { id: 'cue-', label: bi('结尾', 'Trailing') }, { id: 'a--b', label: bi('双横线', 'Double') },
      monocular,
      { id: 'monocular-cues', label: bi('重复', 'Repeat') },
      { id: ' binocular-cues ', label: binocular.label },
    ],
    items: DEPTH_CUES.items,
  });
  assert.deepEqual(model.categories, [monocular, binocular]);
  assert.equal(model.dropped.categories, 14);
  assert.equal(model.items.length, 6);
});

test('a category without a usable label is named after its id', () => {
  const model = normalizeConceptSorterConfig({
    categories: [{ id: 'positive-reinforcement' }, { id: 'negative-punishment', label: { zh: '  ', en: '' } }],
    items: makeConfig(2, 4).items.map((item, index) => ({ ...item, answer: index % 2 ? 'negative-punishment' : 'positive-reinforcement' })),
  });
  assert.equal(model.ok, true);
  assert.deepEqual(model.categories.map((category) => category.label), [
    { zh: '', en: 'positive reinforcement' },
    { zh: '', en: 'negative punishment' },
  ]);
});

test('items the validator rejects are dropped and the rest keep their order', () => {
  const [first, second, third, fourth] = DEPTH_CUES.items;
  const model = normalizeConceptSorterConfig({
    categories: DEPTH_CUES.categories,
    items: [
      null, 'text', 3, [], first,
      { answer: 'monocular-cues', why: first.why },
      { text: bi('  ', ' '), answer: 'monocular-cues' },
      { text: first.text, answer: 'unknown' },
      { text: first.text, answer: 5 },
      { text: first.text, answer: 'Monocular-cues' },
      second,
      // Spaces around an answer are trimmed. answer 首尾的空白会被去掉。
      { ...third, answer: ' monocular-cues ' },
      // Without why the item stays, with no explanation. 没有 why 时题目保留，只是没有解释。
      { text: fourth.text, answer: fourth.answer },
      // A bare string is filed by its script. 纯字符串按书写语言归类。
      { text: 'Railway tracks seem to meet far away.', answer: 'monocular-cues', why: '线性透视' },
    ],
  });
  assert.equal(model.ok, true);
  assert.deepEqual(model.items.map((item) => item.index), range(5));
  assert.deepEqual(model.items.map((item) => item.text.en), [first.text.en, second.text.en, third.text.en, fourth.text.en, 'Railway tracks seem to meet far away.']);
  assert.equal(model.items[2].answer, 'monocular-cues');
  assert.equal(model.items[3].why, null);
  assert.deepEqual(model.items[4].text, { zh: '', en: 'Railway tracks seem to meet far away.' });
  assert.deepEqual(model.items[4].why, { zh: '线性透视', en: '' });
  assert.equal(model.dropped.items, 9);
});

test('too few usable entries stop the drill with a reason, and junk never throws', () => {
  const noCategories = normalizeConceptSorterConfig({});
  assert.deepEqual([noCategories.ok, noCategories.problem], [false, 'categories']);
  assert.deepEqual([noCategories.categories, noCategories.items], [[], []]);
  assert.deepEqual(noCategories.title, DEFAULT_TITLE);

  const oneCategory = normalizeConceptSorterConfig(makeConfig(1, 10));
  assert.deepEqual([oneCategory.ok, oneCategory.problem], [false, 'categories']);

  const threeItems = normalizeConceptSorterConfig(makeConfig(2, 3));
  assert.deepEqual([threeItems.ok, threeItems.problem], [false, 'items']);

  const config = makeConfig(2, 5);
  config.items[0].answer = 'missing';
  config.items[3].text = '';
  const thinned = normalizeConceptSorterConfig(config);
  assert.deepEqual([thinned.ok, thinned.problem, thinned.items.length, thinned.dropped.items], [false, 'items', 3, 2]);

  const junk = [
    undefined, null, 0, 42, 'text', [], true, () => {}, Object.create(null),
    { categories: 'x', items: {} }, { categories: [null], items: [undefined] },
    { categories: [{ id: 'a', label: bi('甲', 'A') }, { id: 'b', label: null }], items: [null, null, null, null] },
  ];
  for (const value of junk) {
    const model = normalizeConceptSorterConfig(value);
    assert.equal(model.ok, false);
    assert.ok(['categories', 'items'].includes(model.problem));
    assert.deepEqual(model.prompt, DEFAULT_PROMPT);
  }
});

test('findCategory finds a category by id', () => {
  assert.deepEqual(findCategory(DEPTH, 'binocular-cues'), DEPTH_CUES.categories[1]);
  for (const id of ['unknown', '', undefined, null]) assert.equal(findCategory(DEPTH, id), null);
  assert.equal(findCategory(null, 'binocular-cues'), null);
});

/* ---------- Seeded order 带种子的顺序 ---------- */

test('createRandom is reproducible and stays in [0, 1)', () => {
  const a = createRandom(42);
  const b = createRandom(42);
  const values = range(500).map(() => a());
  assert.deepEqual(values, range(500).map(() => b()));
  assert.ok(values.every((value) => value >= 0 && value < 1));
  assert.notDeepEqual(range(5).map(createRandom(1)), range(5).map(createRandom(2)));
  // A seed that is not a number still gives a working generator. 种子不是数字时生成器照样能用。
  const odd = createRandom('x');
  assert.ok(Number.isFinite(odd()));
});

test('shuffledOrder gives a reproducible permutation of the item indices', () => {
  for (let count = 0; count <= 20; count += 1) {
    for (const seed of [0, 1, 7, 123456789, 4294967295]) {
      const order = shuffledOrder(count, seed);
      assert.deepEqual(sorted(order), range(count));
      assert.deepEqual(shuffledOrder(count, seed), order);
    }
  }
  for (const count of [-3, NaN, undefined, null, 'x', Infinity]) assert.deepEqual(shuffledOrder(count, 1), []);
  assert.deepEqual(sorted(shuffledOrder(4.7, 1)), range(4));
  // Different seeds give different orders. 不同的种子给出不同的顺序。
  const orders = new Set(range(50).map((seed) => shuffledOrder(10, seed).join(',')));
  assert.ok(orders.size >= 45, `only ${orders.size} different orders`);
});

test('configSeed is stable for a drill and differs between drills', () => {
  const seed = configSeed(DEPTH);
  assert.equal(seed, configSeed(normalizeConceptSorterConfig(DEPTH_CUES)));
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
  const reordered = normalizeConceptSorterConfig({ ...DEPTH_CUES, items: [...DEPTH_CUES.items].reverse() });
  assert.notEqual(configSeed(reordered), seed);
  assert.notEqual(configSeed(normalizeConceptSorterConfig(makeConfig(2, 6))), seed);
  assert.ok(Number.isInteger(configSeed(null)));
});

test('nextSeed steps to a different 32-bit seed', () => {
  for (const seed of [0, 1, 99, 4294967295]) {
    const next = nextSeed(seed);
    assert.ok(Number.isInteger(next) && next >= 0 && next < 2 ** 32);
    assert.notEqual(next, seed);
    assert.equal(nextSeed(seed), next);
  }
  assert.ok(Number.isInteger(nextSeed(NaN)));
});

/* ---------- One round 一轮练习 ---------- */

test('startRound begins at the first item of a seeded order', () => {
  const state = startRound(DEPTH);
  assert.deepEqual(Object.keys(state).sort(), ['answers', 'order', 'phase', 'position', 'round', 'seed']);
  assert.equal(state.round, 0);
  assert.equal(state.seed, configSeed(DEPTH));
  assert.deepEqual(state.order, shuffledOrder(6, state.seed));
  assert.deepEqual(sorted(state.order), range(6));
  assert.deepEqual([state.position, state.phase, state.answers], [0, PHASE.asking, []]);
  assert.equal(currentItem(state, DEPTH), DEPTH.items[state.order[0]]);
  assert.equal(currentAnswer(state), null);

  const seeded = startRound(DEPTH, { seed: 5, round: 3 });
  assert.deepEqual([seeded.seed, seeded.round], [5, 3]);
  assert.deepEqual(seeded.order, shuffledOrder(6, 5));
  assert.equal(startRound(DEPTH, { round: -2 }).round, 0);

  const empty = startRound(normalizeConceptSorterConfig({}));
  assert.deepEqual([empty.order, empty.phase], [[], PHASE.done]);
  assert.equal(currentItem(empty, normalizeConceptSorterConfig({})), null);
});

test('chooseCategory records the answer, shows the feedback and never changes the old state', () => {
  const start = startRound(DEPTH);
  const snapshot = structuredClone(start);
  const item = currentItem(start, DEPTH);

  const right = chooseCategory(start, DEPTH, item.answer);
  assert.deepEqual(start, snapshot);
  assert.equal(right.phase, PHASE.feedback);
  assert.deepEqual(right.answers, [{ position: 0, itemIndex: item.index, choice: item.answer, correct: true }]);
  assert.deepEqual(currentAnswer(right), right.answers[0]);
  assert.equal(currentItem(right, DEPTH), item);

  const wrong = chooseCategory(start, DEPTH, other(item));
  assert.deepEqual(wrong.answers, [{ position: 0, itemIndex: item.index, choice: other(item), correct: false }]);

  // Unknown categories, a second choice and missing states change nothing. 未知类别、重复作答、缺少状态都不改变任何东西。
  for (const id of ['unknown', '', undefined, null, 'Monocular-cues']) assert.equal(chooseCategory(start, DEPTH, id), start);
  assert.equal(chooseCategory(right, DEPTH, other(item)), right);
  assert.equal(chooseCategory(null, DEPTH, item.answer), null);
});

test('goToNext moves on after the feedback and ends the round after the last item', () => {
  let state = startRound(DEPTH);
  assert.equal(goToNext(state), state);
  for (let position = 0; position < 6; position += 1) {
    assert.equal(state.position, position);
    assert.equal(isLastItem(state), position === 5);
    assert.deepEqual(nextLabel(state), position === 5 ? UI_TEXT.results : UI_TEXT.next);
    state = chooseCategory(state, DEPTH, currentItem(state, DEPTH).answer);
    state = goToNext(state);
    assert.equal(state.phase, position === 5 ? PHASE.done : PHASE.asking);
  }
  assert.equal(currentItem(state, DEPTH), null);
  assert.equal(currentAnswer(state), null);
  assert.equal(goToNext(state), state);
  assert.equal(chooseCategory(state, DEPTH, 'monocular-cues'), state);
  assert.equal(goToNext(undefined), undefined);
  assert.equal(isLastItem(null), false);
});

test('progressOf follows the round: item number, answers and the bar ratio', () => {
  let state = startRound(DEPTH);
  assert.deepEqual(progressOf(state), { position: 1, total: 6, answered: 0, correct: 0, ratio: 0, done: false });
  state = chooseCategory(state, DEPTH, other(currentItem(state, DEPTH)));
  assert.deepEqual(progressOf(state), { position: 1, total: 6, answered: 1, correct: 0, ratio: 1 / 6, done: false });
  state = goToNext(state);
  state = chooseCategory(state, DEPTH, currentItem(state, DEPTH).answer);
  assert.deepEqual(progressOf(state), { position: 2, total: 6, answered: 2, correct: 1, ratio: 2 / 6, done: false });
  const done = playRound(DEPTH, (item) => item.answer, goToNext(state));
  assert.deepEqual(progressOf(done), { position: 6, total: 6, answered: 6, correct: 5, ratio: 1, done: true });
  assert.deepEqual(progressOf(undefined), { position: 0, total: 0, answered: 0, correct: 0, ratio: 0, done: false });
});

test('a full round is graded and summarised with the missed items in the order they were asked', () => {
  // Wrong on the convergence and the clarity items, right on the others. 辐合与清晰度两题答错，其他答对。
  const missedIndices = [1, 5];
  const done = playRound(DEPTH, (item) => (missedIndices.includes(item.index) ? other(item) : item.answer));
  const summary = summarizeRound(done, DEPTH);
  assert.deepEqual(
    { total: summary.total, answered: summary.answered, correct: summary.correct, wrong: summary.wrong, percent: summary.percent, perfect: summary.perfect },
    { total: 6, answered: 6, correct: 4, wrong: 2, percent: 67, perfect: false },
  );
  const askedMissed = done.order.filter((index) => missedIndices.includes(index));
  assert.deepEqual(summary.missed.map((entry) => entry.item.index), askedMissed);
  for (const entry of summary.missed) {
    assert.equal(entry.answer.id, entry.item.answer);
    assert.equal(entry.choice.id, other(entry.item));
    assert.equal(entry.item, DEPTH.items[entry.item.index]);
  }
  const perfect = summarizeRound(playRound(DEPTH, (item) => item.answer), DEPTH);
  assert.deepEqual([perfect.correct, perfect.percent, perfect.perfect, perfect.missed], [6, 100, true, []]);
  const none = summarizeRound(playRound(DEPTH, other), DEPTH);
  assert.deepEqual([none.correct, none.wrong, none.percent, none.perfect, none.missed.length], [0, 6, 0, false, 6]);
  assert.deepEqual(summarizeRound(undefined, DEPTH), { total: 0, answered: 0, correct: 0, wrong: 0, percent: 0, perfect: false, missed: [] });
});

test('restartRound reshuffles the same items with the next seed and clears the answers', () => {
  const finished = playRound(DEPTH, other);
  const again = restartRound(finished, DEPTH);
  assert.deepEqual([again.round, again.position, again.phase, again.answers], [1, 0, PHASE.asking, []]);
  assert.deepEqual(sorted(again.order), range(6));
  assert.notDeepEqual(again.order, finished.order);
  assert.deepEqual(restartRound(finished, DEPTH), again);
  assert.equal(restartRound(again, DEPTH).round, 2);
  // The categories are not part of a round, so their button order never changes. 类别不在轮次里，按钮顺序永远不变。
  assert.deepEqual(DEPTH.categories.map((category) => category.id), ['monocular-cues', 'binocular-cues']);
  // Restarting in the middle of a round works too. 一轮做到一半也可以重新开始。
  const midway = chooseCategory(startRound(DEPTH), DEPTH, 'monocular-cues');
  assert.deepEqual(restartRound(midway, DEPTH).answers, []);
  assert.equal(restartRound(undefined, DEPTH).round, 1);
});

test('"Try again" never repeats the previous order, even with only four items', () => {
  const model = normalizeConceptSorterConfig(makeConfig(2, 4));
  for (let seed = 0; seed < 300; seed += 1) {
    const state = startRound(model, { seed });
    const again = restartRound(state, model);
    assert.notDeepEqual(again.order, state.order, `seed ${seed}`);
    assert.deepEqual(sorted(again.order), range(4));
  }
});

/* ---------- Grading 判分 ---------- */

test('gradeChoice and choiceStates mark the right category and the chosen one', () => {
  const model = normalizeConceptSorterConfig(makeConfig(3, 6));
  const item = model.items[1];
  assert.equal(item.answer, 'type-2');

  const right = gradeChoice(model, item, 'type-2');
  assert.equal(right.correct, true);
  assert.deepEqual([right.choice.id, right.answer.id], ['type-2', 'type-2']);
  assert.deepEqual(choiceStates(model, item, 'type-2'), [
    { id: 'type-1', state: 'other', chosen: false },
    { id: 'type-2', state: 'correct', chosen: true },
    { id: 'type-3', state: 'other', chosen: false },
  ]);

  const wrong = gradeChoice(model, item, 'type-3');
  assert.equal(wrong.correct, false);
  assert.deepEqual([wrong.choice.id, wrong.answer.id], ['type-3', 'type-2']);
  assert.deepEqual(choiceStates(model, item, 'type-3'), [
    { id: 'type-1', state: 'other', chosen: false },
    { id: 'type-2', state: 'correct', chosen: false },
    { id: 'type-3', state: 'wrong', chosen: true },
  ]);

  const unknown = gradeChoice(model, item, 'nope');
  assert.deepEqual([unknown.correct, unknown.choice, unknown.answer.id], [false, null, 'type-2']);
  assert.equal(gradeChoice(model, null, 'type-2'), null);
  assert.deepEqual(choiceStates(null, item, 'type-2'), []);
});

test('number keys pick categories 1 to n (at most 6)', () => {
  assert.deepEqual(['1', '2', '3', '4'].map((key) => shortcutIndex(key, 4)), [0, 1, 2, 3]);
  for (const key of ['5', '0', '9', 'a', '', ' ', '10', '1.0', 'Digit1', 'Enter', undefined, null, 1]) {
    assert.equal(shortcutIndex(key, 4), -1, String(key));
  }
  assert.equal(shortcutIndex('6', 6), 5);
  assert.equal(shortcutIndex('7', 9), -1);
  assert.equal(shortcutIndex('1', 0), -1);
});

test('the second click of a double-click is a repeat the buttons ignore (no unread answer, no skipped feedback)', () => {
  // A single click has detail 1 and a key press on a focused button detail 0: both act.
  // 单击的 detail 为 1，在获得焦点的按钮上按键为 0：两者都照常生效。
  assert.equal(isRepeatClick(1), false);
  assert.equal(isRepeatClick(0), false);
  // The second and third clicks of a double- or triple-click are ignored. 双击、三击中的第二、第三次点击被忽略。
  assert.equal(isRepeatClick(2), true);
  assert.equal(isRepeatClick(3), true);
  for (const detail of [undefined, null, '2', NaN, -1]) assert.equal(isRepeatClick(detail), false, String(detail));
});

test('percentOf rounds to whole numbers', () => {
  assert.deepEqual([[2, 3], [1, 3], [1, 8], [5, 5], [0, 4], [0, 0], [3, -1]].map(([part, total]) => percentOf(part, total)), [67, 33, 13, 100, 0, 0, 0]);
});

/* ---------- Text 文字 ---------- */

test('progress, score and advice texts', () => {
  assert.deepEqual(progressText({ position: 3, total: 10 }), { zh: '第 3 题，共 10 题', en: 'Item 3 of 10' });
  assert.deepEqual(progressValueText({ answered: 2, total: 10 }), { zh: '已完成 2 题，共 10 题', en: '2 of 10 answered' });
  assert.deepEqual(progressText(undefined), { zh: '第 0 题，共 0 题', en: 'Item 0 of 0' });

  assert.deepEqual(scoreText({ correct: 8, total: 10, percent: 80 }), { zh: '答对 8 题，共 10 题（80%）。', en: 'You got 8 of 10 right (80%).' });
  assert.deepEqual(scoreText({ correct: 2, total: 3 }), { zh: '答对 2 题，共 3 题（67%）。', en: 'You got 2 of 3 right (67%).' });
  const perfect = scoreAdvice({ perfect: true });
  const keepGoing = scoreAdvice({ perfect: false });
  assert.match(perfect.zh, /全部答对/);
  assert.match(perfect.en, /^All correct!/);
  assert.match(keepGoing.en, /items you missed/);
  assert.notDeepEqual(perfect, keepGoing);

  assert.deepEqual(missedTitle({ missed: [1, 2] }), { zh: '答错的题目（2）', en: 'Items you missed (2)' });
  assert.deepEqual(missedTitle(undefined), { zh: '答错的题目（0）', en: 'Items you missed (0)' });
  assert.deepEqual(verdictText(true), UI_TEXT.correct);
  assert.deepEqual(verdictText(false), UI_TEXT.wrong);
});

test('the keyboard hint names the last number key', () => {
  assert.deepEqual(keyHintText(2), { zh: '键盘：按数字键 1–2 也能选择类别。', en: 'Keyboard: you can also press 1–2 to choose a category.' });
  assert.match(keyHintText(6).en, /1–6/);
  assert.match(keyHintText(9).en, /1–6/);
});

test('invalidText says what is needed and what was found', () => {
  const one = invalidText(normalizeConceptSorterConfig(makeConfig(1, 3)));
  assert.match(one.en, /needs at least 2 valid categories and 4 valid items, but it has 1 category and 3 items\.$/);
  assert.match(one.zh, /现在有 1 个类别、3 道题目。$/);
  const none = invalidText(normalizeConceptSorterConfig({ categories: [], items: [{}] }));
  assert.match(none.en, /0 categories and 0 items/);
  const singular = invalidText({ categories: [{}, {}], items: [{}] });
  assert.match(singular.en, /2 categories and 1 item\./);
});

test('the announcement after a choice gives the verdict, the categories and the reason in both languages', () => {
  const linear = DEPTH.items[0];
  const right = choiceAnnouncement(DEPTH, linear, 'monocular-cues');
  assert.equal(right,
    '答对了！正确类别：单眼线索。为什么：线性透视（linear perspective）：平行线随距离看起来汇聚，只用一只眼也能看到。 '
    + 'Correct! Correct category: Monocular cues. Why: Linear perspective is a monocular cue.');
  const wrong = choiceAnnouncement(DEPTH, linear, 'binocular-cues');
  assert.match(wrong, /^不对。你的选择：双眼线索。正确类别：单眼线索。/);
  assert.match(wrong, / Not quite\. Your choice: Binocular cues\. Correct category: Monocular cues\. Why: /);
  assert.ok(!wrong.includes('**'));
  // Without an English reason the English part ends with the category. 没有英文原因时，英文部分以类别结尾。
  const clarity = choiceAnnouncement(DEPTH, DEPTH.items[5], 'monocular-cues');
  assert.ok(clarity.endsWith('Correct! Correct category: Monocular cues.'));
  assert.ok(clarity.includes('为什么：清晰度（clarity）'));
  // A label in one language is used in both sentences. 只有一种语言的标签在两句话里都用它。
  const englishOnly = normalizeConceptSorterConfig({
    categories: [{ id: 'stimulants', label: { en: 'Stimulants' } }, { id: 'depressants', label: bi('镇静剂', 'Depressants') }],
    items: range(4).map((index) => ({ text: bi(`第 ${index} 条`, `Item ${index}`), answer: 'stimulants' })),
  });
  const mixed = choiceAnnouncement(englishOnly, englishOnly.items[0], 'depressants');
  assert.equal(mixed, '不对。你的选择：镇静剂。正确类别：Stimulants。 Not quite. Your choice: Depressants. Correct category: Stimulants.');
  assert.equal(choiceAnnouncement(DEPTH, null, 'monocular-cues'), '');
});

test('the end-of-round and restart announcements are bilingual', () => {
  assert.equal(summaryAnnouncement({ correct: 4, total: 6, percent: 67 }), '练习完成。答对 4 题，共 6 题（67%）。 Finished. You got 4 of 6 right (67%).');
  assert.equal(restartAnnouncement(), '已重新打乱题目顺序，从第 1 题开始。 The items are reshuffled: starting again from item 1.');
});

test('textIn picks one language and falls back to the other', () => {
  assert.equal(textIn(bi(' 单眼 ', 'Monocular'), 'zh'), '单眼');
  assert.equal(textIn(bi('', 'Monocular'), 'zh'), 'Monocular');
  assert.equal(textIn({ zh: '单眼' }, 'en'), '单眼');
  assert.equal(textIn(null, 'en'), '');
});

test('every interface text has both languages and is frozen', () => {
  assert.ok(Object.isFrozen(UI_TEXT) && Object.isFrozen(DEFAULT_TITLE) && Object.isFrozen(DEFAULT_PROMPT));
  for (const [key, value] of Object.entries({ ...UI_TEXT, defaultTitle: DEFAULT_TITLE, defaultPrompt: DEFAULT_PROMPT })) {
    assert.ok(Object.isFrozen(value), key);
    assert.ok(CJK.test(value.zh), `${key}.zh has no Chinese`);
    assert.ok(value.en.trim() && !CJK.test(value.en), `${key}.en is missing or has Chinese`);
  }
});

test('no string the widget shows contains an emoji or an HTML tag', () => {
  const texts = [];
  const add = (...values) => {
    for (const value of values.flat()) {
      if (typeof value === 'string') texts.push(value);
      else if (value && typeof value === 'object') texts.push(value.zh, value.en);
    }
  };
  add(Object.values(UI_TEXT), DEFAULT_TITLE, DEFAULT_PROMPT);
  for (let count = 0; count <= 9; count += 1) add(keyHintText(count));
  for (const config of [{}, makeConfig(1, 2), makeConfig(2, 3), makeConfig(3, 1)]) add(invalidText(normalizeConceptSorterConfig(config)));
  for (const pick of [(item) => item.answer, other, (item) => (item.index % 2 ? item.answer : other(item))]) {
    let state = startRound(DEPTH);
    while (state.phase !== PHASE.done) {
      add(progressText(progressOf(state)), progressValueText(progressOf(state)), nextLabel(state));
      const item = currentItem(state, DEPTH);
      state = chooseCategory(state, DEPTH, pick(item));
      add(choiceAnnouncement(DEPTH, item, pick(item)), verdictText(currentAnswer(state).correct));
      state = goToNext(state);
    }
    const summary = summarizeRound(state, DEPTH);
    add(scoreText(summary), scoreAdvice(summary), missedTitle(summary), summaryAnnouncement(summary));
  }
  add(restartAnnouncement());
  assert.ok(texts.length > 100);
  for (const text of texts) {
    assert.equal(typeof text, 'string');
    assert.ok(!EMOJI.test(text), `emoji in: ${text}`);
    assert.ok(!/<\s*\/?\s*[a-zA-Z][^>]*>/.test(text), `HTML tag in: ${text}`);
  }
});
