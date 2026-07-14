/**
 * Shared assertion helpers. Centralised so step defs stay readable and
 * the error messages are consistent across the three features.
 */
import { strict as assert } from 'node:assert';

export function expectStatus(actual: number, expected: number, label: string): void {
  assert.equal(
    actual,
    expected,
    `[${label}] expected HTTP ${expected}, got ${actual}`,
  );
}

export function expectStatusOneOf(actual: number, allowed: number[], label: string): void {
  assert.ok(
    allowed.includes(actual),
    `[${label}] expected HTTP status in [${allowed.join(', ')}], got ${actual}`,
  );
}

export function expectBodyContains(body: string, needle: string, label: string): void {
  assert.ok(
    body.includes(needle),
    `[${label}] expected body to contain ${JSON.stringify(needle)} — got: ${truncate(body, 256)}`,
  );
}

export function expectBodyNotContains(body: string, needle: string, label: string): void {
  assert.ok(
    !body.includes(needle),
    `[${label}] expected body NOT to contain ${JSON.stringify(needle)} — got: ${truncate(body, 256)}`,
  );
}

export function expectBodyMatchesNone(
  body: string,
  patterns: RegExp[],
  label: string,
): void {
  for (const re of patterns) {
    assert.ok(
      !re.test(body),
      `[${label}] expected body NOT to match ${re} — got: ${truncate(body, 256)}`,
    );
  }
}

export function expectJsonIsArray(value: unknown, label: string): asserts value is unknown[] {
  assert.ok(Array.isArray(value), `[${label}] expected JSON array, got: ${typeof value}`);
}

export function expectJsonHasKey(
  obj: unknown,
  key: string,
  label: string,
): void {
  assert.ok(
    typeof obj === 'object' && obj !== null && key in (obj as Record<string, unknown>),
    `[${label}] expected JSON object to have key ${JSON.stringify(key)} — got: ${JSON.stringify(obj)}`,
  );
}

export function expectJsonArrayLength(value: unknown[], length: number, label: string): void {
  assert.equal(
    value.length,
    length,
    `[${label}] expected array length ${length}, got ${value.length} — payload: ${JSON.stringify(value)}`,
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
