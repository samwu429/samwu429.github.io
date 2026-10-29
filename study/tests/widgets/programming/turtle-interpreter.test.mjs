import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-language.js';
import { INITIAL_TURTLE, LIMITS, iterationCount, runProgram } from '../../../engine/widgets/programming/turtle-sandbox/turtle-interpreter.js';

const SQUARE = ['speed 2', 'pen red', 'square = () ->', '  fd 100', '  rt 90', '  fd 100', '  rt 90', '  fd 100', '  rt 90', '  fd 100', '  rt 90'];

function execute(lines, options) {
  const source = Array.isArray(lines) ? lines.join('\n') : lines;
  const { program, error } = parseProgram(source);
  assert.equal(error, null, `unexpected parse error: ${JSON.stringify(error)}`);
  return { program, run: runProgram(program, options) };
}

const draws = (run) => run.steps.filter((step) => step.draw).map((step) => step.draw);

test('iterationCount follows CoffeeScript ranges', () => {
  assert.equal(iterationCount(1, 4), 4);
  assert.equal(iterationCount(1, 4, true), 3);
  assert.equal(iterationCount(4, 1), 4);
  assert.equal(iterationCount(1, 0), 2);
  assert.equal(iterationCount(3, 3), 1);
  assert.equal(iterationCount(3, 3, true), 0);
  assert.equal(iterationCount(0, 3.5), 4);
  assert.equal(iterationCount(0, 3.5, true), 4);
});

test('a sequence runs every line once and draws the 200 x 100 rectangle of Lecture 2 p.9', () => {
  const { run } = execute('pen blue\nfd 100\nrt 90\nfd 200\nrt 90\nfd 100\nrt 90\nfd 200');
  assert.equal(run.error, null);
  assert.deepEqual(run.lineCounts.slice(1), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(run.executed, 8);
  assert.deepEqual([run.final.x, run.final.y, run.final.heading], [0, 0, 270]);
  const lines = draws(run);
  assert.equal(lines.length, 4);
  assert.ok(lines.every((line) => line.color === 'blue' && line.type === 'line'));
  assert.deepEqual(lines[1].points, [[0, 100], [200, 100]]);
});

test('the turtle starts like PencilCode: origin, facing up, pen down, black', () => {
  assert.deepEqual(INITIAL_TURTLE, { x: 0, y: 0, heading: 0, penDown: true, color: 'black', width: 1, speed: 1, visible: true });
  const { run } = execute('fd 10');
  assert.deepEqual(draws(run)[0], { type: 'line', points: [[0, 0], [0, 10]], color: 'black', width: 1 });
});

test('a call runs the body; the definition itself is shown but not counted (Lecture 2 p.15-16)', () => {
  const definedOnly = execute(SQUARE);
  assert.equal(definedOnly.run.executed, 2);
  assert.equal(definedOnly.run.steps.filter((step) => step.kind === 'define').length, 1);
  assert.equal(definedOnly.run.lineCounts[4], 0);
  assert.equal(draws(definedOnly.run).length, 0);

  const called = execute([...SQUARE, 'square()']);
  assert.deepEqual(called.run.lineCounts.slice(4, 12), Array(8).fill(1));
  assert.equal(called.run.calls.get(3), 1);
  const call = called.run.steps.find((step) => step.kind === 'call');
  assert.deepEqual(call.detail, { name: 'square', defLine: 3, params: [], args: [] });
});

test('a loop that calls square runs each instruction 10 times (Lecture 2 p.40)', () => {
  const { run } = execute([...SQUARE, 'for count in [1..10]', '  square()']);
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(10));
  assert.equal(run.lineCounts[12], 0, 'the loop header is not an instruction');
  assert.equal(run.lineCounts[13], 10);
  assert.equal(run.calls.get(3), 10);
  assert.deepEqual(run.loops.get(12), { starts: 1, iterations: 10, minPerStart: 10, maxPerStart: 10, countsDown: false });
  assert.equal(run.executed, 2 + 10 + 80);
});

test('nested loops run each instruction of square 10 x 10 = 100 times (Lecture 2 p.41)', () => {
  const { run } = execute([...SQUARE, 'for count in [1..10]', '  for count in [1..10]', '    square()']);
  assert.equal(run.error, null);
  assert.deepEqual(run.lineCounts.slice(4, 12), Array(8).fill(100));
  assert.equal(run.lineCounts[12], 0);
  assert.equal(run.lineCounts[13], 0);
  assert.equal(run.lineCounts[14], 100);
  assert.equal(run.calls.get(3), 100);
  assert.equal(run.loops.get(12).iterations, 10);
  assert.deepEqual(run.loops.get(13), { starts: 10, iterations: 100, minPerStart: 10, maxPerStart: 10, countsDown: false });
  assert.equal(run.executed, 1 + 1 + 100 + 800);
  assert.deepEqual([run.final.x, run.final.y], [0, 0]);
});

