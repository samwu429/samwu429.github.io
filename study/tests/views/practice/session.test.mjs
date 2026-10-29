import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RANDOM_COUNT,
  MAX_SESSION_COUNT,
  buildSession,
  filterQuestions,
  parseSessionQuery,
  parseTypes,
  parseUnits,
  sessionPath,
} from '../../../engine/views/practice/logic/session.js';
import { createRng } from '../../../engine/views/practice/logic/rng.js';

function bank() {
  const types = ['mcq', 'mcq', 'tf', 'multi', 'calc', 'short', 'long'];
  const questions = [];
  for (const unitId of ['lec01', 'lec02', 'lab01']) {
    types.forEach((type, index) => {
      questions.push({ id: `${unitId}-q${String(index + 1).padStart(2, '0')}`, type, unitId });
    });
  }
  return questions;
}

test('parseSessionQuery: defaults when the query is empty', () => {
  assert.deepEqual(parseSessionQuery(new URLSearchParams('')), {
    units: 'all', types: 'all', count: null, mode: 'ordered', ids: null,
  });
  assert.deepEqual(parseSessionQuery(null), parseSessionQuery({}));
});

test('parseSessionQuery: reads URLSearchParams and plain objects alike', () => {
  const query = new URLSearchParams('units=lec01,LAB02&types=mcq,tf&count=15&mode=random');
  assert.deepEqual(parseSessionQuery(query), {
    units: ['lec01', 'lab02'], types: ['mcq', 'tf'], count: 15, mode: 'random', ids: null,
  });
  assert.deepEqual(parseSessionQuery({ units: 'lec03', mode: 'mistakes' }).units, ['lec03']);
  assert.equal(parseSessionQuery({ mode: 'mistakes' }).mode, 'mistakes');
});

test('parseSessionQuery: rejects bad values', () => {
  const parsed = parseSessionQuery(new URLSearchParams('units=<script>&types=essay&count=-3&mode=hack&ids=a b,lec01-q01'));
  assert.equal(parsed.units, 'all');
  assert.equal(parsed.types, 'all');
  assert.equal(parsed.count, null);
  assert.equal(parsed.mode, 'ordered');
  assert.deepEqual(parsed.ids, ['lec01-q01']);
  assert.equal(parseSessionQuery({ count: '9999' }).count, MAX_SESSION_COUNT);
  assert.equal(parseSessionQuery({ count: 'abc' }).count, null);
});

test('parseTypes and parseUnits: groups, duplicates and "all"', () => {
  assert.deepEqual(parseTypes('written'), ['short', 'long']);
  assert.deepEqual(parseTypes('objective'), ['mcq', 'multi', 'tf', 'calc']);
  assert.deepEqual(parseTypes('tf,mcq,tf'), ['mcq', 'tf']);
  assert.equal(parseTypes('objective,written'), 'all');
  assert.equal(parseTypes('all'), 'all');
  assert.equal(parseTypes(''), 'all');
  assert.deepEqual(parseUnits('lec01,lec01, lec02 '), ['lec01', 'lec02']);
  assert.equal(parseUnits('all,lec01'), 'all');
});

test('sessionPath round-trips through parseSessionQuery', () => {
  const settings = { units: ['lec01', 'lab02'], types: ['tf', 'mcq'], count: 12, mode: 'random', ids: null };
  const path = sessionPath(settings);
  assert.ok(path.startsWith('/practice/run?'));
  const parsed = parseSessionQuery(new URLSearchParams(path.split('?')[1]));
  assert.deepEqual(parsed, { ...settings, types: ['mcq', 'tf'] });

  const retry = sessionPath({ ids: ['lec01-q03', 'lab01-q01'] });
  assert.deepEqual(parseSessionQuery(new URLSearchParams(retry.split('?')[1])).ids, ['lec01-q03', 'lab01-q01']);
  assert.equal(sessionPath(), '/practice/run?units=all&types=all&mode=ordered');
  assert.equal(sessionPath({ units: ['bad id'], mode: 'weird' }), '/practice/run?units=all&types=all&mode=ordered');
});

test('filterQuestions: units, types, ids, unknown types and duplicates', () => {
  const questions = [...bank(), { id: 'lec01-q01', type: 'mcq', unitId: 'lec01' }, { id: 'x-q01', type: 'essay', unitId: 'lec01' }, null];
  assert.equal(filterQuestions(questions).length, 21);
  assert.equal(filterQuestions(questions, { units: ['lec02'] }).length, 7);
  assert.deepEqual(filterQuestions(questions, { units: ['lec02'], types: ['short', 'long'] }).map((q) => q.id), ['lec02-q06', 'lec02-q07']);
  assert.deepEqual(filterQuestions(questions, { ids: ['lab01-q02', 'lec01-q01'] }).map((q) => q.id), ['lec01-q01', 'lab01-q02']);
  assert.deepEqual(filterQuestions(undefined), []);
});

test('buildSession ordered: bank order with an optional limit', () => {
  const ordered = buildSession(bank(), { units: ['lec01'], mode: 'ordered' });
  assert.deepEqual(ordered.map((q) => q.id), ['lec01-q01', 'lec01-q02', 'lec01-q03', 'lec01-q04', 'lec01-q05', 'lec01-q06', 'lec01-q07']);
  assert.equal(buildSession(bank(), { units: 'all', count: 5 }).length, 5);
});

test('buildSession random: seeded, limited, no duplicates', () => {
  const first = buildSession(bank(), { mode: 'random' }, { random: createRng(42) });
  const second = buildSession(bank(), { mode: 'random' }, { random: createRng(42) });
  assert.equal(first.length, DEFAULT_RANDOM_COUNT);
  assert.deepEqual(first.map((q) => q.id), second.map((q) => q.id));
  assert.equal(new Set(first.map((q) => q.id)).size, first.length);
  const small = buildSession(bank(), { mode: 'random', units: ['lab01'], count: 50 }, { random: createRng(1) });
  assert.equal(small.length, 7);
});

test('buildSession mistakes: only questions in the mistake list', () => {
  const mistakes = ['lec02-q03', 'lab01-q06', 'gone-q01'];
  const session = buildSession(bank(), { mode: 'mistakes' }, { mistakes });
  assert.deepEqual(session.map((q) => q.id), ['lec02-q03', 'lab01-q06']);
  const objectiveOnly = buildSession(bank(), { mode: 'mistakes', types: ['tf'] }, { mistakes });
  assert.deepEqual(objectiveOnly.map((q) => q.id), ['lec02-q03']);
  assert.deepEqual(buildSession(bank(), { mode: 'mistakes' }), []);
});

test('buildSession with ids keeps the order of the id list', () => {
  const session = buildSession(bank(), { ids: ['lab01-q02', 'lec01-q05', 'lec02-q01'] });
  assert.deepEqual(session.map((q) => q.id), ['lab01-q02', 'lec01-q05', 'lec02-q01']);
});
