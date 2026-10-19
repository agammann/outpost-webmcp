import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const require = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function checkAudit(audit) {
  require(audit && audit.advisories && typeof audit.advisories === 'object' &&
    !Array.isArray(audit.advisories), 'Missing audit advisories');
  const counts = audit.metadata?.vulnerabilities;
  require(counts && JSON.stringify(Object.keys(counts).sort()) ===
    JSON.stringify([...levels].sort()) && levels.every(level =>
      Number.isInteger(counts[level]) && counts[level] >= 0), 'Malformed vulnerability counts');
  require(['dependencies', 'devDependencies', 'optionalDependencies', 'totalDependencies']
    .every(key => Number.isInteger(audit.metadata[key]) && audit.metadata[key] >= 0) &&
    audit.metadata.totalDependencies > 0, 'Malformed dependency counts');
  require(Object.keys(audit.advisories).length === 0 && levels.every(level => counts[level] === 0),
    'Dependency advisories are not accepted');
  return { accepted: [], vulnerabilities: counts };
}

function main() {
  require(process.argv.length === 2, 'Unexpected audit arguments');
  const directory = resolve('reports');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'dependency-audit-policy.json'), '{"status":"pending"}\n');
  const result = spawnSync('pnpm audit --json', {
    shell: true, encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  writeFileSync(resolve(directory, 'dependency-audit.raw.json'), result.stdout || '');
  writeFileSync(resolve(directory, 'dependency-audit.stderr.txt'), result.stderr || '');
  require(!result.error && result.status === 0, 'Dependency audit failed');
  const report = { policy: 'zero-advisories', ...checkAudit(JSON.parse(result.stdout)), auditExit: result.status };
  writeFileSync(resolve(directory, 'dependency-audit-policy.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
