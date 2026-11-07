import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITERION_LIMITS,
  CRITERION_TOLERANCE,
  DEFAULT_SCENARIO,
  DEFAULT_SIGNAL,
  DEFAULT_TITLE,
  EVIDENCE_RANGE,
  OUTCOME_IDS,
  PLOT,
  PRESET_IDS,
  PRESET_OFFSETS,
  SENSITIVITY_LIMITS,
  TEXT,
  activePreset,
  announcement,
  clampCriterion,
  clampSensitivity,
  criterionAt,
  criterionStance,
  criterionValueLabel,
  criterionValueText,
  curveLabelLayout,
  curvePath,
  curveY,
  erf,
  erfc,
  estimateTextWidth,
  figureDescription,
  formatCriterion,
  formatSensitivity,
  initialState,
  labelCentre,
  normalCdf,
  normalDensity,
  normalizeSignalDetectionConfig,
  outcomePercents,
  outcomeRates,
  outcomeTable,
  plotLayout,
  plotScale,
  presetAnnouncement,
  presetCriterion,
  resetAnnouncement,
  resultSentence,
  sensitivityLabel,
  sensitivityValueText,
  snapCriterion,
  snapSensitivity,
  stanceSentence,
  tailAreaPath,
  withCriterion,
  withPreset,
  withSensitivity,
} from '../../../engine/widgets/psychology/signal-detection/signal-detection-logic.js';

const bi = (zh, en) => ({ zh, en });
const state = (sensitivity, criterion) => ({ sensitivity, criterion });
// Validator rule (tools/validate_content.py): no emojis or pictographic symbols in any text.
// 校验器规则：任何文字里都不能有表情或图形符号。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const CJK = /[一-鿿]/;

function near(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, message ?? `${actual} is not within ${tolerance} of ${expected}`);
}

