import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TITLE,
  DIRECTIONS,
  DIRECTION_INFO,
  QUADRANTS,
  QUADRANT_IDS,
  REVEAL_DELAY_MS,
  SCENARIO_LIMITS,
  SIGNS,
  SIGN_INFO,
  TEXT,
  announceRestart,
  announceResult,
  announceSign,
  announceSummary,
  axisStates,
  cellStates,
  chooseDirection,
  chooseSign,
  confusionHint,
  createSeededRandom,
  currentScenarioId,
  drillScore,
  gradeAnswer,
  isLastScenario,
  lastResult,
  missedResults,
  nextScenario,
  nextSeed,
  normalizeOperantQuadrantConfig,
  partsOf,
  progressText,
  quadrantOf,
  restartDrill,
  revealDelay,
  ruleLine,
  scoreText,
  seedFrom,
  shuffledOrder,
  startDrill,
  stepLines,
  summaryText,
  verdictText,
  wrongStepsText,
} from '../../../engine/widgets/psychology/operant-quadrant/operant-quadrant-logic.js';

const bi = (zh, en) => ({ zh, en });
const range = (count) => Array.from({ length: count }, (_, index) => index);
const sorted = (list) => [...list].sort((a, b) => a - b);
// Validator rule (tools/validate_content.py): no emojis or pictographic symbols in any text.
// 校验器规则：任何文字里都不能有表情或图形符号。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const CJK = /[一-鿿]/u;

// The operant-quadrant row of tools/content-spec.md section 5.5, grown to the 3-scenario minimum with the textbook's
// own examples (Chapter 6, p.224 and p.229); the last "why" has only the required zh.
// content-spec 第 5.5 节 operant-quadrant 一行的例子，用教材第 6 章的例子补足到最少 3 个情境；最后一个 why 只有必需的 zh。
const SPEC = {
  title: bi('强化还是惩罚？', 'Reinforcement or punishment?'),
  scenarios: [
    {
      text: bi('你头痛时吃了布洛芬，头痛消失了；下次头痛你又吃布洛芬。', 'You take ibuprofen for a headache and the headache goes away. Next time you have a headache, you take ibuprofen again.'),
      answer: 'negative-reinforcement',
      why: bi('头痛（难受的刺激）被**拿走**，吃药的行为变多：负强化。', 'The headache is **removed** and taking ibuprofen becomes more likely: negative reinforcement.'),
    },
    {
      text: bi('狗一抬爪你就给它零食，它抬爪越来越多。', 'You give your dog a treat each time it lifts its paw, and it lifts its paw more and more.'),
      answer: 'positive-reinforcement',
      why: bi('零食被**加上**，抬爪变多：正强化。', 'A treat is **added** and paw-lifting increases: positive reinforcement.'),
    },
    {
      text: bi('妹妹晚归两小时，被禁足两周；之后她不再晚归。', 'Your sister comes home two hours after curfew and is grounded for two weeks. She stops coming home late.'),
      answer: 'negative-punishment',
      why: { zh: '和朋友出去玩的机会被**拿走**，晚归变少：负惩罚。' },
    },
  ],
};
const ANSWERS = SPEC.scenarios.map((item) => item.answer);
const good = (index) => ({
  text: bi(`情境 ${index}`, `Scenario ${index}`),
  answer: QUADRANT_IDS[index % QUADRANT_IDS.length],
  why: bi(`原因 ${index}`, `Reason ${index}`),
});
const idle = () => Object.fromEntries(QUADRANT_IDS.map((id) => [id, 'idle']));

/* ---------- Config 配置 ---------- */

test('normalizeOperantQuadrantConfig reads the content-spec example as written', () => {
  const model = normalizeOperantQuadrantConfig(SPEC);
  assert.deepEqual(model.title, SPEC.title);
  assert.equal(model.usedDefaultTitle, false);
  assert.equal(model.drill, true);
  assert.equal(model.dropped, 0);
  assert.deepEqual(model.scenarios, SPEC.scenarios.map((item, id) => ({
    id, text: item.text, answer: item.answer, why: { zh: item.why.zh, en: item.why.en ?? '' },
  })));
});

