/**
 * Example programs of the turtle sandbox, copied from the Lecture 2 slides (and Lab 2, which reuses them),
 * so the learner sees exactly the code that was taught, with the same line numbers.
 * 海龟沙盒的示例程序，照抄 Lecture 2 课件（Lab 2 复用了同样的页面），学习者看到的代码和行号与课上完全一致。
 */

const SQUARE_FUNCTION = [
  'speed 2',
  'pen red',
  'square = () ->',
  '  fd 100',
  '  rt 90',
  '  fd 100',
  '  rt 90',
  '  fd 100',
  '  rt 90',
  '  fd 100',
  '  rt 90',
];

const ROBOT_FUNCTION = [
  'speed 10',
  'draw_robot = () ->',
  '  pen blue',
  '  fd 100',
  '  rt 90',
  '  fd 200',
  '  rt 90',
  '  fd 100',
  '  rt 90',
  '  fd 200',
  '  pu()',
  '  rt 90',
  '  fd 62.5',
  '  rt 90',
  '  fd 37.5',
  '  box green, 25',
  '  fd 125',
  '  box green, 25',
  '  rt 180',
  '  fd 37.5',
  '  lt 90',
  '  fd 25',
  '  pen green, 10',
  '  pd()',
  '  rt 180, 25',
];

export const PRESETS = Object.freeze({
  sequence: {
    title: { zh: '指令从上到下按顺序执行', en: 'Instructions run from top to bottom' },
    source: { zh: '第 9 页', en: 'p.9' },
    code: ['pen blue', 'fd 100', 'rt 90', 'fd 200', 'rt 90', 'fd 100', 'rt 90', 'fd 200'],
  },
  'function-call': {
    title: { zh: '函数定义一次，调用 3 次', en: 'Define a function once, call it 3 times' },
    source: { zh: '第 17 页', en: 'p.17' },
    code: [...ROBOT_FUNCTION, 'draw_robot()', 'pu()', 'fd 100', 'draw_robot()', 'pu()', 'fd 100', 'draw_robot()'],
  },
  'function-param': {
    title: { zh: '一个参数：同一个函数画出两种大小', en: 'One parameter: one function, two sizes' },
    source: { zh: '第 21 页', en: 'p.21' },
    code: [
      'speed 2', 'pen red', 'square = (length) ->',
      '  fd length', '  rt 90', '  fd length', '  rt 90', '  fd length', '  rt 90', '  fd length', '  rt 90',
      'square(100)', 'square(200)',
    ],
  },
  'function-two-params': {
    title: { zh: '两个参数：顺序决定谁是谁', en: 'Two parameters: the order tells us which is which' },
    source: { zh: '第 22 页', en: 'p.22' },
    code: [
      'speed 2', 'pen red', 'rectangle = (length, width) ->',
      '  fd length', '  rt 90', '  fd width', '  rt 90', '  fd length', '  rt 90', '  fd width', '  rt 90',
      'rectangle(100, 200)',
    ],
  },
  loop: {
    title: { zh: '用 for 循环画正方形：转 4 圈', en: 'A for-loop with 4 iterations draws a square' },
    source: { zh: '第 30 页的活动', en: 'p.30 activity' },
    code: ['for [1..4]', '  fd 100', '  rt 90'],
  },
  // The "Loop 3 times" program of p.27 (Lab 2 p.13): 29 lines instead of the 32 of the no-loop version.
  // 第 27 页的 Loop 3 times 程序（Lab 2 第 13 页同一个）：29 行，不用循环的版本是 32 行。
  'loop-robot': {
    title: { zh: '用 for 循环画 3 个机器人', en: 'A for-loop draws the robot 3 times' },
    source: { zh: '第 27 页', en: 'p.27' },
    code: [...ROBOT_FUNCTION, 'for [1..3]', '  draw_robot()', '  pu()', '  fd 100'],
  },
  // p.28 changes one value to get 9 robots and starts lower left so they fit.
  // 第 28 页只改一个数就画 9 个机器人，并先跳到左下角，让它们都放得下。
  'loop-robot-9': {
    title: { zh: '只改一个数：画 9 个机器人', en: 'Change one value: 9 robots' },
    source: { zh: '第 28 页', en: 'p.28' },
    code: [ROBOT_FUNCTION[0], 'jumpto -500, -500', ...ROBOT_FUNCTION.slice(1), 'for [1..9]', '  draw_robot()', '  pu()', '  fd 100'],
  },
  'loop-calls-function': {
    title: { zh: '循环调用 square 10 次', en: 'A loop calls square 10 times' },
    source: { zh: '第 40 页', en: 'p.40' },
    code: [...SQUARE_FUNCTION, 'for count in [1..10]', '  square()'],
  },
  'nested-loop': {
    title: { zh: '循环里面套循环：10 × 10', en: 'A loop inside a loop: 10 × 10' },
    source: { zh: '第 41 页', en: 'p.41' },
    code: [...SQUARE_FUNCTION, 'for count in [1..10]', '  for count in [1..10]', '    square()'],
  },
});

export const PRESET_IDS = Object.freeze(Object.keys(PRESETS));
export const DEFAULT_PRESET = 'sequence';

/**
 * Returns { id, title, source, code } for a preset id (source = slide page in Lecture 2); unknown ids fall back to the sequence example.
 * 返回示例 { id, title, source, code }；未知 id 回退到“按顺序执行”示例。
 */
export function getPreset(id) {
  const key = Object.hasOwn(PRESETS, id) ? id : DEFAULT_PRESET;
  const preset = PRESETS[key];
  return { id: key, title: preset.title, source: preset.source, code: preset.code.join('\n') };
}
