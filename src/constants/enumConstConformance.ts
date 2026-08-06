/**
 * Enum ↔ const-module conformance — COMPILE-TIME guard (Layer 2).
 *
 * The runtime bidirectional key+value check lives in
 * `src/tests/constants/enumConstConformance.test.ts`. This is its compile-time twin:
 * for each dedicated mirror it asserts, at `check-types` (tsc) time:
 *   - KEY coverage: every enum member has a same-named const export; and
 *   - VALUE conformance: each such const's literal value equals the enum member's
 *     value (unblocked now the const values are literal-typed — see the (b) pass); and
 *   - OBJECT coverage: every enum member is also present on the exported
 *     `<name>Constants` OBJECT.
 *
 * The object check exists because the two surfaces are NOT the same thing. The
 * module namespace is filled in automatically by `export * from './<name>Values'`,
 * so it can never lag the enum — but consumers reach constants through the
 * hand-authored object literal (`factoryConstants.entryStatusConstants`), and that
 * object is maintained by hand. Guarding only the namespace let
 * `entryStatusConstants.REGISTERED` ship as `undefined` in 6.16.0 and 6.17.0 while
 * this file stayed green; TMX destructured it and silently got `undefined`.
 * Either drift is a compile failure naming the exact member, caught earlier than the
 * runtime test. Bucket modules use different const key names, so their coverage stays
 * runtime-only.
 *
 * This module is intentionally NOT imported anywhere: it is type-only (no runtime
 * output) and unreachable from the package entry, so it is type-checked by `tsc` but
 * tree-shaken out of the build. The value imports below are used only in `typeof`.
 * Only the four dedicated 1:1 mirrors are asserted here — the bucket modules use
 * different const key names, so their coverage is enforced only by the runtime guard.
 */
import * as matchUpStatusConstants from './matchUpStatusConstants';
import * as bookingTypeConstants from './bookingTypeConstants';
import * as entryStatusConstants from './entryStatusConstants';
import * as weekdayConstants from './weekdayConstants';
import * as surfaceConstants from './surfaceConstants';

// The exported OBJECTS — the surface consumers actually reach via factoryConstants.
import { matchUpStatusConstants as matchUpStatusObject } from './matchUpStatusConstants';
import { bookingTypeConstants as bookingTypeObject } from './bookingTypeConstants';
import { entryStatusConstants as entryStatusObject } from './entryStatusConstants';
import { weekdayConstants as weekdayObject } from './weekdayConstants';
import { surfaceConstants as surfaceObject } from './surfaceConstants';
import {
  MatchUpStatusEnum,
  EntryStatusEnum,
  SurfaceCategoryEnum,
  WeekdayEnum,
  BookingTypeEnum,
} from '@Types/tournamentTypes';

type Assert<T extends true> = T;

// ── KEY coverage: every enum member has a same-named const export ─────────────
// A gap surfaces as a non-`never` type that violates the `extends true` constraint,
// so tsc reports exactly which enum member has no const.
type EnumMembersMissingConst<E, M> = Exclude<keyof E, keyof M>;
type KeysMirrored<E, M> = [EnumMembersMissingConst<E, M>] extends [never]
  ? true
  : { __ENUM_MEMBER_HAS_NO_CONST__: EnumMembersMissingConst<E, M> };

export type _KeysMatchUpStatus = Assert<KeysMirrored<typeof MatchUpStatusEnum, typeof matchUpStatusConstants>>;
export type _KeysEntryStatus = Assert<KeysMirrored<typeof EntryStatusEnum, typeof entryStatusConstants>>;
export type _KeysSurfaceCategory = Assert<KeysMirrored<typeof SurfaceCategoryEnum, typeof surfaceConstants>>;
export type _KeysWeekday = Assert<KeysMirrored<typeof WeekdayEnum, typeof weekdayConstants>>;
export type _KeysBookingType = Assert<KeysMirrored<typeof BookingTypeEnum, typeof bookingTypeConstants>>;

// ── VALUE conformance: each const's literal value equals the enum member's value ─
// For enum key K, `${E[K] & string}` is the enum member's string value; the const's
// literal type M[K] must extend it. A mismatch collects K and fails `check-types`.
type ConstValueMismatches<E, M> = {
  [K in keyof E]: K extends keyof M ? (M[K] extends `${E[K] & string}` ? never : K) : never;
}[keyof E];
type ValuesMirrored<E, M> = [ConstValueMismatches<E, M>] extends [never]
  ? true
  : { __CONST_VALUE_MISMATCH__: ConstValueMismatches<E, M> };

export type _ValuesMatchUpStatus = Assert<ValuesMirrored<typeof MatchUpStatusEnum, typeof matchUpStatusConstants>>;
export type _ValuesEntryStatus = Assert<ValuesMirrored<typeof EntryStatusEnum, typeof entryStatusConstants>>;
export type _ValuesSurfaceCategory = Assert<ValuesMirrored<typeof SurfaceCategoryEnum, typeof surfaceConstants>>;
export type _ValuesWeekday = Assert<ValuesMirrored<typeof WeekdayEnum, typeof weekdayConstants>>;
export type _ValuesBookingType = Assert<ValuesMirrored<typeof BookingTypeEnum, typeof bookingTypeConstants>>;

// ── OBJECT coverage: every enum member is also on the exported object ─────────
// Reuses KeysMirrored — the failure surfaces as __ENUM_MEMBER_HAS_NO_CONST__ naming
// the exact member missing from the object literal. This is the check that would
// have caught entryStatusConstants.REGISTERED before it reached consumers.
export type _ObjectMatchUpStatus = Assert<KeysMirrored<typeof MatchUpStatusEnum, typeof matchUpStatusObject>>;
export type _ObjectEntryStatus = Assert<KeysMirrored<typeof EntryStatusEnum, typeof entryStatusObject>>;
export type _ObjectSurfaceCategory = Assert<KeysMirrored<typeof SurfaceCategoryEnum, typeof surfaceObject>>;
export type _ObjectWeekday = Assert<KeysMirrored<typeof WeekdayEnum, typeof weekdayObject>>;
export type _ObjectBookingType = Assert<KeysMirrored<typeof BookingTypeEnum, typeof bookingTypeObject>>;
