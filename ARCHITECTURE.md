# Architecture

React renders the same browser-local workspace read by WebMCP. `lib/workspace.ts` contains immutable triage and sprint rules; `lib/storage.ts` validates full state, creates and edits findings, migrates older local state, and handles persistence. `components/outpost-app.tsx` coordinates undo, errors, and UI state. `components/workspace-controls.tsx` provides input and portable backups.

## Commit order

Compute the proposed state, validate its fields and relationships, check that the saved value has not changed, write localStorage, then update the undo stack and React. A failed write never returns a successful mutation. Tools use the same API and flush the visible update before returning. Selection and temporary highlighting are UI state and are not independently saved on every click.

`outpost-workspace-v1` stores a JSON envelope with `format: "outpost-workspace"`, `version: 1`, and `workspace`. Legacy unwrapped state is validated and migrated: ranks become unique, sprint membership controls scheduled status, and resolved/accepted items are removed from the plan. Invalid or over-capacity legacy state is preserved for recovery instead of silently reset. Imported reviews always disable example reset.

Backups are bounded, strict, full-workspace JSON exports. Unknown versions, duplicate IDs/ranks, dangling references, inconsistent scheduled status, and over-capacity plans are rejected. No generic scanner-output import is implied.

## Planning invariants

Scheduled status corresponds exactly to active sprint membership. Removing or replacing scope reopens unscheduled findings. Changing to another status removes the item from the sprint. Resolved findings cannot be scheduled; automatic selection also excludes accepted findings. Explicit human selection may reschedule accepted work.

Greedy planning preserves locked inclusions/exclusions and prior human removals. If locked work exceeds capacity, planning fails. Agent removal and explicit replacement enforce those same rules. Only the human interface can unlock a finding. Partial reprioritization reuses the selected ranks without colliding with unselected findings.

## Boundaries

Local storage is not encrypted, authenticated, synchronized across users, or a compliance record. Actor labels indicate a UI/tool path. Same-origin scripts and browser tools can access local data. A storage event blocks stale editing; a pre-write comparison also catches many stale writes, but there is no atomic cross-tab transaction. Work in one tab and export backups.

Tools register after validated storage initialization, prefer `document.modelContext`, and retain `navigator.modelContext` as a compatibility fallback. Registration is aborted on cleanup or failure. A small interpreter validates the declared JSON Schema vocabulary without runtime code generation; domain validation and full-state validation run before persistence. Every result is marked as untrusted content.

The app stores no review data on its hosting server. Agents granted page access may read it through WebMCP; their processing is controlled by the browser/agent service. The optional example is entirely fictional. Scores and recorded resolution have the precise semantics described in the README, with no automatic scanning or fix verification.
