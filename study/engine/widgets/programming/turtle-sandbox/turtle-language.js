/**
 * Parser for the small PencilCode-style turtle language of Lecture 2 and Lab 2.
 * Lecture 2 与 Lab 2 所用 PencilCode 风格海龟语言的解析器。
 *
 * Supported, in the CoffeeScript text that PencilCode shows for its blocks:
 *   one instruction per line        fd 100 / rt 90 / rt 180, 25 / pen green, 10 / pu() / box green, 25
 *   function definitions and calls  square = (length) ->   square(100)   square 100
 *   definite for-loops              for [1..4]   for count in [1..10]
 *   numeric variables, + - * / % and parentheses; blocks are marked by indentation.
 * 支持（与 PencilCode 积木对应的 CoffeeScript 文本）：每行一条指令；带参数的函数定义与调用；
 * 固定次数的 for 循环；数字变量与四则运算；代码块用缩进表示。
 *
 * Every statement keeps its 1-based source line, so the interpreter can count executions per line.
 * Errors carry a Chinese and an English message and never contain HTML.
 * 每条语句都记录源代码行号（从 1 开始），解释器据此统计每一行执行了几次；错误信息为中英双语纯文本。
 */

/**
 * Built-in instructions: argument count, argument kinds and a usage example for error messages.
 * group: "move" matches the blue Move blocks, "art" the purple Art blocks of the course app.
 * 内置指令：参数个数、参数类型与示例写法。group 对应课程应用里蓝色 Move 积木与紫色 Art 积木。
 */
export const BUILTINS = Object.freeze({
  fd: { min: 1, max: 1, kinds: ['number'], usage: 'fd 100', group: 'move', need: { zh: '1 个数字（前进多远）', en: '1 number (how far to move)' } },
  bk: { min: 1, max: 1, kinds: ['number'], usage: 'bk 100', group: 'move', need: { zh: '1 个数字（后退多远）', en: '1 number (how far to move back)' } },
  rt: { min: 1, max: 2, kinds: ['number', 'number'], usage: 'rt 90', group: 'move', need: { zh: '1 个数字（转多少度），画圆弧时再加一个半径', en: '1 number (degrees), plus a radius to draw an arc' } },
  lt: { min: 1, max: 2, kinds: ['number', 'number'], usage: 'lt 90', group: 'move', need: { zh: '1 个数字（转多少度），画圆弧时再加一个半径', en: '1 number (degrees), plus a radius to draw an arc' } },
  speed: { min: 1, max: 1, kinds: ['number'], usage: 'speed 10', group: 'move', need: { zh: '1 个数字（动画速度）', en: '1 number (the animation speed)' } },
  jumpto: { min: 2, max: 2, kinds: ['number', 'number'], usage: 'jumpto -100, 50', group: 'move', need: { zh: '2 个数字（x, y）', en: '2 numbers (x, y)' } },
  moveto: { min: 2, max: 2, kinds: ['number', 'number'], usage: 'moveto 100, 0', group: 'move', need: { zh: '2 个数字（x, y）', en: '2 numbers (x, y)' } },
  turnto: { min: 1, max: 1, kinds: ['number'], usage: 'turnto 90', group: 'move', need: { zh: '1 个数字（朝向的角度）', en: '1 number (the direction in degrees)' } },
  home: { min: 0, max: 0, kinds: [], usage: 'home()', group: 'move', need: null },
  pen: { min: 1, max: 2, kinds: ['color', 'number'], usage: 'pen red', group: 'art', need: { zh: '1 个颜色，可以再加粗细', en: 'a colour, optionally followed by a width' } },
  pu: { min: 0, max: 0, kinds: [], usage: 'pu()', group: 'art', need: null },
  pd: { min: 0, max: 0, kinds: [], usage: 'pd()', group: 'art', need: null },
  box: { min: 1, max: 2, kinds: ['color', 'number'], usage: 'box green, 25', group: 'art', need: { zh: '1 个颜色，可以再加大小', en: 'a colour, optionally followed by a size' } },
  dot: { min: 1, max: 2, kinds: ['color', 'number'], usage: 'dot red, 20', group: 'art', need: { zh: '1 个颜色，可以再加大小', en: 'a colour, optionally followed by a size' } },
  ht: { min: 0, max: 0, kinds: [], usage: 'ht()', group: 'art', need: null },
  st: { min: 0, max: 0, kinds: [], usage: 'st()', group: 'art', need: null },
});

