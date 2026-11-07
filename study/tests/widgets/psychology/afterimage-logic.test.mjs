import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AFTERIMAGE_PRESETS,
  COLOURS,
  DEFAULT_PRESET,
  DEFAULT_SECONDS,
  DEFAULT_TITLE,
  LECTURE_SECONDS,
  LOOK_SECONDS,
  OPPONENT_PAIRS,
  PARTS,
  PHASES,
  PRESETS,
  SECONDS_LIMITS,
  TEXT,
  advance,
  afterimageShapes,
  announcement,
  blankShapes,
  clampSeconds,
  colourRows,
  createState,
  elapsedSeconds,
  explainNote,
  finishLook,
  goToExplanation,
  instructionText,
  interrupt,
  isRepeatClick,
  lookTimerText,
  normalizeAfterimageConfig,
  opponentOf,
  pairOf,
  pairSourceText,
  phaseAnnouncement,
  phaseAt,
  pictureDescription,
  pictureLabel,
  presetOf,
  progressFraction,
  progressValueText,
  remainingSeconds,
  restart,
  secondsValueText,
  setSeconds,
  simplifiedNote,
  skipStare,
  sliderHint,
  starPoints,
  startStare,
  stepLabel,
  stepOf,
  stimulusShapes,
  toggleExpected,
  wholeSecondsElapsed,
  whySteps,
} from '../../../engine/widgets/psychology/afterimage/afterimage-logic.js';

const bi = (zh, en) => ({ zh, en });
// Validator rules (tools/validate_content.py): no emojis or pictographic symbols and no HTML tags in any text.
// 校验器规则：任何文字里都不能有表情、图形符号或 HTML 标签。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const HTML_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const CJK = /[一-鿿]/u;
// The station writes the textbook's Canadian spelling. 全站使用教材的加拿大拼写。
const US_SPELLING = /\b(color|colors|colored|gray|center|behavior)\b/i;

/** The topmost colour drawn at (x, y): rectangles by area, stars by their inner circle. 点 (x, y) 处最上层的颜色。 */
function colourAt(shapes, x, y) {
  let colour = null;
  for (const shape of shapes) {
    const inside = shape.type === 'star'
      ? Math.hypot(x - shape.cx, y - shape.cy) <= shape.inner
      : x >= shape.x && x < shape.x + shape.width && y >= shape.y && y < shape.y + shape.height;
    if (inside) colour = shape.colour;
  }
  return colour;
}

function bounds(shape) {
  if (shape.type === 'star') {
    return { left: shape.cx - shape.outer, right: shape.cx + shape.outer, top: shape.cy - shape.outer, bottom: shape.cy + shape.outer };
  }
  return { left: shape.x, right: shape.x + shape.width, top: shape.y, bottom: shape.y + shape.height };
}

/* ---------- Config 配置 ---------- */

test('normalizeAfterimageConfig reads the content-spec example as written', () => {
  const title = bi('盯着旗子看', 'Stare at the flag');
  assert.deepEqual(normalizeAfterimageConfig({ title, preset: 'flag', seconds: 20 }),
    { title, preset: 'flag', seconds: 20, adjusted: [] });
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'patches', seconds: 45 }),
    { title: DEFAULT_TITLE, preset: 'patches', seconds: 45, adjusted: [] });
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'flag' }),
    { title: { zh: '负后像', en: 'Negative afterimage' }, preset: 'flag', seconds: 20, adjusted: [] });
});

test('a missing or unusable config gives every default; the missing preset is reported', () => {
  for (const config of [undefined, null, [], 'flag', 42, true, {}, () => ({ preset: 'patches' })]) {
    assert.deepEqual(normalizeAfterimageConfig(config),
      { title: DEFAULT_TITLE, preset: DEFAULT_PRESET, seconds: DEFAULT_SECONDS, adjusted: ['preset'] }, String(config));
  }
  assert.equal(DEFAULT_PRESET, 'flag');
  assert.equal(DEFAULT_SECONDS, 20);
});

test('preset: "flag" and "patches" are read; anything else falls back to the flag', () => {
  assert.deepEqual(AFTERIMAGE_PRESETS, ['flag', 'patches']);
  for (const preset of AFTERIMAGE_PRESETS) {
    const model = normalizeAfterimageConfig({ preset });
    assert.equal(model.preset, preset);
    assert.deepEqual(model.adjusted, []);
  }
  for (const preset of ['Flag', ' flag', 'patch', 'globe', '', null, 0, ['flag'], { id: 'patches' }]) {
    const model = normalizeAfterimageConfig({ preset, seconds: 30 });
    assert.equal(model.preset, 'flag', JSON.stringify(preset));
    assert.deepEqual(model.adjusted, ['preset']);
    assert.equal(model.seconds, 30);
  }
});

test('seconds: every whole number from 5 to 60 is read as written', () => {
  assert.deepEqual(SECONDS_LIMITS, { min: 5, max: 60 });
  for (let seconds = 5; seconds <= 60; seconds += 1) {
    const model = normalizeAfterimageConfig({ preset: 'flag', seconds });
    assert.equal(model.seconds, seconds);
    assert.deepEqual(model.adjusted, []);
  }
});

