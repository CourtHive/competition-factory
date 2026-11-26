/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: src/fixtures/policies/engineDefaultPolicies.ts
 * Regenerate: pnpm gen:defaults-hash
 * Drift guard: pnpm check:defaults-hash
 */

/**
 * The content hash of the policies the engine falls back to when a record pins none. It changes only when one of
 * those defaults changes, never with the factory version. New tournaments and `attachPolicies` record it, and
 * `getDefaultsDrift` compares a record's stamp with it.
 */
export const defaultsHash = 'e7fc7a008591c04f';

/** The same hash for each policy type the engine has a default for: which defaults a change touched. */
export const defaultsHashes: { readonly [policyType: string]: string } = Object.freeze({
  competitiveBands: 'fae6b4a511bed7ac',
  ladder: 'f1913db96b092291',
  matchUpActions: '6ed2a2c458f84a14',
  participant: '01c470f8ace8b14d',
  positionActions: '1118688ec8e8b53b',
  ratings: '76e09552d7861664',
  roundNaming: '46968e6445377d64',
  scheduling: '1433bae0c31f1a0c',
  seeding: 'd4c78bec36a3d889',
});
