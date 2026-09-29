import { z } from 'zod';
import {
  CONFIDENCE_LEVELS,
  LEVELS,
  SEVERITIES,
  STATUSES,
  safeId,
  type Finding,
  type WorkspaceState,
} from './domain.js';

const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const id = z.string().regex(/^F-[0-9]{3,6}$/);
const date = z.string().datetime();
const actor = z.enum(['human', 'agent', 'system']);
const ids = z
  .array(id)
  .max(100)
  .refine((v) => new Set(v).size === v.length, 'Duplicate finding IDs.');
export const findingInput = z
  .object({
    title: text(160),
    description: text(4000),
    component: text(120),
    severity: z.enum(SEVERITIES),
    exploitability: z.enum(LEVELS),
    impact: z.enum(LEVELS),
    confidence: z.enum(CONFIDENCE_LEVELS),
    evidence: z.array(text(1200)).max(30),
    reasoning: text(4000),
    remediation: text(4000),
    effortDays: z.number().finite().min(0.5).max(60),
    tags: z.array(text(60)).max(20),
  })
  .strict();
const finding = findingInput.extend({
  id,
  status: z.enum(STATUSES),
  relatedFindingIds: ids,
  notes: z
    .array(
      z
        .object({
          id: text(100),
          authorType: actor,
          text: text(1200),
          createdAt: date,
        })
        .strict(),
    )
    .max(200),
  humanLocked: z.boolean(),
  lockReason: text(500).optional(),
  priorityRank: z.number().int().min(1).max(1000000),
});
const workspaceSchema = z
  .object({
    name: text(80),
    example: z.boolean(),
    findings: z.array(finding).max(100),
    activity: z
      .array(
        z
          .object({
            id: text(100),
            actor,
            action: text(200),
            detail: text(6000),
            findingId: id.optional(),
            createdAt: date,
          })
          .strict(),
      )
      .max(100),
    sprint: z
      .object({
        name: text(80),
        capacityDays: z.number().min(0.5).max(60),
        findingIds: ids,
        humanExcludedIds: ids,
        createdAt: date,
        updatedAt: date,
      })
      .strict()
      .nullable(),
    comparisonIds: ids,
    selectedFindingId: id.nullable(),
    highlightedFindingId: id.nullable(),
    lastAgentAction: text(6000).nullable(),
  })
  .strict();

export function emptyWorkspace(name = 'My security review'): WorkspaceState {
  return {
    name,
    example: false,
    findings: [],
    activity: [],
    sprint: null,
    comparisonIds: [],
    selectedFindingId: null,
    highlightedFindingId: null,
    lastAgentAction: null,
  };
}

export function validateWorkspace(value: unknown): WorkspaceState {
  const state = workspaceSchema.parse(value);
  const known = new Set(state.findings.map((f) => f.id));
  if (known.size !== state.findings.length)
    throw new Error('Duplicate finding IDs.');
  if (new Set(state.findings.map((f) => f.priorityRank)).size !== known.size)
    throw new Error('Duplicate priority ranks.');
  const references = [
    ...state.comparisonIds,
    ...state.findings.flatMap((f) => f.relatedFindingIds),
    ...(state.sprint?.findingIds ?? []),
    ...(state.sprint?.humanExcludedIds ?? []),
    ...[state.selectedFindingId, state.highlightedFindingId].filter(
      (v): v is string => v !== null,
    ),
  ];
  if (references.some((v) => !known.has(v)))
    throw new Error('A workspace reference points to a missing finding.');
  if (state.comparisonIds.length > 6 || state.comparisonIds.length === 1)
    throw new Error('Compare between two and six findings.');
  for (const f of state.findings) {
    if (
      (f.status === 'scheduled') !==
      !!state.sprint?.findingIds.includes(f.id)
    )
      throw new Error('Sprint membership and scheduled status must agree.');
  }
  if (state.sprint) {
    if (
      state.sprint.humanExcludedIds.some((v) =>
        state.sprint!.findingIds.includes(v),
      )
    )
      throw new Error('An excluded finding cannot be in the sprint.');
    const effort = state.findings
      .filter((f) => state.sprint!.findingIds.includes(f.id))
      .reduce((n, f) => n + f.effortDays, 0);
    if (effort > state.sprint.capacityDays + 1e-8)
      throw new Error('Sprint effort exceeds capacity.');
  }
  return state;
}

