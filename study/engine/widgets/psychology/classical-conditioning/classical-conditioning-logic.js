/**
 * Classical conditioning (King & Urbszat, The Science of Psychology: An Appreciative View, 2nd Canadian ed.,
 * Chapter 6, pp. 210-221) for the "classical-conditioning" widget: the config reader, the three textbook examples,
 * the before / during / after storyboard, the trial simulator (a pure reducer) and every sentence, label and chart
 * position the widget shows. DOM-free.
 * 经典条件反射（King & Urbszat《The Science of Psychology》加拿大第 2 版第 6 章第 210-221 页），供 classical-conditioning
 * 组件使用：读取配置、教材的三个例子、“建立前 / 建立中 / 建立后”三格图、试次模拟器（纯函数的状态更新），以及组件显示的
 * 每个句子、标签和图上位置；不依赖 DOM。
 *
 * Textbook facts kept here:
 * - The US produces the UR without prior learning; a neutral stimulus paired with the US becomes the CS, which then
 *   produces the CR, a learned response that is typically weaker than the UR (p. 211). The lecture writes UCS and
 *   UCR for US and UR; CS and CR are written the same in both. The textbook's own quiz writes a neutral stimulus NS.
 * - Pavlov played a buzzer, never a bell (the bell is a mistranslation of the Russian word for buzzer), just before
 *   food (meat powder); salivation to the food was the UR, salivation to the buzzer the CR (pp. 210-212, Figure 6.2).
 *   Extinction: the buzzer again and again without food; spontaneous recovery: the day after, the buzzer alone
 *   brought the salivation back (p. 213).
 * - Little Albert (Watson and Rayner, 1920): a white laboratory rat (neutral stimulus, then CS), a loud noise behind
 *   his head (US), startle and crying (UR), fear of the rat (CR) after only seven pairings; the fear generalized to a
 *   rabbit, a dog and a sealskin coat; Albert was never deconditioned; the study would not be allowed today
 *   (pp. 214-215).
 * - Taste aversion: the taste of a new dish, spicy yellowtail (CS), whatever made you sick (US), nausea or vomiting
 *   (UR), the learned taste aversion (CR); typically one pairing, with the nausea hours later (p. 219).
 * - Figure 6.3 (p. 214): acquisition (CS-US paired), extinction (CS alone), rest, spontaneous recovery (CS alone).
 *   Spontaneous recovery can occur several times, but while the CS keeps coming alone it becomes weaker and
 *   eventually ceases (p. 214).
 * 教材事实：
 * - US 不用学习就能引起 UR；中性刺激和 US 配对后成为 CS，之后能引起 CR，CR 是学会的反应，通常比 UR 弱（第 211 页）。
 *   讲课把 US、UR 写作 UCS、UCR；CS、CR 两边写法相同。教材自己的小测验把中性刺激写作 NS。
 * - 巴甫洛夫用的是蜂鸣器，从来不是铃铛（“铃”来自俄语“蜂鸣器”一词的误译），紧接着给食物（肉粉）；对食物流口水是 UR，
 *   对蜂鸣器流口水是 CR（第 210-212 页，图 6.2）。消退：反复只响蜂鸣器不给食物；自发恢复：第二天只响蜂鸣器，狗又流口水（第 213 页）。
 * - 小阿尔伯特（Watson 和 Rayner，1920）：白色实验室大鼠（中性刺激，后来是 CS）、他脑后的巨响（US）、受惊大哭（UR）、
 *   怕白鼠（CR），只配对了 7 次；害怕泛化到兔子、狗和海豹皮大衣；从未被消除；今天不允许这样的研究（第 214-215 页）。
 * - 味觉厌恶：新菜辣味鰤鱼寿司的味道（CS）、让你生病的东西（US）、恶心或呕吐（UR）、学到的味觉厌恶（CR）；
 *   通常配对一次就够，恶心可以在几个小时后才出现（第 219 页）。
 * - 图 6.3（第 214 页）：习得（CS-US 配对）、消退（只给 CS）、休息、自发恢复（只给 CS）。自发恢复可以出现好几次，
 *   但只要 CS 一直单独出现，它就越来越弱，最后停止（第 214 页）。
 *
 * The simulator is a simplified illustration, drawn by simple rules and not from data:
 * - a pairing raises the CR strength v toward 100%: v ← v + 0.3(1 − v) (acquisition);
 * - the CS alone, once something has been learned, lowers it: v ← v − 0.3v (extinction);
 * - a rest after extinction brings it halfway back to the earlier peak p (the strongest CR since the pairings of this
 *   cycle; a pairing after an extinction or a recovery starts a new cycle): v ← v + 0.5(p − v), weaker than p
 *   (spontaneous recovery). That level becomes the peak the next rest can return to, so every recovery is weaker.
 *   After the first recovery of a cycle, spontaneous recovery has ceased once even a CR extinguished to 0 would come
 *   back by less than 8 percentage points (0.5p < 0.08). The peak only falls until the next pairing, so it then stays
 *   ceased; a shallow extinction only leaves less to recover. A new pairing starts a new cycle, so its first recovery
 *   always happens.
 * 模拟器是简化示意，按简单规则画出，不是真实数据：
 * - 每次配对让 CR 强度 v 向 100% 靠近：v ← v + 0.3(1 − v)（习得）；
 * - 学到东西以后，每次只给 CS 让它下降：v ← v − 0.3v（消退）；
 * - 消退后休息一天，CR 回到离之前峰值 p（这一轮配对以来最强的 CR；消退或恢复之后的配对开始新的一轮）一半的位置：
 *   v ← v + 0.5(p − v)，比 p 弱（自发恢复）。这个值成为下一次休息能回到的峰值，所以每次恢复都更弱。
 *   每一轮的第一次恢复之后，如果 CR 即使消退到 0 也回升不到 8 个百分点（0.5p < 0.08），自发恢复就停止了。
 *   峰值在下一次配对之前只会下降，所以之后一直停止；消退得浅只是能恢复的部分少一些。
 *   新的配对开始新的一轮，这一轮的第一次恢复一定会发生。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { roundTo } from '../../machine-learning/shared/ml-math.js';

/* ---------- Config values 配置取值 ---------- */

// The option values the content validator accepts (tools/validate_content.py, CONDITIONING_*).
// 内容校验器接受的取值（tools/validate_content.py 中的 CONDITIONING_*）。
export const EXAMPLES = Object.freeze(['pavlov', 'little-albert', 'taste-aversion', 'custom']);
export const NOTATIONS = Object.freeze(['us', 'ucs']);
export const ROLE_KEYS = Object.freeze(['neutral', 'us', 'ur', 'cr']);
export const DEFAULT_EXAMPLE = 'pavlov';
export const DEFAULT_NOTATION = 'us';
export const DEFAULT_TITLE = Object.freeze({ zh: '经典条件反射', en: 'Classical conditioning' });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * The three textbook examples, worded as the textbook tells each study. `roles` name the four things the
 * storyboard shows (the neutral stimulus is also the CS after conditioning); `short` are the brief names the
 * simulator's sentences use; `caveat` warns where the one-rule simulator differs from the real study.
 * 教材的三个例子，按教材的讲法措辞。roles 是三格图里的四样东西（中性刺激在条件反射建立后就是 CS）；short 是模拟器句子里用的
 * 简短名称；caveat 提醒只用一条规则的模拟器和真实研究不同的地方。
 */
