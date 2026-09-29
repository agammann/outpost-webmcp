import {
  CONFIDENCE_LEVELS,
  LEVELS,
  SEVERITIES,
  STATUSES,
  priorityScore,
  riskSummary,
  safeId,
  type Actor,
  type Confidence,
  type Finding,
  type FindingStatus,
  type Level,
  type Severity,
  type WorkspaceState,
} from './domain.js';

export type RebalanceMode = 'risk' | 'effort' | 'risk_to_effort';

export type WorkspaceApi = {
  getState: () => WorkspaceState;
  listFindings: (filters?: {
    severity?: Severity;
    status?: FindingStatus;
    component?: string;
    tag?: string;
    minimumPriority?: number;
    limit?: number;
  }) => Finding[];
  inspectFinding: (findingId: string) => Finding;
  setSeverity: (
    findingId: string,
    severity: Severity,
    reason: string,
    actor: Actor,
  ) => Finding;
  setStatus: (
    findingId: string,
    status: FindingStatus,
    reason: string,
    actor: Actor,
  ) => Finding;
  addNote: (findingId: string, note: string, authorType: Actor) => Finding;
  compareFindings: (findingIds: string[], actor?: Actor) => Finding[];
  reprioritize: (
    findingIds: string[],
    priorityOrder: string[],
    reason: string,
    actor: Actor,
  ) => Finding[];
  calculateRisk: () => ReturnType<typeof riskSummary>;
  createSprint: (
    findingIds: string[],
    sprintName: string,
    capacityDays: number,
    actor: Actor,
  ) => WorkspaceState['sprint'];
  optimizeSprint: (
    sprintName: string,
    capacityDays: number,
    prioritizeBy: RebalanceMode,
    actor: Actor,
  ) => WorkspaceState['sprint'];
  removeFromSprint: (
    findingId: string,
    reason: string,
    actor: Actor,
  ) => WorkspaceState['sprint'];
  rebalanceSprint: (
    capacityDays: number,
    prioritizeBy: RebalanceMode,
    actor: Actor,
  ) => WorkspaceState['sprint'];
  setHumanLock: (
    findingId: string,
    locked: boolean,
    reason: string,
    actor: Actor,
  ) => Finding;
  resetWorkspace: (actor: Actor) => WorkspaceState;
  undo: () => boolean;
};

export function assertText(value: unknown, field: string, min = 1, max = 1000) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max)
    throw new Error(`${field} must be between ${min} and ${max} characters.`);
  return clean;
}

