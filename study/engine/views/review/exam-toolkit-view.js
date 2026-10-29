/**
 * Exam English toolkit (#/toolkit): question verbs, answer templates, useful phrases, common
 * mistakes and exam strategy, one tab each; "?tab=<id>" opens a tab directly.
 * 英文答题工具箱（#/toolkit）：指令词、答题模板、常用句型、常见错误与考试策略，各占一个分页；"?tab=<id>" 可直接打开。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { biTitle, enNode, toBi, zhNode } from '../../core/text/bilingual.js';
import { renderInline } from '../../core/text/inline-markup.js';
import { button, linkButton, setButtonLabel } from '../../components/controls/button.js';
import { loadTabStripStyles, tabStrip } from '../../components/controls/tab-strip.js';
import { emptyState, loadingState } from '../../components/feedback/states.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { speakButton } from '../../components/text/speak-button.js';
import { asList, presentSections, speechText, splitBlanks } from './review-logic.js';

const SECTIONS = [
  { id: 'verbs', zh: '指令词', en: 'Question verbs', iconName: 'target', intro: '题目里的动词决定老师想看到什么：先看懂指令词，再动笔。The verb in a question tells you what to write.' },
  { id: 'templates', zh: '答题模板', en: 'Answer templates', iconName: 'list', intro: '长答题的句子骨架：把空格填上，就是一段完整的英文答案。Sentence frames for long answers: fill in the blanks.' },
  { id: 'phrases', zh: '常用句型', en: 'Useful phrases', iconName: 'translate', intro: '按用途分好组的英文句型，点喇叭可以听发音。Phrases grouped by purpose; tap the speaker to listen.' },
  { id: 'mistakes', zh: '常见错误', en: 'Common mistakes', iconName: 'cross', intro: '中国同学写英文答案时最常犯的错，看清错在哪里。Typical errors in exam English, and how to fix them.' },
  { id: 'strategy', zh: '考试策略', en: 'Exam strategy', iconName: 'flag', intro: '时间怎么分、选择题和长答题怎么做。How to use your time and tackle each question type.' },
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function label(content) {
  return h('p', { class: 'exam-toolkit__label' }, content);
}

/**
 * Chinese teaching text followed by its English version.
 * 中文讲解在前，英文对照在后。
 */
function teachPair(value) {
  const bi = toBi(value);
  if (!bi) return null;
  return h('div', { class: 'exam-toolkit__pair' },
    zhNode(bi.zh, 'teach', 'p', 'exam-toolkit__zh'),
    enNode(bi.en, 'p', 'exam-toolkit__en'));
}

/**
 * An English sentence with a read-aloud button, followed by its Chinese gloss.
 * 英文句子配朗读按钮，下面是中文释义。
 */
function spokenLine(value, className) {
  const bi = toBi(value);
  if (!bi) return null;
  return h('div', { class: ['exam-toolkit__line', className] },
    bi.en ? h('p', { class: 'exam-toolkit__line-en' }, enNode(bi.en, 'span'), speakButton(bi.en)) : null,
    zhNode(bi.zh, 'gloss', 'p', 'exam-toolkit__line-zh'));
}

// Blanks are marked inside the rendered text nodes, so **bold** and `code` around them keep working.
// 在渲染后的文本节点里标出空格，使空格周围的 **粗体** 与 `代码` 标记仍然有效。
function markBlanks(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      const parts = splitBlanks(child.nodeValue);
      if (!parts.some((part) => part.blank)) continue;
      child.replaceWith(...parts.map((part) => (part.blank
        ? h('mark', { class: 'exam-toolkit__blank' },
          h('span', { 'aria-hidden': 'true' }, part.text),
          h('span', { class: 'visually-hidden' }, '（填空 blank）'))
        : document.createTextNode(part.text))));
    } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'CODE') {
      markBlanks(child);
    }
  }
  return node;
}

function verbCard(verb) {
  const word = text(verb.en);
  const meaning = toBi(verb.zh);
  if (!word && !meaning) return null;
  return h('li', { class: 'exam-toolkit__verb' },
    h('div', { class: 'exam-toolkit__verb-head' },
      word ? h('h3', { class: 'exam-toolkit__verb-word en', lang: 'en' }, renderInline(word)) : null,
      speakButton(word),
      zhNode(meaning?.zh, 'gloss', 'span', 'exam-toolkit__verb-zh')),
    toBi(verb.meaning) ? h('div', { class: 'exam-toolkit__field' }, label('老师想看到什么 What it asks for'), teachPair(verb.meaning)) : null,
    toBi(verb.howTo) ? h('div', { class: 'exam-toolkit__field' }, label('怎么答 How to answer'), teachPair(verb.howTo)) : null,
    toBi(verb.starter) ? h('div', { class: 'exam-toolkit__field exam-toolkit__starter' }, label('开头这样写 Sentence starter'), spokenLine(verb.starter)) : null);
}

