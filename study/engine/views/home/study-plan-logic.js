/**
 * Pure helpers of the study plan page: normalised plans, checkbox storage keys and task links.
 * 学习计划页的纯逻辑：规范化计划、勾选状态的存储键与任务里的页面链接。
 *
 * Ticks reuse the section store: unitId "plan-<planId>", sectionId "d<dayIndex>-t<taskIndex>".
 * Indices are positions in the original JSON arrays, so skipping a malformed entry never shifts keys.
 * 勾选状态复用小节进度存储：unitId 为 "plan-<planId>"，sectionId 为 "d<天序号>-t<任务序号>"。
 * 序号取自原始 JSON 数组的位置，跳过格式不对的条目也不会让其他键错位。
 */
import { PLAN_UNIT_PREFIX } from '../../core/state/progress-store.js';
import { toBi } from '../../core/text/bilingual.js';
import { unitName } from '../../core/text/unit-labels.js';
import { isRouteId } from '../../core/util/ids.js';

// A range wider than this links to the unit list instead of one chip per unit.
// 范围超过这个数量时，改为链接到单元列表，而不是逐个生成链接。
const MAX_RANGE = 3;
const MAX_LINKS = 5;

// Groups of every unit pattern: 1 first number, 2 joiner, 3 repeated prefix, 4 second number.
// 每个单元匹配式的分组：1 第一个数字，2 连接词，3 重复的前缀，4 第二个数字。
const EN_JOIN = '(-|–|—|~|to|and|&|,)';
const ZH_JOIN = '(-|–|—|~|到|至|、|和)';
const RANGE_JOINER = /^(?:-|–|—|~|to|到|至)$/i;
const UNIT_PATTERNS = [
  { kind: 'lecture', regex: new RegExp(`\\blec(?:ture)?s?\\s*0?(\\d{1,2})(?:\\s*${EN_JOIN}\\s*(lec(?:ture)?s?\\s*)?0?(\\d{1,2}))?\\b`, 'gi') },
  { kind: 'lab', regex: new RegExp(`\\blabs?\\s*0?(\\d{1,2})(?:\\s*${EN_JOIN}\\s*(labs?\\s*)?0?(\\d{1,2}))?\\b`, 'gi') },
  { kind: 'lecture', regex: new RegExp(`第\\s*(\\d{1,2})\\s*(?:${ZH_JOIN}\\s*(第\\s*)?(\\d{1,2})\\s*)?讲`, 'g') },
  { kind: 'lab', regex: new RegExp(`实验\\s*(\\d{1,2})(?:\\s*${ZH_JOIN}\\s*(实验\\s*)?(\\d{1,2}))?`, 'g') },
];

const PAGE_LINKS = [
  { href: '#/flashcards', label: { zh: '闪卡', en: 'Flashcards' }, pattern: /flash\s*-?\s*cards?|闪卡/i },
  { href: '#/cheatsheet', label: { zh: '考前速记', en: 'Cheat sheet' }, pattern: /cheat\s*-?\s*sheet|速记/i },
  { href: '#/toolkit', label: { zh: '答题工具箱', en: 'Exam toolkit' }, pattern: /toolkit|工具箱|答题模板/i },
  { href: '#/mock', label: { zh: '模拟考试', en: 'Mock exam' }, pattern: /mock\s+(?:exam|test)|模拟考/i },
  { href: '#/mistakes', label: { zh: '错题本', en: 'Mistakes' }, pattern: /mistake\s*(?:book|list|page)|wrong answers|错题/i },
  { href: '#/glossary', label: { zh: '术语表', en: 'Glossary' }, pattern: /glossary|术语表/i },
  { href: '#/practice', label: { zh: '刷题', en: 'Practice' }, pattern: /\bpractice\b(?!\s+mode)|刷题|练习题/i },
];

