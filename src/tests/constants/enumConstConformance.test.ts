import * as drawDefinitionConstants from '@Constants/drawDefinitionConstants';
import * as matchUpStatusConstants from '@Constants/matchUpStatusConstants';
import * as participantConstants from '@Constants/participantConstants';
import * as entryStatusConstants from '@Constants/entryStatusConstants';
import * as bookingTypeConstants from '@Constants/bookingTypeConstants';
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
const MIRRORS: { name: string; enum: Record<string, unknown>; consts: Record<string, unknown> }[] = [
  { name: 'MatchUpStatus', enum: T.MatchUpStatusEnum, consts: matchUpStatusConstants },
  { name: 'EntryStatus', enum: T.EntryStatusEnum, consts: entryStatusConstants },
  { name: 'SurfaceCategory', enum: T.SurfaceCategoryEnum, consts: surfaceConstants },
  { name: 'Weekday', enum: T.WeekdayEnum, consts: weekdayConstants },
  { name: 'BookingType', enum: T.BookingTypeEnum, consts: bookingTypeConstants },
];

// ── Bucket coverage — every enum value backed by a const value in the bucket ──
const COVERAGE: { name: string; enum: Record<string, unknown>; consts: Record<string, unknown> }[] = [
  { name: 'StageType', enum: T.StageTypeEnum, consts: drawDefinitionConstants },
  { name: 'StructureType', enum: T.StructureTypeEnum, consts: drawDefinitionConstants },
  { name: 'SeedingProfile', enum: T.SeedingProfileEnum, consts: drawDefinitionConstants },
  { name: 'FinishingPosition', enum: T.FinishingPositionEnum, consts: drawDefinitionConstants },
  { name: 'ParticipantType', enum: T.ParticipantTypeEnum, consts: participantConstants },
  { name: 'Sex', enum: T.SexEnum, consts: genderConstants },
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
