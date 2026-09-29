export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export const STATUSES = [
  'open',
  'investigating',
  'accepted',
  'scheduled',
  'resolved',
] as const;
export const LEVELS = ['high', 'medium', 'low'] as const;
export const CONFIDENCE_LEVELS = [
  'confirmed',
  'high',
  'medium',
  'low',
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type FindingStatus = (typeof STATUSES)[number];
export type Level = (typeof LEVELS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type Actor = 'human' | 'agent' | 'system';

export type FindingNote = {
  id: string;
  authorType: Actor;
  text: string;
  createdAt: string;
};

export type Finding = {
  id: string;
  title: string;
  description: string;
  component: string;
  severity: Severity;
  exploitability: Level;
  impact: Level;
  confidence: Confidence;
  status: FindingStatus;
  evidence: string[];
  reasoning: string;
  remediation: string;
  effortDays: number;
  tags: string[];
  relatedFindingIds: string[];
  notes: FindingNote[];
  humanLocked: boolean;
  lockReason?: string;
  priorityRank: number;
};

export type ActivityEntry = {
  id: string;
  actor: Actor;
  action: string;
  detail: string;
  findingId?: string;
  createdAt: string;
};

export type Sprint = {
  name: string;
  capacityDays: number;
  findingIds: string[];
  humanExcludedIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceState = {
  name: string;
  example: boolean;
  findings: Finding[];
  activity: ActivityEntry[];
  sprint: Sprint | null;
  comparisonIds: string[];
  selectedFindingId: string | null;
  highlightedFindingId: string | null;
  lastAgentAction: string | null;
};

const severityWeight: Record<Severity, number> = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 2,
};
const levelWeight: Record<Level, number> = { high: 3, medium: 2, low: 1 };
const confidenceMultiplier: Record<Confidence, number> = {
  confirmed: 1,
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

export function priorityScore(finding: Finding) {
  const raw =
    severityWeight[finding.severity] * 5 +
    levelWeight[finding.exploitability] * 8 +
    levelWeight[finding.impact] * 8;
  return Math.round(raw * confidenceMultiplier[finding.confidence]);
}

export function priorityFormula(finding: Finding) {
  return {
    severityPoints: severityWeight[finding.severity] * 5,
    exploitabilityPoints: levelWeight[finding.exploitability] * 8,
    impactPoints: levelWeight[finding.impact] * 8,
    confidenceMultiplier: confidenceMultiplier[finding.confidence],
    score: priorityScore(finding),
  };
}

export function riskSummary(findings: Finding[]) {
  const counts = Object.fromEntries(
    SEVERITIES.map((severity) => [
      severity,
      findings.filter((f) => f.severity === severity && f.status !== 'resolved')
        .length,
    ]),
  ) as Record<Severity, number>;
  const resolved = findings.filter((f) => f.status === 'resolved').length;
  const statusFactor: Record<FindingStatus, number> = {
    open: 1,
    investigating: 1,
    accepted: 1,
    scheduled: 1,
    resolved: 0,
  };
  const exposure = Math.round(
    findings.reduce(
      (sum, f) => sum + priorityScore(f) * statusFactor[f.status],
      0,
    ) / Math.max(1, findings.length),
  );
  const highestPriority = [...findings]
    .filter((f) => f.status !== 'resolved')
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, 5);
  return {
    counts,
    resolved,
    total: findings.length,
    exposure,
    progress: Math.round((resolved / Math.max(1, findings.length)) * 100),
    highestPriority,
  };
}

export function formatLabel(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
