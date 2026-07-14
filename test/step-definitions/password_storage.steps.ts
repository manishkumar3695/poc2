/**
 * SEC-004 — Plain-text password storage. The feature file emits
 * "with the canary credentials" and "with username/password" steps
 * that need to be wired against the world's per-scenario canary
 * values (`canaryUsername`, `canaryPassword`, `canaryEmail`) and the
 * captured user id (`lastUserId`).
 *
 * The HTTP wiring itself lives in `support/common-steps.ts`; this
 * file only adds the canary-aware helpers. The browser-side steps
 * live in `support/browser-steps.ts` (shared) and the per-feature
 * `auth_enforcement.steps.ts` is intentionally empty because the
 * auth-enforcement feature uses only common steps.
 */
import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { SecurityWorld } from '../support/world';

When(
  'I POST {string} with the canary credentials',
  async function (this: SecurityWorld, url: string) {
    assert.ok(
      this.canaryUsername.length > 0 && this.canaryPassword.length > 0,
      'canary credentials have not been minted — call "I generate a fresh canary username" first',
    );
    await this.client.post(url, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        username: this.canaryUsername,
        password: this.canaryPassword,
        email: this.canaryEmail,
      },
    });
  },
);

When(
  'I POST {string} with username {string} and password {string}',
  async function (this: SecurityWorld, url: string, username: string, password: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': 'application/json' },
      data: { username, password },
    });
  },
);

Then('the response body should contain the canary username', function (this: SecurityWorld) {
  assert.ok(
    this.canaryUsername.length > 0,
    'canary username has not been minted — call "I generate a fresh canary username" first',
  );
  assert.ok(
    this.lastResponseBody.includes(this.canaryUsername),
    `expected response body to contain the canary username ${JSON.stringify(
      this.canaryUsername,
    )} — got: ${this.lastResponseBody.slice(0, 256)}`,
  );
});

Then('the response body should not contain the canary password', function (this: SecurityWorld) {
  assert.ok(
    this.canaryPassword.length > 0,
    'canary password has not been minted — call "I generate a fresh canary username" first',
  );
  assert.ok(
    !this.lastResponseBody.includes(this.canaryPassword),
    `expected response body NOT to contain the canary password — got: ${this.lastResponseBody.slice(
      0,
      256,
    )}`,
  );
});

Then('the response body should not contain the canary username', function (this: SecurityWorld) {
  assert.ok(
    this.canaryUsername.length > 0,
    'canary username has not been minted — call "I generate a fresh canary username" first',
  );
  assert.ok(
    !this.lastResponseBody.includes(this.canaryUsername),
    `expected response body NOT to contain the canary username ${JSON.stringify(
      this.canaryUsername,
    )} — got: ${this.lastResponseBody.slice(0, 256)}`,
  );
});

When(
  'I GET {string} with the captured user id',
  async function (this: SecurityWorld, url: string) {
    assert.ok(
      typeof this.lastUserId === 'number',
      'no user id has been captured — call "I capture the new user id from the response" first',
    );
    await this.client.get(`${url}/${this.lastUserId}`);
  },
);
