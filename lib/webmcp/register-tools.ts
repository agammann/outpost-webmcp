'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SEVERITIES,
  STATUSES,
  priorityFormula,
  priorityScore,
  type Finding,
} from '../domain.js';
import {
  assertEnum,
  assertNumber,
  assertStringArray,
  assertText,
  type RebalanceMode,
  type WorkspaceApi,
} from '../workspace.js';

export const WEBMCP_TOOL_NAMES = [
  'list_findings',
  'inspect_finding',
  'set_finding_severity',
  'set_finding_status',
  'add_finding_note',
  'compare_findings',
  'reprioritize_findings',
  'calculate_risk_summary',
  'create_remediation_sprint',
  'remove_from_remediation_sprint',
  'rebalance_remediation_sprint',
  'mark_finding_human_locked',
  'get_activity_history',
  'reset_demo_workspace',
] as const;

export type WebMcpStatus = 'checking' | 'ready' | 'unavailable' | 'error';

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const findingId = {
  type: 'string',
  pattern: '^F-[0-9]{3,6}$',
  description: 'Outpost finding identifier, for example F-104.',
};
const reason = {
  type: 'string',
  minLength: 4,
  maxLength: 500,
  description: 'Auditable reason for the requested decision.',
};

function slimFinding(finding: Finding) {
  return {
    id: finding.id,
    title: finding.title,
    component: finding.component,
    severity: finding.severity,
    exploitability: finding.exploitability,
    impact: finding.impact,
    confidence: finding.confidence,
    status: finding.status,
    effortDays: finding.effortDays,
    priorityScore: priorityScore(finding),
    priorityRank: finding.priorityRank,
    humanLocked: finding.humanLocked,
    tags: finding.tags,
  };
}

function result(value: unknown) {
  return JSON.stringify(value);
}

function wrap(execute: WebMcpTool['execute']): WebMcpTool['execute'] {
  return async (input, options) => {
    options?.signal?.throwIfAborted();
    try {
      return await execute(input, options);
    } catch (error) {
      return result({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Outpost could not complete the tool call.',
      });
    }
  };
}