function frameLine(line) {
  const bi = toBi(line);
  if (!bi) return null;
  return h('li', { class: 'exam-toolkit__frame' },
    bi.en
      ? h('p', { class: 'exam-toolkit__frame-en' },
        markBlanks(h('span', { class: 'en', lang: 'en' }, renderInline(bi.en))),
        speakButton(speechText(bi.en)))
      : null,
    zhNode(bi.zh, 'gloss', 'p', 'exam-toolkit__frame-zh'));
}

function exampleBlock(example, index) {
  const question = toBi(example?.question);
  const answer = toBi(example?.answer);
  if (!question && !answer) return null;
  const answerId = `exam-toolkit-answer-${index + 1}`;

  const questionBox = question
    ? h('div', { class: 'exam-toolkit__question' },
      question.en ? h('p', { class: 'exam-toolkit__question-en' }, enNode(question.en, 'span'), speakButton(question.en)) : null,
      zhNode(question.zh, question.en ? 'assist' : 'teach', 'p', 'exam-toolkit__question-zh'))
    : null;

  let assistToggle = null;
  if (questionBox && question.en && question.zh) {
    assistToggle = button({
      label: '显示中文 Show Chinese',
      iconName: 'translate',
      size: 'sm',
      variant: 'ghost',
      pressed: false,
      className: 'exam-toolkit__assist-toggle',
      onClick: () => {
        const on = !questionBox.classList.contains('show-assist');
        questionBox.classList.toggle('show-assist', on);
        assistToggle.setAttribute('aria-pressed', String(on));
      },
    });
  }

  let revealButton = null;
  let answerBox = null;
  if (answer) {
    answerBox = h('div', { id: answerId, class: 'exam-toolkit__answer', hidden: true },
      answer.en
        ? [h('div', { class: 'exam-toolkit__answer-head' }, label('参考答案 Model answer'), speakButton(answer.en)),
          enNode(answer.en, 'p', 'exam-toolkit__answer-en')]
        : null,
      answer.zh ? [label('中文解析 Explanation'), zhNode(answer.zh, 'teach', 'p', 'exam-toolkit__answer-zh')] : null);
    revealButton = button({
      label: '看参考答案 Show model answer',
      iconName: 'eye',
      size: 'sm',
      onClick: () => {
        const open = answerBox.hidden;
        answerBox.hidden = !open;
        revealButton.setAttribute('aria-expanded', String(open));
        setButtonLabel(revealButton, open ? '收起参考答案 Hide model answer' : '看参考答案 Show model answer');
      },
    });
    revealButton.setAttribute('aria-expanded', 'false');
    revealButton.setAttribute('aria-controls', answerId);
  }

  return h('div', { class: 'exam-toolkit__example' },
    label('例题 Example question'),
    questionBox,
    assistToggle || revealButton ? h('div', { class: 'cluster exam-toolkit__example-actions' }, revealButton, assistToggle) : null,
    answerBox);
}

function templateCard(template, index) {
  const title = toBi(template.title);
  const frames = asList(template.skeleton).map(frameLine).filter(Boolean);
  const when = toBi(template.whenToUse);
  const example = isObject(template.example) ? exampleBlock(template.example, index) : null;
  if (!title && !frames.length && !example) return null;
  const headingId = `exam-toolkit-template-${index + 1}`;
  return h('li', { class: 'exam-toolkit__template' },
    h('article', { class: 'exam-toolkit__template-card', 'aria-labelledby': headingId },
      h('header', { class: 'exam-toolkit__template-head' },
        h('span', { class: 'exam-toolkit__template-index', 'aria-hidden': 'true' }, String(index + 1)),
        h('h3', { id: headingId, class: 'exam-toolkit__template-title' }, title ? biTitle(title) : `模板 ${index + 1} Template ${index + 1}`)),
      when ? h('div', { class: 'exam-toolkit__field' }, label('什么时候用 When to use'), teachPair(when)) : null,
      frames.length
        ? h('div', { class: 'exam-toolkit__field' },
          label('句子骨架 Sentence frame'),
          h('ol', { class: 'exam-toolkit__frames' }, frames))
        : null,
      example));
}

function phraseGroup(group, index) {
  const title = toBi(group.group);
  const items = asList(group.items).map((item) => spokenLine(item, 'exam-toolkit__phrase')).filter(Boolean);
  if (!items.length) return null;
  const headingId = `exam-toolkit-phrases-${index + 1}`;
  return h('li', { class: 'exam-toolkit__phrase-group' },
    h('section', { 'aria-labelledby': headingId },
      h('h3', { id: headingId, class: 'exam-toolkit__group-title' }, title ? biTitle(title) : `第 ${index + 1} 组 Group ${index + 1}`),
      h('ul', { class: 'exam-toolkit__phrases', role: 'list' }, items.map((item) => h('li', {}, item)))));
}

