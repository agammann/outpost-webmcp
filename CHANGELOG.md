# Changelog

## 1.1.3

- Count UTF-8 bytes consistently for imported and exported backups, and explain how to shorten an oversized backup without changing the workspace.
- Keep existing large Unicode browser workspaces readable while rejecting a local save that would fail to reload.

## 1.1.2

- Replace the unbounded brace dependency with a maintained compatibility package that preserves ordinary glob behavior and the upstream license.
- Reject excessive brace, parenthesis and AST-array nesting before stack exhaustion.
- Require dependency audits without accepted advisories and verify the replacement in freshly installed source distributions.

## 1.1.1

- Prepare the bounded browser-local v1 source distribution, MIT metadata and
  frozen-lock installation, upgrade and recovery guidance.
- Apply available source-map-js, tinypool and sharp updates through scoped overrides.
- Package exact committed source with checksums and validate a fresh extracted
  consumer in CI before any main-only publication.
- Keep the favicon redirect relative so the documented local HTTP Worker can
  load its icon without an HTTPS protocol error.
- Preserve existing workspace behavior, tool contracts and version 1 backups.
