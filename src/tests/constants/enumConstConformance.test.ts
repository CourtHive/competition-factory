import * as drawDefinitionConstants from '@Constants/drawDefinitionConstants';
import * as matchUpStatusConstants from '@Constants/matchUpStatusConstants';
import * as participantConstants from '@Constants/participantConstants';
import * as entryStatusConstants from '@Constants/entryStatusConstants';
import * as bookingTypeConstants from '@Constants/bookingTypeConstants';
// The exported OBJECTS — what consumers reach via factoryConstants, maintained by
// hand and therefore able to lag the enum even when the namespace cannot.
import { matchUpStatusConstants as matchUpStatusObject } from '@Constants/matchUpStatusConstants';
import { bookingTypeConstants as bookingTypeObject } from '@Constants/bookingTypeConstants';
import { entryStatusConstants as entryStatusObject } from '@Constants/entryStatusConstants';
import { weekdayConstants as weekdayObject } from '@Constants/weekdayConstants';
import { surfaceConstants as surfaceObject } from '@Constants/surfaceConstants';
import { participantConstants as participantObject } from '@Constants/participantConstants';
import { genderConstants as genderObject } from '@Constants/genderConstants';
import { drawDefinitionConstants as drawDefinitionObject } from '@Constants/drawDefinitionConstants';
import * as weekdayConstants from '@Constants/weekdayConstants';
import * as surfaceConstants from '@Constants/surfaceConstants';
import * as genderConstants from '@Constants/genderConstants';
import * as T from '@Types/tournamentTypes';
import { describe, it, expect } from 'vitest';

/**
 * Enum ↔ const-module conformance guard (Layer 1).
 *
 * factory now value-exports the `*Enum`s from `src/types/tournamentTypes.ts`
 * (runtime, e.g. `MatchUpStatusEnum.COMPLETED`) IN ADDITION to the runtime string
 * values in `src/constants/*`. For the concepts that have BOTH, that is two runtime
 * sources of the same strings — this guard makes divergence a CI failure so the two
 * can be maintained safely.
 *
 * Two invariants, matching how the constants surface is actually shaped:
 *  - MIRRORS: a const module whose string exports are a DEDICATED 1:1 image of an
 *    enum — assert exact key AND value parity in both directions.
 *  - COVERAGE: an enum whose members live inside a BROADER const bucket (e.g. stage
 *    / structure / seeding all sit in drawDefinitionConstants) — assert every enum
 *    VALUE is backed by a const value in that bucket (no enum member without a const).
 *
 * Enums with NO const twin are enum-only (a single source — nothing to guard); they
 * are listed in ENUM_ONLY so the coverage is explicit and adding a new enum forces a
 * deliberate "mirror, bucket, or enum-only?" decision here.
 *
 * The COMPILE-TIME twin (Layer 2) lives in `src/constants/enumConstConformance.ts`
 * (this test file is excluded from `check-types`, so type assertions here would be dead).
 */

const stringEntries = (mod: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(mod)) if (typeof v === 'string') out[k] = v;
  return out;
};
const enumEntries = (e: Record<string, unknown>): Record<string, string> => stringEntries(e);
const valuesOf = (mod: Record<string, unknown>): Set<string> => new Set(Object.values(stringEntries(mod)));

// ── Dedicated 1:1 mirrors — exact key + value parity ─────────────────────────
const MIRRORS: {
  name: string;
  enum: Record<string, unknown>;
  consts: Record<string, unknown>;
  object: Record<string, unknown>;
}[] = [
  { name: 'MatchUpStatus', enum: T.MatchUpStatusEnum, consts: matchUpStatusConstants, object: matchUpStatusObject },
  { name: 'EntryStatus', enum: T.EntryStatusEnum, consts: entryStatusConstants, object: entryStatusObject },
  { name: 'SurfaceCategory', enum: T.SurfaceCategoryEnum, consts: surfaceConstants, object: surfaceObject },
  { name: 'Weekday', enum: T.WeekdayEnum, consts: weekdayConstants, object: weekdayObject },
  { name: 'BookingType', enum: T.BookingTypeEnum, consts: bookingTypeConstants, object: bookingTypeObject },
];