// Relative closeness for tiny tail probabilities. 极小尾部概率用相对误差比较。
function relativelyNear(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} vs ${expected}`);
}

// The signal-detection row of tools/content-spec.md section 5.5, with the scenario it describes.
// content-spec 第 5.5 节 signal-detection 一行的例子，以及它描述的情境。
const SPEC_CONFIG = {
  title: bi('放射科医生看片', 'A radiologist reads X-rays'),
  scenario: bi('放射科医生看一张 X 光片，判断上面有没有肿瘤。', 'A radiologist reads an X-ray and decides whether it shows a tumour.'),
  signal: bi('肿瘤', 'a tumour'),
  sensitivity: 1.5,
  criterion: 0.75,
};

/* ---------- Normal distribution 正态分布 ---------- */

// Reference values from Python's math.erf, math.erfc and 0.5 * erfc(-z / sqrt(2)).
// 参考值来自 Python 的 math.erf、math.erfc 与 0.5 * erfc(-z / sqrt(2))。
const ERF_REFERENCE = [
  [0.1, 0.1124629160182849, 0.8875370839817152],
  [0.25, 0.27632639016823696, 0.7236736098317631],
  [0.46875, 0.492613473217938, 0.507386526782062],
  [0.5, 0.5204998778130465, 0.4795001221869534],
  [1, 0.8427007929497149, 0.1572992070502851],
  [1.5, 0.9661051464753108, 0.033894853524689274],
  [2, 0.9953222650189527, 0.004677734981047265],
  [3, 0.9999779095030014, 2.209049699858544e-05],
  [4, 0.9999999845827421, 1.5417257900280017e-08],
  [4.5, 0.9999999998033839, 1.9661604415428876e-10],
  [5, 0.9999999999984626, 1.5374597944280351e-12],
  [6, 1, 2.1519736712498913e-17],
  [10, 1, 2.088487583762545e-45],
];

test('erf and erfc match reference values to about one unit in the last place', () => {
  for (const [x, erfValue, erfcValue] of ERF_REFERENCE) {
    near(erf(x), erfValue, 4e-16, `erf(${x})`);
    near(erf(-x), -erfValue, 4e-16, `erf(-${x})`);
    relativelyNear(erfc(x), erfcValue, 1e-14);
    near(erfc(-x), 2 - erfcValue, 4e-16, `erfc(-${x})`);
  }
});

test('erf is odd and bounded, and both functions handle the edges', () => {
  assert.equal(erf(0), 0);
  assert.equal(erfc(0), 1);
  assert.equal(erf(Infinity), 1);
  assert.equal(erf(-Infinity), -1);
  assert.equal(erfc(Infinity), 0);
  assert.equal(erfc(-Infinity), 2);
  assert.equal(erfc(30), 0);
  for (let x = -6; x <= 6; x += 0.37) {
    assert.equal(erf(-x), -erf(x));
    assert.ok(erf(x) >= -1 && erf(x) <= 1);
    near(erf(x) + erfc(x), 1, 1e-15);
  }
  for (const bad of [NaN, undefined, null, '1', [1], {}]) {
    assert.ok(Number.isNaN(erf(bad)), String(bad));
    assert.ok(Number.isNaN(erfc(bad)), String(bad));
  }
});

test('Φ(0) = 0.5 exactly, Φ(1.96) ≈ 0.975, and Φ is symmetric and increasing', () => {
  assert.equal(normalCdf(0), 0.5);
  near(normalCdf(1.96), 0.975, 1e-5);
  near(normalCdf(1.96), 0.9750021048517796, 1e-15);
  near(normalCdf(-1.96), 0.024997895148220435, 1e-15);
  near(normalCdf(1), 0.8413447460685428, 1e-15);
  near(normalCdf(0.75), 0.7733726476231317, 1e-15);
  near(normalCdf(-0.05), 0.4800611941616275, 1e-15);
  near(normalCdf(1.55), 0.939429241997941, 1e-15);
  relativelyNear(normalCdf(-4.5), 3.397673124730062e-06, 1e-13);
  assert.equal(normalCdf(Infinity), 1);
  assert.equal(normalCdf(-Infinity), 0);
  assert.ok(Number.isNaN(normalCdf(NaN)));
  assert.ok(Number.isNaN(normalCdf('0')));
  let previous = -1;
  for (let z = -6; z <= 6; z += 0.05) {
    const value = normalCdf(z);
    assert.ok(value > previous, `Φ increases at ${z}`);
    near(value + normalCdf(-z), 1, 1e-15);
    previous = value;
  }
});

test('φ is the height of the standard normal curve', () => {
  near(normalDensity(0), 0.3989422804014327, 1e-16);
  near(normalDensity(1) / normalDensity(0), Math.exp(-0.5), 1e-15);
  assert.equal(normalDensity(-1.3), normalDensity(1.3));
  assert.ok(Number.isNaN(normalDensity(undefined)));
});

/* ---------- Config 配置 ---------- */

test('normalizeSignalDetectionConfig reads the content-spec example as written', () => {
  const model = normalizeSignalDetectionConfig(SPEC_CONFIG);
  assert.deepEqual(model.title, SPEC_CONFIG.title);
  assert.deepEqual(model.scenario, SPEC_CONFIG.scenario);
  assert.deepEqual(model.signal, SPEC_CONFIG.signal);
  assert.equal(model.sensitivity, 1.5);
  assert.equal(model.criterion, 0.75);
  assert.deepEqual(model.usedDefault, { title: false, story: false, sensitivity: false, criterion: false });
});

test('every config the validator accepts is read without changes', () => {
  const story = { scenario: SPEC_CONFIG.scenario, signal: SPEC_CONFIG.signal };
  for (const sensitivity of [0, 0.5, 1, 1.37, 2, 3]) {
    for (const criterion of [-1.5, -0.25, 0, 0.7, 2.95, 3]) {
      const model = normalizeSignalDetectionConfig({ ...story, sensitivity, criterion });
      assert.equal(model.sensitivity, sensitivity);
      assert.equal(model.criterion, criterion);
      assert.deepEqual(model.scenario, story.scenario);
      assert.deepEqual(model.signal, story.signal);
    }
  }
  // Only scenario and signal are required; title, sensitivity and criterion are optional.
  // 只有 scenario 和 signal 是必需的；title、sensitivity 和 criterion 都可以省略。
  const minimal = normalizeSignalDetectionConfig(story);
  assert.deepEqual(minimal.title, DEFAULT_TITLE);
  assert.deepEqual(minimal.usedDefault, { title: true, story: false, sensitivity: true, criterion: true });
});

test('missing numbers give d′ = 1.5 and the neutral point d′ / 2', () => {
  const story = { scenario: SPEC_CONFIG.scenario, signal: SPEC_CONFIG.signal };
  assert.deepEqual([normalizeSignalDetectionConfig(story).sensitivity, normalizeSignalDetectionConfig(story).criterion], [1.5, 0.75]);
  assert.equal(normalizeSignalDetectionConfig({ ...story, sensitivity: 2.4 }).criterion, 1.2);
  assert.equal(normalizeSignalDetectionConfig({ ...story, sensitivity: 0 }).criterion, 0);
  const onlyCriterion = normalizeSignalDetectionConfig({ ...story, criterion: 2 });
  assert.deepEqual([onlyCriterion.sensitivity, onlyCriterion.criterion], [1.5, 2]);
});

test('numbers outside the ranges are clamped, not replaced', () => {
  const read = (config) => {
    const model = normalizeSignalDetectionConfig(config);
    return [model.sensitivity, model.criterion];
  };
  assert.deepEqual(read({ sensitivity: -1, criterion: 0.5 }), [0, 0.5]);
  assert.deepEqual(read({ sensitivity: 7, criterion: 0.5 }), [3, 0.5]);
  assert.deepEqual(read({ sensitivity: 1, criterion: -9 }), [1, -1.5]);
  assert.deepEqual(read({ sensitivity: 1, criterion: 12 }), [1, 3]);
  // The default criterion follows the clamped d′. 默认判断标准跟着限制后的 d′ 走。
  assert.deepEqual(read({ sensitivity: 5 }), [3, 1.5]);
  assert.deepEqual(read({ sensitivity: -2 }), [0, 0]);
  assert.ok(Object.is(read({ criterion: -0 })[1], 0), '−0 is read as 0');
  assert.deepEqual([clampSensitivity(4), clampSensitivity(-1), clampSensitivity('2')], [3, 0, 1.5]);
  assert.deepEqual([clampCriterion(-4), clampCriterion(5), clampCriterion(null, 2), clampCriterion('1')], [-1.5, 3, 1, 0.75]);
});

test('anything else falls back to the defaults and never throws', () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const throwing = {};
  Object.defineProperty(throwing, 'sensitivity', { enumerable: true, get() { throw new Error('boom'); } });
  for (const config of [undefined, null, 42, 'text', true, [], [1, 2], () => {}, Symbol('x'), revoked.proxy, throwing, {}]) {
    const model = normalizeSignalDetectionConfig(config);
    assert.deepEqual(model.title, DEFAULT_TITLE);
    assert.deepEqual(model.scenario, DEFAULT_SCENARIO);
    assert.deepEqual(model.signal, DEFAULT_SIGNAL);
    assert.deepEqual([model.sensitivity, model.criterion], [1.5, 0.75]);
  }
  for (const bad of ['2', '', NaN, Infinity, -Infinity, null, true, [1], { value: 1 }, 10n]) {
    const model = normalizeSignalDetectionConfig({ sensitivity: bad, criterion: bad });
    assert.deepEqual([model.sensitivity, model.criterion], [1.5, 0.75], String(bad));
    assert.equal(model.usedDefault.sensitivity, true);
    assert.equal(model.usedDefault.criterion, true);
  }
});

test('title, scenario and signal need both languages, and scenario and signal only come as a pair', () => {
  const story = { scenario: SPEC_CONFIG.scenario, signal: SPEC_CONFIG.signal };
  for (const title of [bi('只有中文', ''), { zh: '只有中文' }, { en: 'English only' }, bi('   ', 'Blank'), 'A plain string', bi('有表情 \u{1F600}', 'Emoji'), ['x'], 3]) {
    assert.deepEqual(normalizeSignalDetectionConfig({ ...story, title }).title, DEFAULT_TITLE, JSON.stringify(title));
  }
  assert.deepEqual(normalizeSignalDetectionConfig({ ...story, title: bi('  标题 ', ' Title  ') }).title, bi('标题', 'Title'));
  // Half a story would mix two situations, so both fall back together. 只用一半会把两个情境混在一起，所以两者一起退回默认。
  for (const config of [
    { scenario: story.scenario },
    { signal: story.signal },
    { scenario: story.scenario, signal: { zh: '肿瘤' } },
    { scenario: 'A radiologist reads X-rays', signal: story.signal },
    { scenario: story.scenario, signal: bi('肿瘤', '☀ a tumour') },
    { scenario: story.scenario, signal: { ...story.signal, note: 'the validator rejects unknown keys' } },
  ]) {
    const model = normalizeSignalDetectionConfig(config);
    assert.deepEqual(model.scenario, DEFAULT_SCENARIO);
    assert.deepEqual(model.signal, DEFAULT_SIGNAL);
    assert.equal(model.usedDefault.story, true);
  }
  const trimmed = normalizeSignalDetectionConfig({ scenario: bi(' 医生看片 ', ' A doctor reads scans '), signal: bi('肿瘤 ', ' a tumour') });
  assert.deepEqual([trimmed.scenario, trimmed.signal], [bi('医生看片', 'A doctor reads scans'), bi('肿瘤', 'a tumour')]);
});

test('the default story is the textbook ticking clock (p.127) and is bilingual', () => {
  assert.match(DEFAULT_SCENARIO.en, /clock/);
  assert.match(DEFAULT_SIGNAL.en, /ticking/);
  assert.ok(CJK.test(DEFAULT_SCENARIO.zh) && CJK.test(DEFAULT_SIGNAL.zh));
  assert.deepEqual(DEFAULT_TITLE, bi('信号检测论', 'Signal detection theory'));
  assert.ok(Object.isFrozen(DEFAULT_SCENARIO) && Object.isFrozen(TEXT) && Object.isFrozen(TEXT.explain[0]));
});

/* ---------- State changes 状态变化 ---------- */

test('initialState keeps the config numbers exactly, even off the slider grid', () => {
  const model = normalizeSignalDetectionConfig({ ...SPEC_CONFIG, sensitivity: 1.37, criterion: 0.123 });
  assert.deepEqual(initialState(model), state(1.37, 0.123));
  assert.deepEqual(initialState(null), state(1.5, 0.75));
  assert.deepEqual(initialState({ sensitivity: 9 }), state(3, 1.5));
});

test('withCriterion snaps to steps of 0.05, clamps, reads slider strings and ignores non-numbers', () => {
  const start = Object.freeze(state(1.5, 0.75));
  assert.deepEqual(withCriterion(start, 0.737), state(1.5, 0.75));
  assert.deepEqual(withCriterion(start, 0.776), state(1.5, 0.8));
  assert.deepEqual(withCriterion(start, '-0.05'), state(1.5, -0.05));
  assert.deepEqual(withCriterion(start, '1.1500000000000001'), state(1.5, 1.15));
  assert.deepEqual(withCriterion(start, -7), state(1.5, -1.5));
  assert.deepEqual(withCriterion(start, 99), state(1.5, 3));
  assert.ok(Object.is(withCriterion(start, -0.02).criterion, 0), 'never −0');
  for (const bad of [NaN, 'abc', '', null, undefined, {}, Infinity]) {
    assert.deepEqual(withCriterion(start, bad), start, String(bad));
  }
  assert.deepEqual(start, state(1.5, 0.75), 'the old state is not changed');
  assert.equal(snapCriterion(0.0249), 0);
  assert.equal(snapCriterion(2.99), 3);
  assert.equal(snapCriterion('x'), null);
  assert.equal(CRITERION_LIMITS.step, 0.05);
});

test('withSensitivity snaps to steps of 0.1 and leaves the criterion line where it is', () => {
  const start = Object.freeze(state(1.5, 0.75));
  assert.deepEqual(withSensitivity(start, 2.04), state(2, 0.75));
  assert.deepEqual(withSensitivity(start, '0.3'), state(0.3, 0.75));
  assert.deepEqual(withSensitivity(start, 4), state(3, 0.75));
  assert.deepEqual(withSensitivity(start, -1), state(0, 0.75));
  assert.deepEqual(withSensitivity(start, 'two'), start);
  assert.equal(snapSensitivity(0.15000000000000002), 0.2);
  assert.equal(snapSensitivity(null), null);
  assert.equal(SENSITIVITY_LIMITS.step, 0.1);
});

test('presets put the criterion at d′/2 − 0.8, d′/2 and d′/2 + 0.8', () => {
  assert.deepEqual(PRESET_IDS, ['liberal', 'neutral', 'conservative']);
  assert.deepEqual(PRESET_OFFSETS, { liberal: -0.8, neutral: 0, conservative: 0.8 });
  const at = (sensitivity) => PRESET_IDS.map((preset) => presetCriterion(preset, sensitivity));
  assert.deepEqual(at(1.5), [-0.05, 0.75, 1.55]);
  assert.deepEqual(at(0), [-0.8, 0, 0.8]);
  assert.deepEqual(at(3), [0.7, 1.5, 2.3]);
  assert.deepEqual(at(1.3), [-0.15, 0.65, 1.45]);
  // d′ itself is clamped first, so a preset never leaves −1.5..3. 先限制 d′，所以预设永远不会超出 −1.5..3。
  assert.deepEqual(at(10), [0.7, 1.5, 2.3]);
  assert.deepEqual(at('x'), [-0.05, 0.75, 1.55]);
  for (let sensitivity = 0; sensitivity <= 3; sensitivity += 0.1) {
    for (const value of at(sensitivity)) assert.ok(value >= CRITERION_LIMITS.min && value <= CRITERION_LIMITS.max);
  }
  assert.equal(presetCriterion('wild', 1), null);
  const start = Object.freeze(state(1.5, 2.5));
  assert.deepEqual(withPreset(start, 'liberal'), state(1.5, -0.05));
  assert.deepEqual(withPreset(start, 'neutral'), state(1.5, 0.75));
  assert.deepEqual(withPreset(start, 'conservative'), state(1.5, 1.55));
  assert.deepEqual(withPreset(start, 'wild'), start);
});

test('activePreset and criterionStance say where the criterion sits', () => {
  for (const preset of PRESET_IDS) {
    for (const sensitivity of [0, 0.7, 1.5, 3]) {
      const current = withPreset(state(sensitivity, 0), preset);
      assert.equal(activePreset(current), preset);
      assert.equal(criterionStance(current), preset);
    }
  }
  assert.equal(activePreset(state(1.5, 0.7)), null);
  assert.equal(criterionStance(state(1.5, 0.7)), 'liberal');
  assert.equal(criterionStance(state(1.5, 0.8)), 'conservative');
  assert.equal(criterionStance(state(0, -1.5)), 'liberal');
  // Off the slider grid (a config d′ of 1.37, neutral point 0.685) the nearest slider position counts.
  // 不在滑块刻度上时（配置 d′ = 1.37，中立点 0.685），最近的滑块位置算数。
  assert.equal(activePreset(state(1.37, 0.7)), 'neutral');
  assert.equal(activePreset(state(1.37, 0.65)), null);
  assert.ok(CRITERION_TOLERANCE < CRITERION_LIMITS.step / 2);
  // The line stays put when d′ changes, so the same criterion can turn from neutral to liberal.
  // 改变 d′ 时竖线不动，所以同一个判断标准可能从中立变成偏宽松。
  const neutral = withPreset(state(1.5, 0), 'neutral');
  const sharper = withSensitivity(neutral, 2.5);
  assert.deepEqual([criterionStance(neutral), criterionStance(sharper), activePreset(sharper)], ['neutral', 'liberal', null]);
});

/* ---------- Outcomes 四种结果 ---------- */

test('the four rates follow the model formulas and each kind of trial sums to 1', () => {
  for (const sensitivity of [0, 0.4, 1.5, 2.2, 3]) {
    for (const criterion of [-1.5, -0.6, 0, 0.75, 1.9, 3]) {
      const rates = outcomeRates(state(sensitivity, criterion));
      near(rates.hit, 1 - normalCdf(criterion - sensitivity), 1e-15);
      near(rates.miss, normalCdf(criterion - sensitivity), 1e-15);
      near(rates.falseAlarm, 1 - normalCdf(criterion), 1e-15);
      near(rates.correctRejection, normalCdf(criterion), 1e-15);
      near(rates.hit + rates.miss, 1, 1e-15);
      near(rates.falseAlarm + rates.correctRejection, 1, 1e-15);
    }
  }
  near(outcomeRates(null).hit, 0.7733726476231317, 1e-15);
});

test('the default example gives hits 77% and false alarms 23%', () => {
  const percents = outcomePercents(outcomeRates(state(1.5, 0.75)));
  assert.deepEqual(percents, { hit: 77, miss: 23, falseAlarm: 23, correctRejection: 77 });
  assert.deepEqual(resultSentence(percents), { zh: '击中 77%，虚报 23%。', en: 'Hits 77%, false alarms 23%.' });
  assert.deepEqual(outcomePercents(outcomeRates(withPreset(state(1.5, 0), 'liberal'))), { hit: 94, miss: 6, falseAlarm: 52, correctRejection: 48 });
  assert.deepEqual(outcomePercents(outcomeRates(withPreset(state(1.5, 0), 'conservative'))), { hit: 48, miss: 52, falseAlarm: 6, correctRejection: 94 });
});

test('percentages are whole numbers and every row of Figure 4.6 adds up to exactly 100', () => {
  for (let d = 0; d <= 30; d += 1) {
    for (let k = 0; k <= 90; k += 1) {
      const current = state(d / 10, -1.5 + k * 0.05);
      const rates = outcomeRates(current);
      const percents = outcomePercents(rates);
      for (const id of OUTCOME_IDS) {
        assert.ok(Number.isInteger(percents[id]) && percents[id] >= 0 && percents[id] <= 100, `${id} ${percents[id]}`);
      }
      assert.equal(percents.hit + percents.miss, 100);
      assert.equal(percents.falseAlarm + percents.correctRejection, 100);
      assert.equal(percents.hit, Math.round(rates.hit * 100));
      assert.equal(percents.falseAlarm, Math.round(rates.falseAlarm * 100));
    }
  }
  assert.deepEqual(outcomePercents(null), { hit: 0, miss: 100, falseAlarm: 0, correctRejection: 100 });
  assert.deepEqual(outcomePercents({ hit: 1.2, falseAlarm: -0.1 }), { hit: 100, miss: 0, falseAlarm: 0, correctRejection: 100 });
});

test('a lower criterion buys more hits with more false alarms; a larger d′ adds hits only', () => {
  for (const sensitivity of [0.5, 1.5, 3]) {
    let previous = null;
    for (let criterion = 3; criterion >= -1.5; criterion -= 0.25) {
      const rates = outcomeRates(state(sensitivity, criterion));
      if (previous) {
        assert.ok(rates.hit > previous.hit && rates.falseAlarm > previous.falseAlarm);
        assert.ok(rates.miss < previous.miss && rates.correctRejection < previous.correctRejection);
      }
      previous = rates;
    }
  }
  for (const criterion of [-1, 0.75, 2]) {
    const weak = outcomeRates(state(0.5, criterion));
    const strong = outcomeRates(state(2.5, criterion));
    assert.ok(strong.hit > weak.hit && strong.miss < weak.miss);
    assert.equal(strong.falseAlarm, weak.falseAlarm);
    assert.equal(strong.correctRejection, weak.correctRejection);
  }
  // d′ = 0: the curves coincide and hits equal false alarms wherever the line is. d′ = 0 时击中率处处等于虚报率。
  for (let criterion = -1.5; criterion <= 3; criterion += 0.05) {
    const rates = outcomeRates(state(0, criterion));
    assert.equal(rates.hit, rates.falseAlarm);
  }
});

test('outcomeTable is laid out like textbook Figure 4.6', () => {
  const table = outcomeTable(state(1.5, 0.75));
  assert.deepEqual(table.columns.map((column) => column.id), ['yes', 'no']);
  assert.deepEqual(table.rows.map((row) => row.id), ['present', 'absent']);
  assert.deepEqual(table.rows.map((row) => row.cells.map((cell) => cell.id)), [['hit', 'miss'], ['falseAlarm', 'correctRejection']]);
  assert.deepEqual(table.rows.map((row) => row.cells.map((cell) => cell.correct)), [[true, false], [false, true]]);
  assert.deepEqual(table.rows.map((row) => row.cells.map((cell) => cell.percent)), [[77, 23], [23, 77]]);
  assert.equal(table.columns[0].label.en, '"Yes, I see the signal."');
  assert.equal(table.columns[1].label.en, '"No, I don\'t see the signal."');
  assert.deepEqual(table.rows.map((row) => row.label.en), ['Signal present', 'Signal absent']);
  assert.deepEqual(table.rows.flatMap((row) => row.cells.map((cell) => cell.term.en)), ['Hit', 'Miss', 'False alarm', 'Correct rejection']);
});

/* ---------- Text 文字 ---------- */

test('numbers are printed with a real minus sign and fixed decimals', () => {
  assert.equal(formatCriterion(-0.05), '−0.05');
  assert.equal(formatCriterion(0.75), '0.75');
  assert.equal(formatCriterion(3), '3.00');
  assert.equal(formatCriterion(-1.5), '−1.50');
  assert.equal(formatCriterion(-0.001), '0.00');
  assert.equal(formatCriterion(NaN), '—');
  assert.equal(formatSensitivity(1.5), '1.5');
  assert.equal(formatSensitivity(0), '0.0');
  assert.equal(formatSensitivity(3), '3.0');
  assert.equal(formatSensitivity(1.37), '1.37');
  assert.equal(formatSensitivity(undefined), '—');
});

test('slider value texts, the live announcement and the figure description', () => {
  const start = state(1.5, 0.75);
  assert.equal(criterionValueText(start), 'c = 0.75，中立 neutral');
  assert.equal(criterionValueText(state(1.5, -0.05)), 'c = −0.05，偏宽松 liberal');
  assert.equal(criterionValueText(state(1.5, 1.55)), 'c = 1.55，偏严格 conservative');
  assert.equal(sensitivityValueText(start), 'd′ = 1.5');
  assert.equal(criterionValueLabel(start), 'c = 0.75');
  assert.equal(sensitivityLabel(state(2, 1)), 'd′ = 2.0');
  assert.equal(announcement(start),
    '击中 77%，虚报 23%（判断标准 c = 0.75，中立；灵敏度 d′ = 1.5）。 '
      + 'Hits 77%, false alarms 23% (criterion c = 0.75, neutral; sensitivity d′ = 1.5).');
  assert.ok(presetAnnouncement(withPreset(start, 'liberal'), 'liberal').startsWith('宽松 Liberal. 击中 94%，虚报 52%'));
  assert.equal(presetAnnouncement(start, 'unknown'), announcement(start));
  assert.ok(resetAnnouncement(start).startsWith('已恢复初始设置。 Back to the starting settings. 击中 77%'));
  const description = figureDescription(start);
  for (const part of ['d′ = 1.5', 'c = 0.75', '77%', '23%', 'noise-only', '只有噪音']) assert.ok(description.includes(part), part);
  assert.deepEqual(stanceSentence(start), { stance: 'neutral', name: TEXT.stanceNames.neutral, ...TEXT.stance.neutral });
  assert.equal(stanceSentence(state(1.5, 0)).stance, 'liberal');
});

test('every fixed text is bilingual: Chinese in zh, no Chinese in en', () => {
  const pairs = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      if ('zh' in value || 'en' in value) pairs.push({ path, value });
      else Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`));
    }
  };
  walk({ TEXT, DEFAULT_TITLE, DEFAULT_SCENARIO, DEFAULT_SIGNAL }, '');
  assert.ok(pairs.length > 50);
  for (const { path, value } of pairs) {
    assert.ok(typeof value.zh === 'string' && CJK.test(value.zh), `${path}.zh`);
    assert.ok(typeof value.en === 'string' && value.en.trim() && !CJK.test(value.en), `${path}.en`);
    assert.equal(value.zh.split('**').length % 2, 1, `${path}.zh has balanced bold markers`);
  }
  // The view looks texts up by these ids. 视图按这些 id 取文字。
  for (const id of OUTCOME_IDS) assert.ok(TEXT.outcomes[id]);
  for (const preset of PRESET_IDS) assert.ok(TEXT.presets[preset] && TEXT.stance[preset] && TEXT.stanceNames[preset]);
  assert.match(TEXT.simplified.zh, /简化示意/);
  assert.match(TEXT.simplified.en, /simplified illustration/);
  assert.match(TEXT.caption.zh, /简化示意/);
});

