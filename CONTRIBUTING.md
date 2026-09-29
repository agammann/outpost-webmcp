# Contributing

Use Node.js 24+ and pnpm 11.19.0. Install with `pnpm install --frozen-lockfile` and start with `pnpm dev`.

Keep domain operations immutable and keep UI and WebMCP on the same persistence path. Add meaningful regression tests for changes to sprint rules, scoring, storage, or tools. Example findings must stay fictional. Do not introduce contest language or claim automated scanning or fix verification.

Before proposing changes, run `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm exec playwright install chromium`, and `pnpm test:e2e`. Review desktop/mobile rendering when editing the interface. Never commit generated builds, local reviews, browser profiles, credentials, or test traces.