export const PRESETS = deepFreeze({
  pavlov: {
    name: { zh: '巴甫洛夫的狗', en: 'Pavlov\'s dogs' },
    source: { zh: '教材第 210–212 页（图 6.2）', en: 'Textbook pp. 210–212 (Figure 6.2)' },
    roles: {
      neutral: { zh: '蜂鸣器', en: 'buzzer' },
      us: { zh: '食物（肉粉）', en: 'food (meat powder)' },
      ur: { zh: '吃到食物时流口水', en: 'salivation to the food' },
      cr: { zh: '听到蜂鸣器就流口水', en: 'salivation to the buzzer' },
    },
    short: {
      neutral: { zh: '蜂鸣器', en: 'buzzer' },
      us: { zh: '食物', en: 'food' },
    },
    noResponse: { zh: '不流口水', en: 'no salivation' },
    pairings: {
      zh: '反复配对：每次先响蜂鸣器，紧接着给食物。慢慢地，狗把蜂鸣器和食物联系在一起。',
      en: 'Paired again and again: the buzzer sounds just before the food arrives. Over time the dog links the buzzer with the food.',
    },
    note: {
      zh: '教材特别指出：巴甫洛夫用的是蜂鸣器（**buzzer**），从来没用过铃铛（**bell**）；“用铃铛”的说法来自俄语“蜂鸣器”一词的误译。讲课幻灯片上写的是 Bell，做教材选择题时以 buzzer 为准。',
      en: 'The textbook points out that Pavlov used a buzzer and never a bell: the bell story comes from a mistranslation of the Russian word for buzzer. The lecture slide says Bell.',
    },
    caveat: null,
  },
  'little-albert': {
    name: { zh: '小阿尔伯特', en: 'Little Albert' },
    source: { zh: '教材第 214–215 页：Watson 和 Rayner（1920）', en: 'Textbook pp. 214–215: Watson and Rayner (1920)' },
    roles: {
      neutral: { zh: '白色的实验室大鼠', en: 'white laboratory rat' },
      us: { zh: '在他脑后突然发出的巨响', en: 'loud noise behind his head' },
      ur: { zh: '被巨响吓到、大哭', en: 'startle and crying at the noise' },
      cr: { zh: '一看到白鼠就害怕', en: 'fear of the rat' },
    },
    short: {
      neutral: { zh: '白鼠', en: 'white rat' },
      us: { zh: '巨响', en: 'loud noise' },
    },
    noResponse: { zh: '不害怕，还跟白鼠玩', en: 'no fear: he played with the rat' },
    pairings: {
      zh: '只配对了 7 次：阿尔伯特在玩白鼠时，研究者在他脑后发出巨响。',
      en: 'Only seven pairings: while Albert played with the rat, the researchers sounded the loud noise behind his head.',
    },
    note: {
      zh: '后来阿尔伯特看到兔子、狗和海豹皮大衣这些像白鼠的东西也害怕：这叫**泛化**（**generalization**）。这项研究违反研究伦理，今天不允许做。',
      en: 'Albert\'s fear then generalized to rat-like things such as a rabbit, a dog and a sealskin coat. The study broke ethical guidelines and would not be allowed today.',
    },
    caveat: {
      zh: '注意：真实研究里，Watson 和 Rayner 从来没有帮阿尔伯特消除这种害怕（教材第 215 页）。模拟器里的消退和自发恢复只是理论上会发生的情况。',
      en: 'Note: in the real study, Watson and Rayner never removed Albert\'s fear (textbook p. 215). The extinction and spontaneous recovery in the simulator show only what would happen in theory.',
    },
  },
  'taste-aversion': {
    name: { zh: '味觉厌恶', en: 'Taste aversion' },
    source: { zh: '教材第 219 页', en: 'Textbook p. 219' },
    roles: {
      neutral: { zh: '一道新菜的味道（辣味鰤鱼寿司）', en: 'taste of a new dish (spicy yellowtail)' },
      us: { zh: '让你生病的东西（比如病毒或沙门氏菌）', en: 'whatever made you sick (such as a virus or salmonella)' },
      ur: { zh: '恶心、呕吐', en: 'nausea or vomiting' },
      cr: { zh: '学到的味觉厌恶：再也受不了这道菜', en: 'learned taste aversion: you cannot stand the dish' },
    },
    short: {
      neutral: { zh: '新菜的味道', en: 'new taste' },
      us: { zh: '让你生病的东西', en: 'what made you sick' },
    },
    noResponse: { zh: '还没有反感', en: 'no aversion yet' },
    pairings: {
      zh: '通常只要配对 1 次：吃了这道菜，几个小时后才恶心，也能学会。',
      en: 'Usually a single pairing is enough: you ate the dish and felt sick several hours later.',
    },
    note: {
      zh: '那天晚上你还去听了爵士音乐会，但你不会讨厌爵士乐，只讨厌那个味道。即使恶心其实是病毒引起的、跟这道菜无关，也会形成味觉厌恶。',
      en: 'You went to a jazz concert that night too, but you develop no aversion to jazz, only to the taste. The aversion can form even when the dish had nothing to do with the illness, for example when a virus caused the nausea.',
    },
    caveat: {
      zh: '注意：真实的味觉厌恶通常配对 1 次就能学会，而且常常保持很久（教材第 219 页）。简化曲线对每个例子都用同一条规则，所以这里要配对好几次。',
      en: 'Note: a real taste aversion is usually learned in a single pairing and often lasts a very long time (textbook p. 219). The simplified curve uses one rule for every example, so here it takes several pairings.',
    },
  },
});

// What a custom example shows besides its roles: no study, so no name, source, note or caveat.
// 自定义例子除了四个角色以外显示的内容：它不是某项研究，所以没有名称、出处、要点和提醒。
const CUSTOM_DETAILS = deepFreeze({
  name: null,
  source: null,
  noResponse: null,
  pairings: {
    zh: '配对：中性刺激出现后，紧接着出现无条件刺激；通常要反复配对很多次。',
    en: 'Pairing: the neutral stimulus comes just before the unconditioned stimulus, usually again and again.',
  },
  note: null,
  caveat: null,
});

/* ---------- Config 配置 ---------- */

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A label the validator accepts: an object whose zh and en are both non-empty strings; null otherwise.
// 校验器接受的标签：zh 和 en 都是非空字符串的对象；否则返回 null。
function readBi(value) {
  if (!isPlainObject(value)) return null;
  const zh = typeof value.zh === 'string' ? value.zh.trim() : '';
  const en = typeof value.en === 'string' ? value.en.trim() : '';
  return zh && en ? { zh, en } : null;
}

const copyBi = (value) => (value ? { zh: value.zh, en: value.en } : null);

function presetModel(example, base) {
  const preset = PRESETS[example];
  const roles = {};
  for (const key of ROLE_KEYS) roles[key] = copyBi(preset.roles[key]);
  return {
    ...base,
    example,
    roles,
    short: { neutral: copyBi(preset.short.neutral), us: copyBi(preset.short.us) },
    name: copyBi(preset.name),
    source: copyBi(preset.source),
    noResponse: copyBi(preset.noResponse),
    pairings: copyBi(preset.pairings),
    note: copyBi(preset.note),
    caveat: copyBi(preset.caveat),
    fallbackRoles: [],
  };
}

