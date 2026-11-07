/**
 * Signal detection theory (King & Urbszat, The Science of Psychology, 2nd Canadian ed., Chapter 4, p.126-129) for
 * the "signal-detection" widget: the config reader and every number, state change, drawing position and sentence
 * the widget shows. DOM-free.
 * 信号检测论（King & Urbszat《The Science of Psychology》加拿大第 2 版第 4 章第 126-129 页），供 signal-detection
 * 组件使用：读取配置，并算出组件显示的每个数字、状态变化、图形位置和句子；不依赖 DOM。
 *
 * The model is the usual equal-variance picture, drawn by a simple rule and labelled on screen as a simplified
 * illustration:
 * - the evidence of noise-only trials follows N(0, 1) and that of signal trials N(d′, 1), where the sensitivity d′
 *   runs from 0 to 3;
 * - the observer answers "yes" when the evidence is above the criterion c (−1.5 to 3, counted in noise standard
 *   deviations from the noise mean);
 * - hit rate = 1 − Φ(c − d′), miss rate = Φ(c − d′), false-alarm rate = 1 − Φ(c), correct-rejection rate = Φ(c).
 * What comes from the textbook: the four outcomes laid out as in Figure 4.6 (p.128), noise as irrelevant and
 * competing stimuli (p.126), the criterion as the standard used to make the decision, the stakes of each outcome
 * and information acquisition (p.129), the $50 incentives and the factors fatigue, expectations and the urgency of
 * the moment (p.127). The bell curves, d′, c and the words liberal / neutral / conservative go beyond the textbook,
 * and the widget says so.
 * 模型是常见的等方差画法，按简单规则画出，界面上标明是简化示意：
 * - 只有噪音的那些次，证据服从 N(0, 1)；有信号的那些次服从 N(d′, 1)，灵敏度 d′ 取 0 到 3；
 * - 证据大于判断标准 c（−1.5 到 3，以噪音分布的标准差为单位、从噪音平均数算起）时，观察者回答“有”；
 * - 击中率 = 1 − Φ(c − d′)，漏报率 = Φ(c − d′)，虚报率 = 1 − Φ(c)，正确拒绝率 = Φ(c)。
 * 来自教材的内容：按图 4.6（第 128 页）排列的四种结果，噪音是无关的、干扰的刺激（第 126 页），判断标准是做决定用的标准、
 * 每种结果的利害和信息获取（第 129 页），$50 奖惩的例子以及疲劳、期望、当时情况的紧迫程度这些因素（第 127 页）。
 * 钟形曲线、d′、c 和“宽松、中立、严格”这些说法超出了教材，组件会说明这一点。
 */

// Validator rule (tools/validate_content.py): no emojis or pictographic symbols in any text.
// 校验器规则：任何文字里都不能有表情或图形符号。
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
// Numbers are printed with a real minus sign, like the rest of the station. 数字使用真正的减号，与全站一致。
const MINUS = '−';

/* ---------- Limits and presets 范围与预设 ---------- */

// content-spec 5.5: sensitivity d′ 0-3 (default 1.5); the sliders move d′ in steps of 0.1.
// content-spec 5.5：灵敏度 d′ 取 0-3（默认 1.5）；滑块每步移动 0.1。
export const SENSITIVITY_LIMITS = Object.freeze({ min: 0, max: 3, step: 0.1, fallback: 1.5 });
// content-spec 5.5: criterion −1.5 to 3 (default sensitivity / 2); the slider and the drag move it in steps of 0.05.
// content-spec 5.5：判断标准取 −1.5 到 3（默认为灵敏度的一半）；滑块和拖动每步移动 0.05。
export const CRITERION_LIMITS = Object.freeze({ min: -1.5, max: 3, step: 0.05 });

// The three buttons put the criterion 0.8 below, at, or 0.8 above the neutral point d′ / 2.
// 三个按钮把判断标准放在中立点 d′ / 2 左边 0.8、正好在中立点、或右边 0.8 的位置。
export const PRESET_IDS = Object.freeze(['liberal', 'neutral', 'conservative']);
export const PRESET_OFFSETS = Object.freeze({ liberal: -0.8, neutral: 0, conservative: 0.8 });

// A criterion this close to a position counts as that position: just under half a slider step, so of two
// neighbouring slider positions only the nearer one matches.
// 判断标准离某个位置这么近就算在那个位置上：略小于滑块半步，所以相邻的两个滑块位置只有更近的那个算数。
export const CRITERION_TOLERANCE = CRITERION_LIMITS.step / 2 - 1e-6;

// The four outcomes in the order of Figure 4.6: signal present (hit, miss), then signal absent (false alarm,
// correct rejection). 四种结果按图 4.6 的顺序：信号出现（击中、漏报），然后信号没出现（虚报、正确拒绝）。
export const OUTCOME_IDS = Object.freeze(['hit', 'miss', 'falseAlarm', 'correctRejection']);

/* ---------- Texts 文字 ---------- */

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const DEFAULT_TITLE = deepFreeze({ zh: '信号检测论', en: 'Signal detection theory' });

// The textbook's own example (p.127): listening for a ticking clock. Shown when the config has no usable
// scenario and signal pair. 教材自己的例子（第 127 页）：听钟表的滴答声。配置里没有可用的情境和信号时显示。
export const DEFAULT_SCENARIO = deepFreeze({
  zh: '你坐在安静的房间里听一只钟。每一轮都要回答：听到它的滴答声了吗？',
  en: 'You sit in a quiet room and listen for a clock. On every trial you answer: do I hear it ticking?',
});
export const DEFAULT_SIGNAL = deepFreeze({ zh: '钟的滴答声', en: 'the ticking of the clock' });

/**
 * Every fixed string the widget shows, each as { zh, en }. Sentences that change with the state are built by the
 * functions further down.
 * 组件显示的所有固定文字，每条都是 { zh, en }。随状态变化的句子由下面的函数生成。
 */
