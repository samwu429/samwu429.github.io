import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHART,
  CONNECTORS,
  DEFAULT_TITLE,
  DEMO_COUNTS,
  EXAMPLES,
  EXTINGUISHED_LEVEL,
  MAX_STEPS,
  NEAR_MAX_LEVEL,
  NOTATIONS,
  NOTATION_NOTE,
  NOTATION_OPTIONS,
  PHASES,
  PRESETS,
  RATES,
  RECOVERY_MIN,
  RECOVERY_SHARE,
  ROLE_KEYS,
  ROLE_TERMS,
  SIM_ACTIONS,
  STAGE_TITLES,
  TICK_VALUES,
  UI_TEXT,
  actionLabel,
  announcementText,
  chartDescription,
  chartGeometry,
  chartModel,
  demoSimulation,
  eventSentence,
  examAnswer,
  figureSequence,
  formatStrength,
  initialSimulation,
  isFull,
  normalizeClassicalConditioningConfig,
  notationLabels,
  phaseRuns,
  phaseText,
  runActions,
  simplifiedNote,
  simulate,
  statusText,
  storyboard,
  termKey,
  trialLabelStride,
} from '../../../engine/widgets/psychology/classical-conditioning/classical-conditioning-logic.js';

const bi = (zh, en) => ({ zh, en });
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} != ${expected}`);
const repeat = (action, count) => Array(count).fill(action);
const normalize = normalizeClassicalConditioningConfig;

// A custom example in the learner's world, shaped like the content-spec row. 学习者生活中的自定义例子，结构与 content-spec 一致。
const PHONE_ROLES = {
  neutral: bi('微信提示音', 'WeChat notification sound'),
  us: bi('导师发来的坏消息', 'bad news from the supervisor'),
  ur: bi('心跳加快', 'racing heart at the news'),
  cr: bi('一听到提示音就心跳加快', 'racing heart at the sound'),
};

// Validator rules (tools/validate_content.py): no emojis or pictographic symbols, no HTML tags, balanced bold markers.
// 校验器规则：不能有表情或图形符号、不能有 HTML 标签、粗体标记必须成对。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const HTML_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const HAN = /[一-鿿]/;
// American spellings the textbook writes the Canadian way. 教材用加拿大拼写的词的美式写法。
const AMERICAN = /\b(behavior|color|flavor|favorite|center|neighbor|humor)(s|ed|ing|al|ful|ism)?\b/i;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/* ---------- Config 配置 ---------- */

test('normalizeClassicalConditioningConfig reads both content-spec examples as written', () => {
  const preset = normalize({ title: bi('巴甫洛夫的狗', 'Pavlov\'s dogs'), example: 'pavlov', notation: 'us' });
  assert.deepEqual(preset.title, bi('巴甫洛夫的狗', 'Pavlov\'s dogs'));
  assert.equal(preset.customTitle, true);
  assert.equal(preset.example, 'pavlov');
  assert.equal(preset.notation, 'us');
  assert.deepEqual(preset.roles, PRESETS.pavlov.roles);
  assert.deepEqual(preset.short, PRESETS.pavlov.short);
  assert.deepEqual(preset.fallbackRoles, []);
  assert.equal(preset.usedDefault, false);

  const custom = normalize({ example: 'custom', roles: PHONE_ROLES });
  assert.equal(custom.example, 'custom');
  assert.deepEqual(custom.roles, PHONE_ROLES);
  assert.deepEqual(custom.short, { neutral: PHONE_ROLES.neutral, us: PHONE_ROLES.us });
  assert.deepEqual(custom.title, DEFAULT_TITLE);
  assert.equal(custom.customTitle, false);
  assert.equal(custom.notation, 'us');
  for (const key of ['name', 'source', 'noResponse', 'note', 'caveat']) assert.equal(custom[key], null, key);
  assert.ok(custom.pairings.zh && custom.pairings.en);
  assert.deepEqual(custom.fallbackRoles, []);
  assert.equal(custom.usedDefault, false);
});

test('every example and notation the validator accepts is read as written', () => {
  for (const example of EXAMPLES.filter((name) => name !== 'custom')) {
    for (const notation of NOTATIONS) {
      const model = normalize({ example, notation });
      assert.equal(model.example, example);
      assert.equal(model.notation, notation);
      assert.equal(model.usedDefault, false);
      assert.deepEqual(model.roles, PRESETS[example].roles);
      assert.deepEqual(model.name, PRESETS[example].name);
      assert.deepEqual(model.source, PRESETS[example].source);
      assert.deepEqual(model.noResponse, PRESETS[example].noResponse);
      assert.deepEqual(model.pairings, PRESETS[example].pairings);
      assert.deepEqual(model.note, PRESETS[example].note);
      assert.deepEqual(model.caveat, PRESETS[example].caveat);
    }
  }
  const lecture = normalize({ example: 'custom', notation: 'ucs', roles: PHONE_ROLES, title: bi('提示音', 'The notification sound') });
  assert.equal(lecture.notation, 'ucs');
  assert.deepEqual(lecture.title, bi('提示音', 'The notification sound'));
});

test('a config that is missing or not an object shows the Pavlov example with the default title', () => {
  for (const config of [undefined, null, 42, 'pavlov', [], ['pavlov'], true, {}]) {
    const model = normalize(config);
    assert.equal(model.example, 'pavlov');
    assert.equal(model.notation, 'us');
    assert.deepEqual(model.title, DEFAULT_TITLE);
    assert.equal(model.customTitle, false);
    assert.equal(model.usedDefault, true);
    assert.deepEqual(model.roles, PRESETS.pavlov.roles);
  }
});

test('example and notation must be exactly one of the validator values, otherwise the defaults apply', () => {
  for (const example of ['Pavlov', ' pavlov', 'little albert', 'littleAlbert', 'taste', '', 7, null, {}, ['custom']]) {
    const model = normalize({ example, notation: 'ucs' });
    assert.equal(model.example, 'pavlov', String(example));
    assert.equal(model.usedDefault, true);
    assert.equal(model.notation, 'ucs');
  }
  for (const notation of ['US', 'UCS', ' us', 'u', '', null, 1, ['ucs']]) {
    assert.equal(normalize({ example: 'little-albert', notation }).notation, 'us', String(notation));
  }
});

test('a title needs both languages; anything else shows the default title', () => {
  assert.deepEqual(normalize({ example: 'pavlov', title: bi('  标题  ', ' Title ') }).title, bi('标题', 'Title'));
  assert.deepEqual(normalize({ example: 'pavlov', title: { zh: '标题', en: 'Title', extra: 1 } }).title, bi('标题', 'Title'));
  for (const title of ['Classical conditioning', { zh: '标题' }, { en: 'Title' }, bi('', 'Title'), bi('标题', '   '), bi(1, 2), [], null]) {
    const model = normalize({ example: 'pavlov', title });
    assert.deepEqual(model.title, DEFAULT_TITLE, JSON.stringify(title));
    assert.equal(model.customTitle, false);
  }
});

test('roles are read only for the custom example', () => {
  for (const example of ['pavlov', 'little-albert', 'taste-aversion']) {
    const model = normalize({ example, roles: PHONE_ROLES });
    assert.deepEqual(model.roles, PRESETS[example].roles);
    assert.deepEqual(model.fallbackRoles, []);
  }
});

test('missing or unusable custom roles fall back to the Pavlov preset one by one', () => {
  const partial = normalize({ example: 'custom', roles: { neutral: PHONE_ROLES.neutral, us: PHONE_ROLES.us, ur: { zh: '只有中文' }, extra: PHONE_ROLES.cr } });
  assert.equal(partial.example, 'custom');
  assert.equal(partial.usedDefault, false);
  assert.deepEqual(partial.roles.neutral, PHONE_ROLES.neutral);
  assert.deepEqual(partial.roles.us, PHONE_ROLES.us);
  assert.deepEqual(partial.roles.ur, PRESETS.pavlov.roles.ur);
  assert.deepEqual(partial.roles.cr, PRESETS.pavlov.roles.cr);
  assert.deepEqual(partial.fallbackRoles, ['ur', 'cr']);
  assert.deepEqual(partial.short, { neutral: PHONE_ROLES.neutral, us: PHONE_ROLES.us });

  const noNeutral = normalize({ example: 'custom', roles: { us: PHONE_ROLES.us, ur: PHONE_ROLES.ur, cr: PHONE_ROLES.cr } });
  assert.deepEqual(noNeutral.roles.neutral, PRESETS.pavlov.roles.neutral);
  assert.deepEqual(noNeutral.short.neutral, PRESETS.pavlov.roles.neutral);
  assert.deepEqual(noNeutral.fallbackRoles, ['neutral']);

  const trimmed = normalize({ example: 'custom', roles: { ...PHONE_ROLES, neutral: bi(' 微信提示音 ', ' WeChat notification sound ') } });
  assert.deepEqual(trimmed.roles.neutral, PHONE_ROLES.neutral);
});

test('a custom example without one usable role shows the whole Pavlov preset', () => {
  const unusable = { neutral: 'sound', us: { zh: '食物' }, ur: null, cr: bi('', '') };
  for (const roles of [undefined, null, 'roles', [PHONE_ROLES.neutral], {}, unusable]) {
    const model = normalize({ example: 'custom', roles });
    assert.equal(model.example, 'pavlov');
    assert.equal(model.usedDefault, true);
    assert.deepEqual(model.roles, PRESETS.pavlov.roles);
    assert.deepEqual(model.note, PRESETS.pavlov.note);
    assert.deepEqual(model.fallbackRoles, []);
  }
});

test('the model is a fresh copy: changing it never changes the presets or the next model', () => {
  assert.ok(Object.isFrozen(PRESETS) && Object.isFrozen(PRESETS.pavlov.roles.neutral));
  const first = normalize({ example: 'pavlov' });
  first.roles.neutral.zh = 'changed';
  first.short.us.en = 'changed';
  first.title.en = 'changed';
  const second = normalize({ example: 'pavlov' });
  assert.equal(second.roles.neutral.zh, '蜂鸣器');
  assert.equal(second.short.us.en, 'food');
  assert.equal(second.title.en, 'Classical conditioning');
  const config = deepFreeze({ example: 'custom', roles: { ...PHONE_ROLES } });
  assert.doesNotThrow(() => normalize(config));
});

test('the presets tell each study the way the textbook does', () => {
  const { pavlov } = PRESETS;
  assert.equal(pavlov.roles.neutral.en, 'buzzer');
  assert.match(pavlov.roles.us.en, /meat powder/);
  assert.match(pavlov.roles.ur.en, /salivation/);
  assert.match(pavlov.roles.cr.en, /salivation to the buzzer/);
  assert.match(pavlov.note.en, /never a bell/);
  assert.match(pavlov.note.en, /mistranslation/);
  // The storyboard and simulator never call the neutral stimulus a bell. 三格图和模拟器从不把中性刺激说成铃铛。
  for (const value of [pavlov.roles, pavlov.short, pavlov.pairings, pavlov.noResponse]) assert.doesNotMatch(JSON.stringify(value), /bell/i);

  const albert = PRESETS['little-albert'];
  assert.match(albert.roles.neutral.en, /white laboratory rat/);
  assert.match(albert.roles.us.en, /loud noise/);
  assert.match(albert.roles.cr.en, /fear of the rat/);
  assert.match(albert.pairings.en, /seven pairings/);
  assert.match(albert.pairings.zh, /7 次/);
  assert.match(albert.note.en, /rabbit, a dog and a sealskin coat/);
  assert.match(albert.caveat.en, /never removed/);
  assert.match(albert.source.en, /Watson and Rayner \(1920\)/);

  const taste = PRESETS['taste-aversion'];
  assert.match(taste.roles.neutral.en, /spicy yellowtail/);
  assert.match(taste.roles.ur.en, /nausea or vomiting/);
  assert.match(taste.roles.cr.en, /taste aversion/);
  assert.match(taste.pairings.en, /single pairing/);
  assert.match(taste.pairings.en, /several hours later/);
  assert.match(taste.note.en, /jazz/);
  assert.match(taste.caveat.en, /single pairing/);
});

/* ---------- Notation, key and storyboard 记号、术语与三格图 ---------- */

test('notationLabels gives the textbook US and UR or the lecture UCS and UCR; CS and CR never change', () => {
  assert.deepEqual({ ...notationLabels('us') }, { neutral: 'NS', us: 'US', ur: 'UR', cs: 'CS', cr: 'CR', none: '' });
  assert.deepEqual({ ...notationLabels('ucs') }, { neutral: 'NS', us: 'UCS', ur: 'UCR', cs: 'CS', cr: 'CR', none: '' });
  for (const unknown of [undefined, 'UCS', 'x', 3]) assert.equal(notationLabels(unknown).us, 'US');
});

test('termKey names the five elements in the chosen notation, with meanings close to the textbook', () => {
  const textbook = termKey('us');
  assert.deepEqual(textbook.map((row) => row.abbr), ['NS', 'US', 'UR', 'CS', 'CR']);
  assert.deepEqual(textbook.map((row) => row.term.en), ['neutral stimulus', 'unconditioned stimulus', 'unconditioned response', 'conditioned stimulus', 'conditioned response']);
  assert.match(textbook[1].meaning.en, /without any prior learning/);
  assert.match(textbook[3].meaning.en, /previously neutral stimulus/);
  assert.match(textbook[4].meaning.en, /weaker than the UR/);
  const lecture = termKey('ucs');
  assert.deepEqual(lecture.map((row) => row.abbr), ['NS', 'UCS', 'UCR', 'CS', 'CR']);
  assert.match(lecture[2].meaning.en, /the UCS elicits/);
  assert.match(lecture[4].meaning.zh, /UCR/);
  assert.doesNotMatch(lecture.map((row) => row.meaning.en).join(' '), /\bUS\b|\bUR\b/);
});

test('storyboard draws Figure 6.2: before, during and after conditioning', () => {
  const model = normalize({ example: 'pavlov' });
  const stages = storyboard(model, 'us');
  assert.deepEqual(stages.map((stage) => stage.id), ['before', 'during', 'after']);
  assert.deepEqual(stages.map((stage) => stage.title), [STAGE_TITLES.before, STAGE_TITLES.during, STAGE_TITLES.after]);
  const roles = (row) => [row.stimuli.map((element) => element.role), row.response.role];
  assert.deepEqual(stages[0].rows.map(roles), [[['us'], 'ur'], [['neutral'], 'none']]);
  assert.deepEqual(stages[1].rows.map(roles), [[['neutral', 'us'], 'ur']]);
  assert.deepEqual(stages[2].rows.map(roles), [[['cs'], 'cr']]);

  const [before, during, after] = stages;
  assert.deepEqual(before.rows[0].stimuli[0].item, model.roles.us);
  assert.deepEqual(before.rows[1].response.item, model.noResponse);
  assert.deepEqual(before.rows[1].response.term, ROLE_TERMS.none);
  assert.equal(before.rows[1].response.abbr, '');
  assert.deepEqual(during.note, model.pairings);
  // The CS is the former neutral stimulus. CS 就是原来的中性刺激。
  assert.deepEqual(after.rows[0].stimuli[0].item, model.roles.neutral);
  assert.deepEqual(after.rows[0].response.item, model.roles.cr);
  assert.equal(after.rows[0].stimuli[0].family, 'conditioned');
  assert.equal(before.rows[0].stimuli[0].family, 'unconditioned');
  assert.equal(before.rows[1].stimuli[0].family, 'neutral');
  assert.match(before.note.en, /The US produces the UR/);

  const lecture = storyboard(model, 'ucs');
  assert.deepEqual(lecture[0].rows[0].stimuli[0].abbr, 'UCS');
  assert.deepEqual(lecture[0].rows[0].response.abbr, 'UCR');
  assert.deepEqual(lecture[2].rows[0].stimuli[0].abbr, 'CS');
  assert.match(lecture[0].note.zh, /UCS 不用学习就能引起 UCR/);
});

test('storyboard of a custom example shows its own roles and a bare "no response"', () => {
  const stages = storyboard(normalize({ example: 'custom', roles: PHONE_ROLES }), 'us');
  assert.deepEqual(stages[0].rows[1].stimuli[0].item, PHONE_ROLES.neutral);
  assert.equal(stages[0].rows[1].response.item, null);
  assert.deepEqual(stages[2].rows[0].response.item, PHONE_ROLES.cr);
  // Anything that is not a model is read as a config first. 不是模型的输入先按配置读取。
  assert.deepEqual(storyboard(undefined, 'us')[2].rows[0].stimuli[0].item, PRESETS.pavlov.roles.neutral);
});

test('examAnswer names the US, UR, CS and CR of the example in the chosen notation', () => {
  const textbook = examAnswer(normalize({ example: 'little-albert' }), 'us');
  assert.equal(textbook.en, 'US: loud noise behind his head. UR: startle and crying at the noise. '
    + 'CS: white laboratory rat (before the pairings it was a neutral stimulus). CR: fear of the rat.');
  assert.match(textbook.zh, /^US（无条件刺激）：在他脑后突然发出的巨响。/);
  assert.match(textbook.heading.en, /name the US, UR, CS and CR/);
  const lecture = examAnswer(normalize({ example: 'taste-aversion' }), 'ucs');
  assert.match(lecture.en, /^UCS: whatever made you sick/);
  assert.match(lecture.en, /UCR: nausea or vomiting/);
  assert.match(lecture.heading.zh, /UCS、UCR、CS 和 CR/);
});

/* ---------- Simulator 模拟器 ---------- */

test('the simulator starts at CR strength 0 with a single start point', () => {
  const state = initialSimulation();
  assert.equal(state.strength, 0);
  assert.equal(state.peak, 0);
  assert.equal(state.trials, 0);
  assert.equal(state.recoveries, 0);
  assert.deepEqual(state.steps, [{ kind: 'start', phase: 'start', trial: 0, before: 0, strength: 0 }]);
  assert.equal(state.event.type, 'start');
  assert.equal(isFull(state), false);
});

test('pairing raises the CR toward 100%: v + 0.3(1 - v), which is acquisition', () => {
  assert.equal(RATES.acquisition, 0.3);
  let state = initialSimulation();
  for (let trial = 1; trial <= 20; trial += 1) {
    const before = state.strength;
    state = simulate(state, 'pair');
    close(state.strength, before + 0.3 * (1 - before), `trial ${trial}`);
    close(state.strength, 1 - 0.7 ** trial, `closed form at trial ${trial}`);
    assert.equal(state.trials, trial);
    assert.equal(state.peak, state.strength);
    assert.equal(state.highest, state.strength);
    assert.deepEqual(state.steps.at(-1), { kind: 'pair', phase: 'acquisition', trial, before, strength: state.strength });
    assert.equal(state.event.type, 'acquisition');
    assert.equal(state.event.again, false);
    assert.ok(state.strength > before && state.strength < 1);
  }
  close(runActions(['pair']).strength, 0.3);
  close(runActions(['pair', 'pair']).strength, 0.51);
  close(runActions(['pair', 'pair', 'pair']).strength, 0.657);
});

test('the CS alone before any pairing is still a neutral stimulus: no CR, nothing to extinguish', () => {
  const state = simulate(initialSimulation(), 'cs-alone');
  assert.equal(state.strength, 0);
  assert.equal(state.trials, 1);
  assert.equal(state.extinctionSince, 0);
  assert.deepEqual(state.steps.at(-1), { kind: 'cs-alone', phase: 'neutral', trial: 1, before: 0, strength: 0 });
  assert.equal(state.event.type, 'neutral');
});

test('the CS alone after acquisition lowers the CR: v - 0.3v, which is extinction', () => {
  assert.equal(RATES.extinction, 0.3);
  let state = runActions(repeat('pair', 8));
  const peak = state.strength;
  for (let trial = 1; trial <= 8; trial += 1) {
    const before = state.strength;
    state = simulate(state, 'cs-alone');
    close(state.strength, before - 0.3 * before);
    assert.equal(state.steps.at(-1).phase, 'extinction');
    assert.equal(state.event.type, 'extinction');
    assert.equal(state.event.gone, state.strength < EXTINGUISHED_LEVEL);
    assert.equal(state.extinctionSince, trial);
    assert.equal(state.peak, peak);
  }
  close(state.strength, peak * 0.7 ** 8);
  assert.equal(state.event.gone, true);
});

test('a rest changes nothing when nothing was learned or nothing was extinguished', () => {
  const unlearned = simulate(initialSimulation(), 'rest');
  assert.equal(unlearned.event.type, 'rest-unlearned');
  assert.equal(unlearned.strength, 0);
  assert.deepEqual(unlearned.steps.at(-1), { kind: 'rest', phase: 'rest', trial: null, before: 0, strength: 0 });
  assert.equal(unlearned.trials, 0);

  const learned = runActions(repeat('pair', 5));
  const rested = simulate(learned, 'rest');
  assert.equal(rested.event.type, 'rest-unchanged');
  assert.equal(rested.event.afterRecovery, false);
  assert.equal(rested.strength, learned.strength);
  assert.equal(rested.recoveries, 0);
  assert.equal(rested.steps.length, learned.steps.length + 1);
});

test('a rest after extinction brings spontaneous recovery: part of the earlier peak, weaker than the peak', () => {
  const extinguished = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8)]);
  const peak = extinguished.peak;
  const recovered = simulate(extinguished, 'rest');
  assert.equal(recovered.event.type, 'recovery');
  close(recovered.strength, extinguished.strength + RECOVERY_SHARE * (peak - extinguished.strength));
  assert.ok(recovered.strength > extinguished.strength);
  assert.ok(recovered.strength < peak);
  assert.equal(recovered.event.earlierPeak, peak);
  assert.equal(recovered.event.count, 1);
  assert.equal(recovered.recoveries, 1);
  assert.equal(recovered.recovering, true);
  assert.equal(recovered.extinctionSince, 0);
  // The next rest can only return toward this weaker level. 下一次休息只能回到这个更弱的水平。
  assert.equal(recovered.peak, recovered.strength);
  assert.equal(recovered.highest, peak);
  assert.equal(recovered.trials, extinguished.trials);
  assert.deepEqual(recovered.steps.at(-1), { kind: 'rest', phase: 'rest', trial: null, before: extinguished.strength, strength: recovered.strength });

  const again = simulate(recovered, 'cs-alone');
  assert.equal(again.event.type, 'extinction-again');
  assert.equal(again.steps.at(-1).phase, 'recovery');
  close(again.strength, recovered.strength * 0.7);

  const restedTwice = simulate(recovered, 'rest');
  assert.equal(restedTwice.event.type, 'rest-unchanged');
  assert.equal(restedTwice.event.afterRecovery, true);
  assert.equal(restedTwice.strength, recovered.strength);
});

test('every spontaneous recovery is weaker than the one before, and in the end it ceases', () => {
  let state = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8)]);
  const levels = [];
  for (let cycle = 0; cycle < 8 && state.event.type !== 'recovery-ceased'; cycle += 1) {
    state = simulate(state, 'rest');
    if (state.event.type === 'recovery') {
      levels.push(state.strength);
      state = runActions(repeat('cs-alone', 4), state);
    }
  }
  assert.ok(levels.length >= 2, `only ${levels.length} recoveries`);
  levels.slice(1).forEach((level, index) => assert.ok(level < levels[index], 'a recovery is not weaker than the one before'));
  assert.equal(state.event.type, 'recovery-ceased');
  assert.equal(state.event.after, state.event.before);
  assert.ok(RECOVERY_SHARE * (state.peak - state.strength) < RECOVERY_MIN);
  assert.equal(state.recovering, false);
  // After it ceased, the CS alone is plain extinction and further rests stay without recovery.
  // 停止以后，只给 CS 就是普通的消退，再休息也不会恢复。
  const next = simulate(state, 'cs-alone');
  assert.equal(next.steps.at(-1).phase, 'extinction');
  assert.equal(simulate(next, 'rest').event.type, 'recovery-ceased');
  assert.equal(simulate(state, 'rest').event.type, 'recovery-ceased');
});

test('the first recovery after a pairing always happens, even after a shallow extinction', () => {
  const shallow = runActions(['pair', 'pair', 'cs-alone']);
  assert.ok(RECOVERY_SHARE * (shallow.peak - shallow.strength) < RECOVERY_MIN);
  const rested = simulate(shallow, 'rest');
  assert.equal(rested.event.type, 'recovery');
  assert.equal(rested.event.count, 1);
  close(rested.strength, shallow.strength + RECOVERY_SHARE * (shallow.peak - shallow.strength));
  assert.ok(rested.strength < shallow.peak);
});

test('a new pairing starts a new cycle: recoveries count again from the first', () => {
  let state = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8)]);
  for (let cycle = 0; cycle < 10; cycle += 1) {
    state = simulate(state, 'rest');
    if (state.event.type === 'recovery-ceased') break;
    state = runActions(repeat('cs-alone', 4), state);
  }
  assert.equal(state.event.type, 'recovery-ceased');
  assert.ok(state.recoveries >= 2);
  state = runActions(repeat('pair', 4), state);
  assert.equal(state.recoveries, 0);
  state = runActions([...repeat('cs-alone', 5), 'rest'], state);
  assert.ok(!isFull(state));
  assert.equal(state.event.type, 'recovery');
  assert.equal(state.event.count, 1);
  assert.match(eventSentence(state.event, normalize({ example: 'pavlov' }), 'us').en, /weaker than its earlier peak of/);
  // The earlier-peak line stays: the chart still holds recoveries. 之前峰值的虚线仍然显示：图上有过自发恢复。
  assert.ok(chartModel(runActions(['pair'], state), 640).peak);
});

test('a shallow extinction after a recovery gives a smaller recovery, not the end of spontaneous recovery', () => {
  // The path a learner takes: acquisition, extinction, a rest, the CS alone once, another rest.
  // 学习者常走的路：习得、消退、休息、只给一次 CS、再休息。
  const recovered = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8), 'rest']);
  const once = simulate(recovered, 'cs-alone');
  assert.ok(once.strength > 0.3, 'the CR is far from extinguished');
  const rested = simulate(once, 'rest');
  assert.equal(rested.event.type, 'recovery');
  assert.equal(rested.event.count, 2);
  close(rested.strength, once.strength + RECOVERY_SHARE * (recovered.peak - once.strength));
  assert.ok(rested.strength > once.strength && rested.strength < recovered.strength, 'a weaker recovery than the last one');
  assert.doesNotMatch(eventSentence(rested.event, normalize({ example: 'pavlov' }), 'us').en, /stopped/);
});

test('once spontaneous recovery has ceased it never comes back before a new pairing', () => {
  // Explicit path: recoveries fade until they cease; then deeper extinction and more rests change nothing.
  // 明确的路径：恢复越来越弱直到停止；之后再怎么消退、再怎么休息都不会恢复。
  let ceased = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8)]);
  for (let round = 0; round < 8 && ceased.event.type !== 'recovery-ceased'; round += 1) {
    ceased = simulate(ceased, 'rest');
    if (ceased.event.type === 'recovery') ceased = runActions(repeat('cs-alone', 4), ceased);
  }
  assert.equal(ceased.event.type, 'recovery-ceased');
  assert.ok(RECOVERY_SHARE * ceased.peak < RECOVERY_MIN);
  for (const extra of [1, 3, 6, 9]) {
    const later = runActions([...repeat('cs-alone', extra), 'rest'], ceased);
    assert.equal(later.event.type, 'recovery-ceased', `after ${extra} more CS-alone trials`);
    assert.equal(later.strength, later.event.before);
  }
  // A new pairing starts a new cycle, whose first recovery happens again. 新的配对开始新一轮，这一轮的第一次恢复又会发生。
  assert.equal(runActions(['pair', 'cs-alone', 'rest'], ceased).event.type, 'recovery');

  // Many pseudo-random runs: after "ceased", no rest brings a recovery until the next pairing; every recovery of a
  // cycle is weaker than the one before. 许多伪随机序列：“已停止”之后、下一次配对之前，没有任何休息会带来恢复；
  // 同一轮里每次恢复都比上一次弱。
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let run = 0; run < 400; run += 1) {
    let sim = initialSimulation();
    let ceased = false;
    let lastRecovery = null;
    let afterPairing = 0;
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const roll = random();
      const action = roll < 0.25 ? 'pair' : roll < 0.75 ? 'cs-alone' : 'rest';
      sim = simulate(sim, action);
      const { type } = sim.event;
      if (type === 'acquisition') {
        ceased = false;
        lastRecovery = null;
        afterPairing = sim.strength;
      } else if (type === 'recovery-ceased') {
        ceased = true;
      } else if (type === 'recovery') {
        assert.ok(!ceased, `run ${run}: a recovery after recovery had ceased`);
        if (lastRecovery !== null) assert.ok(sim.strength < lastRecovery, `run ${run}: a recovery not weaker than the last`);
        assert.ok(sim.strength <= afterPairing + 1e-12, `run ${run}: a recovery above the CR the last pairing reached`);
        lastRecovery = sim.strength;
      }
    }
  }
});

test('a pairing after a recovery starts a new cycle: a later rest never lifts the CR above what that pairing reached', () => {
  // After the Figure 6.3 sequence: pair once, present the CS alone once, rest.
  // 走完图 6.3 的顺序以后：配对一次，只给一次 CS，再休息。
  const paired = simulate(demoSimulation(), 'pair');
  assert.equal(paired.peak, paired.strength);
  assert.equal(paired.highest, demoSimulation().highest);
  const rested = runActions(['cs-alone', 'rest'], paired);
  assert.equal(rested.event.type, 'recovery');
  assert.equal(rested.event.count, 1);
  assert.ok(rested.strength < paired.strength, `${rested.strength} should stay below ${paired.strength}`);
  assert.equal(rested.event.earlierPeak, paired.strength);
  // Pairings in a row keep raising the same peak. 连续的配对一直抬高同一个峰值。
  const twice = runActions(['pair', 'pair'], runActions([...repeat('pair', 3), 'cs-alone']));
  assert.equal(twice.peak, twice.strength);
  const steady = runActions(['pair', 'rest', 'pair']);
  assert.equal(steady.peak, steady.strength);
});

test('pairing after extinction learns the CR again and leaves the recovery stage', () => {
  const recovered = runActions([...repeat('pair', 6), ...repeat('cs-alone', 6), 'rest', 'cs-alone']);
  assert.equal(recovered.recovering, true);
  const paired = simulate(recovered, 'pair');
  assert.equal(paired.event.type, 'acquisition');
  assert.equal(paired.event.again, true);
  assert.equal(paired.recovering, false);
  assert.equal(paired.extinctionSince, 0);
  assert.equal(paired.peak, Math.max(recovered.peak, paired.strength));
  assert.equal(simulate(paired, 'cs-alone').steps.at(-1).phase, 'extinction');
});

test('a full chart adds no step until Reset', () => {
  const full = runActions(repeat('pair', MAX_STEPS));
  assert.equal(full.steps.length, MAX_STEPS + 1);
  assert.equal(isFull(full), true);
  for (const action of SIM_ACTIONS) {
    const next = simulate(full, action);
    assert.equal(next.event.type, 'full');
    assert.equal(next.steps.length, full.steps.length);
    assert.equal(next.strength, full.strength);
    assert.equal(next.trials, full.trials);
  }
  const reset = simulate(full, 'reset');
  assert.deepEqual(reset.steps, initialSimulation().steps);
  assert.equal(reset.event.type, 'reset');
  assert.equal(isFull(reset), false);
});

test('reset, unknown actions and broken states', () => {
  const state = runActions(['pair', 'pair', 'cs-alone']);
  const reset = simulate(state, { type: 'reset' });
  assert.deepEqual({ ...reset, event: null }, { ...initialSimulation(), event: null });
  assert.equal(reset.event.type, 'reset');
  for (const action of ['jump', '', null, undefined, 3, { type: 'fly' }, ['pair']]) {
    assert.equal(simulate(state, action), state, String(action));
  }
  close(simulate(state, { type: 'pair' }).strength, state.strength + 0.3 * (1 - state.strength));
  for (const broken of [undefined, null, {}, { strength: 'x', steps: [] }, { strength: 0.5, steps: [], peak: 0.5, trials: 1 }, []]) {
    const next = simulate(broken, 'pair');
    close(next.strength, 0.3);
    assert.equal(next.steps.length, 2);
  }
  assert.equal(isFull(undefined), false);
  assert.deepEqual(runActions('pair').steps, initialSimulation().steps);
});

test('the reducer never changes the state it is given', () => {
  const frozen = deepFreeze(runActions([...repeat('pair', 6), ...repeat('cs-alone', 6)]));
  const snapshot = JSON.stringify(frozen);
  for (const action of [...SIM_ACTIONS, 'reset']) assert.doesNotThrow(() => simulate(frozen, action));
  assert.doesNotThrow(() => runActions([...repeat('cs-alone', 3), 'rest', 'cs-alone', 'pair'], frozen));
  assert.equal(JSON.stringify(frozen), snapshot);
});

test('the Figure 6.3 sequence: acquisition, extinction, rest, then spontaneous recovery with the CS alone', () => {
  const actions = figureSequence();
  assert.equal(actions.length, DEMO_COUNTS.pairings + DEMO_COUNTS.extinction + 1 + DEMO_COUNTS.afterRest);
  assert.deepEqual(actions.slice(0, DEMO_COUNTS.pairings), repeat('pair', DEMO_COUNTS.pairings));
  assert.equal(actions[DEMO_COUNTS.pairings + DEMO_COUNTS.extinction], 'rest');
  const demo = demoSimulation();
  assert.equal(demo.event.type, 'demo');
  const runs = phaseRuns(demo.steps);
  assert.deepEqual(runs.map((run) => run.phase), ['acquisition', 'extinction', 'rest', 'recovery']);
  const [acquisition, extinction, rest, recovery] = runs;
  assert.equal(formatStrength(acquisition.to), '94%');
  assert.equal(formatStrength(extinction.to), '5%');
  assert.equal(rest.recovered, true);
  assert.equal(formatStrength(rest.to), '50%');
  assert.ok(rest.to < acquisition.to);
  assert.ok(recovery.to < rest.to);
  assert.equal(demo.trials, DEMO_COUNTS.pairings + DEMO_COUNTS.extinction + DEMO_COUNTS.afterRest);
  assert.ok(demo.steps.length - 1 <= MAX_STEPS);
});

/* ---------- Stages, labels and sentences 阶段、标签与句子 ---------- */

test('phaseRuns groups consecutive steps of one stage, numbered like the chart bands', () => {
  const state = runActions(['cs-alone', 'pair', 'pair', 'cs-alone', 'rest', 'rest', 'cs-alone', 'cs-alone']);
  const runs = phaseRuns(state.steps);
  assert.deepEqual(runs.map((run) => [run.number, run.phase, run.start, run.end, run.firstTrial, run.lastTrial]), [
    [1, 'neutral', 1, 1, 1, 1],
    [2, 'acquisition', 2, 3, 2, 3],
    [3, 'extinction', 4, 4, 4, 4],
    [4, 'rest', 5, 6, null, null],
    [5, 'recovery', 7, 8, 5, 6],
  ]);
  assert.equal(runs[3].recovered, true);
  close(runs[1].from, 0);
  close(runs[1].to, 0.51);
  assert.deepEqual(phaseRuns(initialSimulation().steps), []);
  assert.deepEqual(phaseRuns(undefined), []);
  assert.deepEqual(phaseRuns([null, 3, { phase: 'nope' }]), []);
  const unchanged = phaseRuns(runActions(['pair', 'rest']).steps);
  assert.equal(unchanged[1].recovered, false);
});

test('phaseText describes a stage for the list under the chart', () => {
  const runs = phaseRuns(demoSimulation().steps);
  const [acquisition, extinction, rest, recovery] = runs.map((run) => phaseText(run, 'us'));
  assert.deepEqual(acquisition.name, PHASES.acquisition.name);
  assert.deepEqual(acquisition.what, bi('CS 与 US 配对', 'CS–US paired'));
  assert.deepEqual(acquisition.range, bi('第 1–8 次试次', 'trials 1–8'));
  assert.equal(acquisition.change, 'CR 0% → 94%');
  assert.equal(acquisition.result, null);
  assert.deepEqual(extinction.what, PHASES.extinction.what);
  assert.equal(rest.range, null);
  assert.deepEqual(rest.result, bi('自发恢复', 'spontaneous recovery'));
  assert.equal(rest.change, 'CR 5% → 50%');
  assert.deepEqual(recovery.name, bi('自发恢复', 'Spontaneous recovery'));
  assert.deepEqual(recovery.range, bi('第 17–22 次试次', 'trials 17–22'));
  assert.deepEqual(phaseText(runs[0], 'ucs').what, bi('CS 与 UCS 配对', 'CS–UCS paired'));
  const single = phaseText(phaseRuns(runActions(['pair']).steps)[0], 'us');
  assert.deepEqual(single.range, bi('第 1 次试次', 'trial 1'));
  assert.deepEqual(phaseText(phaseRuns(runActions(['pair', 'rest']).steps)[1], 'us').result, bi('没有变化', 'no change'));
  assert.doesNotThrow(() => phaseText(undefined, 'us'));
});

test('formatStrength writes whole percentages', () => {
  assert.equal(formatStrength(0), '0%');
  assert.equal(formatStrength(1), '100%');
  assert.equal(formatStrength(0.9424), '94%');
  assert.equal(formatStrength(0.005), '1%');
  assert.equal(formatStrength(0.0049), '0%');
  assert.equal(formatStrength(1.4), '100%');
  assert.equal(formatStrength(-0.2), '0%');
  assert.equal(formatStrength(Number.NaN), '0%');
  assert.equal(formatStrength(undefined), '0%');
});

test('button labels and the status line follow the notation', () => {
  assert.deepEqual(actionLabel('pair', 'us'), bi('配对 CS + US', 'Pair CS + US'));
  assert.deepEqual(actionLabel('pair', 'ucs'), bi('配对 CS + UCS', 'Pair CS + UCS'));
  assert.deepEqual(actionLabel('cs-alone', 'ucs'), bi('只给 CS', 'CS alone'));
  assert.deepEqual(actionLabel('rest', 'us'), bi('休息（隔一天）', 'Rest (a day later)'));
  assert.deepEqual(actionLabel('demo', 'us'), bi('按教材图 6.3 走一遍', 'Run the Figure 6.3 sequence'));
  assert.deepEqual(actionLabel('reset', 'us'), bi('重置', 'Reset'));
  assert.deepEqual(actionLabel('anything', 'us'), bi('重置', 'Reset'));
  assert.deepEqual(statusText(runActions(['pair', 'pair'])), bi('试次：2 次 · 现在的 CR 强度：51%', 'Trials: 2 · CR strength now: 51%'));
  assert.deepEqual(statusText(undefined), bi('试次：0 次 · 现在的 CR 强度：0%', 'Trials: 0 · CR strength now: 0%'));
});

test('eventSentence names what just happened in the textbook terms, with the example and the notation', () => {
  const model = normalize({ example: 'pavlov' });
  const say = (state, notation = 'us') => eventSentence(state.event, model, notation);
  const acquired = runActions(['pair', 'pair']);
  assert.equal(say(acquired).en, '**Acquisition**: the CS (buzzer) was paired with the US (food), so the CR strength rose from 30% to 51%.');
  assert.match(say(acquired).zh, /^\*\*习得\*\*（\*\*acquisition\*\*）：CS（蜂鸣器）和 US（食物）配对出现，CR 强度从 30% 升到 51%。$/);
  assert.match(say(acquired, 'ucs').en, /paired with the UCS \(food\)/);
  const nearTop = runActions(repeat('pair', 7));
  assert.ok(nearTop.strength >= NEAR_MAX_LEVEL);
  assert.match(say(nearTop).en, /each pairing adds less/);

  const extinguished = runActions([...repeat('pair', 8), ...repeat('cs-alone', 8)]);
  assert.match(say(extinguished).en, /^\*\*Extinction\*\*: the CS \(buzzer\) came alone, without the US \(food\), so the CR strength fell from 8% to 5%\. The CR is almost gone/);
  assert.doesNotMatch(say(runActions(['pair', 'pair', 'cs-alone'])).en, /almost gone/);

  const recovered = simulate(extinguished, 'rest');
  assert.equal(say(recovered).en, '**Spontaneous recovery**: a day later, with no new pairing, the extinguished CR came back to 50%, '
    + 'weaker than its earlier peak of 94%. Present the CS alone and it extinguishes again.');
  assert.match(say(recovered).zh, /自发恢复/);
  const again = simulate(recovered, 'cs-alone');
  assert.match(say(again).en, /^\*\*Spontaneous recovery\*\* stage: .*extinction again/);
  const second = simulate(runActions(repeat('cs-alone', 6), recovered), 'rest');
  assert.equal(second.event.count, 2);
  assert.match(say(second).en, /weaker than the last recovery \(50%\)/);

  assert.match(say(simulate(initialSimulation(), 'cs-alone')).en, /never been paired with the US \(food\), so it produces no CR/);
  assert.match(say(simulate(initialSimulation(), 'rest')).en, /nothing can recover/);
  assert.match(say(simulate(runActions(['pair']), 'rest')).en, /was not extinguished/);
  assert.match(say(simulate(recovered, 'rest')).en, /has just recovered/);
  assert.match(say(simulate(runActions(repeat('pair', MAX_STEPS)), 'pair')).en, new RegExp(`${MAX_STEPS} steps at most`));
  assert.match(say(demoSimulation()).en, /^Same order as Figure 6\.3 \(the numbers of trials are this demo's own\): acquisition \(8 pairings\)/);
  assert.match(say(demoSimulation()).zh, /^和教材图 6\.3 的顺序一样/);
  assert.match(say(simulate(acquired, 'reset')).en, /^Reset: back to the start/);
  assert.equal(say(initialSimulation()).en, 'Not started: the neutral stimulus (buzzer) produces no CR yet, so the CR strength is 0%. Start with Pair CS + US.');
  assert.match(eventSentence(undefined, model, 'ucs').en, /Start with Pair CS \+ UCS\./);

  const ceased = { type: 'recovery-ceased', before: 0.02, after: 0.02 };
  assert.match(eventSentence(ceased, model, 'us').en, /has now stopped \(CR 2%\)/);

  const custom = normalize({ example: 'custom', roles: PHONE_ROLES });
  assert.match(eventSentence(acquired.event, custom, 'us').en, /the CS \(WeChat notification sound\) was paired with the US \(bad news from the supervisor\)/);
});

test('announcementText reads the Chinese then the English, without markup', () => {
  assert.equal(announcementText(bi('**习得**（**acquisition**）：上升。', '**Acquisition**: rose.')), '习得（acquisition）：上升。 Acquisition: rose.');
  assert.equal(announcementText(bi('', 'Only English.')), 'Only English.');
  assert.equal(announcementText(undefined), '');
  assert.equal(announcementText(NOTATION_OPTIONS.ucs.announce), '现在用讲课的写法：UCS、UCR、CS、CR。 Now using the lecture notation: UCS, UCR, CS, CR.');
});

test('simplifiedNote states the same rules the reducer uses', () => {
  const note = simplifiedNote();
  assert.match(note.en, /^\*\*Simplified illustration\*\*/);
  assert.match(note.zh, /^\*\*简化示意\*\*/);
  assert.match(note.en, new RegExp(`adds ${RATES.acquisition * 100}% of the gap to 100%`));
  assert.match(note.en, new RegExp(`removes ${RATES.extinction * 100}% of the current strength`));
  assert.match(note.en, /halfway back to its earlier peak/);
  assert.equal(RECOVERY_SHARE, 0.5);
});

/* ---------- Chart 图 ---------- */

test('chartGeometry maps steps and strengths to pixels', () => {
  const geometry = chartGeometry(600, 5);
  assert.equal(geometry.width, 600);
  assert.equal(geometry.height, CHART.height);
  assert.deepEqual(geometry.plot, { left: CHART.left, right: 600 - CHART.right, top: CHART.top, bottom: CHART.height - CHART.bottom });
  assert.equal(geometry.slots, CHART.minSlots);
  close(geometry.slot, (600 - CHART.right - CHART.left) / CHART.minSlots);
  close(geometry.x(0), CHART.left + geometry.slot / 2);
  assert.equal(geometry.y(0), geometry.plot.bottom);
  assert.equal(geometry.y(1), geometry.plot.top);
  assert.equal(geometry.y(2), geometry.plot.top);
  assert.equal(geometry.y(Number.NaN), geometry.plot.bottom);
  assert.equal(chartGeometry(600, 30).slots, 30);
  assert.equal(chartGeometry(undefined, 1).width, 480);
  assert.equal(chartGeometry(-5, 1).width, 480);
  assert.equal(chartGeometry(100, 1).width, CHART.minWidth);
});

test('trialLabelStride keeps the trial numbers apart', () => {
  assert.equal(trialLabelStride(40), 1);
  assert.equal(trialLabelStride(17), 2);
  assert.equal(trialLabelStride(6), 5);
  assert.equal(trialLabelStride(1.5), 20);
  assert.equal(trialLabelStride(0), 20);
  for (const slot of [3, 5, 8, 12, 25]) assert.ok(trialLabelStride(slot) * slot >= CHART.labelGap || trialLabelStride(slot) === 20);
});

test('chartModel draws bands, points, dashed rests, labels and the earlier peak', () => {
  const demo = demoSimulation();
  const chart = chartModel(demo, 640);
  const runs = phaseRuns(demo.steps);
  assert.deepEqual(chart.bands.map((band) => [band.phase, band.number]), runs.map((run) => [run.phase, run.number]));
  close(chart.bands[0].x, chart.geometry.plot.left + chart.geometry.slot);
  close(chart.bands[0].width, DEMO_COUNTS.pairings * chart.geometry.slot);
  assert.equal(chart.points.length, demo.steps.length);
  assert.deepEqual(chart.points.filter((point) => point.latest).map((point) => point.index), [demo.steps.length - 1]);
  assert.deepEqual(chart.segments.map((segment, index) => segment.dashed ? index + 1 : null).filter((index) => index !== null),
    demo.steps.map((step, index) => (step.kind === 'rest' ? index : null)).filter((index) => index !== null));
  assert.equal(chart.segments.length, demo.steps.length - 1);
  const stride = trialLabelStride(chart.geometry.slot);
  assert.deepEqual(chart.xLabels.map((label) => label.text),
    demo.steps.filter((step) => Number.isFinite(step.trial) && step.trial % stride === 0).map((step) => String(step.trial)));
  assert.equal(chart.xLabels[0].text, '0');
  assert.deepEqual(chart.yTicks.map((tick) => tick.text), TICK_VALUES.map(formatStrength));
  assert.ok(chart.peak);
  assert.equal(chart.peak.text, '94%');
  close(chart.peak.y, chart.geometry.y(demo.highest));
  // The peak label sits above its line, below the stage numbers; at the very top it moves under the line.
  // 峰值标签在虚线上方、阶段编号下方；峰值到顶时移到虚线下方。
  close(chart.peak.labelY, chart.peak.y - 5);
  assert.ok(chart.peak.labelY > chart.geometry.plot.top);
  const topped = chartModel(runActions([...repeat('pair', 30), ...repeat('cs-alone', 4), 'rest']), 640);
  close(topped.peak.labelY, topped.peak.y + 13);
  // Neighbouring stage numbers are never closer than CHART.numberGap. 相邻的阶段编号间距不小于 CHART.numberGap。
  chart.numbers.slice(1).forEach((item, index) => assert.ok(item.x - chart.numbers[index].x >= CHART.numberGap));

  // On a phone, one-step bands side by side are too narrow for every number; the list under the chart has them all.
  // 手机上并排的一步宽色块放不下每个编号；图下方的列表里都有。
  const dense = runActions([...repeat('pair', 30), 'cs-alone', 'rest', 'cs-alone', 'rest', 'pair', 'cs-alone']);
  const narrow = chartModel(dense, 260);
  assert.ok(narrow.numbers.length < narrow.bands.length, 'one-step bands should not all get a number');
  assert.equal(narrow.numbers[0].number, 1);
  narrow.numbers.slice(1).forEach((item, index) => assert.ok(item.x - narrow.numbers[index].x >= CHART.numberGap));
  assert.equal(chartModel(dense, 1200).numbers.length, chartModel(dense, 1200).bands.length);
  assert.equal(chartModel(runActions(['pair', 'pair']), 640).peak, null);
  assert.equal(chartModel(runActions(['pair', 'pair', 'rest']), 640).peak, null);
  const empty = chartModel(undefined, 640);
  assert.deepEqual(empty.bands, []);
  assert.equal(empty.points.length, 1);
  assert.equal(empty.points[0].latest, true);
});

test('chartDescription gives a text alternative stage by stage', () => {
  const text = chartDescription(demoSimulation(), 'us');
  assert.match(text, /^条件反应强度折线图（简化示意） Line chart of CR strength \(simplified illustration\)\./);
  assert.match(text, /1\. 习得 Acquisition \(CS–US paired, trials 1–8\): CR 0% → 94%\./);
  assert.match(text, /3\. 休息 Rest \(a day later, no trials\): CR 5% → 50%, 自发恢复 spontaneous recovery\./);
  assert.match(text, /4\. 自发恢复 Spontaneous recovery \(CS alone, trials 17–22\): CR 50% → 6%\./);
  assert.match(chartDescription(demoSimulation(), 'ucs'), /CS–UCS paired/);
  assert.match(chartDescription(initialSimulation(), 'us'), /No trials yet\. CR 0%\.$/);
});

/* ---------- Every visible string 所有可见文字 ---------- */

function collectStrings() {
  const pairs = [];
  const loose = [];
  const collect = (value) => {
    if (typeof value === 'string') loose.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      if (typeof value.zh === 'string' && typeof value.en === 'string') pairs.push(value);
      Object.values(value).forEach(collect);
    }
  };
  collect([PRESETS, UI_TEXT, ROLE_TERMS, STAGE_TITLES, CONNECTORS, NOTATION_OPTIONS, NOTATION_NOTE, PHASES, DEFAULT_TITLE, simplifiedNote()]);
  const events = [
    'start', 'reset', 'neutral', 'rest-unlearned', 'full', 'demo', 'recovery-ceased', 'unknown',
    { type: 'acquisition', before: 0.3, after: 0.51, again: false },
    { type: 'acquisition', before: 0.9, after: 0.93, again: true },
    { type: 'extinction', before: 0.2, after: 0.08, gone: true },
    { type: 'extinction-again', before: 0.12, after: 0.08, gone: true },
    { type: 'recovery', before: 0.05, after: 0.5, earlierPeak: 0.94, count: 1 },
    { type: 'recovery', before: 0.05, after: 0.28, earlierPeak: 0.5, count: 2 },
    { type: 'rest-unchanged', before: 0.6, after: 0.6, afterRecovery: false },
    { type: 'rest-unchanged', before: 0.6, after: 0.6, afterRecovery: true },
  ];
  for (const example of EXAMPLES.filter((name) => name !== 'custom')) {
    for (const notation of NOTATIONS) {
      const model = normalize({ example, notation });
      collect([storyboard(model, notation), termKey(notation), examAnswer(model, notation)]);
      for (const event of events) collect(eventSentence(typeof event === 'string' ? { type: event } : event, model, notation));
      for (const action of [...SIM_ACTIONS, 'demo', 'reset']) collect(actionLabel(action, notation));
      const demo = demoSimulation();
      collect([statusText(demo), phaseRuns(demo.steps).map((run) => phaseText(run, notation)), chartDescription(demo, notation)]);
      collect(phaseRuns(runActions(['cs-alone', 'pair', 'rest']).steps).map((run) => phaseText(run, notation)));
    }
  }
  return { pairs, loose };
}

test('no string the widget shows contains an emoji or HTML, and the bold markers are balanced', () => {
  const { pairs, loose } = collectStrings();
  assert.ok(pairs.length > 150, `only ${pairs.length} bilingual values`);
  for (const text of loose) {
    assert.ok(!EMOJI.test(text), `emoji in: ${text}`);
    assert.ok(!HTML_TAG.test(text), `HTML in: ${text}`);
    assert.equal(text.split('**').length % 2, 1, `unbalanced bold in: ${text}`);
  }
});

test('every Chinese text has Chinese, every English text has none, and English uses Canadian spelling', () => {
  const { pairs } = collectStrings();
  for (const { zh, en } of pairs) {
    if (zh) assert.ok(HAN.test(zh), `no Chinese in zh: ${zh}`);
    assert.ok(en.trim(), `empty English next to: ${zh}`);
    assert.ok(!HAN.test(en), `Chinese in en: ${en}`);
    assert.ok(!AMERICAN.test(en), `American spelling in: ${en}`);
  }
});
