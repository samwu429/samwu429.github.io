import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../../../engine/core/state/local-store.js';
import { createFakeStorage } from './fake-storage.mjs';

test('values round-trip as JSON under a namespaced key', () => {
  const storage = createFakeStorage();
  const store = createLocalStore('csc105h5', storage);
  assert.equal(store.set('mistakes', ['lec01-q02']), true);
  assert.equal(storage.raw.get('topphi-study:csc105h5:mistakes'), '["lec01-q02"]');
  assert.deepEqual(store.get('mistakes', []), ['lec01-q02']);
  assert.deepEqual(store.get('missing', 'fallback'), 'fallback');
  assert.deepEqual(store.keys(), ['mistakes']);
  store.remove('mistakes');
  assert.deepEqual(store.get('mistakes', []), []);
  assert.deepEqual(store.keys(), []);
});

test('namespaces do not see each other', () => {
  const storage = createFakeStorage();
  createLocalStore('global', storage).set('theme', 'dark');
  const course = createLocalStore('csc105h5', storage);
  assert.equal(course.get('theme', 'auto'), 'auto');
  assert.deepEqual(course.keys(), []);
});

test('reads return a fresh copy, so callers cannot change stored values by accident', () => {
  const store = createLocalStore('csc105h5', createFakeStorage());
  store.set('sections', { 'lec01/s01': 1 });
  store.get('sections', {})['lec01/s02'] = 2;
  assert.deepEqual(store.get('sections', {}), { 'lec01/s01': 1 });
});

test('a failed write reports false and the new value still wins over the older saved one', () => {
  const storage = createFakeStorage();
  const store = createLocalStore('csc105h5', storage);
  store.set('attempts', { q1: { tries: 1, correct: 0 } });
  storage.failWrites = true;
  assert.equal(store.set('attempts', { q1: { tries: 2, correct: 1 } }), false);
  assert.deepEqual(store.get('attempts', {}), { q1: { tries: 2, correct: 1 } });
  assert.equal(storage.raw.get('topphi-study:csc105h5:attempts'), '{"q1":{"tries":1,"correct":0}}');
  assert.deepEqual(store.keys(), ['attempts']);

  storage.failWrites = false;
  assert.equal(store.set('attempts', { q1: { tries: 3, correct: 2 } }), true);
  assert.equal(storage.raw.get('topphi-study:csc105h5:attempts'), '{"q1":{"tries":3,"correct":2}}');
});

test('a failed first write still lists the key and serves the value', () => {
  const storage = createFakeStorage();
  storage.failWrites = true;
  const store = createLocalStore('csc105h5', storage);
  assert.equal(store.set('flashcards', { agent: { status: 'known' } }), false);
  assert.deepEqual(store.get('flashcards', {}), { agent: { status: 'known' } });
  assert.deepEqual(store.keys(), ['flashcards']);
});

test('after a successful write, localStorage stays the source of truth (other tabs)', () => {
  const storage = createFakeStorage();
  const store = createLocalStore('csc105h5', storage);
  store.set('mistakes', ['a']);
  storage.raw.set('topphi-study:csc105h5:mistakes', '["a","b"]');
  assert.deepEqual(store.get('mistakes', []), ['a', 'b']);
  storage.raw.delete('topphi-study:csc105h5:mistakes');
  assert.deepEqual(store.get('mistakes', []), []);
});

test('blocked storage falls back to memory and never throws', () => {
  const storage = createFakeStorage({ 'topphi-study:csc105h5:sections': '{"lec01/s01":1}' });
  storage.failReads = true;
  const store = createLocalStore('csc105h5', storage);
  assert.deepEqual(store.get('sections', {}), {});
  assert.equal(store.set('sections', { 'lec02/s01': 2 }), false);
  assert.deepEqual(store.get('sections', {}), { 'lec02/s01': 2 });
  assert.deepEqual(store.keys(), ['sections']);
  store.remove('sections');
  assert.deepEqual(store.get('sections', {}), {});
  assert.deepEqual(store.keys(), []);
});

test('broken JSON in storage reads as the fallback', () => {
  const storage = createFakeStorage({ 'topphi-study:csc105h5:attempts': '{broken' });
  const store = createLocalStore('csc105h5', storage);
  assert.deepEqual(store.get('attempts', {}), {});
});

test('values that cannot be serialised are refused', () => {
  const store = createLocalStore('csc105h5', createFakeStorage());
  const loop = {};
  loop.self = loop;
  assert.equal(store.set('loop', loop), false);
  assert.equal(store.get('loop', null), null);
});
