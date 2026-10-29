import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from '../../../engine/core/dom/element.js';

test('isSafeUrl accepts hashes, same-site paths, http(s) and mailto', () => {
  for (const url of ['#/learn/lec03', '#main', './x.css', '../study/', '/csc105h5/', '/', 'courses/csc105h5/course.json', 'https://topphi.com/', 'http://example.com', 'mailto:someone@example.com']) {
    assert.equal(isSafeUrl(url), true, url);
  }
});

test('isSafeUrl rejects script URLs and protocol-relative hosts', () => {
  for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', '', ' javascript:x', 'vbscript:x']) {
    assert.equal(isSafeUrl(url), false, url);
  }
});
