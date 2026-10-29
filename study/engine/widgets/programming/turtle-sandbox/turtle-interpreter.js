/**
 * Runs a parsed turtle program and records every executed step: which line ran, where the turtle went,
 * what was drawn, and how many times each line executed (Lecture 2: "Every instruction executed costs time.").
 * 运行解析后的海龟程序，记录每一步：哪一行执行了、海龟走到哪里、画了什么，以及每一行执行了几次
 * （Lecture 2：“Every instruction executed costs time.”）。
 *
 * The run is computed in full before anything is shown, so the view can animate, step back to the start
 * or jump to the end freely. A hard cap on steps stops runaway loops.
 * 程序先完整算完再显示，界面可以自由播放、重置或跳到结尾；步数上限防止循环停不下来。
 */
import {
  BUILTINS, TOO_COMPLEX, TurtleError, colorFamily, isTooDeep, unknownColour, unknownInstruction, unknownName,
} from './turtle-language.js';
import { arcPoints, boxCorners, forwardPoint, roundCoord, shortestTurn } from './turtle-geometry.js';

export const LIMITS = Object.freeze({ maxSteps: 10000, maxDepth: 100, maxCoordinate: 1000000 });

/**
 * PencilCode's turtle starts at the origin facing up with the pen down; `speed` is moves per second.
 * PencilCode 的海龟从原点出发、朝上、落笔；speed 表示每秒走几步。
 */
export const INITIAL_TURTLE = Object.freeze({
  x: 0, y: 0, heading: 0, penDown: true, color: 'black', width: 1, speed: 1, visible: true,
});

const DEFAULT_SIZE = { box: 20, dot: 9 };

const runtimeError = (line, zh, en) => new TurtleError(line, zh, en, 'runtime');

class StepLimitReached extends Error {
  constructor(line) {
    super('step limit');
    this.line = line;
  }
}

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.vars = new Map();
  }

  lookup(name) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.vars.has(name)) return scope.vars.get(name);
    }
    return undefined;
  }

  // CoffeeScript rule: assigning to a name that already exists in an enclosing scope updates it there.
  // CoffeeScript 规则：给外层已存在的名字赋值时，修改外层的那个变量。
  assign(name, value) {
    for (let scope = this; scope; scope = scope.parent) {
      if (scope.vars.has(name)) {
        scope.vars.set(name, value);
        return;
      }
    }
    this.vars.set(name, value);
  }
}

/**
 * Number of iterations of `for [from..to]` (inclusive) or `for [from...to]` (exclusive).
 * Like CoffeeScript, a range counts down when `from` is larger, so [1..0] runs twice (1, 0).
 * `for [from..to]`（含终点）或 `for [from...to]`（不含终点）的迭代次数。与 CoffeeScript 一致，
 * from 较大时倒着数，所以 [1..0] 会转 2 圈（1、0）。
 */
export function iterationCount(from, to, exclusive = false) {
  const span = Math.abs(to - from);
  if (exclusive) return span === 0 ? 0 : Math.ceil(span);
  return Math.floor(span) + 1;
}

/**
 * Runs the program. Returns {
 *   steps        executed steps in order; each { index, line, kind, counted, before, after, speed, path, draw, detail }
 *   lineCounts   index = line number: how many times that instruction executed (definitions and loop headers stay 0)
 *   calls        Map definition line -> number of calls
 *   loops        Map loop line -> { starts, iterations, minPerStart, maxPerStart, countsDown }
 *   executed     total counted steps
 *   error        null or { line, zh, en, kind: 'runtime' | 'limit' }
 *   initial, final
 * }
 * Only instructions are counted, a call line once per call. Definitions and loop iterations are shown as steps
 * but are not instructions, so `for [1..4]` around 2 instructions executes 2 × 4 = 8, as Lecture 2 counts it.
 * 只统计指令，调用行每调用一次计 1 次。定义函数和循环的每一圈会作为步骤显示，但它们不是指令，不计入执行次数：
 * 所以 `for [1..4]` 里放 2 条指令，一共执行 2 × 4 = 8 条，和 Lecture 2 的数法一致。
 */
