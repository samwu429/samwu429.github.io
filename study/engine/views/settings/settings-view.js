/**
 * Settings (#/settings): the three language modes with a live sample, the theme, and progress
 * backup (JSON export, validated import, two-step reset).
 * 设置（#/settings）：三种语言模式（带实时预览）、主题，以及进度备份（导出 JSON、校验后导入、两步确认清空）。
 */
import { h, replaceContent } from '../../core/dom/element.js';
import { icon } from '../../core/dom/icons.js';
import { ensureStylesheet } from '../../core/dom/stylesheet.js';
import { enNode, zhNode } from '../../core/text/bilingual.js';
import { LANGUAGE_MODES, THEMES } from '../../core/state/preferences-store.js';
import { badge } from '../../components/badges/badge.js';
import { button } from '../../components/controls/button.js';
import { pageHeader } from '../../components/layout/page-header.js';
import {
  MAX_IMPORT_BYTES,
  buildExport,
  exportFileName,
  isEmptySummary,
  parseImport,
  summarizeProgress,
} from './progress-transfer.js';

const MODE_INFO = {
  balanced: {
    zh: '中英平衡',
    en: 'Balanced',
    recommended: true,
    desc: '中文讲解正常显示，英文术语和“考试这样写”的英文句子一起出现；英文题目的中文翻译默认收起，需要时点“显示中文”。适合平时学习。',
    descEn: 'Chinese teaching with English terms; question translations on demand.',
    now: '现在：中文讲解可见；题目的中文翻译收起，点“显示中文”才出现。',
    nowEn: 'Now: Chinese teaching is visible; question translations appear when you tap Show Chinese.',
  },
  'zh-first': {
    zh: '中文优先',
    en: 'Chinese first',
    desc: '所有中文翻译全部展开，包括题目和选项的翻译。适合刚开始学、英文读起来还很吃力的时候。',
    descEn: 'Every Chinese translation is shown, including questions and options.',
    now: '现在：所有中文都直接显示，包括题目的翻译。',
    nowEn: 'Now: every Chinese text is shown, question translations included.',
  },
  'en-practice': {
    zh: '英文练习',
    en: 'English practice',
    desc: '中文先模糊处理，点一下才显示；题目翻译也收起。逼自己先读英文，适合考前一两周练英文阅读。',
    descEn: 'Chinese is blurred until you tap it, so you read the English first.',
    now: '现在：中文被模糊了，点一下模糊的文字就能看到；用键盘时按 Alt+Z 显示当前这一块，或用页头的“显示全部中文”按钮。',
    nowEn: 'Now: Chinese is blurred; tap it to read it. From the keyboard, Alt+Z reveals the current block, and the header button reveals everything.',
  },
};

const THEME_INFO = { auto: '跟随系统 Auto', light: '浅色 Light', dark: '深色 Dark' };

const STAT_ITEMS = [
  { key: 'sections', label: '已学完小节 Sections done' },
  { key: 'questions', label: '做过的题 Questions tried' },
  { key: 'mistakes', label: '错题本 Mistakes' },
  { key: 'flashcards', label: '闪卡记录 Flashcards' },
  { key: 'planTasks', label: '计划打勾 Plan ticks' },
];

function modeInfo(mode) {
  return MODE_INFO[mode] || { zh: mode, en: mode, desc: '', descEn: '', now: '', nowEn: '' };
}

/**
 * A group of native radio buttons styled as cards; set() syncs it with outside changes.
 * 用原生单选按钮做成的卡片组；set() 用于同步外部的修改。
 */
function radioCards({ name, legend, options, value, onChange, className }) {
  const inputs = options.map((option) => {
    const input = h('input', {
      type: 'radio',
      name,
      id: `${name}-${option.value}`,
      value: option.value,
      class: 'settings__radio',
      checked: option.value === value,
      onchange: () => {
        if (input.checked) onChange(option.value);
      },
    });
    return input;
  });
  const element = h('fieldset', { class: ['settings__choices', className] },
    h('legend', { class: 'visually-hidden' }, legend),
    options.map((option, index) => h('label', { class: 'settings__choice', for: inputs[index].id },
      inputs[index],
      h('span', { class: 'settings__choice-body' }, option.content))));
  return {
    element,
    set(next) {
      for (const input of inputs) input.checked = input.value === next;
    },
  };
}