/**
 * Colour names the pen understands, mapped to a small palette whose real colours come from the
 * design tokens (so drawings stay readable in dark mode).
 * 画笔认识的颜色名，映射到一小组调色板；实际颜色来自设计变量，深色模式下依然清晰。
 */
export const COLOR_FAMILIES = Object.freeze(['black', 'white', 'gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'cyan']);

const COLOR_ALIASES = Object.freeze({
  grey: 'gray', silver: 'gray', teal: 'cyan', aqua: 'cyan', turquoise: 'cyan', navy: 'blue', skyblue: 'blue',
  lime: 'green', olive: 'green', gold: 'yellow', violet: 'purple', indigo: 'purple', magenta: 'pink',
  fuchsia: 'pink', crimson: 'red', maroon: 'brown', tan: 'brown', chocolate: 'brown', coral: 'orange',
});

/**
 * Returns the palette family of a colour name (case-insensitive), or null when unknown.
 * 返回颜色名对应的调色板颜色（不区分大小写），不认识时返回 null。
 */
export function colorFamily(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (COLOR_FAMILIES.includes(key)) return key;
  return Object.hasOwn(COLOR_ALIASES, key) ? COLOR_ALIASES[key] : null;
}

// Words that start constructs this sandbox does not support, or that cannot be used as names.
// 本沙盒不支持的语法开头词，以及不能用作名字的保留词。
const RESERVED = new Set([
  'if', 'else', 'unless', 'while', 'until', 'loop', 'switch', 'when', 'then', 'return', 'break', 'continue',
  'class', 'new', 'try', 'catch', 'finally', 'throw', 'do', 'repeat', 'function', 'def', 'var', 'let', 'const',
  'print', 'and', 'or', 'not', 'is', 'isnt', 'of', 'by', 'true', 'false', 'yes', 'no', 'null', 'undefined',
  'this', 'delete', 'typeof', 'instanceof', 'super', 'extends', 'import', 'export', 'await', 'yield', 'in', 'for',
]);

// Common words a beginner might try, mapped to the instruction they probably meant.
// 初学者可能会写的词，以及它们大概想写的指令。
const SUGGESTIONS = Object.freeze({
  forward: 'fd 100', fwd: 'fd 100', go: 'fd 100', move: 'fd 100', walk: 'fd 100',
  back: 'bk 100', backward: 'bk 100', backwards: 'bk 100',
  right: 'rt 90', turnright: 'rt 90', turn: 'rt 90', left: 'lt 90', turnleft: 'lt 90',
  penup: 'pu()', pendown: 'pd()', up: 'pu()', down: 'pd()',
  color: 'pen red', colour: 'pen red', circle: 'rt 360, 50',
});

// Full-width punctuation typed with a Chinese input method, and the ASCII character code needs.
// 中文输入法打出的全角标点，以及代码里应该使用的英文半角字符。
const FULL_WIDTH = new Map([
  ['，', ','], ['、', ','], ['（', '('], ['）', ')'], ['［', '['], ['］', ']'], ['【', '['], ['】', ']'],
  ['＝', '='], ['＋', '+'], ['－', '-'], ['＊', '*'], ['／', '/'], ['：', ':'], ['；', ';'], ['．', '.'],
  ['。', '.'], ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"], ['＃', '#'], ['＞', '>'], ['＜', '<'],
  ['！', '!'], ['？', '?'], ['…', '...'], ['　', ' '],
]);
const FULL_WIDTH_DIGIT = /[０-９]/;
const MAX_EXPRESSION_DEPTH = 40;
// Long lines build deep expression trees, and evaluating those recursively could overflow the call stack.
// 过长的一行会生成很深的表达式树，递归计算时可能撑爆调用栈，因此限制每行的片段数。
export const MAX_TOKENS_PER_LINE = 200;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u;

/**
 * Message for code the sandbox cannot work out without running out of call stack.
 * 代码复杂到沙盒算不过来（调用栈不够用）时的提示。
 */
export const TOO_COMPLEX = Object.freeze({
  zh: '这段代码太复杂了，沙盒算不过来。把它拆短一点再试。',
  en: 'This code is too complex for the sandbox. Make it shorter and try again.',
});

/**
 * True for the error a browser throws when recursion runs out of call stack
 * (RangeError in most browsers, InternalError in Firefox).
 * 判断是否为递归用完调用栈时浏览器抛出的错误（多数浏览器是 RangeError，Firefox 是 InternalError）。
 */
export function isTooDeep(error) {
  return error instanceof RangeError || Boolean(error && error.name === 'InternalError');
}

/**
 * Error with a line number and a bilingual message. `kind` is "syntax", "runtime" or "limit".
 * 带行号与双语信息的错误。kind 为 syntax（语法）、runtime（运行）或 limit（步数上限）。
 */
export class TurtleError extends Error {
  constructor(line, zh, en, kind = 'syntax') {
    super(en);
    this.name = 'TurtleError';
    this.line = line;
    this.zh = zh;
    this.en = en;
    this.kind = kind;
  }

  toJSON() {
    return { line: this.line, zh: this.zh, en: this.en, kind: this.kind };
  }
}

const fail = (line, zh, en) => new TurtleError(line, zh, en, 'syntax');

/**
 * Parses source text. Returns { program, error }; exactly one of them is null.
 * 解析源代码，返回 { program, error }，二者恰有一个为 null。
 *
 * program = {
 *   lines,         display text of every source line (tabs become 2 spaces)
 *   body,          top-level statements
 *   lineKinds,     index = line number: "instruction" | "define" | "loop" | null (blank or comment)
 *   definitions,   [{ name, line, params, statement }] in source order
 *   loops,         for-statements in source order
 * }
 */
export function parseProgram(source) {
  try {
    return { program: buildProgram(String(source ?? '')), error: null };
  } catch (error) {
    if (error instanceof TurtleError) return { program: null, error: error.toJSON() };
    if (isTooDeep(error)) return { program: null, error: { line: null, zh: TOO_COMPLEX.zh, en: TOO_COMPLEX.en, kind: 'syntax' } };
    throw error;
  }
}

/**
 * Returns the display lines of a source text exactly as the parser numbers them.
 * 按解析器的行号规则返回源代码的显示行。
 */
export function sourceLines(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n').map((text) => text.replace(/\t/g, '  '));
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

function buildProgram(source) {
  const lines = sourceLines(source);
  const body = [];
  const stack = [{ indent: 0, body, names: new Set() }];
  const lineKinds = new Array(lines.length + 1).fill(null);
  const definitions = [];
  const loops = [];
  let pending = null;

  lines.forEach((raw, index) => {
    const line = index + 1;
    const code = stripComment(raw, line);
    if (!code.trim()) return;
    checkCharacters(code, line);
    const indent = code.length - code.trimStart().length;

    if (pending) {
      // The first line after a header opens its block and fixes the block's indentation.
      // 头部（函数定义或循环）后的第一行开启代码块，并确定该块的缩进量。
      if (indent <= stack[stack.length - 1].indent) throw missingBody(pending);
      stack.push({ indent, body: pending.body, names: new Set() });
      pending = null;
    } else {
      if (indent > stack[stack.length - 1].indent) {
        throw fail(line,
          '这一行缩进多了：只有函数定义或 `for` 循环下面的行才需要缩进。',
          'This line is indented, but only lines under a function definition or a `for` loop are indented.');
      }
      while (indent < stack[stack.length - 1].indent) stack.pop();
      if (indent !== stack[stack.length - 1].indent) {
        throw fail(line, '这一行的缩进和上面的行对不齐。', 'The indentation of this line does not line up with the lines above.');
      }
    }

    const statement = parseStatement(tokenize(code.trim(), line), line);
    const block = stack[stack.length - 1];
    if (statement.type === 'define') {
      // Lecture 2 p.18: several functions are allowed, but they must all have different names.
      // Lecture 2 第 18 页：可以有多个函数，但名字必须各不相同。
      if (block.names.has(statement.name)) {
        throw fail(line,
          `已经有一个叫 \`${statement.name}\` 的函数了：每个函数的名字都要不同。`,
          `There is already a function named \`${statement.name}\`; every function needs a different name.`);
      }
      block.names.add(statement.name);
      definitions.push({ name: statement.name, line, params: statement.params, statement });
    }
    if (statement.type === 'for') loops.push(statement);
    block.body.push(statement);
    lineKinds[line] = statement.type === 'define' ? 'define' : statement.type === 'for' ? 'loop' : 'instruction';
    if (statement.type === 'define' || statement.type === 'for') pending = statement;
  });

  if (pending) throw missingBody(pending);
  if (!body.length) {
    throw fail(null, '程序是空的：先写一条指令，比如 `fd 100`。', 'The program is empty. Start with an instruction such as `fd 100`.');
  }
  const program = { lines, body, lineKinds, definitions, loops };
  checkNames(program);
  return program;
}

function missingBody(header) {
  const what = header.type === 'define'
    ? { zh: `函数 \`${header.name}\``, en: `The function \`${header.name}\`` }
    : { zh: '这个 `for` 循环', en: 'This `for` loop' };
  return fail(header.line,
    `${what.zh}下面需要至少一行缩进（前面多空 2 格）的指令。`,
    `${what.en} needs at least one indented line (2 more spaces) below it.`);
}

/**
 * Removes a trailing # comment, ignoring # inside quotes.
 * 去掉行尾的 # 注释（引号内的 # 不算）。
 */
function stripComment(text, line) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '#') {
      return text.slice(0, index);
    }
  }
  if (quote) throw fail(line, '引号没有配对：少了一个 `' + quote + '`。', 'A quote is not closed: one `' + quote + '` is missing.');
  return text;
}

