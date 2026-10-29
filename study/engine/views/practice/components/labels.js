/**
 * Small text helpers shared by the practice views: unit names, type and difficulty badges, previews, links.
 * 刷题各视图共用的文字小工具：单元名称、题型与难度徽标、题干预览与课文链接。
 */
import { stripMarkup } from '../../../core/text/inline-markup.js';
import { kindGroupTitle, unitLabels } from '../../../core/text/unit-labels.js';
import { isRouteId } from '../../../core/util/ids.js';
import { badge } from '../../../components/badges/badge.js';
import { TYPE_LABELS, isWrittenType } from '../logic/question-types.js';

const DIFFICULTY = { 1: '基础 Easy', 2: '中等 Medium', 3: '较难 Hard' };

/** Map of unit id -> unit meta from course.json, in course order. course.json 中的单元，按课程顺序。 */
export function unitsById(course) {
  const units = Array.isArray(course?.units) ? course.units : [];
  return new Map(units.filter((unit) => unit && typeof unit.id === 'string').map((unit) => [unit.id, unit]));
}

/** "第 3 讲 Lecture 3" / "实验 2 Lab 2" (core/text/unit-labels.js), falling back to the unit id. 单元的短名称。 */
export function unitKicker(unit) {
  if (!unit) return '';
  const label = unitLabels(unit);
  return label.numbered ? `${label.zh} ${label.en}` : String(unit.id || '');
}

/** Group heading for a unit kind, e.g. "讲课 Lectures", "模块 Modules" (core/text/unit-labels.js). 单元类别的分组标题。 */
export function kindLabel(kind) {
  const title = kindGroupTitle(kind);
  return `${title.zh} ${title.en}`;
}

export function typeLabel(type) {
  const label = TYPE_LABELS[type];
  return label ? `${label.zh} ${label.en}` : String(type || '');
}

export function typeBadge(type) {
  return badge(typeLabel(type), isWrittenType(type) ? 'exam' : 'neutral');
}

export function difficultyBadge(level) {
  const text = DIFFICULTY[level];
  return text ? badge(text, 'muted', { title: '难度 Difficulty' }) : null;
}

/** Plain one-line English preview of a question stem. 题干的单行英文预览。 */
export function promptPreview(question, max = 160) {
  const source = question?.prompt?.en || question?.prompt?.zh || question?.id || '';
  const text = stripMarkup(source).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function promptLang(question) {
  return question?.prompt?.en ? 'en' : 'zh-CN';
}

/** Hash link to the lesson section a question comes from, or null. 题目出处的课文小节链接。 */
export function lessonHref(question) {
  const unitId = String(question?.unitId ?? '');
  const sectionId = String(question?.sectionId ?? '');
  if (!isRouteId(unitId)) return null;
  return isRouteId(sectionId) ? `#/learn/${unitId}/${sectionId}` : `#/learn/${unitId}`;
}

/** 0.756 -> "76%"; null -> an em dash. 比例转百分比文字。 */
export function formatRatio(ratio) {
  return Number.isFinite(ratio) ? `${Math.round(ratio * 100)}%` : '—';
}

