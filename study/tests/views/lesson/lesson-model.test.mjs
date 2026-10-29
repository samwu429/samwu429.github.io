import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseActiveSection,
  displayTitle,
  groupUnits,
  isPlainClick,
  lessonHref,
  minutesLabel,
  neighbourUnits,
  normalizeSections,
  practiceHref,
  sectionNumber,
  slidesLabel,
  stripKindPrefix,
  unitKindLabel,
} from '../../../engine/views/lesson/lesson-model.js';

const UNITS = [
  { id: 'lec01', kind: 'lecture', number: 1 },
  { id: 'lec02', kind: 'lecture', number: 2 },
  { id: 'lab01', kind: 'lab', number: 1 },
  { id: 'extra-reading', kind: 'reading' },
];

test('lesson and practice links fall back safely on odd ids', () => {
  assert.equal(lessonHref('lec03'), '#/learn/lec03');
  assert.equal(lessonHref('lec03', 's02-state'), '#/learn/lec03/s02-state');
  assert.equal(lessonHref('lec03', 'BAD ID'), '#/learn/lec03');
  assert.equal(lessonHref('../x'), '#/learn');
  assert.equal(practiceHref('lab02'), '#/practice/run?units=lab02');
  assert.equal(practiceHref('x?y'), '#/practice');
});

test('kind labels name lectures and labs in both languages', () => {
  assert.deepEqual(unitKindLabel({ kind: 'lecture', number: 3 }), { zh: '第 3 讲', en: 'Lecture 3' });
  assert.deepEqual(unitKindLabel({ kind: 'lab', number: 2 }), { zh: '实验 2', en: 'Lab 2' });
  assert.deepEqual(unitKindLabel({ kind: 'lecture' }), { zh: '讲课', en: 'Lecture' });
  assert.deepEqual(unitKindLabel({ kind: 'other', number: 1 }), { zh: '单元 1', en: 'Unit 1' });
  assert.deepEqual(unitKindLabel(undefined), { zh: '单元', en: 'Unit' });
});

test('units are grouped into lectures, labs and other, keeping course order', () => {
  const groups = groupUnits([...UNITS, null, 'junk']);
  assert.deepEqual(groups.map((group) => group.kind), ['lecture', 'lab', 'other']);
  assert.deepEqual(groups[0].units.map((unit) => unit.id), ['lec01', 'lec02']);
  assert.deepEqual(groups[2].units.map((unit) => unit.id), ['extra-reading']);
  assert.deepEqual(groupUnits([{ id: 'lab01', kind: 'lab' }]).map((group) => group.kind), ['lab']);
  assert.deepEqual(groupUnits(undefined), []);
});

test('neighbours follow course.units order across lectures and labs', () => {
  assert.deepEqual(neighbourUnits(UNITS, 'lec01'), { previous: null, next: UNITS[1] });
  assert.deepEqual(neighbourUnits(UNITS, 'lec02'), { previous: UNITS[0], next: UNITS[2] });
  assert.deepEqual(neighbourUnits(UNITS, 'extra-reading'), { previous: UNITS[2], next: null });
  assert.deepEqual(neighbourUnits(UNITS, 'missing'), { previous: null, next: null });
});

test('section numbers are two-digit and 1-based', () => {
  assert.equal(sectionNumber(0), '01');
  assert.equal(sectionNumber(11), '12');
  assert.equal(sectionNumber(99), '100');
});

test('sections get unique route-safe ids and always have a block list', () => {
  const sections = normalizeSections([
    { id: 's01-intro', blocks: [{ type: 'text' }] },
    null,
    { id: 'Bad Id' },
    { id: 's01-intro', blocks: 'nope' },
    { id: 's01-intro' },
  ]);
  assert.deepEqual(sections.map((section) => section.id), ['s01-intro', 's03', 's01-intro-2', 's01-intro-3']);
  assert.ok(sections.every((section) => Array.isArray(section.blocks)));
  assert.equal(sections[0].blocks.length, 1);
  assert.deepEqual(normalizeSections(undefined), []);
});

test('the active section is the first visible one in page order', () => {
  const order = ['s01', 's02', 's03'];
  assert.equal(chooseActiveSection(order, new Set(['s03', 's02'])), 's02');
  assert.equal(chooseActiveSection(order, ['s03']), 's03');
  assert.equal(chooseActiveSection(order, new Set()), null);
  assert.equal(chooseActiveSection(undefined, ['s01']), null);
});

test('minutes and slide labels ignore missing or invalid values', () => {
  assert.deepEqual(minutesLabel(70), { zh: '约 70 分钟', en: 'about 70 min' });
  assert.deepEqual(minutesLabel('45.4'), { zh: '约 45 分钟', en: 'about 45 min' });
  assert.equal(minutesLabel(0), null);
  assert.equal(minutesLabel('abc'), null);
  assert.equal(minutesLabel(undefined), null);
  assert.equal(slidesLabel('9, 12-14'), 'p.9, 12-14');
  assert.equal(slidesLabel(7), 'p.7');
  assert.equal(slidesLabel('  '), '');
  assert.equal(slidesLabel(null), '');
});

test('a leading "Lab N:" is removed from titles because the kind is shown separately', () => {
  const lab1 = { zh: '实验 1', en: 'Lab 1' };
  assert.equal(stripKindPrefix('Lab 1：选择合适的方法', lab1), '选择合适的方法');
  assert.equal(stripKindPrefix('Lab 1: Selecting a Method', lab1), 'Selecting a Method');
  assert.equal(stripKindPrefix('lab 1 :  Selecting', lab1), 'Selecting');
  assert.equal(stripKindPrefix('实验 1：选方法', lab1), '选方法');
  assert.equal(stripKindPrefix('Lab 10: Other', lab1), 'Lab 10: Other');
  assert.equal(stripKindPrefix('Lab 1 Results', lab1), 'Lab 1 Results');
  assert.equal(stripKindPrefix('Lab 1:', lab1), 'Lab 1:');
  assert.equal(stripKindPrefix(undefined, lab1), undefined);
  assert.deepEqual(displayTitle({ zh: 'Lab 1：选方法', en: 'Lab 1: Choose' }, lab1), { zh: '选方法', en: 'Choose' });
  assert.deepEqual(displayTitle({ en: 'Search' }, { zh: '第 3 讲', en: 'Lecture 3' }), { en: 'Search', zh: undefined });
  assert.equal(displayTitle(null, lab1), null);
});

test('only unmodified primary clicks are handled in the page', () => {
  assert.equal(isPlainClick({ button: 0 }), true);
  assert.equal(isPlainClick({}), true);
  assert.equal(isPlainClick({ button: 1 }), false);
  assert.equal(isPlainClick({ button: 0, ctrlKey: true }), false);
  assert.equal(isPlainClick({ button: 0, metaKey: true }), false);
  assert.equal(isPlainClick({ button: 0, shiftKey: true }), false);
  assert.equal(isPlainClick(null), false);
});
