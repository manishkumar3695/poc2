/**
 * Common step definitions reused across feature files. These handle
 * "Given the app is reachable" / "When I POST ..." wiring so each
 * feature file's own step defs stay focused on assertions.
 *
 * Note: the `request` context is created in `support/hooks.ts` from
 * `cucumber.json`'s `worldParameters.baseUrl`. To override per scenario,
 * see the `With baseUrl "..."` step — it re-creates the context.
 *
 * CSRF note: the remediated Spring Boot app enforces CSRF on
 * state-changing endpoints that are reached through an authenticated
 * session (Spring Security 6 default with `IF_REQUIRED`). The fix here
 * is to (a) authenticate via HTTP Basic on every request, then
 * (b) hit a browser surface (e.g. /dashboard) once to mint a JSESSIONID
 * + CSRF token pair, then (c) attach the CSRF token as `X-CSRF-TOKEN`
 * on subsequent POSTs. The `I am authenticated for state-changing
 * requests as "user:pass"` step does all three.
 */
import { Given, When, Then, IWorld } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { request as playwrightRequest } from '@playwright/test';
import { SecurityWorld } from './world';
import {
  expectBodyContains,
  expectBodyNotContains,
  expectStatus,
  expectStatusOneOf,
} from './assertions';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

Given(
  'the vulnerable Spring Boot app is reachable with baseUrl {string}',
  async function (this: SecurityWorld, baseUrl: string) {
    // The `Before` hook already created an api with the configured baseURL.
    // If the scenario passes a different baseURL, dispose and re-create;
    // otherwise leave the existing context alone.
    const desired = baseUrl.replace(/\/+$/, '');
    if (this.config.baseUrl === desired && this.api) {
      return;
    }
    if (this.api) {
      await this.api.dispose();
    }
    this.api = await playwrightRequest.newContext({
      baseURL: desired,
      extraHTTPHeaders: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'security-vuln-automation/0.1 (cucumber)',
      },
    });
    this.client = this.bindClient(this.api);
  },
);

async function mintCsrfToken(this: SecurityWorld, basicAuth: string): Promise<string> {
  // Hit a browser surface that renders a Thymeleaf form. The form's
  // hidden `_csrf` field is the token the server will accept on the
  // next POST as `X-CSRF-TOKEN`. The same request also mints the
  // JSESSIONID cookie that subsequent POSTs need.
  const encoded = Buffer.from(basicAuth, 'utf8').toString('base64');
  const init: Parameters<typeof this.api.get>[1] = {
    headers: {
      Authorization: `Basic ${encoded}`,
      Accept: 'text/html, */*',
    },
    failOnStatusCode: false,
  };
  const resp = await this.api.get('/dashboard', init);
  if (!resp.ok()) {
    throw new Error(
      `failed to mint CSRF token: GET /dashboard returned ${resp.status()} — ` +
        `is the app running and the credentials correct?`,
    );
  }
  const html = await resp.text();
  const match = /name="_csrf"\s+value="([^"]+)"/.exec(html);
  if (!match) {
    throw new Error(
      `GET /dashboard did not return a _csrf field — CSRF may be disabled ` +
        `on the running build, or the response was not a Thymeleaf page.`,
    );
  }
  return match[1];
}

Given('the previous response status was {int}', function (this: SecurityWorld, expected: number) {
  expectStatus(this.lastResponseStatus, expected, 'previous response');
});

When(
  'I POST {string} as {string} with body:',
  async function (this: SecurityWorld, url: string, contentType: string, body: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': contentType },
      data: body,
    });
  },
);

When(
  'I POST {string} with JSON body:',
  async function (this: SecurityWorld, url: string, body: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
  },
);

When('I GET {string}', async function (this: SecurityWorld, url: string) {
  await this.client.get(url);
});

Then('the response status should be {int}', function (this: SecurityWorld, expected: number) {
  expectStatus(this.lastResponseStatus, expected, 'current response');
});

Then(
  'the response status should be one of {int}, {int}, {int}',
  function (this: SecurityWorld, a: number, b: number, c: number) {
    expectStatusOneOf(this.lastResponseStatus, [a, b, c], 'current response');
  },
);

Then(
  'the response status should be one of {int}, {int}',
  function (this: SecurityWorld, a: number, b: number) {
    expectStatusOneOf(this.lastResponseStatus, [a, b], 'current response');
  },
);

Then('the response body should contain {string}', function (this: SecurityWorld, needle: string) {
  expectBodyContains(this.lastResponseBody, needle, 'current response');
});

Then('the response body should not contain {string}', function (this: SecurityWorld, needle: string) {
  expectBodyNotContains(this.lastResponseBody, needle, 'current response');
});

Then('the response body should not match {string}', function (this: SecurityWorld, pattern: string) {
  // Accept either a raw pattern (`Hibernate|SQL|ORA-`) or a /.../flags
  // literal. Gherkin's `{string}` strips the wrapping quotes, so by the
  // time we see it the leading/trailing `/` are typically gone.
  let re: RegExp;
  const delimited = /^\/(.+)\/([a-z]*)$/.exec(pattern);
  if (delimited) {
    re = new RegExp(delimited[1], delimited[2]);
  } else if (/[.*+?^$()[\]{}|\\]/.test(pattern)) {
    re = new RegExp(pattern, 'i');
  } else {
    re = new RegExp(escapeRegex(pattern), 'i');
  }
  assert.ok(
    !re.test(this.lastResponseBody),
    `[current response] expected body NOT to match ${re} — got: ${this.lastResponseBody.slice(0, 256)}`,
  );
});

Then('the response body should match a JSON array of length {int}', function (
  this: SecurityWorld & IWorld,
  length: number,
) {
  assert.ok(
    Array.isArray(this.lastResponseJson),
    `expected JSON array, got: ${typeof this.lastResponseJson} body=${this.lastResponseBody.slice(0, 200)}`,
  );
  assert.equal(
    (this.lastResponseJson as unknown[]).length,
    length,
    `expected array length ${length}, got ${(this.lastResponseJson as unknown[]).length}`,
  );
});

Given(
  'I am authenticated as {string}',
  async function (this: SecurityWorld, basicAuth: string) {
    const encoded = Buffer.from(basicAuth, 'utf8').toString('base64');
    // We re-create the request context so the header sticks for every
    // subsequent request in this scenario. This is for read-only / GET
    // endpoints; state-changing POSTs need a CSRF token, which the
    // `I am authenticated for state-changing requests as` step below
    // also mints.
    if (this.api) {
      await this.api.dispose();
    }
    this.api = await playwrightRequest.newContext({
      baseURL: this.config.baseUrl,
      extraHTTPHeaders: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Basic ${encoded}`,
        'User-Agent': 'security-vuln-automation/0.1 (cucumber)',
      },
    });
    this.csrfToken = undefined;
    this.client = this.bindClient(this.api);
  },
);

Given(
  'I am authenticated for state-changing requests as {string}',
  async function (this: SecurityWorld, basicAuth: string) {
    const encoded = Buffer.from(basicAuth, 'utf8').toString('base64');
    if (this.api) {
      await this.api.dispose();
    }
    this.api = await playwrightRequest.newContext({
      baseURL: this.config.baseUrl,
      extraHTTPHeaders: {
        Accept: 'application/json, text/plain, */*',
        Authorization: `Basic ${encoded}`,
        'User-Agent': 'security-vuln-automation/0.1 (cucumber)',
      },
    });
    this.csrfToken = await mintCsrfToken.call(this, basicAuth);
    this.client = this.bindClient(this.api);
  },
);