test('no string the widget shows contains an emoji', () => {
  const texts = [];
  const collect = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  collect([TEXT, DEFAULT_TITLE, DEFAULT_SCENARIO, DEFAULT_SIGNAL]);
  for (const sensitivity of [0, 0.8, 1.5, 3]) {
    for (const criterion of [-1.5, -0.05, 0.75, 1.55, 3]) {
      const current = state(sensitivity, criterion);
      const percents = outcomePercents(outcomeRates(current));
      collect([
        criterionValueText(current), sensitivityValueText(current), criterionValueLabel(current), sensitivityLabel(current),
        resultSentence(percents), stanceSentence(current), announcement(current), resetAnnouncement(current),
        figureDescription(current), outcomeTable(current), formatCriterion(criterion), formatSensitivity(sensitivity),
        PRESET_IDS.map((preset) => presetAnnouncement(current, preset)),
      ]);
    }
  }
  collect(normalizeSignalDetectionConfig(SPEC_CONFIG));
  assert.ok(texts.length > 300);
  for (const text of texts) assert.ok(!EMOJI.test(text), text);
});

/* ---------- Drawing 绘图 ---------- */

test('the drawing scale maps the evidence axis −3.5..6.5 onto the measured width', () => {
  const scale = plotScale(300);
  assert.deepEqual([scale.width, scale.height, scale.left, scale.right], [300, PLOT.height, 14, 286]);
  near(scale.unit, 27.2, 1e-12);
  assert.equal(scale.x(EVIDENCE_RANGE.min), 14);
  near(scale.x(EVIDENCE_RANGE.max), 286, 1e-9);
  near(scale.evidence(scale.x(1.234)), 1.234, 1e-12);
  assert.equal(plotScale(100).width, PLOT.minWidth);
  assert.equal(plotScale(5000).width, PLOT.maxWidth);
  assert.equal(plotScale(null).width, PLOT.fallbackWidth);
  assert.equal(plotScale(NaN).width, PLOT.fallbackWidth);
  assert.equal(plotScale(359.6).width, 360);
});

