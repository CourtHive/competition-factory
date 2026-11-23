/**
 * Error-code conformance — COMPILE-TIME guard.
 *
 * The runtime checks live in `src/tests/constants/errorCodeUnion.test.ts` and
 * `errorConditionAggregate.test.ts`. Test files are excluded from `tsconfig.json`, so a
 * type assertion written in a test is never checked; this is where the type-level half
 * lives. At `check-types` (tsc) time it asserts:
 *   - `ErrorCode` is CLOSED: a plain `string` is not one, and an unknown code is not one;
 *   - it ADMITS a code from each of the three modules that define errors; and
 *   - the hand-authored `errorConditionConstants` OBJECT lists every error the module
 *     exports — the same drift that shipped `entryStatusConstants.REGISTERED` as
 *     `undefined` (see `enumConstConformance.ts`), and 23 errors before #5151.
 *
 * Like `enumConstConformance.ts`, this module is intentionally NOT imported anywhere: it
 * is type-only, type-checked by `tsc`, and absent from the build.
 */
import type { errorConditionConstants as errorConditionObject } from './errorConditionConstants';
import type * as errorConditionModule from './errorConditionConstants';
import type { ErrorCode } from '@Types/errorCodeTypes';

type Assert<T extends true> = T;

// ── CLOSED: the union did not widen, and an unknown code is not a member ────────
export type _ErrorCodeIsNotString = Assert<string extends ErrorCode ? false : true>;
export type _UnknownCodeIsNotAnErrorCode = Assert<'ERR_NOT_A_CODE' extends ErrorCode ? false : true>;

// ── ADMITS: one code from each defining module, the one-line NOT_FOUND, and unwrap's ─
type OneCodePerSource =
  | 'ERR_MISSING_TOURNAMENT'
  | 'ERR_MISSING_SANCTIONING_RECORD'
  | 'ERR_MISSING_CONFLICT_SOURCE'
  | 'ERR_NOT_FOUND'
  | 'ENGINE_RETURNED_UNDEFINED';
export type _ErrorCodeAdmitsEachModule = Assert<OneCodePerSource extends ErrorCode ? true : false>;

// ── OBJECT coverage: every exported error is on errorConditionConstants ──────────
type ErrorExportNames = {
  [Name in keyof typeof errorConditionModule]: (typeof errorConditionModule)[Name] extends {
    readonly code: string;
    readonly message: string;
  }
    ? Name
    : never;
}[keyof typeof errorConditionModule];
type ErrorsMissingFromObject = Exclude<ErrorExportNames, keyof typeof errorConditionObject>;
export type _EveryErrorIsOnTheObject = Assert<
  [ErrorsMissingFromObject] extends [never] ? true : { __ERROR_MISSING_FROM_OBJECT__: ErrorsMissingFromObject }
>;
