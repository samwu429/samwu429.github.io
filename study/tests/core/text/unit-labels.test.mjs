import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitLabels, unitName, unitNumber } from '../../../engine/core/text/unit-labels.js';

test('numbered lectures, labs, tutorials and workshops get every form of their name', () => {
  assert.deepEqual(unitLabels({ id: 'lec03', kind: 'lecture', number: 3 }), { zh: '第 3 讲', en: 'Lecture 3', short: 'Lec 3', known: true, numbered: true });
  assert.deepEqual(unitLabels({ id: 'lab02', kind: 'lab', number: 2 }), { zh: '实验 2', en: 'Lab 2', short: 'Lab 2', known: true, numbered: true });
  assert.equal(unitLabels({ id: 'tut01', kind: 'tutorial', number: '1' }).short, 'Tut 1');
  assert.equal(unitLabels({ id: 'wks02', kind: 'workshop', number: 2 }).en, 'Workshop 2');
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
