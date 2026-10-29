import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTINS,
  COLOR_FAMILIES,
  MAX_TOKENS_PER_LINE,
  colorFamily,
  isTooDeep,
  parseProgram,
  sourceLines,
  walkStatements,
} from '../../../engine/widgets/programming/turtle-sandbox/turtle-language.js';

function parse(source) {
  const result = parseProgram(source);
  assert.equal(result.error, null, `unexpected error: ${JSON.stringify(result.error)}`);
  return result.program;
}

function parseError(source) {
  const result = parseProgram(source);
  assert.equal(result.program, null, 'expected a parse error');
  assert.ok(result.error, 'expected an error object');
  assert.ok(result.error.zh && result.error.en, 'errors are bilingual');
  assert.doesNotMatch(result.error.zh + result.error.en, /<[a-z/]/i, 'errors contain no HTML');
  return result.error;
}

test('the Lecture 2 p.9 rectangle parses into one command per line', () => {
  const program = parse('pen blue\nfd 100\nrt 90\nfd 200\nrt 90\nfd 100\nrt 90\nfd 200');
  assert.equal(program.body.length, 8);
  assert.deepEqual(program.body.map((statement) => statement.line), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(program.body[0], { type: 'command', line: 1, name: 'pen', args: [{ type: 'name', name: 'blue' }] });
  assert.deepEqual(program.body[1].args, [{ type: 'number', value: 100 }]);
  assert.deepEqual(program.lineKinds.slice(1), Array(8).fill('instruction'));
});

test('function definitions keep parameters and an indented body', () => {
  const program = parse('speed 2\npen red\nrectangle = (length, width) ->\n  fd length\n  rt 90\n  fd width\nrectangle(100, 200)');
  const definition = program.body[2];
  assert.equal(definition.type, 'define');
  assert.equal(definition.name, 'rectangle');
  assert.deepEqual(definition.params, ['length', 'width']);
  assert.deepEqual(definition.body.map((statement) => statement.line), [4, 5, 6]);
  assert.equal(program.lineKinds[3], 'define');
  assert.deepEqual(program.definitions.map(({ name, line, params }) => ({ name, line, params })),
    [{ name: 'rectangle', line: 3, params: ['length', 'width'] }]);
  const call = program.body[3];
  assert.equal(call.type, 'call');
  assert.deepEqual(call.args, [{ type: 'number', value: 100 }, { type: 'number', value: 200 }]);
});

test('definitions without parentheses, implicit calls and bare calls are accepted', () => {
  const program = parse('square = ->\n  fd 10\nsquare\nsquare()\nbox green, 25\npu\npd()');
  assert.deepEqual(program.body[0].params, []);
  assert.deepEqual(program.body.slice(1, 3).map((statement) => [statement.type, statement.args.length]), [['call', 0], ['call', 0]]);
  assert.equal(program.body[3].args.length, 2);
  assert.deepEqual(program.body.slice(4).map((statement) => statement.name), ['pu', 'pd']);
  const implicit = parse('square = (size) ->\n  fd size\nsquare 100\nsquare(100)');
  assert.deepEqual(implicit.body[1].args, implicit.body[2].args);
});

test('for-loops: with or without a variable, inclusive and exclusive ranges', () => {
  const program = parse('for [1..4]\n  fd 100\n  rt 90\nfor count in [1..10]\n  fd count\nfor [1...4]\n  rt 90');
  const [first, second, third] = program.body;
  assert.deepEqual([first.type, first.variable, first.exclusive, first.body.length], ['for', null, false, 2]);
  assert.deepEqual(first.from, { type: 'number', value: 1 });
  assert.deepEqual(first.to, { type: 'number', value: 4 });
  assert.equal(second.variable, 'count');
  assert.equal(third.exclusive, true);
  assert.deepEqual(program.loops.map((loop) => loop.line), [1, 4, 6]);
  assert.equal(program.lineKinds[4], 'loop');
});

test('nested loops build nested bodies and blank or comment lines keep their numbers', () => {
  const program = parse('# draw squares\n\nfor count in [1..10]\n  for count in [1..10]\n    fd 1  # inside\nrt 90');
  assert.equal(program.lines.length, 6);
  assert.equal(program.lineKinds[1], null);
  assert.equal(program.lineKinds[2], null);
  assert.equal(program.body.length, 2);
  assert.equal(program.body[0].body[0].body[0].line, 5);
  assert.equal(program.body[1].line, 6);
});

test('expressions follow the usual precedence and support unary minus and parentheses', () => {
  const program = parse('fd 10 + 2 * 3\nfd -50\nfd (10 + 2) * 3\nrt 360 / 5');
  assert.deepEqual(program.body[0].args[0], {
    type: 'binary', op: '+', left: { type: 'number', value: 10 },
    right: { type: 'binary', op: '*', left: { type: 'number', value: 2 }, right: { type: 'number', value: 3 } },
  });
  assert.deepEqual(program.body[1].args[0], { type: 'unary', op: '-', operand: { type: 'number', value: 50 } });
  assert.equal(program.body[2].args[0].op, '*');
  assert.equal(program.body[3].args[0].op, '/');
});

test('assignments, Unicode names, tabs and CRLF line endings are handled', () => {
  const program = parse('size = 50\r\n正方形 = (边长) ->\r\n\tfd 边长\r\n正方形(size)');
  assert.deepEqual(program.body[0], { type: 'assign', line: 1, name: 'size', value: { type: 'number', value: 50 } });
  assert.equal(program.body[1].name, '正方形');
  assert.equal(program.lines[2], '  fd 边长');
  assert.deepEqual(sourceLines('a\n\n\n'), ['a']);
});

test('colour names map to the palette, case-insensitively, with common aliases', () => {
  assert.equal(colorFamily('red'), 'red');
  assert.equal(colorFamily('Blue'), 'blue');
  assert.equal(colorFamily('grey'), 'gray');
  assert.equal(colorFamily('navy'), 'blue');
  assert.equal(colorFamily('lime'), 'green');
  assert.equal(colorFamily('banana'), null);
  assert.ok(COLOR_FAMILIES.includes('purple'));
  assert.ok(Object.values(BUILTINS).every((spec) => spec.group === 'move' || spec.group === 'art'));
});

test('walkStatements visits headers before their bodies (source order)', () => {
  const program = parse('f = () ->\n  for [1..2]\n    fd 1\n  rt 90\nf()');
  const lines = [];
  walkStatements(program.body, (statement) => lines.push(statement.line));
  assert.deepEqual(lines, [1, 2, 3, 4, 5]);
});

test('Chinese full-width punctuation and digits are reported with the ASCII fix', () => {
  const comma = parseError('fd 100\nbox green，25');
  assert.equal(comma.line, 2);
  assert.match(comma.zh, /，/);
  assert.match(comma.en, /`,`/);
  assert.equal(parseError('square（）').line, 1);
  assert.match(parseError('fd　100').en, /full-width space/);
  assert.match(parseError('fd １００').en, /full-width digits/);
});

test('Python habits get pointed hints', () => {
  assert.match(parseError('for i in range(4):\n  fd 100').en, /for \[1\.\.4\]/);
  assert.match(parseError('def square():\n  fd 100').en, /square = \(\) ->/);
  assert.match(parseError('fd 100:').en, /colon/);
  assert.match(parseError('fd 100; rt 90').en, /one instruction per line/);
  assert.match(parseError('repeat 4\n  fd 100').en, /for \[1\.\.4\]/);
  assert.match(parseError('if x\n  fd 1').en, /not supported/);
});

test('unknown instructions come with suggestions', () => {
  const forward = parseError('forward 100');
  assert.equal(forward.line, 1);
  assert.match(forward.en, /Did you mean `fd 100`/);
  assert.match(parseError('FD 100').en, /lowercase/);
  assert.match(parseError('red').en, /`pen red`/);
  assert.match(parseError('drawHouse()').en, /define it first/);
  assert.match(parseError('fd lenght').en, /Unknown name `lenght`/);
});

test('one instruction per line and correct argument counts for built-ins', () => {
  assert.match(parseError('fd 100 rt 90').en, /move `rt` to the next line/);
  assert.match(parseError('fd').en, /`fd` needs 1 number/);
  assert.match(parseError('dot').zh, /`dot` 需要 1 个颜色/);
  assert.match(parseError('pu(5)').en, /takes no values/);
  assert.match(parseError('jumpto 10').en, /2 numbers/);
  assert.match(parseError('fd 1,').en, /missing after the comma/);
  assert.match(parseError('fd (1 + 2').en, /brackets/);
});

test('indentation errors point at the offending line', () => {
  const extra = parseError('fd 100\n  rt 90');
  assert.equal(extra.line, 2);
  assert.match(extra.en, /indented/);
  const missing = parseError('square = () ->\nfd 100');
  assert.equal(missing.line, 1);
  assert.match(missing.en, /at least one indented line/);
  assert.equal(parseError('for [1..3]').line, 1);
  const misaligned = parseError('for [1..3]\n    fd 1\n  rt 90');
  assert.equal(misaligned.line, 3);
  assert.match(misaligned.en, /line up/);
});

test('functions need different names (Lecture 2 p.18) and clean parameter lists', () => {
  const twice = parseError('square = () ->\n  fd 1\nsquare = () ->\n  fd 2');
  assert.equal(twice.line, 3);
  assert.match(twice.en, /different name/);
  assert.match(parseError('f = (a, a) ->\n  fd a').en, /repeated/);
  assert.match(parseError('fd = () ->\n  rt 90').en, /instruction name/);
  assert.match(parseError('square = (x) -> fd x').en, /next lines/);
  assert.match(parseError('square = (length)').en, /ends with `->`/);
});

test('empty programs and unclosed quotes are explained', () => {
  const empty = parseError('  \n# only a comment\n');
  assert.equal(empty.line, null);
  assert.match(empty.en, /empty/);
  assert.match(parseError("pen 'red").en, /quote/);
});

test('invisible characters are named by their code point', () => {
  const zeroWidth = parseError('fd 100\nrt​ 90');
  assert.equal(zeroWidth.line, 2);
  assert.match(zeroWidth.en, /invisible character \(U\+200B\)/);
  assert.match(zeroWidth.zh, /U\+200B/);
  assert.doesNotMatch(zeroWidth.zh, /``/);
  assert.match(parseError('fd 1\u0007').en, /U\+0007/);
  assert.match(parseError('fd 1 @').en, /The symbol `@` is not understood/);
});

test('very long lines are refused with a message instead of overflowing the call stack', () => {
  const sum = parseError(`fd ${Array.from({ length: 20000 }, () => '1').join('+')}`);
  assert.equal(sum.line, 1);
  assert.equal(sum.kind, 'syntax');
  assert.match(sum.en, /too long/);
  assert.match(parseError(`fd ${'-'.repeat(8000)}1`).en, /too long/);
  assert.match(parseError(`x = 1\nfd x${' + x'.repeat(MAX_TOKENS_PER_LINE)}`).zh, /这一行太长了/);
  const longest = Array.from({ length: (MAX_TOKENS_PER_LINE - 2) / 2 + 1 }, () => '1').join('+');
  assert.equal(parseProgram(`fd ${longest}`).error, null, 'a line with exactly the limit still parses');
});

test('isTooDeep recognises stack overflows from every browser', () => {
  assert.equal(isTooDeep(new RangeError('Maximum call stack size exceeded')), true);
  const firefox = new Error('too much recursion');
  firefox.name = 'InternalError';
  assert.equal(isTooDeep(firefox), true);
  assert.equal(isTooDeep(new TypeError('x')), false);
  assert.equal(isTooDeep(null), false);
});
