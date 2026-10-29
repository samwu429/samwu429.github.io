import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultMockUnits, minuteChoices, mockExamConfig, objectiveHint } from '../../../engine/views/practice/logic/mock-config.js';
import { MOCK_DEFAULTS, MOCK_LIMITS } from '../../../engine/views/practice/logic/mock-exam.js';
import { OBJECTIVE_TYPES } from '../../../engine/views/practice/logic/question-types.js';

test('without "mockExam" the station defaults and every objective type apply', () => {
  for (const course of [undefined, null, {}, { mockExam: null }, { mockExam: [] }, { mockExam: 'midterm' }, { mockExam: {} }]) {
    const config = mockExamConfig(course);
    assert.deepEqual(config.defaults, { ...MOCK_DEFAULTS });
    assert.deepEqual(config.objectiveTypes, OBJECTIVE_TYPES);
    assert.equal(config.note, null);
  }
});

test('"mockExam" supplies the builder defaults and the note on the real test', () => {
  const note = { zh: '25 道单选题，90 分钟。', en: '25 multiple-choice questions in 90 minutes.' };
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveCount: 25, writtenCount: 0, minutes: 90, objectiveTypes: ['mcq'], note } }), {
    defaults: { objectiveCount: 25, writtenCount: 0, minutes: 90 },
    objectiveTypes: ['mcq'],
    note,
  });
  assert.deepEqual(mockExamConfig({ mockExam: { note: 'Midterm: 25 questions' } }).note, { zh: '', en: 'Midterm: 25 questions' });
  assert.equal(mockExamConfig({ mockExam: { note: { zh: ' ', en: '' } } }).note, null);
});

test('defaults are clamped by MOCK_LIMITS and missing or invalid fields keep MOCK_DEFAULTS', () => {
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveCount: 500, writtenCount: -1, minutes: 'soon' } }).defaults, {
    objectiveCount: MOCK_LIMITS.objectiveMax, writtenCount: 0, minutes: MOCK_DEFAULTS.minutes,
  });
  assert.deepEqual(mockExamConfig({ mockExam: { writtenCount: 0 } }).defaults, { ...MOCK_DEFAULTS, writtenCount: 0 });
  assert.deepEqual(mockExamConfig({ mockExam: { minutes: 0 } }).defaults, { ...MOCK_DEFAULTS, minutes: 0 });
});

test('objectiveTypes keep known objective types in catalogue order, else every objective type', () => {
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveTypes: ['calc', 'mcq', 'short', 'essay', 'mcq'] } }).objectiveTypes, ['mcq', 'calc']);
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveTypes: ['long'] } }).objectiveTypes, OBJECTIVE_TYPES);
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveTypes: [] } }).objectiveTypes, OBJECTIVE_TYPES);
  assert.deepEqual(mockExamConfig({ mockExam: { objectiveTypes: 'mcq' } }).objectiveTypes, OBJECTIVE_TYPES);
});

test('defaultMockUnits ticks the lectures or modules, or every unit when there are none', () => {
  const lecturesAndLabs = [
    { id: 'lec01', kind: 'lecture', number: 1 },
    { id: 'lab01', kind: 'lab', number: 1 },
    { id: 'lec02', kind: 'lecture', number: 2 },
  ];
  assert.deepEqual(defaultMockUnits(lecturesAndLabs), ['lec01', 'lec02']);
  assert.deepEqual(defaultMockUnits([{ id: 'mod02', kind: 'module' }, { id: 'mod01', kind: 'module' }]), ['mod02', 'mod01']);
  assert.deepEqual(defaultMockUnits([{ id: 'lab01', kind: 'lab' }, { id: 'extra', kind: 'reading' }, null, { kind: 'lab' }]), ['lab01', 'extra']);
  assert.deepEqual(defaultMockUnits(undefined), []);
});

test('minuteChoices adds a missing default and keeps "no limit" last', () => {
  assert.deepEqual(minuteChoices(), [30, 45, 60, 90, 120, 0]);
  assert.deepEqual(minuteChoices(60, 60), [30, 45, 60, 90, 120, 0]);
  assert.deepEqual(minuteChoices(50), [30, 45, 50, 60, 90, 120, 0]);
  assert.deepEqual(minuteChoices(0, 150, 999, 2.5, '75'), [30, 45, 60, 90, 120, 150, 0]);
});

test('objectiveHint names the objective types in use', () => {
  assert.equal(objectiveHint(OBJECTIVE_TYPES), '单选、多选、判断、计算 Multiple choice, select-all, true/false, calculation');
  assert.equal(objectiveHint(), objectiveHint(OBJECTIVE_TYPES));
  assert.equal(objectiveHint(['mcq']), '单选 Multiple choice');
  assert.equal(objectiveHint(['calc', 'tf']), '判断、计算 True/false, calculation');
  assert.equal(objectiveHint([]), '');
});