export const TEXT = deepFreeze({
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  simplified: { zh: '简化示意', en: 'simplified illustration' },
  intro: {
    zh: '拖动图上的竖线（判断标准），或者用下面的滑块和按钮，看四种结果的比例怎么变。',
    en: 'Drag the vertical line (the criterion), or use the sliders and buttons below, and watch how the four outcomes change.',
  },
  scenarioHeading: { zh: '情境', en: 'Scenario' },
  signalLabel: { zh: '要察觉的信号', en: 'Signal to detect' },
  figureHeading: { zh: '两条曲线和判断标准', en: 'Two curves and the criterion' },
  noiseCurve: { zh: '只有噪音', en: 'noise only' },
  signalCurve: { zh: '信号 + 噪音', en: 'signal + noise' },
  axis: { zh: '证据强度', en: 'evidence' },
  caption: {
    zh: '简化示意：曲线按一个简单的规则画出（形状相同的两条钟形曲线），不是真实实验的数据。'
      + '横轴是每一次收集到的证据有多强；噪音（**noise**）指无关的、干扰的刺激。',
    en: 'Simplified illustration: the curves follow one simple rule (two bell curves of the same shape); they are not data from a real experiment. '
      + 'The horizontal axis is how strong the evidence on a trial is; noise means irrelevant, competing stimuli.',
  },
  legend: {
    hit: { zh: '击中区域：信号出现，回答“有”', en: 'Hit area: signal present, answer "yes"' },
    falseAlarm: { zh: '虚报区域：信号没出现，却回答“有”', en: 'False-alarm area: signal absent, but answer "yes"' },
    criterion: { zh: '竖线 = 判断标准 c：右边回答“有”，左边回答“没有”', en: 'Line = criterion c: "yes" to the right, "no" to the left' },
    distance: { zh: 'd′ = 两条曲线中心的距离', en: 'd′ = distance between the curve centres' },
  },
  controlsHeading: { zh: '移动判断标准，改变灵敏度', en: 'Move the criterion, change the sensitivity' },
  criterionSlider: { zh: '判断标准 c（竖线的位置）', en: 'Criterion c (where the line is)' },
  criterionHint: {
    zh: '往左移更宽松（更容易回答“有”），往右移更严格。',
    en: 'Move it left to be more liberal ("yes" comes more easily), right to be more conservative.',
  },
  sensitivitySlider: { zh: '灵敏度 d′（两条曲线中心相距多远）', en: 'Sensitivity d′ (how far apart the curve centres are)' },
  sensitivityHint: {
    zh: 'd′ 越大，两条曲线分得越开，越容易分清有没有信号。改变 d′ 时，竖线留在原地。',
    en: 'The larger d′, the further apart the curves and the easier it is to tell whether the signal is there. The line stays put when d′ changes.',
  },
  presetsLabel: { zh: '把判断标准放到', en: 'Put the criterion at' },
  presets: {
    liberal: { zh: '宽松', en: 'Liberal' },
    neutral: { zh: '中立', en: 'Neutral' },
    conservative: { zh: '严格', en: 'Conservative' },
  },
  stanceLabel: { zh: '现在', en: 'Now' },
  stanceNames: {
    liberal: { zh: '偏宽松', en: 'liberal' },
    neutral: { zh: '中立', en: 'neutral' },
    conservative: { zh: '偏严格', en: 'conservative' },
  },
  stance: {
    liberal: {
      zh: '竖线在中立点（两条曲线中心的正中间）左边：偏宽松，证据不太强也回答“有”。',
      en: 'The line is left of the neutral point (halfway between the curve centres): liberal, so even weak evidence gets "yes".',
    },
    neutral: {
      zh: '竖线正好在中立点：两条曲线中心的正中间。',
      en: 'The line is at the neutral point, halfway between the curve centres.',
    },
    conservative: {
      zh: '竖线在中立点（两条曲线中心的正中间）右边：偏严格，证据很强才回答“有”。',
      en: 'The line is right of the neutral point (halfway between the curve centres): conservative, so only strong evidence gets "yes".',
    },
  },
  zeroSensitivity: {
    zh: 'd′ = 0：两条曲线完全重合，证据完全分不清有没有信号。竖线放在哪里，击中率都等于虚报率。',
    en: 'd′ = 0: the two curves lie on top of each other, so the evidence cannot tell signal from noise. Wherever the line is, the hit rate equals the false-alarm rate.',
  },
  reset: { zh: '恢复初始设置', en: 'Reset' },
  resetDone: { zh: '已恢复初始设置。', en: 'Back to the starting settings.' },
  outcomesHeading: { zh: '四种结果（排法同教材图 4.6）', en: 'Four outcomes (as in textbook Figure 4.6)' },
  tableCaption: {
    zh: '四种结果的比例：行是信号有没有出现，列是观察者的回答',
    en: "Rates of the four outcomes: rows say whether the signal is present, columns give the observer's response",
  },
  observerResponse: { zh: '观察者的回答', en: "Observer's response" },
  columns: {
    yes: { zh: '回答“有”', en: '"Yes, I see the signal."' },
    no: { zh: '回答“没有”', en: '"No, I don\'t see the signal."' },
  },
  rows: {
    present: { zh: '信号出现', en: 'Signal present' },
    absent: { zh: '信号没出现', en: 'Signal absent' },
  },
  outcomes: {
    hit: { zh: '击中', en: 'Hit' },
    miss: { zh: '漏报', en: 'Miss' },
    falseAlarm: { zh: '虚报', en: 'False alarm' },
    correctRejection: { zh: '正确拒绝', en: 'Correct rejection' },
  },
  correct: { zh: '正确', en: 'correct' },
  mistake: { zh: '错误', en: 'mistake' },
  rowsNote: {
    zh: '每一行加起来是 100%：在有信号的那些次里，击中 + 漏报 = 100%；在没有信号的那些次里，虚报 + 正确拒绝 = 100%。',
    en: 'Each row adds up to 100%: on trials with the signal, hits + misses = 100%; on trials without it, false alarms + correct rejections = 100%.',
  },
  explainHeading: { zh: '怎么看这张图', en: 'How to read it' },
  explain: [
    {
      zh: '竖线往左移（更宽松）：击中（**hit**）变多，虚报（**false alarm**）也变多。往右移（更严格）：虚报变少，漏报（**miss**）变多。'
        + '曲线有重叠，就没有不出错的位置。',
      en: 'Line further left (more liberal): more hits, but also more false alarms. Further right (more conservative): fewer false alarms, but more misses. '
        + 'While the curves overlap, no position avoids every mistake.',
    },
    {
      zh: '灵敏度（**sensitivity**）d′：两条曲线分得多开。它取决于刺激本身（物理强度、噪音多少）和观察者的感觉能力。',
      en: "Sensitivity d′: how far apart the curves are. It depends on the stimulus (its physical intensity, how much noise there is) and on the observer's sensory abilities.",
    },
    {
      zh: '判断标准（**criterion**）：做决定用的标准。它放在哪里，取决于期望、动机和每种结果的后果，比如答对一次奖励 $50，或者虚报一次罚 $50。',
      en: 'The criterion is the standard used to decide. Where it goes depends on expectations, motivation and the consequences of each outcome, '
        + 'such as $50 for each correct answer or a $50 charge for each false alarm.',
    },
    {
      zh: '教材把决定分成两部分：信息获取（**information acquisition**，收集相关线索，得到横轴上的证据）和判断标准。'
        + '刺激相同、标准不同，决定就不同；疲劳、期望和当时情况的紧迫程度也会影响检测。',
      en: 'The textbook names two parts of the decision: information acquisition (gathering the relevant indicators, which gives the evidence on the axis) and the criterion. '
        + 'Same stimuli with different criteria give different decisions; fatigue, expectations and the urgency of the moment also affect detection.',
    },
  ],
  beyondTextbook: {
    zh: '补充（教材外）：钟形曲线、d′、c 和“宽松、中立、严格”是信号检测论的常见讲法，教材这一节没有。'
      + '考试用教材的词：hit、miss、false alarm、correct rejection、criterion、information acquisition。',
    en: 'Beyond the textbook: the bell curves, d′, c and the words liberal, neutral and conservative are common in signal detection theory but not in this section of the textbook. '
      + "On the test, use the textbook's words: hit, miss, false alarm, correct rejection, criterion, information acquisition.",
  },
  examTitle: { zh: '考试这样写', en: 'Write it like this' },
  exam: [
    {
      en: 'A hit is saying "yes" when the signal is present; a false alarm is saying "yes" when it is absent.',
      zh: '击中：信号出现时回答“有”；虚报：信号没出现，却回答“有”。',
    },
    {
      en: 'A miss is saying "no" when the signal is present; a correct rejection is saying "no" when it is absent.',
      zh: '漏报：信号出现了，却回答“没有”；正确拒绝：信号没出现，回答“没有”。',
    },
    {
      en: 'If the observer says "yes" more easily, there are more hits but also more false alarms.',
      zh: '观察者越容易说“有”，击中就越多，但虚报也越多。',
    },
  ],
});

