import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function open(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Add finding', exact: true }),
  ).toBeEnabled();
}
async function add(page: Page, title = 'Review backup retention') {
  await page.getByRole('button', { name: 'Add finding', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Component', { exact: true }).fill('Backups');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Retention needs a documented review.');
  await page
    .getByLabel('Reasoning', { exact: true })
    .fill('Review and confirm the current policy.');
  await page
    .getByLabel('Remediation plan', { exact: true })
    .fill('Document the retention period and record the verification.');
  await page.getByRole('button', { name: 'Save finding', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function navigate(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) })
    .click();
}
async function example(page: Page) {
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(
    page.getByRole('heading', { name: 'Atlas example review' }),
  ).toBeVisible();
}
test('personal finding → note → sprint → resolve → backup → restore', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await add(page);
  await page
    .getByRole('button', { name: 'Open F-101: Review backup retention' })
    .click();
  await page.getByLabel('Analyst note').fill('Owner will review on Monday.');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(
    page.getByText('Owner will review on Monday.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await navigate(page, 'Remediation Sprint');
  await page.getByRole('button', { name: 'Create suggested sprint' }).click();
  await expect(page.getByText('1 / 5 days', { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Add finding', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Open F-101: Review backup retention' })
    .click();
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('resolved');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await navigate(page, 'Remediation Sprint');
  await expect(page.getByText('0 / 5 days', { exact: true })).toBeVisible();
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await saved;
  const backup = await download.path();
  expect(backup).toBeTruthy();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'New workspace' }).click();
  await page.getByLabel('Import workspace backup').setInputFiles(backup!);
  await navigate(page, 'Dashboard');
  await expect(
    page.getByRole('button', { name: 'Open F-101: Review backup retention' }),
  ).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('invalid import preserves existing findings', async ({ page }) => {
  await open(page);
  await add(page);
  await page
    .getByLabel('Import workspace backup')
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"findings":[]}'),
    });
  await expect(page.getByRole('status')).toContainText(
    'Import failed; current workspace kept.',
  );
  await expect(
    page.getByRole('button', { name: 'Open F-101: Review backup retention' }),
  ).toBeVisible();
});
test('corrupt stored data remains recoverable and is never silently cleared', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('outpost-workspace-v1', '{broken'),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Existing data was kept');
  await expect(
    page.getByRole('button', { name: 'Add finding', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem('outpost-workspace-v1')),
  ).toBe('{broken');
});
test('storage failure does not show an unsaved finding as saved', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage quota exceeded');
    };
  });
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Storage quota exceeded',
  );
  await expect(
    page.getByRole('heading', { name: 'My security review' }),
  ).toBeVisible();
});
test('another tab blocks stale changes until reload', async ({
  page,
  context,
}) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  await add(other);
  await expect(page.getByRole('alert')).toContainText('Another tab changed');
  await expect(
    page.getByRole('button', { name: 'Add finding', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open F-101: Review backup retention' }),
  ).toBeVisible();
});
test('page-side WebMCP persists changes, preserves locks, and refuses personal reset', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tools: Record<string, WebMcpTool> = {};
    Object.assign(window, { outpostTestTools: tools });
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: async (
          tool: WebMcpTool,
          options: { signal: AbortSignal },
        ) => {
          tools[tool.name] = tool;
          options.signal.addEventListener('abort', () => {
            delete tools[tool.name];
          });
        },
      },
    });
  });
  await open(page);
  await add(page);
  const call = (name: string, input: Record<string, unknown>) =>
    page.evaluate(
      async ({ name, input }) => {
        const tools = (
          window as unknown as { outpostTestTools: Record<string, WebMcpTool> }
        ).outpostTestTools;
        return JSON.parse(String(await tools[name].execute(input)));
      },
      { name, input },
    );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            (window as unknown as { outpostTestTools: object })
              .outpostTestTools,
          ).length,
      ),
    )
    .toBe(14);
  expect(
    (
      await call('add_finding_note', {
        findingId: 'F-101',
        note: 'Review the documented retention policy.',
      })
    ).ok,
  ).toBe(true);
  expect(
    (await call('create_remediation_sprint', { capacityDays: 1 })).usedDays,
  ).toBe(1);
  expect(
    (
      await call('mark_finding_human_locked', {
        findingId: 'F-101',
        locked: true,
        reason: 'Preserve analyst planning.',
      })
    ).ok,
  ).toBe(true);
  expect(
    (
      await call('remove_from_remediation_sprint', {
        findingId: 'F-101',
        reason: 'Attempt automatic removal.',
      })
    ).ok,
  ).toBe(false);
  expect(
    (await call('reset_demo_workspace', { confirmation: 'RESET' })).ok,
  ).toBe(false);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open F-101: Review backup retention' }),
  ).toBeVisible();
  const result = await call('inspect_finding', { findingId: 'F-101' });
  expect(result.finding.humanLocked).toBe(true);
  expect(result.finding.notes[0].authorType).toBe('agent');
  expect(result.finding.status).toBe('scheduled');
});
test('desktop and mobile workflows render without page overflow', async ({
  page,
}) => {
  await open(page);
  await example(page);
  const output = process.env.OUTPOST_SCREENSHOTS;
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({
      path: `${output}/outpost-desktop.png`,
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await navigate(page, 'Findings');
  await page.getByLabel('Search findings').fill('F-101');
  await page
    .getByRole('button', { name: /Missing authorization check/ })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (output)
    await page.screenshot({
      path: `${output}/outpost-mobile.png`,
      fullPage: true,
    });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('manual editing and explicit sprint scope respect capacity and support undo', async ({
  page,
}) => {
  await open(page);
  await add(page);
  await page
    .getByRole('button', { name: 'Open F-101: Review backup retention' })
    .click();
  await page.getByRole('button', { name: 'Edit finding', exact: true }).click();
  await page.getByLabel('Engineering days', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save finding', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open F-101: Review backup retention' })
    .click();
  page.once('dialog', (d) => d.accept('1'));
  await page
    .getByRole('button', { name: 'Add to sprint', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'exceeding the 1-day capacity',
  );
  await page
    .getByRole('button', { name: 'Open F-101: Review backup retention' })
    .click();
  page.once('dialog', (d) => d.accept('5'));
  await page
    .getByRole('button', { name: 'Add to sprint', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await navigate(page, 'Remediation Sprint');
  await expect(page.getByText('2 / 5 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove F-101', exact: true }).click();
  await expect(page.getByText('0 / 5 days', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('2 / 5 days', { exact: true })).toBeVisible();
});