test('seconds: other numbers are rounded and clamped to 5-60; anything that is not a number gives 20', () => {
  const cases = [[4, 5], [0, 5], [-3, 5], [-0, 5], [61, 60], [100, 60], [1e9, 60], [12.4, 12], [12.5, 13], [4.6, 5], [60.4, 60], [59.6, 60]];
  for (const [given, expected] of cases) {
    const model = normalizeAfterimageConfig({ preset: 'patches', seconds: given });
    assert.equal(model.seconds, expected, String(given));
    assert.deepEqual(model.adjusted, ['seconds'], String(given));
  }
  for (const given of ['30', '', null, true, false, NaN, Infinity, -Infinity, [], {}, [25]]) {
    const model = normalizeAfterimageConfig({ preset: 'patches', seconds: given });
    assert.equal(model.seconds, 20, String(given));
    assert.deepEqual(model.adjusted, ['seconds'], String(given));
  }
  assert.equal(clampSeconds(17), 17);
  assert.equal(clampSeconds(2.2), 5);
  assert.equal(clampSeconds(75), 60);
  assert.equal(clampSeconds('17'), null);
  assert.equal(clampSeconds(NaN), null);
  assert.equal(clampSeconds(undefined), null);
});

test('title: a Bi the validator accepts is read (trimmed); anything else gives the default title', () => {
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'flag', title: bi('  旗子的后像 ', ' The flag afterimage ') }).title,
    bi('旗子的后像', 'The flag afterimage'));
  // Markup the content allows is kept. 内容允许的标记原样保留。
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'flag', title: bi('**负后像**', 'Negative `afterimage`') }).title,
    bi('**负后像**', 'Negative `afterimage`'));
  // The validator only warns about an English title with Chinese in it, so it is read. 校验器对英文里有中文只给警告，所以照常读入。
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'flag', title: bi('后像', 'Afterimage 后像') }).title, bi('后像', 'Afterimage 后像'));
  const rejected = [
    bi('负后像', ''), bi('', 'Negative afterimage'), bi('   ', 'Negative afterimage'), { zh: '负后像' }, { en: 'Negative afterimage' },
    { zh: '负后像', en: 'Negative afterimage', note: 'extra' }, bi('负后像', 42), bi('<b>负后像</b>', 'Negative afterimage'),
    // Pictographs are built from code points, so this file itself contains none. 图形符号用码位生成，本文件自身不含任何图形符号。
    bi('负后像', `Negative afterimage ${String.fromCodePoint(0x1F440)}`), bi(`负后像 ${String.fromCodePoint(0x2605)}`, 'Negative afterimage'),
    bi('**负后像', 'Negative afterimage'),
    bi('负后像', 'Negative `afterimage'), '负后像', ['负后像', 'Negative afterimage'], null, 7,
  ];
  for (const title of rejected) {
    const model = normalizeAfterimageConfig({ preset: 'flag', title });
    assert.deepEqual(model.title, DEFAULT_TITLE, JSON.stringify(title));
    assert.deepEqual(model.adjusted, ['title'], JSON.stringify(title));
  }
  // The default is copied, so changing a model never changes the next one. 默认标题是拷贝，改动一个结果不会影响下一个。
  const first = normalizeAfterimageConfig({ preset: 'flag' });
  first.title.zh = 'changed';
  assert.deepEqual(normalizeAfterimageConfig({ preset: 'flag' }).title, DEFAULT_TITLE);
});

test('several unusable fields are all reported, in field order', () => {
  assert.deepEqual(normalizeAfterimageConfig({ title: 'x', preset: 'x', seconds: 'x' }),
    { title: DEFAULT_TITLE, preset: 'flag', seconds: 20, adjusted: ['title', 'preset', 'seconds'] });
});

test('normalizeAfterimageConfig never throws', () => {
  const throwing = new Proxy({}, { get() { throw new Error('boom'); } });
  assert.deepEqual(normalizeAfterimageConfig(throwing),
    { title: DEFAULT_TITLE, preset: 'flag', seconds: 20, adjusted: ['preset'] });
  const getter = { preset: 'patches' };
  Object.defineProperty(getter, 'seconds', { enumerable: true, get() { throw new Error('boom'); } });
  assert.equal(normalizeAfterimageConfig(getter).seconds, 20);
  assert.doesNotThrow(() => normalizeAfterimageConfig(Object.create(null)));
  assert.equal(normalizeAfterimageConfig(Object.assign(Object.create(null), { preset: 'patches' })).preset, 'patches');
});

test('the reader agrees with the validator: same presets, same 5-60 seconds', () => {
  const source = readFileSync(new URL('../../../tools/validate_content.py', import.meta.url), 'utf8');
  const presets = /AFTERIMAGE_PRESETS = \(([^)]*)\)/.exec(source);
  assert.ok(presets, 'AFTERIMAGE_PRESETS not found in the validator');
  assert.deepEqual([...presets[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]), [...AFTERIMAGE_PRESETS]);
  const seconds = /whole_number\(config\["seconds"\], (\d+), (\d+)\)/.exec(source);
  assert.ok(seconds, 'the seconds check was not found in the validator');
  assert.deepEqual([Number(seconds[1]), Number(seconds[2])], [SECONDS_LIMITS.min, SECONDS_LIMITS.max]);
});

/* ---------- Colours 颜色 ---------- */