// ── Bucket coverage — every enum value backed by a const value in the bucket ──
const COVERAGE: {
  name: string;
  enum: Record<string, unknown>;
  consts: Record<string, unknown>;
  object: Record<string, unknown>;
}[] = [
  { name: 'StageType', enum: T.StageTypeEnum, consts: drawDefinitionConstants, object: drawDefinitionObject },
  { name: 'StructureType', enum: T.StructureTypeEnum, consts: drawDefinitionConstants, object: drawDefinitionObject },
  { name: 'SeedingProfile', enum: T.SeedingProfileEnum, consts: drawDefinitionConstants, object: drawDefinitionObject },
  {
    name: 'FinishingPosition',
    enum: T.FinishingPositionEnum,
    consts: drawDefinitionConstants,
    object: drawDefinitionObject,
  },
  { name: 'ParticipantType', enum: T.ParticipantTypeEnum, consts: participantConstants, object: participantObject },
  { name: 'Sex', enum: T.SexEnum, consts: genderConstants, object: genderObject },
];

// Enum-only: no const-module twin (single source of truth — nothing to reconcile).
// Listed so a newly-added enum can't silently skip the mirror/bucket decision above.
const ENUM_ONLY = [
  'AddressTypeEnum',
  'BallTypeEnum',
  'CountryCodeEnum',
  'CourtPositionEnum',
  'DrawTypeEnum',
  'LengthUnitEnum',
  'LinkTypeEnum',
  'OnlineResourceTypeEnum',
  'ParticipantRoleEnum',
  'ParticipantStatusEnum',
  'PenaltyTypeEnum',
  'PlayingDoubleHandCodeEnum',
  'PlayingHandCodeEnum',
  'PositioningProfileEnum',
  'ShotDetailEnum',
  'ShotOutcomeEnum',
  'ShotTypeEnum',
  'TournamentLevelEnum',
  'WheelchairClassEnum',
  'WinReasonEnum',
];

describe('enum ↔ const conformance guard', () => {
  describe.each(MIRRORS)('$name (dedicated mirror)', ({ enum: e, consts }) => {
    const en = enumEntries(e);
    const co = stringEntries(consts);

    it('the enum and its const module share the exact same keys', () => {
      expect(Object.keys(en).sort()).toEqual(Object.keys(co).sort());
    });

    it('every shared key maps to the same value in both', () => {
      for (const key of Object.keys(en)) expect(co[key]).toBe(en[key]);
    });
  });

  describe.each(COVERAGE)('$name (bucket coverage)', ({ enum: e, consts }) => {
    it('every enum value is backed by a const value in the bucket', () => {
      const bucket = valuesOf(consts);
      const missing = Object.values(enumEntries(e)).filter((v) => !bucket.has(v));
      expect(missing).toEqual([]);
    });
  });

  it('every value-exported enum is accounted for (mirror, bucket, or enum-only)', () => {
    // registry display names are the enum export names minus the `Enum` suffix.
    const accounted = new Set([
      ...MIRRORS.map((m) => `${m.name}Enum`),
      ...COVERAGE.map((c) => `${c.name}Enum`),
      ...ENUM_ONLY,
    ]);
    // every real enum object exported from tournamentTypes must be accounted for above,
    // so a newly-added enum forces a deliberate mirror/bucket/enum-only decision here.
    const allEnums = Object.keys(T).filter((k) => {
      const v = (T as any)[k];
      return k.endsWith('Enum') && v && typeof v === 'object' && Object.values(v).some((x) => typeof x === 'string');
    });
    const unaccounted = allEnums.filter((name) => !accounted.has(name));
    expect({ unaccounted }).toEqual({ unaccounted: [] });
  });
});

/**
 * OBJECT coverage — the surface consumers actually reach.
 *
 * Everything above compares an enum against the module NAMESPACE, which
 * `export * from './<name>Values'` fills in automatically, so it cannot lag the
 * enum. The hand-authored `<name>Constants` object is a different surface, and it
 * is the one exposed as `factoryConstants.<name>Constants`. Guarding only the
 * namespace let `entryStatusConstants.REGISTERED` ship as `undefined` in 6.16.0
 * and 6.17.0 — the enum had it, the module re-exported it, the object omitted it,
 * and every guard stayed green.
 */
describe('enum ↔ exported OBJECT conformance', () => {
  it.each(MIRRORS)('$name: every enum member is present on the exported object', ({ enum: e, object }) => {
    const missing = Object.keys(enumEntries(e)).filter((k) => !(k in object));
    expect(missing).toEqual([]);
  });

  it.each(MIRRORS)('$name: enum values match the exported object values', ({ enum: e, object }) => {
    const mismatched = Object.entries(enumEntries(e))
      .filter(([k]) => k in object)
      .filter(([k, v]) => object[k] !== v)
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it.each(COVERAGE)('$name: every enum value is reachable on the exported bucket object', ({ enum: e, object }) => {
    const values = valuesOf(object);
    const missing = Object.values(enumEntries(e)).filter((v) => !values.has(v));
    expect(missing).toEqual([]);
  });
});