/* ---------- Small number helpers 数字小工具 ---------- */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A finite number, or null. Numeric strings do not count: the validator accepts only JSON numbers.
// 有限数字，否则为 null。数字字符串不算：校验器只接受 JSON 数字。
function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Clamps into [min, max] and turns −0 into 0, so it never prints as "−0". 限制在 [min, max] 内，并把 −0 变成 0。
function clamp(value, min, max) {
  const clamped = Math.min(max, Math.max(min, value));
  return clamped === 0 ? 0 : clamped;
}

// Rounds half away from zero to `digits` decimals. 按“四舍五入（远离零）”保留 digits 位小数。
function roundTo(value, digits) {
  const factor = 10 ** digits;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** d′ kept inside 0-3; anything that is not a number gives the default 1.5. 把 d′ 限制在 0-3；不是数字时用默认值 1.5。 */
export function clampSensitivity(value) {
  const number = finiteOrNull(value);
  return number === null ? SENSITIVITY_LIMITS.fallback : clamp(number, SENSITIVITY_LIMITS.min, SENSITIVITY_LIMITS.max);
}

/**
 * c kept inside −1.5 to 3; anything that is not a number gives the neutral point of d′ (default d′ = 1.5).
 * 把 c 限制在 −1.5 到 3；不是数字时用 d′ 的中立点（d′ 默认 1.5）。
 */
export function clampCriterion(value, sensitivity = SENSITIVITY_LIMITS.fallback) {
  const number = finiteOrNull(value);
  const raw = number === null ? clampSensitivity(sensitivity) / 2 : number;
  return clamp(raw, CRITERION_LIMITS.min, CRITERION_LIMITS.max);
}

/* ---------- Normal distribution 正态分布 ---------- */

// W. J. Cody's rational Chebyshev approximations of erf and erfc (Math. Comp. 23, 1969; the coefficients of the
// netlib routine CALERF), accurate to about one unit in the last place of a double.
// W. J. Cody 的 erf 与 erfc 有理切比雪夫逼近（Math. Comp. 23, 1969；系数取自 netlib 的 CALERF），精度约为双精度的最后一位。
const ERF_A = [3.16112374387056560e0, 1.13864154151050156e2, 3.77485237685302021e2, 3.20937758913846947e3, 1.85777706184603153e-1];
const ERF_B = [2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3, 2.84423683343917062e3];
const ERFC_C = [
  5.64188496988670089e-1, 8.88314979438837594e0, 6.61191906371416295e1, 2.98635138197400131e2, 8.81952221241769090e2,
  1.71204761263407058e3, 2.05107837782607147e3, 1.23033935479799725e3, 2.15311535474403846e-8,
];
const ERFC_D = [
  1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2, 1.62138957456669019e3, 3.29079923573345963e3,
  4.36261909014324716e3, 3.43936767414372164e3, 1.23033935480374942e3,
];
const ERFC_P = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
const ERFC_Q = [2.56852019228982242e0, 1.87295284992346725e0, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3];
const ERF_SMALL = 0.46875;
// Beyond this, erfc is below the smallest double. 超过这个值，erfc 小于最小的双精度数。
const ERFC_ZERO = 26.543;
const INV_SQRT_PI = 0.56418958354775628695;

// erf(x) for |x| ≤ 0.46875. |x| ≤ 0.46875 时的 erf(x)。
function erfNearZero(x) {
  const square = x * x;
  let numerator = ERF_A[4] * square;
  let denominator = square;
  for (let index = 0; index < 3; index += 1) {
    numerator = (numerator + ERF_A[index]) * square;
    denominator = (denominator + ERF_B[index]) * square;
  }
  return (x * (numerator + ERF_A[3])) / (denominator + ERF_B[3]);
}

// erfc(y) for y > 0.46875. y > 0.46875 时的 erfc(y)。
function erfcTail(y) {
  if (y >= ERFC_ZERO) return 0;
  let ratio;
  if (y <= 4) {
    let numerator = ERFC_C[8] * y;
    let denominator = y;
    for (let index = 0; index < 7; index += 1) {
      numerator = (numerator + ERFC_C[index]) * y;
      denominator = (denominator + ERFC_D[index]) * y;
    }
    ratio = (numerator + ERFC_C[7]) / (denominator + ERFC_D[7]);
  } else {
    const inverse = 1 / (y * y);
    let numerator = ERFC_P[5] * inverse;
    let denominator = inverse;
    for (let index = 0; index < 4; index += 1) {
      numerator = (numerator + ERFC_P[index]) * inverse;
      denominator = (denominator + ERFC_Q[index]) * inverse;
    }
    ratio = (INV_SQRT_PI - (inverse * (numerator + ERFC_P[4])) / (denominator + ERFC_Q[4])) / y;
  }
  // exp(−y²) in two factors keeps the full precision of y². 把 exp(−y²) 拆成两个因子，保住 y² 的全部精度。
  const head = Math.trunc(y * 16) / 16;
  const rest = (y - head) * (y + head);
  return Math.exp(-head * head) * Math.exp(-rest) * ratio;
}

/** The error function erf(x); NaN for anything that is not a number. 误差函数 erf(x)；不是数字时返回 NaN。 */
export function erf(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return NaN;
  const size = Math.abs(x);
  if (size <= ERF_SMALL) return erfNearZero(x);
  const value = (0.5 - erfcTail(size)) + 0.5;
  return x < 0 ? -value : value;
}

/**
 * The complementary error function erfc(x) = 1 − erf(x), accurate in the far tail too.
 * 互补误差函数 erfc(x) = 1 − erf(x)，在远端尾部同样精确。
 */
export function erfc(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return NaN;
  const size = Math.abs(x);
  if (size <= ERF_SMALL) return 1 - erfNearZero(x);
  const tail = erfcTail(size);
  return x < 0 ? 2 - tail : tail;
}

/**
 * Φ(z), the area of the standard normal curve left of z: Φ(0) = 0.5 and Φ(1.96) ≈ 0.975.
 * Φ(z)：标准正态曲线在 z 左边的面积；Φ(0) = 0.5，Φ(1.96) ≈ 0.975。
 */
export function normalCdf(z) {
  if (typeof z !== 'number' || Number.isNaN(z)) return NaN;
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** φ(z), the height of the standard normal curve at z. φ(z)：标准正态曲线在 z 处的高度。 */
export function normalDensity(z) {
  if (typeof z !== 'number' || Number.isNaN(z)) return NaN;
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/* ---------- Config 配置 ---------- */

// A string the validator accepts: non-empty after trimming and free of emojis. 校验器接受的字符串：去掉首尾空白后不为空，且没有表情符号。
function readText(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text && !EMOJI.test(text) ? text : '';
}

// A Bi value with both languages and no other keys, as the validator requires, or null.
// 同时有中英文、没有其他键的双语值（校验器的要求），否则为 null。
function readBi(value) {
  if (!isPlainObject(value) || Object.keys(value).some((key) => key !== 'zh' && key !== 'en')) return null;
  const zh = readText(value.zh);
  const en = readText(value.en);
  return zh && en ? { zh, en } : null;
}

function readConfig(config) {
  const source = isPlainObject(config) ? config : {};
  const title = readBi(source.title);
  const scenario = readBi(source.scenario);
  const signal = readBi(source.signal);
  // The scenario names the situation and the signal what is detected in it, so they are used only together:
  // half a pair would mix the config's story with the default one.
  // 情境说明场景，信号说明在场景里要察觉什么，所以两者只能一起使用：只用一半会把配置的故事和默认故事混在一起。
  const story = scenario && signal ? { scenario, signal } : null;
  const givenSensitivity = finiteOrNull(source.sensitivity);
  const givenCriterion = finiteOrNull(source.criterion);
  const sensitivity = clampSensitivity(givenSensitivity);
  return {
    title: title ?? { ...DEFAULT_TITLE },
    scenario: story ? story.scenario : { ...DEFAULT_SCENARIO },
    signal: story ? story.signal : { ...DEFAULT_SIGNAL },
    sensitivity,
    criterion: clampCriterion(givenCriterion, sensitivity),
    usedDefault: {
      title: !title,
      story: !story,
      sensitivity: givenSensitivity === null,
      criterion: givenCriterion === null,
    },
  };
}

/**
 * Reads a content config (content-spec 5.5) into { title, scenario, signal, sensitivity, criterion, usedDefault }.
 * Never throws. Every config the validator accepts is read as written; otherwise:
 * - title: a Bi with exactly the keys zh and en, both non-empty, else 信号检测论 / Signal detection theory;
 * - scenario and signal: used together when both are such Bi values, else the textbook's ticking clock;
 * - sensitivity: a JSON number clamped to 0-3, else 1.5;
 * - criterion: a JSON number clamped to −1.5 to 3, else sensitivity / 2 (the neutral point).
 * Text is trimmed; text containing an emoji counts as missing. usedDefault tells which parts fell back.
 * 把内容配置（content-spec 5.5）读成 { title, scenario, signal, sensitivity, criterion, usedDefault }，从不抛出异常。
 * 校验器接受的配置原样读取；其余情况：
 * - title：只有 zh 和 en 两个键、且都不为空的双语值，否则为“信号检测论 / Signal detection theory”；
 * - scenario 与 signal：两者都是这样的双语值时一起使用，否则用教材的钟表滴答声例子；
 * - sensitivity：JSON 数字，限制在 0-3，否则为 1.5；
 * - criterion：JSON 数字，限制在 −1.5 到 3，否则为 sensitivity / 2（中立点）。
 * 文字会去掉首尾空白；含表情符号的文字按缺失处理。usedDefault 说明哪些部分用了默认值。
 */
export function normalizeSignalDetectionConfig(config) {
  try {
    return readConfig(config);
  } catch {
    // Only exotic objects (a revoked proxy, a throwing getter) get here; JSON never does.
    // 只有特殊对象（已撤销的代理、会抛错的 getter）才会走到这里；JSON 配置不会。
    return readConfig(null);
  }
}

/* ---------- State 状态 ---------- */

// A usable state from anything: the view only ever passes valid ones. 从任意输入得到可用的状态；视图传入的总是有效状态。
function readState(state) {
  const source = isPlainObject(state) ? state : {};
  const sensitivity = clampSensitivity(source.sensitivity);
  return { sensitivity, criterion: clampCriterion(source.criterion, sensitivity) };
}

/** The starting state { sensitivity, criterion } of a normalised config. 规范化配置的初始状态 { sensitivity, criterion }。 */
export function initialState(model) {
  return readState(model);
}

/**
 * A number from the slider or the drag put on the criterion grid (steps of 0.05) and clamped to −1.5..3; null when
 * it is not a number. Range inputs hand over strings, so numeric strings are read here.
 * 把滑块或拖动给出的数放到判断标准的刻度上（每步 0.05）并限制在 −1.5..3；不是数字时返回 null。滑块交出的是字符串，所以这里接受数字字符串。
 */
export function snapCriterion(value) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (finiteOrNull(number) === null) return null;
  const snapped = Math.round(number / CRITERION_LIMITS.step) * CRITERION_LIMITS.step;
  return clamp(roundTo(snapped, 2), CRITERION_LIMITS.min, CRITERION_LIMITS.max);
}

/** The same for d′: steps of 0.1 inside 0..3. 灵敏度 d′ 的同样处理：每步 0.1，范围 0..3。 */
export function snapSensitivity(value) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (finiteOrNull(number) === null) return null;
  const snapped = Math.round(number / SENSITIVITY_LIMITS.step) * SENSITIVITY_LIMITS.step;
  return clamp(roundTo(snapped, 1), SENSITIVITY_LIMITS.min, SENSITIVITY_LIMITS.max);
}

/**
 * The state with the criterion moved to `value` (snapped, see snapCriterion). Anything that is not a number
 * leaves the state as it was. d′ does not change.
 * 把判断标准移到 value（按 snapCriterion 吸附）后的状态。不是数字时状态不变；d′ 不变。
 */
export function withCriterion(state, value) {
  const current = readState(state);
  const criterion = snapCriterion(value);
  return criterion === null ? current : { ...current, criterion };
}

/**
 * The state with d′ set to `value` (snapped, see snapSensitivity). The criterion line stays where it is: the
 * observer's standard does not move because the stimulus got easier or harder to detect.
 * 把灵敏度设为 value（按 snapSensitivity 吸附）后的状态。判断标准留在原地：刺激变得更容易或更难察觉，并不会改变观察者的标准。
 */
export function withSensitivity(state, value) {
  const current = readState(state);
  const sensitivity = snapSensitivity(value);
  return sensitivity === null ? current : { ...current, sensitivity };
}

/**
 * Where a preset puts the criterion for a given d′: d′/2 − 0.8 (liberal), d′/2 (neutral) or d′/2 + 0.8
 * (conservative), clamped to −1.5..3; null for an unknown preset.
 * 某个预设在给定 d′ 下把判断标准放在哪里：d′/2 − 0.8（宽松）、d′/2（中立）或 d′/2 + 0.8（严格），限制在 −1.5..3；未知预设返回 null。
 */
export function presetCriterion(preset, sensitivity) {
  if (!Object.hasOwn(PRESET_OFFSETS, preset)) return null;
  const neutral = clampSensitivity(sensitivity) / 2;
  return clamp(roundTo(neutral + PRESET_OFFSETS[preset], 6), CRITERION_LIMITS.min, CRITERION_LIMITS.max);
}

/** The state after pressing a preset button; an unknown preset changes nothing. 按下预设按钮后的状态；未知预设不改变状态。 */
export function withPreset(state, preset) {
  const current = readState(state);
  const criterion = presetCriterion(preset, current.sensitivity);
  return criterion === null ? current : { ...current, criterion };
}

/**
 * The preset whose position the criterion is at right now ("liberal", "neutral" or "conservative"), or null.
 * 判断标准现在正好在哪个预设的位置（"liberal"、"neutral" 或 "conservative"），都不是时返回 null。
 */
export function activePreset(state) {
  const { sensitivity, criterion } = readState(state);
  return PRESET_IDS.find((preset) => Math.abs(presetCriterion(preset, sensitivity) - criterion) < CRITERION_TOLERANCE) ?? null;
}

/**
 * Where the criterion sits against the neutral point d′/2: "liberal" left of it, "neutral" at it, "conservative"
 * right of it.
 * 判断标准相对于中立点 d′/2 的位置：左边为 "liberal"，正好在上面为 "neutral"，右边为 "conservative"。
 */
export function criterionStance(state) {
  const { sensitivity, criterion } = readState(state);
  const offset = criterion - sensitivity / 2;
  if (Math.abs(offset) < CRITERION_TOLERANCE) return 'neutral';
  return offset < 0 ? 'liberal' : 'conservative';
}

/* ---------- Outcomes 四种结果 ---------- */

/**
 * The four rates of the model: { hit, miss, falseAlarm, correctRejection }, each between 0 and 1.
 * hit = 1 − Φ(c − d′) = Φ(d′ − c), miss = Φ(c − d′), falseAlarm = 1 − Φ(c) = Φ(−c), correctRejection = Φ(c).
 * 模型的四个比率 { hit, miss, falseAlarm, correctRejection }，都在 0 和 1 之间。
 */
export function outcomeRates(state) {
  const { sensitivity, criterion } = readState(state);
  return {
    hit: normalCdf(sensitivity - criterion),
    miss: normalCdf(criterion - sensitivity),
    falseAlarm: normalCdf(-criterion),
    correctRejection: normalCdf(criterion),
  };
}

function wholePercent(rate) {
  return typeof rate === 'number' && Number.isFinite(rate) ? Math.round(clamp(rate, 0, 1) * 100) : 0;
}

/**
 * The rates as whole percentages. Each row of Figure 4.6 covers one kind of trial, so the miss and
 * correct-rejection percentages are 100 minus the hit and false-alarm ones: every row adds up to exactly 100.
 * 把比率换成整数百分比。图 4.6 的每一行是一类试次，所以漏报和正确拒绝的百分比用 100 减去击中和虚报的百分比：每一行加起来正好是 100。
 */
export function outcomePercents(rates) {
  const hit = wholePercent(rates?.hit);
  const falseAlarm = wholePercent(rates?.falseAlarm);
  return { hit, miss: 100 - hit, falseAlarm, correctRejection: 100 - falseAlarm };
}

/**
 * The outcome table laid out like textbook Figure 4.6 (p.128): rows signal present / absent, columns the
 * observer's response "yes" / "no". Each cell is { id, term, correct, percent }.
 * 按教材图 4.6（第 128 页）排列的结果表：行是信号出现 / 没出现，列是观察者回答“有”/“没有”。每个格子是 { id, term, correct, percent }。
 */
export function outcomeTable(state) {
  const percents = outcomePercents(outcomeRates(state));
  const cell = (id) => ({ id, term: TEXT.outcomes[id], correct: id === 'hit' || id === 'correctRejection', percent: percents[id] });
  return {
    columns: [{ id: 'yes', label: TEXT.columns.yes }, { id: 'no', label: TEXT.columns.no }],
    rows: [
      { id: 'present', label: TEXT.rows.present, cells: [cell('hit'), cell('miss')] },
      { id: 'absent', label: TEXT.rows.absent, cells: [cell('falseAlarm'), cell('correctRejection')] },
    ],
  };
}

/* ---------- Number text 数字文本 ---------- */

function fixed(value, digits) {
  const rounded = roundTo(value, digits);
  const text = Math.abs(rounded).toFixed(digits);
  return rounded < 0 ? `${MINUS}${text}` : text;
}

/** The criterion with 2 decimals and a real minus sign: "0.75", "−0.05", "3.00". 判断标准保留 2 位小数，用真正的减号。 */
export function formatCriterion(value) {
  return typeof value === 'number' && Number.isFinite(value) ? fixed(value, 2) : '—';
}

/** d′ with 1 decimal, or 2 when a config gives a finer value: "1.5", "0.0", "1.37". d′ 保留 1 位小数；配置给出更细的值时保留 2 位。 */
export function formatSensitivity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return fixed(value, Math.abs(roundTo(value, 1) - value) < 1e-9 ? 1 : 2);
}