test('every config the validator accepts is read without losing anything', () => {
  for (let count = SCENARIO_LIMITS.min; count <= SCENARIO_LIMITS.max; count += 1) {
    const scenarios = range(count).map((index) => ({
      text: bi(`情境 ${index}：**加上**还是拿走？\n第二行`, `Scenario ${index}: is something **added**?\nSecond line`),
      answer: QUADRANT_IDS[index % QUADRANT_IDS.length],
      why: index % 2 ? bi(`原因 ${index}`, `Reason ${index}`) : { zh: `原因 ${index}，\`代码\`` },
    }));
    for (const title of [undefined, bi('标题', 'Title')]) {
      const model = normalizeOperantQuadrantConfig(title ? { title, scenarios } : { scenarios });
      assert.equal(model.drill, true);
      assert.equal(model.dropped, 0);
      assert.equal(model.scenarios.length, count);
      assert.deepEqual(model.title, title ?? DEFAULT_TITLE);
      assert.equal(model.usedDefaultTitle, !title);
      model.scenarios.forEach((item, index) => {
        const source = scenarios[index];
        assert.equal(item.id, index);
        assert.deepEqual(item.text, source.text);
        assert.equal(item.answer, source.answer);
        assert.deepEqual(item.why, { zh: source.why.zh, en: source.why.en ?? '' });
      });
    }
  }
});

test('invalid scenarios are dropped and counted, and the valid ones keep their order', () => {
  const model = normalizeOperantQuadrantConfig({
    scenarios: [
      good(0),
      null,
      'a bare string',
      42,
      [good(1)],
      { answer: 'positive-reinforcement' },
      { text: bi(' ', ''), answer: 'positive-reinforcement' },
      { text: bi('文字', 'Text'), answer: 'reinforcement' },
      { text: bi('文字', 'Text') },
      good(1),
      { text: bi('文字', 'Text'), answer: 42 },
      good(2),
    ],
  });
  assert.deepEqual(model.scenarios.map((item) => item.text.en), ['Scenario 0', 'Scenario 1', 'Scenario 2']);
  assert.deepEqual(model.scenarios.map((item) => item.id), [0, 1, 2]);
  assert.equal(model.dropped, 9);
  assert.equal(model.drill, true);
});

test('fewer than 3 usable scenarios hide the drill; past 12 only the first 12 are read', () => {
  const two = normalizeOperantQuadrantConfig({ scenarios: [good(0), good(1), { text: bi('文字', 'Text'), answer: 'nope' }] });
  assert.equal(two.scenarios.length, 2);
  assert.equal(two.drill, false);
  assert.equal(two.dropped, 1);

  const three = normalizeOperantQuadrantConfig({ scenarios: range(3).map(good) });
  assert.equal(three.drill, true);

  const fifteen = range(15).map(good);
  const many = normalizeOperantQuadrantConfig({ scenarios: fifteen });
  assert.equal(many.scenarios.length, SCENARIO_LIMITS.max);
  assert.deepEqual(many.scenarios.map((item) => item.text.en), fifteen.slice(0, 12).map((item) => item.text.en));
  assert.equal(many.dropped, 3);
  assert.equal(many.drill, true);
});

test('bad input never throws: the default title is shown and the drill is hidden', () => {
  const inputs = [
    undefined, null, 0, 1, '', 'scenarios', true, [], [good(0), good(1), good(2)], {}, { scenarios: null },
    { scenarios: 'abc' }, { scenarios: {} }, { scenarios: { 0: good(0), 1: good(1), 2: good(2), length: 3 } },
    { title: 7 }, { title: [] }, { title: {} }, { title: { zh: 1, en: null } }, { title: { zh: '  ', en: '' } },
    { scenarios: [undefined, null, Number.NaN, {}] }, { title: null, scenarios: [{ text: null, answer: null, why: null }] },
  ];
  for (const config of inputs) {
    const model = normalizeOperantQuadrantConfig(config);
    assert.deepEqual(model.title, DEFAULT_TITLE, JSON.stringify(config));
    assert.notEqual(model.title, DEFAULT_TITLE, 'the default title is a copy');
    assert.equal(model.usedDefaultTitle, true);
    assert.equal(model.drill, false);
    assert.deepEqual(model.scenarios, []);
  }
});

test('labels are trimmed, a bare string is filed under its language, and answer ids forgive spaces and capitals', () => {
  const model = normalizeOperantQuadrantConfig({
    title: '  强化 Reinforcement  ',
    scenarios: [
      { text: '  A rat presses a lever and food drops in. ', answer: ' Positive-Reinforcement ', why: '食物被加上，按杆变多。' },
      { text: { zh: '  只有中文  ' }, answer: 'NEGATIVE-PUNISHMENT', why: { en: ' English only ' } },
      { text: { en: 'English only', extra: 'ignored' }, answer: 'positive-punishment', why: { zh: '', en: '  ' } },
    ],
  });
  assert.deepEqual(model.title, { zh: '强化 Reinforcement', en: '' });
  assert.equal(model.usedDefaultTitle, false);
  assert.deepEqual(model.scenarios[0].text, { zh: '', en: 'A rat presses a lever and food drops in.' });
  assert.equal(model.scenarios[0].answer, 'positive-reinforcement');
  assert.deepEqual(model.scenarios[0].why, { zh: '食物被加上，按杆变多。', en: '' });
  assert.deepEqual(model.scenarios[1].text, { zh: '只有中文', en: '' });
  assert.equal(model.scenarios[1].answer, 'negative-punishment');
  assert.deepEqual(model.scenarios[1].why, { zh: '', en: 'English only' });
  assert.deepEqual(model.scenarios[2].text, { zh: '', en: 'English only' });
  assert.equal(model.scenarios[2].why, null, 'an empty why falls back to the rule of the quadrant');
  assert.equal(model.drill, true);

  assert.deepEqual(normalizeOperantQuadrantConfig({ title: { en: ' Only English ' } }).title, { zh: '', en: 'Only English' });
  assert.deepEqual(normalizeOperantQuadrantConfig({ title: 'Plain English' }).title, { zh: '', en: 'Plain English' });
});

