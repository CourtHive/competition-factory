/**
 * Enum ↔ const-module conformance — COMPILE-TIME guard (Layer 2).
 *
 * The runtime bidirectional key+value check lives in
 * `src/tests/constants/enumConstConformance.test.ts`. This is its compile-time twin:
 * for each dedicated mirror, EVERY enum member must have a same-named export in its
 * const module — a missing one is a `check-types` (tsc) failure, caught earlier than
 * the test run. Only the KEY is asserted here (works with the current `any`-typed const
 * values); tightening the const value types later would let a compile-time VALUE check
 * be added too. Bucket modules use different const key names, so their coverage stays
 * runtime-only.
 *
 * This module is intentionally NOT imported anywhere: it is type-only (no runtime
 * output) and unreachable from the package entry, so it is type-checked by `tsc` but
 * tree-shaken out of the build. The value imports below are used only in `typeof`.
 * Only the four dedicated 1:1 mirrors are asserted here — the bucket modules use
 * different const key names, so their coverage is enforced only by the runtime guard.
 */
import * as matchUpStatusConstants from './matchUpStatusConstants';
import * as entryStatusConstants from './entryStatusConstants';
import * as weekdayConstants from './weekdayConstants';
import * as surfaceConstants from './surfaceConstants';
import { MatchUpStatusEnum, EntryStatusEnum, SurfaceCategoryEnum, WeekdayEnum } from '@Types/tournamentTypes';

// enum member names not present as a const export in the module (must be empty).
type EnumMembersMissingConst<E, M> = Exclude<keyof E, keyof M>;
// true on full coverage; on a gap, an error object that violates the `extends true`
// constraint below so tsc reports exactly which enum member has no const.
type Mirrored<E, M> = [EnumMembersMissingConst<E, M>] extends [never]
  ? true
  : { __ENUM_MEMBER_HAS_NO_CONST__: EnumMembersMissingConst<E, M> };
type Assert<T extends true> = T;

export type _AssertMatchUpStatus = Assert<Mirrored<typeof MatchUpStatusEnum, typeof matchUpStatusConstants>>;
export type _AssertEntryStatus = Assert<Mirrored<typeof EntryStatusEnum, typeof entryStatusConstants>>;
export type _AssertSurfaceCategory = Assert<Mirrored<typeof SurfaceCategoryEnum, typeof surfaceConstants>>;
export type _AssertWeekday = Assert<Mirrored<typeof WeekdayEnum, typeof weekdayConstants>>;