/* ---------- Sentences 句子 ---------- */

/** What the slider of the criterion says to a screen reader: "c = 0.75，中立 neutral". 判断标准滑块读给读屏软件的值。 */
export function criterionValueText(state) {
  const current = readState(state);
  const name = TEXT.stanceNames[criterionStance(current)];
  return `c = ${formatCriterion(current.criterion)}，${name.zh} ${name.en}`;
}

/** What the slider of d′ says to a screen reader: "d′ = 1.5". 灵敏度滑块读给读屏软件的值。 */
export function sensitivityValueText(state) {
  return `d′ = ${formatSensitivity(readState(state).sensitivity)}`;
}

/** The short result: { zh: '击中 77%，虚报 23%。', en: 'Hits 77%, false alarms 23%.' }. 简短的结果句。 */
export function resultSentence(percents) {
  const hit = Number.isFinite(percents?.hit) ? percents.hit : 0;
  const falseAlarm = Number.isFinite(percents?.falseAlarm) ? percents.falseAlarm : 0;
  return { zh: `击中 ${hit}%，虚报 ${falseAlarm}%。`, en: `Hits ${hit}%, false alarms ${falseAlarm}%.` };
}

/** Where the criterion sits, in words: { stance, name { zh, en }, zh, en }. 用文字说明判断标准的位置。 */
export function stanceSentence(state) {
  const stance = criterionStance(state);
  return { stance, name: TEXT.stanceNames[stance], ...TEXT.stance[stance] };
}