/**
 * Reads a content config defensively into the widget model:
 * { title, customTitle, example, notation, roles: {neutral, us, ur, cr}, short: {neutral, us}, name, source,
 *   noResponse, pairings, note, caveat, fallbackRoles, usedDefault }.
 * - `example` must be exactly "pavlov", "little-albert", "taste-aversion" or "custom"; anything else (or none) shows
 *   "pavlov" with usedDefault true. `notation` must be exactly "us" or "ucs"; anything else is "us".
 * - `title` is used when it is an object with non-empty zh and en strings, like every label the validator accepts;
 *   otherwise the default title 经典条件反射 / Classical conditioning is shown.
 * - `roles` are read only for "custom": each of neutral, us, ur and cr that is a usable label is kept, and each
 *   missing or unusable one falls back to the Pavlov preset's role (listed in fallbackRoles). With no usable role at
 *   all the whole Pavlov preset is shown (usedDefault true). The custom example has no name, source, note or caveat.
 * Never throws; every label comes back as a fresh { zh, en } copy with trimmed strings.
 * 防御性读取内容配置，得到组件模型（字段见上）。
 * - example 必须正好是 "pavlov"、"little-albert"、"taste-aversion" 或 "custom"；其他值或缺失时显示 "pavlov"，usedDefault 为 true。
 *   notation 必须正好是 "us" 或 "ucs"；其他值一律按 "us"。
 * - title 是 zh 和 en 都非空的对象时才使用（与校验器接受的标签一致）；否则显示默认标题“经典条件反射 / Classical conditioning”。
 * - roles 只在 "custom" 时读取：neutral、us、ur、cr 中可用的标签照用，缺失或不可用的换成巴甫洛夫例子的对应角色（列在
 *   fallbackRoles 中）；一个可用的都没有时，整个显示巴甫洛夫例子（usedDefault 为 true）。自定义例子没有名称、出处、要点和提醒。
 * 不会抛出异常；每个标签都是新的 { zh, en } 副本，字符串已去掉首尾空格。
 */
export function normalizeClassicalConditioningConfig(config) {
  const source = isPlainObject(config) ? config : {};
  const title = readBi(source.title);
  const base = {
    title: title ?? { ...DEFAULT_TITLE },
    customTitle: Boolean(title),
    notation: NOTATIONS.includes(source.notation) ? source.notation : DEFAULT_NOTATION,
    usedDefault: false,
  };
  const example = EXAMPLES.includes(source.example) ? source.example : null;
  if (example === null) return { ...presetModel(DEFAULT_EXAMPLE, base), usedDefault: true };
  if (example !== 'custom') return presetModel(example, base);

  const given = isPlainObject(source.roles) ? source.roles : {};
  const roles = {};
  const fallbackRoles = [];
  for (const key of ROLE_KEYS) {
    const label = readBi(given[key]);
    roles[key] = label ?? copyBi(PRESETS.pavlov.roles[key]);
    if (!label) fallbackRoles.push(key);
  }
  if (fallbackRoles.length === ROLE_KEYS.length) return { ...presetModel(DEFAULT_EXAMPLE, base), usedDefault: true };
  return {
    ...base,
    example: 'custom',
    roles,
    short: { neutral: copyBi(roles.neutral), us: copyBi(roles.us) },
    name: null,
    source: null,
    noResponse: null,
    pairings: copyBi(CUSTOM_DETAILS.pairings),
    note: null,
    caveat: null,
    fallbackRoles,
  };
}

// Text builders take a normalized model; anything else is read as a config first.
// 文字构建函数接收规范化后的模型；传入其他值时先按配置读取。
function ensureModel(model) {
  const usable = isPlainObject(model) && isPlainObject(model.roles) && isPlainObject(model.short)
    && ROLE_KEYS.every((key) => readBi(model.roles[key])) && readBi(model.short.neutral) && readBi(model.short.us);
  return usable ? model : normalizeClassicalConditioningConfig(model);
}

/* ---------- Notation and terms 记号与术语 ---------- */

/**
 * The abbreviations of one notation: the textbook's US and UR ("us") or the lecture's UCS and UCR ("ucs"). CS and CR
 * are the same in both; NS is the neutral stimulus, as in the textbook's quiz. Unknown notations read as "us".
 * 一种记号下的缩写：教材的 US、UR（"us"）或讲课的 UCS、UCR（"ucs"）。CS、CR 两边一样；NS 是中性刺激，与教材小测验一致。
 * 未知记号按 "us" 处理。
 */
export function notationLabels(notation) {
  const lecture = notation === 'ucs';
  return Object.freeze({ neutral: 'NS', us: lecture ? 'UCS' : 'US', ur: lecture ? 'UCR' : 'UR', cs: 'CS', cr: 'CR', none: '' });
}

// Full names of the storyboard's elements. 三格图中各元素的全称。
export const ROLE_TERMS = deepFreeze({
  neutral: { zh: '中性刺激', en: 'neutral stimulus' },
  us: { zh: '无条件刺激', en: 'unconditioned stimulus' },
  ur: { zh: '无条件反应', en: 'unconditioned response' },
  cs: { zh: '条件刺激', en: 'conditioned stimulus' },
  cr: { zh: '条件反应', en: 'conditioned response' },
  none: { zh: '没有反应', en: 'no response' },
});

// Which colour family an element belongs to: unconditioned (US, UR), conditioned (CS, CR), neutral, or no response.
// 元素所属的颜色组：无条件（US、UR）、条件（CS、CR）、中性，或没有反应。
const ROLE_FAMILY = Object.freeze({
  neutral: 'neutral', us: 'unconditioned', ur: 'unconditioned', cs: 'conditioned', cr: 'conditioned', none: 'none',
});

/**
 * The textbook's and the lecture's notations as the toggle offers them, and what the live region says after a switch.
 * 切换按钮提供的两种记号（教材与讲课），以及切换后朗读区域播报的内容。
 */
export const NOTATION_OPTIONS = deepFreeze({
  us: {
    label: { zh: '教材写法：US、UR', en: 'Textbook: US, UR' },
    announce: { zh: '现在用教材的写法：US、UR、CS、CR。', en: 'Now using the textbook notation: US, UR, CS, CR.' },
  },
  ucs: {
    label: { zh: '讲课写法：UCS、UCR', en: 'Lecture: UCS, UCR' },
    announce: { zh: '现在用讲课的写法：UCS、UCR、CS、CR。', en: 'Now using the lecture notation: UCS, UCR, CS, CR.' },
  },
});

export const NOTATION_NOTE = deepFreeze({
  zh: '讲课幻灯片写 **UCS**、**UCR**，教材写 **US**、**UR**，意思完全一样；CS 和 CR 两边写法相同。',
  en: 'The lecture writes UCS and UCR, the textbook US and UR: they mean the same. CS and CR are written the same in both.',
});

/**
 * The key under the storyboard: each abbreviation in the chosen notation, its full name and its meaning, in words
 * close to the textbook's definitions (pp. 210-211).
 * 三格图下方的记号说明：所选记号下的每个缩写、全称和意思，措辞贴近教材的定义（第 210-211 页）。
 */
export function termKey(notation) {
  const n = notationLabels(notation);
  const meanings = {
    neutral: {
      zh: '配对之前，不会引起这种反应的刺激。',
      en: 'A stimulus that does not produce the response before the pairings.',
    },
    us: {
      zh: '不需要事先学习，就能引起反应的刺激。',
      en: 'A stimulus that produces a response without any prior learning.',
    },
    ur: {
      zh: `由 ${n.us} 自动引起、不用学习的反应。`,
      en: `An unlearned reaction that the ${n.us} elicits automatically.`,
    },
    cs: {
      zh: `原来的中性刺激；和 ${n.us} 配对以后，它能引起 CR。`,
      en: `A previously neutral stimulus that comes to elicit the CR after being paired with the ${n.us}.`,
    },
    cr: {
      zh: `CS–${n.us} 配对以后，对 CS 学会的反应；通常比 ${n.ur} 弱。`,
      en: `The learned response to the CS after CS–${n.us} pairings; usually weaker than the ${n.ur}.`,
    },
  };
  return ['neutral', 'us', 'ur', 'cs', 'cr'].map((role) => ({
    role,
    family: ROLE_FAMILY[role],
    abbr: n[role],
    term: { ...ROLE_TERMS[role] },
    meaning: meanings[role],
  }));
}

