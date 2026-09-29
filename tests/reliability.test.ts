import assert from 'node:assert/strict';
import test from 'node:test';
import { riskSummary } from '../lib/domain.js';
import { createSeedWorkspace } from '../lib/seed-data.js';
import {
  applyCreateSprint,
  applyLock,
  applyRebalanceSprint,
  applyRemoveFromSprint,
  applyReprioritize,
  applyStatus,
} from '../lib/workspace.js';
import {
  emptyWorkspace,
  parseWorkspace,
  saveFinding,
  serializeWorkspace,
  validateWorkspace,
  WorkspaceStore,
} from '../lib/storage.js';
import { createWebMcpTools } from '../lib/webmcp/register-tools.js';
import type { WorkspaceApi } from '../lib/workspace.js';

const input = {
  title: 'Review backup retention',
  component: 'Backups',
  description: 'Retention policy needs review.',
  severity: 'medium',
  exploitability: 'low',
  impact: 'medium',
  confidence: 'high',
  evidence: ['Policy review notes'],
  reasoning: 'Retention is not documented.',
  remediation: 'Document and verify the retention schedule.',
  effortDays: 1,
  tags: ['policy'],
};

void test('own findings survive portable backup round trip and edits', () => {
  let state = saveFinding(emptyWorkspace(), input);
  assert.equal(state.example, false);
  assert.equal(state.findings[0].id, 'F-101');
  state = saveFinding(state, { ...input, effortDays: 2 }, 'F-101');
  assert.deepEqual(parseWorkspace(serializeWorkspace(state)), state);
  assert.equal(state.findings[0].effortDays, 2);
  assert.throws(
    () => saveFinding(state, { ...input, effortDays: 0 }),
    /greater than or equal/,
  );
});
void test('empty score is finite and scheduling does not claim remediation', () => {
  assert.equal(riskSummary([]).progress, 0);
  const before = saveFinding(emptyWorkspace(), input);
  const planned = applyCreateSprint(
    before,
    ['F-101'],
    'Review sprint',
    1,
    'human',
  );
  assert.equal(riskSummary(planned.findings).progress, 0);
  assert.equal(
    riskSummary(planned.findings).exposure,
    riskSummary(before.findings).exposure,
  );
});
void test('remove, replace, rebalance and resolve keep sprint status consistent', () => {
  let state = applyCreateSprint(
    createSeedWorkspace(),
    ['F-103', 'F-105'],
    'Sprint',
    2,
    'human',
  );
  state = applyRemoveFromSprint(state, 'F-103', 'Deferred by analyst', 'human');
  assert.equal(state.findings.find((f) => f.id === 'F-103')?.status, 'open');
  state = applyRebalanceSprint(state, 5, 'risk', 'agent');
  validateWorkspace(state);
  const id = state.sprint!.findingIds[0];
  state = applyStatus(
    state,
    id,
    'resolved',
    'Analyst recorded completion',
    'human',
  );
  assert.ok(!state.sprint!.findingIds.includes(id));
  validateWorkspace(state);
  state = applyCreateSprint(state, ['F-106'], 'Replacement sprint', 2, 'human');
  validateWorkspace(state);
  assert.throws(
    () =>
      applyStatus(
        state,
        'F-103',
        'scheduled',
        'Test invalid membership',
        'human',
      ),
    /Add the finding/,
  );
});
void test('locked scope cannot be removed, omitted, unlocked or overfilled by tools', () => {
  let state = applyCreateSprint(
    createSeedWorkspace(),
    ['F-101'],
    'Sprint',
    5,
    'human',
  );
  state = applyLock(state, 'F-101', true, 'Keep this work', 'human');
  assert.throws(
    () => applyRebalanceSprint(state, 0.5, 'risk', 'agent'),
    /exceeding/,
  );
  assert.throws(
    () => applyRemoveFromSprint(state, 'F-101', 'Remove this work', 'agent'),
    /locked/,
  );
  assert.throws(
    () => applyCreateSprint(state, ['F-106'], 'Replacement', 5, 'agent'),
    /locked/,
  );
  assert.throws(
    () => applyLock(state, 'F-101', false, 'Remove the lock', 'agent'),
    /Only a human/,
  );
});
void test('explicit tool sprint replacement preserves human exclusions', () => {
  let state = applyCreateSprint(
    createSeedWorkspace(),
    ['F-105'],
    'Sprint',
    5,
    'human',
  );
  state = applyRemoveFromSprint(state, 'F-105', 'Deferred by analyst', 'human');
  assert.throws(
    () => applyCreateSprint(state, ['F-105'], 'Replacement', 5, 'agent'),
    /exclusions/,
  );
});
void test('sparse reprioritization preserves unique ranks and rejects duplicates', () => {
  const state = createSeedWorkspace();
  const next = applyReprioritize(
    state,
    ['F-101', 'F-110'],
    ['F-110', 'F-101'],
    'Analyst priority change',
    'human',
  );
  assert.equal(new Set(next.findings.map((f) => f.priorityRank)).size, 18);
  assert.throws(
    () =>
      applyReprioritize(
        state,
        ['F-101', 'F-101'],
        ['F-101', 'F-101'],
        'Duplicate IDs',
        'human',
      ),
    /unique/,
  );
});
void test('malformed backups, duplicate IDs, bad references and overcapacity edits are rejected', () => {
  const state = createSeedWorkspace();
  validateWorkspace(state);
  assert.throws(() => parseWorkspace('{broken'));
  assert.throws(
    () =>
      validateWorkspace({
        ...state,
        findings: [...state.findings, state.findings[0]],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => validateWorkspace({ ...state, comparisonIds: ['F-999', 'F-101'] }),
    /missing finding/,
  );
  const own = applyCreateSprint(
    saveFinding(emptyWorkspace(), input),
    ['F-101'],
    'Plan',
    1,
    'human',
  );
  assert.throws(
    () => saveFinding(own, { ...input, effortDays: 2 }, 'F-101'),
    /exceeds capacity/,
  );
});
void test('failed persistence cannot be acknowledged and stale tabs cannot overwrite', () => {
  let raw: string | null = null;
  let fail = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      if (fail) throw new Error('Quota exceeded');
      raw = value;
    },
  };
  const first = new WorkspaceStore(storage);
  first.load();
  first.save(emptyWorkspace());
  const second = new WorkspaceStore(storage);
  second.load();
  first.save(saveFinding(emptyWorkspace(), input));
  assert.throws(() => second.save(emptyWorkspace()), /Another tab/);
  const saved = raw;
  fail = true;
  assert.throws(() => first.save(emptyWorkspace()), /Quota/);
  assert.equal(raw, saved);
});
void test('legacy stored data is migrated without inventing resolution', () => {
  const { name: _name, example: _example, ...old } = createSeedWorkspace();
  old.findings[0].status = 'scheduled';
  old.findings[1].priorityRank = old.findings[0].priorityRank;
  const migrated = parseWorkspace(JSON.stringify(old));
  assert.equal(migrated.findings[0].status, 'open');
  assert.equal(migrated.example, false);
  validateWorkspace(migrated);
});
void test('tool validation rejects unknown fields, fractional limits and spoofed authors', async () => {
  let called = false;
  const api = {
    listFindings: () => {
      called = true;
      return [];
    },
    addNote: () => {
      called = true;
    },
  } as unknown as WorkspaceApi;
  const tools = createWebMcpTools(api);
  for (const [name, args] of [
    ['list_findings', { limit: 1.2 }],
    ['list_findings', { surprise: true }],
    [
      'add_finding_note',
      { findingId: 'F-101', note: 'A note', authorType: 'human' },
    ],
  ] as const) {
    const out = JSON.parse(
      String(await tools.find((t) => t.name === name)!.execute(args)),
    );
    assert.equal(out.ok, false);
  }
  assert.equal(called, false);
});
