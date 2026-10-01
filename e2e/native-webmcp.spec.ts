import { test, expect, type Page } from '@playwright/test';
import {
  createWebMcpTools,
  WEBMCP_TOOL_NAMES,
} from '../lib/webmcp/register-tools';
import type { WorkspaceApi } from '../lib/workspace';

type NativeTool = {
  name: string;
  title: string;
  inputSchema: string | Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  origin: string;
};
type NativeContext = {
  getTools(): Promise<NativeTool[]>;
  executeTool(
    tool: NativeTool,
    input: string | Record<string, unknown>,
  ): Promise<unknown>;
};
const names = [...WEBMCP_TOOL_NAMES].sort();
const key = 'outpost-workspace-v1';
const reason = 'Review the fictional release practice.';
const errors = new WeakMap<Page, string[]>();
async function call(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
) {
  return page.evaluate(
    async ({ name, input }) => {
      const native = document.modelContext as unknown as NativeContext;
      const tool = (await native.getTools()).find((tool) => tool.name === name);
      if (!tool) throw new Error(`Native discovery did not return ${name}`);
      const major = Number(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]);
      try {
        const result = await native.executeTool(
          tool,
          major < 155 ? JSON.stringify(input) : input,
        );
        return typeof result === 'string' ? JSON.parse(result) : result;
      } catch (error) {
        return { nativeError: (error as Error).message };
      }
    },
    { name, input },
  );
}
async function toolNames(page: Page) {
  return page.evaluate(async () =>
    (await (document.modelContext as unknown as NativeContext).getTools())
      .map((tool) => tool.name)
      .sort(),
  );
}
async function ready(page: Page) {
  await expect.poll(() => toolNames(page)).toEqual(names);
  await expect(page.getByText('WebMCP ready', { exact: true })).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), key);
}
async function example(page: Page) {
  await page.getByRole('button', { name: 'Load example', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Atlas example review', exact: true }),
  ).toBeVisible();
}
async function navigate(page: Page, name: string) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) })
    .click();
}
async function finding(page: Page, id: string) {
  await navigate(page, 'Dashboard');
  await page.getByRole('button', { name: new RegExp(`^Open ${id}:`) }).click();
}

