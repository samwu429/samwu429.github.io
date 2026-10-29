import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-language.js';
import { runProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-interpreter.js';
import { DEFAULT_PRESET, PRESETS, PRESET_IDS, getPreset } from '../../../engine/widgets/programming/turtle-sandbox/turtle-presets.js';

const CONTENT_SPEC_PRESETS = ['sequence', 'function-call', 'function-param', 'function-two-params', 'loop', 'loop-calls-function', 'nested-loop'];
// The robot loop programs of Lecture 2 p.27-28 (Lab 2 p.13). Lecture 2 第 27-28 页（Lab 2 第 13 页）的机器人循环程序。
const ROBOT_LOOP_PRESETS = ['loop-robot', 'loop-robot-9'];

function runPreset(id) {
  const { program, error } = parseProgram(getPreset(id).code);
  assert.equal(error, null, `${id}: ${JSON.stringify(error)}`);
  const run = runProgram(program);
  assert.equal(run.error, null, `${id}: ${JSON.stringify(run.error)}`);
  return { program, run };
}

test('every preset named in the content spec exists, with the robot loops, and has bilingual metadata', () => {
  assert.deepEqual([...PRESET_IDS].sort(), [...CONTENT_SPEC_PRESETS, ...ROBOT_LOOP_PRESETS].sort());
  for (const id of PRESET_IDS) {
    const preset = getPreset(id);
    assert.equal(preset.id, id);
    assert.ok(preset.title.zh && preset.title.en, id);
    assert.ok(preset.source.zh && preset.source.en, id);
    assert.doesNotMatch(preset.code, /\t/);
  }
});

test('unknown or missing presets fall back to the sequence example', () => {
  assert.equal(DEFAULT_PRESET, 'sequence');
  assert.equal(getPreset('does-not-exist').id, 'sequence');
  assert.equal(getPreset(undefined).id, 'sequence');
  assert.equal(getPreset('__proto__').id, 'sequence');
});

test('presets have the same number of lines as the slide programs', () => {
  const lineCounts = Object.fromEntries(PRESET_IDS.map((id) => [id, PRESETS[id].code.length]));
  assert.deepEqual(lineCounts, {
    sequence: 8,
    'function-call': 32,
    'function-param': 13,
    'function-two-params': 12,
    loop: 3,
    'loop-robot': 29,
    'loop-robot-9': 30,
    'loop-calls-function': 13,
    'nested-loop': 14,
  });
});

test('sequence: every instruction runs exactly once', () => {
  const { run } = runPreset('sequence');
  assert.deepEqual(run.lineCounts.slice(1), Array(8).fill(1));
});

test('function-call: the 23 robot instructions run 3 times, once per call (p.17)', () => {
  const { run } = runPreset('function-call');
  assert.deepEqual(run.lineCounts.slice(3, 26), Array(23).fill(3));
  assert.deepEqual(run.lineCounts.slice(26), Array(7).fill(1));
  assert.equal(run.calls.get(2), 3);
});

test('function-param: two calls, so each instruction inside runs twice (p.21)', () => {
  const { run } = runPreset('function-param');
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(2));
});

test('function-two-params: one call of rectangle(100, 200) (p.22)', () => {
  const { run } = runPreset('function-two-params');
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(1));
  assert.deepEqual(run.steps.find((step) => step.kind === 'call').detail.args, [100, 200]);
});

test('loop: 2 instructions × 4 iterations draw one square, 8 executions in total (p.30)', () => {
  const { run } = runPreset('loop');
  assert.deepEqual(run.lineCounts.slice(1), [0, 4, 4]);
  assert.equal(run.loops.get(1).iterations, 4);
  assert.equal(run.executed, 2 * 4);
  assert.deepEqual([run.final.x, run.final.y], [0, 0]);
});

test('loop-robot: 3 iterations of draw_robot(), pu(), fd 100 draw the same 3 faces as p.17 (p.27)', () => {
  const { run } = runPreset('loop-robot');
  assert.deepEqual(run.lineCounts.slice(3, 26), Array(23).fill(3));
  assert.equal(run.lineCounts[26], 0);
  assert.deepEqual(run.lineCounts.slice(27), [3, 3, 3]);
  assert.equal(run.loops.get(26).iterations, 3);
  assert.equal(run.calls.get(2), 3);
  assert.equal(run.steps.filter((step) => step.kind === 'box').length, 6);
  // Unlike p.17 the loop also moves after the third face, so the turtle ends 100 higher, above the top face.
  // 和第 17 页不同，循环在画完第 3 张脸后还会再挪一次，所以海龟高出 100，停在最上面那张脸的上方。
  const unrolled = runPreset('function-call').run;
  assert.deepEqual([run.final.x, run.final.y], [unrolled.final.x, unrolled.final.y + 100]);
  assert.equal(run.executed, unrolled.executed + 2, 'the extra pu() and fd 100 of the third iteration');
});

test('loop-robot-9: changing one value draws 9 faces from the lower left (p.28)', () => {
  const { run } = runPreset('loop-robot-9');
  assert.equal(run.loops.get(27).iterations, 9);
  assert.equal(run.calls.get(3), 9);
  assert.equal(run.steps.filter((step) => step.kind === 'box').length, 18);
  assert.deepEqual([run.steps[1].after.x, run.steps[1].after.y], [-500, -500]);
});

test('loop-calls-function: each instruction of square runs 10 times (p.40)', () => {
  const { run } = runPreset('loop-calls-function');
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(10));
});

test('nested-loop: each instruction of square runs 100 times (p.41)', () => {
  const { run } = runPreset('nested-loop');
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(100));
  assert.ok(run.steps.length < 2000, 'well under the step limit');
});
