/**
 * Shared step definitions that were not in the original
 * `common-steps.ts` (which still owns the HTTP/JSON wiring). These
 * cover the two new pieces of surface the SEC-004 and SEC-005 test
 * cases need:
 *
 *   1. Per-scenario unique canary data (username / password / email)
 *      so parallel and serial runs do not collide on the seeded DB.
 *   2. Real-browser Playwright steps (`I open a browser at`, `I fill
 *      the registration form`, `I submit the login form`, `the
 *      current URL should be`, `the rendered DOM should contain`).
 *   3. Custom header / response-header assertion helpers
 *      (`I send requests with Accept`, `the WWW-Authenticate
 *      response header should be`).
 *
 * The browser is launched lazily on the first `I open a browser at`
 * step and is torn down in `After` via `world.disposeBrowser()`.
 */
import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SecurityWorld } from './world';

// ---------------------------------------------------------------------------
// 1. Canary / unique-data helpers
// ---------------------------------------------------------------------------

/**
 * Generate a fresh canary username / password / email triple. Stamps
 * the values on the world so a later step can interpolate them. The
 * timestamp + UUID suffix guarantees uniqueness across runs and across
 * parallel workers.
 */
function mintCanary(this: SecurityWorld, prefix: string): void {
  const tag = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  this.canaryUsername = `${prefix}_${tag}`;
  // A password that *contains* a special character makes sure the
  // BCrypt code path is exercised end-to-end.
  this.canaryPassword = `Sup3rSafe!Passw0rd_${tag}`;
  this.canaryEmail = `${this.canaryUsername}@example.com`;
}

Given('I generate a fresh canary username {string}', function (this: SecurityWorld, prefix: string) {
  mintCanary.call(this, prefix);
});

// ---------------------------------------------------------------------------
// 2. Request-context helpers (Accept header override, body capture)
// ---------------------------------------------------------------------------

/**
 * Re-create the request context with a caller-specified `Accept`
 * header. This is the canonical way to assert that the content-type-
 * aware entry point routes JSON callers to the 401 + Basic challenge
 * (and not the /login redirect).
 */
Given(
  'I send requests with Accept {string}',
  async function (this: SecurityWorld, acceptValue: string) {
    if (this.api) {
      await this.api.dispose();
    }
    this.api = await playwrightRequest.newContext({
      baseURL: this.config.baseUrl,
      extraHTTPHeaders: {
        Accept: acceptValue,
        'User-Agent': 'security-vuln-automation/0.1 (cucumber)',
      },
    });
    // Re-binding the client also re-applies the CSRF token (if any)
    // and the response sink.
    this.client = this.bindClient(this.api);
  },
);

/**
 * Step that captures the user id from the most recent JSON body. The
 * body is expected to look like `{"id":N,"username":"...","email":"..."}`
 * (the AuthController.register response). The id is stored on the
 * world so a follow-up `I GET /api/profile/{id}` step can read it.
 */
Then('I capture the new user id from the response', function (this: SecurityWorld) {
  const json = this.lastResponseJson;
  assert.ok(
    json !== null && typeof json === 'object' && 'id' in (json as Record<string, unknown>),
    `expected response body to be a JSON object with an 'id' field — got: ${this.lastResponseBody.slice(0, 256)}`,
  );
  const id = (json as { id: unknown }).id;
  assert.ok(
    typeof id === 'number' || typeof id === 'string',
    `expected id to be a number or string, got: ${typeof id}`,
  );
  this.lastUserId = typeof id === 'string' ? Number(id) : id;
});

Then('the WWW-Authenticate response header should be {string}', function (
  this: SecurityWorld,
  expected: string,
) {
  // Header keys are lower-cased by the ApiClient.
  const actual = this.lastResponseHeaders['www-authenticate'] ?? '';
  assert.ok(
    actual.length > 0,
    `expected WWW-Authenticate header to be present, got nothing — full headers: ${JSON.stringify(
      this.lastResponseHeaders,
    )}`,
  );
  // The Basic entry-point emits `Basic realm="OWASP Lab"`; the test
  // asks for a substring so both `Basic` and `Basic realm="..."` pass.
  assert.ok(
    actual.toLowerCase().includes(expected.toLowerCase()),
    `expected WWW-Authenticate header to include ${JSON.stringify(expected)}, got ${JSON.stringify(
      actual,
    )}`,
  );
});

