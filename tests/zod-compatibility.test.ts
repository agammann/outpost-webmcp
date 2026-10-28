import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findingInput,
  parseWorkspace,
  serializeWorkspace,
} from '../lib/storage.js';
import { createSeedWorkspace } from '../lib/seed-data.js';

const input = {
  title: '  Retention review  ',
  description: 'Review backup retention.',
  component: 'Backups',
  severity: 'medium',
  exploitability: 'low',
  impact: 'medium',
  confidence: 'high',
  evidence: ['Policy notes'],
  reasoning: 'Retention requires a review.',
  remediation: 'Document retention.',
  effortDays: 0.5,
  tags: ['policy'],
};

void test('Zod update preserves finding normalization, limits and backup round trips', () => {
  const parsed = findingInput.parse(input);
  assert.equal(parsed.title, 'Retention review');
  assert.equal(parsed.effortDays, 0.5);
  assert.equal(
    findingInput.safeParse({ ...input, tags: Array(20).fill('policy') })
      .success,
    true,
  );
  for (const invalid of [
    { ...input, unknown: true },
    { ...input, severity: 'unexpected' },
    { ...input, effortDays: Infinity },
    { ...input, tags: Array(21).fill('policy') },
  ])
    assert.equal(findingInput.safeParse(invalid).success, false);
  const workspace = createSeedWorkspace();
  assert.deepEqual(
    parseWorkspace(serializeWorkspace(workspace)),
    JSON.parse(JSON.stringify(workspace)),
  );
});

void test('oversized finding collections are rejected before per-element issue allocation', () => {
  for (const values of [
    Array(10_000).fill(null),
    Array(10_000).fill({ unexpected: true }),
  ]) {
    const result = findingInput.safeParse({ ...input, tags: values });
    assert.equal(result.success, false);
    if (result.success) return;
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, 'too_big');
    assert.deepEqual(result.error.issues[0].path, ['tags']);
  }
});