// Interpret the small JSON Schema vocabulary used below without runtime code
// generation, so registration also works under Worker and strict browser CSPs.
function validateInput(
  value: unknown,
  schema: Record<string, unknown>,
  path = 'input',
): void {
  const fail = (message: string): never => {
    throw new Error(`${path} ${message}`);
  };
  if (schema.const !== undefined && value !== schema.const)
    fail(`must equal ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    fail('must match an allowed value');
  switch (schema.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value))
        fail('must be an object');
      const record = value as Record<string, unknown>;
      const properties = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      for (const key of (schema.required ?? []) as string[])
        if (!Object.hasOwn(record, key)) fail(`requires ${key}`);
      for (const [key, child] of Object.entries(record)) {
        if (!Object.hasOwn(properties, key)) fail(`does not allow ${key}`);
        validateInput(child, properties[key], `${path}.${key}`);
      }
      break;
    }
    case 'array': {
      if (!Array.isArray(value)) fail('must be an array');
      const items = value as unknown[];
      if (
        items.length < Number(schema.minItems ?? 0) ||
        items.length > Number(schema.maxItems ?? Infinity)
      )
        fail('has an invalid item count');
      if (schema.uniqueItems && new Set(items).size !== items.length)
        fail('must contain unique values');
      items.forEach((item, i) =>
        validateInput(
          item,
          schema.items as Record<string, unknown>,
          `${path}[${i}]`,
        ),
      );
      break;
    }
    case 'string':
      if (typeof value !== 'string') fail('must be a string');
      if (
        (value as string).length < Number(schema.minLength ?? 0) ||
        (value as string).length > Number(schema.maxLength ?? Infinity)
      )
        fail('has an invalid length');
      if (
        typeof schema.pattern === 'string' &&
        !new RegExp(schema.pattern).test(value as string)
      )
        fail('has an invalid format');
      break;
    case 'integer':
    case 'number':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.type === 'integer' && !Number.isInteger(value))
      )
        fail(`must be a finite ${schema.type}`);
      if (
        (value as number) < Number(schema.minimum ?? -Infinity) ||
        (value as number) > Number(schema.maximum ?? Infinity)
      )
        fail('is outside the allowed range');
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail('must be a boolean');
      break;
    default:
      fail('uses an unsupported schema');
  }
}

export function createWebMcpTools(api: WorkspaceApi): WebMcpTool[] {
  const definitions: WebMcpTool[] = [
    {
      name: 'list_findings',
      title: 'List security findings',
      description:
        'Returns findings from the active Outpost workspace, optionally filtered by severity, status, component, tag, or minimum priority. Results provide the board context needed for evidence review and remediation planning.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: objectSchema({
        severity: {
          type: 'string',
          enum: SEVERITIES,
          description:
            'Optional severity to match: critical, high, medium, or low.',
        },
        status: {
          type: 'string',
          enum: STATUSES,
          description:
            'Optional workflow status to match: open, investigating, accepted, scheduled, or resolved.',
        },
        component: {
          type: 'string',
          maxLength: 120,
          description: 'Optional case-insensitive component name fragment.',
        },
        tag: {
          type: 'string',
          maxLength: 60,
          description: 'Optional exact lowercase finding tag.',
        },
        minimumPriority: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description:
            'Optional minimum Outpost Priority Score from 0 through 100.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of findings to return; defaults to 100.',
        },
      }),
      execute: wrap((input) => {
        const severity =
          input.severity === undefined
            ? undefined
            : assertEnum(input.severity, 'severity', SEVERITIES);
        const status =
          input.status === undefined
            ? undefined
            : assertEnum(input.status, 'status', STATUSES);
        const component =
          input.component === undefined
            ? undefined
            : assertText(input.component, 'component', 1, 120);
        const tag =
          input.tag === undefined
            ? undefined
            : assertText(input.tag, 'tag', 1, 60).toLowerCase();
        const minimumPriority =
          input.minimumPriority === undefined
            ? undefined
            : assertNumber(input.minimumPriority, 'minimumPriority', 0, 100);
        const limit =
          input.limit === undefined
            ? undefined
            : assertNumber(input.limit, 'limit', 1, 100);
        const findings = api.listFindings({
          severity,
          status,
          component,
          tag,
          minimumPriority,
          limit,
        });
        return result({
          ok: true,
          count: findings.length,
          findings: findings.map(slimFinding),
        });
      }),
    },
    {
      name: 'inspect_finding',
      title: 'Inspect a security finding',
      description:
        'Returns complete evidence, reasoning, remediation guidance, analyst notes, relationships, and scoring detail for one Outpost finding. The result supports an informed decision before workspace state changes.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: objectSchema({ findingId }, ['findingId']),
      execute: wrap(({ findingId: value }) => {
        const id = assertText(value, 'findingId', 5, 10);
        const finding = api.inspectFinding(id);
        return result({
          ok: true,
          finding: { ...finding, priority: priorityFormula(finding) },
        });
      }),
    },
    {
      name: 'set_finding_severity',
      title: 'Set finding severity',
      description:
        'Assigns a severity with a recorded reason to a security finding and records the reason in the activity trail. Human-locked findings reject automatic severity changes.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingId,
          severity: {
            type: 'string',
            enum: SEVERITIES,
            description: 'New severity: critical, high, medium, or low.',
          },
          reason,
        },
        ['findingId', 'severity', 'reason'],
      ),
      execute: wrap((input) => {
        const id = assertText(input.findingId, 'findingId', 5, 10);
        const severity = assertEnum(input.severity, 'severity', SEVERITIES);
        const why = assertText(input.reason, 'reason', 4, 500);
        return result({
          ok: true,
          finding: slimFinding(api.setSeverity(id, severity, why, 'agent')),
        });
      }),
    },
    {
      name: 'set_finding_status',
      title: 'Set finding status',
      description:
        'Assigns a workflow status to an Outpost finding and records the reason in the activity trail. Human-locked findings reject automatic status changes.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingId,
          status: {
            type: 'string',
            enum: STATUSES,
            description:
              'New workflow status: open, investigating, accepted, scheduled, or resolved.',
          },
          reason,
        },
        ['findingId', 'status', 'reason'],
      ),
      execute: wrap((input) => {
        const id = assertText(input.findingId, 'findingId', 5, 10);
        const status = assertEnum(input.status, 'status', STATUSES);
        const why = assertText(input.reason, 'reason', 4, 500);
        return result({
          ok: true,
          finding: slimFinding(api.setStatus(id, status, why, 'agent')),
        });
      }),
    },
    {
      name: 'add_finding_note',
      title: 'Add a finding note',
      description:
        'Appends analysis or context to an Outpost finding without changing its rating. Notes remain visible to the analyst and return as untrusted user-authored content in later inspections.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingId,
          note: {
            type: 'string',
            minLength: 2,
            maxLength: 1200,
            description:
              'Analysis or contextual note to append to the finding.',
          },
          authorType: {
            type: 'string',
            enum: ['agent'],
            default: 'agent',
            description:
              'Provenance label for the note author; defaults to agent.',
          },
        },
        ['findingId', 'note'],
      ),
      execute: wrap((input) => {
        const id = assertText(input.findingId, 'findingId', 5, 10);
        const note = assertText(input.note, 'note', 2, 1200);
        const authorType =
          input.authorType === undefined
            ? 'agent'
            : assertEnum(input.authorType, 'authorType', ['agent'] as const);
        const finding = api.addNote(id, note, authorType);
        return result({
          ok: true,
          findingId: id,
          noteCount: finding.notes.length,
        });
      }),
    },
    {
      name: 'compare_findings',
      title: 'Compare security findings',
      description:
        'Persists a visible comparison of two to six Outpost findings and returns their severity, impact, exploitability, confidence, effort, priority, and risk-to-effort values.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingIds: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            uniqueItems: true,
            items: findingId,
            description:
              'Two to six unique finding identifiers to compare visibly.',
          },
        },
        ['findingIds'],
      ),
      execute: wrap((input) => {
        const ids = assertStringArray(input.findingIds, 'findingIds', {
          min: 2,
          max: 6,
        });
        const findings = api.compareFindings(ids, 'agent');
        return result({
          ok: true,
          comparison: findings.map((finding) => ({
            ...slimFinding(finding),
            riskToEffort:
              Math.round((priorityScore(finding) / finding.effortDays) * 10) /
              10,
          })),
        });
      }),
    },
    {
      name: 'reprioritize_findings',
      title: 'Reprioritize findings',
      description:
        'Persists a relative priority order for a selected group of Outpost findings. Human-locked findings reject automatic reprioritization.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingIds: {
            type: 'array',
            minItems: 2,
            maxItems: 100,
            uniqueItems: true,
            items: findingId,
            description:
              'Complete set of unique finding identifiers being reordered.',
          },
          priorityOrder: {
            type: 'array',
            minItems: 2,
            maxItems: 100,
            uniqueItems: true,
            items: findingId,
            description:
              'The same finding identifiers in the requested highest-to-lowest priority order.',
          },
          reason,
        },
        ['findingIds', 'priorityOrder', 'reason'],
      ),
      execute: wrap((input) => {
        const ids = assertStringArray(input.findingIds, 'findingIds', {
          min: 2,
          max: 100,
        });
        const order = assertStringArray(input.priorityOrder, 'priorityOrder', {
          min: ids.length,
          max: ids.length,
        });
        const why = assertText(input.reason, 'reason', 4, 500);
        return result({
          ok: true,
          findings: api.reprioritize(ids, order, why, 'agent').map(slimFinding),
        });
      }),
    },
    {
      name: 'calculate_risk_summary',
      title: 'Calculate risk summary',
      description:
        'Returns a heuristic triage score, severity distribution, user-recorded resolution progress, and highest-priority findings using the transparent Outpost Priority Score.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: objectSchema({}),
      execute: wrap(() => {
        const summary = api.calculateRisk();
        return result({
          ok: true,
          ...summary,
          highestPriority: summary.highestPriority.map(slimFinding),
        });
      }),
    },
    {
      name: 'create_remediation_sprint',
      title: 'Create remediation sprint',
      description:
        'Creates and persists a visible capacity-bounded remediation sprint. Omitted finding IDs trigger automatic selection by risk, effort, or risk-to-effort while preserving accepted risk, resolved work, human locks, and prior human exclusions. The action schedules work without marking findings resolved.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingIds: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            uniqueItems: true,
            items: findingId,
            description:
              'Optional explicit findings to schedule. When omitted, Outpost automatically selects eligible findings.',
          },
          sprintName: {
            type: 'string',
            minLength: 2,
            maxLength: 80,
            description:
              'Visible sprint name; defaults to Priority reduction sprint.',
          },
          capacityDays: {
            type: 'number',
            minimum: 0.5,
            maximum: 60,
            description: 'Hard engineering capacity from 0.5 through 60 days.',
          },
          prioritizeBy: {
            type: 'string',
            enum: ['risk', 'effort', 'risk_to_effort'],
            default: 'risk',
            description:
              'Automatic selection strategy used when findingIds is omitted; defaults to risk.',
          },
        },
        ['capacityDays'],
      ),
      execute: wrap((input) => {
        const name =
          input.sprintName === undefined
            ? 'Priority reduction sprint'
            : assertText(input.sprintName, 'sprintName', 2, 80);
        const capacity = assertNumber(
          input.capacityDays,
          'capacityDays',
          0.5,
          60,
        );
        const mode =
          input.prioritizeBy === undefined
            ? 'risk'
            : (assertEnum(input.prioritizeBy, 'prioritizeBy', [
                'risk',
                'effort',
                'risk_to_effort',
              ] as const) as RebalanceMode);
        const sprint =
          input.findingIds === undefined
            ? api.optimizeSprint(name, capacity, mode, 'agent')
            : api.createSprint(
                assertStringArray(input.findingIds, 'findingIds', {
                  min: 1,
                  max: 100,
                }),
                name,
                capacity,
                'agent',
              );
        if (!sprint)
          throw new Error('Outpost could not create the remediation sprint.');
        const usedDays = sprint.findingIds.reduce(
          (sum, id) => sum + api.inspectFinding(id).effortDays,
          0,
        );
        return result({
          ok: true,
          selection: input.findingIds === undefined ? 'automatic' : 'explicit',
          prioritizeBy: mode,
          usedDays,
          sprint,
        });
      }),
    },
    {
      name: 'remove_from_remediation_sprint',
      title: 'Remove finding from sprint',
      description:
        'Removes one finding from the active remediation sprint and records an auditable reason. The finding remains in the workspace and is neither resolved nor deleted.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema({ findingId, reason }, ['findingId', 'reason']),
      execute: wrap((input) =>
        result({
          ok: true,
          sprint: api.removeFromSprint(
            assertText(input.findingId, 'findingId', 5, 10),
            assertText(input.reason, 'reason', 4, 500),
            'agent',
          ),
        }),
      ),
    },
    {
      name: 'rebalance_remediation_sprint',
      title: 'Rebalance remediation sprint',
      description:
        'Recalculates the active remediation sprint for a capacity using risk, effort, or risk-to-effort. The algorithm preserves every human-locked inclusion or exclusion and every manual human removal.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          capacityDays: {
            type: 'number',
            minimum: 0.5,
            maximum: 60,
            description:
              'New hard engineering capacity from 0.5 through 60 days.',
          },
          prioritizeBy: {
            type: 'string',
            enum: ['risk', 'effort', 'risk_to_effort'],
            description: 'Optimization strategy for the visible sprint.',
          },
        },
        ['capacityDays', 'prioritizeBy'],
      ),
      execute: wrap((input) => {
        const capacity = assertNumber(
          input.capacityDays,
          'capacityDays',
          0.5,
          60,
        );
        const mode = assertEnum(input.prioritizeBy, 'prioritizeBy', [
          'risk',
          'effort',
          'risk_to_effort',
        ] as const) as RebalanceMode;
        return result({
          ok: true,
          sprint: api.rebalanceSprint(capacity, mode, 'agent'),
        });
      }),
    },
    {
      name: 'mark_finding_human_locked',
      title: 'Set human decision lock',
      description:
        'Locks a finding against automatic changes. Only the human interface can unlock it. Automatic severity, status, priority, and sprint-scope operations preserve locked findings.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          findingId,
          locked: {
            type: 'boolean',
            const: true,
            description:
              'Must be true. Unlocking is available only in the human interface.',
          },
          reason,
        },
        ['findingId', 'locked', 'reason'],
      ),
      execute: wrap((input) => {
        if (typeof input.locked !== 'boolean')
          throw new Error('locked must be a boolean.');
        return result({
          ok: true,
          finding: slimFinding(
            api.setHumanLock(
              assertText(input.findingId, 'findingId', 5, 10),
              input.locked,
              assertText(input.reason, 'reason', 4, 500),
              'agent',
            ),
          ),
        });
      }),
    },
    {
      name: 'get_activity_history',
      title: 'Get activity history',
      description:
        'Returns recent human, agent, and system actions from the active Outpost review, including provenance that distinguishes analyst decisions from agent recommendations.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      inputSchema: objectSchema({
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description:
            'Maximum number of newest activity entries to return; defaults to 25.',
        },
      }),
      execute: wrap((input) => {
        const limit =
          input.limit === undefined
            ? 25
            : assertNumber(input.limit, 'limit', 1, 100);
        return result({
          ok: true,
          activity: api.getState().activity.slice(0, limit),
        });
      }),
    },
    {
      name: 'reset_demo_workspace',
      title: 'Reset demo workspace',
      description:
        'Restores an example workspace after exact confirmation. Refuses to overwrite personal findings. The result contains only reset status and the restored finding count.',
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      inputSchema: objectSchema(
        {
          confirmation: {
            type: 'string',
            const: 'RESET',
            description: 'Exact confirmation token RESET.',
          },
        },
        ['confirmation'],
      ),
      execute: wrap((input) => {
        if (input.confirmation !== 'RESET')
          throw new Error('confirmation must equal RESET.');
        const state = api.resetWorkspace('agent');
        return result({
          ok: true,
          reset: true,
          findingCount: state.findings.length,
        });
      }),
    },
  ];
  return definitions.map((tool) => {
    return {
      ...tool,
      execute: wrap((input, options) => {
        validateInput(input, tool.inputSchema ?? objectSchema({}));
        return tool.execute(input, options);
      }),
    };
  });
}

export function useWebMcpRegistration(api: WorkspaceApi, ready = true) {
  const [status, setStatus] = useState<WebMcpStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const tools = useMemo(() => createWebMcpTools(api), [api]);

  useEffect(() => {
    if (!ready) return;
    const context = document.modelContext ?? navigator.modelContext;
    if (!context) {
      setStatus('unavailable');
      return;
    }
    const controller = new AbortController();
    setStatus('checking');
    Promise.all(
      tools.map((tool) =>
        context.registerTool(tool, { signal: controller.signal }),
      ),
    )
      .then(() => {
        if (controller.signal.aborted) return;
        setError(null);
        setStatus('ready');
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        controller.abort();
        setError(
          cause instanceof Error ? cause.message : 'Tool registration failed.',
        );
        setStatus('error');
      });
    return () => controller.abort();
  }, [tools, ready]);

  return { status, error, count: tools.length, tools };
}
