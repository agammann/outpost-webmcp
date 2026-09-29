import assert from 'node:assert/strict';
import test from 'node:test';

import { priorityFormula, priorityScore, riskSummary } from '../lib/domain.js';
import { createSeedWorkspace } from '../lib/seed-data.js';
import {
  applyCreateSprint,
  applyLock,
  applyOptimizeSprint,
  applyRebalanceSprint,
  applyRemoveFromSprint,
  applySeverity,
  applyStatus,
  filterFindings,
} from '../lib/workspace.js';

void test('seed workspace contains 18 diverse, fictional defensive findings', () => {
  const state = createSeedWorkspace();
  assert.equal(state.findings.length, 18);
  assert.deepEqual(
    new Set(state.findings.map((finding) => finding.severity)),
    new Set(['critical', 'high', 'medium', 'low']),
  );
  assert.ok(
    state.findings.every((finding) =>
      finding.description.includes('fictional defensive review'),
    ),
  );
  assert.ok(
    new Set(state.findings.flatMap((finding) => finding.tags)).size >= 10,
  );
});

void test('priority score is transparent and bounded', () => {
  const finding = createSeedWorkspace().findings.find(
    (item) => item.id === 'F-101',
  )!;
  assert.deepEqual(priorityFormula(finding), {
    severityPoints: 50,
    exploitabilityPoints: 24,
    impactPoints: 24,
    confidenceMultiplier: 1,
    score: 98,
  });
  assert.equal(priorityScore(finding), 98);
  assert.ok(riskSummary(createSeedWorkspace().findings).exposure >= 0);
  assert.ok(riskSummary(createSeedWorkspace().findings).exposure <= 100);
});

void test('agent changes cannot override a human lock', () => {
  const state = applyLock(
    createSeedWorkspace(),
    'F-101',
    true,
    'Analyst confirmed the authorization boundary.',
    'human',
  );
  assert.throws(
    () =>
      applySeverity(
        state,
        'F-101',
        'low',
        'Automatic downgrade after contextual scan.',
        'agent',
      ),
    /human locked/i,
  );
  const humanOverride = applySeverity(
    state,
    'F-101',
    'high',
    'Analyst accepted the adjusted business impact.',
    'human',
  );
  assert.equal(
    humanOverride.findings.find((finding) => finding.id === 'F-101')?.severity,
    'high',
  );
});

void test('mutations are immutable and add auditable provenance', () => {
  const before = createSeedWorkspace();
  const after = applyStatus(
    before,
    'F-105',
    'investigating',
    'Agent started a rate-limit configuration review.',
    'agent',
  );
  assert.equal(
    before.findings.find((finding) => finding.id === 'F-105')?.status,
    'open',
  );
  assert.equal(
    after.findings.find((finding) => finding.id === 'F-105')?.status,
    'investigating',
  );
  assert.equal(after.activity[0].actor, 'agent');
  assert.match(after.activity[0].detail, /F-105/);
});

void test('sprint creation rejects over-capacity selections', () => {
  const state = createSeedWorkspace();
  assert.throws(
    () =>
      applyCreateSprint(
        state,
        ['F-101', 'F-115'],
        'Impossible sprint',
        2,
        'agent',
      ),
    /exceeding the 2-day capacity/i,
  );
});

void test('agent sprint creation preserves accepted, resolved, and human-locked decisions', () => {
  const state = createSeedWorkspace();
  assert.throws(
    () => applyCreateSprint(state, ['F-104'], 'Locked sprint', 5, 'agent'),
    /human locked/i,
  );
  assert.throws(
    () =>
      applyCreateSprint(state, ['F-108'], 'Accepted-risk sprint', 5, 'agent'),
    /accepted risk/i,
  );
  assert.throws(
    () => applyCreateSprint(state, ['F-117'], 'Resolved sprint', 5, 'agent'),
    /already resolved/i,
  );
});

void test('optimized sprint completes a five-day highest-risk plan in one operation', () => {
  const optimized = applyOptimizeSprint(
    createSeedWorkspace(),
    'Highest-risk sprint',
    5,
    'risk',
    'agent',
  );
  assert.ok(optimized.sprint);
  assert.deepEqual(optimized.sprint.findingIds, [
    'F-101',
    'F-114',
    'F-109',
    'F-105',
  ]);
  assert.equal(
    optimized.sprint.findingIds.reduce(
      (sum, id) =>
        sum +
        optimized.findings.find((finding) => finding.id === id)!.effortDays,
      0,
    ),
    5,
  );
  assert.ok(!optimized.sprint.findingIds.includes('F-104'));
  assert.ok(!optimized.sprint.findingIds.includes('F-108'));
  assert.ok(!optimized.sprint.findingIds.includes('F-117'));
  assert.equal(optimized.activity[0].actor, 'agent');
  assert.match(optimized.activity[0].detail, /5\/5 days/);
});

void test('human removals remain excluded when an agent rebalances', () => {
  let state = applyCreateSprint(
    createSeedWorkspace(),
    ['F-103', 'F-105', 'F-106'],
    'Focused sprint',
    3,
    'agent',
  );
  state = applyRemoveFromSprint(
    state,
    'F-105',
    'Analyst deferred rate limiting until gateway ownership is clear.',
    'human',
  );
  state = applyRebalanceSprint(state, 5, 'risk_to_effort', 'agent');
  assert.ok(state.sprint);
  assert.ok(state.sprint.humanExcludedIds.includes('F-105'));
  assert.ok(!state.sprint.findingIds.includes('F-105'));
});

void test('finding filters compose severity, status, priority, and limit', () => {
  const results = filterFindings(createSeedWorkspace().findings, {
    severity: 'high',
    minimumPriority: 70,
    limit: 2,
  });
  assert.equal(results.length, 2);
  assert.ok(
    results.every(
      (finding) => finding.severity === 'high' && priorityScore(finding) >= 70,
    ),
  );
});