test.beforeEach(async ({ page, browser }, testInfo) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  await testInfo.attach('browser-version', {
    body: browser.version(),
    contentType: 'text/plain',
  });
  await page.goto('/');
  await ready(page);
  expect(
    await page.evaluate(() => document.modelContext?.registerTool.toString()),
  ).toContain('[native code]');
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test('native discovery exposes fourteen titled schemas and reads an empty review', async ({
  page,
}) => {
  const tools = await page.evaluate(async () =>
    (document.modelContext as unknown as NativeContext).getTools(),
  );
  for (const contract of createWebMcpTools({} as WorkspaceApi)) {
    const actual = tools.find((tool) => tool.name === contract.name)!;
    expect(actual.title).toBe(contract.title);
    expect(
      typeof actual.inputSchema === 'string'
        ? JSON.parse(actual.inputSchema)
        : actual.inputSchema,
    ).toEqual(contract.inputSchema);
    expect(actual.annotations).toMatchObject(contract.annotations!);
    expect(actual.origin).toBe(new URL(page.url()).origin);
  }
  const before = await stored(page);
  expect(await call(page, 'list_findings')).toMatchObject({
    ok: true,
    count: 0,
    findings: [],
  });
  expect(await call(page, 'calculate_risk_summary')).toMatchObject({
    ok: true,
    total: 0,
    resolved: 0,
  });
  expect(await call(page, 'get_activity_history')).toMatchObject({
    ok: true,
    activity: [],
  });
  expect(await stored(page)).toBe(before);
});

test('all fourteen native tools share visible durable state, locks, capacity and undo', async ({
  page,
}) => {
  await example(page);
  expect(
    (await call(page, 'list_findings', { component: 'Atlas Admin', limit: 1 }))
      .findings[0].id,
  ).toBe('F-101');
  expect(
    (await call(page, 'inspect_finding', { findingId: 'F-104' })).finding
      .humanLocked,
  ).toBe(true);
  expect(
    (
      await call(page, 'set_finding_severity', {
        findingId: 'F-101',
        severity: 'high',
        reason,
      })
    ).finding.severity,
  ).toBe('high');
  await finding(page, 'F-101');
  await expect(
    page.getByRole('combobox', { name: 'Severity', exact: true }),
  ).toHaveValue('high');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(
    (
      await call(page, 'set_finding_status', {
        findingId: 'F-101',
        status: 'investigating',
        reason,
      })
    ).finding.status,
  ).toBe('investigating');
  expect(
    (
      await call(page, 'add_finding_note', {
        findingId: 'F-101',
        note: 'Fictional release practice: documented review remains pending.',
      })
    ).ok,
  ).toBe(true);
  await finding(page, 'F-101');
  await expect(
    page.getByText(
      'Fictional release practice: documented review remains pending.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Status', exact: true }),
  ).toHaveValue('investigating');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(
    (await call(page, 'compare_findings', { findingIds: ['F-101', 'F-102'] }))
      .ok,
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Finding priorities side by side' }),
  ).toBeVisible();
  expect(
    (
      await call(page, 'reprioritize_findings', {
        findingIds: ['F-101', 'F-102'],
        priorityOrder: ['F-102', 'F-101'],
        reason,
      })
    ).ok,
  ).toBe(true);
  const first = (await call(page, 'inspect_finding', { findingId: 'F-101' }))
    .finding;
  const second = (await call(page, 'inspect_finding', { findingId: 'F-102' }))
    .finding;
  expect(second.priorityRank).toBeLessThan(first.priorityRank);
  expect(await call(page, 'calculate_risk_summary')).toMatchObject({
    ok: true,
    total: 18,
  });
  const sprint = await call(page, 'create_remediation_sprint', {
    capacityDays: 4,
    findingIds: ['F-101', 'F-102'],
    sprintName: 'Fictional release sprint',
  });
  expect(sprint).toMatchObject({
    ok: true,
    usedDays: 3.5,
    selection: 'explicit',
  });
  await navigate(page, 'Remediation Sprint');
  await expect(page.getByText('3.5 / 4 days', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: 'Capacity', exact: true }),
  ).toHaveValue('4');
  await page
    .getByRole('spinbutton', { name: 'Capacity', exact: true })
    .fill('3');
  expect(
    (
      await call(page, 'add_finding_note', {
        findingId: 'F-102',
        note: 'Unrelated edits preserve the capacity draft.',
      })
    ).ok,
  ).toBe(true);
  await expect(
    page.getByRole('spinbutton', { name: 'Capacity', exact: true }),
  ).toHaveValue('3');
  await page
    .getByRole('spinbutton', { name: 'Capacity', exact: true })
    .fill('4');
  expect(
    (
      await call(page, 'remove_from_remediation_sprint', {
        findingId: 'F-102',
        reason,
      })
    ).ok,
  ).toBe(true);
  await expect(page.getByText('2 / 4 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('3.5 / 4 days', { exact: true })).toBeVisible();
  expect(
    (
      await call(page, 'mark_finding_human_locked', {
        findingId: 'F-101',
        locked: true,
        reason,
      })
    ).finding.humanLocked,
  ).toBe(true);
  const beforeFailure = await stored(page);
  expect(
    (
      await call(page, 'rebalance_remediation_sprint', {
        capacityDays: 1,
        prioritizeBy: 'effort',
      })
    ).ok,
  ).toBe(false);
  expect(await stored(page)).toBe(beforeFailure);
  const rebalanced = await call(page, 'rebalance_remediation_sprint', {
    capacityDays: 4,
    prioritizeBy: 'risk_to_effort',
  });
  expect(rebalanced.ok).toBe(true);
  expect(rebalanced.sprint.findingIds).toContain('F-101');
  const members = (await call(page, 'list_findings')).findings.filter(
    (entry: { id: string }) => rebalanced.sprint.findingIds.includes(entry.id),
  );
  expect(
    members.reduce(
      (sum: number, entry: { effortDays: number }) => sum + entry.effortDays,
      0,
    ),
  ).toBeLessThanOrEqual(4);
  expect(
    (await call(page, 'get_activity_history', { limit: 100 })).activity.some(
      (entry: { actor: string }) => entry.actor === 'agent',
    ),
  ).toBe(true);
  await page.reload();
  await ready(page);
  await navigate(page, 'Remediation Sprint');
  await expect(
    page.getByRole('spinbutton', { name: 'Capacity', exact: true }),
  ).toHaveValue('4');
  const restored = (await call(page, 'inspect_finding', { findingId: 'F-101' }))
    .finding;
  expect(restored).toMatchObject({
    severity: 'high',
    status: 'scheduled',
    humanLocked: true,
  });
  expect(
    restored.notes.some(
      (note: { text: string; authorType: string }) =>
        note.text.startsWith('Fictional release practice') &&
        note.authorType === 'agent',
    ),
  ).toBe(true);
  expect(
    await call(page, 'reset_demo_workspace', { confirmation: 'RESET' }),
  ).toMatchObject({ ok: true, reset: true, findingCount: 18 });
  expect(
    (await call(page, 'inspect_finding', { findingId: 'F-101' })).finding,
  ).toMatchObject({ severity: 'critical', status: 'open', humanLocked: false });
});

test('native validation and human locks reject changes without altering saved data', async ({
  page,
}) => {
  await example(page);
  const before = await stored(page);
  const cases: [string, Record<string, unknown>][] = [
    ['list_findings', { limit: 1.5 }],
    ['list_findings', { limit: 101 }],
    ['list_findings', { unknown: true }],
    ['inspect_finding', {}],
    ['inspect_finding', { findingId: 'wrong' }],
    ['inspect_finding', { findingId: 'F-999999' }],
    ['set_finding_severity', { findingId: 'F-104', severity: 'low', reason }],
    ['set_finding_status', { findingId: 'F-104', status: 'resolved', reason }],
    ['set_finding_status', { findingId: 'F-101', status: 'scheduled', reason }],
    ['add_finding_note', { findingId: 'F-101', note: 'x' }],
    [
      'add_finding_note',
      { findingId: 'F-101', note: 'Valid note', authorType: 'human' },
    ],
    ['compare_findings', { findingIds: ['F-101', 'F-101'] }],
    [
      'reprioritize_findings',
      {
        findingIds: ['F-101', 'F-102'],
        priorityOrder: ['F-101', 'F-103'],
        reason,
      },
    ],
    ['create_remediation_sprint', { capacityDays: 1, findingIds: ['F-101'] }],
    ['create_remediation_sprint', { capacityDays: 61 }],
    [
      'mark_finding_human_locked',
      { findingId: 'F-104', locked: false, reason },
    ],
    ['get_activity_history', { limit: 0 }],
    ['reset_demo_workspace', { confirmation: 'reset' }],
  ];
  for (const [name, input] of cases) {
    const result = await call(page, name, input);
    expect(
      result.ok === false || !!result.nativeError,
      `${name}: ${JSON.stringify(input)}`,
    ).toBe(true);
    expect(await stored(page)).toBe(before);
  }
  expect(
    (
      await call(page, 'add_finding_note', {
        findingId: 'F-104',
        note: 'A note preserves the locked decision.',
      })
    ).ok,
  ).toBe(true);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'New workspace', exact: true })
    .click();
  const personal = await stored(page);
  expect(
    (await call(page, 'reset_demo_workspace', { confirmation: 'RESET' })).ok,
  ).toBe(false);
  expect(await stored(page)).toBe(personal);
  expect((await call(page, 'list_findings')).count).toBe(0);
});

