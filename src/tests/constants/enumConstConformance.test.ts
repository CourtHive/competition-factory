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
import { eventConstants as eventObject } from '@Constants/eventConstants';
import { tournamentConstants as tournamentObject } from '@Constants/tournamentConstants';
import { venueConstants as venueObject } from '@Constants/venueConstants';
import { disciplineConstants as disciplineObject } from '@Constants/disciplineConstants';
import { drawDefinitionConstants as drawDefinitionObject } from '@Constants/drawDefinitionConstants';
import * as weekdayConstants from '@Constants/weekdayConstants';
import * as surfaceConstants from '@Constants/surfaceConstants';
import * as genderConstants from '@Constants/genderConstants';
import * as eventConstants from '@Constants/eventConstants';
import * as tournamentConstants from '@Constants/tournamentConstants';
import * as venueConstants from '@Constants/venueConstants';
import * as disciplineConstants from '@Constants/disciplineConstants';
import { disciplines } from '@Constants/disciplineConstants';
import { tournamentStatuses } from '@Constants/tournamentConstants';
import { indoorOutdoorTypes } from '@Constants/venueConstants';
import * as T from '@Types/tournamentTypes';
// The generated, drift-guarded enumeration of EVERY enum under src/types — the
// authoritative list. Reading it here means the registry and the value-export
// generator cannot disagree, and a new enum in ANY types file is covered.
import * as ALL_ENUMS from '@Types/enumExports';
import * as E from '@Types/enumExports';
import * as officiatingConstants from '@Constants/officiatingConstants';
import * as sanctioningConstants from '@Constants/sanctioningConstants';
import { officiatingConstants as officiatingObject } from '@Constants/officiatingConstants';
import { sanctioningConstants as sanctioningObject } from '@Constants/sanctioningConstants';
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
  { name: 'Gender', enum: T.GenderEnum, consts: genderConstants, object: genderObject },
  { name: 'EventType', enum: T.EventTypeEnum, consts: eventConstants, object: eventObject },
  { name: 'TournamentStatus', enum: T.TournamentStatusEnum, consts: tournamentConstants, object: tournamentObject },
  { name: 'IndoorOutdoor', enum: T.IndoorOutdoorEnum, consts: venueConstants, object: venueObject },
  { name: 'Discipline', enum: T.DisciplineEnum, consts: disciplineConstants, object: disciplineObject },
  { name: 'AssignmentStatus', enum: E.AssignmentStatusEnum, consts: officiatingConstants, object: officiatingObject },
  {
    name: 'CertificationStatus',
    enum: E.CertificationStatusEnum,
    consts: officiatingConstants,
    object: officiatingObject,
  },
  { name: 'EvaluationStatus', enum: E.EvaluationStatusEnum, consts: officiatingConstants, object: officiatingObject },
  {
    name: 'SanctioningStatus',
    enum: E.SanctioningStatusEnum,
    consts: sanctioningConstants,
    object: sanctioningObject,
  },
];

// Enum-only: no const-module twin (single source of truth — nothing to reconcile).
// Listed so a newly-added enum can't silently skip the mirror/bucket decision above.
const ENUM_ONLY = [
  'AddressTypeEnum',
  // no const-module twin: weight units are used only on the equipment types
  'WeightUnitEnum',
  // LEVEL has no const module; AGE/BOTH live in eventConstants but the set is not covered
  'CategoryEnum',
  // Sport lives with the competition-format types and has no const-module twin.
  'SportEnum',
  // The officiating + sanctioning engines carry these vocabularies as const-object
  // enums in src/types with NO value-carrying twin in src/constants — verified
  // per-enum, not assumed: the four that ARE fully carried by officiatingConstants /
  // sanctioningConstants are registered as buckets below instead.
  'CertificationFamilyEnum',
  'CertificationLevelEnum',
  'OfficialRoleSubtypeEnum',
  'ScoringMethodEnum',
  'ScoringTypeEnum',
  'AmendmentSeverityEnum',
  'AmendmentStatusEnum',
  'ComplianceItemStatusEnum',
  'ComplianceItemTypeEnum',
  'ComplianceStatusEnum',
  'EndorsementStatusEnum',
  'SanctioningRelationshipEnum',
  // its values are matchUp-status strings reused for a DIFFERENT concept (draw-level
  // aggregate play state), so pinning it to matchUpStatusConstants would assert a
  // relationship that does not exist
  'DrawStatusEnum',
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
  // tieFormatConstants is a bucket of NAMED TIE FORMATS (COLLEGE_DEFAULT, LAVER_CUP, ...); the
  // score-source vocabulary is a different concept that happens to be declared on the same object,
  // so it is carried by the value-exported enum alone rather than pinned to that bucket
  'TieScoreSourceEnum',
  // tier MOVEMENT is a derived vocabulary (promotion/relegation between seasons) with no
  // const-module twin — the tier systems themselves are free-form federation strings
  'TierMovementEnum',
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
    // Sourced from the generated enumExports module, NOT from tournamentTypes and NOT
    // by name suffix. Both of those were real holes: the registry used to read only
    // tournamentTypes, so SportEnum (in competitionFormat.ts) was covered by nothing;
    // and it filtered on `endsWith('Enum')`, so an enum named without the suffix walked
    // straight past. Shape is the test now — a string-valued object — and coverage
    // follows whatever the drift-guarded generator found.
    const allEnums = Object.keys(ALL_ENUMS).filter((k) => {
      const v = (ALL_ENUMS as any)[k];
      return v && typeof v === 'object' && Object.values(v).some((x) => typeof x === 'string');
    });
    expect(allEnums.length).toBeGreaterThan(50); // tripwire: the import must resolve
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

  /**
   * The REGISTERED bug in reverse. Object coverage above is enum→object only, so a
   * key on the object that no enum member backs — `entryStatusConstants.PROVISIONAL`
   * say — used to ship freely as a real string that its own Union rejects.
   *
   * Restricted to string-valued keys on purpose: the mirror objects also carry curated
   * groupings (entryStatusConstants has five `*_STATUSES` arrays) which are legitimately
   * not enum members.
   */
  it.each(MIRRORS)('$name: the exported object has no key the enum does not back', ({ enum: e, object }) => {
    const enumKeys = new Set(Object.keys(enumEntries(e)));
    const phantom = Object.entries(object)
      .filter(([, v]) => typeof v === 'string')
      .map(([k]) => k)
      .filter((k) => !enumKeys.has(k));
    expect(phantom).toEqual([]);
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

/**
 * Enums that mirror an exported `as const` TUPLE.
 *
 * These unions used to be derived from the tuple directly — `(typeof x)[number]` —
 * so the two could not disagree. Now that the union derives from the enum, the
 * tuple is a second source for the same vocabulary and CAN drift. Both remain
 * public surface (courthive-facilities imports indoorOutdoorTypes), so both are
 * pinned to each other here.
 */
describe('enum ↔ backing tuple parity', () => {
  const PAIRS: { name: string; enum: Record<string, unknown>; tuple: readonly string[] }[] = [
    { name: 'TournamentStatus', enum: T.TournamentStatusEnum, tuple: tournamentStatuses },
    { name: 'IndoorOutdoor', enum: T.IndoorOutdoorEnum, tuple: indoorOutdoorTypes },
    { name: 'Discipline', enum: T.DisciplineEnum, tuple: disciplines },
  ];

  it.each(PAIRS)('$name: enum values and tuple entries are the same set', ({ enum: e, tuple }) => {
    expect(Object.values(enumEntries(e)).sort()).toEqual([...tuple].sort());
  });
});
