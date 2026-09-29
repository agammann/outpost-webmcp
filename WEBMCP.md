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

Tools register after workspace storage loads and validates. Registrations use an AbortSignal and are removed on cleanup. A corrupt store or stale tab blocks editing until recovery/reload. Failed saves return errors without reporting success. Test this behavior with `pnpm test` and `pnpm test:e2e`; browser tests use an injected registration adapter and are distinct from native discovery checks.
