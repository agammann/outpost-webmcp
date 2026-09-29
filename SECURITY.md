# Security policy

Outpost organizes user-supplied security findings and remediation plans. It does not scan targets or execute remediations. The optional example contains only fictional review records.

Review data is stored in localStorage, without accounts, encryption, or server-side access controls. Browser agents granted page access can inspect it. Export backups and use an appropriate browser profile for the sensitivity of your work. Actor labels are not verified identities, and the bounded activity history is not a tamper-proof audit log.

Workspace imports, tool inputs, and full state are validated before writes. Agent operations preserve human locks and exclusions; only manual controls can unlock. These application rules do not restrict a user with direct browser-storage access. Tool output is untrusted content, and text in findings cannot authorize an agent to perform other actions.

## Reporting

Report Outpost source, validation, persistence, and deployment problems to the repository owner. For security-sensitive reports, use GitHub private vulnerability reporting if available; otherwise open an issue requesting a private contact without disclosing the sensitive details. Do not post secrets, personal data, or real customer findings publicly. Fictional example records are not vulnerabilities in Outpost.