/* ---------- Storyboard 三格图 ---------- */

export const STAGE_TITLES = deepFreeze({
  before: { zh: '条件反射建立前', en: 'Before conditioning' },
  during: { zh: '条件反射建立中：配对', en: 'During conditioning: pairing' },
  after: { zh: '条件反射建立后', en: 'After conditioning' },
});

// Words on the arrows and plus signs between the storyboard's elements. 三格图元素之间的箭头和加号上的文字。
export const CONNECTORS = deepFreeze({
  produces: { zh: '引起', en: 'produces' },
  paired: { zh: '配对', en: 'paired with' },
});

/**
 * The before / during / after storyboard of Figure 6.2 (p. 212) for one example:
 * - before: the US produces the UR, and the neutral stimulus produces no response;
 * - during: the neutral stimulus is paired with the US (as often as the example says), and the UR follows;
 * - after: the former neutral stimulus is now the CS and produces the CR.
 * Each element is { role, family, abbr, term, item }: its abbreviation in `notation`, its full name and the example's
 * own thing (null for the custom example's "no response").
 * 一个例子的“建立前 / 建立中 / 建立后”三格图（与第 212 页图 6.2 一致）：
 * - 建立前：US 引起 UR，中性刺激不引起反应；
 * - 建立中：中性刺激和 US 配对（次数按例子说的），随后出现 UR；
 * - 建立后：原来的中性刺激成为 CS，能引起 CR。
 * 每个元素是 { role, family, abbr, term, item }：notation 下的缩写、全称和例子里的具体东西（自定义例子的“没有反应”为 null）。
 */
export function storyboard(model, notation) {
  const m = ensureModel(model);
  const n = notationLabels(notation);
  const items = {
    neutral: m.roles.neutral, us: m.roles.us, ur: m.roles.ur, cs: m.roles.neutral, cr: m.roles.cr, none: m.noResponse,
  };
  const element = (role) => ({
    role,
    family: ROLE_FAMILY[role],
    abbr: n[role],
    term: { ...ROLE_TERMS[role] },
    item: copyBi(items[role]),
  });
  return [
    {
      id: 'before',
      title: { ...STAGE_TITLES.before },
      rows: [
        { stimuli: [element('us')], response: element('ur') },
        { stimuli: [element('neutral')], response: element('none') },
      ],
      note: {
        zh: `${n.us} 不用学习就能引起 ${n.ur}；中性刺激这时还不会引起这种反应。`,
        en: `The ${n.us} produces the ${n.ur} without any learning, while the neutral stimulus does not produce this response yet.`,
      },
    },
    {
      id: 'during',
      title: { ...STAGE_TITLES.during },
      rows: [{ stimuli: [element('neutral'), element('us')], response: element('ur') }],
      note: copyBi(m.pairings),
    },
    {
      id: 'after',
      title: { ...STAGE_TITLES.after },
      rows: [{ stimuli: [element('cs')], response: element('cr') }],
      note: {
        zh: '原来的中性刺激现在成了 CS：它单独出现，就能引起 CR。',
        en: 'The former neutral stimulus is now the CS: on its own it produces the CR.',
      },
    },
  ];
}

/**
 * The exam answer to "identify the US, UR, CS and CR" for the example, in the chosen notation.
 * 例子的考试答案：“找出 US、UR、CS 和 CR”，使用所选记号。
 */
export function examAnswer(model, notation) {
  const m = ensureModel(model);
  const n = notationLabels(notation);
  const { neutral, us, ur, cr } = m.roles;
  return {
    heading: {
      zh: `考试这样写：找出 ${n.us}、${n.ur}、CS 和 CR`,
      en: `Write it like this: name the ${n.us}, ${n.ur}, CS and CR`,
    },
    en: `${n.us}: ${us.en}. ${n.ur}: ${ur.en}. CS: ${neutral.en} (before the pairings it was a neutral stimulus). CR: ${cr.en}.`,
    zh: `${n.us}（无条件刺激）：${us.zh}。${n.ur}（无条件反应）：${ur.zh}。CS（条件刺激）：${neutral.zh}（配对之前它是中性刺激）。CR（条件反应）：${cr.zh}。`,
  };
}

/* ---------- Simulator 模拟器 ---------- */

// Rules of the simplified curve (see the module comment). 简化曲线的规则（见模块开头的说明）。
export const RATES = Object.freeze({ acquisition: 0.3, extinction: 0.3 });
export const RECOVERY_SHARE = 0.5;
export const RECOVERY_MIN = 0.08;
// Below this the CR counts as almost gone; at or above NEAR_MAX_LEVEL a pairing adds little.
// 低于这个值算作 CR 几乎消失；达到 NEAR_MAX_LEVEL 以后每次配对增加得很少。
export const EXTINGUISHED_LEVEL = 0.1;
export const NEAR_MAX_LEVEL = 0.9;
// A peak below this means nothing has been learned yet. 峰值低于这个值说明还没有学到任何东西。
export const LEARNED_MIN = 0.005;
// Steps after the start (trials and rests) the chart holds. 图上能放的步数（不含起点；试次与休息都算）。
export const MAX_STEPS = 48;
export const SIM_ACTIONS = Object.freeze(['pair', 'cs-alone', 'rest']);
// Figure 6.3 (p. 214) step by step: acquisition, extinction, a rest, then the CS alone again.
// 按图 6.3（第 214 页）一步步走：习得、消退、休息，再只给 CS。
export const DEMO_COUNTS = Object.freeze({ pairings: 8, extinction: 8, afterRest: 6 });

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * The simulator before any trial: CR strength 0, one start point on the chart.
 * State: { strength, peak (what a rest can return toward), highest (highest strength so far), trials, recoveries
 * (spontaneous recoveries since the last pairing), extinctionSince (CS-alone trials that lowered the CR since the last
 * pairing or recovery), recovering (CS-alone trials now belong to the spontaneous-recovery stage),
 * steps: [{ kind, phase, trial, before, strength }], event }.
 * 还没有任何试次的模拟器：CR 强度为 0，图上只有一个起点。各字段：strength 当前强度；peak 休息能回到的峰值；highest 到目前为止的
 * 最高强度；trials 试次数；recoveries 上次配对以来的自发恢复次数；extinctionSince 上次配对或恢复以来让 CR 下降的“只给 CS”次数；
 * recovering 之后的“只给 CS”属于自发恢复阶段；steps 每一步；event 刚才发生了什么。
 */
export function initialSimulation() {
  return {
    strength: 0,
    peak: 0,
    highest: 0,
    trials: 0,
    recoveries: 0,
    extinctionSince: 0,
    recovering: false,
    steps: [{ kind: 'start', phase: 'start', trial: 0, before: 0, strength: 0 }],
    event: { type: 'start', before: 0, after: 0 },
  };
}

function isSimulation(state) {
  return isPlainObject(state) && Number.isFinite(state.strength) && Array.isArray(state.steps) && state.steps.length > 0
    && Number.isFinite(state.peak) && Number.isFinite(state.trials);
}

export function isFull(state) {
  return isSimulation(state) && state.steps.length - 1 >= MAX_STEPS;
}

