import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_ORDER,
  OTHER_KIND,
  groupByKind,
  isKnownKind,
  isMainKind,
  kindGroupTitle,
  kindsText,
  unitLabels,
  unitName,
  unitNumber,
  whichUnitsZh,
} from '../../../engine/core/text/unit-labels.js';

test('numbered lectures, labs, tutorials and workshops get every form of their name', () => {
  assert.deepEqual(unitLabels({ id: 'lec03', kind: 'lecture', number: 3 }), { zh: '第 3 讲', en: 'Lecture 3', short: 'Lec 3', known: true, numbered: true });
  assert.deepEqual(unitLabels({ id: 'lab02', kind: 'lab', number: 2 }), { zh: '实验 2', en: 'Lab 2', short: 'Lab 2', known: true, numbered: true });
  assert.equal(unitLabels({ id: 'tut01', kind: 'tutorial', number: '1' }).short, 'Tut 1');
  assert.equal(unitLabels({ id: 'wks02', kind: 'workshop', number: 2 }).en, 'Workshop 2');
});

test('modules are named like the other kinds', () => {
  assert.deepEqual(unitLabels({ id: 'mod03', kind: 'module', number: 3 }), { zh: '模块 3', en: 'Module 3', short: 'Mod 3', known: true, numbered: true });
  assert.deepEqual(unitLabels({ id: 'mod09', kind: 'module', number: null }), { zh: '模块', en: 'Module', short: 'MOD09', known: true, numbered: false });
  assert.deepEqual(unitName({ kind: 'module', number: '5' }), { zh: '模块 5', en: 'Module 5' });
});

test('kinds have plural group titles, a display order and a main flag', () => {
  assert.deepEqual(KIND_ORDER, ['lecture', 'module', 'lab', 'tutorial', 'workshop']);
  assert.deepEqual(KIND_ORDER.map(kindGroupTitle), [
    { zh: '讲课', en: 'Lectures' },
    { zh: '模块', en: 'Modules' },
    { zh: '实验', en: 'Labs' },
    { zh: '辅导', en: 'Tutorials' },
    { zh: '工作坊', en: 'Workshops' },
  ]);
  for (const kind of [OTHER_KIND, 'reading', 'constructor', '', null, undefined]) {
    assert.deepEqual(kindGroupTitle(kind), { zh: '其他', en: 'Other' }, String(kind));
    assert.equal(isKnownKind(kind), false, String(kind));
    assert.equal(isMainKind(kind), false, String(kind));
  }
  assert.ok(KIND_ORDER.every(isKnownKind));
  assert.deepEqual(KIND_ORDER.filter(isMainKind), ['lecture', 'module']);
});

test('whichUnitsZh asks which units of a kind', () => {
  assert.equal(whichUnitsZh('lecture'), '哪几讲');
  assert.equal(whichUnitsZh('module'), '哪几个模块');
  assert.equal(whichUnitsZh('lab'), '哪几个实验');
  assert.equal(whichUnitsZh(undefined), '哪些单元');
  assert.equal(whichUnitsZh('reading'), '哪些单元');
});

test('groupByKind follows the display order, keeps the given order and gathers unknown kinds last', () => {
  const units = [
    { id: 'lab01', kind: 'lab', number: 1 },
    { id: 'extra', kind: 'reading' },
    { id: 'mod02', kind: 'module', number: 2 },
    null,
    { id: 'lec01', kind: 'lecture', number: 1 },
    { id: 'mod01', kind: 'module', number: 1 },
    { id: 'wks01', kind: 'workshop', number: 1 },
    { id: 'misc' },
    'junk',
  ];
  const groups = groupByKind(units);
  assert.deepEqual(groups.map((group) => group.kind), ['lecture', 'module', 'lab', 'workshop', OTHER_KIND]);
  assert.deepEqual(groups[1].units.map((unit) => unit.id), ['mod02', 'mod01']);
  assert.deepEqual(groups[4].units.map((unit) => unit.id), ['extra', 'misc']);
  assert.equal(groups[0].units[0], units[4]);
  assert.deepEqual(groupByKind(undefined), []);
});

test('kindsText names the kinds a course uses, or falls back to units', () => {
  assert.deepEqual(kindsText([{ kind: 'lab' }, { kind: 'lecture' }, { kind: 'lab' }]), { zh: '讲课和实验', en: 'lecture and lab' });
  assert.deepEqual(kindsText([{ kind: 'module' }, { kind: 'module' }]), { zh: '模块', en: 'module' });
  assert.deepEqual(kindsText([{ kind: 'tutorial' }, { kind: 'lecture' }, { kind: 'lab' }]), { zh: '讲课、实验和辅导', en: 'lecture, lab and tutorial' });
  assert.deepEqual(kindsText([{ kind: 'lecture' }, { kind: 'reading' }]), { zh: '单元', en: 'unit' });
  assert.deepEqual(kindsText([]), { zh: '单元', en: 'unit' });
  assert.deepEqual(kindsText(undefined), { zh: '单元', en: 'unit' });
});

test('a known kind without a number keeps its kind name; anything else falls back to the id', () => {
  assert.deepEqual(unitLabels({ id: 'lec09', kind: 'lecture', number: null }), { zh: '讲课', en: 'Lecture', short: 'LEC09', known: true, numbered: false });
  assert.deepEqual(unitName({ kind: 'lab' }), { zh: '实验', en: 'Lab' });
  assert.deepEqual(unitLabels({ id: 'review', kind: 'other', number: 1 }), { zh: 'review', en: 'review', short: 'REVIEW', known: false, numbered: false });
  assert.equal(unitLabels(undefined, 'lab09').short, 'LAB09');
  assert.deepEqual(unitLabels(null), { zh: '', en: '', short: '', known: false, numbered: false });
  assert.equal(unitLabels({ id: 'x', kind: 'constructor', number: 1 }).known, false);
});

test('unitName matches the course numbering', () => {
  assert.deepEqual(unitName({ kind: 'lecture', number: 6 }), { zh: '第 6 讲', en: 'Lecture 6' });
  assert.deepEqual(unitName({ kind: 'lab', number: 5 }), { zh: '实验 5', en: 'Lab 5' });
  assert.deepEqual(unitName({ id: 'review', kind: 'other' }), { zh: 'review', en: 'review' });
});

test('unitNumber accepts positive integers and numeric strings only', () => {
  assert.equal(unitNumber({ number: 4 }), 4);
  assert.equal(unitNumber({ number: '7' }), 7);
  for (const number of [0, -1, 2.5, '', null, undefined, 'three']) assert.equal(unitNumber({ number }), null, String(number));
  assert.equal(unitNumber(undefined), null);
});
