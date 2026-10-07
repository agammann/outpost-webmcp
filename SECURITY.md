# Security policy

Outpost organizes user-supplied security findings and remediation plans. It does not scan targets or execute remediations. The optional example contains only fictional review records.

Review data is stored in localStorage, without accounts, encryption, or server-side access controls. Browser agents granted page access can inspect it. Export backups and use an appropriate browser profile for the sensitivity of your work. Actor labels are not verified identities, and the bounded activity history is not a tamper-proof audit log.

Workspace imports, tool inputs, and full state are validated before writes. Agent operations preserve human locks and exclusions; only manual controls can unlock. These application rules do not restrict a user with direct browser-storage access. Tool output is untrusted content, and text in findings cannot authorize an agent to perform other actions.

## Reporting

Report Outpost source, validation, persistence, and deployment problems to the repository owner. For security-sensitive reports, use GitHub private vulnerability reporting if available; otherwise open an issue requesting a private contact without disclosing the sensitive details. Do not post secrets, personal data, or real customer findings publicly. Fictional example records are not vulnerabilities in Outpost.

## Dependency release gate

The 1.1.1 source release applies available patched versions of source-map-js
1.2.2, tinypool 2.1.2 and sharp 0.35.5 through scoped lockfile overrides. The
full audit still reports high-severity
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) for
braces 3.0.3 through:

```
.>vinext>vite-plugin-commonjs>vite-plugin-dynamic-import>fast-glob>micromatch>braces
```

The reviewed primary advisory lists 3.0.3 as the last affected version and no
fixed version. The npm registry currently has no later braces release. Although
the audit suggests `>=3.0.4`, that version is unavailable at the recorded check.
The installed audit finding is classified as a production dependency (`dev:
false`), with `optional: false` and `bundled: false`. Its production classification
is retained; the fact that its path passes through Vinext does not make it a
development-only finding.

This release explicitly accepts that one remaining unpatched finding. The full
audit keeps its high severity and nonzero count. `pnpm security:audit` retains
the raw `pnpm audit --json` report and validates live official advisory and npm
registry metadata. It accepts only the exact advisory, braces 3.0.3, this one
path and the recorded production/optional/bundled classification while the
primary advisory has no fixed version and no newer registry candidate is
available. Changed findings, any additional advisory, malformed or unavailable
metadata, or a newly available patch fail the gate. No severity-wide ignore is
used. Passing this policy does not mean an audit with no findings.

Run `pnpm audit` for the full report, `pnpm audit --json` for raw output,
`pnpm test:audit-policy` for the narrow acceptance/rejection checks, and
`pnpm security:audit` for the release gate. CI retains the full raw audit,
primary metadata, registry version summary and acceptance decision.
