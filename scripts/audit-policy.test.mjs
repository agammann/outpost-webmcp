import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAudit } from './audit-policy.mjs';

const clean = {
  advisories: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    dependencies: 1, devDependencies: 1, optionalDependencies: 0, totalDependencies: 2,
  },
};

test('accept a complete audit with no advisories', () => {
  assert.deepEqual(checkAudit(clean).accepted, []);
});

test('reject every advisory, including the previously excepted braces finding', () => {
  const audit = structuredClone(clean);
  audit.advisories['1240992'] = {
    module_name: 'braces', github_advisory_id: 'GHSA-vfj7-8cjw-p6xm', severity: 'high',
  };
  audit.metadata.vulnerabilities.high = 1;
  assert.throws(() => checkAudit(audit), /not accepted/);
  audit.metadata.vulnerabilities.high = 0;
  assert.throws(() => checkAudit(audit), /not accepted/);
});

test('reject missing, inconsistent and malformed audit metadata', () => {
  const malformed = [null, {}, { advisories: [] }, { advisories: {}, metadata: {} }];
  for (const value of malformed) assert.throws(() => checkAudit(value));
  for (const mutate of [
    a => { delete a.metadata.vulnerabilities.high; },
    a => { a.metadata.vulnerabilities.high = 1; },
    a => { a.metadata.vulnerabilities.high = '0'; },
    a => { a.metadata.vulnerabilities.extra = 0; },
    a => { a.metadata.totalDependencies = 0; },
  ]) {
    const audit = structuredClone(clean);
    mutate(audit);
    assert.throws(() => checkAudit(audit));
  }
});
