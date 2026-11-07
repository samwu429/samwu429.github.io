/**
 * Negative afterimages and opponent-process theory for the "afterimage" widget: the config reader, the two
 * pictures and their opponent colours, the timing of the three steps (stare, look, explain) and every sentence
 * the widget shows. DOM-free.
 * “afterimage”组件的纯逻辑：负后像与对立过程理论。包括读取配置、两张图及其对立色、三个步骤（盯着看、看白色区域、解释）的
 * 计时，以及组件显示的每一句话；不依赖 DOM。
 *
 * Facts kept here (King & Urbszat 2024, Chapter 4, p.138-139; PSY100 lecture "Sensation and Perception", slides 10-11):
 * - Trichromatic theory: Thomas Young (1802), extended by Hermann von Helmholtz (1852); three types of cones,
 *   sensitive to different but overlapping ranges of wavelengths (red, green, blue). The lecture calls it
 *   Young-Helmholtz and says it could not account for negative colour afterimages; the textbook says Hering
 *   (1878) noticed it could not adequately explain afterimages.
 * - Opponent-process theory (Hering): cells respond to red-green and blue-yellow pairs (textbook); the lecture
 *   lists three antagonistic systems: black-white, red-green, blue-yellow. Staring at red tires the red-green
 *   system, which rebounds when you look away: a green afterimage (p.139). Figure 4.18: blue appears as yellow,
 *   red as green, green as red, yellow as blue; the effect is especially noticeable with bright colours.
 * - Both theories are correct (Figure 4.19): the cones feed retinal ganglion cells that turn the three-colour
 *   code into the opponent code.
 * - How to look: Figure 4.18 gazes "for a few moments" and then at a grey box; lecture slide 11 stares for
 *   10 seconds and then looks at a white surface. The widget uses a white field.
 * 本模块保留的事实（King & Urbszat 2024 第 4 章第 138-139 页；PSY100 讲课“感觉与知觉”第 10-11 张）：
 * - 三色理论：Thomas Young（1802）提出，Hermann von Helmholtz（1852）发展；三种视锥细胞对不同但有重叠的波长范围敏感（红、绿、蓝）。
 *   课件叫它 Young-Helmholtz，并说它解释不了负颜色后像；教材说 Hering（1878）注意到它不能很好地解释后像。
 * - 对立过程理论（Hering）：细胞对红–绿、蓝–黄两对颜色起反应（教材）；课件列出 3 个对立系统：黑–白、红–绿、蓝–黄。
 *   盯着红色看会让红–绿系统“累”，移开视线时它反弹，于是出现绿色后像（第 139 页）。图 4.18：蓝变黄、红变绿、绿变红、黄变蓝；
 *   颜色鲜艳时后像特别明显。
 * - 两个理论都对（图 4.19）：视锥细胞连到视网膜神经节细胞，三色信号被翻译成对立信号。
 * - 怎么看：图 4.18 盯“一会儿”后看灰色方框；课件第 11 张盯 10 秒后看白色表面。本组件用白色区域。
 */

/* ---------- Limits and defaults 上限与默认值 ---------- */

// Config values the content validator accepts (tools/validate_content.py, check_psychology_widget).
// 内容校验器接受的配置取值（tools/validate_content.py 的 check_psychology_widget）。
export const AFTERIMAGE_PRESETS = Object.freeze(['flag', 'patches']);
export const DEFAULT_PRESET = 'flag';
export const SECONDS_LIMITS = Object.freeze({ min: 5, max: 60 });
export const DEFAULT_SECONDS = 20;
export const DEFAULT_TITLE = Object.freeze({ zh: '负后像', en: 'Negative afterimage' });

// Step 2 keeps the white field for about 10 seconds unless the learner presses Continue earlier.
// 第 2 步的白色区域大约停留 10 秒，学习者也可以提前按“继续”。
export const LOOK_SECONDS = 10;
// Lecture slide 11: "Stare at the globe for 10 seconds". 课件第 11 张：盯着地球看 10 秒。
export const LECTURE_SECONDS = 10;

// The steps of the demo: ready and stare are step 1, look is step 2, explain is step 3.
// 演示的阶段：ready 与 stare 属于第 1 步，look 是第 2 步，explain 是第 3 步。
export const PHASES = Object.freeze(['ready', 'stare', 'look', 'explain']);

/** Freezes an object and everything inside it. 冻结对象及其内部的所有对象。 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/* ---------- Colours and opponent pairs 颜色与对立的颜色对 ---------- */

/**
 * The stimulus colours. They are the only colours of the widget that do not come from the design tokens: the demo
 * needs the same bright colours (and a pure white field) in light and dark mode. Bright colours, because the
 * textbook says the effect is especially noticeable with them.
 * 刺激图的颜色。这是组件里唯一不来自设计变量的颜色：演示在浅色和深色模式下都需要同样鲜艳的颜色（以及纯白的区域）。
 * 选鲜艳的颜色，因为教材说颜色鲜艳时后像特别明显。
 */
export const COLOURS = deepFreeze({
  red: { id: 'red', hex: '#e3262f', name: { zh: '红色', en: 'red' } },
  green: { id: 'green', hex: '#00a650', name: { zh: '绿色', en: 'green' } },
  blue: { id: 'blue', hex: '#1d5fd1', name: { zh: '蓝色', en: 'blue' } },
  yellow: { id: 'yellow', hex: '#ffd800', name: { zh: '黄色', en: 'yellow' } },
  black: { id: 'black', hex: '#000000', name: { zh: '黑色', en: 'black' } },
  white: { id: 'white', hex: '#ffffff', name: { zh: '白色', en: 'white' } },
  grey: { id: 'grey', hex: '#9e9e9e', name: { zh: '灰色', en: 'grey' } },
});