function checkCharacters(code, line) {
  for (const char of code) {
    if (!FULL_WIDTH.has(char)) continue;
    if (char === '　') {
      throw fail(line,
        '这一行有全角空格：缩进和分隔要用英文半角空格（先切换到英文输入法）。',
        'This line contains a full-width space; use normal spaces (switch to an English keyboard first).');
    }
    const ascii = FULL_WIDTH.get(char);
    throw fail(line,
      `这一行有中文（全角）符号 ${char}：代码里要用英文半角的 \`${ascii}\`。`,
      `This line contains the Chinese (full-width) character ${char}; code needs the English \`${ascii}\`.`);
  }
  if (FULL_WIDTH_DIGIT.test(code)) {
    throw fail(line, '这一行有全角数字：请切换到英文输入法再输入数字。', 'This line has full-width digits; switch to an English keyboard to type numbers.');
  }
  // Python habits get a pointed hint instead of a generic syntax error.
  // 对 Python 写法给出明确提示，而不是笼统的语法错误。
  if (/^\s*for\b.*\brange\s*\(/.test(code)) {
    throw fail(line,
      '这里用 PencilCode 的写法：`for [1..4]`（不是 Python 的 `range`）。',
      'Use the PencilCode form `for [1..4]` here (not Python\'s `range`).');
  }
  if (/^\s*def\s/.test(code)) {
    throw fail(line,
      '函数这样定义：`square = () ->`，下一行开始缩进写函数里面的指令。',
      'Define a function like `square = () ->` and write its instructions indented on the next lines.');
  }
}

const TOKEN_RULES = [
  ['range', /^\.\.\.?/],
  ['number', /^(?:\d+(?:\.\d+)?|\.\d+)/],
  ['string', /^(?:'[^']*'|"[^"]*")/],
  ['arrow', /^[-=]>/],
  ['ident', /^[\p{L}_$][\p{L}\p{N}_$]*/u],
  ['punct', /^[()[\],=+\-*/%]/],
];

function tokenize(text, line) {
  const tokens = [];
  let index = 0;
  let spaceBefore = false;
  while (index < text.length) {
    const rest = text.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      index += space[0].length;
      spaceBefore = true;
      continue;
    }
    let token = null;
    for (const [type, pattern] of TOKEN_RULES) {
      const match = pattern.exec(rest);
      if (match) {
        token = { type, value: match[0], spaceBefore };
        break;
      }
    }
    if (!token) throw unexpectedCharacter(String.fromCodePoint(rest.codePointAt(0)), line);
    tokens.push(token);
    if (tokens.length > MAX_TOKENS_PER_LINE) {
      throw fail(line,
        `这一行太长了：一行最多写 ${MAX_TOKENS_PER_LINE} 个数字、名字或符号。把它拆成几行短一点的。`,
        `This line is too long: one line holds at most ${MAX_TOKENS_PER_LINE} numbers, names or symbols. Split it into shorter lines.`);
    }
    index += token.value.length;
    spaceBefore = false;
  }
  return tokens;
}

function unexpectedCharacter(char, line) {
  if (char === ':') return fail(line, '这里不需要冒号 `:`（这不是 Python）。', 'No colon `:` is needed here (this is not Python).');
  if (char === ';') return fail(line, '一行只写一条指令，不要用分号 `;`。', 'Write one instruction per line, without `;`.');
  if (char === '{' || char === '}') return fail(line, '这里不用花括号 `{ }`，代码块靠缩进表示。', 'Curly braces `{ }` are not used; blocks are marked by indentation.');
  if (char === '.') return fail(line, '这里多了一个点 `.`。范围要写成 `[1..4]`。', 'There is a stray `.`; a range is written like `[1..4]`.');
  if (INVISIBLE.test(char)) {
    // An invisible character would show as empty backticks, so name it by its code point instead.
    // 看不见的字符放在反引号里什么也看不到，所以改为写出它的编码。
    const code = `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    return fail(line,
      `这一行有一个看不见的字符（${code}），可能是复制文字时带进来的。把它删掉再试。`,
      `This line contains an invisible character (${code}), probably from copied text. Delete it and try again.`);
  }
  return fail(line, `看不懂符号 \`${char}\`。`, `The symbol \`${char}\` is not understood.`);
}

class Cursor {
  constructor(tokens, line) {
    this.tokens = tokens;
    this.index = 0;
    this.line = line;
    this.depth = 0;
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset] || null;
  }

  next() {
    const token = this.tokens[this.index] || null;
    if (token) this.index += 1;
    return token;
  }

  atEnd() {
    return this.index >= this.tokens.length;
  }

  is(type, value, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === type && (value === undefined || token.value === value));
  }

  accept(type, value) {
    if (!this.is(type, value)) return null;
    return this.next();
  }
}

