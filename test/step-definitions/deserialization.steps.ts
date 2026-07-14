/**
 * SEC-001-API: Unsafe Java deserialization in /api/deserialize.
 *
 * The endpoint's negative cases are pure HTTP (no auth, no body parser
 * tricks), so all of them use the common steps. The "magic bytes"
 * payload is built programmatically in `support/payloads.ts` so the
 * Gherkin stays declarative.
 */
import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { SecurityWorld } from '../support/world';
import {
  base64GadgetPayload,
  benignMapPayload,
  polymorphicJacksonPayload,
} from '../support/payloads';

When(
  'I POST a base64 ysoserial-style gadget payload to {string} as {string}',
  async function (this: SecurityWorld, url: string, contentType: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': contentType },
      data: base64GadgetPayload(),
    });
  },
);

When(
  'I POST a polymorphic Jackson probe to {string}',
  async function (this: SecurityWorld, url: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': 'application/json' },
      data: polymorphicJacksonPayload(),
    });
  },
);

When(
  'I POST a benign Map to {string}',
  async function (this: SecurityWorld, url: string) {
    await this.client.post(url, {
      headers: { 'Content-Type': 'application/json' },
      data: benignMapPayload(),
    });
  },
);

Then(
  'the response body should not echo any Java class name',
  function (this: SecurityWorld) {
    // Heuristic: if the response contains a Java FQCN (a `package.Class`
    // pattern with a lowercase package prefix), flag it.
    const javaFqcn = /\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.[A-Z][A-Za-z0-9_$]*\b/;
    assert.ok(
      !javaFqcn.test(this.lastResponseBody),
      `response body contains a Java FQCN — got: ${this.lastResponseBody.slice(0, 256)}`,
    );
  },
);