function pair(state) {
  const before = state.strength;
  const after = clamp01(before + RATES.acquisition * (1 - before));
  const trials = state.trials + 1;
  // A pairing after an extinction or a recovery starts its cycle from the CR it reaches now, so a later rest returns
  // toward this cycle's own peak and never lifts the CR above the level it had before its extinction.
  // 消退或恢复之后的配对，从它现在达到的 CR 开始新的一轮；之后的休息只回到这一轮自己的峰值，CR 不会高于消退之前的水平。
  const newCycle = state.extinctionSince > 0 || state.recoveries > 0;
  return {
    ...state,
    strength: after,
    peak: newCycle ? after : Math.max(state.peak, after),
    highest: Math.max(state.highest, after),
    trials,
    // A pairing starts a new cycle of extinction and recovery. 一次配对开始新一轮的消退与恢复。
    recoveries: 0,
    extinctionSince: 0,
    recovering: false,
    steps: [...state.steps, { kind: 'pair', phase: 'acquisition', trial: trials, before, strength: after }],
    // A pairing after an extinction relearns the CR. 消退以后的配对是重新学会 CR。
    event: { type: 'acquisition', before, after, again: state.steps.some((step) => step.phase === 'extinction' || step.phase === 'recovery') },
  };
}

function csAlone(state) {
  const before = state.strength;
  const trials = state.trials + 1;
  if (state.peak < LEARNED_MIN) {
    return {
      ...state,
      trials,
      steps: [...state.steps, { kind: 'cs-alone', phase: 'neutral', trial: trials, before, strength: before }],
      event: { type: 'neutral', before, after: before },
    };
  }
  const after = clamp01(before - RATES.extinction * before);
  const phase = state.recovering ? 'recovery' : 'extinction';
  return {
    ...state,
    strength: after,
    trials,
    extinctionSince: state.extinctionSince + 1,
    steps: [...state.steps, { kind: 'cs-alone', phase, trial: trials, before, strength: after }],
    event: { type: state.recovering ? 'extinction-again' : 'extinction', before, after, gone: after < EXTINGUISHED_LEVEL },
  };
}

function rest(state) {
  const before = state.strength;
  const step = (after) => ({ kind: 'rest', phase: 'rest', trial: null, before, strength: after });
  if (state.peak < LEARNED_MIN) {
    return { ...state, steps: [...state.steps, step(before)], event: { type: 'rest-unlearned', before, after: before } };
  }
  if (state.extinctionSince === 0) {
    return {
      ...state,
      steps: [...state.steps, step(before)],
      event: { type: 'rest-unchanged', before, after: before, afterRecovery: state.recovering },
    };
  }
  // The first recovery of a cycle always happens; later ones fade until they stop (p. 214). Recovery has stopped
  // once even a CR extinguished to 0% would come back by less than RECOVERY_MIN. The peak only falls until the next
  // pairing, so once stopped it stays stopped; a shallow extinction is no reason to stop, it only leaves less to recover.
  // 每一轮的第一次恢复一定会发生；之后的恢复越来越弱，直到停止（第 214 页）。即使 CR 已经消退到 0%，回升也不到
  // RECOVERY_MIN 时，自发恢复就停止了。峰值在下一次配对之前只会下降，所以一旦停止就一直停止；消退得浅不是停止的理由，
  // 只是能恢复的部分少一些。
  if (state.recoveries > 0 && RECOVERY_SHARE * state.peak < RECOVERY_MIN) {
    return {
      ...state,
      recovering: false,
      steps: [...state.steps, step(before)],
      event: { type: 'recovery-ceased', before, after: before },
    };
  }
  const after = clamp01(before + RECOVERY_SHARE * (state.peak - before));
  const recoveries = state.recoveries + 1;
  return {
    ...state,
    strength: after,
    peak: after,
    recoveries,
    extinctionSince: 0,
    recovering: true,
    steps: [...state.steps, step(after)],
    event: { type: 'recovery', before, after, earlierPeak: state.peak, count: recoveries },
  };
}

/**
 * The simulator's pure reducer. `action` is "pair" (pair the CS with the US), "cs-alone", "rest" (a day later) or
 * "reset", as a string or as { type }. It never changes `state`; it returns a new state whose `event` says what just
 * happened. A full chart (MAX_STEPS steps) answers every action but reset with the event "full" and no new step;
 * an unknown action returns the state unchanged; a state that is not a simulation is read as the initial one.
 * 模拟器的纯函数状态更新。action 是 "pair"（CS 与 US 配对）、"cs-alone"（只给 CS）、"rest"（休息，隔一天）或 "reset"，
 * 可以是字符串，也可以是 { type }。它从不修改 state，而是返回新状态，其中 event 说明刚才发生了什么。图满了（MAX_STEPS 步）
 * 以后，除了 reset，其他操作都返回 event 为 "full" 的状态，不增加新的一步；未知操作原样返回；不是模拟器状态的输入按初始状态处理。
 */
export function simulate(state, action) {
  const current = isSimulation(state) ? state : initialSimulation();
  const type = typeof action === 'string' ? action : (isPlainObject(action) ? action.type : null);
  if (type === 'reset') return { ...initialSimulation(), event: { type: 'reset', before: 0, after: 0 } };
  if (!SIM_ACTIONS.includes(type)) return current;
  if (isFull(current)) return { ...current, event: { type: 'full', before: current.strength, after: current.strength } };
  if (type === 'pair') return pair(current);
  if (type === 'cs-alone') return csAlone(current);
  return rest(current);
}

/** Applies a list of actions in order, starting from `state` (default: the initial state). 从 state（默认初始状态）开始依次执行一串操作。 */
export function runActions(actions, state = initialSimulation()) {
  return (Array.isArray(actions) ? actions : []).reduce((current, action) => simulate(current, action), state);
}

/** The actions of the Figure 6.3 demonstration. 图 6.3 演示的操作序列。 */
export function figureSequence() {
  return [
    ...Array(DEMO_COUNTS.pairings).fill('pair'),
    ...Array(DEMO_COUNTS.extinction).fill('cs-alone'),
    'rest',
    ...Array(DEMO_COUNTS.afterRest).fill('cs-alone'),
  ];
}

/** The simulator after the Figure 6.3 demonstration, with the event "demo". 走完图 6.3 演示后的模拟器，event 为 "demo"。 */
export function demoSimulation() {
  const state = runActions(figureSequence());
  return { ...state, event: { type: 'demo', before: 0, after: state.strength } };
}

/* ---------- Stages of the curve 曲线的阶段 ---------- */

/**
 * Names of the stages of Figure 6.3, plus "neutral" for the CS alone before any pairing.
 * 图 6.3 中各阶段的名称，另加 "neutral"：还没配对过就只给 CS。
 */
export const PHASES = deepFreeze({
  acquisition: { name: { zh: '习得', en: 'Acquisition' } },
  extinction: { name: { zh: '消退', en: 'Extinction' }, what: { zh: '只给 CS', en: 'CS alone' } },
  rest: { name: { zh: '休息', en: 'Rest' }, what: { zh: '隔一天，没有试次', en: 'a day later, no trials' } },
  recovery: { name: { zh: '自发恢复', en: 'Spontaneous recovery' }, what: { zh: '只给 CS', en: 'CS alone' } },
  neutral: { name: { zh: '仍是中性刺激', en: 'Still neutral' }, what: { zh: '只给 CS，从未配对', en: 'CS alone, never paired' } },
});

const REST_RESULTS = deepFreeze({
  recovered: { zh: '自发恢复', en: 'spontaneous recovery' },
  unchanged: { zh: '没有变化', en: 'no change' },
});