function parseStatement(tokens, line) {
  const cursor = new Cursor(tokens, line);
  const first = cursor.peek();
  if (first.type !== 'ident') {
    throw fail(line, '每一行要以指令开头，比如 `fd 100`。', 'Each line must start with an instruction, for example `fd 100`.');
  }
  const word = first.value;
  if (word === 'for') return parseFor(cursor);
  if (word === 'repeat' || word === 'loop' || word === 'while') {
    throw fail(line,
      `这里不支持 \`${word}\`。要重复几次，用 \`for [1..4]\`，下一行缩进写要重复的指令。`,
      `\`${word}\` is not supported. To repeat, write \`for [1..4]\` and indent the repeated instructions below it.`);
  }
  if (RESERVED.has(word)) throw unsupportedWord(word, line);
  if (cursor.is('punct', '=', 1)) return parseAssignment(cursor);
  return parseCall(cursor);
}

function unsupportedWord(word, line) {
  return fail(line,
    `这个练习只支持海龟指令、函数和 \`for\` 循环，不支持 \`${word}\`。`,
    `This sandbox supports turtle instructions, functions and \`for\` loops only; \`${word}\` is not supported.`);
}

function forFormError(line) {
  return fail(line,
    '`for` 循环要写成 `for [1..10]` 或 `for count in [1..10]`。',
    'Write a for-loop as `for [1..10]` or `for count in [1..10]`.');
}