/* ---------- Quadrants 四格 ---------- */

test('the table puts every quadrant at the row of its sign and the column of its direction', () => {
  // The four ids of content-spec 5.5, in table order (row by row). content-spec 5.5 的四个 id，按表格顺序（逐行）。
  assert.deepEqual(QUADRANT_IDS, ['positive-reinforcement', 'positive-punishment', 'negative-reinforcement', 'negative-punishment']);
  assert.equal(quadrantOf('positive', 'increase'), 'positive-reinforcement');
  assert.equal(quadrantOf('negative', 'increase'), 'negative-reinforcement');
  assert.equal(quadrantOf('positive', 'decrease'), 'positive-punishment');
  assert.equal(quadrantOf('negative', 'decrease'), 'negative-punishment');
  for (const sign of SIGNS) {
    for (const direction of DIRECTIONS) {
      const id = quadrantOf(sign, direction);
      assert.deepEqual(partsOf(id), { sign, direction });
      assert.equal(QUADRANTS[id].id, id);
      // The id spells its row and column: positive/negative + reinforcement/punishment.
      // id 本身就写出了行和列：positive/negative + reinforcement/punishment。
      assert.equal(id, `${sign}-${DIRECTION_INFO[direction].term.en}`);
      assert.equal(QUADRANTS[id].name.en, `${sign} ${DIRECTION_INFO[direction].term.en}`);
      assert.equal(QUADRANTS[id].name.zh, `${SIGN_INFO[sign].term.zh}${DIRECTION_INFO[direction].term.zh}`);
    }
  }
  for (const [sign, direction] of [['added', 'increase'], ['positive', 'up'], [undefined, undefined], [null, 'decrease']]) {
    assert.equal(quadrantOf(sign, direction), null);
  }
  for (const id of ['reinforcement', 'Positive-Reinforcement', undefined, null, 3]) assert.equal(partsOf(id), null);
  assert.ok(Object.isFrozen(QUADRANTS['negative-reinforcement'].example));
  assert.ok(Object.isFrozen(TEXT.choices.positive));
});

test('textbook facts: positive adds, negative removes, reinforcement increases, punishment decreases', () => {
  assert.deepEqual(SIGN_INFO.positive.word, bi('加上', 'added'));
  assert.deepEqual(SIGN_INFO.negative.word, bi('拿走', 'removed'));
  assert.deepEqual(DIRECTION_INFO.increase.term, bi('强化', 'reinforcement'));
  assert.deepEqual(DIRECTION_INFO.decrease.term, bi('惩罚', 'punishment'));
  assert.deepEqual(DIRECTION_INFO.increase.word, bi('更可能发生', 'more likely'));
  assert.deepEqual(DIRECTION_INFO.decrease.word, bi('更不可能发生', 'less likely'));
  // The reminder on screen: negative reinforcement is not punishment, and positive/negative are not good/bad.
  // 屏幕上的提醒：负强化不是惩罚；正和负不是好和坏。
  assert.match(TEXT.warning.zh, /负强化不是惩罚/);
  assert.match(TEXT.warning.en, /^Negative reinforcement is \*\*not\*\* punishment\./);
  assert.match(TEXT.ruleSign.en, /do not mean good or bad/);
  // The examples are the textbook's: ibuprofen and a headache (negative reinforcement), driving privileges (negative punishment).
  // 例子取自教材：布洛芬与头痛（负强化）、取消开车的权利（负惩罚）。
  assert.match(QUADRANTS['negative-reinforcement'].example.en, /ibuprofen/);
  assert.match(QUADRANTS['negative-punishment'].example.en, /driving privileges/);
  assert.match(QUADRANTS['positive-punishment'].example.en, /scolded/);
  assert.match(QUADRANTS['positive-reinforcement'].example.en, /treat/);
});

