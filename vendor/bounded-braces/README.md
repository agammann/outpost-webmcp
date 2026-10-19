# Bounded braces compatibility package

This repository maintains the MIT-licensed `braces` 3.0.3 implementation from
https://registry.npmjs.org/braces/-/braces-3.0.3.tgz, with its original license.
The upstream package remains vulnerable to GHSA-vfj7-8cjw-p6xm as of October 18,
2026. The package uses a distinct local name so it is not represented as an
upstream release or a patched upstream version.

The parser and the compile, expand and stringify walkers reject nesting above
64 levels with a `RangeError` whose code is `ERR_BRACES_DEPTH`. Parentheses and
braces share this bound, including unclosed patterns. Direct AST callers are
also bounded. Caller options cannot raise or disable the limit. Array flattening
uses an iterative traversal. Ordinary glob sets, ranges, escaping, malformed
literal patterns and the existing range limit retain their upstream behavior.

All transitive `braces` dependencies resolve to this directory. Run
`node --test scripts/bounded-braces.test.cjs` after changes. Keep this package,
its license and its tests in source distributions. Remove the replacement only
after verifying an upstream fix and rerunning the build and browser suites.
