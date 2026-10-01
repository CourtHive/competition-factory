import { canonicalJson } from '@Tools/canonicalJson';
import { createHash } from 'crypto';

/**
 * `sha256:<hex>` over the RFC 8785 canonical text of a value. Lives in the test harness, not in
 * `src/tools`, because the published bundle must stay browser-safe and this needs node's crypto.
 */
export function canonicalHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

/** The canonical object form: key order canonical, `undefined` gone. What patches are computed over. */
export function canonicalObject<T = unknown>(value: unknown): T {
  return JSON.parse(canonicalJson(value)) as T;
}