test('gradeAnswer is right only when both steps are, and names the wrong steps', () => {
  for (const answer of QUADRANT_IDS) {
    const expected = partsOf(answer);
    for (const sign of SIGNS) {
      for (const direction of DIRECTIONS) {
        const grade = gradeAnswer(answer, sign, direction);
        assert.equal(grade.answer, answer);
        assert.equal(grade.chosen, quadrantOf(sign, direction));
        assert.equal(grade.sign, sign);
        assert.equal(grade.direction, direction);
        assert.equal(grade.signCorrect, sign === expected.sign);
        assert.equal(grade.directionCorrect, direction === expected.direction);
        assert.equal(grade.correct, grade.chosen === answer);
        assert.deepEqual(grade.wrongSteps, [
          ...(sign === expected.sign ? [] : [1]),
          ...(direction === expected.direction ? [] : [2]),
        ]);
      }
    }
  }
  // Negative reinforcement taken for punishment: step 2 is the wrong one. 把负强化当成惩罚：错在第 2 步。
  assert.deepEqual(gradeAnswer('negative-reinforcement', 'negative', 'decrease').wrongSteps, [2]);
  assert.deepEqual(gradeAnswer('negative-reinforcement', 'positive', 'decrease').wrongSteps, [1, 2]);
  assert.deepEqual(gradeAnswer('negative-punishment', 'positive', 'decrease').wrongSteps, [1]);
});

test('gradeAnswer gives null for an unknown answer or choice', () => {
  assert.equal(gradeAnswer('reinforcement', 'positive', 'increase'), null);
  assert.equal(gradeAnswer('positive-reinforcement', 'added', 'increase'), null);
  assert.equal(gradeAnswer('positive-reinforcement', 'positive', null), null);
  assert.equal(gradeAnswer(), null);
});

test('cellStates: idle, the row after step 1, the choice after step 2, then right, or wrong and correct', () => {
  assert.deepEqual(cellStates(), idle());
  assert.deepEqual(cellStates({ direction: 'increase' }), idle(), 'a direction without a sign lights nothing');
  assert.deepEqual(cellStates({ sign: 'negative' }), { ...idle(), 'negative-reinforcement': 'row', 'negative-punishment': 'row' });
  assert.deepEqual(cellStates({ sign: 'positive', answer: 'negative-punishment', revealed: true }),
    { ...idle(), 'positive-reinforcement': 'row', 'positive-punishment': 'row' });
  assert.deepEqual(cellStates({ sign: 'negative', direction: 'decrease', answer: 'negative-reinforcement' }),
    { ...idle(), 'negative-punishment': 'chosen' });
  assert.deepEqual(cellStates({ sign: 'negative', direction: 'decrease', answer: 'negative-reinforcement', revealed: true }),
    { ...idle(), 'negative-punishment': 'wrong', 'negative-reinforcement': 'correct' });
  assert.deepEqual(cellStates({ sign: 'positive', direction: 'increase', answer: 'positive-reinforcement', revealed: true }),
    { ...idle(), 'positive-reinforcement': 'right' });
  assert.deepEqual(cellStates({ sign: 'positive', direction: 'increase', answer: 'nope', revealed: true }),
    { ...idle(), 'positive-reinforcement': 'chosen' }, 'without a known answer only the choice is shown');
  for (const state of Object.values(cellStates({ sign: 'positive', direction: 'decrease', answer: 'negative-reinforcement', revealed: true }))) {
    assert.ok(['idle', 'wrong', 'correct'].includes(state));
  }
});

test('axisStates marks the chosen row and column of the answer board', () => {
  assert.deepEqual(axisStates(), { rows: { positive: false, negative: false }, columns: { increase: false, decrease: false } });
  assert.deepEqual(axisStates({ sign: 'negative' }), { rows: { positive: false, negative: true }, columns: { increase: false, decrease: false } });
  assert.deepEqual(axisStates({ sign: 'positive', direction: 'decrease' }),
    { rows: { positive: true, negative: false }, columns: { increase: false, decrease: true } });
  assert.deepEqual(axisStates({ sign: 'up', direction: 'down' }), axisStates());
});

/* ---------- Drill 练习 ---------- */

test('a drill starts in the written order, and step 1 can change until step 2 grades the scenario', () => {
  let state = startDrill(3);
  assert.deepEqual(state, { order: [0, 1, 2], position: 0, phase: 'sign', sign: null, direction: null, results: [], round: 1 });
  assert.equal(currentScenarioId(state), 0);
  assert.equal(lastResult(state), null);

  state = chooseSign(state, 'positive');
  assert.equal(state.phase, 'direction');
  assert.equal(state.sign, 'positive');
  assert.equal(chooseSign(state, 'positive'), state, 'choosing the same option again changes nothing');
  state = chooseSign(state, 'negative');
  assert.equal(state.sign, 'negative');
  assert.equal(state.phase, 'direction');

  state = chooseDirection(state, 'increase', SPEC.scenarios);
  assert.equal(state.phase, 'feedback');
  assert.equal(state.direction, 'increase');
  assert.deepEqual(lastResult(state), { id: 0, ...gradeAnswer('negative-reinforcement', 'negative', 'increase') });
  assert.equal(lastResult(state).correct, true);
  assert.equal(chooseSign(state, 'positive'), state, 'a graded scenario is locked');
  assert.equal(chooseDirection(state, 'decrease', SPEC.scenarios), state, 'a graded scenario is locked');

  state = nextScenario(state);
  assert.deepEqual({ position: state.position, phase: state.phase, sign: state.sign, direction: state.direction },
    { position: 1, phase: 'sign', sign: null, direction: null });
  assert.equal(currentScenarioId(state), 1);
  assert.equal(lastResult(state), null);
});