function languageSample() {
  const question = h('div', { class: 'settings__sample-question' },
    enNode('Which statement best describes an **algorithm**?', 'p', 'settings__sample-en'),
    zhNode('哪一项最能描述**算法**？', 'assist', 'p', 'settings__sample-zh'));
  const assistToggle = button({
    label: '显示中文 Show Chinese',
    iconName: 'translate',
    size: 'sm',
    variant: 'ghost',
    pressed: false,
    className: 'settings__assist-toggle',
    onClick: () => {
      const on = !question.classList.contains('show-assist');
      question.classList.toggle('show-assist', on);
      assistToggle.setAttribute('aria-pressed', String(on));
    },
  });
  return [
    h('div', { class: 'settings__sample-row' },
      h('span', { class: 'settings__sample-role' }, '中文讲解 Teaching'),
      zhNode('算法（**algorithm**）就是一串精确的步骤，电脑按顺序一步一步执行。', 'teach', 'p', 'settings__sample-zh')),
    h('div', { class: 'settings__sample-row' },
      h('span', { class: 'settings__sample-role' }, '考试句子 + 中文释义 Exam sentence'),
      enNode('An algorithm is a sequence of precise instructions.', 'p', 'settings__sample-en'),
      zhNode('算法是一串精确的指令。', 'gloss', 'p', 'settings__sample-zh')),
    h('div', { class: 'settings__sample-row' },
      h('span', { class: 'settings__sample-role' }, '英文题目 + 翻译 Question'),
      question,
      assistToggle),
  ];
}

function summaryList(summary) {
  return h('ul', { class: 'settings__summary', role: 'list' }, STAT_ITEMS.map((item) => h('li', {},
    item.label, ': ', h('strong', {}, String(summary[item.key] || 0)))));
}

