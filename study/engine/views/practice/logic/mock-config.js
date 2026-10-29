/**
 * Per-course settings of the mock exam, read from the optional "mockExam" object in course.json:
 * builder defaults, the objective question types a paper uses and a note on the real test, plus the
 * builder choices that follow from them. A missing object or field keeps the station-wide behaviour.
 * DOM-free.
 * 每门课程的模拟考设置，读取 course.json 中可选的 "mockExam" 对象：组卷默认值、试卷使用的客观题题型和关于真实考试的说明，
 * 以及由此决定的组卷选项。对象或字段缺失时沿用全站的默认行为。不依赖 DOM。
 */
import { toBi } from '../../../core/text/bilingual.js';
import { isMainKind } from '../../../core/text/unit-labels.js';
import { MOCK_LIMITS, normalizeMockSettings } from './mock-exam.js';
import { OBJECTIVE_TYPES, TYPE_LABELS } from './question-types.js';

// Time limits the builder always offers, in minutes; "no limit" (0) is added after them.
// 组卷总会提供的时间选项（分钟）；“不限时”（0）排在它们后面。
const MINUTE_CHOICES = Object.freeze([30, 45, 60, 90, 120]);

// English words of the objective-count hint; the Chinese words are the type labels.
// 客观题数量提示中的英文说法；中文直接用题型名称。
const HINT_EN = Object.freeze({ mcq: 'multiple choice', multi: 'select-all', tf: 'true/false', calc: 'calculation' });

/**
 * Reads course.json "mockExam":
 *   defaults       - { objectiveCount, writtenCount, minutes } clamped by MOCK_LIMITS; a missing or
 *                    invalid field keeps MOCK_DEFAULTS
 *   objectiveTypes - objective types the paper uses, in OBJECTIVE_TYPES order; every objective type
 *                    when the field is missing or lists none
 *   note           - { zh, en } one-line description of the real test, or null
 * 读取 course.json 的 "mockExam"：defaults 为按 MOCK_LIMITS 限定的默认题量与时间，缺失或无效的字段沿用 MOCK_DEFAULTS；
 * objectiveTypes 为试卷使用的客观题题型（按 OBJECTIVE_TYPES 的顺序），字段缺失或没有列出客观题题型时为全部；
 * note 为一行关于真实考试的说明（{ zh, en }），没有时为 null。
 */
export function mockExamConfig(course) {
  const raw = course && typeof course === 'object' ? course.mockExam : null;
  const config = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const { objectiveCount, writtenCount, minutes } = normalizeMockSettings({
    objectiveCount: config.objectiveCount,
    writtenCount: config.writtenCount,
    minutes: config.minutes,
  });
  const listed = Array.isArray(config.objectiveTypes) ? OBJECTIVE_TYPES.filter((type) => config.objectiveTypes.includes(type)) : [];
  return {
    defaults: { objectiveCount, writtenCount, minutes },
    objectiveTypes: listed.length ? listed : OBJECTIVE_TYPES,
    note: toBi(config.note),
  };
}

/**
 * Units ticked when the builder opens: every main unit (lecture or module) among `units`, or all of
 * them when there is none. `units` are the course units that have questions, in course order.
 * 组卷页打开时默认勾选的单元：units 中的全部主要单元（讲课或模块），没有主要单元时勾选全部。units 为有题目的课程单元，按课程顺序。
 */
export function defaultMockUnits(units) {
  const list = (Array.isArray(units) ? units : []).filter((unit) => unit && typeof unit.id === 'string' && unit.id);
  const main = list.filter((unit) => isMainKind(unit.kind));
  return (main.length ? main : list).map((unit) => unit.id);
}

/**
 * Time-limit choices of the builder: the usual ones plus any of `extra` (the course default, the last
 * setting) that are missing, in ascending order with 0 (no limit) last.
 * 组卷的时间选项：常用选项，加上 extra 中还没有的值（课程默认值、上次的设置），从小到大排列，0（不限时）在最后。
 */
export function minuteChoices(...extra) {
  const values = new Set(MINUTE_CHOICES);
  for (const value of extra) {
    if (Number.isInteger(value) && value > 0 && value <= MOCK_LIMITS.minutesMax) values.add(value);
  }
  return [...[...values].sort((a, b) => a - b), 0];
}

/**
 * Hint under the objective count naming the types in use, e.g.
 * "单选、多选、判断、计算 Multiple choice, select-all, true/false, calculation".
 * 客观题数量下方的提示，列出使用的题型，例如“单选、多选、判断、计算 Multiple choice, select-all, true/false, calculation”。
 */
export function objectiveHint(objectiveTypes = OBJECTIVE_TYPES) {
  const types = OBJECTIVE_TYPES.filter((type) => Array.isArray(objectiveTypes) && objectiveTypes.includes(type));
  const en = types.map((type) => HINT_EN[type]).join(', ');
  return `${types.map((type) => TYPE_LABELS[type].zh).join('、')} ${en.charAt(0).toUpperCase()}${en.slice(1)}`.trim();
}