test('steps out of order and unknown options are ignored', () => {
  const fresh = startDrill(3);
  assert.equal(chooseDirection(fresh, 'increase', ANSWERS), fresh, 'step 2 needs step 1 first');
  assert.equal(chooseSign(fresh, 'added'), fresh);
  assert.equal(nextScenario(fresh), fresh, 'no moving on before the scenario is graded');
  const signed = chooseSign(fresh, 'positive');
  assert.equal(chooseDirection(signed, 'sideways', ANSWERS), signed);
  assert.equal(chooseDirection(signed, 'increase', [{ answer: 'nope' }]), signed, 'a scenario without a known answer cannot be graded');
  assert.equal(chooseDirection(signed, 'increase', null), signed);

  const empty = startDrill(0);
  assert.equal(empty.phase, 'done');
  assert.equal(currentScenarioId(empty), null);
  assert.equal(chooseSign(empty, 'positive'), empty);
  assert.deepEqual(startDrill(-2).order, []);
  assert.deepEqual(startDrill('three').order, []);
});

test('state changes never modify the state they are given', () => {
  const start = startDrill(3);
  const snapshot = structuredClone(start);
  const signed = chooseSign(start, 'negative');
  const graded = chooseDirection(signed, 'increase', ANSWERS);
  const signedSnapshot = structuredClone(signed);
  const moved = nextScenario(graded);
  restartDrill(moved, 9);
  assert.deepEqual(start, snapshot);
  assert.deepEqual(signed, signedSnapshot);
  assert.notEqual(graded.results, signed.results);
});

test('a round ends after the last scenario with the score and the missed scenarios in answer order', () => {
  let state = startDrill(3);
  const answer = (sign, direction) => {
    state = chooseDirection(chooseSign(state, sign), direction, ANSWERS);
  };
  assert.deepEqual(drillScore(state), { correct: 0, answered: 0, total: 3 });
  answer('negative', 'increase');
  assert.equal(isLastScenario(state), false);
  assert.deepEqual(drillScore(state), { correct: 1, answered: 1, total: 3 });
  state = nextScenario(state);
  answer('negative', 'increase');
  state = nextScenario(state);
  assert.equal(isLastScenario(state), true);
  answer('positive', 'decrease');
  assert.deepEqual(drillScore(state), { correct: 1, answered: 3, total: 3 });
  state = nextScenario(state);
  assert.equal(state.phase, 'done');
  assert.equal(currentScenarioId(state), null);
  assert.equal(isLastScenario(state), false);
  assert.equal(nextScenario(state), state);
  assert.deepEqual(missedResults(state).map((result) => [result.id, result.chosen, result.answer, result.wrongSteps]), [
    [1, 'negative-reinforcement', 'positive-reinforcement', [1]],
    [2, 'positive-punishment', 'negative-punishment', [1]],
  ]);
  assert.deepEqual(drillScore(undefined), { correct: 0, answered: 0, total: 0 });
  assert.deepEqual(missedResults(undefined), []);
});

test('restartDrill shuffles the same scenarios into a new order with a seeded RNG', () => {
  let state = startDrill(5);
  while (state.phase !== 'done') {
    state = nextScenario(chooseDirection(chooseSign(state, 'positive'), 'increase', range(5).map((index) => QUADRANT_IDS[index % 4])));
  }
  const again = restartDrill(state, 2024);
  assert.equal(again.round, 2);
  assert.deepEqual({ position: again.position, phase: again.phase, sign: again.sign, direction: again.direction, results: again.results },
    { position: 0, phase: 'sign', sign: null, direction: null, results: [] });
  assert.deepEqual(sorted(again.order), range(5));
  assert.notEqual(again.order[0], state.order[0], 'the new round begins with another scenario');
  assert.deepEqual(restartDrill(state, 2024), again, 'the same seed gives the same order');
  const third = restartDrill(again, nextSeed(2024));
  assert.equal(third.round, 3);
  assert.notEqual(third.order[0], again.order[0]);
  assert.equal(currentScenarioId(again), again.order[0]);
});