function parseFor(cursor) {
  const { line } = cursor;
  cursor.next();
  let variable = null;
  if (cursor.is('ident')) {
    if (!cursor.is('ident', 'in', 1)) throw forFormError(line);
    variable = cursor.next().value;
    checkName(variable, line, { zh: '循环变量', en: 'a loop variable' });
    cursor.next();
  }
  if (!cursor.accept('punct', '[')) throw forFormError(line);
  const from = parseExpression(cursor);
  const range = cursor.accept('range');
  if (!range) throw forFormError(line);
  const to = parseExpression(cursor);
  if (!cursor.accept('punct', ']')) throw forFormError(line);
  if (!cursor.atEnd()) {
    if (cursor.is('ident', 'then')) throw inlineBody(line);
    if (cursor.is('ident', 'by')) {
      throw fail(line, '这里不支持 `by`（跳着数）。用 `for [1..4]` 这样一个一个数的循环。', '`by` (counting in steps) is not supported; use a loop such as `for [1..4]`.');
    }
    throw forFormError(line);
  }
  return { type: 'for', line, variable, from, to, exclusive: range.value === '...', body: [] };
}

function inlineBody(line) {
  return fail(line,
    '函数或循环里面的指令要换到下一行，并且缩进 2 个空格。',
    'Put the instructions of a function or loop on the next lines, indented by 2 spaces.');
}