/**
 * The opponent pairs. Red-green and blue-yellow are in the textbook and the lecture; black-white is only in the
 * lecture's list of three antagonistic systems (slide 10).
 * 对立的颜色对。红–绿、蓝–黄在教材和课件里都有；黑–白只出现在课件的 3 个对立系统里（第 10 张）。
 */
export const OPPONENT_PAIRS = deepFreeze([
  { id: 'red-green', colours: ['red', 'green'], name: { zh: '红–绿', en: 'red-green' }, sources: ['textbook', 'lecture'] },
  { id: 'blue-yellow', colours: ['blue', 'yellow'], name: { zh: '蓝–黄', en: 'blue-yellow' }, sources: ['textbook', 'lecture'] },
  { id: 'black-white', colours: ['black', 'white'], name: { zh: '黑–白', en: 'black-white' }, sources: ['lecture'] },
]);

// Grey sits in no pair; the simplified drawing keeps it grey. 灰色不属于任何一对，简化示意图里保持灰色。
const NEUTRAL_COLOURS = Object.freeze(['grey']);

/** The opponent pair a colour belongs to, or null. 颜色所属的对立对；不属于任何一对时返回 null。 */
export function pairOf(colour) {
  return OPPONENT_PAIRS.find((pair) => pair.colours.includes(colour)) ?? null;
}

/**
 * The colour on the other side of the pair: green for red, blue for yellow, white for black. Grey stays grey;
 * an unknown colour gives null.
 * 同一对里另一边的颜色：红对绿、黄对蓝、黑对白。灰色保持灰色；不认识的颜色返回 null。
 */
export function opponentOf(colour) {
  const pair = pairOf(colour);
  if (pair) return pair.colours[0] === colour ? pair.colours[1] : pair.colours[0];
  return NEUTRAL_COLOURS.includes(colour) ? colour : null;
}

/* ---------- Pictures 图片 ---------- */

// Names of the parts of the pictures, used by the colour table. 图片各部分的名称，供颜色对照表使用。
export const PARTS = deepFreeze({
  stripes: { zh: '条纹', en: 'stripes' },
  corner: { zh: '左上角', en: 'top-left corner' },
  stars: { zh: '星星', en: 'stars' },
  square: { zh: '色块', en: 'square' },
  board: { zh: '灰色底', en: 'grey background' },
  field: { zh: '白色区域', en: 'white field' },
});

/**
 * Points of a five-pointed star as an SVG "points" string: the first tip is straight above the centre, then the
 * points alternate between the outer and the inner radius.
 * 五角星的 SVG points 字符串：第一个尖角在中心正上方，之后外半径与内半径交替。
 */