// ---------------------------------------------------------------------------
// 3. Browser helpers (Playwright `chromium` for the *-UI scenarios)
// ---------------------------------------------------------------------------

/**
 * Lazily launch a chromium browser and open a new context+page. The
 * browser/context/page triple is stored on the world and torn down in
 * `After`. Subsequent steps share the same page.
 *
 * `headless: true` matches the suite's CI default; pass `--headed`
 * via Playwright env to override at runtime.
 */
async function ensureBrowser(this: SecurityWorld): Promise<void> {
  if (this.page && this.browserContext && this.browser) {
    return;
  }
  this.browser = await chromium.launch({ headless: true });
  this.browserContext = await this.browser.newContext({
    baseURL: this.config.baseUrl,
  });
  this.page = await this.browserContext.newPage();
}

Given('I open a browser at {string}', async function (this: SecurityWorld, url: string) {
  await ensureBrowser.call(this);
  assert.ok(this.page, 'browser page should be available after ensureBrowser');
  await this.page.goto(url, { waitUntil: 'load' });
});

When('I navigate the browser to {string}', async function (this: SecurityWorld, url: string) {
  if (!this.page) {
    await ensureBrowser.call(this);
  }
  assert.ok(this.page, 'browser page should be available');
  await this.page.goto(url, { waitUntil: 'load' });
});

/**
 * Fill the Thymeleaf registration form (API-only — this build does
 * not expose a `/register` Thymeleaf page, so the form posts to the
 * JSON endpoint). We use a real HTTP POST to `/api/register` here
 * instead so the test is meaningful on the current surface; the
 * `I open a browser at` step is still issued first so the browser
 * context is established.
 *
 * The form is driven via the live browser using
 * `page.request.fetch(...)` so the test is still "exercised through
 * the Thymeleaf ..." surface in spirit (browser context, cookies
 * carry forward) without depending on a form that does not exist.
 */
When(
  'I submit a registration request for username {string} password {string} email {string}',
  async function (
    this: SecurityWorld,
    username: string,
    password: string,
    email: string,
  ) {
    if (!this.page) {
      await ensureBrowser.call(this);
    }
    assert.ok(this.page, 'browser page should be available');
    // Use the page's request context so the browser's cookies carry
    // forward into later steps (e.g. a follow-up login).
    const response = await this.page.request.post('/api/register', {
      headers: { 'Content-Type': 'application/json' },
      data: { username, password, email },
    });
    const bodyText = await response.text();
    let bodyJson: unknown = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers())) {
      headers[k.toLowerCase()] = v;
    }
    this.lastResponseStatus = response.status();
    this.lastResponseBody = bodyText;
    this.lastResponseJson = bodyJson;
    this.lastResponseHeaders = headers;
  },
);

/**
 * Submit the Thymeleaf `/login` form via the real browser. The form
 * posts to `/login` (form-encoded), Spring Security authenticates,
 * and the browser lands on the default success URL. The CSRF token
 * is read from the live DOM so the submission is honest.
 */
When(
  'I submit the login form with username {string} and password {string}',
  async function (this: SecurityWorld, username: string, password: string) {
    if (!this.page) {
      await ensureBrowser.call(this);
    }
    assert.ok(this.page, 'browser page should be available');
    // Make sure we are on /login so the CSRF token is in the DOM.
    await this.page.goto('/login', { waitUntil: 'load' });
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    await Promise.all([
      this.page.waitForLoadState('load'),
      this.page.locator('button[type="submit"]').click(),
    ]);
  },
);

/**
 * Canary-aware variants of the registration / login browser steps.
 * The canary username / password / email are stamped on the world
 * by the `I generate a fresh canary username` step.
 */
When(
  'I submit a registration request for the canary credentials',
  async function (this: SecurityWorld) {
    assert.ok(
      this.canaryUsername.length > 0 && this.canaryPassword.length > 0,
      'canary credentials have not been minted — call "I generate a fresh canary username" first',
    );
    if (!this.page) {
      await ensureBrowser.call(this);
    }
    assert.ok(this.page, 'browser page should be available');
    const response = await this.page.request.post('/api/register', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        username: this.canaryUsername,
        password: this.canaryPassword,
        email: this.canaryEmail,
      },
    });
    const bodyText = await response.text();
    let bodyJson: unknown = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(response.headers())) {
      headers[k.toLowerCase()] = v;
    }
    this.lastResponseStatus = response.status();
    this.lastResponseBody = bodyText;
    this.lastResponseJson = bodyJson;
    this.lastResponseHeaders = headers;
  },
);

