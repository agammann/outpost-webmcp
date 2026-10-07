# Contributing

Use Node.js 24+ and pnpm 11.19.0. Install with `pnpm install --frozen-lockfile` and start with `pnpm dev`.

Keep domain operations immutable and keep UI and WebMCP on the same persistence path. Add meaningful regression tests for changes to sprint rules, scoring, storage, or tools. Example findings must stay fictional. Do not introduce contest language or claim automated scanning or fix verification.

Before proposing changes, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm exec playwright install chromium`, and `pnpm test:e2e`. Review desktop/mobile rendering when editing the interface. Never commit generated builds, local reviews, browser profiles, credentials, or test traces.

For source release changes, review the full `pnpm audit`, run `pnpm test:audit-policy` and `pnpm security:audit`, install Chrome with `pnpm exec playwright install chrome`, and run `pnpm test:webmcp`. The native suite must discover the real API and fails when unavailable. The release policy accepts only the explicitly approved exact unpatched finding described in SECURITY.md; every other finding, unavailable metadata or newly available patch blocks release.

Commit the reviewed source before `pnpm package:release`. Verify and unpack it into a new folder outside the checkout with `python scripts/unpack-release.py --out ../outpost-clean-consumer`, then use a fresh frozen install and build there. CI also runs both browser suites from that extraction. Keep ZIPs, checksum files and browser evidence outside committed source. Source release acceptance and hosted deployment acceptance are separate checks.
