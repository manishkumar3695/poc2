---
name: security-vuln-automation-stack
description: Stack and conventions of the Playwright + Cucumber (JS/TS) BDD test framework under test/.
metadata:
  type: project
---

The BDD security suite at `test/` is **Playwright + Cucumber (JS/TS)**
and never Cucumber-JVM. Hard facts:

- **Stack:** `@cucumber/cucumber` ^11.0.1, `@playwright/test` ^1.47.2,
  `playwright` ^1.47.2, `ts-node` ^10.9.2, `typescript` ^5.6.2. Node 18+.
- **Runner:** `npx cucumber-js` (NOT `mvn`). `npm test` runs the full
  suite. `npm run test:smoke` is `--dry-run`. `npm run tsc:check` is
  `tsc --noEmit`.
- **Config files:** `cucumber.json` (paths, require, format, world
  parameters), `playwright.config.ts` (browser config, headless by
  default, baseURL `http://localhost:8080`), `tsconfig.json` (strict
  TS, commonjs, includes `step-definitions/**/*.ts` and `support/**/*.ts`).
- **Directory layout:** `features/security/*.feature` (one feature per
  vuln category), `step-definitions/*.steps.ts` (one file per feature;
  empty re-exports are fine), `support/*.ts` (World, hooks, api-client,
  common-steps, browser-steps, payloads, config, assertions), `reports/`
  (gitignored, `.gitkeep` only).
- **World pattern:** `SecurityWorld extends World` set via
  `setWorldConstructor(SecurityWorld)` in `support/hooks.ts`. Per-scenario
  state: `api: APIRequestContext`, `client: ApiClient`, `csrfToken?`,
  `lastResponseStatus`, `lastResponseBody`, `lastResponseJson`,
  `lastResponseHeaders` (added in SEC-004/005 work),
  `canaryUsername/Password/Email`, `lastUserId?`, `browser?`,
  `browserContext?`, `page?`. Tore down in `After`.
- **API client pattern:** `ApiClient` wraps `APIRequestContext` and
  auto-attaches `X-CSRF-TOKEN` on POSTs when `world.csrfToken` is set.
  CSRF token is minted by `I am authenticated for state-changing requests
  as "user:pass"` via `GET /dashboard` regex on `name="_csrf" value="..."`.
- **Common step patterns:** `I POST "/url" with JSON body:`, `I GET "/url"`,
  `the response status should be {int}`, `the response body should (not)
  contain/match`, `I am authenticated as "user:pass"`.
- **Browser pattern (added in SEC-004/005 work):** `chromium.launch`
  + `newContext({ baseURL })` + `newPage`, stored on world, torn down
  in `After`. Required because Playwright's `page.goto` refuses
  relative URLs unless the context has `baseURL` set.

**Why:** Knowing the stack prevents drift into Cucumber-JVM (Maven/
Java) which the agent spec explicitly forbids. Knowing the World shape
prevents re-inventing per-scenario state on every new feature.

**How to apply:** When adding a new SEC-* test case, follow these
rules:

1. Read `support/world.ts` first — extend the World for any new
   per-scenario state, don't re-invent it.
2. Read `support/common-steps.ts` and `support/browser-steps.ts`
   first — reuse existing step patterns where possible. New step
   patterns should be added to one of those two files, or to a
   per-feature `step-definitions/<feature>.steps.ts` if they are
   genuinely feature-specific.
3. Validate with `npx cucumber-js --dry-run` AND `npx tsc --noEmit`
   AND a full `npx cucumber-js` run before declaring done. The
   dry-run is necessary but not sufficient — it can hide type errors.
4. `find test/ -name 'pom.xml' -o -name 'build.gradle' -o -name '*.java'`
   must return nothing (testcaseInJson excluded) before reporting done.

Link: [[vulnerable-springboot-app-surface]]