test('a pointer position becomes a snapped, clamped criterion', () => {
  const scale = plotScale(480);
  assert.equal(criterionAt(scale, scale.x(0.77)), 0.75);
  assert.equal(criterionAt(scale, scale.x(-0.04)), -0.05);
  assert.equal(criterionAt(scale, 0), -1.5);
  assert.equal(criterionAt(scale, 10000), 3);
  assert.equal(criterionAt(scale, NaN), null);
  assert.equal(criterionAt(scale, '200'), null);
});

test('curves peak at their centre and the shaded areas lie right of the criterion', () => {
  assert.equal(curveY(1.5, 1.5), PLOT.peakY);
  assert.equal(curveY(0, 0), PLOT.peakY);
  near(curveY(10, 0), PLOT.axisY, 1e-9);
  assert.ok(curveY(1, 0) > PLOT.peakY && curveY(1, 0) < PLOT.axisY);
  const scale = plotScale(400);
  const path = curvePath(0, scale);
  assert.ok(path.startsWith(`M${scale.left.toFixed(1)} `));
  assert.equal(path.split('L').length, PLOT.samples + 1);
  const area = tailAreaPath(1.5, 0.75, scale);
  const left = scale.x(0.75);
  assert.ok(area.startsWith(`M${left.toFixed(1)} ${PLOT.axisY.toFixed(1)} L${left.toFixed(1)} `));
  assert.ok(area.endsWith(`L${scale.right.toFixed(1)} ${PLOT.axisY.toFixed(1)} Z`));
  const points = area.replace(/[MZ]/g, '').split('L').map((point) => point.trim().split(' ').map(Number));
  for (const [x, y] of points) {
    assert.ok(x >= left - 0.05 && x <= scale.right + 0.05, `x ${x}`);
    assert.ok(y >= PLOT.peakY - 0.05 && y <= PLOT.axisY + 0.05, `y ${y}`);
  }
  assert.equal(tailAreaPath(0, EVIDENCE_RANGE.max, scale), '');
  assert.ok(tailAreaPath(0, -10, scale).startsWith(`M${scale.left.toFixed(1)} `));
});

