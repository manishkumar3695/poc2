# Security BDD — Playwright + Cucumber (JS/TS)

End-to-end BDD security automation for the OWASP Top 10 (2021) learning lab.
Targets the running Spring Boot app on `http://localhost:8080`.

## Stack

- `@cucumber/cucumber` (BDD runner)
- `playwright` / `@playwright/test` (HTTP request + browser primitives)
- `ts-node` + `typescript` (compiled, type-checked step definitions)
- `@cucumber/html-reporter` (HTML output)

## Layout

```
test/
  features/security/         # Gherkin feature files
  step-definitions/          # Step implementations (one file per feature)
  support/                   # World, hooks, ApiClient, payload builders
  fixtures/                  # Static payloads and test data
  reports/                   # Generated cucumber + junit output
  cucumber.json              # Cucumber config
  playwright.config.ts       # Playwright config
  tsconfig.json              # TypeScript config
  package.json
```

## Install

```bash
cd test
npm install
npx playwright install --with-deps chromium
```

> `--with-deps` is required on a fresh machine to install the system libraries
> Chromium needs. The suite only uses `playwright.request` (HTTP), so a browser
> binary is technically optional — but installing it keeps `playwright.config.ts`
> usable if browser-driven tests are added later.

## Run

| Command | Purpose |
| --- | --- |
| `npm test` | Run the full BDD suite (requires app on :8080) |
| `npm run test:smoke` | Dry-run: parse + match steps, no HTTP calls |
| `npm run tsc:check` | `tsc --noEmit` — type-check the TS sources |
| `npm run test:report` | Regenerate the standalone HTML report from `reports/cucumber-json` |

Reports land in `test/reports/`:

- `cucumber-report.html` — Cucumber HTML formatter output
- `cucumber-junit.xml` — JUnit XML for CI
- `playwright-html/` — Playwright HTML report (kept for parity)

## Target environment

The suite expects the Spring Boot app running on `http://localhost:8080`.
Override with `BASE_URL=http://my-host:8080 npm test` (the value is read by
`support/config.ts` and falls back to the `worldParameters.baseUrl` in
`cucumber.json`).

## Test cases

The BDD specs implement the three API test cases from
`test/testcaseInJson/security_testcases_top3_api_2026-07-12.json`:

| ID | Feature | Endpoint |
| --- | --- | --- |
| SEC-001-API | `deserialization.feature` | `POST /api/deserialize` |
| SEC-002-API | `login_sqli.feature` | `POST /api/login` |
| SEC-003-API | `search_sqli.feature` | `GET /api/search?q=` |

## Notes

- This is the **test** framework, not the host app. It is JS/TS, never
  Cucumber-JVM/Maven — there is intentionally no `pom.xml` under `test/`.
- The `playwright.request` context is shared per scenario via a `World` class
  set up in `support/hooks.ts` and torn down in `After`.
- SQLi and deserialization payloads are built programmatically in
  `support/payloads.ts` so the test never depends on hand-crafted JSON strings.