function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { download: fileName, hidden: true });
  // Blob URLs are created here rather than read from content, so they skip the content URL filter of h().
  // Blob 地址由本页生成而非来自内容文件，因此绕过 h() 对内容链接的过滤。
  link.href = url;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render(container, context) {
  await ensureStylesheet(new URL('./settings-view.css', import.meta.url));
  context.setTitle('设置 Settings');
  const { preferences, progress, courseId } = context;

  const status = h('p', { class: 'settings__status', role: 'status', 'aria-live': 'polite' });
  const setStatus = (message, tone) => {
    status.textContent = message;
    status.classList.toggle('settings__status--ok', tone === 'ok');
    status.classList.toggle('settings__status--error', tone === 'error');
  };

  // Language mode 语言模式
  const caption = h('p', { class: 'settings__sample-caption', 'aria-live': 'polite' });
  const syncCaption = () => {
    const info = modeInfo(preferences.current().languageMode);
    replaceContent(caption, info.now, ' ', info.nowEn ? h('span', { lang: 'en' }, info.nowEn) : null);
  };
  const modes = radioCards({
    name: 'settings-language',
    legend: '选择语言模式 Choose a language mode',
    value: preferences.current().languageMode,
    options: LANGUAGE_MODES.map((mode) => {
      const info = modeInfo(mode);
      return {
        value: mode,
        content: [
          h('span', { class: 'settings__choice-title' },
            info.zh, ' ', h('span', { class: 'settings__choice-en', lang: 'en' }, info.en),
            info.recommended ? badge('推荐 Recommended', 'accent') : null),
          info.desc ? h('span', { class: 'settings__choice-desc' }, info.desc) : null,
          info.descEn ? h('span', { class: 'settings__choice-desc-en', lang: 'en' }, info.descEn) : null,
        ],
      };
    }),
    onChange: (mode) => {
      preferences.setLanguageMode(mode);
      syncCaption();
    },
  });
  syncCaption();

  // Theme 主题
  const themes = radioCards({
    name: 'settings-theme',
    legend: '选择主题 Choose a theme',
    value: preferences.current().theme,
    className: 'settings__choices--pills',
    options: THEMES.map((theme) => ({ value: theme, content: THEME_INFO[theme] || theme })),
    onChange: (theme) => preferences.setTheme(theme),
  });

  // Progress 学习进度
  const stats = h('dl', { class: 'settings__stats' });
  const renderStats = () => {
    const summary = summarizeProgress(progress.exportData());
    replaceContent(stats, STAT_ITEMS.map((item) => h('div', { class: 'settings__stat' },
      h('dt', {}, item.label),
      h('dd', {}, String(summary[item.key] || 0)))));
    return summary;
  };
  renderStats();

  const confirmSlot = h('div', { class: 'settings__confirm-slot' });
  const closeConfirm = () => replaceContent(confirmSlot);

  function openConfirm(panel, title, onCancel) {
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    });
    replaceContent(confirmSlot, panel);
    title.focus();
  }

  function exportProgress() {
    const fileName = exportFileName(courseId);
    try {
      downloadJson(fileName, buildExport(courseId, progress.exportData()));
      setStatus(`已下载进度文件 ${fileName}。Progress file downloaded.`, 'ok');
    } catch {
      setStatus('下载失败，请换一个浏览器再试。The download failed; please try another browser.', 'error');
    }
  }

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-label': '选择进度文件 Choose a progress file',
    onchange: () => handleFile(fileInput.files?.[0]),
  });
  const exportButton = button({ label: '导出进度 Export', iconName: 'download', onClick: exportProgress });
  const importButton = button({ label: '导入进度 Import', iconName: 'upload', onClick: () => fileInput.click() });
  const resetButton = button({ label: '清空进度 Reset', iconName: 'trash', variant: 'danger', onClick: showResetConfirm });

  function showImportConfirm(fileName, result) {
    const cancel = () => {
      closeConfirm();
      setStatus('已取消导入。Import cancelled.');
      importButton.focus();
    };
    const title = h('p', { class: 'settings__confirm-title', tabindex: '-1' }, icon('upload', { size: 18 }), '确认导入这个文件？Import this file?');
    const skipped = result.dropped + result.ignoredKeys.length;
    const panel = h('div', { class: 'settings__confirm', role: 'group', 'aria-label': '确认导入 Confirm import' },
      title,
      h('p', { class: 'settings__confirm-file' },
        `文件 File: ${fileName}`,
        result.exportedAt ? ` · 导出于 Exported ${formatStamp(result.exportedAt)}` : ''),
      summaryList(result.summary),
      skipped ? h('p', { class: 'settings__confirm-note' }, `有 ${skipped} 项格式不对或无法识别，会被跳过。${skipped} unreadable entries will be skipped.`) : null,
      h('p', { class: 'callout callout--warn settings__confirm-warn' }, '导入会替换这门课现在的全部学习进度。Importing replaces all current progress for this course.'),
      h('div', { class: 'cluster' },
        button({
          label: '确认导入 Import',
          iconName: 'check',
          variant: 'primary',
          onClick: () => {
            const saved = progress.replaceAll(result.data);
            closeConfirm();
            renderStats();
            if (saved) setStatus('导入成功，进度已恢复。Progress imported.', 'ok');
            else setStatus('导入失败：浏览器的存储空间已满或被禁止使用，原来的进度没有改动。Import failed: browser storage is full or blocked, so your previous progress was kept.', 'error');
            importButton.focus();
          },
        }),
        button({ label: '取消 Cancel', onClick: cancel })));
    openConfirm(panel, title, cancel);
  }

  async function handleFile(file) {
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setStatus('文件太大，不像是复习站导出的进度文件。The file is too large to be a progress export.', 'error');
      return;
    }
    let text;
    try {
      text = await file.text();
    } catch {
      setStatus('读取文件失败，请重新选择。Could not read the file.', 'error');
      return;
    }
    const result = parseImport(text, courseId);
    if (!result.ok) {
      closeConfirm();
      setStatus(`${result.message.zh} ${result.message.en}`, 'error');
      return;
    }
    setStatus('');
    showImportConfirm(file.name, result);
  }

  function showResetConfirm() {
    const summary = summarizeProgress(progress.exportData());
    if (isEmptySummary(summary)) {
      closeConfirm();
      setStatus('现在还没有学习进度，不需要清空。There is no progress to reset.');
      return;
    }
    const cancel = () => {
      closeConfirm();
      setStatus('已取消，进度没有变。Reset cancelled.');
      resetButton.focus();
    };
    const title = h('p', { class: 'settings__confirm-title', tabindex: '-1' }, icon('alert', { size: 18 }), '真的要清空这门课的全部进度吗？Reset all progress for this course?');
    const panel = h('div', { class: 'settings__confirm settings__confirm--danger', role: 'group', 'aria-label': '确认清空 Confirm reset' },
      title,
      h('p', { class: 'settings__confirm-text' }, '下面这些记录都会被删除，而且无法恢复。建议先导出一份备份。These records will be deleted for good; export a backup first.'),
      summaryList(summary),
      h('div', { class: 'cluster' },
        button({ label: '先导出备份 Export first', iconName: 'download', onClick: exportProgress }),
        button({
          label: '确认清空 Yes, reset',
          iconName: 'trash',
          variant: 'danger',
          onClick: () => {
            progress.reset();
            closeConfirm();
            renderStats();
            setStatus('已清空这门课的学习进度。Progress reset.', 'ok');
            resetButton.focus();
          },
        }),
        button({ label: '取消 Cancel', onClick: cancel })));
    openConfirm(panel, title, cancel);
  }

  const card = (id, title, ...children) => h('section', { class: 'card settings__section', 'aria-labelledby': id },
    h('h2', { id, class: 'settings__title' }, title),
    children);

  replaceContent(container, h('div', { class: 'settings' },
    pageHeader({
      eyebrow: '设置 Settings',
      title: { zh: '设置与学习进度', en: 'Settings and progress' },
      subtitle: '语言模式和主题对所有课程生效；学习进度按课程分别保存。Language and theme apply to every course; progress is kept per course.',
    }),
    card('settings-language-title', ['语言模式 ', h('span', { class: 'settings__title-en', lang: 'en' }, 'Language mode')],
      h('p', { class: 'settings__lead' }, '考试是英文的，但讲解用中文。选一个最适合你现在水平的模式，随时可以换。Tests are in English, teaching is in Chinese: pick the mix that suits you now.'),
      modes.element,
      h('div', { class: 'settings__sample', role: 'group', 'aria-label': '效果预览 Live preview' },
        h('p', { class: 'settings__sample-title' }, icon('eye', { size: 16 }), '效果预览 Live preview'),
        caption,
        languageSample())),
    card('settings-theme-title', ['主题 ', h('span', { class: 'settings__title-en', lang: 'en' }, 'Theme')],
      h('p', { class: 'settings__lead' }, '深色模式晚上看更舒服；“跟随系统”会随手机或电脑的设置自动切换。Dark mode is easier at night; Auto follows your device.'),
      themes.element),
    card('settings-progress-title', ['学习进度 ', h('span', { class: 'settings__title-en', lang: 'en' }, 'Progress')],
      h('p', { class: 'settings__lead' }, '进度只保存在这台设备的这个浏览器里，不会上传。换手机或电脑前，先在这里导出文件，再到新设备上导入。Progress stays in this browser only: export it here and import it on your other device.'),
      stats,
      h('div', { class: 'cluster settings__actions' }, exportButton, importButton, resetButton, fileInput),
      confirmSlot,
      status)));

  // Keep the controls in sync when the header switches the mode or theme.
  // 页头切换语言模式或主题时，同步本页的选项。
  const onPreferences = () => {
    const current = preferences.current();
    modes.set(current.languageMode);
    themes.set(current.theme);
    syncCaption();
  };
  window.addEventListener(preferences.EVENT, onPreferences);
  return () => window.removeEventListener(preferences.EVENT, onPreferences);
}