test('shuffledOrder is a permutation, reproducible from its seed, and starts with another scenario than before', () => {
  const firsts = new Set();
  for (const count of [2, 3, 5, 12]) {
    for (let seed = 0; seed < 60; seed += 1) {
      const previous = shuffledOrder(count, seed + 1000);
      const order = shuffledOrder(count, seed, previous);
      assert.deepEqual(sorted(order), range(count));
      assert.notDeepEqual(order, previous);
      assert.notEqual(order[0], previous[0], 'the new round begins with another scenario');
      assert.deepEqual(shuffledOrder(count, seed, previous), order);
      if (count === 12) firsts.add(order[0]);
    }
  }
  assert.ok(firsts.size > 6, 'different seeds give different orders');
  assert.deepEqual(shuffledOrder(2, 7, [0, 1]), [1, 0]);
  assert.deepEqual(shuffledOrder(2, 7, [1, 0]), [0, 1]);
  for (const previous of [[9, 9, 9, 9], [0, 0, 1, 2], [0, 1, 2], 'abc']) {
    assert.deepEqual(sorted(shuffledOrder(4, 3, previous)), range(4), `a broken previous order is ignored: ${previous}`);
  }
  assert.deepEqual(shuffledOrder(0, 1), []);
  assert.deepEqual(shuffledOrder(1, 1, [0]), [0]);
  assert.deepEqual(shuffledOrder(-3, 1), []);
  assert.deepEqual(shuffledOrder('many', 1), []);
});

test('createSeededRandom, nextSeed and seedFrom give reproducible 32-bit numbers', () => {
  const draw = (seed) => {
    const random = createSeededRandom(seed);
    return range(30).map(() => random());
  };
  const first = draw(42);
  assert.deepEqual(draw(42), first);
  assert.notDeepEqual(draw(43), first);
  for (const value of [...first, ...draw(0), ...draw(4294967295), ...draw(-1), ...draw('x')]) {
    assert.ok(value >= 0 && value < 1, String(value));
  }
  assert.equal(nextSeed(0), 1013904223);
  let seed = 7;
  for (let step = 0; step < 100; step += 1) {
    const next = nextSeed(seed);
    assert.ok(Number.isInteger(next) && next >= 0 && next < 2 ** 32);
    assert.notEqual(next, seed);
    seed = next;
  }
  assert.equal(seedFrom(() => 0), 0);
  assert.equal(seedFrom(() => 0.5), 2147483648);
  assert.equal(seedFrom(() => 1), 4294967295);
  assert.equal(seedFrom(() => -1), 0);
  assert.equal(seedFrom(() => Number.NaN), 0);
  assert.equal(seedFrom(() => 'oops'), 0);
  const fromMath = seedFrom();
  assert.ok(Number.isInteger(fromMath) && fromMath >= 0 && fromMath < 2 ** 32);
});

test('revealDelay is a short pause, and none when motion is reduced', () => {
  assert.equal(revealDelay(true), 0);
  assert.equal(revealDelay(false), REVEAL_DELAY_MS);
  assert.ok(REVEAL_DELAY_MS > 0 && REVEAL_DELAY_MS <= 1500);
});

/* ---------- Sentences 句子 ---------- */

