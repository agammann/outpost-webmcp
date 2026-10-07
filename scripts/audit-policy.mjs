import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const advisoryId = 'GHSA-vfj7-8cjw-p6xm';
export const dependencyPath =
  '.>vinext>vite-plugin-commonjs>vite-plugin-dynamic-import>fast-glob>micromatch>braces';
export const primaryUrl =
  'https://raw.githubusercontent.com/github/advisory-database/main/advisories/github-reviewed/2026/09/GHSA-vfj7-8cjw-p6xm/GHSA-vfj7-8cjw-p6xm.json';
const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const require = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function checkAudit(audit, primary, registry) {
  require(audit &&
    typeof audit.advisories === 'object' &&
    !Array.isArray(audit.advisories) &&
    audit.advisories !== null, 'Missing audit advisories');
  const counts = audit.metadata?.vulnerabilities;
  require(counts &&
    JSON.stringify(Object.keys(counts).sort()) ===
      JSON.stringify(
        [...levels].sort(),
      ), 'Unexpected vulnerability count metadata');
  require(counts &&
    levels.every(
      (level) => Number.isInteger(counts[level]) && counts[level] >= 0,
    ), 'Missing/malformed vulnerability counts');
  require([
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'totalDependencies',
  ].every(
    (key) => Number.isInteger(audit.metadata[key]) && audit.metadata[key] >= 0,
  ) &&
    audit.metadata.totalDependencies >
      0, 'Missing/malformed dependency counts');
  const advisories = Object.values(audit.advisories);
  const observed = Object.fromEntries(levels.map((level) => [level, 0]));
  for (const entry of advisories) {
    require(levels.includes(entry.severity), 'Unknown advisory severity');
    observed[entry.severity]++;
  }
  require(levels.every(
    (level) => observed[level] === counts[level],
  ), 'Audit counts disagree with advisories');
  require(primary?.id === advisoryId &&
    primary.schema_version === '1.4.0' &&
    typeof primary.modified === 'string' &&
    Number.isFinite(Date.parse(primary.modified)) &&
    primary.database_specific?.github_reviewed === true &&
    typeof primary.database_specific.severity === 'string' &&
    primary.database_specific.severity.length > 0 &&
    Array.isArray(primary.affected) &&
    primary.affected.length ===
      1, 'Missing/malformed primary advisory metadata');
  const primaryPackage = primary.affected[0];
  require(primaryPackage.package?.ecosystem === 'npm' &&
    primaryPackage.package.name === 'braces' &&
    Array.isArray(primaryPackage.ranges) &&
    primaryPackage.ranges.length > 0 &&
    primaryPackage.ranges.every(
      (range) =>
        range.type === 'ECOSYSTEM' &&
        Array.isArray(range.events) &&
        range.events.length > 0 &&
        range.events.every(
          (event) =>
            event &&
            Object.keys(event).length === 1 &&
            Object.entries(event).every(
              ([key, value]) =>
                ['introduced', 'fixed', 'last_affected', 'limit'].includes(
                  key,
                ) &&
                typeof value === 'string' &&
                value.length > 0,
            ),
        ),
    ), 'Missing/malformed primary affected-range metadata');
  require(registry?.name === 'braces' &&
    typeof registry['dist-tags']?.latest === 'string' &&
    registry['dist-tags'].latest.length > 0 &&
    registry.versions &&
    typeof registry.versions === 'object' &&
    !Array.isArray(registry.versions) &&
    Object.hasOwn(registry.versions, registry['dist-tags'].latest) &&
    Object.keys(registry.versions).every((version) =>
      /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(version),
    ), 'Missing/malformed registry metadata');
  if (advisories.length === 0) return { accepted: [], vulnerabilities: counts };
  require(advisories.length === 1, 'New or additional dependency advisory');
  const entry = advisories[0];
  require(entry.id === 1240992 &&
    Object.keys(audit.advisories)[0] === '1240992' &&
    entry.github_advisory_id === advisoryId &&
    entry.module_name === 'braces' &&
    entry.severity === 'high' &&
    entry.url === 'https://github.com/advisories/' + advisoryId &&
    entry.cwe === 'CWE-674' &&
    typeof entry.title === 'string' &&
    entry.title.length > 0 &&
    entry.vulnerable_versions === '<=3.0.3' &&
    entry.patched_versions ===
      '>=3.0.4', 'Advisory differs from the explicitly accepted finding');
  require(Array.isArray(entry.findings) &&
    entry.findings.length === 1, 'Unexpected finding set');
  const finding = entry.findings[0];
  require(finding.version === '3.0.3' &&
    finding.dev === false &&
    finding.optional === false &&
    finding.bundled === false &&
    Array.isArray(finding.paths) &&
    finding.paths.length === 1 &&
    finding.paths[0] ===
      dependencyPath, 'Installed version or dependency path changed');
  require(primary?.id === advisoryId &&
    primary.schema_version === '1.4.0' &&
    !primary.withdrawn &&
    typeof primary.modified === 'string' &&
    Number.isFinite(Date.parse(primary.modified)) &&
    primary.database_specific?.github_reviewed === true &&
    primary.database_specific?.severity ===
      'HIGH', 'Missing/malformed primary advisory metadata');
  require(Array.isArray(primary.affected) &&
    primary.affected.length === 1, 'Primary affected package set changed');
  const affected = primary.affected[0];
  require(affected.package?.ecosystem === 'npm' &&
    affected.package.name === 'braces' &&
    Array.isArray(affected.ranges) &&
    affected.ranges.length === 1 &&
    affected.ranges[0].type === 'ECOSYSTEM' &&
    JSON.stringify(affected.ranges[0].events) ===
      JSON.stringify([
        { introduced: '0' },
        { last_affected: '3.0.3' },
      ]), 'Primary advisory now identifies a patch or different affected range');
  require(registry?.name === 'braces' &&
    registry['dist-tags']?.latest === '3.0.3' &&
    registry.versions &&
    typeof registry.versions === 'object' &&
    !Array.isArray(registry.versions) &&
    Object.hasOwn(
      registry.versions,
      '3.0.3',
    ), 'Missing/malformed registry metadata');
  for (const version of Object.keys(registry.versions)) {
    const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    require(parts, 'Registry version metadata changed');
    require(Number(parts[1]) < 3 ||
      (Number(parts[1]) === 3 &&
        Number(parts[2]) === 0 &&
        Number(parts[3]) <=
          3), 'A possible patched braces release is now available');
  }
  return {
    accepted: [
      {
        advisory: advisoryId,
        package: 'braces',
        installed: '3.0.3',
        severity: 'high',
        dev: finding.dev,
        path: dependencyPath,
        primaryUnpatched: true,
        registryLatest: '3.0.3',
        auditSuggestedPatchedRange: entry.patched_versions,
      },
    ],
    vulnerabilities: counts,
  };
}