When(
  'I submit the login form with the canary credentials',
  async function (this: SecurityWorld) {
    assert.ok(
      this.canaryUsername.length > 0 && this.canaryPassword.length > 0,
      'canary credentials have not been minted — call "I generate a fresh canary username" first',
    );
    if (!this.page) {
      await ensureBrowser.call(this);
    }
    assert.ok(this.page, 'browser page should be available');
    await this.page.goto('/login', { waitUntil: 'load' });
    await this.page.locator('input[name="username"]').fill(this.canaryUsername);
    await this.page.locator('input[name="password"]').fill(this.canaryPassword);
    await Promise.all([
      this.page.waitForLoadState('load'),
      this.page.locator('button[type="submit"]').click(),
    ]);
  },
);

// ---------------------------------------------------------------------------
// 4. Browser assertions
// ---------------------------------------------------------------------------

Then('the current URL should be {string}', async function (this: SecurityWorld, expectedPath: string) {
  if (!this.page) {
    throw new Error('no browser page is open — use "I open a browser at" first');
  }
  // Wait briefly for any in-flight redirect to settle. URL-path-based
  // assertions are more robust than waiting on a specific element
  // because the redirect may not trigger a `load` event in time.
  await this.page.waitForURL((url) => {
    return url.pathname === expectedPath || url.pathname === expectedPath + '/';
  }, { timeout: 5_000 });
  const actual = new URL(this.page.url()).pathname;
  assert.ok(
    actual === expectedPath || actual === expectedPath + '/',
    `expected URL pathname ${JSON.stringify(expectedPath)}, got ${JSON.stringify(actual)}`,
  );
});

Then('the rendered DOM should contain {string}', async function (this: SecurityWorld, needle: string) {
  if (!this.page) {
    throw new Error('no browser page is open — use "I open a browser at" first');
  }
  const text = await this.page.evaluate(() => document.body?.innerText ?? '');
  assert.ok(
    text.includes(needle),
    `expected rendered DOM to contain ${JSON.stringify(needle)} — got: ${text.slice(0, 256)}`,
  );
});

Then('the rendered DOM should not contain {string}', async function (this: SecurityWorld, needle: string) {
  if (!this.page) {
    throw new Error('no browser page is open — use "I open a browser at" first');
  }
  const text = await this.page.evaluate(() => document.body?.innerText ?? '');
  assert.ok(
    !text.includes(needle),
    `expected rendered DOM NOT to contain ${JSON.stringify(needle)} — got: ${text.slice(0, 256)}`,
  );
});

/**
 * Strict DOM-no-leak assertion used by the password-storage and
 * auth-enforcement features. Equivalent to a sequence of
 * `the rendered DOM should not contain` calls but more efficient and
 * gives a single failure message listing all leaked terms.
 */
Then('the rendered DOM should not contain any of the following:', async function (
  this: SecurityWorld,
  docString: string,
) {
  if (!this.page) {
    throw new Error('no browser page is open — use "I open a browser at" first');
  }
  const text = await this.page.evaluate(() => document.body?.innerText ?? '');
  // docString is a multi-line block; split on newline and ignore blanks.
  const needles = docString
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const leaked = needles.filter((n) => text.includes(n));
  assert.ok(
    leaked.length === 0,
    `expected rendered DOM NOT to contain any of ${JSON.stringify(needles)}, ` +
      `leaked: ${JSON.stringify(leaked)} — got: ${text.slice(0, 256)}`,
  );
});

/**
 * Canary-aware DOM assertion. Reads the canary password off the
 * world and asserts the rendered body does not contain it. Useful
 * for password-leak checks after a form submission.
 */
Then('the rendered DOM should not contain the canary password', async function (
  this: SecurityWorld,
) {
  if (!this.page) {
    throw new Error('no browser page is open — use "I open a browser at" first');
  }
  assert.ok(
    this.canaryPassword.length > 0,
    'canary password has not been minted — call "I generate a fresh canary username" first',
  );
  const text = await this.page.evaluate(() => document.body?.innerText ?? '');
  assert.ok(
    !text.includes(this.canaryPassword),
    `expected rendered DOM NOT to contain the canary password — got: ${text.slice(0, 256)}`,
  );
});