export function runProgram(program, options = {}) {
  const limits = { ...LIMITS, ...options };
  const steps = [];
  const lineCounts = new Array(program.lines.length + 1).fill(0);
  const calls = new Map();
  const loops = new Map();
  let turtle = { ...INITIAL_TURTLE };
  let executed = 0;
  let error = null;
  let currentLine = null;

  function ensureRoom(line) {
    if (steps.length >= limits.maxSteps) throw new StepLimitReached(line);
  }

  function push(line, kind, counted, next, { path = null, draw = null, detail = null } = {}) {
    steps.push({
      index: steps.length,
      line,
      kind,
      counted,
      before: { x: turtle.x, y: turtle.y, heading: turtle.heading, visible: turtle.visible },
      after: { ...next },
      speed: turtle.speed,
      path,
      draw,
      detail,
    });
    if (counted) {
      lineCounts[line] += 1;
      executed += 1;
    }
    turtle = next;
  }

  function checkPoint([x, y], line) {
    if (Math.abs(x) > limits.maxCoordinate || Math.abs(y) > limits.maxCoordinate) {
      throw runtimeError(line,
        `海龟走得太远了：坐标超过了 ±${limits.maxCoordinate.toLocaleString('en-US')}。把数字改小一点。`,
        `The turtle went too far (beyond ±${limits.maxCoordinate.toLocaleString('en-US')}). Use smaller numbers.`);
    }
  }

  function evaluate(expression, scope, line, expect) {
    switch (expression.type) {
      case 'number':
        return expression.value;
      case 'string': {
        const family = colorFamily(expression.value);
        if (!family) throw unknownColour(expression.value, line);
        return { kind: 'color', name: family };
      }
      case 'name': {
        const found = scope.lookup(expression.name);
        if (found !== undefined) return found;
        const family = colorFamily(expression.name);
        if (family) return { kind: 'color', name: family };
        if (expect === 'color') throw unknownColour(expression.name, line);
        throw unknownName(expression.name, line);
      }
      case 'unary':
        return finite(-arithmetic(evaluate(expression.operand, scope, line), line), line);
      case 'binary': {
        const left = arithmetic(evaluate(expression.left, scope, line), line);
        const right = arithmetic(evaluate(expression.right, scope, line), line);
        const results = { '+': left + right, '-': left - right, '*': left * right, '/': left / right, '%': left % right };
        return finite(results[expression.op], line);
      }
      default:
        throw runtimeError(line, '看不懂这个值。', 'This value is not understood.');
    }
  }

  function runBlock(statements, scope, depth) {
    for (const statement of statements) runStatement(statement, scope, depth);
  }

  function runStatement(statement, scope, depth) {
    currentLine = statement.line;
    switch (statement.type) {
      case 'command':
        runCommand(statement, scope);
        break;
      case 'call':
        runCall(statement, scope, depth);
        break;
      case 'define':
        ensureRoom(statement.line);
        scope.assign(statement.name, { kind: 'function', definition: statement, closure: scope });
        push(statement.line, 'define', false, { ...turtle }, { detail: { name: statement.name, params: statement.params } });
        break;
      case 'assign': {
        ensureRoom(statement.line);
        const value = evaluate(statement.value, scope, statement.line);
        scope.assign(statement.name, value);
        push(statement.line, 'assign', true, { ...turtle }, { detail: { name: statement.name, value: displayValue(value) } });
        break;
      }
      case 'for':
        runLoop(statement, scope, depth);
        break;
      default:
        throw runtimeError(statement.line, '看不懂这一行。', 'This line is not understood.');
    }
  }

  function runLoop(statement, scope, depth) {
    const { line } = statement;
    ensureRoom(line);
    const from = toNumber(evaluate(statement.from, scope, line), 'for', line);
    const to = toNumber(evaluate(statement.to, scope, line), 'for', line);
    const total = iterationCount(from, to, statement.exclusive);
    const stats = loops.get(line) || { starts: 0, iterations: 0, minPerStart: Infinity, maxPerStart: 0, countsDown: false };
    stats.starts += 1;
    stats.minPerStart = Math.min(stats.minPerStart, total);
    stats.maxPerStart = Math.max(stats.maxPerStart, total);
    if (from > to) stats.countsDown = true;
    loops.set(line, stats);
    if (total === 0) {
      push(line, 'skip', false, { ...turtle }, { detail: { from, to } });
      return;
    }
    const direction = from <= to ? 1 : -1;
    for (let iteration = 1; iteration <= total; iteration += 1) {
      ensureRoom(line);
      const value = roundCoord(from + direction * (iteration - 1));
      push(line, 'iterate', false, { ...turtle }, { detail: { iteration, total, variable: statement.variable, value } });
      stats.iterations += 1;
      if (statement.variable) scope.assign(statement.variable, value);
      runBlock(statement.body, scope, depth);
    }
  }

  function runCall(statement, scope, depth) {
    const { line, name } = statement;
    ensureRoom(line);
    const callee = scope.lookup(name);
    if (callee === undefined) {
      if (program.definitions.some((definition) => definition.name === name)) {
        throw runtimeError(line,
          `函数 \`${name}\` 还没有定义：定义要写在调用的上面（Lecture 2 第 18 页）。`,
          `\`${name}\` is not defined yet: the definition must come above the call (Lecture 2, p.18).`);
      }
      throw unknownInstruction(name, line);
    }
    if (!callee || callee.kind !== 'function') {
      throw runtimeError(line, `\`${name}\` 不是函数，不能调用。`, `\`${name}\` is not a function, so it cannot be called.`);
    }
    const definition = callee.definition;
    const params = definition.params;
    if (statement.args.length !== params.length) {
      const list = params.length ? `（${params.join(', ')}）` : '';
      const listEn = params.length ? ` (${params.join(', ')})` : '';
      throw runtimeError(line,
        `\`${name}\` 需要 ${params.length} 个值${list}，这里给了 ${statement.args.length} 个。`,
        `\`${name}\` needs ${params.length} value${params.length === 1 ? '' : 's'}${listEn}, but the call gives ${statement.args.length}.`);
    }
    const args = statement.args.map((arg) => evaluate(arg, scope, line));
    if (depth >= limits.maxDepth) {
      throw runtimeError(line,
        `函数一层套一层调用太多了（超过 ${limits.maxDepth} 层）。`,
        `Too many nested function calls (more than ${limits.maxDepth}).`);
    }
    push(line, 'call', true, { ...turtle }, {
      detail: { name, defLine: definition.line, params, args: args.map(displayValue) },
    });
    calls.set(definition.line, (calls.get(definition.line) || 0) + 1);
    const local = new Scope(callee.closure);
    params.forEach((param, index) => local.vars.set(param, args[index]));
    runBlock(definition.body, local, depth + 1);
  }

  function runCommand(statement, scope) {
    const { line, name } = statement;
    ensureRoom(line);
    const spec = BUILTINS[name];
    const values = statement.args.map((arg, index) => evaluate(arg, scope, line, spec.kinds[index]));
    const number = (index) => toNumber(values[index], name, line);
    const next = { ...turtle };
    let kind = name;
    let path = null;
    let draw = null;
    let detail = null;
    const strokeAlong = (points) => (turtle.penDown && turtle.width > 0
      ? { type: 'line', points, color: turtle.color, width: turtle.width }
      : null);

    switch (name) {
      case 'fd':
      case 'bk': {
        const distance = number(0);
        const end = forwardPoint(turtle, name === 'bk' ? -distance : distance);
        checkPoint(end, line);
        [next.x, next.y] = end;
        if (distance !== 0) {
          path = [[turtle.x, turtle.y], end];
          draw = strokeAlong(path);
        }
        detail = { distance };
        break;
      }
      case 'rt':
      case 'lt': {
        const angle = number(0);
        const turn = name === 'rt' ? angle : -angle;
        next.heading = roundCoord(turtle.heading + turn);
        detail = { angle, direction: name === 'rt' ? 'right' : 'left' };
        if (values.length > 1) {
          const radius = number(1);
          detail.radius = radius;
          kind = 'arc';
          if (radius !== 0 && angle !== 0) {
            path = arcPoints(turtle, turn, radius);
            path.forEach((point) => checkPoint(point, line));
            [next.x, next.y] = path[path.length - 1];
            draw = strokeAlong(path);
          }
        }
        break;
      }
      case 'pen': {
        // A new pen also puts the pen down and resets the width, which is why every robot of
        // Lecture 2 p.17 is drawn even though `pu()` runs before the next `draw_robot()`.
        // 换笔同时会落笔并重设粗细：所以 Lecture 2 第 17 页每个机器人都画出来了，即使调用前执行过 pu()。
        next.color = toColor(values[0], name, line);
        next.width = values.length > 1 ? nonNegative(number(1), name, line) : 1;
        next.penDown = true;
        detail = { color: next.color, width: values.length > 1 ? next.width : null };
        break;
      }
      case 'pu':
        next.penDown = false;
        break;
      case 'pd':
        next.penDown = true;
        break;
      case 'box':
      case 'dot': {
        // Boxes and dots are stamped whether the pen is up or down (the robot's eyes are drawn after pu()).
        // 方块和圆点无论抬笔还是落笔都会画出（机器人的眼睛就是在 pu() 之后画的）。
        const color = toColor(values[0], name, line);
        const size = values.length > 1 ? nonNegative(number(1), name, line) : DEFAULT_SIZE[name];
        if (size > 0) {
          draw = name === 'box'
            ? { type: 'box', points: boxCorners(turtle, size), color }
            : { type: 'dot', cx: turtle.x, cy: turtle.y, r: size / 2, color };
          if (draw.points) draw.points.forEach((point) => checkPoint(point, line));
        }
        detail = { color, size };
        break;
      }
      case 'speed': {
        const value = number(0);
        if (!(value > 0)) {
          throw runtimeError(line, '`speed` 需要一个大于 0 的数字，比如 `speed 10`。', '`speed` needs a number greater than 0, e.g. `speed 10`.');
        }
        next.speed = value;
        detail = { speed: value };
        break;
      }
      case 'jumpto':
      case 'moveto': {
        const target = [roundCoord(number(0)), roundCoord(number(1))];
        checkPoint(target, line);
        [next.x, next.y] = target;
        if (target[0] !== turtle.x || target[1] !== turtle.y) {
          path = [[turtle.x, turtle.y], target];
          if (name === 'moveto') draw = strokeAlong(path);
        }
        detail = { x: target[0], y: target[1] };
        break;
      }
      case 'turnto': {
        const angle = number(0);
        next.heading = roundCoord(turtle.heading + shortestTurn(turtle.heading, angle));
        detail = { angle };
        break;
      }
      case 'home':
        next.x = 0;
        next.y = 0;
        next.heading = roundCoord(turtle.heading + shortestTurn(turtle.heading, 0));
        if (turtle.x !== 0 || turtle.y !== 0) path = [[turtle.x, turtle.y], [0, 0]];
        break;
      case 'ht':
        next.visible = false;
        break;
      case 'st':
        next.visible = true;
        break;
      default:
        throw unknownInstruction(name, line);
    }
    push(line, kind, true, next, { path, draw, detail });
  }

  try {
    runBlock(program.body, new Scope(), 0);
  } catch (caught) {
    if (caught instanceof StepLimitReached) {
      const max = limits.maxSteps.toLocaleString('en-US');
      error = {
        line: caught.line,
        kind: 'limit',
        zh: `已经执行了 ${max} 步，为了不让浏览器卡住，程序在这里停下了。试着把循环次数改小。`,
        en: `Stopped after ${max} steps so the browser does not freeze. Try smaller loop counts.`,
      };
    } else if (caught instanceof TurtleError) {
      error = { line: caught.line, zh: caught.zh, en: caught.en, kind: 'runtime' };
    } else if (isTooDeep(caught)) {
      error = { line: currentLine, zh: TOO_COMPLEX.zh, en: TOO_COMPLEX.en, kind: 'runtime' };
    } else {
      throw caught;
    }
  }

  return {
    steps,
    lineCounts,
    calls,
    loops,
    executed,
    error,
    initial: { ...INITIAL_TURTLE },
    final: { ...turtle },
  };
}