function checkName(name, line, role) {
  if (Object.hasOwn(BUILTINS, name)) {
    throw fail(line,
      `\`${name}\` 是指令的名字，不能拿来当${role.zh}的名字。`,
      `\`${name}\` is an instruction name; it cannot be used as ${role.en} name.`);
  }
  if (RESERVED.has(name)) {
    throw fail(line, `\`${name}\` 是保留字，不能当名字用。`, `\`${name}\` is a reserved word and cannot be used as a name.`);
  }
}

// Looks ahead from "(" to its matching ")" and reports whether "->" follows.
// 从 "(" 向后找到配对的 ")"，判断后面是否紧跟 "->"。
function isFunctionHeader(cursor) {
  let depth = 0;
  for (let index = cursor.index; index < cursor.tokens.length; index += 1) {
    const token = cursor.tokens[index];
    if (token.type !== 'punct') continue;
    if (token.value === '(') depth += 1;
    if (token.value === ')') {
      depth -= 1;
      if (depth === 0) {
        const after = cursor.tokens[index + 1];
        return Boolean(after && after.type === 'arrow');
      }
    }
  }
  return false;
}

function parseAssignment(cursor) {
  const { line } = cursor;
  const name = cursor.next().value;
  cursor.next();
  if (cursor.atEnd()) {
    throw fail(line, '`=` 后面要写一个值，或者写 `() ->` 定义函数。', 'Write a value after `=`, or `() ->` to define a function.');
  }
  if (cursor.is('arrow') || (cursor.is('punct', '(') && isFunctionHeader(cursor))) {
    checkName(name, line, { zh: '函数', en: 'a function' });
    const params = [];
    if (cursor.accept('punct', '(') && !cursor.accept('punct', ')')) {
      do {
        const param = cursor.next();
        if (!param || param.type !== 'ident') {
          throw fail(line, '参数要写成名字，多个参数用逗号隔开，比如 `(length, width)`。', 'Parameters are names separated by commas, e.g. `(length, width)`.');
        }
        checkName(param.value, line, { zh: '参数', en: 'a parameter' });
        if (params.includes(param.value)) {
          throw fail(line, `参数名字 \`${param.value}\` 重复了：每个参数的名字要不同。`, `The parameter name \`${param.value}\` is repeated; each parameter needs a different name.`);
        }
        params.push(param.value);
      } while (cursor.accept('punct', ','));
      if (!cursor.accept('punct', ')')) throw bracketError(line);
    }
    cursor.accept('arrow');
    if (!cursor.atEnd()) throw inlineBody(line);
    return { type: 'define', line, name, params, body: [] };
  }
  if (cursor.is('punct', '(') && looksLikeHeaderWithoutArrow(cursor)) {
    throw fail(line, '函数定义最后要写 `->`，比如 `square = () ->`。', 'A function definition ends with `->`, e.g. `square = () ->`.');
  }
  checkName(name, line, { zh: '变量', en: 'a variable' });
  const value = parseExpression(cursor);
  if (!cursor.atEnd()) throw unexpectedToken(cursor.peek(), line);
  return { type: 'assign', line, name, value };
}

// "(a, b)" or "()" with nothing after it: almost certainly a definition missing its arrow.
// 只有 "(a, b)" 或 "()" 且后面再无内容：几乎可以肯定是函数定义漏写了箭头。
function looksLikeHeaderWithoutArrow(cursor) {
  const rest = cursor.tokens.slice(cursor.index);
  if (rest.length < 2 || rest[rest.length - 1].value !== ')') return false;
  return rest.slice(1, -1).every((token) => token.type === 'ident' || token.value === ',');
}

function parseCall(cursor) {
  const { line } = cursor;
  const name = cursor.next().value;
  let args = [];
  if (cursor.is('punct', '(') && !cursor.peek().spaceBefore) {
    cursor.next();
    if (!cursor.accept('punct', ')')) {
      args = parseArguments(cursor);
      if (!cursor.accept('punct', ')')) throw bracketError(line);
    }
    if (!cursor.atEnd()) throw unexpectedToken(cursor.peek(), line);
  } else if (!cursor.atEnd()) {
    args = parseArguments(cursor);
    if (!cursor.atEnd()) throw unexpectedToken(cursor.peek(), line);
  }
  if (Object.hasOwn(BUILTINS, name)) {
    checkArity(name, args.length, line);
    return { type: 'command', line, name, args };
  }
  return { type: 'call', line, name, args };
}

