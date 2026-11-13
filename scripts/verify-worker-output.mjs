import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
assert.equal(config.compatibility_date, '2026-11-10');
assert.deepEqual(config.compatibility_flags, ['nodejs_compat']);
assert.equal(config.upload_source_maps, false);

function verifyDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) verifyDirectory(path);
    else if (entry.isFile()) {
      assert.ok(!entry.name.endsWith('.map'), `Unexpected source map: ${path}`);
      if (/\.(?:js|mjs|cjs|css)$/.test(entry.name)) {
        assert.ok(!readFileSync(path, 'utf8').includes('sourceMappingURL='), `Unexpected source map reference: ${path}`);
      }
    } else throw new Error(`Unexpected built output entry: ${path}`);
  }
}
verifyDirectory('dist/client');
verifyDirectory('dist/server');
console.log('Worker date, flags and source-map behavior verified.');