function describeValueKind(value) {
  if (value && value.kind === 'color') return { zh: `颜色 \`${value.name}\``, en: `the colour \`${value.name}\`` };
  if (value && value.kind === 'function') return { zh: `函数 \`${value.definition.name}\``, en: `the function \`${value.definition.name}\`` };
  return { zh: '别的东西', en: 'something else' };
}

function toNumber(value, name, line) {
  if (typeof value === 'number') return value;
  const got = describeValueKind(value);
  throw runtimeError(line, `\`${name}\` 这里需要一个数字，但得到的是${got.zh}。`, `\`${name}\` needs a number here, but got ${got.en}.`);
}

function arithmetic(value, line) {
  if (typeof value === 'number') return value;
  const got = describeValueKind(value);
  throw runtimeError(line, `只有数字才能做 + - * / 运算，这里是${got.zh}。`, `Only numbers can be used with + - * /, but this is ${got.en}.`);
}

function toColor(value, name, line) {
  if (value && value.kind === 'color') return value.name;
  throw runtimeError(line,
    `\`${name}\` 的第一个值要是颜色，比如 \`${BUILTINS[name].usage}\`。`,
    `The first value of \`${name}\` must be a colour, e.g. \`${BUILTINS[name].usage}\`.`);
}

function nonNegative(value, name, line) {
  if (value >= 0) return value;
  throw runtimeError(line, `\`${name}\` 的大小不能是负数。`, `The size for \`${name}\` cannot be negative.`);
}

function finite(value, line) {
  if (Number.isFinite(value)) return value;
  throw runtimeError(line, '算出来的数不正常（比如除以 0）。', 'The result is not a normal number (for example, division by zero).');
}

function displayValue(value) {
  if (typeof value === 'number') return value;
  if (value && value.kind === 'color') return value.name;
  if (value && value.kind === 'function') return value.definition.name;
  return String(value);
}
