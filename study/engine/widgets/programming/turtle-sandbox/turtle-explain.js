/**
 * Bilingual words for the turtle sandbox: what each step does, what the final counts mean,
 * and token kinds for colouring code like the blocks of the course app. No DOM here.
 * 海龟沙盒的双语文字：每一步在做什么、最后的执行次数说明了什么，以及按课程应用积木颜色给代码着色的词法分类。不涉及 DOM。
 */
import { BUILTINS, colorFamily } from './turtle-language.js';
import { normalizeDegrees } from './turtle-geometry.js';

const COLOR_ZH = Object.freeze({
  black: '黑色', white: '白色', gray: '灰色', red: '红色', orange: '橙色', yellow: '黄色',
  green: '绿色', blue: '蓝色', purple: '紫色', pink: '粉色', brown: '棕色', cyan: '青色',
});

/** Number for display: at most two decimals, thousands separators. 显示用数字：最多两位小数，带千位分隔符。 */
export function formatNumber(value) {
  if (typeof value !== 'number') return String(value);
  const rounded = Math.round(value * 100) / 100;
  return (rounded === 0 ? 0 : rounded).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const times = (count) => (count === 1 ? 'time' : 'times');
const iterationsWord = (count) => (count === 1 ? 'iteration' : 'iterations');
const code = (text) => `\`${text}\``;

function colorWords(name) {
  return { zh: COLOR_ZH[name] || name, en: name };
}

/** Direction words for a heading, or null when it is not a multiple of 90. 朝向的方向词，非 90 度整数倍时为 null。 */
export function headingWords(heading) {
  const names = {
    0: { zh: '向上', en: 'up' },
    90: { zh: '向右', en: 'right' },
    180: { zh: '向下', en: 'down' },
    270: { zh: '向左', en: 'left' },
  };
  return names[normalizeDegrees(Math.round(heading * 100) / 100)] || null;
}

/**
 * Short bilingual description of one executed step, e.g. { zh: '前进 100', en: 'move forward 100' }.
 * 一步执行内容的双语简短描述。
 */
export function describeStep(step) {
  const d = step.detail || {};
  const n = formatNumber;
  switch (step.kind) {
    case 'fd':
      return { zh: `前进 ${n(d.distance)}`, en: `move forward ${n(d.distance)}` };
    case 'bk':
      return { zh: `后退 ${n(d.distance)}`, en: `move back ${n(d.distance)}` };
    case 'rt':
      return { zh: `右转 ${n(d.angle)} 度`, en: `turn right ${n(d.angle)} degrees` };
    case 'lt':
      return { zh: `左转 ${n(d.angle)} 度`, en: `turn left ${n(d.angle)} degrees` };
    case 'arc': {
      const right = d.direction === 'right';
      return {
        zh: `沿半径 ${n(d.radius)} 的圆弧${right ? '右' : '左'}转 ${n(d.angle)} 度`,
        en: `turn ${right ? 'right' : 'left'} ${n(d.angle)} degrees along an arc of radius ${n(d.radius)}`,
      };
    }
    case 'pen': {
      const color = colorWords(d.color);
      const width = d.width === null || d.width === undefined ? null : n(d.width);
      return {
        zh: `换成${color.zh}的笔${width === null ? '' : `，粗细 ${width}`}，落笔`,
        en: `use a ${color.en} pen${width === null ? '' : ` of width ${width}`}, pen down`,
      };
    }
    case 'pu':
      return { zh: '抬笔：接下来移动不画线', en: 'pen up: moves will not draw' };
    case 'pd':
      return { zh: '落笔：接下来移动会画线', en: 'pen down: moves will draw' };
    case 'box': {
      const color = colorWords(d.color);
      return { zh: `画一个${color.zh}方块，边长 ${n(d.size)}`, en: `draw a ${color.en} box of size ${n(d.size)}` };
    }
    case 'dot': {
      const color = colorWords(d.color);
      return { zh: `画一个${color.zh}圆点，直径 ${n(d.size)}`, en: `draw a ${color.en} dot of size ${n(d.size)}` };
    }
    case 'speed':
      return { zh: `把动画速度设为每秒 ${n(d.speed)} 步`, en: `set the animation speed to ${n(d.speed)} steps per second` };
    case 'jumpto':
      return { zh: `跳到 (${n(d.x)}, ${n(d.y)})，不画线`, en: `jump to (${n(d.x)}, ${n(d.y)}) without drawing` };
    case 'moveto':
      return { zh: `走到 (${n(d.x)}, ${n(d.y)})`, en: `move to (${n(d.x)}, ${n(d.y)})` };
    case 'turnto':
      return { zh: `转向 ${n(d.angle)} 度`, en: `turn to face ${n(d.angle)} degrees` };
    case 'home':
      return { zh: '回到起点 (0, 0)，朝上', en: 'go back home to (0, 0), facing up' };
    case 'ht':
      return { zh: '把海龟藏起来', en: 'hide the turtle' };
    case 'st':
      return { zh: '把海龟显示出来', en: 'show the turtle' };
    case 'call': {
      const pairs = (d.params || []).map((param, index) => `${param} = ${n(d.args[index])}`).join(', ');
      return {
        zh: `调用函数 ${code(d.name)}${pairs ? `（${pairs}）` : ''}：去执行它里面的指令`,
        en: `call ${code(d.name)}${pairs ? ` with ${pairs}` : ''}: run the instructions inside it`,
      };
    }
    case 'iterate': {
      const variable = d.variable ? `，${d.variable} = ${n(d.value)}` : '';
      const variableEn = d.variable ? `, ${d.variable} = ${n(d.value)}` : '';
      return {
        zh: `循环第 ${n(d.iteration)} 圈（共 ${n(d.total)} 圈）${variable}`,
        en: `loop iteration ${n(d.iteration)} of ${n(d.total)}${variableEn}`,
      };
    }
    case 'skip':
      return { zh: '这个循环 0 圈：直接跳过', en: 'this loop runs 0 times, so it is skipped' };
    case 'define':
      return {
        zh: `定义函数 ${code(d.name)}：先记住它，里面的指令现在还不执行`,
        en: `define ${code(d.name)}: it is remembered, but nothing inside runs yet`,
      };
    case 'assign':
      return { zh: `把 ${code(d.name)} 设为 ${n(d.value)}`, en: `set ${code(d.name)} to ${n(d.value)}` };
    default:
      return { zh: '执行一条指令', en: 'run an instruction' };
  }
}

// True when a block holds only instructions and each of them ran exactly `passes` times. A nested loop
// is not an instruction and repeats its own body, so it rules the simple sentence out.
// 代码块里只有指令、并且每条都恰好执行了 passes 次时为真。里面套的循环不是指令，还会重复自己的循环体，因此不适用简单的说法。
function runsOncePerPass(statements, counts, passes) {
  return statements.length > 0
    && statements.every((statement) => statement.type !== 'for' && counts[statement.line] === passes);
}

/**
 * Sentences that explain the final counts: the total, each loop, each function.
 * They are derived from the run, so they stay correct after the learner edits the code.
 * 解释最终执行次数的句子：总数、每个循环、每个函数。根据实际运行结果生成，学习者改了代码后依然正确。
 */
export function summarizeRun(program, run) {
  const items = [];
  const counts = run.lineCounts;
  if (run.error) {
    items.push({
      zh: '程序没有正常跑完，下面的数字只算到它停下的地方。',
      en: 'The program stopped early, so these numbers only count what ran before it stopped.',
    });
  }
  const total = run.executed;
  items.push({
    zh: `一共执行了 ${formatNumber(total)} 条指令。每执行一条都要花时间（Every instruction executed costs time.）。`,
    en: `${formatNumber(total)} ${total === 1 ? 'instruction was' : 'instructions were'} executed in total. Every instruction executed costs time.`,
  });

  for (const loop of program.loops) {
    const stats = run.loops.get(loop.line);
    if (!stats) continue;
    const { starts, iterations } = stats;
    const per = stats.minPerStart === stats.maxPerStart ? stats.minPerStart : null;
    let zh;
    let en;
    if (starts === 1) {
      zh = `第 ${loop.line} 行的循环转了 ${formatNumber(iterations)} 圈`;
      en = `The loop on line ${loop.line} made ${formatNumber(iterations)} ${iterationsWord(iterations)}`;
    } else if (per !== null) {
      zh = `第 ${loop.line} 行的循环一共开始了 ${formatNumber(starts)} 次，每次转 ${formatNumber(per)} 圈：${formatNumber(starts)} × ${formatNumber(per)} = ${formatNumber(iterations)} 圈`;
      en = `The loop on line ${loop.line} started ${formatNumber(starts)} times with ${formatNumber(per)} ${iterationsWord(per)} each: ${formatNumber(starts)} × ${formatNumber(per)} = ${formatNumber(iterations)} ${iterationsWord(iterations)}`;
    } else {
      zh = `第 ${loop.line} 行的循环一共开始了 ${formatNumber(starts)} 次，总共转了 ${formatNumber(iterations)} 圈`;
      en = `The loop on line ${loop.line} started ${formatNumber(starts)} times and made ${formatNumber(iterations)} ${iterationsWord(iterations)} in total`;
    }
    const counted = loop.body.filter((statement) => statement.type !== 'define');
    const uniform = iterations > 0 && runsOncePerPass(counted, counts, iterations);
    if (uniform && counted.length === 1) {
      zh += `，所以循环体里那条指令执行了 ${formatNumber(iterations)} 次。`;
      en += `, so the instruction in its body ran ${formatNumber(iterations)} ${times(iterations)}.`;
    } else if (uniform) {
      const product = counted.length * iterations;
      zh += `，所以循环体里的 ${counted.length} 条指令各执行 ${formatNumber(iterations)} 次：${counted.length} × ${formatNumber(iterations)} = ${formatNumber(product)} 次。`;
      en += `, so each of the ${counted.length} instructions in its body ran ${formatNumber(iterations)} ${times(iterations)}: ${counted.length} × ${formatNumber(iterations)} = ${formatNumber(product)}.`;
    } else {
      zh += '。';
      en += '.';
    }
    items.push({ zh, en });
    if (stats.countsDown) {
      items.push({
        zh: `注意：第 ${loop.line} 行的范围是倒着数的。比如 \`[1..0]\` 会数 1、0，转 2 圈（CoffeeScript 的规则）。`,
        en: `Note: the range on line ${loop.line} counts down. For example \`[1..0]\` counts 1, 0, which is 2 iterations (a CoffeeScript rule).`,
      });
    }
  }

  for (const definition of program.definitions) {
    const callCount = run.calls.get(definition.line) || 0;
    const name = code(definition.name);
    if (callCount === 0) {
      // After an error the missing call is the error's fault, not the p.15 lesson, so stay quiet.
      // 出错停下时没调用是错误造成的，不是第 15 页讲的情况，因此不提示。
      if (run.error) continue;
      items.push({
        zh: `函数 ${name} 只定义、没有被调用，所以它里面的指令一次也没有执行（Lecture 2 第 15 页：只定义不调用，海龟什么也不做）。`,
        en: `${name} is defined but never called, so nothing inside it ran (Lecture 2, p.15: with only a definition, nothing happens to the turtle).`,
      });
      continue;
    }
    const counted = definition.statement.body.filter((statement) => statement.type !== 'define');
    const uniform = runsOncePerPass(counted, counts, callCount);
    items.push(uniform
      ? {
        zh: `函数 ${name} 被调用了 ${formatNumber(callCount)} 次，所以它里面的每条指令都执行了 ${formatNumber(callCount)} 次。`,
        en: `${name} was called ${formatNumber(callCount)} ${times(callCount)}, so each instruction inside it ran ${formatNumber(callCount)} ${times(callCount)}.`,
      }
      : {
        zh: `函数 ${name} 被调用了 ${formatNumber(callCount)} 次。`,
        en: `${name} was called ${formatNumber(callCount)} ${times(callCount)}.`,
      });
  }
  return items;
}

const SCAN = /(#.*$)|('[^']*'?|"[^"]*"?)|(\d+(?:\.\d+)?|\.\d+)|([\p{L}_$][\p{L}\p{N}_$]*)|([-=]>)|(\.\.\.?)|(\s+)|([\s\S])/gu;

/**
 * Splits one line of code into coloured segments. Kinds follow the block colours of the course app:
 * "move" (blue), "art" (purple), "func" (green definitions and calls), "control" (orange for-loops),
 * plus "number", "value" (colours), "comment" and "plain". Works on any text, even invalid code.
 * 把一行代码切成带类别的片段，类别对应课程应用的积木颜色：move 蓝、art 紫、func 绿（函数定义与调用）、
 * control 橙（for 循环），另有 number、value（颜色名）、comment、plain。任何文本都能处理，包括写错的代码。
 */
export function highlightLine(text) {
  const segments = [];
  const push = (value, kind) => {
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += value;
    else segments.push({ text: value, kind });
  };
  const source = String(text ?? '');
  const firstWord = /^\s*([\p{L}_$][\p{L}\p{N}_$]*)/u.exec(source);
  const startsWithName = firstWord ? firstWord[1] : null;
  const afterFirst = firstWord ? source.slice(firstWord[0].length) : '';
  const isDefinition = /^\s*=\s*(\(|[-=]>)/.test(afterFirst);
  const isAssignment = !isDefinition && /^\s*=/.test(afterFirst);
  let seenWord = false;

  for (const match of source.matchAll(SCAN)) {
    const [whole, comment, string, number, word, arrow, range] = match;
    if (comment) push(whole, 'comment');
    else if (string) push(whole, 'value');
    else if (number) push(whole, 'number');
    else if (arrow) push(whole, 'func');
    else if (range) push(whole, 'control');
    else if (word) {
      const first = !seenWord;
      seenWord = true;
      const next = source.slice(match.index + whole.length);
      if (word === 'for' || word === 'in') push(whole, 'control');
      else if (Object.hasOwn(BUILTINS, word)) push(whole, BUILTINS[word].group);
      else if (first && word === startsWithName && isDefinition) push(whole, 'func');
      else if (first && word === startsWithName && !isAssignment) push(whole, 'func');
      else if (next.startsWith('(')) push(whole, 'func');
      else if (colorFamily(word)) push(whole, 'value');
      else push(whole, 'plain');
    } else push(whole, 'plain');
  }
  return segments;
}