/**
 * What the live region says after a change, in both languages:
 * "击中 77%，虚报 23%（判断标准 c = 0.75，中立；灵敏度 d′ = 1.5）。 Hits 77%, false alarms 23% (criterion c = 0.75, neutral; sensitivity d′ = 1.5)."
 * 状态改变后朗读区域播报的内容（中英双语）。
 */
export function announcement(state) {
  const current = readState(state);
  const percents = outcomePercents(outcomeRates(current));
  const name = TEXT.stanceNames[criterionStance(current)];
  const c = formatCriterion(current.criterion);
  const d = formatSensitivity(current.sensitivity);
  return `击中 ${percents.hit}%，虚报 ${percents.falseAlarm}%（判断标准 c = ${c}，${name.zh}；灵敏度 d′ = ${d}）。 `
    + `Hits ${percents.hit}%, false alarms ${percents.falseAlarm}% (criterion c = ${c}, ${name.en}; sensitivity d′ = ${d}).`;
}

/** The announcement after a preset button: "宽松 Liberal. 击中 …". 按下预设按钮后的播报。 */
export function presetAnnouncement(state, preset) {
  const name = TEXT.presets[preset];
  return name ? `${name.zh} ${name.en}. ${announcement(state)}` : announcement(state);
}

/** The announcement after Reset. 恢复初始设置后的播报。 */
export function resetAnnouncement(state) {
  return `${TEXT.resetDone.zh} ${TEXT.resetDone.en} ${announcement(state)}`;
}

