/**
 * Per-course learning progress: finished sections, question attempts, mistakes and flashcards.
 * 单门课程的学习进度：已学完的小节、答题记录、错题本与闪卡熟悉度。
 *
 * Every mutation dispatches a `study:progress` event so headers and lists can refresh. Mutations
 * return false when the browser did not save the change (storage full or blocked); the change still
 * holds for the rest of the visit.
 * 每次修改都会派发 `study:progress` 事件，便于页头与列表刷新。浏览器没能保存修改（存储已满或被禁用）时返回 false，
 * 但本次访问期间修改仍然有效。
 *
 * `storage` and `events` (the EventTarget notified) default to localStorage and window; tests inject them.
 * `storage` 与 `events`（接收通知的 EventTarget）默认为 localStorage 与 window，测试时可注入。
 */
import { createLocalStore } from './local-store.js';

const EVENT = 'study:progress';

/**
 * Study-plan ticks reuse the section store under unitId "plan-<planId>", so they travel with backups.
 * 学习计划的勾选复用小节存储，unitId 为 "plan-<计划 id>"，因此会随备份一起导出导入。
 */
export const PLAN_UNIT_PREFIX = 'plan-';

export function createProgressStore(courseId, { storage, events = typeof window === 'undefined' ? null : window } = {}) {
  const store = createLocalStore(courseId, storage);
  const notify = (detail) => events?.dispatchEvent(new CustomEvent(EVENT, { detail }));

  const read = (key, fallback) => store.get(key, fallback);
  const write = (key, value, detail) => {
    const saved = store.set(key, value);
    notify(detail);
    return saved;
  };
  const snapshot = () => Object.fromEntries(store.keys().map((key) => [key, store.get(key, null)]));

  return {
    EVENT,

    isSectionDone(unitId, sectionId) {
      return Boolean(read('sections', {})[`${unitId}/${sectionId}`]);
    },

    setSectionDone(unitId, sectionId, done) {
      const sections = read('sections', {});
      const key = `${unitId}/${sectionId}`;
      if (done) sections[key] = Date.now();
      else delete sections[key];
      return write('sections', sections, { type: 'section', unitId, sectionId, done });
    },

    unitProgress(unitId, sectionIds) {
      const sections = read('sections', {});
      const done = sectionIds.filter((sectionId) => sections[`${unitId}/${sectionId}`]).length;
      return { done, total: sectionIds.length };
    },

    /**
     * Records an answer; wrong answers enter the mistake book, a later correct answer removes them.
     * 记录作答结果：答错进入错题本，之后答对则自动移出。
     */
    recordAnswer(questionId, correct) {
      const attempts = read('attempts', {});
      const previous = attempts[questionId] || { tries: 0, correct: 0 };
      attempts[questionId] = {
        tries: previous.tries + 1,
        correct: previous.correct + (correct ? 1 : 0),
        last: correct ? 'right' : 'wrong',
        at: Date.now(),
      };
      const attemptSaved = store.set('attempts', attempts);
      const mistakes = new Set(read('mistakes', []));
      if (correct) mistakes.delete(questionId);
      else mistakes.add(questionId);
      return write('mistakes', [...mistakes], { type: 'answer', questionId, correct }) && attemptSaved;
    },

    attempt(questionId) {
      return read('attempts', {})[questionId] || null;
    },

    attempts() {
      return read('attempts', {});
    },

    mistakes() {
      return read('mistakes', []);
    },

    removeMistake(questionId) {
      return write('mistakes', read('mistakes', []).filter((id) => id !== questionId), { type: 'mistake', questionId });
    },

    flashcard(termId) {
      return read('flashcards', {})[termId] || null;
    },

    /** Every stored flashcard status: { termId: { status, at } }. 所有已保存的闪卡状态。 */
    flashcards() {
      return read('flashcards', {});
    },

    setFlashcard(termId, status) {
      const cards = read('flashcards', {});
      cards[termId] = { status, at: Date.now() };
      return write('flashcards', cards, { type: 'flashcard', termId, status });
    },

    lastVisited() {
      return read('lastVisited', null);
    },

    setLastVisited(unitId, sectionId) {
      return store.set('lastVisited', { unitId, sectionId: sectionId || null, at: Date.now() });
    },

    exportData() {
      return snapshot();
    },

    /** Merges the given keys into the current progress. 把给定的键合并进当前进度。 */
    importData(data) {
      if (!data || typeof data !== 'object') return false;
      let saved = true;
      for (const [key, value] of Object.entries(data)) saved = store.set(key, value) && saved;
      notify({ type: 'import' });
      return saved;
    },

    /**
     * Replaces all progress with `data`. The new keys are written before anything is removed, and if
     * any write fails the previous progress is restored, so a failed import never loses data.
     * 用 `data` 替换全部进度：先写入新数据，再删除多余的键；任何一次写入失败都会恢复原来的进度，导入失败也不会丢数据。
     */
    replaceAll(data) {
      if (!data || typeof data !== 'object') return false;
      const before = snapshot();
      const keys = Object.keys(data);
      const saved = keys.every((key) => store.set(key, data[key]));
      if (!saved) {
        for (const key of keys) {
          if (Object.hasOwn(before, key)) store.set(key, before[key]);
          else store.remove(key);
        }
        return false;
      }
      for (const key of Object.keys(before)) {
        if (!Object.hasOwn(data, key)) store.remove(key);
      }
      notify({ type: 'import' });
      return true;
    },

    reset() {
      for (const key of store.keys()) store.remove(key);
      notify({ type: 'reset' });
    },
  };
}
