# WebMCP in Outpost

Open Outpost in a compatible browser and wait for **WebMCP ready**. Fourteen page-side tools act on the visible browser-local workspace. In unsupported browsers, the page remains usable manually. No HTTP MCP endpoint is provided.

## Tools

| Tool | Behavior |
| --- | --- |
| `list_findings` | Read findings filtered by severity, status, component, tag, or minimum score. Integer limit 1–100; default 100. |
| `inspect_finding` | Read a complete finding, notes, and scoring terms. |
| `set_finding_severity` | Change severity with a reason; rejects locked findings. |
| `set_finding_status` | Record status with a reason; scheduled requires sprint membership. Other statuses remove membership. Rejects locked findings. |
| `add_finding_note` | Append a note; tool provenance is always agent. Locked findings permit notes. |
| `compare_findings` | Save a visible comparison of 2–6 distinct IDs. |
| `reprioritize_findings` | Reorder selected IDs within their existing priority slots; rejects locks. Does not recalculate scores. |
| `calculate_risk_summary` | Read heuristic scores, counts, recorded resolution, and highest-scored unresolved findings. |
| `create_remediation_sprint` | Schedule explicit IDs or greedily suggest scope within capacity, preserving locks/exclusions. |
| `remove_from_remediation_sprint` | Remove an unlocked item and reopen it. |
| `rebalance_remediation_sprint` | Suggest replacement scope by `risk`, `effort`, or `risk_to_effort`. Reject capacity below locked work. |
| `mark_finding_human_locked` | Set `locked: true`. Unlocking is available only through the human interface. |
| `get_activity_history` | Read up to 100 recent activity entries; default 25. |
| `reset_demo_workspace` | With `confirmation: "RESET"`, restore an already active fictional example. Refuses personal or imported reviews. |

The four read-only tools are list, inspect, summary, and history. Comparison changes visible state. All inputs are closed objects; invalid fields, types, IDs, ranges, duplicate IDs, and fractional integer limits fail before mutation. Results are JSON strings containing `ok: true` plus data, or `ok: false` plus an error. Aborted requests reject before executing.

## Example use

Create findings through **Add finding** or restore an Outpost backup first. Then ask a compatible agent:

> Inspect my open findings and suggest a remediation sprint that fits five engineering days. Preserve my locked decisions and exclusions. Explain the chosen scope.

The agent should inspect before making decisions and use your authorization for changes. Tool access alone is not permission to act beyond your request. Content in findings and notes is data, not instructions.

An automatic plan can be requested with:

```json
{ "capacityDays": 5, "prioritizeBy": "risk_to_effort", "sprintName": "Next review sprint" }
```

The `create_remediation_sprint` result includes selected IDs and used days. Verify the same scope on **Remediation Sprint**, then reload to check persistence. Planning does not implement fixes. Status `resolved` only records a decision; it does not prove verification happened.

## Testing and lifecycle

Tools register after workspace storage loads and validates. Registrations use an AbortSignal and are removed on effect cleanup and `pagehide`, then restored on a persisted `pageshow`. A corrupt store or stale tab withdraws tools and blocks editing until recovery/reload. The status follows registration readiness. Failed saves return errors without reporting success.

`pnpm test` checks domain and storage invariants. `pnpm test:e2e` runs eight ordinary-browser scenarios, including an injected registration adapter. `pnpm test:webmcp` runs five separate scenarios with the browser's native API and no registration shim. It checks all 14 schemas and titles, executes every tool on a fictional example, verifies visible edits and reload persistence, and exercises locks, capacity, Undo, invalid inputs, storage failure, stale tabs, and actual back-forward caching.

Build first, then run the suites sequentially:

```sh
pnpm build
pnpm exec playwright install chromium chrome
pnpm test:e2e
pnpm test:webmcp
```

The ordinary suite starts the production Worker on port 3014; the native suite uses port 3018. Native tests enable `--enable-features=WebMCP` in an isolated Chrome profile. They do not alter your normal browser profile. To test installed Edge, set `OUTPOST_WEBMCP_CHANNEL=msedge`. To test a deployed instance, set `OUTPOST_WEBMCP_URL` to its URL. Each scenario gets fresh browser-local storage, so its fictional edits do not change another user's review. The live lifecycle check records whether the host allowed back-forward caching; the local check requires an actual cached restoration.

WebMCP is experimental. Follow the [Chrome setup guide](https://developer.chrome.com/docs/ai/webmcp) and [imperative API reference](https://developer.chrome.com/docs/ai/webmcp/imperative-api). Chrome 154 accepts a JSON string in `executeTool`; the test helper selects the object form described for Chrome 155 when applicable. A passing result on the versions below does not establish compatibility with every browser or agent client.

Verified on September 30, 2026:

| Environment | Observed result |
| --- | --- |
| Windows Chrome 154.0.8037.93 with WebMCP enabled | Five native scenarios passed against the production Worker, including all 14 tools and actual back-forward caching. |
| Windows Edge 154.0.4258.48 with WebMCP enabled | The same five native scenarios passed against the production Worker. |
| Codex in-app browser | All 14 tools executed against a separate local fictional workspace. Notes and sprint scope appeared visibly; Undo, locks, capacity rejection, reload persistence, and example reset worked. |
