import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTaskLinks,
  firstOpenDay,
  normalizePlan,
  normalizePlans,
  planStorageId,
  planTaskKeys,
  taskKey,
} from '../../../engine/views/home/study-plan-logic.js';

const UNITS = [
  { id: 'lec01', kind: 'lecture', number: 1 },
  { id: 'lec02', kind: 'lecture', number: 2 },
  { id: 'lec03', kind: 'lecture', number: 3 },
  { id: 'lec04', kind: 'lecture', number: 4 },
  { id: 'lec05', kind: 'lecture', number: 5 },
  { id: 'lec06', kind: 'lecture', number: 6 },
  { id: 'lec07', kind: 'lecture', number: 7 },
  { id: 'lab03', kind: 'lab', number: 3 },
  { id: 'lab04', kind: 'lab', number: 4 },
];

const MODULES = [1, 2, 3, 4, 5].map((number) => ({ id: `mod0${number}`, kind: 'module', number }));

const hrefs = (links) => links.map((link) => link.href);

test('planStorageId follows the plan-<id> convention and stays safe', () => {
  assert.equal(planStorageId({ id: 'test2' }), 'plan-test2');
  assert.equal(planStorageId({ id: 'Final Exam!' }), 'plan-final-exam');
  assert.equal(planStorageId({}, 2), 'plan-3');
  assert.equal(taskKey(0, 3), 'd0-t3');
});

test('normalizePlan keeps original indices when malformed entries are skipped', () => {
  const plan = normalizePlan({
    id: 'test2',
    title: { zh: '冲刺', en: 'Sprint' },
    note: '以 Quercus 为准',
    days: [
      { label: { zh: '第 1 天', en: 'Day 1' }, tasks: [{ zh: '复习', en: 'Review' }, null, 'Read lec05'] },
      { label: { zh: '空', en: 'Empty' }, tasks: [] },
      null,
      { label: 'Day 4', tasks: [{ zh: '', en: '' }, { en: 'Mock exam' }] },
    ],
  });
  assert.equal(plan.storageId, 'plan-test2');
  assert.deepEqual(plan.note, { zh: '以 Quercus 为准', en: '' });
  assert.deepEqual(plan.days.map((day) => day.index), [0, 3]);
  assert.deepEqual(planTaskKeys(plan), ['d0-t0', 'd0-t2', 'd3-t1']);
  assert.deepEqual(plan.days[1].label, { zh: '', en: 'Day 4' });
});

test('normalizePlans drops empty plans and de-duplicates storage ids', () => {
  const plans = normalizePlans([
    { id: 'final', days: [{ tasks: ['a'] }] },
    { id: 'final', days: [{ tasks: ['b'] }] },
    { id: 'empty', days: [] },
    'not a plan',
  ]);
  assert.deepEqual(plans.map((plan) => plan.storageId), ['plan-final', 'plan-final-2']);
  assert.deepEqual(normalizePlans(undefined), []);
});

test('firstOpenDay finds the first day with an unticked task', () => {
  const plan = normalizePlan({ id: 'p', days: [{ tasks: ['a', 'b'] }, { tasks: ['c'] }] });
  assert.equal(firstOpenDay(plan, () => false), 0);
  assert.equal(firstOpenDay(plan, (key) => key.startsWith('d0')), 1);
  assert.equal(firstOpenDay(plan, () => true), -1);
});

test('detectTaskLinks finds lectures and labs in English and Chinese', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Reread lec05 and do Lab 3', zh: '重读第 5 讲' }, UNITS)), ['#/learn/lec05', '#/learn/lab03']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '复习第 4–6 讲的例子' }, UNITS)), ['#/learn/lec04', '#/learn/lec05', '#/learn/lec06']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Lectures 4 and 6' }, UNITS)), ['#/learn/lec04', '#/learn/lec06']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '做实验 4 的题' }, UNITS)), ['#/learn/lab04']);
  assert.deepEqual(detectTaskLinks({ en: 'Lecture 5' }, UNITS)[0].label, { zh: '第 5 讲', en: 'Lecture 5' });
});

test('detectTaskLinks finds modules in English', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Reread Module 3' }, MODULES)), ['#/learn/mod03']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Redo Modules 1-3' }, MODULES)), ['#/learn/mod01', '#/learn/mod02', '#/learn/mod03']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Modules 1 and 2' }, MODULES)), ['#/learn/mod01', '#/learn/mod02']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Mod 3 slides, then mod05' }, MODULES)), ['#/learn/mod03', '#/learn/mod05']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Module 2 to Module 4' }, MODULES)), ['#/learn/mod02', '#/learn/mod03', '#/learn/mod04']);
  assert.deepEqual(detectTaskLinks({ en: 'Module 4' }, MODULES)[0].label, { zh: '模块 4', en: 'Module 4' });
});

test('detectTaskLinks finds modules in Chinese', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '复习模块 3 的例题' }, MODULES)), ['#/learn/mod03']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '把模块 1–3 的公式抄一遍' }, MODULES)), ['#/learn/mod01', '#/learn/mod02', '#/learn/mod03']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '模块 2 和模块 4' }, MODULES)), ['#/learn/mod02', '#/learn/mod04']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '重读第 3 模块' }, MODULES)), ['#/learn/mod03']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '第 4 个模块' }, MODULES)), ['#/learn/mod04']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '第 1–2 模块' }, MODULES)), ['#/learn/mod01', '#/learn/mod02']);
});

test('module ranges, false ranges and other kinds behave like lectures', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Review Modules 1-5' }, MODULES)), ['#/learn']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Module 2 - 30 minutes' }, MODULES)), ['#/learn/mod02']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Fit the model 2 times; modes 3 and 4' }, MODULES)), []);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Lecture 3 and Lab 3', zh: '第 3 讲、实验 3' }, MODULES)), []);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Module 3, then Lecture 3', zh: '第 3 模块' }, UNITS)), ['#/learn/lec03']);
});

test('detectTaskLinks avoids false ranges and unknown units', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'lec 5 - 30 minutes' }, UNITS)), ['#/learn/lec05']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Lecture 6, 2 hours' }, UNITS)), ['#/learn/lec06']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Lecture 9 and the label' }, UNITS)), []);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Review Lectures 1-7' }, UNITS)), ['#/learn']);
});

test('detectTaskLinks links station pages and caps the number of links', () => {
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Do 20 flashcards, then a mock exam', zh: '再看错题本' }, UNITS)), ['#/flashcards', '#/mock', '#/mistakes']);
  assert.deepEqual(hrefs(detectTaskLinks({ zh: '用答题工具箱写一段长答题，再看考前速记' }, UNITS)), ['#/cheatsheet', '#/toolkit']);
  assert.deepEqual(hrefs(detectTaskLinks({ en: 'Switch to English practice mode' }, UNITS)), []);
  const many = detectTaskLinks({ en: 'lec01 lec02 lec03 lab03 lab04 flashcards glossary' }, UNITS);
  assert.equal(many.length, 5);
  assert.deepEqual(detectTaskLinks(null, UNITS), []);
});