test('loop iterations are shown as steps but not counted, so 2 instructions x 4 iterations execute 8 (Lecture 2 p.30)', () => {
  const { run } = execute('for [1..4]\n  fd 100\n  rt 90');
  assert.equal(run.executed, 8);
  assert.deepEqual(run.lineCounts.slice(1), [0, 4, 4]);
  const iterations = run.steps.filter((step) => step.kind === 'iterate');
  assert.equal(iterations.length, 4);
  assert.ok(iterations.every((step) => step.counted === false));
  assert.equal(run.loops.get(1).iterations, 4);
});

test('parameters customise each call (Lecture 2 p.21-22)', () => {
  const one = execute(['pen red', 'square = (length) ->', '  fd length', '  rt 90', '  fd length', '  rt 90',
    '  fd length', '  rt 90', '  fd length', '  rt 90', 'square(100)', 'square(200)']);
  assert.deepEqual(one.run.lineCounts.slice(3, 11), Array(8).fill(2));
  const sides = draws(one.run).map((line) => Math.hypot(line.points[1][0] - line.points[0][0], line.points[1][1] - line.points[0][1]));
  assert.deepEqual(sides, [100, 100, 100, 100, 200, 200, 200, 200]);

  const two = execute(['rectangle = (length, width) ->', '  fd length', '  rt 90', '  fd width', '  rt 90',
    '  fd length', '  rt 90', '  fd width', '  rt 90', 'rectangle(100, 200)']);
  const xs = draws(two.run).flatMap((line) => line.points.map(([x]) => x));
  const ys = draws(two.run).flatMap((line) => line.points.map(([, y]) => y));
  assert.deepEqual([Math.max(...xs), Math.max(...ys)], [200, 100], '100 tall and 200 wide: the order tells which is which');
  const call = two.run.steps.find((step) => step.kind === 'call');
  assert.deepEqual(call.detail.args, [100, 200]);
});

test('the robot face of Lecture 2 p.17: three calls, eyes while the pen is up, smile arcs', () => {
  const body = ['pen blue', 'fd 100', 'rt 90', 'fd 200', 'rt 90', 'fd 100', 'rt 90', 'fd 200', 'pu()', 'rt 90',
    'fd 62.5', 'rt 90', 'fd 37.5', 'box green, 25', 'fd 125', 'box green, 25', 'rt 180', 'fd 37.5', 'lt 90',
    'fd 25', 'pen green, 10', 'pd()', 'rt 180, 25'];
  const { run } = execute(['speed 10', 'draw_robot = () ->', ...body.map((line) => `  ${line}`),
    'draw_robot()', 'pu()', 'fd 100', 'draw_robot()', 'pu()', 'fd 100', 'draw_robot()']);
  assert.equal(run.error, null);
  assert.deepEqual(run.lineCounts.slice(3, 26), Array(23).fill(3));
  assert.equal(run.calls.get(2), 3);
  assert.deepEqual([run.final.x, run.final.y], [225, 312.5]);
  const shapes = draws(run);
  assert.equal(shapes.filter((shape) => shape.type === 'box').length, 6);
  const arcs = run.steps.filter((step) => step.kind === 'arc');
  assert.equal(arcs.length, 3);
  assert.deepEqual(arcs[0].draw.points[arcs[0].draw.points.length - 1], [75, 37.5]);
  // `pen blue` resets the width, so robot 2's face is thin again after the thick smile of robot 1.
  // `pen blue` 会重设粗细，所以第 1 个机器人画完粗笑脸后，第 2 个机器人的脸又是细线。
  const blueLines = shapes.filter((shape) => shape.type === 'line' && shape.color === 'blue');
  assert.equal(blueLines.length, 12);
  assert.ok(blueLines.every((line) => line.width === 1));
  assert.ok(run.steps.every((step, index) => index === 0 || step.speed === 10));
});

test('pen up stops drawing until pen down or a new pen', () => {
  const { run } = execute('pu()\nfd 10\npd()\nfd 10\npu()\nfd 10\npen red\nfd 10');
  assert.deepEqual(run.steps.map((step) => Boolean(step.draw)), [false, false, false, true, false, false, false, true]);
});

test('loop variables count up or down and reach the body; [1...1] is skipped', () => {
  const { run } = execute('for i in [1..3]\n  fd i * 10\nfor [3..1]\n  rt 1\nfor [1...1]\n  fd 5');
  const moves = run.steps.filter((step) => step.kind === 'fd').map((step) => step.detail.distance);
  assert.deepEqual(moves, [10, 20, 30]);
  assert.equal(run.lineCounts[4], 3);
  assert.equal(run.loops.get(3).countsDown, true);
  assert.equal(run.lineCounts[5], 0);
  assert.equal(run.lineCounts[6], 0);
  assert.equal(run.steps[run.steps.length - 1].kind, 'skip');
  const iterate = run.steps.find((step) => step.kind === 'iterate');
  assert.deepEqual(iterate.detail, { iteration: 1, total: 3, variable: 'i', value: 1 });
});

