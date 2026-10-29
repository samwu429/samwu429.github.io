/**
 * Compact labels: generic tone badges and the lesson-section level badge.
 * 紧凑标签：通用色调徽标与课程小节重要程度徽标。
 */
import { h } from '../../core/dom/element.js';
import { uiText } from '../../core/text/bilingual.js';

// The levels of CONTENT_SPEC 4.1. They rank how testable a section is; they never promise what a
// test covers, which only the official course announcements decide.
// CONTENT_SPEC 4.1 定义的重要程度。它们只表示一节内容有多常考，从不承诺考试范围，考试范围以课程官方通知为准。
const LEVELS = {
  exam: {
    tone: 'exam',
    text: '高频考点 High-yield',
    title: '高频考点：最常被考到的内容，考试范围以课程官方通知为准 High-yield: often tested; the official scope is announced by the course',
  },
  core: { tone: 'core', text: '必会 Must know', title: '必会：后面的内容都建立在它上面 Must know: later lessons build on it' },
  extra: { tone: 'muted', text: '了解 Background', title: '了解：背景知识，优先级较低 Background: context, lower priority' },
};

/**
 * Tones: neutral | accent | exam | core | warn | danger | muted.
 * 色调：neutral 中性 | accent 强调 | exam 高频考点 | core 必会 | warn 警示 | danger 危险 | muted 弱化。
 */
export function badge(text, tone = 'neutral', { className, title } = {}) {
  return h('span', { class: ['badge', `badge--${tone}`, className], title }, typeof text === 'string' ? uiText(text) : text);
}

export function levelBadge(level) {
  const meta = LEVELS[level] || LEVELS.core;
  return badge(meta.text, meta.tone, { className: 'badge--level', title: meta.title });
}
