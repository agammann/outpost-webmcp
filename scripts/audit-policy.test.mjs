import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAudit, advisoryId, dependencyPath } from './audit-policy.mjs';
const audit = {
  advisories: {
    1240992: {
      id: 1240992,
      github_advisory_id: advisoryId,
      module_name: 'braces',
      severity: 'high',
      url: 'https://github.com/advisories/' + advisoryId,
      cwe: 'CWE-674',
      title: 'Known advisory',
      vulnerable_versions: '<=3.0.3',
      patched_versions: '>=3.0.4',
      findings: [
        {
          version: '3.0.3',
          dev: false,
          optional: false,
          bundled: false,
          paths: [dependencyPath],
        },
      ],
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 },
    dependencies: 1,
    devDependencies: 1,
    optionalDependencies: 0,
    totalDependencies: 2,
  },
};
const primary = {
  id: advisoryId,
  schema_version: '1.4.0',
  modified: '2026-10-02T22:36:33Z',
  database_specific: { github_reviewed: true, severity: 'HIGH' },
  affected: [
    {
      package: { ecosystem: 'npm', name: 'braces' },
      ranges: [
        {
          type: 'ECOSYSTEM',
          events: [{ introduced: '0' }, { last_affected: '3.0.3' }],
        },
      ],
    },
  ],
};
const registry = {
  name: 'braces',
  'dist-tags': { latest: '3.0.3' },
  versions: { '3.0.3': {} },
};
test('accept only the exact known unpatched finding, retaining its severity', () => {
  assert.equal(
    checkAudit(audit, primary, registry).accepted[0].severity,
    'high',
  );
  assert.equal(checkAudit(audit, primary, registry).accepted[0].dev, false);
  const clean = structuredClone(audit);
  clean.advisories = {};
  clean.metadata.vulnerabilities.high = 0;
  assert.deepEqual(checkAudit(clean, primary, registry).accepted, []);
});
test('clean audit still requires complete primary and registry metadata', () => {
  const clean = structuredClone(audit);
  clean.advisories = {};
  clean.metadata.vulnerabilities.high = 0;
  for (const [p, r] of [
    [null, null],
    [{}, registry],
    [primary, {}],
    [primary, null],
  ])
    assert.throws(() => checkAudit(clean, p, r));
  const patched = structuredClone(primary);
  patched.affected[0].ranges[0].events[1] = { fixed: '3.0.4' };
  const published = {
    name: 'braces',
    'dist-tags': { latest: '3.0.4' },
    versions: { '3.0.4': {} },
  };
  assert.deepEqual(checkAudit(clean, patched, published).accepted, []);
});
test('fail changed findings, paths, versions, counts, missing metadata and available patches', () => {
  const mutations = [
    (a) => {
      a.advisories['1240992'].findings[0].dev = true;
    },
    (a) => {
      a.advisories['1240992'].module_name = 'another-package';
    },
    (a) => {
      a.advisories['1240992'].severity = 'moderate';
      a.metadata.vulnerabilities.high = 0;
      a.metadata.vulnerabilities.moderate = 1;
    },
    (a) => {
      a.advisories['1240992'].github_advisory_id = 'GHSA-other';
    },
    (a) => {
      a.advisories['1240992'].findings[0].version = '3.0.2';
    },
    (a) => {
      a.advisories['1240992'].findings[0].paths.push('.>new>braces');
    },
    (a) => {
      a.advisories['1240992'].patched_versions = '>=3.0.5';
    },
    (a) => {
      a.metadata.vulnerabilities.high = 0;
    },
    (a) => {
      delete a.metadata;
    },
    (a) => {
      a.advisories.other = { severity: 'low' };
      a.metadata.vulnerabilities.low = 1;
    },
    (_a, p) => {
      p.affected[0].ranges[0].events[1] = { fixed: '3.0.4' };
    },
    (_a, _p, r) => {
      r.versions['3.0.4'] = {};
    },
    (_a, p) => {
      delete p.database_specific;
    },
    (_a, _p, r) => {
      delete r.versions;
    },
  ];
  for (const mutate of mutations) {
    const [a, p, r] = [audit, primary, registry].map((value) =>
      structuredClone(value),
    );
    mutate(a, p, r);
    assert.throws(() => checkAudit(a, p, r));
  }
});