test('variables, closures and other built-ins behave like PencilCode', () => {
  const { run } = execute('size = 30\ngrow = (n) ->\n  fd size + n\ngrow(5)\njumpto 100, 100\nmoveto 100, 0\nturnto 90\nhome()\ndot red, 20\nht()\nst()');
  assert.equal(run.error, null);
  assert.deepEqual(run.steps.find((step) => step.kind === 'fd').detail, { distance: 35 });
  const kinds = run.steps.map((step) => step.kind);
  assert.deepEqual(kinds, ['assign', 'define', 'call', 'fd', 'jumpto', 'moveto', 'turnto', 'home', 'dot', 'ht', 'st']);
  const jump = run.steps[4];
  assert.equal(jump.draw, null);
  assert.deepEqual(run.steps[5].draw.points, [[100, 100], [100, 0]]);
  assert.equal(run.steps[6].after.heading, 90);
  assert.deepEqual([run.steps[7].after.x, run.steps[7].after.y, run.steps[7].after.heading], [0, 0, 0]);
  assert.deepEqual(run.steps[8].draw, { type: 'dot', cx: 0, cy: 0, r: 10, color: 'red' });
  assert.equal(run.steps[9].after.visible, false);
  assert.equal(run.final.visible, true);
});

test('calling before the definition explains that the definition must come first (Lecture 2 p.18)', () => {
  const { run } = execute('square()\nsquare = () ->\n  fd 10');
  assert.equal(run.error.kind, 'runtime');
  assert.equal(run.error.line, 1);
  assert.match(run.error.en, /definition must come above the call/);
  assert.equal(run.steps.length, 0);
});

test('runtime errors keep the steps that ran before them', () => {
  const wrongArgs = execute('fd 10\nf = (a) ->\n  fd a\nf()').run;
  assert.equal(wrongArgs.error.line, 4);
  assert.match(wrongArgs.error.en, /needs 1 value \(a\)/);
  assert.equal(wrongArgs.executed, 1);

  const parsedColour = parseProgram('pen banana').error;
  assert.equal(parsedColour.kind, 'syntax');
  assert.match(parsedColour.en, /Unknown colour `banana`\. Try: black, white/);
  assert.match(parseProgram("box 'teal-ish', 5").error.en, /Unknown colour `teal-ish`/);
  assert.match(execute("c = 'banana'").run.error.en, /Unknown colour `banana`/);
  assert.match(execute('fd red').run.error.en, /needs a number/);
  assert.match(execute('fd 10 / 0').run.error.en, /not a normal number/);
  assert.match(execute('speed 0').run.error.en, /greater than 0/);
  assert.match(execute('fd 2000000').run.error.en, /too far/);
  assert.match(execute('pen red, -1').run.error.en, /cannot be negative/);
  assert.match(execute('x = 5\nx()').run.error.en, /not a function/);
  assert.match(execute('f = (a) ->\n  fd a\nfd a').run.error.en, /Unknown name `a`/);
  assert.match(execute('pen red + 1').run.error.en, /Only numbers/);
});

test('runaway programs stop at the step limit with a clear message', () => {
  const { run } = execute('for [1..1000000]\n  fd 1\n  rt 1');
  assert.equal(run.steps.length, LIMITS.maxSteps);
  assert.equal(run.error.kind, 'limit');
  assert.match(run.error.en, /Stopped after 10,000 steps/);
  const small = execute('for [1..100]\n  fd 1', { maxSteps: 50 }).run;
  assert.equal(small.steps.length, 50);
  assert.equal(small.error.kind, 'limit');
});

test('recursion is cut off by the call-depth limit', () => {
  const { run } = execute('f = () ->\n  f()\nf()');
  assert.equal(run.error.kind, 'runtime');
  assert.match(run.error.en, /Too many nested function calls/);
});

test('an expression too deep for the call stack becomes a runtime message instead of a crash', () => {
  // The parser caps line length, so the deep expression is built by hand here.
  // 解析器限制了每行长度，所以这里直接手工构造一个很深的表达式。
  let deep = { type: 'number', value: 1 };
  for (let level = 0; level < 200000; level += 1) deep = { type: 'unary', op: '-', operand: deep };
  const program = {
    lines: ['fd 1'],
    body: [{ type: 'command', line: 1, name: 'fd', args: [deep] }],
    lineKinds: [null, 'instruction'],
    definitions: [],
    loops: [],
  };
  const run = runProgram(program);
  assert.equal(run.error.kind, 'runtime');
  assert.equal(run.error.line, 1);
  assert.match(run.error.en, /too complex/);
  assert.equal(run.executed, 0);
});

test('every step records poses for animation', () => {
  const { run } = execute('rt 90\nfd 50\nrt 90, 50');
  const [turn, move, arc] = run.steps;
  assert.deepEqual(turn.before, { x: 0, y: 0, heading: 0, visible: true });
  assert.equal(turn.after.heading, 90);
  assert.equal(turn.path, null);
  assert.deepEqual(move.path, [[0, 0], [50, 0]]);
  assert.equal(arc.kind, 'arc');
  assert.deepEqual(arc.detail, { angle: 90, direction: 'right', radius: 50 });
  assert.deepEqual(arc.path[arc.path.length - 1], [100, -50]);
  assert.equal(arc.after.heading, 180);
});
