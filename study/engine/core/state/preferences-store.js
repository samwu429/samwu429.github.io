/**
 * Station-wide display preferences (language mode, theme) applied as attributes on <html>.
 * 全站显示偏好（语言模式、主题），以 <html> 属性的形式生效。
 *
 * Language modes / 语言模式:
 *   balanced    - Chinese teaching with English key terms; question translations on demand
 *                 中文讲解 + 英文术语；题目中文翻译按需显示
 *   zh-first    - every Chinese translation shown 所有中文翻译全部显示
 *   en-practice - Chinese blurred until tapped, for exam-style English reading
 *                 中文模糊、点击才显示，用于考前英文阅读训练
 */
import { createLocalStore } from './local-store.js';

export const LANGUAGE_MODES = ['balanced', 'zh-first', 'en-practice'];
export const THEMES = ['auto', 'light', 'dark'];

const EVENT = 'study:preferences';

export function createPreferencesStore() {
  const store = createLocalStore('global');

  const current = () => ({
    languageMode: LANGUAGE_MODES.includes(store.get('languageMode')) ? store.get('languageMode') : 'balanced',
    theme: THEMES.includes(store.get('theme')) ? store.get('theme') : 'auto',
  });

  function apply() {
    const { languageMode, theme } = current();
    const root = document.documentElement;
    root.dataset.langMode = languageMode;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }

  function update(key, value) {
    store.set(key, value);
    apply();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: current() }));
  }

  return {
    EVENT,
    current,
    apply,
    setLanguageMode: (mode) => LANGUAGE_MODES.includes(mode) && update('languageMode', mode),
    setTheme: (theme) => THEMES.includes(theme) && update('theme', theme),
  };
}