test('opponent pairs: red-green and blue-yellow (textbook and lecture), black-white (lecture slide 10 only)', () => {
  assert.deepEqual(OPPONENT_PAIRS.map((pair) => [pair.id, [...pair.colours], [...pair.sources]]), [
    ['red-green', ['red', 'green'], ['textbook', 'lecture']],
    ['blue-yellow', ['blue', 'yellow'], ['textbook', 'lecture']],
    ['black-white', ['black', 'white'], ['lecture']],
  ]);
  assert.equal(pairOf('green').id, 'red-green');
  assert.equal(pairOf('yellow').id, 'blue-yellow');
  assert.equal(pairOf('white').id, 'black-white');
  assert.equal(pairOf('grey'), null);
  assert.equal(pairOf('purple'), null);
  // Only the pair the textbook does not name is tagged in the table. 表格里只给教材没有讲的那一对加标记。
  assert.equal(pairSourceText(pairOf('red')), null);
  assert.equal(pairSourceText(pairOf('yellow')), null);
  assert.deepEqual(pairSourceText(pairOf('black')), bi('只在课件', 'lecture only'));
  assert.equal(pairSourceText(null), null);
});

test('opponentOf swaps the colours of each pair (textbook Figure 4.18), keeps grey and is its own inverse', () => {
  // Figure 4.18: blue appears as yellow, red as green, green as red, yellow as blue. 图 4.18：蓝变黄、红变绿、绿变红、黄变蓝。
  assert.deepEqual(['blue', 'red', 'green', 'yellow'].map(opponentOf), ['yellow', 'green', 'red', 'blue']);
  assert.equal(opponentOf('black'), 'white');
  assert.equal(opponentOf('white'), 'black');
  assert.equal(opponentOf('grey'), 'grey');
  assert.equal(opponentOf('purple'), null);
  assert.equal(opponentOf(undefined), null);
  for (const colour of Object.keys(COLOURS)) assert.equal(opponentOf(opponentOf(colour)), colour);
});