/**
 * Consecutive steps of the same stage, numbered from 1 like the bands of the chart:
 * [{ number, phase, start, end (step indexes), firstTrial, lastTrial (null for rests), from, to, recovered }].
 * The start point belongs to no stage. A rest stage is `recovered` when one of its rests brought the CR back.
 * 同一阶段的连续步骤，像图上的色块一样从 1 开始编号；起点不属于任何阶段。休息阶段里只要有一次休息让 CR 回升，recovered 就为 true。
 */
export function phaseRuns(steps) {
  const runs = [];
  (Array.isArray(steps) ? steps : []).forEach((step, index) => {
    if (!isPlainObject(step) || !PHASES[step.phase]) return;
    const rose = step.kind === 'rest' && step.strength > step.before;
    const trial = Number.isFinite(step.trial) ? step.trial : null;
    const last = runs[runs.length - 1];
    if (last && last.phase === step.phase && last.end === index - 1) {
      last.end = index;
      last.to = step.strength;
      if (trial !== null) {
        if (last.firstTrial === null) last.firstTrial = trial;
        last.lastTrial = trial;
      }
      last.recovered = last.recovered || rose;
      return;
    }
    runs.push({
      number: runs.length + 1,
      phase: step.phase,
      start: index,
      end: index,
      firstTrial: trial,
      lastTrial: trial,
      from: step.before,
      to: step.strength,
      recovered: rose,
    });
  });
  return runs;
}

/** CR strength as a whole percentage, e.g. 0.9424 -> "94%". CR 强度写成整数百分比，例如 0.9424 写作 "94%"。 */
export function formatStrength(value) {
  const number = Number.isFinite(value) ? clamp01(value) : 0;
  return `${roundTo(number * 100, 0)}%`;
}

/**
 * What the list under the chart says about one stage: { number, phase, name, what, range, change, result }.
 * `what` is what was presented, `range` the trial numbers (null for a rest), `change` the CR before and after, and
 * `result` whether a rest brought spontaneous recovery (null for trials).
 * 图下方列表里关于一个阶段的文字：名称、呈现了什么、试次编号（休息为 null）、CR 的前后变化，以及休息有没有带来自发恢复（试次为 null）。
 */
export function phaseText(run, notation) {
  const n = notationLabels(notation);
  const phase = PHASES[run?.phase] ? run.phase : 'extinction';
  const what = phase === 'acquisition'
    ? { zh: `CS 与 ${n.us} 配对`, en: `CS–${n.us} paired` }
    : { ...PHASES[phase].what };
  let range = null;
  if (Number.isFinite(run?.firstTrial) && Number.isFinite(run?.lastTrial)) {
    range = run.firstTrial === run.lastTrial
      ? { zh: `第 ${run.firstTrial} 次试次`, en: `trial ${run.firstTrial}` }
      : { zh: `第 ${run.firstTrial}–${run.lastTrial} 次试次`, en: `trials ${run.firstTrial}–${run.lastTrial}` };
  }
  return {
    number: run?.number ?? 1,
    phase,
    name: { ...PHASES[phase].name },
    what,
    range,
    change: `CR ${formatStrength(run?.from)} → ${formatStrength(run?.to)}`,
    result: phase === 'rest' ? { ...(run?.recovered ? REST_RESULTS.recovered : REST_RESULTS.unchanged) } : null,
  };
}

/* ---------- Sentences 句子 ---------- */

/** Button labels in the chosen notation. 所选记号下的按钮文字。 */
export function actionLabel(action, notation) {
  const n = notationLabels(notation);
  const labels = {
    pair: { zh: `配对 CS + ${n.us}`, en: `Pair CS + ${n.us}` },
    'cs-alone': { zh: '只给 CS', en: 'CS alone' },
    rest: { zh: '休息（隔一天）', en: 'Rest (a day later)' },
    reset: { zh: '重置', en: 'Reset' },
    demo: { zh: '按教材图 6.3 走一遍', en: 'Run the Figure 6.3 sequence' },
  };
  return labels[action] ?? labels.reset;
}

/** The line above the chart: trials so far and the CR strength now. 图上方的一行：已做的试次和现在的 CR 强度。 */
export function statusText(state) {
  const current = isSimulation(state) ? state : initialSimulation();
  const strength = formatStrength(current.strength);
  return {
    zh: `试次：${current.trials} 次 · 现在的 CR 强度：${strength}`,
    en: `Trials: ${current.trials} · CR strength now: ${strength}`,
  };
}

/**
 * The sentence under the chart naming what just happened, in the textbook's terms (acquisition, extinction,
 * spontaneous recovery), with the example's own CS and US and the chosen notation. Markup: **bold** only.
 * 图下方说明刚才发生了什么的句子：使用教材的术语（习得、消退、自发恢复）、例子自己的 CS 和 US，以及所选记号。只用 **粗体** 标记。
 */