function mistakeItem(item) {
  const wrong = text(item.wrong);
  const right = text(item.right);
  if (!wrong && !right) return null;
  return h('li', { class: 'exam-toolkit__mistake' },
    wrong
      ? h('p', { class: 'exam-toolkit__wrong' },
        h('span', { class: 'exam-toolkit__mark exam-toolkit__mark--wrong' }, icon('cross', { size: 14 }), '错 Wrong'),
        h('s', { class: 'exam-toolkit__wrong-text', lang: 'en' }, renderInline(wrong)))
      : null,
    right
      ? h('p', { class: 'exam-toolkit__right' },
        h('span', { class: 'exam-toolkit__mark exam-toolkit__mark--right' }, icon('check', { size: 14 }), '对 Right'),
        h('span', { class: 'exam-toolkit__right-text', lang: 'en' }, renderInline(right)),
        speakButton(right))
      : null,
    zhNode(text(item.zh), 'teach', 'p', 'exam-toolkit__reason'),
    enNode(text(item.en), 'p', 'exam-toolkit__en'));
}

const BUILDERS = {
  verbs: (items) => h('ul', { class: 'exam-toolkit__verbs', role: 'list' }, items.filter(isObject).map(verbCard)),
  templates: (items) => h('ol', { class: 'exam-toolkit__templates', role: 'list' }, items.filter(isObject).map(templateCard)),
  phrases: (items) => h('ul', { class: 'exam-toolkit__phrase-groups', role: 'list' }, items.filter(isObject).map(phraseGroup)),
  mistakes: (items) => h('ul', { class: 'exam-toolkit__mistakes', role: 'list' }, items.filter(isObject).map(mistakeItem)),
  strategy: (items) => h('ol', { class: 'exam-toolkit__strategy', role: 'list' }, items.map(toBi).filter(Boolean).map((tip) => h('li', { class: 'exam-toolkit__tip' }, teachPair(tip)))),
};

function setTabInUrl(id) {
  try {
    window.history.replaceState(window.history.state, '', `#/toolkit?tab=${encodeURIComponent(id)}`);
  } catch {
    // The address bar simply keeps the old query. 地址栏保持原样即可。
  }
}

export async function render(container, context, params, query) {
  await Promise.all([
    ensureStylesheet(new URL('./exam-toolkit-view.css', import.meta.url)),
    loadTabStripStyles(),
  ]);
  context.setTitle('英文答题工具箱 Exam English');
  replaceContent(container, loadingState());

  const toolkit = await context.repo.review('toolkit').catch(() => null);
  const header = pageHeader({
    eyebrow: '英文答题工具箱 Exam English toolkit',
    title: { zh: '把会的东西用英文写出来', en: 'Write what you know in English' },
    subtitle: '测验和期末都用英文作答。这里有指令词、答题模板、常用句型和常见错误，照着练就能写出得分的句子。Tests are answered in English: learn the verbs, frames and phrases that score.',
  });

  const present = presentSections(isObject(toolkit) ? toolkit : null, SECTIONS.map((section) => section.id));
  if (!present.length) {
    replaceContent(container, h('div', { class: 'exam-toolkit' }, header, emptyState({
      title: '答题工具箱还在整理中 The toolkit is not ready yet',
      body: '可以先看讲义里的“考试这样写”部分。Meanwhile, use the exam sentences inside each lesson.',
      action: h('div', { class: 'cluster exam-toolkit__empty-actions' },
        linkButton({ label: '去学习 Lessons', href: '#/learn', iconName: 'book' }),
        button({ label: '重试 Retry', iconName: 'refresh', variant: 'ghost', onClick: () => context.navigate('/toolkit') })),
    })));
    return undefined;
  }

  const tabs = SECTIONS.filter((section) => present.includes(section.id)).map((section) => ({
    id: section.id,
    iconName: section.iconName,
    label: [section.zh, ' ', h('span', { class: 'tab-strip__en', lang: 'en' }, section.en)],
    panel: h('section', { class: 'exam-toolkit__panel' },
      h('h2', { class: 'visually-hidden' }, `${section.zh} ${section.en}`),
      h('p', { class: 'exam-toolkit__intro' }, section.intro),
      BUILDERS[section.id](asList(toolkit[section.id]))),
  }));

  const requested = query?.get('tab');
  let ready = false;
  const strip = tabStrip({
    tabs,
    selected: tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id,
    label: '工具箱分类 Toolkit sections',
    idPrefix: 'exam-toolkit',
    className: 'exam-toolkit__tabs',
    onSelect: (id) => {
      if (ready) setTabInUrl(id);
    },
  });
  ready = true;

  replaceContent(container, h('div', { class: 'exam-toolkit' }, header, strip.element, tabs.map((tab) => tab.panel)));
  return undefined;
}