export function parseWorkspace(raw: string): WorkspaceState {
  if (raw.length > 4_000_000)
    throw new Error('Workspace backups must be smaller than 4 MB.');
  const value = JSON.parse(raw);
  if (value?.format === 'outpost-workspace') {
    if (value.version !== 1) throw new Error('Unsupported backup version.');
    return validateWorkspace(value.workspace);
  }
  // Preserve old local work while repairing known pre-1.1 planning inconsistencies.
  if (value && !('name' in value) && Array.isArray(value.findings)) {
    value.name = 'Imported Atlas review';
    value.example = false;
    value.findings
      .sort((a: Finding, b: Finding) => a.priorityRank - b.priorityRank)
      .forEach((f: Finding, i: number) => {
        f.priorityRank = i + 1;
      });
    if (value.sprint)
      value.sprint.findingIds = value.sprint.findingIds.filter((v: string) =>
        value.findings.some(
          (f: Finding) =>
            f.id === v && !['accepted', 'resolved'].includes(f.status),
        ),
      );
    for (const f of value.findings)
      f.status = value.sprint?.findingIds.includes(f.id)
        ? 'scheduled'
        : f.status === 'scheduled'
          ? 'open'
          : f.status;
  }
  return validateWorkspace(value);
}

export const serializeWorkspace = (state: WorkspaceState) =>
  JSON.stringify(
    {
      format: 'outpost-workspace',
      version: 1,
      workspace: validateWorkspace(state),
    },
    null,
    2,
  );

export function saveFinding(
  state: WorkspaceState,
  input: unknown,
  existingId?: string,
): WorkspaceState {
  const data = findingInput.parse(input);
  const existing = state.findings.find((f) => f.id === existingId);
  if (existingId && !existing) throw new Error('Finding no longer exists.');
  if (!existing && state.findings.length >= 100)
    throw new Error('A workspace supports up to 100 findings.');
  const nextId =
    Math.max(100, ...state.findings.map((f) => Number(f.id.slice(2)))) + 1;
  const record: Finding = existing
    ? { ...existing, ...data }
    : {
        ...data,
        id: `F-${nextId}`,
        status: 'open',
        relatedFindingIds: [],
        notes: [],
        humanLocked: false,
        priorityRank:
          Math.max(0, ...state.findings.map((f) => f.priorityRank)) + 1,
      };
  return validateWorkspace({
    ...state,
    example: false,
    findings: existing
      ? state.findings.map((f) => (f.id === existingId ? record : f))
      : [...state.findings, record],
    activity: [
      {
        id: safeId('activity'),
        actor: 'human',
        action: existing ? 'edited finding' : 'added finding',
        detail: `${existing ? 'Updated' : 'Added'} ${record.id}: ${record.title}`,
        findingId: record.id,
        createdAt: new Date().toISOString(),
      },
      ...state.activity,
    ].slice(0, 100),
  });
}

export class WorkspaceStore {
  private raw: string | null = null;
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    readonly key = 'outpost-workspace-v1',
  ) {}
  load() {
    this.raw = this.storage.getItem(this.key);
    return this.raw === null ? emptyWorkspace() : parseWorkspace(this.raw);
  }
  save(state: WorkspaceState) {
    if (this.storage.getItem(this.key) !== this.raw)
      throw new Error(
        'Another tab changed this workspace. Reload before editing.',
      );
    const next = serializeWorkspace(state);
    this.storage.setItem(this.key, next);
    this.raw = next;
  }
}
