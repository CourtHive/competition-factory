import { canonicalJson } from '@Tools/canonicalJson';
import { createHash } from 'crypto';

/**
 * `sha256:<hex>` over the RFC 8785 canonical text of a value. Lives in the test harness, not in
 * `src/tools`, because the published bundle must stay browser-safe and this needs node's crypto.
 *
 * **Version-blind.** Every mutation stamps the factory's `version` (read from `package.json`) onto the
 * record's `factory` attribute, so a hash over the raw record moved whenever the version did, and
 * nothing in the behaviour had. `dev`'s `package.json` lagged `master`'s (7.1.0 against 7.4.0), and the
 * checkpoint merging the two failed `verify:corpus-manifest` on twelve scenarios for that alone; every
 * release-please PR would have done the same. The stamp's `version` and `createdVersion` (stamped at
 * creation since 2026-10-06) are left out of the hashed text, as the corpus already pins the clock and
 * the random source. The patches still carry them: they are the record as written.
 */
export function canonicalHash(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(withoutFactoryVersion(value)))
    .digest('hex')}`;
}

/** The canonical object form: key order canonical, `undefined` gone. What patches are computed over. */
export function canonicalObject<T = unknown>(value: unknown): T {
  return JSON.parse(canonicalJson(value)) as T;
}

/**
 * The root record with the factory stamp's versions removed — whether the stamp is the first-class
 * `factory` attribute or, in a legacy record, an extension named `factory`. Nothing below the root is
 * touched, and nothing else in the stamp: its `timeStamp` is pinned by the corpus clock.
 */
export function withoutFactoryVersion(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record: any = value;
  const stampsAVersion = (stamp: any) =>
    !!stamp && typeof stamp === 'object' && ('version' in stamp || 'createdVersion' in stamp);
  const firstClass = stampsAVersion(record.factory);
  const extension = record.extensions?.some?.(
    (entry: any) => entry?.name === 'factory' && stampsAVersion(entry?.value),
  );
  if (!firstClass && !extension) return value;

  const { version: _firstClassVersion, createdVersion: _firstClassCreated, ...factory } = record.factory ?? {};
  return {
    ...record,
    ...(firstClass ? { factory } : {}),
    ...(extension
      ? {
          extensions: record.extensions.map((entry: any) => {
            if (entry?.name !== 'factory' || !entry?.value || typeof entry.value !== 'object') return entry;
            const { version: _extensionVersion, createdVersion: _extensionCreated, ...rest } = entry.value;
            return { ...entry, value: rest };
          }),
        }
      : {}),
  };
}