/**
 * Text alternative of the drawing, for its aria-label: the two curves, the criterion line and the shaded areas.
 * 图形的文字说明，用作 aria-label：两条曲线、判断标准竖线和两块阴影区域。
 */
export function figureDescription(state) {
  const current = readState(state);
  const percents = outcomePercents(outcomeRates(current));
  const c = formatCriterion(current.criterion);
  const d = formatSensitivity(current.sensitivity);
  return `图：两条钟形曲线。只有噪音的曲线中心在 0，信号 + 噪音的曲线中心在 d′ = ${d}。判断标准竖线在 c = ${c}。`
    + `竖线右边：击中区域是信号曲线的 ${percents.hit}%，虚报区域是噪音曲线的 ${percents.falseAlarm}%。 `
    + `Figure: two bell curves. The noise-only curve is centred at 0 and the signal + noise curve at d′ = ${d}. `
    + `The criterion line is at c = ${c}. Right of the line, the hit area is ${percents.hit}% of the signal curve `
    + `and the false-alarm area ${percents.falseAlarm}% of the noise curve.`;
}

/* ---------- Drawing 绘图 ---------- */

// The evidence axis always runs from −3.5 to 6.5: the noise curve (centre 0) and the signal curve at the largest
// d′ (centre 3) both fit with 3.5 standard deviations to spare, and the noise curve never moves.
// 证据轴固定为 −3.5 到 6.5：噪音曲线（中心 0）和 d′ 最大时的信号曲线（中心 3）都能放下，两边各留 3.5 个标准差，噪音曲线也从不移动。
export const EVIDENCE_RANGE = Object.freeze({ min: -3.5, max: 6.5 });