export function eventSentence(event, model, notation) {
  const m = ensureModel(model);
  const n = notationLabels(notation);
  const cs = m.short.neutral;
  const us = m.short.us;
  const type = isPlainObject(event) ? event.type : 'start';
  const a = formatStrength(event?.before);
  const b = formatStrength(event?.after);
  const pairLabel = actionLabel('pair', notation);
  switch (type) {
    case 'reset':
      return {
        zh: `已重置：回到开始。中性刺激（${cs.zh}）还不会引起 CR，CR 强度是 0%。`,
        en: `Reset: back to the start. The neutral stimulus (${cs.en}) produces no CR yet, so the CR strength is 0%.`,
      };
    case 'acquisition': {
      const tail = event.after >= NEAR_MAX_LEVEL
        ? { zh: '越接近 100%，每次配对增加得越少。', en: ' Close to 100%, each pairing adds less.' }
        : { zh: '', en: '' };
      if (event.again) {
        return {
          zh: `再次配对：CS（${cs.zh}）又和 ${n.us}（${us.zh}）一起出现，CR 强度从 ${a} 升到 ${b}，又一次**习得**（**acquisition**）。${tail.zh}`,
          en: `Paired again: the CS (${cs.en}) came with the ${n.us} (${us.en}) once more, so the CR strength rose from ${a} to ${b} (**acquisition** again).${tail.en}`,
        };
      }
      return {
        zh: `**习得**（**acquisition**）：CS（${cs.zh}）和 ${n.us}（${us.zh}）配对出现，CR 强度从 ${a} 升到 ${b}。${tail.zh}`,
        en: `**Acquisition**: the CS (${cs.en}) was paired with the ${n.us} (${us.en}), so the CR strength rose from ${a} to ${b}.${tail.en}`,
      };
    }
    case 'extinction':
      return {
        zh: `**消退**（**extinction**）：CS（${cs.zh}）单独出现，没有 ${n.us}（${us.zh}），CR 强度从 ${a} 降到 ${b}。`
          + (event.gone ? 'CR 几乎没有了。现在试试“休息（隔一天）”。' : ''),
        en: `**Extinction**: the CS (${cs.en}) came alone, without the ${n.us} (${us.en}), so the CR strength fell from ${a} to ${b}.`
          + (event.gone ? ' The CR is almost gone. Now try Rest (a day later).' : ''),
      };
    case 'extinction-again':
      return {
        zh: `**自发恢复**阶段：CS（${cs.zh}）还是单独出现、没有 ${n.us}，恢复回来的 CR 又在减弱（再次消退），从 ${a} 降到 ${b}。`
          + (event.gone ? '再休息一次看看：下一次恢复会更弱，最后会停止。' : ''),
        en: `**Spontaneous recovery** stage: the CS (${cs.en}) still comes without the ${n.us}, so the recovered CR weakens again (extinction again), from ${a} to ${b}.`
          + (event.gone ? ' Rest again: the next recovery is weaker, and in the end recovery stops.' : ''),
      };
    case 'neutral':
      return {
        zh: `中性刺激（${cs.zh}）单独出现，可它从来没有和 ${n.us}（${us.zh}）配对过，所以不会引起 CR（0%）。`,
        en: `The neutral stimulus (${cs.en}) came alone, but it has never been paired with the ${n.us} (${us.en}), so it produces no CR (0%).`,
      };
    case 'recovery': {
      const peak = formatStrength(event.earlierPeak);
      if (event.count > 1) {
        return {
          zh: `又一次**自发恢复**：CR 回到 ${b}，比上一次恢复（${peak}）还弱。只要 CS 一直单独出现，自发恢复就越来越弱，最后停止。`,
          en: `**Spontaneous recovery** again: the CR came back to ${b}, weaker than the last recovery (${peak}). While the CS keeps coming alone, spontaneous recovery gets weaker and finally stops.`,
        };
      }
      return {
        zh: `**自发恢复**（**spontaneous recovery**）：隔了一天，没有任何新的配对，已经消退的 CR 又回到了 ${b}，但比之前的峰值 ${peak} 弱。再按“只给 CS”，它会再次消退。`,
        en: `**Spontaneous recovery**: a day later, with no new pairing, the extinguished CR came back to ${b}, weaker than its earlier peak of ${peak}. Present the CS alone and it extinguishes again.`,
      };
    }
    case 'recovery-ceased':
      return {
        zh: `这次没有自发恢复：CS 一次又一次单独出现以后，自发恢复越来越弱，现在已经停止了（CR ${b}）。`,
        en: `No spontaneous recovery this time: after the CS came alone again and again, spontaneous recovery became weaker and has now stopped (CR ${b}).`,
      };
    case 'rest-unlearned':
      return {
        zh: '休息了一天：还没有学到任何联结，没有什么可以恢复，CR 仍是 0%。',
        en: 'A day of rest: no association has been learned yet, so nothing can recover; the CR is still 0%.',
      };
    case 'rest-unchanged':
      if (event.afterRecovery) {
        return {
          zh: `休息了一天：CR 刚刚已经自发恢复过，仍是 ${b}。先按“只给 CS”让它再次消退，再休息。`,
          en: `A day of rest: the CR has just recovered and stays at ${b}. Present the CS alone to extinguish it again, then rest.`,
        };
      }
      return {
        zh: `休息了一天：CR 没有被消退过，没有什么需要恢复，仍是 ${b}。先按“只给 CS”让它消退，再休息。`,
        en: `A day of rest: the CR was not extinguished, so there is nothing to recover; it stays at ${b}. Present the CS alone first, then rest.`,
      };
    case 'full':
      return {
        zh: `图已经满了（最多 ${MAX_STEPS} 步）。按“重置”重新开始。`,
        en: `The chart is full (${MAX_STEPS} steps at most). Press Reset to start again.`,
      };
    case 'demo':
      return {
        zh: `和教材图 6.3 的顺序一样（次数是这里自己定的）：**习得**（配对 ${DEMO_COUNTS.pairings} 次），**消退**（只给 CS ${DEMO_COUNTS.extinction} 次），`
          + `休息一天后**自发恢复**，再只给 CS ${DEMO_COUNTS.afterRest} 次，恢复的 CR 又减弱。`,
        en: `Same order as Figure 6.3 (the numbers of trials are this demo's own): acquisition (${DEMO_COUNTS.pairings} pairings), `
          + `extinction (${DEMO_COUNTS.extinction} CS-alone trials), spontaneous recovery after a day of rest, `
          + `then ${DEMO_COUNTS.afterRest} more CS-alone trials in which the recovered CR weakens again.`,
      };
    default:
      return {
        zh: `还没开始：中性刺激（${cs.zh}）还不会引起 CR，所以 CR 强度是 0%。先按“${pairLabel.zh}”。`,
        en: `Not started: the neutral stimulus (${cs.en}) produces no CR yet, so the CR strength is 0%. Start with ${pairLabel.en}.`,
      };
  }
}

/** Live-region text: the Chinese, then the English, without markup. 朗读区域的文字：先中文后英文，去掉标记符号。 */
export function announcementText(value) {
  const zh = stripMarkup(value?.zh ?? '').trim();
  const en = stripMarkup(value?.en ?? '').trim();
  return [zh, en].filter(Boolean).join(' ');
}

/** The rule card of the simplified curve, built from the constants it describes. 简化曲线的规则说明，由它描述的常数生成。 */
export function simplifiedNote() {
  const rate = roundTo(RATES.acquisition * 100, 0);
  const drop = roundTo(RATES.extinction * 100, 0);
  return {
    zh: `**简化示意**：曲线按简单规则画出，不是真实数据。每次配对，CR 强度增加“离 100% 还差的部分”的 ${rate}%；`
      + `每次只给 CS，减少当前强度的 ${drop}%；消退后休息一天，CR 回到当前强度和之前峰值的正中间，所以比峰值弱。`
      + '每次恢复都比上一次弱；能恢复的量很小时就不再恢复，直到下一次配对。',
    en: `**Simplified illustration**: the curve follows simple rules, not real data. Each pairing adds ${rate}% of the gap to 100%; `
      + `each CS-alone trial removes ${drop}% of the current strength; a rest after extinction brings the CR halfway back to its earlier peak, `
      + 'so it stays weaker than the peak. Every recovery is weaker than the one before; once recovery could only be very small, '
      + 'it stops until the next pairing.',
  };
}

/**
 * Fixed words of the widget, kept here so every visible string is tested with the rest.
 * 组件中固定不变的文字，放在这里，让所有可见文字都和其他文字一起接受测试。
 */
export const UI_TEXT = deepFreeze({
  eyebrow: { zh: '互动演示', en: 'Interactive' },
  intro: {
    zh: '先看三格图：条件反射建立前、建立中、建立后，每个刺激和反应都标出了名字。再到下面的模拟器里自己做试次，看条件反应（CR）的强度怎么变化。',
    en: 'First read the three panels: before, during and after conditioning, with every stimulus and response labelled. Then run trials in the simulator below and watch how the strength of the conditioned response (CR) changes.',
  },
  example: { zh: '例子', en: 'Example' },
  notation: { zh: '记号', en: 'Notation' },
  storyboardHeading: { zh: '三格图：条件反射是怎么建立的', en: 'Storyboard: how conditioning happens' },
  keyHeading: { zh: '记号和术语：点开看每个缩写的意思', en: 'Symbols and terms: open to see what each abbreviation means' },
  noteLabel: { zh: '要点', en: 'Key point' },
  simulatorHeading: { zh: '试次模拟器：习得、消退和自发恢复', en: 'Trial simulator: acquisition, extinction and spontaneous recovery' },
  simplified: { zh: '简化示意', en: 'Simplified illustration' },
  instructions: {
    zh: '用按钮一步一步做实验：先配对几次，再只给 CS 几次，然后休息一天，看曲线怎么变。不知道按什么，就按“按教材图 6.3 走一遍”。',
    en: 'Use the buttons to run the experiment step by step: pair a few times, present the CS alone a few times, then rest for a day and watch the curve. Not sure where to start? Press Run the Figure 6.3 sequence.',
  },
  controls: { zh: '实验操作', en: 'Experiment controls' },
  chartGuide: {
    zh: '纵轴：条件反应（CR）的强度，0% 到 100%。横轴：每一步（一次试次或一次休息），下面的数字是试次编号。每个点 = 这一步之后的 CR 强度；连到空心点的虚线 = 休息，没有试次；自发恢复以后，横向虚线标出之前的峰值。色块上的数字对应下面的阶段列表。',
    en: 'Vertical axis: strength of the conditioned response (CR), from 0% to 100%. Horizontal axis: each step (a trial or a rest); the numbers below are trial numbers. Each dot is the CR strength after that step; a dashed line to a hollow dot is a rest with no trials; after a spontaneous recovery, a horizontal dashed line marks the earlier peak. The numbers on the coloured bands match the list of stages below.',
  },
  happened: { zh: '刚才发生了什么', en: 'What just happened' },
  stages: { zh: '阶段', en: 'Stages' },
  noTrials: { zh: '还没有试次。', en: 'No trials yet.' },
  peak: { zh: '峰值', en: 'peak' },
  chart: { zh: '条件反应强度折线图（简化示意）', en: 'Line chart of CR strength (simplified illustration)' },
});