export function assertNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${field} must be a number between ${min} and ${max}.`);
  return value;
}

export function assertStringArray(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`${field} must be an array of strings.`);
  const min = options.min ?? 1;
  const max = options.max ?? 20;
  const clean = value.map((item) => item.trim());
  if (clean.some((item) => !item) || new Set(clean).size !== clean.length)
    throw new Error(`${field} must contain unique nonempty values.`);
  if (clean.length < min || clean.length > max)
    throw new Error(
      `${field} must contain between ${min} and ${max} unique values.`,
    );
  return clean;
}

export function assertEnum<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value))
    throw new Error(`${field} must be one of: ${allowed.join(', ')}.`);
  return value as T[number];
}

export function requireFinding(state: WorkspaceState, findingId: string) {
  const finding = state.findings.find((item) => item.id === findingId);
  if (!finding)
    throw new Error(
      `Finding ${findingId} was not found in the active workspace.`,
    );
  return finding;
}

function activity(
  state: WorkspaceState,
  actor: Actor,
  action: string,
  detail: string,
  findingId?: string,
) {
  return {
    ...state,
    activity: [
      {
        id: safeId('activity'),
        actor,
        action,
        detail,
        findingId,
        createdAt: new Date().toISOString(),
      },
      ...state.activity,
    ].slice(0, 100),
    lastAgentAction: actor === 'agent' ? detail : state.lastAgentAction,
    highlightedFindingId:
      actor === 'agent' ? (findingId ?? null) : state.highlightedFindingId,
  };
}

export function updateFinding(
  state: WorkspaceState,
  findingId: string,
  actor: Actor,
  action: string,
  detail: string,
  updater: (finding: Finding) => Finding,
) {
  const current = requireFinding(state, findingId);
  if (actor === 'agent' && current.humanLocked && action !== 'added note') {
    throw new Error(
      `${findingId} is human locked. Ask the analyst to unlock it or choose another finding.`,
    );
  }
  const next = {
    ...state,
    findings: state.findings.map((finding) =>
      finding.id === findingId ? updater(finding) : finding,
    ),
  };
  return activity(next, actor, action, detail, findingId);
}

export function applySeverity(
  state: WorkspaceState,
  findingId: string,
  severity: Severity,
  reason: string,
  actor: Actor,
) {
  assertEnum(severity, 'severity', SEVERITIES);
  const why = assertText(reason, 'reason', 4, 500);
  const before = requireFinding(state, findingId).severity;
  return updateFinding(
    state,
    findingId,
    actor,
    'changed severity',
    `${actor === 'agent' ? 'Agent' : 'Human'} changed ${findingId} from ${before} to ${severity}: ${why}`,
    (finding) => ({ ...finding, severity }),
  );
}

export function applyStatus(
  state: WorkspaceState,
  findingId: string,
  status: FindingStatus,
  reason: string,
  actor: Actor,
) {
  assertEnum(status, 'status', STATUSES);
  const why = assertText(reason, 'reason', 4, 500);
  if (status === 'scheduled' && !state.sprint?.findingIds.includes(findingId))
    throw new Error('Add the finding to a sprint before marking it scheduled.');
  const before = requireFinding(state, findingId).status;
  const next = updateFinding(
    state,
    findingId,
    actor,
    'changed status',
    `${actor === 'agent' ? 'Agent' : 'Human'} changed ${findingId} from ${before} to ${status}: ${why}`,
    (finding) => ({ ...finding, status }),
  );
  return status === 'scheduled' || !next.sprint
    ? next
    : {
        ...next,
        sprint: {
          ...next.sprint,
          findingIds: next.sprint.findingIds.filter((id) => id !== findingId),
          updatedAt: new Date().toISOString(),
        },
      };
}

export function applyNote(
  state: WorkspaceState,
  findingId: string,
  note: string,
  authorType: Actor,
) {
  const clean = assertText(note, 'note', 2, 1200);
  if (requireFinding(state, findingId).notes.length >= 200)
    throw new Error('This finding has reached the 200-note limit.');
  return updateFinding(
    state,
    findingId,
    authorType,
    'added note',
    `${authorType === 'agent' ? 'Agent' : 'Human'} attached a note to ${findingId}.`,
    (finding) => ({
      ...finding,
      notes: [
        ...finding.notes,
        {
          id: safeId('note'),
          authorType,
          text: clean,
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  );
}

export function applyComparison(
  state: WorkspaceState,
  findingIds: string[],
  actor: Actor = 'agent',
) {
  const ids = assertStringArray(findingIds, 'findingIds', { min: 2, max: 6 });
  ids.forEach((id) => requireFinding(state, id));
  return activity(
    { ...state, comparisonIds: ids },
    actor,
    'compared findings',
    `${actor === 'agent' ? 'Agent' : 'Human'} compared ${ids.join(', ')} by practical risk.`,
  );
}

export function applyReprioritize(
  state: WorkspaceState,
  findingIds: string[],
  priorityOrder: string[],
  reason: string,
  actor: Actor,
) {
  const ids = assertStringArray(findingIds, 'findingIds', { min: 2, max: 100 });
  const order = assertStringArray(priorityOrder, 'priorityOrder', {
    min: ids.length,
    max: ids.length,
  });
  const why = assertText(reason, 'reason', 4, 500);
  if (
    ids.some((id) => !order.includes(id)) ||
    order.some((id) => !ids.includes(id))
  )
    throw new Error('priorityOrder must contain each findingId exactly once.');
  ids.forEach((id) => {
    const finding = requireFinding(state, id);
    if (actor === 'agent' && finding.humanLocked)
      throw new Error(
        `${id} is human locked and cannot be automatically reprioritized.`,
      );
  });
  const ranks = ids
    .map((id) => requireFinding(state, id).priorityRank)
    .sort((a, b) => a - b);
  const next = {
    ...state,
    findings: state.findings.map((finding) => {
      const index = order.indexOf(finding.id);
      return index === -1
        ? finding
        : { ...finding, priorityRank: ranks[index] };
    }),
  };
  return activity(
    next,
    actor,
    'reprioritized findings',
    `${actor === 'agent' ? 'Agent' : 'Human'} reprioritized ${order.join(' → ')}: ${why}`,
  );
}

export function applyLock(
  state: WorkspaceState,
  findingId: string,
  locked: boolean,
  reason: string,
  actor: Actor,
) {
  if (actor === 'agent' && !locked)
    throw new Error('Only a human using the interface can unlock a finding.');
  const why = assertText(reason, 'reason', 4, 500);
  requireFinding(state, findingId);
  const next = {
    ...state,
    findings: state.findings.map((finding) =>
      finding.id === findingId
        ? {
            ...finding,
            humanLocked: locked,
            lockReason: locked ? why : undefined,
          }
        : finding,
    ),
  };
  return activity(
    next,
    actor,
    locked ? 'locked finding' : 'unlocked finding',
    `${actor === 'agent' ? 'Agent' : 'Human'} ${locked ? 'locked' : 'unlocked'} ${findingId}: ${why}`,
    findingId,
  );
}

export function applyCreateSprint(
  state: WorkspaceState,
  findingIds: string[],
  sprintName: string,
  capacityDays: number,
  actor: Actor,
) {
  const ids = assertStringArray(findingIds, 'findingIds', { min: 1, max: 100 });
  const name = assertText(sprintName, 'sprintName', 2, 80);
  const capacity = assertNumber(capacityDays, 'capacityDays', 0.5, 60);
  ids.forEach((id) => {
    const finding = requireFinding(state, id);
    if (finding.status === 'resolved')
      throw new Error(`${id} is already resolved and cannot be scheduled.`);
    if (actor === 'agent' && finding.status === 'accepted')
      throw new Error(
        `${id} is accepted risk and cannot be automatically scheduled.`,
      );
    if (
      actor === 'agent' &&
      finding.humanLocked &&
      !state.sprint?.findingIds.includes(id)
    ) {
      throw new Error(
        `${id} is human locked and cannot be automatically added to a sprint.`,
      );
    }
  });
  if (actor === 'agent') {
    if (
      state.sprint?.findingIds.some(
        (id) => requireFinding(state, id).humanLocked && !ids.includes(id),
      )
    )
      throw new Error('Preserve human-locked sprint inclusions.');
    if (ids.some((id) => state.sprint?.humanExcludedIds.includes(id)))
      throw new Error('Preserve human exclusions from the sprint.');
  }
  const effort = ids.reduce(
    (sum, id) => sum + requireFinding(state, id).effortDays,
    0,
  );
  if (effort > capacity)
    throw new Error(
      `Selected findings require ${effort} engineering days, exceeding the ${capacity}-day capacity.`,
    );
  const now = new Date().toISOString();
  const next: WorkspaceState = {
    ...state,
    sprint: {
      name,
      capacityDays: capacity,
      findingIds: ids,
      humanExcludedIds: (state.sprint?.humanExcludedIds ?? []).filter(
        (id) => !ids.includes(id),
      ),
      createdAt: now,
      updatedAt: now,
    },
    findings: reconcileScheduled(state.findings, ids),
  };
  return activity(
    next,
    actor,
    'created remediation sprint',
    `${actor === 'agent' ? 'Agent' : 'Human'} created “${name}” with ${ids.length} findings in ${effort}/${capacity} days.`,
  );
}

function sortSprintCandidates(
  findings: Finding[],
  prioritizeBy: RebalanceMode,
) {
  return [...findings].sort((a, b) => {
    if (prioritizeBy === 'effort')
      return a.effortDays - b.effortDays || priorityScore(b) - priorityScore(a);
    if (prioritizeBy === 'risk_to_effort')
      return priorityScore(b) / b.effortDays - priorityScore(a) / a.effortDays;
    return priorityScore(b) - priorityScore(a);
  });
}

export function applyOptimizeSprint(
  state: WorkspaceState,
  sprintName: string,
  capacityDays: number,
  prioritizeBy: RebalanceMode,
  actor: Actor,
) {
  const name = assertText(sprintName, 'sprintName', 2, 80);
  const capacity = assertNumber(capacityDays, 'capacityDays', 0.5, 60);
  assertEnum(prioritizeBy, 'prioritizeBy', [
    'risk',
    'effort',
    'risk_to_effort',
  ] as const);

  const preservedExclusions = state.sprint?.humanExcludedIds ?? [];
  const lockedIn =
    state.sprint?.findingIds.filter(
      (id) => requireFinding(state, id).humanLocked,
    ) ?? [];
  const lockedOut = state.findings
    .filter((finding) => finding.humanLocked && !lockedIn.includes(finding.id))
    .map((finding) => finding.id);
  const excluded = new Set([...preservedExclusions, ...lockedOut]);
  const candidates = sortSprintCandidates(
    state.findings.filter(
      (finding) =>
        finding.status !== 'resolved' &&
        finding.status !== 'accepted' &&
        !excluded.has(finding.id) &&
        !lockedIn.includes(finding.id),
    ),
    prioritizeBy,
  );

  const selected = [...lockedIn];
  let used = lockedIn.reduce(
    (sum, id) => sum + requireFinding(state, id).effortDays,
    0,
  );
  if (used > capacity)
    throw new Error(
      `Human-locked sprint items require ${used} engineering days, exceeding the ${capacity}-day capacity.`,
    );
  for (const finding of candidates) {
    if (used + finding.effortDays <= capacity) {
      selected.push(finding.id);
      used += finding.effortDays;
    }
  }
  if (selected.length === 0)
    throw new Error(
      'No eligible findings fit within the requested sprint capacity.',
    );

  const now = new Date().toISOString();
  const next: WorkspaceState = {
    ...state,
    sprint: {
      name,
      capacityDays: capacity,
      findingIds: selected,
      humanExcludedIds: preservedExclusions,
      createdAt: state.sprint?.createdAt ?? now,
      updatedAt: now,
    },
    findings: reconcileScheduled(state.findings, selected),
  };
  return activity(
    next,
    actor,
    'optimized remediation sprint',
    `${actor === 'agent' ? 'Agent' : 'Human'} built “${name}” by ${prioritizeBy.replaceAll('_', ' ')} with ${selected.length} findings in ${used}/${capacity} days while preserving human decisions.`,
  );
}

export function applyRemoveFromSprint(
  state: WorkspaceState,
  findingId: string,
  reason: string,
  actor: Actor,
) {
  const why = assertText(reason, 'reason', 4, 500);
  if (!state.sprint) throw new Error('No remediation sprint exists yet.');
  if (!state.sprint.findingIds.includes(findingId))
    throw new Error(`${findingId} is not in the active remediation sprint.`);
  if (actor === 'agent' && requireFinding(state, findingId).humanLocked)
    throw new Error(`${findingId} is human locked.`);
  const sprint = {
    ...state.sprint,
    findingIds: state.sprint.findingIds.filter((id) => id !== findingId),
    humanExcludedIds:
      actor === 'human'
        ? [...new Set([...state.sprint.humanExcludedIds, findingId])]
        : state.sprint.humanExcludedIds,
    updatedAt: new Date().toISOString(),
  };
  return activity(
    {
      ...state,
      sprint,
      findings: reconcileScheduled(state.findings, sprint.findingIds),
    },
    actor,
    'removed from sprint',
    `${actor === 'agent' ? 'Agent' : 'Human'} removed ${findingId} from the sprint: ${why}`,
    findingId,
  );
}

export function applyRebalanceSprint(
  state: WorkspaceState,
  capacityDays: number,
  prioritizeBy: RebalanceMode,
  actor: Actor,
) {
  if (!state.sprint)
    throw new Error(
      'No remediation sprint exists yet. Create one before rebalancing.',
    );
  const capacity = assertNumber(capacityDays, 'capacityDays', 0.5, 60);
  assertEnum(prioritizeBy, 'prioritizeBy', [
    'risk',
    'effort',
    'risk_to_effort',
  ] as const);
  const lockedIn = state.sprint.findingIds.filter(
    (id) => requireFinding(state, id).humanLocked,
  );
  const lockedOut = state.findings
    .filter((f) => f.humanLocked && !state.sprint!.findingIds.includes(f.id))
    .map((f) => f.id);
  const excluded = new Set([...state.sprint.humanExcludedIds, ...lockedOut]);
  const candidates = sortSprintCandidates(
    state.findings.filter(
      (f) =>
        f.status !== 'resolved' &&
        f.status !== 'accepted' &&
        !excluded.has(f.id) &&
        !lockedIn.includes(f.id),
    ),
    prioritizeBy,
  );
  const selected = [...lockedIn];
  let used = lockedIn.reduce(
    (sum, id) => sum + requireFinding(state, id).effortDays,
    0,
  );
  if (used > capacity)
    throw new Error(
      `Human-locked sprint items require ${used} days, exceeding the ${capacity}-day capacity.`,
    );
  for (const finding of candidates) {
    if (used + finding.effortDays <= capacity) {
      selected.push(finding.id);
      used += finding.effortDays;
    }
  }
  const sprint = {
    ...state.sprint,
    capacityDays: capacity,
    findingIds: selected,
    updatedAt: new Date().toISOString(),
  };
  return activity(
    {
      ...state,
      sprint,
      findings: reconcileScheduled(state.findings, sprint.findingIds),
    },
    actor,
    'rebalanced remediation sprint',
    `${actor === 'agent' ? 'Agent' : 'Human'} rebalanced by ${prioritizeBy.replaceAll('_', ' ')} to ${used}/${capacity} days while preserving ${lockedIn.length + lockedOut.length} human-locked decisions.`,
  );
}

export function filterFindings(
  findings: Finding[],
  filters: {
    severity?: Severity;
    status?: FindingStatus;
    component?: string;
    tag?: string;
    minimumPriority?: number;
    limit?: number;
  } = {},
) {
  const minimum = filters.minimumPriority ?? 0;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 100);
  return [...findings]
    .filter(
      (finding) => !filters.severity || finding.severity === filters.severity,
    )
    .filter((finding) => !filters.status || finding.status === filters.status)
    .filter(
      (finding) =>
        !filters.component ||
        finding.component
          .toLowerCase()
          .includes(filters.component.toLowerCase()),
    )
    .filter(
      (finding) =>
        !filters.tag || finding.tags.includes(filters.tag.toLowerCase()),
    )
    .filter((finding) => priorityScore(finding) >= minimum)
    .sort(
      (a, b) =>
        a.priorityRank - b.priorityRank || priorityScore(b) - priorityScore(a),
    )
    .slice(0, limit);
}

export function validateFindingDimensions(input: {
  severity?: unknown;
  exploitability?: unknown;
  impact?: unknown;
  confidence?: unknown;
  status?: unknown;
}) {
  return {
    severity:
      input.severity === undefined
        ? undefined
        : (assertEnum(input.severity, 'severity', SEVERITIES) as Severity),
    exploitability:
      input.exploitability === undefined
        ? undefined
        : (assertEnum(input.exploitability, 'exploitability', LEVELS) as Level),
    impact:
      input.impact === undefined
        ? undefined
        : (assertEnum(input.impact, 'impact', LEVELS) as Level),
    confidence:
      input.confidence === undefined
        ? undefined
        : (assertEnum(
            input.confidence,
            'confidence',
            CONFIDENCE_LEVELS,
          ) as Confidence),
    status:
      input.status === undefined
        ? undefined
        : (assertEnum(input.status, 'status', STATUSES) as FindingStatus),
  };
}

export function reconcileScheduled(
  findings: Finding[],
  ids: string[],
): Finding[] {
  return findings.map((f) =>
    ids.includes(f.id)
      ? { ...f, status: 'scheduled' }
      : f.status === 'scheduled'
        ? { ...f, status: 'open' }
        : f,
  );
}