test('native writes report storage failures and stale tabs withdraw tools', async ({
  page,
  context,
}) => {
  await example(page);
  const before = await stored(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage quota exceeded');
    };
  });
  expect(
    await call(page, 'add_finding_note', {
      findingId: 'F-101',
      note: 'This unsaved note must not appear.',
    }),
  ).toMatchObject({ ok: false, error: 'Storage quota exceeded' });
  expect(await stored(page)).toBe(before);
  expect(
    (
      await call(page, 'inspect_finding', { findingId: 'F-101' })
    ).finding.notes.some(
      (note: { text: string }) =>
        note.text === 'This unsaved note must not appear.',
    ),
  ).toBe(false);
  await page.reload();
  await ready(page);
  const other = await context.newPage();
  await other.goto('/');
  await ready(other);
  expect(
    (
      await call(other, 'add_finding_note', {
        findingId: 'F-101',
        note: 'Another tab saved this fictional note.',
      })
    ).ok,
  ).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Another tab changed');
  await expect.poll(() => toolNames(page)).toEqual([]);
  await expect(page.getByText('WebMCP ready', { exact: true })).toHaveCount(0);
  await other.close();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await ready(page);
  expect(
    (
      await call(page, 'inspect_finding', { findingId: 'F-101' })
    ).finding.notes.some(
      (note: { text: string }) =>
        note.text === 'Another tab saved this fictional note.',
    ),
  ).toBe(true);
});

test('native registrations clean up and restore through actual back-forward caching', async ({
  page,
}, testInfo) => {
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pagehide', { persisted: true }),
    ),
  );
  await expect.poll(() => toolNames(page)).toEqual([]);
  await expect(page.getByText('WebMCP ready', { exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  );
  await ready(page);
  await page.evaluate(() =>
    window.addEventListener('pageshow', (event) => {
      (window as unknown as { outpostRestored: boolean }).outpostRestored =
        event.persisted;
    }),
  );
  await page.goto('/llms.txt');
  await page.goBack({ waitUntil: 'commit' });
  await ready(page);
  const restored = await page.evaluate(
    () =>
      (window as unknown as { outpostRestored?: boolean }).outpostRestored ===
      true,
  );
  await testInfo.attach('back-forward-cache', {
    body: JSON.stringify({ restored }),
    contentType: 'application/json',
  });
  if (!process.env.OUTPOST_WEBMCP_URL) expect(restored).toBe(true);
  expect(await call(page, 'calculate_risk_summary')).toMatchObject({
    ok: true,
    total: 0,
  });
  await page.reload();
  await ready(page);
});