test('curve labels, the criterion value and the d′ label stay inside the drawing without overlapping', () => {
  for (const width of [260, 300, 328, 360, 480, 720, 960]) {
    const scale = plotScale(width);
    for (let d = 0; d <= 3.0001; d += 0.25) {
      const labels = curveLabelLayout(scale, d);
      assert.ok(labels.noise.left >= scale.left - 1e-9, `noise label inside at ${width}, d′ ${d}`);
      assert.ok(labels.signal.right <= scale.right + 1e-9, `signal label inside at ${width}, d′ ${d}`);
      assert.ok(labels.noise.right + 8 <= labels.signal.left, `labels apart at ${width}, d′ ${d}`);
      assert.deepEqual([labels.noise.anchor, labels.signal.anchor], ['end', 'start']);
      assert.equal(labels.enY - labels.zhY, PLOT.lineGap);
      for (let c = -1.5; c <= 3.0001; c += 0.5) {
        const layout = plotLayout(scale, state(d, c));
        const valueHalf = estimateTextWidth(criterionValueLabel(state(d, c)), PLOT.valueFont) / 2;
        const bracketHalf = estimateTextWidth(sensitivityLabel(state(d, c)), PLOT.valueFont) / 2;
        assert.ok(layout.valueX - valueHalf >= scale.left - 1e-9 && layout.valueX + valueHalf <= scale.right + 1e-9);
        assert.ok(layout.bracket.labelX - bracketHalf >= scale.left - 1e-9 && layout.bracket.labelX + bracketHalf <= scale.right + 1e-9);
        near(layout.x, scale.x(c), 1e-9);
        near(layout.bracket.x1, scale.x(0), 1e-9);
        near(layout.bracket.x2, scale.x(d), 1e-9);
      }
    }
  }
  // Away from the edges the labels sit next to the curves, 1.45 standard deviations out from each centre.
  // 不靠边时，标签紧挨着曲线，离各自中心 1.45 个标准差。
  const wide = plotScale(960);
  const labels = curveLabelLayout(wide, 1.5);
  near(labels.noise.x, wide.x(-1.45), 1e-9);
  near(labels.signal.x, wide.x(2.95), 1e-9);
  assert.equal(labelCentre(wide, wide.x(0.75), 50), wide.x(0.75));
  assert.equal(labelCentre(plotScale(260), 0, 1000), 130);
});

test('text widths are estimated generously: Chinese 1 em, spaces 0.3 em, anything else 0.6 em', () => {
  near(estimateTextWidth('信号 + 噪音', 12), 4 * 12 + 2 * 3.6 + 7.2, 1e-9);
  near(estimateTextWidth('noise only', 10), 9 * 6 + 3, 1e-9);
  assert.equal(estimateTextWidth('', 12), 0);
  assert.equal(estimateTextWidth(null, 12), 0);
});