async function jsonFrom(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  require(response.ok, `Metadata request failed (${response.status})`);
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  require(args.length === 0 ||
    (args.length === 2 &&
      args[0] === '--advisory-file'), 'Unexpected audit arguments');
  const directory = resolve('reports');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'dependency-audit-policy.json'),
    JSON.stringify({ status: 'pending' }) + '\n',
  );
  const result = spawnSync('pnpm audit --json', {
    shell: true,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  writeFileSync(
    resolve(directory, 'dependency-audit.raw.json'),
    result.stdout || '',
    'utf8',
  );
  writeFileSync(
    resolve(directory, 'dependency-audit.stderr.txt'),
    result.stderr || '',
    'utf8',
  );
  require(!result.error &&
    [0, 1].includes(result.status), 'Audit command did not complete normally');
  const audit = JSON.parse(result.stdout);
  const primary = args.length
    ? JSON.parse(readFileSync(args[1], 'utf8'))
    : await jsonFrom(primaryUrl);
  const registry = await jsonFrom('https://registry.npmjs.org/braces');
  writeFileSync(
    resolve(directory, 'dependency-advisory.primary.json'),
    JSON.stringify(primary, null, 2) + '\n',
  );
  writeFileSync(
    resolve(directory, 'dependency-registry.braces.json'),
    JSON.stringify(
      {
        name: registry.name,
        'dist-tags': registry['dist-tags'],
        versions: Object.fromEntries(
          Object.keys(registry.versions || {}).map((version) => [version, {}]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  const policy = checkAudit(audit, primary, registry);
  require((result.status === 0) ===
    (policy.accepted.length === 0), 'Audit exit disagrees with findings');
  const report = {
    policy: 'exact-unpatched-braces-exception',
    ...policy,
    primarySource: args.length
      ? 'fresh supplied primary advisory file'
      : primaryUrl,
    auditExit: result.status,
  };
  writeFileSync(
    resolve(directory, 'dependency-audit-policy.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
