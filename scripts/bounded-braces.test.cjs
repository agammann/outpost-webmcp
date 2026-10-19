const { test } = require('node:test');
const assert = require('node:assert/strict');
const braces = require('@agammann/bounded-braces');
const { createRequire } = require('node:module');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const depthError = error => error instanceof RangeError && error.code === 'ERR_BRACES_DEPTH';

test('real tooling consumers resolve the bounded implementation on every braces edge', () => {
  const root = path.resolve(__dirname, '..');
  const project = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  function dependency(from, name) {
    const lookup = createRequire(path.join(from, 'package.json')).resolve.paths(name);
    for (const directory of lookup || []) {
      const file = path.join(directory, name, 'package.json');
      if (existsSync(file)) return path.dirname(realpathSync(file));
    }
    return null;
  }
  for (const tool of ['vinext', 'shadcn', 'eslint-config-next']) {
    if (!project.dependencies?.[tool] && !project.devDependencies?.[tool]) continue;
    const initial = dependency(root, tool);
    assert.ok(initial, `${tool} is installed`);
    const queue = [initial];
    const visited = new Set();
    let edges = 0;
    for (let index = 0; index < queue.length; index++) {
      const directory = queue[index];
      if (visited.has(directory)) continue;
      visited.add(directory);
      const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
      for (const name of Object.keys(metadata.dependencies || {})) {
        const resolved = dependency(directory, name);
        assert.ok(resolved, `${metadata.name} dependency ${name} is installed`);
        if (name === 'braces') {
          const replacement = JSON.parse(readFileSync(path.join(resolved, 'package.json'), 'utf8'));
          assert.equal(replacement.name, '@agammann/bounded-braces');
          assert.equal(require(resolved), braces);
          assert.throws(() => require(resolved).compile('{'.repeat(4999) + 'x' + '}'.repeat(4999)), depthError);
          edges++;
        }
        queue.push(resolved);
      }
    }
    assert.ok(edges > 0, `${tool} traverses at least one protected braces edge`);
  }
});

test('reject deeply nested, mixed and unclosed patterns through every public entry point', () => {
  const patterns = [
    '{'.repeat(4999) + 'x' + '}'.repeat(4999),
    '('.repeat(4999) + 'x' + ')'.repeat(4999),
    '{('.repeat(2499) + 'x' + ')}'.repeat(2499),
    '{'.repeat(4999) + 'x',
  ];
  const entrypoints = [braces, braces.create, braces.parse, braces.compile, braces.expand, braces.stringify];
  for (const pattern of patterns) {
    for (const entrypoint of entrypoints) {
      assert.throws(() => entrypoint(pattern, { maxDepth: false, rangeLimit: false }), depthError);
    }
    assert.throws(() => braces(['a/{b,c}', pattern]), depthError);
  }
});

test('bound AST callers and cyclic child graphs before recursive stack exhaustion', () => {
  const deep = { type: 'root', nodes: [] };
  let parent = deep;
  for (let i = 0; i < 10000; i++) {
    const child = { type: 'brace', nodes: [], parent, open: true, close: true, commas: 0, ranges: 0 };
    parent.nodes.push(child);
    parent = child;
  }
  parent.nodes.push({ type: 'text', value: 'x' });
  const cyclic = { type: 'root', nodes: [] };
  cyclic.nodes.push(cyclic);
  for (const entrypoint of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => entrypoint(deep), depthError);
    assert.throws(() => entrypoint(cyclic), depthError);
  }
});

test('preserve ordinary sets, ranges, escaping, quoting and malformed literals', () => {
  assert.deepEqual(braces('src/{app,lib}/**/*.{js,ts}', { expand: true }), [
    'src/app/**/*.js', 'src/app/**/*.ts', 'src/lib/**/*.js', 'src/lib/**/*.ts',
  ]);
  assert.equal(braces.compile('x/{a,b}/y'), 'x/(a|b)/y');
  assert.deepEqual(braces.expand('file-{01..03}'), ['file-01', 'file-02', 'file-03']);
  assert.deepEqual(braces.expand('{a..e..2}'), ['a', 'c', 'e']);
  assert.deepEqual(braces.expand('{a,a,,b}', { nodupes: true, noempty: true }), ['a', 'b']);
  assert.equal(braces.stringify(braces.parse('x/{a,b}/y')), 'x/{a,b}/y');
  assert.deepEqual(braces.expand('a/\\{x,y\\}'), ['a/{x,y}']);
  assert.deepEqual(braces.expand('a/{x,y'), ['a/{x,y']);
  assert.deepEqual(braces.expand('"' + '{'.repeat(1000) + '"'), ['{'.repeat(1000)]);
  assert.throws(() => braces.expand('{1..10001}'), /range limit/);
});

test('bound array values and malformed parent cycles in direct AST expansion', () => {
  const cyclic = [];
  cyclic.push(cyclic);
  assert.throws(() => braces.expand({ type: 'root', nodes: [{ type: 'text', value: cyclic }] }), depthError);
  let deep = ['x'];
  for (let i = 0; i < 10000; i++) deep = [deep];
  assert.throws(() => braces.expand({ type: 'root', nodes: [{ type: 'text', value: deep }] }), depthError);
  const parent = { type: 'paren', nodes: [] };
  parent.parent = parent;
  assert.throws(() => braces.expand({ type: 'root', nodes: [parent] }), depthError);
});

test('allow the documented nesting boundary and reject its first excess', () => {
  const pattern = '{'.repeat(64) + 'x' + '}'.repeat(64);
  assert.equal(braces.compile(pattern), pattern);
  assert.deepEqual(braces.expand(pattern), [pattern]);
  assert.equal(braces.stringify(braces.parse(pattern)), pattern);
  assert.throws(() => braces.parse('{' + pattern + '}'), depthError);
});