test('feedback sentences: verdict, step lines, wrong steps and the rule of the quadrant', () => {
  const right = gradeAnswer('negative-reinforcement', 'negative', 'increase');
  assert.deepEqual(verdictText(right), { zh: '答对了！这是**负强化**。', en: 'Correct! This is **negative reinforcement**.' });
  const asPunishment = gradeAnswer('negative-reinforcement', 'negative', 'decrease');
  assert.deepEqual(verdictText(asPunishment), {
    zh: '还不对。你选的是**负惩罚**，正确答案是**负强化**。',
    en: 'Not quite. You chose **negative punishment**; the answer is **negative reinforcement**.',
  });
  assert.equal(verdictText(null), null);

  const lines = stepLines(asPunishment);
  assert.deepEqual(lines.map((line) => [line.step, line.correct]), [[1, true], [2, false]]);
  assert.deepEqual(lines[0].text, {
    zh: '第 1 步对了：刺激被**拿走**了，所以是“负”（**negative**）。',
    en: 'Step 1 is right: a stimulus is **removed**, so it is negative.',
  });
  assert.deepEqual(lines[1].text, {
    zh: '第 2 步错了：行为以后**更可能发生**，所以是强化（**reinforcement**），不是惩罚。',
    en: 'Step 2 is wrong: the behaviour becomes **more likely**, so it is reinforcement, not punishment.',
  });
  const signWrong = stepLines(gradeAnswer('positive-punishment', 'negative', 'decrease'));
  assert.deepEqual(signWrong[0].text, {
    zh: '第 1 步错了：这里刺激是被**加上**了，所以是“正”（**positive**），不是“负”。',
    en: 'Step 1 is wrong: here a stimulus is **added**, so it is positive, not negative.',
  });
  assert.deepEqual(signWrong[1].text, {
    zh: '第 2 步对了：行为以后**更不可能发生**，所以是惩罚（**punishment**）。',
    en: 'Step 2 is right: the behaviour becomes **less likely**, so it is punishment.',
  });
  assert.deepEqual(stepLines(null), []);

  assert.deepEqual(wrongStepsText(right), { zh: '两步都对。', en: 'Both steps are right.' });
  assert.deepEqual(wrongStepsText(asPunishment), { zh: '第 2 步错了。', en: 'Step 2 was wrong.' });
  assert.deepEqual(wrongStepsText(gradeAnswer('positive-punishment', 'negative', 'decrease')), { zh: '第 1 步错了。', en: 'Step 1 was wrong.' });
  assert.deepEqual(wrongStepsText(gradeAnswer('positive-punishment', 'negative', 'increase')), { zh: '两步都错了。', en: 'Both steps were wrong.' });

  assert.deepEqual(ruleLine('negative-reinforcement'), {
    zh: '拿走一个刺激（负）+ 行为更可能发生（强化）= **负强化**',
    en: 'Stimulus removed (negative) + behaviour more likely (reinforcement) = **negative reinforcement**',
  });
  assert.deepEqual(ruleLine('positive-punishment'), {
    zh: '加上一个刺激（正）+ 行为更不可能发生（惩罚）= **正惩罚**',
    en: 'Stimulus added (positive) + behaviour less likely (punishment) = **positive punishment**',
  });
  assert.equal(ruleLine('nope'), null);
});

test('hints target the negative reinforcement versus punishment mix-up first, then the wrong step', () => {
  const hint = (answer, sign, direction) => confusionHint(gradeAnswer(answer, sign, direction));
  assert.equal(hint('negative-reinforcement', 'negative', 'increase'), null);
  assert.equal(hint('negative-reinforcement', 'negative', 'decrease'), TEXT.hints.notPunishment);
  assert.equal(hint('negative-reinforcement', 'positive', 'decrease'), TEXT.hints.notPunishment);
  assert.equal(hint('positive-punishment', 'negative', 'increase'), TEXT.hints.notNegativeReinforcement);
  assert.equal(hint('negative-punishment', 'negative', 'increase'), TEXT.hints.notNegativeReinforcement);
  assert.equal(hint('negative-reinforcement', 'positive', 'increase'), TEXT.hints.sign);
  assert.equal(hint('negative-punishment', 'positive', 'decrease'), TEXT.hints.sign);
  assert.equal(hint('positive-reinforcement', 'positive', 'decrease'), TEXT.hints.direction);
  assert.equal(hint('positive-reinforcement', 'negative', 'decrease'), TEXT.hints.direction);
  assert.equal(confusionHint(null), null);
  for (const answer of QUADRANT_IDS) {
    for (const sign of SIGNS) {
      for (const direction of DIRECTIONS) {
        const grade = gradeAnswer(answer, sign, direction);
        assert.equal(confusionHint(grade) === null, grade.correct, `${answer} ${sign} ${direction}`);
      }
    }
  }
});

test('progress, score and summary sentences', () => {
  assert.deepEqual(progressText(0, 8), { zh: '第 1 题，共 8 题', en: 'Scenario 1 of 8' });
  assert.deepEqual(progressText(7, 8), { zh: '第 8 题，共 8 题', en: 'Scenario 8 of 8' });
  assert.equal(progressText(9, 8).en, 'Scenario 8 of 8');
  assert.equal(progressText(-1, 3).en, 'Scenario 1 of 3');
  assert.deepEqual(scoreText({ correct: 2, answered: 3 }), { zh: '得分 2 / 3', en: 'Score 2 / 3' });
  assert.deepEqual(scoreText(), { zh: '得分 0 / 0', en: 'Score 0 / 0' });
  assert.deepEqual(summaryText({ correct: 6, total: 8 }), { zh: '一共 8 题，你答对了 6 题。', en: 'You got 6 of 8 right.' });
  assert.deepEqual(summaryText(drillScore(startDrill(4))), { zh: '一共 4 题，你答对了 0 题。', en: 'You got 0 of 4 right.' });
});

