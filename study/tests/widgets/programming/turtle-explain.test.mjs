import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-language.js';
import { runProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-interpreter.js';
import {
  describeStep,
  formatNumber,
  headingWords,
  highlightLine,
  summarizeRun,
} from '../../../engine/widgets/programming/turtle-sandbox/turtle-explain.js';

function execute(source) {
  const { program, error } = parseProgram(source);
  assert.equal(error, null);
  return { program, run: runProgram(program) };
}

const SQUARE = 'speed 2\npen red\nsquare = () ->\n  fd 100\n  rt 90\n  fd 100\n  rt 90\n  fd 100\n  rt 90\n  fd 100\n  rt 90';

test('formatNumber keeps at most two decimals and adds separators', () => {
  assert.equal(formatNumber(62.5), '62.5');
  assert.equal(formatNumber(1 / 3), '0.33');
  assert.equal(formatNumber(10000), '10,000');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber('red'), 'red');
});

test('headingWords names the four main directions only', () => {
  assert.deepEqual(headingWords(0), { zh: '向上', en: 'up' });
  assert.deepEqual(headingWords(450), { zh: '向右', en: 'right' });
  assert.deepEqual(headingWords(-90), { zh: '向左', en: 'left' });
  assert.equal(headingWords(45), null);
});

test('describeStep explains each kind of step in both languages', () => {
  const { run } = execute(`${SQUARE}\nsquare()\nrt 180, 25\npen green, 10\nfor count in [1..2]\n  pu()`);
  const byKind = Object.fromEntries(run.steps.map((step) => [step.kind, describeStep(step)]));
  assert.deepEqual(byKind.fd, { zh: '前进 100', en: 'move forward 100' });
  assert.deepEqual(byKind.rt, { zh: '右转 90 度', en: 'turn right 90 degrees' });
  assert.deepEqual(byKind.arc, { zh: '沿半径 25 的圆弧右转 180 度', en: 'turn right 180 degrees along an arc of radius 25' });
  assert.match(byKind.speed.en, /2 steps per second/);
  assert.match(byKind.define.zh, /里面的指令现在还不执行/);
  assert.match(byKind.define.en, /nothing inside runs yet/);
  assert.match(byKind.call.en, /^call `square`: run the instructions inside it$/);
  assert.equal(byKind.iterate.en, 'loop iteration 2 of 2, count = 2');
  assert.deepEqual(byKind.pu, { zh: '抬笔：接下来移动不画线', en: 'pen up: moves will not draw' });
  const pens = run.steps.filter((step) => step.kind === 'pen').map(describeStep);
  assert.deepEqual(pens[0], { zh: '换成红色的笔，落笔', en: 'use a red pen, pen down' });
  assert.deepEqual(pens[1], { zh: '换成绿色的笔，粗细 10，落笔', en: 'use a green pen of width 10, pen down' });
});

test('describeStep shows parameter values of a call', () => {
  const { run } = execute('rectangle = (length, width) ->\n  fd length\nrectangle(100, 200)');
  const call = run.steps.find((step) => step.kind === 'call');
  assert.deepEqual(describeStep(call), {
    zh: '调用函数 `rectangle`（length = 100, width = 200）：去执行它里面的指令',
    en: 'call `rectangle` with length = 100, width = 200: run the instructions inside it',
  });
});

test('the summary of the nested loop explains 10 × 10 = 100 (Lecture 2 p.41)', () => {
  const { program, run } = execute(`${SQUARE}\nfor count in [1..10]\n  for count in [1..10]\n    square()`);
  const text = summarizeRun(program, run).map((item) => item.en).join('\n');
  assert.match(text, /902 instructions were executed in total/);
  assert.match(text, /The loop on line 12 made 10 iterations\./);
  assert.match(text, /The loop on line 13 started 10 times with 10 iterations each: 10 × 10 = 100 iterations, so the instruction in its body ran 100 times\./);
  assert.match(text, /`square` was called 100 times, so each instruction inside it ran 100 times\./);
  const zh = summarizeRun(program, run).map((item) => item.zh).join('\n');
  assert.match(zh, /10 × 10 = 100 圈/);
});

test('the summary of a simple loop gives body instructions × iterations, and the total agrees (Lecture 2 p.30)', () => {
  const { program, run } = execute('for [1..4]\n  fd 100\n  rt 90');
  const items = summarizeRun(program, run);
  assert.match(items[0].en, /^8 instructions/);
  assert.match(items[0].zh, /一共执行了 8 条指令/);
  assert.match(items[1].en, /each of the 2 instructions in its body ran 4 times: 2 × 4 = 8\./);
  assert.match(items[1].zh, /2 × 4 = 8 次/);
});

test('a loop whose body holds another loop does not claim a single count for its body', () => {
  const { program, run } = execute('for [1..3]\n  fd 10\n  for [1..2]\n    rt 90');
  const outer = summarizeRun(program, run)[1].en;
  assert.equal(outer, 'The loop on line 1 made 3 iterations.');
  assert.equal(run.executed, 3 + 6);
});

test('a function that is never called is pointed out (Lecture 2 p.15)', () => {
  const { program, run } = execute(SQUARE);
  const text = summarizeRun(program, run).map((item) => item.en).join('\n');
  assert.match(text, /`square` is defined but never called, so nothing inside it ran/);
});

test('counting-down ranges and early stops get a note', () => {
  const down = execute('for [1..0]\n  fd 10');
  const notes = summarizeRun(down.program, down.run).map((item) => item.en).join('\n');
  assert.match(notes, /counts down/);
  const stopped = execute('fd 10\nfd red');
  assert.match(summarizeRun(stopped.program, stopped.run)[0].en, /stopped early/);
});

test('highlightLine colours code like the course blocks and keeps the text intact', () => {
  const kinds = (line) => highlightLine(line).filter((segment) => segment.kind !== 'plain').map((segment) => [segment.text, segment.kind]);
  assert.deepEqual(kinds('fd 100'), [['fd', 'move'], ['100', 'number']]);
  assert.deepEqual(kinds('  pen green, 10'), [['pen', 'art'], ['green', 'value'], ['10', 'number']]);
  assert.deepEqual(kinds('square = (length) ->'), [['square', 'func'], ['->', 'func']]);
  assert.deepEqual(kinds('for count in [1..10]'), [['for', 'control'], ['in', 'control'], ['1', 'number'], ['..', 'control'], ['10', 'number']]);
  assert.deepEqual(kinds('square(100)'), [['square', 'func'], ['100', 'number']]);
  assert.deepEqual(kinds('size = 5'), [['5', 'number']]);
  assert.deepEqual(kinds('fd 10 # move'), [['fd', 'move'], ['10', 'number'], ['# move', 'comment']]);
  for (const line of ['  rt 180, 25', 'draw_robot()', "pen 'red", '', '   ', '正方形 = (边长) ->']) {
    assert.equal(highlightLine(line).map((segment) => segment.text).join(''), line);
  }
});
