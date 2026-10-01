/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * The golden corpus hashes and diffs tournament records across implementations, so two engines
 * that agree on content must produce the same bytes. JCS is the published answer, and Go and Rust
 * both have conforming libraries, which is why the corpus adopts a standard rather than its own
 * rules. The rules, as the RFC states them:
 *
 *   - object keys sorted by UTF-16 code unit (the default JavaScript string order);
 *   - no whitespace;
 *   - strings escaped as ECMAScript `JSON.stringify` escapes them (`"`, `\`, and control
 *     characters below U+0020, with the short forms `\b \t \n \f \r` and lowercase `\u00xx`);
 *   - numbers serialised as ECMAScript `Number::toString`, which `JSON.stringify` already is;
 *   - `null`, `true`, `false` as literals.
 *
 * JSON has no `undefined`, so an `undefined` property is omitted and an `undefined` array
 * element becomes `null`, exactly as `JSON.stringify` does. A non-finite number is refused rather
 * than silently written as `null`: a record with `NaN` in it is a defect, not a value. `toJSON`
 * is honoured, so a `Date` canonicalises as its ISO string.
 *
 * Pure. No dependency. Browser-safe. Hashing is NOT here: SHA-256 needs `node:crypto`, and the
 * published bundle must stay browser-safe, so the corpus writer hashes under the test harness.
 */

export class NonCanonicalValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonCanonicalValueError';
  }
}

// UTF-16 code unit order, as RFC 8785 § 3.2.3 requires: the default JavaScript `<` on strings.
function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NonCanonicalValueError(`non-finite number at ${path}: ${String(value)}`);
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') throw new NonCanonicalValueError(`bigint at ${path} has no JSON form`);
  if (typeof value !== 'object') throw new NonCanonicalValueError(`${typeof value} at ${path} has no JSON form`);

  const withToJSON = value as { toJSON?: (key: string) => unknown };
  if (typeof withToJSON.toJSON === 'function') {
    return serialize(withToJSON.toJSON(path), path);
  }

  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      item === undefined || typeof item === 'function' || typeof item === 'symbol'
        ? 'null'
        : serialize(item, `${path}/${index}`),
    );
    return `[${items.join(',')}]`;
  }

  const record = value as { [key: string]: unknown };
  const keys = Object.keys(record)
    .filter((key) => {
      const item = record[key];
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol';
    })
    .sort(compareCodeUnits);
  const members = keys.map((key) => {
    const childPath = `${path}/${key}`;
    return `${JSON.stringify(key)}:${serialize(record[key], childPath)}`;
  });
  return `{${members.join(',')}}`;
}

/**
 * The canonical JSON text of `value` per RFC 8785.
 *
 * Throws `NonCanonicalValueError` for a value with no JSON form at the top level (`undefined`, a
 * function, a symbol), for a non-finite number anywhere, and for a bigint anywhere.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new NonCanonicalValueError(`${typeof value} at / has no JSON form`);
  }
  return serialize(value, '');
}

/** Parse then re-serialise: the canonical form of any JSON text. */
export function canonicalizeJsonText(text: string): string {
  return canonicalJson(JSON.parse(text) as Json);
}
