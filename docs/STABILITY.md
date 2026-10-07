# Outpost v1 support, upgrades and recovery

Source release 1.1.1 preserves the ordinary browser workspace: record and edit
supplied findings, review severity/status/notes, adjust relative priorities,
create and edit a capacity-bounded sprint, reload, and export/import version 1
JSON backups. The optional example contains 18 fictional findings. Planning is
a greedy heuristic and recorded resolution is a human decision; Outpost does
not scan systems, reproduce vulnerabilities, implement fixes or verify them.

Data remains in same-origin localStorage under `outpost-workspace-v1`. There are
no accounts, shared server reviews, cloud synchronization or built-in encryption.
Use one editing tab at a time. An observed change from another tab blocks stale
editing until reload. Failed saves and rejected backups preserve previous saved
content. Limits are 100 findings, 200 notes and 30 evidence references per finding,
4 MB per backup and 0.5–60 engineering days of capacity. Browser quotas may be
lower than those application limits.

Within v1, version 1 exported backups remain readable, and the documented 14
WebMCP tool names and validated arguments remain supported. Ordinary controls
work without WebMCP. Experimental native integration is measured separately:
Chrome 155 uses object arguments; dated Chrome/Edge 154 checks used serialized
arguments. The browser must expose the real API and the agent must support page
tool discovery. These checks do not establish every browser or client.

Export before clearing browser data, changing origin/profile or removing a
deployment. **Import backup** accepts a complete Outpost JSON backup, validates
its fields/references/capacity, and confirms before replacing a nonempty review.
It is not a generic scanner-output importer. Imported work is a personal review
and cannot be reset through the example-reset tool. Undo retains the last 20
saved changes until reload; it is not a substitute for an exported backup.

If storage cannot be read, download the offered raw data before choosing the
explicit empty-workspace recovery. Keep invalid backups and existing saved work;
correct the backup structure/references before trying again. For stale-tab errors,
reload and review current work before editing. For quota errors, preserve an
export before reducing records or using another profile. There is no recovery
if browser data and backups are both lost.

Upgrading source from 1.1.0 to 1.1.1 requires Node.js 24+, pnpm 11.19.0 and the
frozen lockfile. No runtime or backup-schema migration is introduced. Keeping
the same origin retains the workspace; another origin starts separately and
export/import is the supported transfer. Source distributions include the MIT
license. Removing source files does not clear browser data. To retire a hosted
copy, preserve backups before using the hosting service's normal removal controls.

The release retains one explicitly accepted unpatched high-severity braces
finding, classified as a production dependency by the full audit. Available
patched updates are applied; see [the exact dependency release
gate](../SECURITY.md#dependency-release-gate). A passing policy accepts that one
recorded residual finding and does not mean an audit with no findings. Source
packaging and local acceptance do not certify a separate hosted deployment.