export function starPoints(cx, cy, outer, inner, tips = 5) {
  const points = [];
  for (let index = 0; index < tips * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / tips;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${Number(x.toFixed(2))},${Number(y.toFixed(2))}`);
  }
  return points.join(' ');
}

// Flag: 9 stripes of 24 units (green on the outside), a yellow corner over the top 5 stripes and 14 black stars.
// The fixation dot sits on the middle stripe, which is green, to the right of the corner.
// 旗帜：9 条 24 单位高的条纹（最上和最下是绿色），左上角黄色区域盖住上面 5 条，里面 14 颗黑星。
// 注视点在中间那条绿色条纹上、黄色区域的右边。
const FLAG = Object.freeze({ width: 360, height: 216, stripe: 24, stripes: 9, cornerWidth: 144, cornerStripes: 5 });

function flagShapes() {
  const { width, height, stripe, stripes, cornerWidth, cornerStripes } = FLAG;
  // A green background with black stripes on top, so no seam shows between neighbouring stripes.
  // 先铺绿色底，再画黑色条纹，相邻条纹之间不会露出缝。
  const shapes = [{ type: 'rect', part: 'stripes', colour: 'green', x: 0, y: 0, width, height }];
  for (let index = 1; index < stripes; index += 2) {
    shapes.push({ type: 'rect', part: 'stripes', colour: 'black', x: 0, y: index * stripe, width, height: stripe });
  }
  shapes.push({ type: 'rect', part: 'corner', colour: 'yellow', x: 0, y: 0, width: cornerWidth, height: cornerStripes * stripe });
  // Rows of 4 and 3 stars, staggered. 每行 4 颗和 3 颗交错排列。
  const rows = [[18, 54, 90, 126], [36, 72, 108], [18, 54, 90, 126], [36, 72, 108]];
  rows.forEach((columns, row) => {
    for (const cx of columns) shapes.push({ type: 'star', part: 'stars', colour: 'black', cx, cy: 15 + row * 30, outer: 10, inner: 4 });
  });
  return shapes;
}

// Colour patches: six 90-unit squares on a grey board, 30 units apart; the dot sits in the gap in the middle.
// 色块：灰色底上 6 个边长 90 的方块，间隔 30；注视点在正中间的空隙里。
const PATCHES = Object.freeze({
  width: 360,
  height: 240,
  size: 90,
  gap: 30,
  margin: 15,
  rows: [['green', 'red', 'blue'], ['yellow', 'black', 'white']],
});

function patchShapes() {
  const { width, height, size, gap, margin, rows } = PATCHES;
  const shapes = [{ type: 'rect', part: 'board', colour: 'grey', x: 0, y: 0, width, height }];
  rows.forEach((colours, row) => {
    colours.forEach((colour, column) => {
      shapes.push({
        type: 'rect', part: 'square', colour, x: margin + column * (size + gap), y: margin + row * (size + gap), width: size, height: size,
      });
    });
  });
  return shapes;
}

/**
 * The two pictures. Coordinates are in viewBox units; `dot` is the fixation point, drawn black on top.
 * 两张图。坐标是 viewBox 单位；dot 是注视点，最后用黑色画在最上面。
 */
export const PRESETS = deepFreeze({
  flag: {
    id: 'flag',
    name: { zh: '旗帜', en: 'Flag' },
    width: FLAG.width,
    height: FLAG.height,
    dot: { cx: FLAG.width / 2, cy: FLAG.height / 2, r: 6 },
    shapes: flagShapes(),
  },
  patches: {
    id: 'patches',
    name: { zh: '色块', en: 'Colour patches' },
    width: PATCHES.width,
    height: PATCHES.height,
    dot: { cx: PATCHES.width / 2, cy: PATCHES.height / 2, r: 6 },
    shapes: patchShapes(),
  },
});

/** The preset with this id, or the default flag. 指定 id 的预设；没有时返回默认的旗帜。 */
export function presetOf(id) {
  return Object.hasOwn(PRESETS, id) ? PRESETS[id] : PRESETS[DEFAULT_PRESET];
}

/** Shapes of the picture to stare at, in drawing order. 要盯着看的图的形状，按绘制顺序排列。 */
export function stimulusShapes(id) {
  return presetOf(id).shapes;
}

/**
 * The same shapes with every colour swapped for its opponent: the simplified drawing of the expected afterimage.
 * 把每种颜色换成对立色后的同一组形状：预期后像的简化示意图。
 */
export function afterimageShapes(id) {
  return stimulusShapes(id).map((shape) => ({ ...shape, colour: opponentOf(shape.colour) ?? shape.colour }));
}

/** Step 2: a plain white field of the same size as the picture. 第 2 步：和原图一样大的纯白区域。 */
export function blankShapes(id) {
  const preset = presetOf(id);
  return [{ type: 'rect', part: 'field', colour: 'white', x: 0, y: 0, width: preset.width, height: preset.height }];
}

function joinZh(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('、')}和${items[items.length - 1]}`;
}

function joinEn(items) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * One row per colour of the picture that belongs to an opponent pair, in drawing order: where it is, the colour of
 * its afterimage and the pair.
 * 原图里属于某个对立对的每种颜色各占一行，按绘制顺序：在图里的位置、后像的颜色，以及属于哪一对。
 */
export function colourRows(id) {
  const rows = [];
  for (const shape of stimulusShapes(id)) {
    const pair = pairOf(shape.colour);
    if (!pair) continue;
    let row = rows.find((item) => item.colour === shape.colour);
    if (!row) {
      row = { colour: shape.colour, afterimage: opponentOf(shape.colour), pair, parts: [] };
      rows.push(row);
    }
    if (!row.parts.includes(shape.part)) row.parts.push(shape.part);
  }
  return rows.map((row) => ({
    ...row,
    where: { zh: joinZh(row.parts.map((part) => PARTS[part].zh)), en: joinEn(row.parts.map((part) => PARTS[part].en)) },
  }));
}

function capitalise(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const DOT_SENTENCE = Object.freeze({ zh: '中间有一个黑点。', en: 'A black dot marks the centre.' });

/**
 * Text alternative of a picture: the picture to stare at ("stimulus"), the expected afterimage ("afterimage") or
 * the white field of step 2 ("blank"). Built from the shapes, so it always matches the drawing.
 * 图片的文字说明：要盯着看的原图（stimulus）、预期的后像（afterimage）或第 2 步的白色区域（blank）。由形状生成，因此总与图一致。
 */
export function pictureDescription(id, kind = 'stimulus') {
  const preset = presetOf(id);
  if (kind === 'blank') {
    return { zh: `一块白色区域，${DOT_SENTENCE.zh}`, en: `A white field. ${DOT_SENTENCE.en}` };
  }
  const shapes = kind === 'afterimage' ? afterimageShapes(preset.id) : stimulusShapes(preset.id);
  const name = (colour) => COLOURS[colour].name;
  const prefix = kind === 'afterimage'
    ? { zh: '后像的简化示意：', en: 'Simplified afterimage illustration: ' }
    : { zh: '', en: '' };
  let body;
  if (preset.id === 'patches') {
    const squares = shapes.filter((shape) => shape.part === 'square').map((shape) => name(shape.colour));
    const board = name(shapes.find((shape) => shape.part === 'board').colour);
    const top = squares.slice(0, 3);
    const bottom = squares.slice(3);
    body = {
      zh: `${board.zh}底上有 ${squares.length} 个色块，上排是${top.map((item) => item.zh).join('、')}，下排是${bottom.map((item) => item.zh).join('、')}。`,
      en: `colour squares on a ${board.en} background, with ${joinEn(top.map((item) => item.en))} on top and ${joinEn(bottom.map((item) => item.en))} below.`,
    };
  } else {
    const stripes = [...new Set(shapes.filter((shape) => shape.part === 'stripes').map((shape) => shape.colour))].map(name);
    const corner = name(shapes.find((shape) => shape.part === 'corner').colour);
    const star = name(shapes.find((shape) => shape.part === 'stars').colour);
    body = {
      zh: `一面有${stripes.map((item) => item.zh).join('和')}相间横条纹的旗，左上角是${corner.zh}的区域，里面有${star.zh}的星星。`,
      en: `a flag with ${stripes.map((item) => item.en).join(' and ')} stripes and a ${corner.en} top-left corner with ${star.en} stars.`,
    };
  }
  const en = kind === 'afterimage' ? `${prefix.en}${body.en}` : capitalise(body.en);
  return { zh: `${prefix.zh}${body.zh}${DOT_SENTENCE.zh}`, en: `${en} ${DOT_SENTENCE.en}` };
}

/** The same description as one string for an aria-label. 同一段说明合成一个字符串，用作 aria-label。 */
export function pictureLabel(id, kind = 'stimulus') {
  const text = pictureDescription(id, kind);
  return `${text.zh} ${text.en}`;
}

/* ---------- Config 配置 ---------- */

// The validator's text rules: a non-empty string without HTML tags or emojis, with balanced ** and ` markers.
// 校验器的文字规则：非空字符串，不含 HTML 标签和表情符号，** 与 ` 成对出现。
const HTML_TAG = /<\s*\/?\s*[a-zA-Z][^>]*>/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function countOf(text, token) {
  return text.split(token).length - 1;
}

function isCleanText(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (HTML_TAG.test(value) || EMOJI.test(value)) return false;
  return countOf(value, '**') % 2 === 0 && countOf(value, '`') % 2 === 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A title the validator accepts: an object with only zh and en, both clean non-empty strings. Returns the trimmed
 * title, or null.
 * 校验器接受的标题：只有 zh 和 en 两个键，两者都是合规的非空字符串。返回去掉首尾空格的标题，否则返回 null。
 */
function readTitle(value) {
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).some((key) => key !== 'zh' && key !== 'en')) return null;
  if (!isCleanText(value.zh) || !isCleanText(value.en)) return null;
  return { zh: value.zh.trim(), en: value.en.trim() };
}

/**
 * A stare time in whole seconds within 5-60: numbers are rounded and clamped; anything that is not a finite
 * number gives null.
 * 以整秒计的盯视时间，范围 5-60：数字四舍五入后限制在范围内；不是有限数字时返回 null。
 */
export function clampSeconds(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(SECONDS_LIMITS.max, Math.max(SECONDS_LIMITS.min, Math.round(value)));
}

/**
 * Reads the widget config: { title: Bi, preset: "flag" | "patches", seconds: whole number 5-60 }. Everything the
 * validator accepts is read as written; anything else falls back to the default (title 负后像 / Negative
 * afterimage, preset "flag", 20 seconds), except that a number of seconds outside 5-60 or with decimals is rounded
 * and clamped. `adjusted` lists the keys whose value was not used as written (a missing preset counts, because the
 * validator requires it). Never throws.
 * 读取组件配置：{ title: 双语, preset: "flag" | "patches", seconds: 5-60 的整数 }。校验器接受的一律原样读入；其余的回到默认值
 * （标题“负后像 / Negative afterimage”、预设 flag、20 秒），只有超出 5-60 或带小数的秒数会四舍五入并限制在范围内。
 * adjusted 列出没有按原样使用的键（缺少 preset 也算，因为校验器要求它）。不会抛出异常。
 */
export function normalizeAfterimageConfig(config) {
  const model = { title: { ...DEFAULT_TITLE }, preset: DEFAULT_PRESET, seconds: DEFAULT_SECONDS, adjusted: [] };
  try {
    const source = isPlainObject(config) ? config : {};
    if (source.title !== undefined) {
      const title = readTitle(source.title);
      if (title) model.title = title;
      else model.adjusted.push('title');
    }
    if (AFTERIMAGE_PRESETS.includes(source.preset)) model.preset = source.preset;
    else model.adjusted.push('preset');
    if (source.seconds !== undefined) {
      const seconds = clampSeconds(source.seconds);
      if (seconds !== null) model.seconds = seconds;
      if (seconds === null || seconds !== source.seconds) model.adjusted.push('seconds');
    }
    return model;
  } catch {
    // A config that throws when read (it never comes from JSON) shows the defaults.
    // 读取时会抛出异常的配置（JSON 里不会出现）显示默认值。
    return { title: { ...DEFAULT_TITLE }, preset: DEFAULT_PRESET, seconds: DEFAULT_SECONDS, adjusted: ['preset'] };
  }
}

/* ---------- Steps and timing 步骤与计时 ---------- */

/**
 * The phase of an uninterrupted run, `elapsedSeconds` after Start: "stare" for the first `stareSeconds`, then
 * "look" for `lookSeconds`, then "explain". A negative or missing time counts as 0.
 * 不被打断时，按“开始”`elapsedSeconds` 秒后所处的阶段：前 stareSeconds 秒是 stare，接着 lookSeconds 秒是 look，之后是 explain。
 * 负数或无效的时间按 0 处理。
 */
export function phaseAt(elapsedSeconds, stareSeconds, lookSeconds = LOOK_SECONDS) {
  const elapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  const stare = Number.isFinite(stareSeconds) && stareSeconds > 0 ? stareSeconds : DEFAULT_SECONDS;
  const look = Number.isFinite(lookSeconds) && lookSeconds >= 0 ? lookSeconds : LOOK_SECONDS;
  if (elapsed < stare) return 'stare';
  if (elapsed < stare + look) return 'look';
  return 'explain';
}

/** Step number shown to the learner: 1, 1, 2, 3. 显示给学习者的步骤号：1、1、2、3。 */
export function stepOf(phase) {
  return { ready: 1, stare: 1, look: 2, explain: 3 }[phase] ?? 1;
}

/**
 * The state of the demo. `startedAt` (milliseconds) is when the current timed phase began; `stare` records how much
 * of the stare was done ("none", "partial" or "full") so the explanation can suggest a full run.
 * 演示的状态。startedAt（毫秒）是当前计时阶段开始的时刻；stare 记录盯视完成了多少（none、partial 或 full），
 * 解释部分据此建议完整做一遍。
 */
export function createState(seconds = DEFAULT_SECONDS) {
  return Object.freeze({
    phase: 'ready',
    seconds: clampSeconds(seconds) ?? DEFAULT_SECONDS,
    lookSeconds: LOOK_SECONDS,
    startedAt: null,
    stare: 'none',
    showExpected: false,
    interrupted: false,
  });
}

function update(state, changes) {
  return Object.freeze({ ...state, ...changes });
}

function timeOf(now) {
  return Number.isFinite(now) ? now : 0;
}

/** Start (step 1): the countdown begins at `now`. Only from the ready step. 开始（第 1 步）：从 now 起倒计时；只能在准备阶段使用。 */
export function startStare(state, now) {
  if (state.phase !== 'ready') return state;
  return update(state, { phase: 'stare', startedAt: timeOf(now), stare: 'partial', showExpected: false, interrupted: false });
}

/** Skip: the white field of step 2 appears before the countdown ends. 跳过：倒计时结束前就换成第 2 步的白色区域。 */
export function skipStare(state, now) {
  if (state.phase !== 'stare') return state;
  return update(state, { phase: 'look', startedAt: timeOf(now) });
}

/** Continue: from the white field to the explanation (step 3). 继续：从白色区域进入解释（第 3 步）。 */
export function finishLook(state) {
  if (state.phase !== 'look') return state;
  return update(state, { phase: 'explain', startedAt: null });
}

/**
 * "Skip to the explanation": straight to step 3 from step 1 (for a learner who cannot or does not want to do the
 * demo); from step 2 it is the same as Continue.
 * “直接看解释”：从第 1 步直接到第 3 步（给不能或不想做演示的学习者）；在第 2 步时等同于“继续”。
 */
export function goToExplanation(state) {
  if (state.phase === 'explain') return state;
  if (state.phase === 'look') return finishLook(state);
  return update(state, { phase: 'explain', startedAt: null, interrupted: false });
}

/**
 * The timer tick: moves on when the current phase has run its time. A long pause (a sleeping laptop) can cross both
 * timed phases at once. Returns the same state object when nothing changes.
 * 计时器每一跳：当前阶段时间到了就进入下一阶段。长时间暂停（笔记本休眠）可能一次跨过两个计时阶段。没有变化时返回同一个状态对象。
 */
export function advance(state, now) {
  const time = timeOf(now);
  if (state.phase === 'stare') {
    const phase = phaseAt((time - state.startedAt) / 1000, state.seconds, state.lookSeconds);
    if (phase === 'stare') return state;
    if (phase === 'look') return update(state, { phase: 'look', startedAt: state.startedAt + state.seconds * 1000, stare: 'full' });
    return update(state, { phase: 'explain', startedAt: null, stare: 'full' });
  }
  if (state.phase === 'look') {
    if ((time - state.startedAt) / 1000 < state.lookSeconds) return state;
    return update(state, { phase: 'explain', startedAt: null });
  }
  return state;
}

/**
 * The page was hidden during the stare: the stare no longer counts, so the demo goes back to the ready step.
 * 盯视期间页面被隐藏：这次盯视不再有效，演示回到准备阶段。
 */
export function interrupt(state) {
  if (state.phase !== 'stare') return state;
  return update(state, { phase: 'ready', startedAt: null, stare: 'none', interrupted: true });
}

/** Restart: back to the ready step, keeping the chosen stare time. 再做一次：回到准备阶段，保留选好的盯视时间。 */
export function restart(state) {
  if (state.phase === 'ready' && !state.interrupted) return state;
  return update(state, { phase: 'ready', startedAt: null, stare: 'none', showExpected: false, interrupted: false });
}

/** Shows or hides the expected afterimage in step 3. 在第 3 步显示或隐藏预期的后像。 */
export function toggleExpected(state) {
  if (state.phase !== 'explain') return state;
  return update(state, { showExpected: !state.showExpected });
}

/** Changes the stare time before Start (rounded and clamped to 5-60). 开始前修改盯视时间（四舍五入并限制在 5-60）。 */
export function setSeconds(state, value) {
  if (state.phase !== 'ready') return state;
  const seconds = clampSeconds(value);
  if (seconds === null || seconds === state.seconds) return state;
  return update(state, { seconds });
}

/**
 * True for the second (or a later) click of a double-click, from the click event's `detail` (1 for a single
 * click, 0 when the keyboard pressed the button). A step change puts the next step's button about where the old
 * one was (Continue appears where Skip was), so the step buttons ignore such a click: one double-click never takes
 * two steps, and the white field of step 2 is never skipped by accident.
 * 根据 click 事件的 detail（单击为 1，键盘按下按钮时为 0）判断这是不是双击中的第二次（或之后的）点击。步骤切换会把下一步的
 * 按钮放到差不多原来的位置（“继续”出现在“跳过”原来的地方），所以步骤按钮忽略这种点击：一次双击不会连走两步，
 * 第 2 步的白色区域也不会被意外跳过。
 */
export function isRepeatClick(detail) {
  return typeof detail === 'number' && detail > 1;
}

/** Seconds since the current timed phase began (0 outside stare and look). 当前计时阶段已经过的秒数（stare 与 look 之外为 0）。 */
export function elapsedSeconds(state, now) {
  if ((state.phase !== 'stare' && state.phase !== 'look') || !Number.isFinite(state.startedAt)) return 0;
  return Math.max(0, (timeOf(now) - state.startedAt) / 1000);
}

/** Whole seconds of the stare already done, for the progress bar (0 to the stare time). 已经盯了的整秒数，供进度条使用。 */
export function wholeSecondsElapsed(state, now) {
  if (state.phase === 'ready') return 0;
  if (state.phase !== 'stare') return state.seconds;
  return Math.min(state.seconds, Math.floor(elapsedSeconds(state, now)));
}

/**
 * Whole seconds left in the current timed phase, rounded up so the countdown shows 20, 19, ... 1. The ready step
 * shows the full stare time; step 3 has none left.
 * 当前计时阶段剩下的整秒数，向上取整，所以倒计时显示 20、19……1。准备阶段显示完整的盯视时间；第 3 步没有剩余时间。
 */
export function remainingSeconds(state, now) {
  if (state.phase === 'ready') return state.seconds;
  if (state.phase === 'explain') return 0;
  const total = state.phase === 'stare' ? state.seconds : state.lookSeconds;
  return Math.min(total, Math.max(0, Math.ceil(total - elapsedSeconds(state, now))));
}

/**
 * Share of the stare done, 0 to 1. `stepped` moves in whole seconds only, for learners who prefer reduced motion.
 * 已完成的盯视比例（0 到 1）。stepped 时只按整秒变化，给偏好减少动态效果的学习者。
 */
export function progressFraction(state, now, { stepped = false } = {}) {
  if (state.phase === 'ready') return 0;
  if (state.phase !== 'stare') return 1;
  const elapsed = elapsedSeconds(state, now);
  return Math.min(1, Math.max(0, (stepped ? Math.floor(elapsed) : elapsed) / state.seconds));
}

/* ---------- Text 文字 ---------- */

/**
 * Every fixed string of the widget, Chinese and English. English uses the textbook's terms and Canadian spelling.
 * 组件里所有固定的中英文文字。英文用教材的术语和加拿大拼写。
 */
export const TEXT = deepFreeze({
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  intro: {
    zh: '先盯着一张彩色图里的黑点看一会儿，再看一块白色区域，你会看到颜色“反过来”的图：这叫负后像（**negative afterimage**）。先亲眼看一次，再看为什么。',
    en: 'Stare at the dot in a coloured picture for a while, then look at a white field: you will see the picture in its complementary colours. This is a negative afterimage. Try it first, then read why it happens.',
  },
  buttons: {
    start: { zh: '开始', en: 'Start' },
    explainOnly: { zh: '直接看解释', en: 'Skip to the explanation' },
    skip: { zh: '跳过倒计时', en: 'Skip' },
    continue: { zh: '继续', en: 'Continue' },
    showExpected: { zh: '显示应该看到的后像', en: 'Show what you should have seen' },
    hideExpected: { zh: '隐藏后像示意图', en: 'Hide the illustration' },
    restart: { zh: '再做一次', en: 'Restart' },
  },
  stareTime: { zh: '盯的时间', en: 'Stare time' },
  timeLeft: { zh: '还剩', en: 'Time left' },
  secondsUnit: { zh: '秒', en: 's' },
  progressLabel: { zh: '盯的进度', en: 'Stare progress' },
  captions: {
    stared: { zh: '要盯着看的原图', en: 'The picture to stare at' },
    expected: { zh: '你应该看到的后像', en: 'What you should have seen' },
  },
  simplified: { zh: '简化示意', en: 'simplified illustration' },
  interrupted: {
    zh: '你离开了这个页面，倒计时已经停下。准备好以后再按“开始”。',
    en: 'You left the page, so the countdown stopped. Press Start again when you are ready.',
  },
  partialStare: {
    zh: '你没有盯满时间。教材说，要盯得足够久，后像才会出现。可以按“再做一次”，完整做一遍。',
    en: 'You did not stare for the full time. The textbook says you have to look long enough for an afterimage to appear. Press Restart to do the full version.',
  },
  noStare: {
    zh: '你直接跳到了解释。想亲眼看看后像，可以按“再做一次”，从第 1 步开始。',
    en: 'You went straight to the explanation. To see an afterimage yourself, press Restart and begin at step 1.',
  },
  headings: {
    colours: { zh: '哪种颜色变成了哪种', en: 'Which colour turns into which' },
    why: { zh: '为什么？对立过程理论', en: 'Why? Opponent-process theory' },
    trichromatic: { zh: '只靠三色理论为什么不够', en: 'Why the trichromatic theory is not enough' },
    both: { zh: '两个理论都对', en: 'Both theories are correct' },
    exam: { zh: '考试这样写', en: 'Write it like this' },
  },
  table: {
    caption: { zh: '原图的颜色和后像的颜色对照', en: 'Colours of the picture and of the afterimage' },
    stared: { zh: '原图', en: 'Picture' },
    afterimage: { zh: '后像', en: 'Afterimage' },
    pair: { zh: '对立的一对', en: 'Opponent pair' },
  },
  // Shown in the table next to a pair the textbook does not name (black-white). 表格里标在教材没有讲的那一对（黑–白）旁边。
  lectureOnly: { zh: '只在课件', en: 'lecture only' },
  why: [
    {
      zh: '**Ewald Hering**（赫林，1878）的对立过程理论（**opponent-process theory**）：视觉系统里处理颜色的细胞成对工作，一对里的两种颜色互相对立。比如一个细胞被红色激活、被绿色抑制。',
      en: 'Ewald Hering\'s opponent-process theory (1878): colour cells in the visual system work in opposing pairs. For example, a cell might be excited by red and inhibited by green.',
    },
    {
      zh: '教材讲两对：红–绿、蓝–黄。课件第 10 张讲 3 个对立系统（**antagonistic systems**）：黑–白、红–绿、蓝–黄。选择题按教材的两对；课件内容的简答题可以写 3 个系统。',
      en: 'The textbook names two pairs: red-green and blue-yellow. The lecture (slide 10) lists three antagonistic systems: black-white, red-green and blue-yellow. Multiple choice follows the textbook; short answers on the lecture can use the three systems.',
    },
  ],
  textbookExample: {
    zh: '教材的例子：盯红色，后像是绿色；盯黄色，后像是蓝色。颜色鲜艳时，后像特别明显。',
    en: 'The textbook\'s examples: red leaves a green afterimage, and yellow leaves a blue one. The effect is especially noticeable with bright colours.',
  },
  trichromatic: [
    {
      zh: '三色理论（**trichromatic theory**，**Thomas Young** 1802 年提出，**Hermann von Helmholtz** 1852 年发展，课件叫 **Young-Helmholtz**）：视网膜上有三种视锥细胞（**cones**），分别对不同但有重叠的波长范围敏感（红、绿、蓝），颜色由三者反应的比例决定。',
      en: 'The trichromatic theory (proposed by Thomas Young in 1802 and extended by Hermann von Helmholtz in 1852; the lecture calls it Young-Helmholtz): three types of cones in the retina are sensitive to different but overlapping ranges of wavelengths (red, green, blue), and colour comes from how strongly each responds.',
    },
    {
      zh: '但它解释不了后像：**Hering** 注意到了这一点，课件第 10 张也说它解释不了负颜色后像。',
      en: 'But it could not adequately explain afterimages. Hering noticed this, and the lecture (slide 10) says it could not account for negative colour afterimages.',
    },
  ],
  both: {
    intro: {
      zh: '两个理论都对，它们讲的是两个阶段（教材图 4.19）：',
      en: 'Both theories are correct; they describe two stages (textbook Figure 4.19):',
    },
    stages: [
      {
        title: { zh: '第一站：视锥细胞', en: 'Stage 1: cones' },
        text: {
          zh: '视网膜上的三种视锥细胞（红、绿、蓝）接收光：这是三色理论。',
          en: 'The three kinds of cones in the retina (red, green, blue) take in the light: the trichromatic theory.',
        },
      },
      {
        title: { zh: '第二站：视网膜神经节细胞', en: 'Stage 2: retinal ganglion cells' },
        text: {
          zh: '视锥细胞连到视网膜神经节细胞（**retinal ganglion cells**），三色信号马上变成对立信号，例如被红视锥兴奋（+）、被绿视锥抑制（−）：这是对立过程理论。',
          en: 'The cones connect to retinal ganglion cells, which turn the three-colour signal into opponent signals, for example excited by a red cone (+) and inhibited by a green cone (−): opponent-process theory.',
        },
      },
    ],
  },
  exam: [
    {
      en: 'An afterimage is a sensation that remains after a stimulus is removed. In a negative afterimage we see the complementary colour: staring at green leaves a red afterimage.',
      zh: '后像是刺激拿走以后还留下的感觉。负后像里看到的是互补色：盯着绿色看，会留下红色的后像。',
    },
    {
      en: 'Opponent-process theory explains negative afterimages: staring at green tires the red-green system, so on a white surface it rebounds and we see red.',
      zh: '对立过程理论能解释负后像：盯着绿色看让红–绿系统“累”了，看白色表面时它反弹，我们就看到红色。',
    },
    {
      en: 'The trichromatic (Young-Helmholtz) theory cannot explain negative afterimages.',
      zh: '三色理论（Young-Helmholtz）解释不了负后像。',
    },
    {
      en: 'Both theories are correct: the cones form a trichromatic system, and the retinal ganglion cells work in opponent pairs.',
      zh: '两个理论都对：视锥细胞组成三色系统，视网膜神经节细胞按对立的颜色对工作。',
    },
  ],
});

/** Step label above the instruction. 指示语上方的步骤标签。 */
export function stepLabel(phase) {
  if (phase === 'look') return { zh: '第 2 步（共 3 步）：看白色区域', en: 'Step 2 of 3: Look at the white field' };
  if (phase === 'explain') return { zh: '第 3 步（共 3 步）：为什么会这样', en: 'Step 3 of 3: Why it happens' };
  return { zh: '第 1 步（共 3 步）：盯着黑点', en: 'Step 1 of 3: Stare at the dot' };
}

/** What the learner should do now. 学习者现在要做什么。 */
export function instructionText(phase, seconds) {
  const n = clampSeconds(seconds) ?? DEFAULT_SECONDS;
  if (phase === 'stare') {
    return {
      zh: `一直盯着黑点，眼睛不要动。${n} 秒后图会变成白色区域。`,
      en: `Keep your eyes on the black dot. After ${n} seconds the picture turns into a white field.`,
    };
  }
  if (phase === 'look') {
    return { zh: '继续盯着黑点。你看到了什么颜色？', en: 'Keep looking at the dot. What colours do you see?' };
  }
  if (phase === 'explain') {
    return {
      zh: '在白色区域里，原图的每种颜色会短暂地变成它的对立色（教材叫互补色 **complementary colours**）。下面看为什么。',
      en: 'On the white field, each colour of the picture briefly turns into its opponent colour (the textbook calls them complementary colours). Here is why.',
    };
  }
  return {
    zh: `按“开始”，然后盯着图中间的黑点看 ${n} 秒，眼睛尽量不要动。时间到了，图会变成一块白色区域，继续看那个点。`,
    en: `Press Start, then stare at the black dot in the middle for ${n} seconds. Try not to move your eyes. When the time is up, the picture turns into a white field: keep looking at the dot.`,
  };
}

/** aria-valuetext of the stare-time slider. 盯视时间滑块的 aria-valuetext。 */
export function secondsValueText(seconds) {
  return `${seconds} 秒 ${seconds} seconds`;
}

/** aria-valuetext of the countdown progress bar. 倒计时进度条的 aria-valuetext。 */
export function progressValueText(elapsed, total) {
  return `已过 ${elapsed} 秒，共 ${total} 秒 ${elapsed} of ${total} seconds`;
}

/** The quiet timer of step 2. 第 2 步不打扰的计时说明。 */
export function lookTimerText(remaining) {
  return { zh: `${remaining} 秒后显示解释`, en: `The explanation appears in ${remaining} s` };
}

/**
 * Hint under the stare-time slider, with how the lecture and the textbook run the demo.
 * 盯视时间滑块下面的提示，并说明课件和教材各自怎么做这个演示。
 */
export function sliderHint() {
  return {
    zh: `可以在 ${SECONDS_LIMITS.min}–${SECONDS_LIMITS.max} 秒之间调。课件第 11 张：盯 ${LECTURE_SECONDS} 秒，再看白色表面（教材图 4.18 用的是灰色方框，盯“一会儿”）。`,
    en: `Choose from ${SECONDS_LIMITS.min} to ${SECONDS_LIMITS.max} seconds. Lecture slide 11: stare for ${LECTURE_SECONDS} seconds, then look at a white surface (textbook Figure 4.18 uses a grey box after a few moments).`,
  };
}

/**
 * "lecture only" for a pair the textbook does not name (black-white), otherwise null.
 * 教材没有讲的那一对（黑–白）返回“只在课件”，其余返回 null。
 */
export function pairSourceText(pair) {
  return pair && !pair.sources.includes('textbook') ? TEXT.lectureOnly : null;
}

/**
 * Says on screen that the expected afterimage is drawn by a simple rule, not taken from real data.
 * 在屏幕上说明：预期后像是按简单规则画的，不是真实数据。
 */
export function simplifiedNote(id) {
  const note = {
    zh: '简化示意：按“每种颜色换成它的对立色”这一条简单规则画出来。真实的后像只出现一小会儿，看起来也不会和这张图一模一样。',
    en: 'Simplified illustration, drawn by one simple rule: each colour is swapped for its opponent colour. A real afterimage appears only briefly and will not look exactly like this drawing.',
  };
  if (presetOf(id).shapes.some((shape) => NEUTRAL_COLOURS.includes(shape.colour))) {
    note.zh += '灰色底不属于任何一对，所以保持灰色。';
    note.en += ' The grey background belongs to no pair, so it stays grey.';
  }
  return note;
}

/**
 * The tire-and-rebound story for one colour of the picture, in three steps. Empty for a colour in no pair.
 * 针对原图里的一种颜色，分三步讲“累了、反弹”的过程。不属于任何一对的颜色返回空列表。
 */
export function whySteps(colour) {
  const pair = pairOf(colour);
  if (!pair) return [];
  const own = COLOURS[colour].name;
  const other = COLOURS[opponentOf(colour)].name;
  return [
    {
      zh: `你盯着${own.zh}看：${pair.name.zh}这一对里，${own.zh}那一边一直在工作，“累”了（**tire**）。`,
      en: `You stared at ${own.en}: in the ${pair.name.en} pair, the ${own.en} side worked the whole time and got tired.`,
    },
    {
      zh: `换成白色区域后，累了的${own.zh}那一边反应变弱，这一对“反弹”（**rebound**），${other.zh}那一边暂时占了上风。`,
      en: `On the white field, the tired ${own.en} side responds less, so the pair rebounds and the ${other.en} side wins for a moment.`,
    },
    {
      zh: `所以原来${own.zh}的地方，你会短暂地看到${other.zh}：这就是负后像。`,
      en: `So for a moment you see ${other.en} where the ${own.en} was: a negative afterimage.`,
    },
  ];
}

/**
 * The note at the top of step 3: null after a full stare, otherwise a suggestion to do the full run.
 * 第 3 步顶部的提示：完整盯满时为 null，否则建议完整做一遍。
 */
export function explainNote(state) {
  if (!state || state.stare === 'full') return null;
  return state.stare === 'partial' ? TEXT.partialStare : TEXT.noStare;
}

/**
 * What the live region says after a change: "start", "look", "explain", "restart", "interrupted",
 * "expectedShown" or "expectedHidden". "look" names a skipped countdown when the stare was not finished.
 * 变化之后朗读区域要说的话：start、look、explain、restart、interrupted、expectedShown 或 expectedHidden。
 * 盯视没有完成时，look 会说明倒计时被跳过。
 */
export function announcement(event, state = createState()) {
  const n = state.seconds;
  switch (event) {
    case 'start':
      return { zh: `开始：盯着黑点看 ${n} 秒。`, en: `Started: stare at the black dot for ${n} seconds.` };
    case 'look':
      return state.stare === 'full'
        ? {
          zh: '时间到。图已经换成白色区域，继续盯着黑点：你看到了什么颜色？',
          en: 'Time is up. The picture is now a white field. Keep looking at the dot: what colours do you see?',
        }
        : {
          zh: '已跳过倒计时。图已经换成白色区域，继续盯着黑点：你看到了什么颜色？',
          en: 'Countdown skipped. The picture is now a white field. Keep looking at the dot: what colours do you see?',
        };
    case 'explain':
      return { zh: '第 3 步：下面是解释。', en: 'Step 3: the explanation is below.' };
    case 'restart':
      return { zh: '回到第 1 步。准备好以后按“开始”。', en: 'Back to step 1. Press Start when you are ready.' };
    case 'interrupted':
      return { zh: '你离开了页面，倒计时已经停下。', en: 'You left the page, so the countdown stopped.' };
    case 'expectedShown':
      return { zh: '已显示应该看到的后像（简化示意）。', en: 'The expected afterimage is shown (simplified illustration).' };
    case 'expectedHidden':
      return { zh: '已隐藏后像示意图。', en: 'The illustration is hidden.' };
    default:
      return null;
  }
}

/**
 * The announcement that belongs to a phase change, or null when the phase did not change.
 * 阶段变化时对应的朗读内容；阶段没有变化时返回 null。
 */
export function phaseAnnouncement(previous, next) {
  if (!previous || !next || previous.phase === next.phase) return null;
  if (next.phase === 'stare') return announcement('start', next);
  if (next.phase === 'look') return announcement('look', next);
  if (next.phase === 'explain') return announcement('explain', next);
  return announcement(next.interrupted ? 'interrupted' : 'restart', next);
}