function checkArity(name, count, line) {
  const spec = BUILTINS[name];
  if (count >= spec.min && count <= spec.max) return;
  if (!spec.need) {
    throw fail(line, `\`${name}\` 后面不需要值，写成 \`${spec.usage}\`。`, `\`${name}\` takes no values; write \`${spec.usage}\`.`);
  }
  throw fail(line, `\`${name}\` 需要 ${spec.need.zh}，比如 \`${spec.usage}\`。`, `\`${name}\` needs ${spec.need.en}, e.g. \`${spec.usage}\`.`);
}

function parseArguments(cursor) {
  const args = [parseExpression(cursor)];
  while (cursor.accept('punct', ',')) {
    if (cursor.atEnd()) {
      throw fail(cursor.line, '逗号后面少了一个值。', 'A value is missing after the comma.');
    }
    args.push(parseExpression(cursor));
  }
  return args;
}

function bracketError(line) {
  return fail(line, '括号没有配对：检查 `(` 和 `)` 是不是一样多。', 'The brackets do not match; check that every `(` has a `)`.');
}

function unexpectedToken(token, line) {
  if (token.type === 'ident' && Object.hasOwn(BUILTINS, token.value)) {
    return fail(line,
      `一行只写一条指令：把 \`${token.value}\` 移到下一行。`,
      `Write one instruction per line: move \`${token.value}\` to the next line.`);
  }
  if (token.type === 'arrow') return inlineBody(line);
  return fail(line, `这一行在 \`${token.value}\` 这里看不懂。`, `This line could not be understood at \`${token.value}\`.`);
}

function parseExpression(cursor) {
  cursor.depth += 1;
  if (cursor.depth > MAX_EXPRESSION_DEPTH) {
    throw fail(cursor.line, '括号套得太多层了。', 'Too many nested brackets.');
  }
  let left = parseTerm(cursor);
  while (cursor.is('punct', '+') || cursor.is('punct', '-')) {
    const op = cursor.next().value;
    left = { type: 'binary', op, left, right: parseTerm(cursor) };
  }
  cursor.depth -= 1;
  return left;
}

function parseTerm(cursor) {
  let left = parseUnary(cursor);
  while (cursor.is('punct', '*') || cursor.is('punct', '/') || cursor.is('punct', '%')) {
    const op = cursor.next().value;
    left = { type: 'binary', op, left, right: parseUnary(cursor) };
  }
  return left;
}

function parseUnary(cursor) {
  if (cursor.is('punct', '-') || cursor.is('punct', '+')) {
    const op = cursor.next().value;
    const operand = parseUnary(cursor);
    return op === '-' ? { type: 'unary', op, operand } : operand;
  }
  return parsePrimary(cursor);
}

function parsePrimary(cursor) {
  const { line } = cursor;
  const token = cursor.next();
  if (!token) throw fail(line, '这里少了一个值（数字、名字或颜色）。', 'A value (a number, a name or a colour) is missing here.');
  if (token.type === 'number') return { type: 'number', value: Number(token.value) };
  if (token.type === 'string') return { type: 'string', value: token.value.slice(1, -1) };
  if (token.type === 'ident') {
    if (RESERVED.has(token.value)) throw unsupportedWord(token.value, line);
    if (Object.hasOwn(BUILTINS, token.value)) {
      throw fail(line,
        `\`${token.value}\` 是一条指令，不能当作值：一行只写一条指令。`,
        `\`${token.value}\` is an instruction, not a value; write one instruction per line.`);
    }
    if (cursor.is('punct', '(') && !cursor.peek().spaceBefore) {
      throw fail(line,
        `这里不能调用 \`${token.value}\`：函数调用要单独写一行。`,
        `\`${token.value}\` cannot be called here; write a function call on its own line.`);
    }
    return { type: 'name', name: token.value };
  }
  if (token.type === 'punct' && token.value === '(') {
    if (cursor.is('punct', ')')) throw fail(line, '括号里面是空的。', 'The brackets are empty.');
    const inner = parseExpression(cursor);
    if (!cursor.accept('punct', ')')) throw bracketError(line);
    return inner;
  }
  throw unexpectedToken(token, line);
}

/**
 * Visits statements in source order (a header before its body).
 * 按源代码顺序访问语句（先头部，后其代码块）。
 */
export function walkStatements(statements, visit) {
  for (const statement of statements) {
    visit(statement);
    if (statement.body) walkStatements(statement.body, visit);
  }
}