// Rows of the drawing in pixels; the drawing is as wide as its box (at least minWidth) and PLOT.height tall.
// 图中各行的位置（像素）；图和它的容器一样宽（至少 minWidth），高 PLOT.height。
export const PLOT = Object.freeze({
  height: 238,
  padX: 14,
  minWidth: 260,
  maxWidth: 960,
  fallbackWidth: 480,
  valueY: 14,
  handleY: 30,
  handleRadius: 9,
  peakY: 50,
  axisY: 176,
  curveLabelY: 118,
  lineGap: 14,
  bracketY: 186,
  bracketLabelY: 206,
  axisLabelY: 230,
  samples: 200,
  zhFont: 12,
  enFont: 11,
  valueFont: 12,
});

// Distance (in standard deviations) between a curve's centre and the near edge of its label, beside the curve's
// shoulder. 曲线中心到其标签近端的距离（以标准差为单位），标签放在曲线肩部的旁边。
export const CURVE_LABEL_OFFSET = 1.45;

/**
 * Horizontal scale of a drawing `width` pixels wide (clamped to PLOT.minWidth..maxWidth):
 * { width, height, left, right, unit (pixels per standard deviation), x(evidence), evidence(x) }.
 * 宽 width 像素（限制在 PLOT.minWidth..maxWidth）的图的横向比例尺：{ width, height, left, right, unit（每个标准差的像素数）, x(证据), evidence(x) }。
 */
export function plotScale(width) {
  const measured = typeof width === 'number' && Number.isFinite(width) ? width : PLOT.fallbackWidth;
  const size = Math.round(clamp(measured, PLOT.minWidth, PLOT.maxWidth));
  const left = PLOT.padX;
  const right = size - PLOT.padX;
  const unit = (right - left) / (EVIDENCE_RANGE.max - EVIDENCE_RANGE.min);
  return {
    width: size,
    height: PLOT.height,
    left,
    right,
    unit,
    x: (evidence) => left + (evidence - EVIDENCE_RANGE.min) * unit,
    evidence: (x) => EVIDENCE_RANGE.min + (x - left) / unit,
  };
}

/**
 * The criterion under a point of the drawing (a pointer at `x` pixels), snapped and clamped; null when x is not a
 * number. 图上某一点（指针在 x 像素处）对应的判断标准，已吸附并限制范围；x 不是数字时返回 null。
 */
export function criterionAt(scale, x) {
  return typeof x === 'number' && Number.isFinite(x) ? snapCriterion(scale.evidence(x)) : null;
}

/** Height (y in pixels) of a curve whose centre is `mean`, at `evidence`. 中心为 mean 的曲线在 evidence 处的高度（y 像素）。 */
export function curveY(evidence, mean) {
  const relative = normalDensity(evidence - mean) / normalDensity(0);
  return PLOT.axisY - (PLOT.axisY - PLOT.peakY) * relative;
}