test('announcements are plain text, Chinese first and English after', () => {
  assert.equal(announceSign('positive'), '已选：加上了一个刺激。请回答第 2 步。 Chosen: something is added. Now answer step 2.');
  assert.equal(announceSign('negative'), '已选：拿走了一个刺激。请回答第 2 步。 Chosen: something is removed. Now answer step 2.');
  assert.equal(announceSign('nope'), '');
  assert.equal(announceResult(gradeAnswer('positive-reinforcement', 'positive', 'increase'), { correct: 3, answered: 3 }),
    '答对了！这是正强化。得分 3 / 3。 Correct! This is positive reinforcement. Score 3 / 3.');
  assert.equal(announceResult(gradeAnswer('negative-reinforcement', 'positive', 'decrease'), { correct: 2, answered: 3 }),
    '还不对。你选的是正惩罚，正确答案是负强化。两步都错了。得分 2 / 3。 Not quite. You chose positive punishment; the answer is negative reinforcement. Both steps were wrong. Score 2 / 3.');
  assert.equal(announceResult(null), '');
  assert.equal(announceSummary({ correct: 6, total: 8 }), '练习完成。一共 8 题，你答对了 6 题。 Drill complete. You got 6 of 8 right.');
  assert.equal(announceRestart(), '重新开始，题目顺序已打乱。 Starting again in a new order.');
});

/* ---------- Every string 所有文字 ---------- */

// Every { zh, en } pair the widget can show: the fixed texts and the sentences built for every answer and choice.
// 组件可能显示的每一对 { zh, en }：固定文字，以及为每种答案和选择生成的句子。
function shownPairs() {
  const pairs = [];
  const collect = (value, path) => {
    if (!value || typeof value !== 'object') return;
    const keys = Object.keys(value);
    if (keys.length === 2 && typeof value.zh === 'string' && typeof value.en === 'string') {
      pairs.push([path, value]);
      return;
    }
    for (const [key, inner] of Object.entries(value)) collect(inner, `${path}.${key}`);
  };
  collect(TEXT, 'TEXT');
  collect(QUADRANTS, 'QUADRANTS');
  collect(SIGN_INFO, 'SIGN_INFO');
  collect(DIRECTION_INFO, 'DIRECTION_INFO');
  collect(DEFAULT_TITLE, 'DEFAULT_TITLE');
  for (const answer of QUADRANT_IDS) {
    collect(ruleLine(answer), `ruleLine(${answer})`);
    for (const sign of SIGNS) {
      for (const direction of DIRECTIONS) {
        const grade = gradeAnswer(answer, sign, direction);
        const where = `${answer}/${sign}/${direction}`;
        collect(verdictText(grade), `verdictText(${where})`);
        collect(stepLines(grade).map((line) => line.text), `stepLines(${where})`);
        collect(wrongStepsText(grade), `wrongStepsText(${where})`);
        collect(confusionHint(grade), `confusionHint(${where})`);
      }
    }
  }
  for (const [position, total] of [[0, 3], [2, 3], [11, 12]]) collect(progressText(position, total), 'progressText');
  for (const [correct, answered] of [[0, 0], [1, 3], [12, 12]]) {
    collect(scoreText({ correct, answered }), 'scoreText');
    collect(summaryText({ correct, total: answered }), 'summaryText');
  }
  return pairs;
}

function announcements() {
  const texts = [announceRestart(), ...SIGNS.map(announceSign), announceSummary({ correct: 5, total: 8 })];
  for (const answer of QUADRANT_IDS) {
    for (const sign of SIGNS) {
      for (const direction of DIRECTIONS) texts.push(announceResult(gradeAnswer(answer, sign, direction), { correct: 1, answered: 2 }));
    }
  }
  return texts;
}

test('every string the widget shows has both languages: Chinese with Chinese characters, English without', () => {
  const pairs = shownPairs();
  assert.ok(pairs.length > 120, String(pairs.length));
  for (const [path, value] of pairs) {
    assert.ok(value.zh.trim() && value.en.trim(), `${path} needs both languages`);
    assert.match(value.zh, CJK, `${path}.zh has no Chinese`);
    assert.doesNotMatch(value.en, CJK, `${path}.en contains Chinese`);
  }
  for (const text of announcements()) {
    assert.match(text, CJK);
    assert.match(text, /[A-Za-z]/);
    assert.doesNotMatch(text, /\*\*|`/, 'announcements carry no markup');
  }
});

test('no string the widget shows contains an emoji, an HTML tag or unbalanced markup', () => {
  const texts = [
    ...shownPairs().flatMap(([, value]) => [value.zh, value.en]),
    ...announcements(),
    ...Object.values(SIGN_INFO).map((info) => info.symbol),
    ...Object.values(DIRECTION_INFO).map((info) => info.symbol),
  ];
  assert.ok(texts.length > 300, String(texts.length));
  for (const text of texts) {
    assert.doesNotMatch(text, EMOJI, text);
    assert.doesNotMatch(text, /<\s*\/?\s*[a-zA-Z][^>]*>/, text);
    assert.equal(text.split('**').length % 2, 1, `unbalanced ** in ${text}`);
    assert.equal(text.split('`').length % 2, 1, `unbalanced \` in ${text}`);
  }
});
