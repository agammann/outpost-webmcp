# Outpost v1 support, upgrades and recovery

Source release 1.1.5 preserves the ordinary browser workspace: record and edit
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
4,000,000 UTF-8 bytes per imported or exported backup and 0.5-60 engineering days of capacity. Browser quotas may be
lower than those application limits.
Existing browser workspaces retain the historical character limit when loaded.
If an older Unicode workspace exceeds the backup byte limit, shorten notes or
evidence before exporting; failed exports leave the workspace in place.

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

Upgrading source through 1.1.5 requires Node.js 24+, pnpm 11.19.0 and the
frozen lockfile. No runtime or backup-schema migration is introduced. Keeping
the same origin retains the workspace; another origin starts separately and
export/import is the supported transfer. Source distributions include the MIT
license. Removing source files does not clear browser data. To retire a hosted
copy, preserve backups before using the hosting service's normal removal controls.

Source distributions include the MIT license and frozen lockfile. Hosted delivery has a separate acceptance check.

## Document delivery acceptance

Source 1.1.5 renders the entry document without framework ISR and sets
`Cache-Control: private, no-cache, max-age=0, must-revalidate` for `/`, including
its RSC query variant. Shared caches cannot retain it; a browser may store the
generic document but must revalidate it. Review data remains in localStorage.
Static asset policies are unchanged. This increases Worker document renders.

After publishing, check repeated GET and HEAD responses for the private policy
without `s-maxage`, and verify the referenced client files return the new build's
bytes. Reload an existing browser workspace and check tool registration and
persistence; preserve a backup and do not clear browser data to work around a
delivery problem. Run the real native lifecycle suite as well as ordinary tests.

A prior deployment briefly stalled while referencing retired scripts, then
recovered on reload. The cause is unproven. These controls reduce future document
retention risk; they cannot purge already-cached HTML or guarantee atomic hosting
rollouts. Keep the earlier source release and report an observed mismatch with
the failed document's asset URLs.