const coordinate = (value) => value.toFixed(1);

function samplePoints(mean, scale, from) {
  const points = [];
  for (let index = 0; index <= PLOT.samples; index += 1) {
    const evidence = EVIDENCE_RANGE.min + ((EVIDENCE_RANGE.max - EVIDENCE_RANGE.min) * index) / PLOT.samples;
    if (evidence > from) points.push(`${coordinate(scale.x(evidence))} ${coordinate(curveY(evidence, mean))}`);
  }
  return points;
}

/** SVG path of a whole curve centred at `mean`. 中心在 mean 的整条曲线的 SVG 路径。 */
export function curvePath(mean, scale) {
  return `M${samplePoints(mean, scale, -Infinity).join(' L')}`;
}

/**
 * Closed SVG path of the area under the curve centred at `mean` to the right of `from` (the criterion): the hit
 * area under the signal curve, the false-alarm area under the noise curve. '' when nothing is right of `from`.
 * 中心在 mean 的曲线下、from（判断标准）右边那块面积的封闭 SVG 路径：信号曲线下是击中区域，噪音曲线下是虚报区域。from 右边没有面积时为 ''。
 */
export function tailAreaPath(mean, from, scale) {
  const start = Math.max(EVIDENCE_RANGE.min, from);
  if (!(start < EVIDENCE_RANGE.max)) return '';
  const x = coordinate(scale.x(start));
  const axis = coordinate(PLOT.axisY);
  return `M${x} ${axis} L${x} ${coordinate(curveY(start, mean))} L${samplePoints(mean, scale, start).join(' L')} `
    + `L${coordinate(scale.right)} ${axis} Z`;
}

/**
 * Rough width in pixels of a one-line label: Chinese and full-width characters 1 em, spaces 0.3 em, anything else
 * 0.6 em (a little more than the average Latin letter, so labels never get clipped).
 * 一行标签的大致宽度（像素）：中文和全角字符 1 em，空格 0.3 em，其他字符 0.6 em（比拉丁字母平均宽度略大，保证标签不会被截掉）。
 */
export function estimateTextWidth(text, fontSize) {
  let width = 0;
  for (const char of String(text ?? '')) {
    if (/[⺀-鿿豈-﫿＀-￯]/u.test(char)) width += fontSize;
    else if (char === ' ') width += 0.3 * fontSize;
    else width += 0.6 * fontSize;
  }
  return width;
}

function twoLineWidth(text) {
  return Math.max(estimateTextWidth(text.zh, PLOT.zhFont), estimateTextWidth(text.en, PLOT.enFont));
}

/**
 * Where the two curve labels go: the noise label ends left of the noise curve's left shoulder, the signal label
 * starts right of the signal curve's right shoulder, each pushed back inside the drawing when it would stick out.
 * Returns { zhY, enY, noise, signal }, each label { x, anchor, left, right }.
 * 两条曲线标签的位置：噪音标签放在噪音曲线左肩的左边，信号标签放在信号曲线右肩的右边；会超出图形时推回图内。
 * 返回 { zhY, enY, noise, signal }，每个标签为 { x, anchor, left, right }。
 */
export function curveLabelLayout(scale, sensitivity) {
  const d = clampSensitivity(sensitivity);
  const noiseWidth = twoLineWidth(TEXT.noiseCurve);
  const signalWidth = twoLineWidth(TEXT.signalCurve);
  const noiseEnd = Math.max(scale.x(-CURVE_LABEL_OFFSET), scale.left + noiseWidth);
  const signalStart = Math.min(scale.x(d + CURVE_LABEL_OFFSET), scale.right - signalWidth);
  return {
    zhY: PLOT.curveLabelY,
    enY: PLOT.curveLabelY + PLOT.lineGap,
    noise: { x: noiseEnd, anchor: 'end', left: noiseEnd - noiseWidth, right: noiseEnd },
    signal: { x: signalStart, anchor: 'start', left: signalStart, right: signalStart + signalWidth },
  };
}

/** Centre x of a label `width` pixels wide placed at `x`, kept inside the drawing. 宽 width 像素、放在 x 处的标签的中心，保证不超出图形。 */
export function labelCentre(scale, x, width) {
  const half = width / 2;
  if (scale.right - scale.left <= width) return scale.width / 2;
  return clamp(x, scale.left + half, scale.right - half);
}

/** The text above the handle of the criterion line: "c = 0.75". 判断标准竖线把手上方的文字。 */
export function criterionValueLabel(state) {
  return `c = ${formatCriterion(readState(state).criterion)}`;
}

/** The text under the d′ bracket: "d′ = 1.5". d′ 括线下方的文字。 */
export function sensitivityLabel(state) {
  return `d′ = ${formatSensitivity(readState(state).sensitivity)}`;
}

/**
 * Everything the drawing places for a state: { x (criterion line), valueX (its label), bracket { x1, x2, labelX },
 * labels (curveLabelLayout) }.
 * 某个状态下图中各元素的位置：{ x（判断标准竖线）, valueX（它的标签）, bracket { x1, x2, labelX }, labels（curveLabelLayout） }。
 */
export function plotLayout(scale, state) {
  const current = readState(state);
  const x = scale.x(current.criterion);
  const valueWidth = estimateTextWidth(criterionValueLabel(current), PLOT.valueFont);
  const bracketWidth = estimateTextWidth(sensitivityLabel(current), PLOT.valueFont);
  return {
    x,
    valueX: labelCentre(scale, x, valueWidth),
    bracket: {
      x1: scale.x(0),
      x2: scale.x(current.sensitivity),
      labelX: labelCentre(scale, scale.x(current.sensitivity / 2), bracketWidth),
    },
    labels: curveLabelLayout(scale, current.sensitivity),
  };
}
