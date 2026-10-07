# Changelog

## 1.1.1

- Prepare the bounded browser-local v1 source distribution, MIT metadata and
  frozen-lock installation, upgrade and recovery guidance.
- Apply available patched source-map-js, tinypool and sharp updates through
  scoped overrides. Retain the one explicitly accepted high-severity braces
  production dependency finding under a strict live metadata policy; every
  other finding or newly available patch blocks release.
- Package exact committed source with checksums and validate a fresh extracted
  consumer in CI before any main-only publication.
- Keep the favicon redirect relative so the documented local HTTP Worker can
  load its icon without an HTTPS protocol error.
- Preserve existing workspace behavior, tool contracts and version 1 backups.
