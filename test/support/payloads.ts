/**
 * Payload builders for the three security test cases. Keeping these in
 * one place means the Gherkin stays declarative and the test data is
 * reviewable in a single file.
 */
import { randomUUID } from 'node:crypto';

/**
 * The Java serialization magic header (`\xAC\xED\x00\x05`). A 4-byte
 * sentinel — enough to look like a gadget chain payload to a content-type
 * sniffer but small enough to keep the test deterministic.
 */
export const JAVA_SERIALIZATION_MAGIC: Buffer = Buffer.from([0xac, 0xed, 0x00, 0x05]);

/** Base64-encoded ysoserial-style gadget payload (just the magic header). */
export function base64GadgetPayload(): string {
  return JAVA_SERIALIZATION_MAGIC.toString('base64');
}

/** A polymorphic-deserialization probe — must be rejected by fail-on-unknown-properties. */
export function polymorphicJacksonPayload(): Record<string, string> {
  return {
    '@type': 'java.lang.Runtime',
    cmd: 'calc.exe',
    safe: 'canary',
  };
}

/** Positive control for SEC-001 — a well-formed benign Map. */
export function benignMapPayload(): Record<string, unknown> {
  return {
    safe: 'canary',
    number: 42,
    nested: { k: 'v' },
  };
}

/** SQLi tautology for username field. */
export function sqliTautologyUsername(): { username: string; password: string } {
  return { username: "' OR '1'='1", password: 'anything' };
}

/** UNION-based SQLi probe for username field. */
export function unionProbeUsername(): { username: string; password: string } {
  return { username: "' UNION SELECT 1,2,3,4,5 FROM users--", password: 'x' };
}

/** SQLi tautology in the password field. */
export function sqliTautologyPassword(): { username: string; password: string } {
  return { username: 'alice', password: "' OR '1'='1" };
}

/** A unique tag for log triage — not a security control, just a marker. */
export function uniqueRunId(): string {
  return randomUUID();
}