export function planStorageId(plan, index = 0) {
  const slug = String(plan?.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${PLAN_UNIT_PREFIX}${slug || index + 1}`;
}

export function taskKey(dayIndex, taskIndex) {
  return `d${dayIndex}-t${taskIndex}`;
}

/**
 * Normalises one plan; days without any readable task are dropped.
 * 规范化单个计划；没有可读任务的天会被去掉。
 */
export function normalizePlan(plan, index = 0) {
  const days = (Array.isArray(plan?.days) ? plan.days : [])
    .map((day, dayIndex) => ({
      index: dayIndex,
      label: toBi(day?.label),
      tasks: (Array.isArray(day?.tasks) ? day.tasks : [])
        .map((task, taskIndex) => ({ index: taskIndex, key: taskKey(dayIndex, taskIndex), text: toBi(task) }))
        .filter((task) => task.text),
    }))
    .filter((day) => day.tasks.length);
  return {
    storageId: planStorageId(plan, index),
    title: toBi(plan?.title),
    note: toBi(plan?.note),
    days,
  };
}

/**
 * Normalised plans of course-overview.json; plans that would share a storage id get a numeric suffix.
 * 课程总览中的全部计划（已规范化）；存储 id 冲突时追加数字后缀。
 */
export function normalizePlans(plans) {
  const seen = new Set();
  return (Array.isArray(plans) ? plans : [])
    .filter((plan) => plan && typeof plan === 'object')
    .map((plan, index) => {
      const normalized = normalizePlan(plan, index);
      let storageId = normalized.storageId;
      for (let suffix = 2; seen.has(storageId); suffix += 1) storageId = `${normalized.storageId}-${suffix}`;
      seen.add(storageId);
      return { ...normalized, storageId };
    })
    .filter((plan) => plan.days.length);
}

export function planTaskKeys(plan) {
  return plan.days.flatMap((day) => day.tasks.map((task) => task.key));
}

/**
 * Index (within plan.days) of the first day that still has an unticked task, or -1.
 * 第一个仍有未勾选任务的天在 plan.days 中的下标；全部完成时为 -1。
 */
export function firstOpenDay(plan, isDone) {
  return plan.days.findIndex((day) => day.tasks.some((task) => !isDone(task.key)));
}

function unitFor(units, kind, number) {
  return units.find((unit) => unit && unit.kind === kind && Number(unit.number) === number && isRouteId(unit.id)) || null;
}

/**
 * Finds the station pages a task mentions ("Lecture 5", "lab03", "第 4–6 讲", "flashcards", "错题本")
 * and returns links to them, units first.
 * 找出任务文字提到的站内页面（如“Lecture 5”“lab03”“第 4–6 讲”“闪卡”“错题本”），返回对应链接，单元在前。
 */
export function detectTaskLinks(task, units) {
  const bi = toBi(task);
  if (!bi) return [];
  const text = `${bi.en} \n ${bi.zh}`;
  const unitList = Array.isArray(units) ? units : [];
  const links = [];
  const add = (link) => {
    if (link && !links.some((existing) => existing.href === link.href)) links.push(link);
  };

  for (const { kind, regex } of UNIT_PATTERNS) {
    for (const match of text.matchAll(regex)) {
      const first = Number(match[1]);
      // A second number only counts when it names a real unit, so "lec 5 - 30 min" stays one link.
      // 第二个数字必须对应真实存在的单元才算数，因此“lec 5 - 30 min”只生成一个链接。
      const second = match[4] !== undefined && unitFor(unitList, kind, Number(match[4])) ? Number(match[4]) : null;
      let numbers = [first];
      if (second !== null && RANGE_JOINER.test(match[2]) && second > first) {
        if (second - first + 1 > MAX_RANGE) {
          add({ href: '#/learn', label: { zh: '全部单元', en: 'All units' } });
          continue;
        }
        numbers = Array.from({ length: second - first + 1 }, (_, offset) => first + offset);
      } else if (second !== null && (match[3] || second > first)) {
        numbers.push(second);
      }
      for (const number of numbers) {
        const unit = unitFor(unitList, kind, number);
        if (unit) add({ href: `#/learn/${unit.id}`, label: unitName(unit), unitId: unit.id });
      }
    }
  }

  for (const page of PAGE_LINKS) {
    if (page.pattern.test(text)) add({ href: page.href, label: page.label });
  }
  return links.slice(0, MAX_LINKS);
}
