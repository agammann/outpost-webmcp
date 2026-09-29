import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeedWorkspace } from '../lib/seed-data.js';
import { createWebMcpTools } from '../lib/webmcp/register-tools.js';
import {
  applyOptimizeSprint,
  requireFinding,
  type RebalanceMode,
  type WorkspaceApi,
} from '../lib/workspace.js';

void test('every WebMCP input property has evaluator-facing guidance', () => {
  const tools = createWebMcpTools({} as WorkspaceApi);
  assert.equal(tools.length, 14);
  assert.ok(
    tools.every((tool) => !/Threat\s*Canvas/i.test(tool.description)),
    'all fourteen WebMCP tool descriptions must use the Outpost brand',
  );

  for (const tool of tools) {
    const schema = tool.inputSchema as {
      properties?: Record<string, { description?: unknown }>;
    };
    for (const [property, definition] of Object.entries(
      schema.properties ?? {},
    )) {
      assert.equal(
        typeof definition.description,
        'string',
        `${tool.name}.${property} needs a description`,
      );
      assert.ok(
        (definition.description as string).trim().length > 0,
        `${tool.name}.${property} needs a non-empty description`,
      );
    }
  }
});

void test('WebMCP metadata describes visible comparison state and bounded reset output', () => {
  const tools = createWebMcpTools({} as WorkspaceApi);
  const compare = tools.find((tool) => tool.name === 'compare_findings')!;
  const reset = tools.find((tool) => tool.name === 'reset_demo_workspace')!;

  assert.equal(compare.annotations?.readOnlyHint, false);
  assert.match(compare.description, /persists a visible comparison/i);
  assert.equal(reset.annotations?.untrustedContentHint, true);
  assert.match(
    reset.description,
    /only reset status and the restored finding count/i,
  );
});

void test('create_remediation_sprint can optimize and persist the requested plan in one call', async () => {
  let state = createSeedWorkspace();
  const api = {
    optimizeSprint: (
      name: string,
      capacityDays: number,
      mode: RebalanceMode,
      actor: 'agent' | 'human',
    ) => {
      state = applyOptimizeSprint(state, name, capacityDays, mode, actor);
      return state.sprint;
    },
    inspectFinding: (findingId: string) => requireFinding(state, findingId),
  } as WorkspaceApi;
  const tool = createWebMcpTools(api).find(
    (candidate) => candidate.name === 'create_remediation_sprint',
  )!;

  const output = JSON.parse(
    String(await tool.execute({ capacityDays: 5, prioritizeBy: 'risk' })),
  );
  assert.equal(output.ok, true);
  assert.equal(output.selection, 'automatic');
  assert.equal(output.usedDays, 5);
  assert.deepEqual(output.sprint.findingIds, [
    'F-101',
    'F-114',
    'F-109',
    'F-105',
  ]);
  assert.deepEqual(state.sprint?.findingIds, output.sprint.findingIds);
});
