import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRunPath } from '../src/output-path.js';

describe('buildRunPath', () => {
  test('deriva dateSlug y runSlug del mismo Date', () => {
    const date = new Date(2026, 5, 30, 14, 32, 10); // 30/06/2026 14:32:10 local
    assert.deepEqual(buildRunPath(date), { dateSlug: '2026-06-30', runSlug: '14-32-10' });
  });

  test('rellena con cero los valores de un solo dígito', () => {
    const date = new Date(2026, 0, 5, 1, 2, 3); // 05/01/2026 01:02:03 local
    assert.deepEqual(buildRunPath(date), { dateSlug: '2026-01-05', runSlug: '01-02-03' });
  });

  test('dos Date distintos del mismo segundo producen el mismo runSlug', () => {
    const a = new Date(2026, 5, 30, 14, 32, 10, 0);
    const b = new Date(2026, 5, 30, 14, 32, 10, 999);
    assert.deepEqual(buildRunPath(a), buildRunPath(b));
  });
});