/* ---------- Chart geometry 图的几何 ---------- */

// Layout of the chart in pixels: margins for the stage numbers (top), trial numbers (bottom) and percentages (left);
// at least MIN_SLOTS steps wide so the first points are not spread across the whole width.
// 图的布局（像素）：上边留给阶段编号，下边留给试次编号，左边留给百分比；至少按 minSlots 步的宽度画，前几个点不会被拉满整个宽度。
export const CHART = Object.freeze({
  height: 236,
  top: 30,
  bottom: 30,
  left: 44,
  right: 14,
  minWidth: 240,
  minSlots: 12,
  labelGap: 22,
  numberGap: 16,
});
export const TICK_VALUES = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
const STRIDES = [1, 2, 5, 10, 20];

/**
 * Where things go in a chart `width` pixels wide holding `stepCount` steps (the start point included):
 * { width, height, plot: {left, right, top, bottom}, slots, slot, x(index), y(strength) }.
 * A width that is not a positive number becomes 480; a narrower one than CHART.minWidth is widened to it.
 * 宽 width 像素、放 stepCount 步（含起点）的图里各元素的位置。width 不是正数时按 480；比 CHART.minWidth 窄时按 minWidth。
 */
export function chartGeometry(width, stepCount) {
  const measured = Number.isFinite(width) && width > 0 ? width : 480;
  const full = Math.max(CHART.minWidth, Math.round(measured));
  const plot = { left: CHART.left, right: full - CHART.right, top: CHART.top, bottom: CHART.height - CHART.bottom };
  const count = Number.isFinite(stepCount) ? Math.floor(stepCount) : 0;
  const slots = Math.max(CHART.minSlots, count);
  const slot = (plot.right - plot.left) / slots;
  return {
    width: full,
    height: CHART.height,
    plot,
    slots,
    slot,
    x: (index) => plot.left + (index + 0.5) * slot,
    y: (strength) => plot.bottom - clamp01(Number.isFinite(strength) ? strength : 0) * (plot.bottom - plot.top),
  };
}

/** Every how many trials a trial number is printed, so neighbouring numbers stay CHART.labelGap apart. 每隔几次试次标一个编号，使相邻编号至少相隔 CHART.labelGap。 */
export function trialLabelStride(slot) {
  const width = Number.isFinite(slot) && slot > 0 ? slot : 1;
  return STRIDES.find((stride) => stride * width >= CHART.labelGap) ?? STRIDES[STRIDES.length - 1];
}

/**
 * Everything the chart draws, in pixels: { geometry, bands, numbers, points, segments, xLabels, yTicks, peak }.
 * - bands: one coloured band per stage, numbered like the list; numbers: the stage numbers that fit without
 *   overlapping the previous one;
 * - points: one per step, the last one `latest`; segments: lines between neighbouring points, dashed into a rest;
 * - xLabels: trial numbers every trialLabelStride trials; yTicks: 0%, 25%, 50%, 75%, 100%;
 * - peak: after a spontaneous recovery, the highest strength reached so far, to show that the recovery is weaker.
 * 图上要画的全部内容（像素）：每个阶段一个带编号的色块（编号放得下且不与前一个重叠时才显示）；每一步一个点（最后一个标为 latest）；
 * 相邻点之间的连线（进入休息的那段用虚线）；每隔几次试次的编号；0% 到 100% 的刻度；以及自发恢复以后，到目前为止的最高强度（说明恢复比它弱）。
 */
export function chartModel(state, width) {
  const current = isSimulation(state) ? state : initialSimulation();
  const { steps } = current;
  const geometry = chartGeometry(width, steps.length);
  const { plot, slot } = geometry;
  const runs = phaseRuns(steps);
  const bands = runs.map((run) => ({
    phase: run.phase,
    number: run.number,
    x: plot.left + run.start * slot,
    width: (run.end - run.start + 1) * slot,
  }));
  const numbers = [];
  for (const band of bands) {
    const x = band.x + band.width / 2;
    const previous = numbers[numbers.length - 1];
    if (!previous || x - previous.x >= CHART.numberGap) numbers.push({ number: band.number, x });
  }
  const last = steps.length - 1;
  const points = steps.map((step, index) => ({
    index,
    kind: step.kind,
    phase: step.phase,
    x: geometry.x(index),
    y: geometry.y(step.strength),
    latest: index === last,
  }));
  const segments = points.slice(1).map((point, offset) => ({
    x1: points[offset].x,
    y1: points[offset].y,
    x2: point.x,
    y2: point.y,
    dashed: point.kind === 'rest',
  }));
  const stride = trialLabelStride(slot);
  const xLabels = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => Number.isFinite(step.trial) && step.trial % stride === 0)
    .map(({ step, index }) => ({ x: geometry.x(index), text: String(step.trial) }));
  const yTicks = TICK_VALUES.map((value) => ({ value, y: geometry.y(value), text: formatStrength(value) }));
  let peak = null;
  if (steps.some((step) => step.kind === 'rest' && step.strength > step.before)) {
    const y = geometry.y(current.highest);
    // The label sits just above its line, clear of the stage numbers; a peak too close to the top puts it below.
    // 标签放在虚线正上方，不碰阶段编号；峰值太靠近顶部时放到虚线下方。
    peak = { y, text: formatStrength(current.highest), labelY: y - 5 >= plot.top + 1 ? y - 5 : y + 13 };
  }
  return { geometry, bands, numbers, points, segments, xLabels, yTicks, peak };
}

/**
 * Text alternative of the chart for screen readers, Chinese and English together, stage by stage.
 * 给读屏软件的图表文字说明，中英文一起，逐个阶段描述。
 */
export function chartDescription(state, notation) {
  const current = isSimulation(state) ? state : initialSimulation();
  const runs = phaseRuns(current.steps);
  const head = `${UI_TEXT.chart.zh} ${UI_TEXT.chart.en}.`;
  if (!runs.length) return `${head} ${UI_TEXT.noTrials.zh} ${UI_TEXT.noTrials.en} CR 0%.`;
  const parts = runs.map((run) => {
    const text = phaseText(run, notation);
    const range = text.range ? `, ${text.range.en}` : '';
    const result = text.result ? `, ${text.result.zh} ${text.result.en}` : '';
    return `${text.number}. ${text.name.zh} ${text.name.en} (${text.what.en}${range}): ${text.change}${result}.`;
  });
  return `${head} ${parts.join(' ')}`;
}
