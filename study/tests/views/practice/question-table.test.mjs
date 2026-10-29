import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTION_TABLE_LIMITS, questionTable } from '../../../engine/views/practice/logic/question-table.js';

test('a question without a usable table gives null', () => {
  assert.equal(questionTable({}), null);
  assert.equal(questionTable(null), null);
  assert.equal(questionTable({ table: [] }), null);
  assert.equal(questionTable({ table: 'Yes 30' }), null);
  assert.equal(questionTable({ table: { headers: ['a'], rows: [] } }), null);
  assert.equal(questionTable({ table: { rows: ['not a row'] } }), null);
});

test('a two-way table keeps its headers, numbers and caption', () => {
  const caption = { en: 'GSS 2000', zh: '2000 年 GSS' };
  const table = questionTable({
    table: {
      headers: ['Member', 'Yes', 'No', 'Total'],
      rows: [['Yes', 30, 66, 96], ['No', 88, 933, 1021], ['Total', 118, 999, 1117]],
      caption,
    },
  });
  assert.deepEqual(table.headers, ['Member', 'Yes', 'No', 'Total']);
  assert.deepEqual(table.rows[2], ['Total', '118', '999', '1117']);
  assert.equal(table.caption, caption);
});

test('short rows are padded and odd cells become empty text', () => {
  const table = questionTable({ table: { rows: [['x', 1.5, null, Number.NaN], ['y']] } });
  assert.deepEqual(table.headers, []);
  assert.deepEqual(table.rows, [['x', '1.5', '', ''], ['y', '', '', '']]);
  assert.equal(table.caption, null);
});

test('very large tables are clipped to the card limits', () => {
  const wide = Array.from({ length: QUESTION_TABLE_LIMITS.columns + 5 }, (_, index) => index);
  const rows = Array.from({ length: QUESTION_TABLE_LIMITS.rows + 3 }, () => wide);
  const table = questionTable({ table: { headers: wide, rows } });
  assert.equal(table.rows.length, QUESTION_TABLE_LIMITS.rows);
  assert.equal(table.headers.length, QUESTION_TABLE_LIMITS.columns);
  assert.ok(table.rows.every((row) => row.length === QUESTION_TABLE_LIMITS.columns));
});