test('every stimulus colour is a 6-digit hex value with a bilingual name; white is pure white', () => {
  for (const [id, colour] of Object.entries(COLOURS)) {
    assert.equal(colour.id, id);
    assert.match(colour.hex, /^#[0-9a-f]{6}$/);
    assert.ok(colour.name.zh && colour.name.en);
  }
  assert.equal(COLOURS.white.hex, '#ffffff');
  assert.equal(COLOURS.black.hex, '#000000');
  assert.ok(Object.isFrozen(COLOURS.red.name));
});

/* ---------- Pictures 图片 ---------- */

test('flag: green and black stripes, a yellow corner with black stars; the dot sits on a green stripe', () => {
  const flag = PRESETS.flag;
  const shapes = stimulusShapes('flag');
  assert.deepEqual([flag.width, flag.height], [360, 216]);
  assert.deepEqual([...new Set(shapes.map((shape) => shape.colour))], ['green', 'black', 'yellow']);
  // Nine stripes, green at the top and the bottom, sampled to the right of the corner. 9 条条纹，最上和最下是绿色（在黄色区域右边取样）。
  for (let stripe = 0; stripe < 9; stripe += 1) {
    assert.equal(colourAt(shapes, 300, stripe * 24 + 12), stripe % 2 === 0 ? 'green' : 'black', `stripe ${stripe}`);
  }
  const corner = shapes.find((shape) => shape.part === 'corner');
  assert.deepEqual([corner.colour, corner.x, corner.y, corner.width, corner.height], ['yellow', 0, 0, 144, 120]);
  assert.equal(colourAt(shapes, 5, 60), 'yellow');
  const stars = shapes.filter((shape) => shape.type === 'star');
  assert.equal(stars.length, 14);
  for (const star of stars) {
    assert.equal(star.colour, 'black');
    assert.equal(colourAt(shapes, star.cx, star.cy), 'black');
    const box = bounds(star);
    assert.ok(box.left >= 0 && box.top >= 0 && box.right <= corner.width && box.bottom <= corner.height, 'star outside the corner');
  }
  // The whole dot lies on the middle (green) stripe and to the right of the corner. 整个黑点都在中间那条绿色条纹上、黄色区域右边。
  const { cx, cy, r } = flag.dot;
  assert.deepEqual([cx, cy], [180, 108]);
  assert.equal(colourAt(shapes, cx, cy), 'green');
  assert.ok(cy - r >= 4 * 24 && cy + r <= 5 * 24);
  assert.ok(cx - r > corner.width);
});

test('flag afterimage: red and white stripes, a blue corner with white stars', () => {
  const shapes = afterimageShapes('flag');
  for (let stripe = 0; stripe < 9; stripe += 1) {
    assert.equal(colourAt(shapes, 300, stripe * 24 + 12), stripe % 2 === 0 ? 'red' : 'white', `stripe ${stripe}`);
  }
  assert.equal(colourAt(shapes, 5, 60), 'blue');
  assert.ok(shapes.filter((shape) => shape.type === 'star').every((star) => star.colour === 'white'));
  // Only the colours change: same shapes, same places. 只换颜色：形状和位置都不变。
  const strip = ({ colour, ...rest }) => rest;
  assert.deepEqual(shapes.map(strip), stimulusShapes('flag').map(strip));
  assert.equal(stimulusShapes('flag')[0].colour, 'green', 'the stimulus must not change');
});

test('patches: six squares and their opponent colours; the dot sits in the grey gap', () => {
  const patches = PRESETS.patches;
  const squares = stimulusShapes('patches').filter((shape) => shape.part === 'square');
  assert.deepEqual(squares.map((shape) => shape.colour), ['green', 'red', 'blue', 'yellow', 'black', 'white']);
  assert.deepEqual(afterimageShapes('patches').filter((shape) => shape.part === 'square').map((shape) => shape.colour),
    ['red', 'green', 'yellow', 'blue', 'white', 'black']);
  assert.equal(afterimageShapes('patches')[0].colour, 'grey');
  const { cx, cy, r } = patches.dot;
  assert.equal(colourAt(stimulusShapes('patches'), cx, cy), 'grey');
  for (const square of squares) {
    const box = bounds(square);
    const apart = cx + r <= box.left || cx - r >= box.right || cy + r <= box.top || cy - r >= box.bottom;
    assert.ok(apart, `the dot touches the ${square.colour} square`);
  }
  // Squares do not overlap. 方块之间不重叠。
  for (let a = 0; a < squares.length; a += 1) {
    for (let b = a + 1; b < squares.length; b += 1) {
      const one = bounds(squares[a]);
      const two = bounds(squares[b]);
      assert.ok(one.right <= two.left || two.right <= one.left || one.bottom <= two.top || two.bottom <= one.top);
    }
  }
});

test('every shape lies inside its viewBox, and the blank field covers the whole picture in white', () => {
  for (const id of AFTERIMAGE_PRESETS) {
    const preset = presetOf(id);
    for (const shape of [...stimulusShapes(id), ...afterimageShapes(id)]) {
      const box = bounds(shape);
      assert.ok(box.left >= 0 && box.top >= 0 && box.right <= preset.width && box.bottom <= preset.height, `${id}: ${JSON.stringify(shape)}`);
      assert.ok(Object.hasOwn(COLOURS, shape.colour) && Object.hasOwn(PARTS, shape.part));
    }
    // The first shape covers the picture, so nothing of the page shows through. 第一个形状铺满整张图，页面底色不会透出来。
    assert.deepEqual(bounds(stimulusShapes(id)[0]), { left: 0, top: 0, right: preset.width, bottom: preset.height });
    assert.deepEqual(blankShapes(id), [{ type: 'rect', part: 'field', colour: 'white', x: 0, y: 0, width: preset.width, height: preset.height }]);
    assert.ok(preset.dot.r >= 4);
  }
});

test('presetOf falls back to the flag for an unknown id', () => {
  assert.equal(presetOf('patches').id, 'patches');
  for (const id of ['globe', undefined, 'toString', '__proto__']) assert.equal(presetOf(id).id, 'flag', String(id));
  assert.deepEqual(stimulusShapes('nope'), stimulusShapes('flag'));
});

test('starPoints draws a five-pointed star whose first tip points straight up', () => {
  const points = starPoints(18, 15, 10, 4).split(' ').map((point) => point.split(',').map(Number));
  assert.equal(points.length, 10);
  assert.deepEqual(points[0], [18, 5]);
  points.forEach(([x, y], index) => {
    const radius = Math.hypot(x - 18, y - 15);
    assert.ok(Math.abs(radius - (index % 2 === 0 ? 10 : 4)) < 0.01, `point ${index}`);
  });
  // Symmetric about the vertical line through the centre. 关于过中心的竖线左右对称。
  assert.ok(Math.abs(points[1][0] - 18 - (18 - points[9][0])) < 0.01);
  assert.equal(starPoints(0, 0, 2, 1, 4).split(' ').length, 8);
});

test('colourRows lists each paired colour once, where it is, its afterimage colour and its pair', () => {
  assert.deepEqual(colourRows('flag').map((row) => [row.colour, row.afterimage, row.where, row.pair.id]), [
    ['green', 'red', bi('条纹', 'stripes'), 'red-green'],
    ['black', 'white', bi('条纹和星星', 'stripes and stars'), 'black-white'],
    ['yellow', 'blue', bi('左上角', 'top-left corner'), 'blue-yellow'],
  ]);
  const patches = colourRows('patches');
  assert.deepEqual(patches.map((row) => [row.colour, row.afterimage]),
    [['green', 'red'], ['red', 'green'], ['blue', 'yellow'], ['yellow', 'blue'], ['black', 'white'], ['white', 'black']]);
  assert.ok(patches.every((row) => row.where.en === 'square' && row.where.zh === '色块'));
  assert.ok(!patches.some((row) => row.colour === 'grey'), 'grey belongs to no pair');
});

test('pictureDescription follows the drawing in both languages', () => {
  assert.deepEqual(pictureDescription('flag'), {
    zh: '一面有绿色和黑色相间横条纹的旗，左上角是黄色的区域，里面有黑色的星星。中间有一个黑点。',
    en: 'A flag with green and black stripes and a yellow top-left corner with black stars. A black dot marks the centre.',
  });
  assert.deepEqual(pictureDescription('flag', 'afterimage'), {
    zh: '后像的简化示意：一面有红色和白色相间横条纹的旗，左上角是蓝色的区域，里面有白色的星星。中间有一个黑点。',
    en: 'Simplified afterimage illustration: a flag with red and white stripes and a blue top-left corner with white stars. A black dot marks the centre.',
  });
  assert.deepEqual(pictureDescription('patches'), {
    zh: '灰色底上有 6 个色块，上排是绿色、红色、蓝色，下排是黄色、黑色、白色。中间有一个黑点。',
    en: 'Colour squares on a grey background, with green, red and blue on top and yellow, black and white below. A black dot marks the centre.',
  });
  assert.deepEqual(pictureDescription('patches', 'afterimage').en,
    'Simplified afterimage illustration: colour squares on a grey background, with red, green and yellow on top and blue, white and black below. A black dot marks the centre.');
  assert.deepEqual(pictureDescription('patches', 'blank'), bi('一块白色区域，中间有一个黑点。', 'A white field. A black dot marks the centre.'));
  assert.equal(pictureLabel('flag', 'blank'), '一块白色区域，中间有一个黑点。 A white field. A black dot marks the centre.');
});

test('the expected afterimage says on screen that it is a simplified illustration', () => {
  for (const id of AFTERIMAGE_PRESETS) {
    const note = simplifiedNote(id);
    assert.match(note.zh, /^简化示意/);
    assert.match(note.en, /^Simplified illustration/);
    // "Briefly": textbook Figure 4.18. “一小会儿”：教材图 4.18。
    assert.match(note.en, /briefly/);
  }
  assert.match(simplifiedNote('patches').en, /grey background belongs to no pair/);
  assert.doesNotMatch(simplifiedNote('flag').en, /grey/);
  assert.deepEqual(TEXT.simplified, bi('简化示意', 'simplified illustration'));
});

/* ---------- Steps and timing 步骤与计时 ---------- */

test('phaseAt: stare for the stare time, then look for 10 seconds, then explain', () => {
  assert.equal(LOOK_SECONDS, 10);
  const cases = [[0, 'stare'], [19.999, 'stare'], [20, 'look'], [29.999, 'look'], [30, 'explain'], [500, 'explain'], [-5, 'stare'], [NaN, 'stare']];
  for (const [elapsed, phase] of cases) assert.equal(phaseAt(elapsed, 20), phase, String(elapsed));
  assert.equal(phaseAt(7, 5, 3), 'look');
  assert.equal(phaseAt(8, 5, 3), 'explain');
  assert.equal(phaseAt(20, 20, 0), 'explain');
  // Unusable durations fall back to 20 s and 10 s. 无效的时长回到 20 秒和 10 秒。
  assert.equal(phaseAt(19, NaN), 'stare');
  assert.equal(phaseAt(25, 0, -1), 'look');
});

test('createState starts at the ready step with a valid stare time; states are frozen', () => {
  assert.deepEqual(createState(), {
    phase: 'ready', seconds: 20, lookSeconds: 10, startedAt: null, stare: 'none', showExpected: false, interrupted: false,
  });
  assert.equal(createState(45).seconds, 45);
  assert.equal(createState(7.6).seconds, 8);
  assert.equal(createState(99).seconds, 60);
  assert.equal(createState('30').seconds, 20);
  assert.ok(Object.isFrozen(createState()));
  assert.ok(Object.isFrozen(startStare(createState(), 0)));
  assert.deepEqual(PHASES, ['ready', 'stare', 'look', 'explain']);
});

test('a full run: Start, the countdown, the white field for 10 seconds, then the explanation', () => {
  const ready = createState(20);
  assert.equal(remainingSeconds(ready, 0), 20);
  const stare = startStare(ready, 1000);
  assert.deepEqual([stare.phase, stare.startedAt, stare.stare], ['stare', 1000, 'partial']);
  assert.equal(advance(stare, 1000), stare);
  assert.equal(advance(stare, 20999), stare);
  // The countdown shows 20 until a whole second has passed, then 19, ... 1. 倒计时先显示 20，满 1 秒后 19……最后 1。
  assert.deepEqual([1000, 1001, 1999, 2000, 20500, 20999].map((now) => remainingSeconds(stare, now)), [20, 20, 20, 19, 1, 1]);
  const look = advance(stare, 21400);
  // The look step starts when the stare ended, not when the tick happened. 看白色区域这一步从盯视结束那一刻算起，而不是从计时器跳动那一刻。
  assert.deepEqual([look.phase, look.startedAt, look.stare], ['look', 21000, 'full']);
  assert.equal(remainingSeconds(look, 21400), 10);
  assert.equal(remainingSeconds(look, 22000), 9);
  assert.equal(advance(look, 30999), look);
  const explain = advance(look, 31000);
  assert.deepEqual([explain.phase, explain.startedAt, explain.stare, explain.showExpected], ['explain', null, 'full', false]);
  assert.equal(remainingSeconds(explain, 40000), 0);
  assert.equal(advance(explain, 99999), explain);
});

test('a long pause (a sleeping laptop) can cross both timed steps in one tick', () => {
  const stare = startStare(createState(15), 0);
  const next = advance(stare, 60000);
  assert.deepEqual([next.phase, next.stare, next.startedAt], ['explain', 'full', null]);
});

test('Skip, Continue and Skip to the explanation', () => {
  const stare = startStare(createState(20), 0);
  const look = skipStare(stare, 5000);
  assert.deepEqual([look.phase, look.startedAt, look.stare], ['look', 5000, 'partial']);
  assert.equal(advance(look, 14999), look);
  assert.equal(advance(look, 15000).phase, 'explain');
  const continued = finishLook(look);
  assert.deepEqual([continued.phase, continued.startedAt, continued.stare], ['explain', null, 'partial']);
  assert.deepEqual(goToExplanation(look), continued);
  const direct = goToExplanation(createState());
  assert.deepEqual([direct.phase, direct.stare], ['explain', 'none']);
  assert.equal(goToExplanation(stare).stare, 'partial');
  assert.equal(goToExplanation(direct), direct);
});

test('a double-click takes one step: its second click is a repeat the step buttons ignore', () => {
  // A single click has detail 1 and a key press on a focused button detail 0: both act.
  // 单击的 detail 为 1，在获得焦点的按钮上按键为 0：两者都照常生效。
  assert.equal(isRepeatClick(1), false);
  assert.equal(isRepeatClick(0), false);
  // Continue appears where Skip was, so the second click of a double-click on Skip must not finish step 2 too.
  // “继续”出现在“跳过”原来的位置，所以双击“跳过”时的第二次点击不能把第 2 步也结束掉。
  assert.equal(isRepeatClick(2), true);
  assert.equal(isRepeatClick(3), true);
  for (const detail of [undefined, null, '2', NaN, -1]) assert.equal(isRepeatClick(detail), false, String(detail));
});

test('transitions act only in their own step and return the same state otherwise', () => {
  const ready = createState(20);
  const stare = startStare(ready, 0);
  const look = skipStare(stare, 1000);
  const explain = finishLook(look);
  assert.equal(startStare(stare, 50), stare);
  assert.equal(startStare(look, 50), look);
  assert.equal(startStare(explain, 50), explain);
  assert.equal(skipStare(ready, 0), ready);
  assert.equal(skipStare(look, 0), look);
  assert.equal(finishLook(stare), stare);
  assert.equal(finishLook(explain), explain);
  assert.equal(toggleExpected(ready), ready);
  assert.equal(toggleExpected(stare), stare);
  assert.equal(interrupt(ready), ready);
  assert.equal(interrupt(look), look);
  assert.equal(interrupt(explain), explain);
  assert.equal(restart(ready), ready);
  assert.equal(setSeconds(stare, 30), stare);
  assert.equal(setSeconds(explain, 30), explain);
  assert.equal(advance(ready, 1e9), ready);
});

test('toggleExpected, restart, interrupt and setSeconds', () => {
  const explain = finishLook(skipStare(startStare(createState(30), 0), 0));
  const shown = toggleExpected(explain);
  assert.equal(shown.showExpected, true);
  assert.equal(toggleExpected(shown).showExpected, false);
  const again = restart(shown);
  assert.deepEqual(again, { ...createState(30), seconds: 30 });
  // The page was hidden mid-stare: back to the ready step, flagged, and Start clears the flag.
  // 盯视中页面被隐藏：回到准备阶段并做标记，再按“开始”时清除标记。
  const stopped = interrupt(startStare(createState(30), 0));
  assert.deepEqual([stopped.phase, stopped.interrupted, stopped.stare, stopped.startedAt, stopped.seconds], ['ready', true, 'none', null, 30]);
  assert.equal(startStare(stopped, 10).interrupted, false);
  assert.equal(restart(stopped).interrupted, false);
  const ready = createState(20);
  assert.equal(setSeconds(ready, 33.4).seconds, 33);
  assert.equal(setSeconds(ready, 100).seconds, 60);
  assert.equal(setSeconds(ready, 2).seconds, 5);
  assert.equal(setSeconds(ready, 20), ready);
  assert.equal(setSeconds(ready, '45'), ready);
  assert.equal(setSeconds(ready, NaN), ready);
  assert.equal(setSeconds(stopped, 12).interrupted, true);
});

test('the clock: elapsed time, whole seconds for the progress bar, and the share of the stare done', () => {
  const ready = createState(20);
  const stare = startStare(ready, 1000);
  assert.equal(elapsedSeconds(ready, 5000), 0);
  assert.equal(elapsedSeconds(stare, 500), 0, 'a clock before the start counts as 0');
  assert.equal(elapsedSeconds(stare, 11700), 10.7);
  assert.equal(wholeSecondsElapsed(ready, 0), 0);
  assert.equal(wholeSecondsElapsed(stare, 11700), 10);
  assert.equal(wholeSecondsElapsed(stare, 99000), 20);
  assert.equal(progressFraction(ready, 0), 0);
  assert.equal(progressFraction(stare, 1000), 0);
  assert.equal(progressFraction(stare, 11000), 0.5);
  assert.ok(Math.abs(progressFraction(stare, 11700) - 0.535) < 1e-9);
  assert.equal(progressFraction(stare, 11700, { stepped: true }), 0.5);
  assert.equal(progressFraction(stare, 99000), 1);
  const look = skipStare(stare, 3000);
  assert.equal(progressFraction(look, 3000), 1);
  assert.equal(wholeSecondsElapsed(look, 3000), 20);
  assert.equal(elapsedSeconds(look, 4500), 1.5);
});

test('stepOf numbers the steps 1, 1, 2, 3', () => {
  assert.deepEqual(PHASES.map(stepOf), [1, 1, 2, 3]);
  assert.equal(stepOf('unknown'), 1);
});

/* ---------- Text 文字 ---------- */

test('step labels, instructions and timer texts', () => {
  assert.deepEqual(stepLabel('ready'), stepLabel('stare'));
  assert.deepEqual(stepLabel('ready'), bi('第 1 步（共 3 步）：盯着黑点', 'Step 1 of 3: Stare at the dot'));
  assert.deepEqual(stepLabel('look'), bi('第 2 步（共 3 步）：看白色区域', 'Step 2 of 3: Look at the white field'));
  assert.deepEqual(stepLabel('explain'), bi('第 3 步（共 3 步）：为什么会这样', 'Step 3 of 3: Why it happens'));
  const ready = instructionText('ready', 25);
  assert.match(ready.zh, /黑点看 25 秒/);
  assert.match(ready.en, /stare at the black dot in the middle for 25 seconds/);
  assert.match(instructionText('stare', 25).en, /^Keep your eyes on the black dot\. After 25 seconds/);
  assert.deepEqual(instructionText('look', 25), bi('继续盯着黑点。你看到了什么颜色？', 'Keep looking at the dot. What colours do you see?'));
  assert.match(instructionText('explain', 25).en, /complementary colours/);
  assert.match(instructionText('ready', 'abc').en, /for 20 seconds/);
  assert.match(instructionText('ready', 90).en, /for 60 seconds/);
  assert.deepEqual(lookTimerText(7), bi('7 秒后显示解释', 'The explanation appears in 7 s'));
  assert.equal(secondsValueText(20), '20 秒 20 seconds');
  assert.equal(progressValueText(5, 20), '已过 5 秒，共 20 秒 5 of 20 seconds');
  assert.deepEqual(sliderHint(), bi(
    '可以在 5–60 秒之间调。课件第 11 张：盯 10 秒，再看白色表面（教材图 4.18 用的是灰色方框，盯“一会儿”）。',
    'Choose from 5 to 60 seconds. Lecture slide 11: stare for 10 seconds, then look at a white surface (textbook Figure 4.18 uses a grey box after a few moments).'));
  assert.equal(LECTURE_SECONDS, 10);
});

test('announcements for every change of step', () => {
  const ready = createState(20);
  const stare = startStare(ready, 0);
  const fullLook = advance(stare, 20000);
  const skippedLook = skipStare(stare, 1000);
  const explain = finishLook(fullLook);
  assert.deepEqual(phaseAnnouncement(ready, stare), bi('开始：盯着黑点看 20 秒。', 'Started: stare at the black dot for 20 seconds.'));
  assert.match(phaseAnnouncement(stare, fullLook).en, /^Time is up\./);
  assert.match(phaseAnnouncement(stare, skippedLook).en, /^Countdown skipped\./);
  assert.deepEqual(phaseAnnouncement(fullLook, explain), announcement('explain'));
  assert.deepEqual(phaseAnnouncement(explain, restart(explain)), announcement('restart'));
  assert.deepEqual(phaseAnnouncement(stare, interrupt(stare)), announcement('interrupted'));
  assert.equal(phaseAnnouncement(explain, toggleExpected(explain)), null);
  assert.equal(phaseAnnouncement(null, ready), null);
  assert.match(announcement('expectedShown').en, /simplified illustration/);
  assert.equal(announcement('expectedHidden').en, 'The illustration is hidden.');
  assert.equal(announcement('nothing'), null);
});

test('whySteps tells the tire-and-rebound story for a colour of the picture', () => {
  const steps = whySteps('green');
  assert.equal(steps.length, 3);
  assert.equal(steps[0].en, 'You stared at green: in the red-green pair, the green side worked the whole time and got tired.');
  assert.equal(steps[1].en, 'On the white field, the tired green side responds less, so the pair rebounds and the red side wins for a moment.');
  assert.equal(steps[2].en, 'So for a moment you see red where the green was: a negative afterimage.');
  // The textbook's own words (p.139): the system seems to "tire" and then "rebounds". 教材原词（第 139 页）：系统好像“累”了，然后“反弹”。
  assert.match(steps[0].zh, /红–绿这一对里.*\*\*tire\*\*/);
  assert.match(steps[1].zh, /\*\*rebound\*\*/);
  assert.match(whySteps('black')[2].en, /you see white where the black was/);
  assert.match(whySteps('yellow')[2].en, /you see blue where the yellow was/);
  assert.deepEqual(whySteps('grey'), []);
});

test('the note on top of step 3 suggests a full run unless the stare was finished', () => {
  const stare = startStare(createState(), 0);
  assert.equal(explainNote(finishLook(advance(stare, 20000))), null);
  assert.deepEqual(explainNote(finishLook(skipStare(stare, 0))), TEXT.partialStare);
  assert.deepEqual(explainNote(goToExplanation(createState())), TEXT.noStare);
  assert.equal(explainNote(null), null);
});

test('the explanation states the textbook and lecture facts', () => {
  const all = (items) => items.map((item) => item.en).join(' ');
  // Textbook p.138: Hering (1878), red-green and blue-yellow, excited by red and inhibited by green.
  // 教材第 138 页：Hering（1878）、红–绿与蓝–黄、被红色激活被绿色抑制。
  assert.match(TEXT.why[0].en, /Ewald Hering's opponent-process theory \(1878\)/);
  assert.match(TEXT.why[0].en, /excited by red and inhibited by green/);
  assert.match(TEXT.why[1].en, /textbook names two pairs: red-green and blue-yellow/);
  // Lecture slide 10: three antagonistic systems. 课件第 10 张：3 个对立系统。
  assert.match(TEXT.why[1].en, /three antagonistic systems: black-white, red-green and blue-yellow/);
  // Course brief: multiple choice follows the textbook, short answers the lecture. 课程简报：选择题按教材，简答题按课件。
  assert.match(TEXT.why[1].en, /Multiple choice follows the textbook; short answers on the lecture can use the three systems/);
  assert.match(TEXT.trichromatic[0].en, /proposed by Thomas Young in 1802 and extended by Hermann von Helmholtz in 1852/);
  assert.match(TEXT.trichromatic[0].en, /three types of cones .* different but overlapping ranges of wavelengths/);
  assert.match(TEXT.trichromatic[1].en, /could not adequately explain afterimages/);
  assert.match(TEXT.trichromatic[1].en, /could not account for negative colour afterimages/);
  // Textbook p.138: red gives a green afterimage, yellow a blue one. 教材第 138 页：红色留下绿色后像，黄色留下蓝色后像。
  assert.match(TEXT.textbookExample.en, /red leaves a green afterimage, and yellow leaves a blue one/);
  // Figure 4.18: especially noticeable with bright colours. 图 4.18：颜色鲜艳时特别明显。
  assert.match(TEXT.textbookExample.en, /especially noticeable with bright colours/);
  // Textbook p.139 and Figure 4.19: both theories are correct. 教材第 139 页与图 4.19：两个理论都对。
  assert.match(TEXT.both.intro.en, /^Both theories are correct.*Figure 4\.19/);
  assert.match(all(TEXT.both.stages.map((stage) => stage.text)), /retinal ganglion cells/);
  assert.match(TEXT.both.stages[1].text.en, /excited by a red cone \(\+\) and inhibited by a green cone \(−\)/);
  assert.match(all(TEXT.exam), /cannot explain negative afterimages/);
  assert.match(all(TEXT.exam), /tires the red-green system, so on a white surface it rebounds and we see red/);
  assert.match(all(TEXT.exam), /the cones form a trichromatic system/);
  // Lecture slide 11 and textbook Figure 4.18. 课件第 11 张与教材图 4.18。
  assert.match(sliderHint().en, /stare for 10 seconds, then look at a white surface \(textbook Figure 4\.18 uses a grey box/);
});

/* ---------- Every string the widget shows 组件显示的每一句话 ---------- */

/** Every bilingual value and every string the widget can show, for both pictures, every step and every event. 组件可能显示的每个双语值和每个字符串。 */
function shownTexts() {
  const values = [TEXT, DEFAULT_TITLE, PARTS, Object.values(COLOURS).map((colour) => colour.name),
    OPPONENT_PAIRS.map((pair) => pair.name), Object.values(PRESETS).map((preset) => preset.name), sliderHint()];
  // Texts written as one string with both languages (aria labels and value texts). 一个字符串里同时写两种语言的文字（无障碍标签与数值说明）。
  const labels = [];
  for (const id of AFTERIMAGE_PRESETS) {
    for (const kind of ['stimulus', 'afterimage', 'blank']) {
      values.push(pictureDescription(id, kind));
      labels.push(pictureLabel(id, kind));
    }
    values.push(simplifiedNote(id), colourRows(id).map((row) => [row.where, row.pair.name, pairSourceText(row.pair)]));
  }
  for (const colour of Object.keys(COLOURS)) values.push(whySteps(colour));
  for (const phase of PHASES) {
    values.push(stepLabel(phase));
    for (const seconds of [5, 20, 60]) values.push(instructionText(phase, seconds));
  }
  for (let left = 0; left <= LOOK_SECONDS; left += 1) values.push(lookTimerText(left));
  const stare = startStare(createState(), 0);
  for (const state of [createState(), stare, advance(stare, 20000), skipStare(stare, 0)]) {
    for (const event of ['start', 'look', 'explain', 'restart', 'interrupted', 'expectedShown', 'expectedHidden']) {
      values.push(announcement(event, state));
    }
  }
  values.push(explainNote(goToExplanation(createState())), explainNote(finishLook(skipStare(stare, 0))));
  for (let seconds = SECONDS_LIMITS.min; seconds <= SECONDS_LIMITS.max; seconds += 1) {
    labels.push(secondsValueText(seconds), progressValueText(seconds - 1, seconds));
  }
  const strings = [...labels];
  const pairs = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      strings.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      if ('zh' in value || 'en' in value) pairs.push(value);
      Object.values(value).forEach(visit);
    }
  };
  visit(values);
  return { pairs, labels, strings };
}

test('every text is bilingual: the Chinese has Chinese characters, the English has none', () => {
  const { pairs, labels } = shownTexts();
  assert.ok(pairs.length > 150, `only ${pairs.length} bilingual values`);
  for (const text of pairs) {
    assert.equal(typeof text.zh, 'string', JSON.stringify(text));
    assert.equal(typeof text.en, 'string', JSON.stringify(text));
    assert.ok(text.zh.trim() && text.en.trim(), `empty half: ${JSON.stringify(text)}`);
    assert.match(text.zh, CJK, `no Chinese in: ${text.zh}`);
    assert.doesNotMatch(text.en, CJK, `Chinese in the English: ${text.en}`);
  }
  // The single-string texts (aria labels) carry both languages. 单个字符串的文字（无障碍标签）同时包含两种语言。
  assert.equal(labels.length, 6 + 2 * (SECONDS_LIMITS.max - SECONDS_LIMITS.min + 1));
  for (const text of labels) {
    assert.match(text, CJK, text);
    assert.match(text, /[A-Za-z]/, text);
  }
});

test('no text the widget shows contains an emoji, an HTML tag, unbalanced markup or US spelling', () => {
  const { pairs, strings } = shownTexts();
  assert.ok(strings.length > 400, `only ${strings.length} strings`);
  for (const text of strings) {
    assert.doesNotMatch(text, EMOJI, text);
    assert.doesNotMatch(text, HTML_TAG, text);
    assert.equal(text.split('**').length % 2, 1, `unbalanced ** in: ${text}`);
    assert.equal(text.split('`').length % 2, 1, `unbalanced \` in: ${text}`);
  }
  for (const text of pairs) assert.doesNotMatch(text.en, US_SPELLING, text.en);
});

test('the fixed texts are frozen, so the view cannot change them by accident', () => {
  assert.ok(Object.isFrozen(TEXT));
  assert.ok(Object.isFrozen(TEXT.buttons.start));
  assert.ok(Object.isFrozen(TEXT.exam));
  assert.ok(Object.isFrozen(PRESETS.flag.shapes[0]));
  assert.ok(Object.isFrozen(OPPONENT_PAIRS[0].colours));
  assert.ok(Object.isFrozen(DEFAULT_TITLE));
});
