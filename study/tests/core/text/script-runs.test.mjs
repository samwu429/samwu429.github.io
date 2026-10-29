import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptMix, scriptOf, scriptRuns } from '../../../engine/core/text/script-runs.js';

const runs = (text) => scriptRuns(text).map((run) => [run.script, run.text]);

test('scriptOf tells Chinese, Latin and neutral characters apart', () => {
  assert.equal(scriptOf('精'), 'zh');
  assert.equal(scriptOf('Ｆ'), 'zh');
  assert.equal(scriptOf('F'), 'en');
  assert.equal(scriptOf('é'), 'en');
  for (const char of ['3', ' ', '，', '（', '：', '-', '→', 'Σ', '\n']) assert.equal(scriptOf(char), null, char);
});

test('scriptMix reports which scripts a text uses', () => {
  assert.equal(scriptMix('环境影响'), 'zh');
  assert.equal(scriptMix('Environmental impact'), 'en');
  assert.equal(scriptMix('有些工作可能被 AI 取代。'), 'mixed');
  assert.equal(scriptMix('3-5'), null);
  assert.equal(scriptMix('—'), null);
  assert.equal(scriptMix(''), null);
  assert.equal(scriptMix(undefined), null);
});

test('scriptRuns splits mixed text and keeps every character', () => {
  const samples = [
    '有些工作可能被 AI 取代。',
    'Task openness?\n任务开放度',
    '标题页：Lab #1: Selecting a Method',
    'Review: Types of AI（复习：AI 的类型）',
    '**Precision** = TP / (TP + FP)，表示预测为正的里面有多少是真的',
  ];
  for (const text of samples) assert.equal(scriptRuns(text).map((run) => run.text).join(''), text);
  assert.deepEqual(runs('有些工作可能被 AI 取代。'), [['zh', '有些工作可能被 '], ['en', 'AI '], ['zh', '取代。']]);
  assert.deepEqual(runs('Task openness?\n任务开放度'), [['en', 'Task openness?\n'], ['zh', '任务开放度']]);
});

test('opening brackets and quotes move to the run they open', () => {
  assert.deepEqual(runs('精确率 (Precision)'), [['zh', '精确率 '], ['en', '(Precision)']]);
  assert.deepEqual(runs('状态树（state tree）'), [['zh', '状态树'], ['en', '（state tree）']]);
  assert.deepEqual(runs('Precision “精确率”'), [['en', 'Precision '], ['zh', '“精确率”']]);
});

test('single-script and letterless texts stay in one run', () => {
  assert.deepEqual(runs('环境影响'), [['zh', '环境影响']]);
  assert.deepEqual(runs('2. Environmental impact'), [['en', '2. Environmental impact']]);
  assert.deepEqual(runs('48-50'), [[null, '48-50']]);
  assert.deepEqual(scriptRuns(''), []);
  assert.deepEqual(scriptRuns(null), []);
});