function expressionsOf(statement) {
  if (statement.type === 'command' || statement.type === 'call') return statement.args;
  if (statement.type === 'assign') return [statement.value];
  if (statement.type === 'for') return [statement.from, statement.to];
  return [];
}

function visitNames(expression, visit) {
  if (!expression) return;
  if (expression.type === 'name') visit(expression.name);
  if (expression.type === 'unary') visitNames(expression.operand, visit);
  if (expression.type === 'binary') {
    visitNames(expression.left, visit);
    visitNames(expression.right, visit);
  }
}

// Names that are never defined anywhere are reported before running, with a helpful hint.
// 整个程序里都没有定义过的名字，在运行前就报错并给出提示。
function checkNames(program) {
  const known = new Set();
  walkStatements(program.body, (statement) => {
    if (statement.type === 'define') {
      known.add(statement.name);
      statement.params.forEach((param) => known.add(param));
    }
    if (statement.type === 'assign') known.add(statement.name);
    if (statement.type === 'for' && statement.variable) known.add(statement.variable);
  });
  walkStatements(program.body, (statement) => {
    if (statement.type === 'call' && !known.has(statement.name)) throw unknownInstruction(statement.name, statement.line);
    if (statement.type === 'command') {
      // A colour slot (pen, box, dot) gets a colour-specific message listing the palette.
      // 颜色位置（pen、box、dot 的第一个值）给出专门的颜色错误，并列出可用颜色。
      const slots = BUILTINS[statement.name].kinds;
      statement.args.forEach((arg, index) => {
        if (slots[index] !== 'color') return;
        if (arg.type === 'string' && !colorFamily(arg.value)) throw unknownColour(arg.value, statement.line, 'syntax');
        if (arg.type === 'name' && !known.has(arg.name) && !colorFamily(arg.name)) throw unknownColour(arg.name, statement.line, 'syntax');
      });
    }
    for (const expression of expressionsOf(statement)) {
      visitNames(expression, (name) => {
        if (!known.has(name) && !colorFamily(name)) throw unknownName(name, statement.line);
      });
    }
  });
}

/**
 * Error for a colour name the pen does not know, listing the available colours.
 * 画笔不认识某个颜色名时的错误，并列出可用颜色。
 */
export function unknownColour(name, line, kind = 'runtime') {
  return new TurtleError(line,
    `不认识的颜色 \`${name}\`。可以用：${COLOR_FAMILIES.join('、')}。`,
    `Unknown colour \`${name}\`. Try: ${COLOR_FAMILIES.join(', ')}.`,
    kind);
}

/**
 * Error for a call to something that is neither a built-in instruction nor a defined function.
 * 调用的名字既不是内置指令、也不是已定义函数时的错误。
 */
export function unknownInstruction(name, line) {
  const lower = name.toLowerCase();
  if (Object.hasOwn(BUILTINS, lower)) {
    return fail(line, `指令要用小写字母：写 \`${lower}\`，不是 \`${name}\`。`, `Instructions are lowercase: write \`${lower}\`, not \`${name}\`.`);
  }
  if (colorFamily(name)) {
    return fail(line,
      `\`${name}\` 是颜色，不是指令。想换颜色要写 \`pen ${name}\`。`,
      `\`${name}\` is a colour, not an instruction. To change colour, write \`pen ${name}\`.`);
  }
  if (Object.hasOwn(SUGGESTIONS, lower)) {
    const hint = SUGGESTIONS[lower];
    return fail(line, `不认识的指令 \`${name}\`。你是不是想写 \`${hint}\`？`, `Unknown instruction \`${name}\`. Did you mean \`${hint}\`?`);
  }
  return fail(line,
    `不认识的指令 \`${name}\`。如果它是你自己的函数，要先定义，比如 \`${name} = () ->\`。`,
    `Unknown instruction \`${name}\`. If it is your own function, define it first, e.g. \`${name} = () ->\`.`);
}

/**
 * Error for a name used as a value that is not a parameter, a variable or a colour.
 * 当作值使用的名字既不是参数、变量，也不是颜色时的错误。
 */
export function unknownName(name, line) {
  return fail(line,
    `不认识的名字 \`${name}\`：它不是参数、变量，也不是颜色。检查一下拼写。`,
    `Unknown name \`${name}\`: it is not a parameter, a variable or a colour. Check the spelling.`);
}
