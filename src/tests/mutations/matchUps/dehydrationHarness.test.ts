import {
  withoutDerivedValues,
  hydrationLeftovers,
  storedMatchUpsOf,
  hydrateRecord,
  matchUpsById,
  canonical,
} from '@Tests/testHarness/dehydration';
import { buildFromSources } from '@Tools/buildFromSources/buildFromSources';
import { dehydrateMatchUps } from '@Mutate/tournaments/dehydrate';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COLLEGE_DEFAULT, DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  ROUND_ROBIN,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * The dehydration harness: every shape below is generated (so its STORED shape is known), hydrated the way query
 * output hydrates, then dehydrated — and the result must be the original.
 *
 * Why it exists. A USTA playtennis capture is the public `getEventData` payload, i.e. hydrated matchUps. On
 * 2026-10-22 a TEAM tournament (121 teams, 2,467 collection matchUps) assembled from one came to 19.7 MB, of which
 * 12.4 MB was each collection matchUp's sides carrying a full copy of the side's participant and team. Neither
 * `buildFromSources` nor `dehydrateMatchUps` looked inside a tie, and the only dehydration test covered single
 * elimination and round robin. These invariants are checked for every shape:
 *
 *   1. dehydrating a canonical (stored-shape) record changes nothing
 *   2. dehydrate(hydrate(record)) equals the record (a value the engine derives anyway counts as absent)
 *   3. dehydration is idempotent
 *   4. no hydration-only key survives, at any depth (tieMatchUps and sides included)
 *   5. the dehydrated record hydrates back to the same matchUps the original does
 */

type Shape = { name: string; drawProfile: Record<string, any>; complete?: boolean; schedule?: boolean };

const SHAPES: Shape[] = [
  { name: 'single elimination, complete', drawProfile: { drawSize: 16 }, complete: true },
  { name: 'single elimination, partial', drawProfile: { drawSize: 8 } },
  { name: 'single elimination with BYEs', drawProfile: { drawSize: 8, participantsCount: 6 }, complete: true },
  { name: 'doubles', drawProfile: { drawSize: 8, eventType: DOUBLES_EVENT }, complete: true },
  { name: 'round robin', drawProfile: { drawSize: 8, drawType: ROUND_ROBIN }, complete: true },
  {
    name: 'round robin with playoff',
    drawProfile: { drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF },
    complete: true,
  },
  {
    name: 'first match loser consolation',
    drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
    complete: true,
  },
  { name: 'compass', drawProfile: { drawSize: 16, drawType: COMPASS }, complete: true },
  {
    name: 'TEAM, college default, complete',
    drawProfile: { drawSize: 4, eventType: TEAM_EVENT, tieFormatName: COLLEGE_DEFAULT },
    complete: true,
  },
  {
    name: 'TEAM, dominant duo, partial',
    drawProfile: { drawSize: 8, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO },
  },
  {
    name: 'TEAM, college default, complete and scheduled',
    drawProfile: { drawSize: 4, eventType: TEAM_EVENT, tieFormatName: COLLEGE_DEFAULT },
    complete: true,
    schedule: true,
  },
  { name: 'single elimination, scheduled', drawProfile: { drawSize: 8 }, complete: true, schedule: true },
];

function generate(shape: Shape) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [shape.drawProfile],
    completeAllMatchUps: shape.complete,
    venueProfiles: [{ courtsCount: 4 }],
    setState: true,
    nonRandom: 1,
  });
  if (shape.schedule) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: false });
    const { venueId } = tournamentRecord.venues[0];
    const scheduled = matchUps.slice(0, 6);
    for (const [i, { matchUpId }] of scheduled.entries()) {
      const schedule = {
        scheduledDate: tournamentRecord.startDate,
        scheduledTime: `${String(8 + i).padStart(2, '0')}:00`,
        venueId,
      };
      const result = tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule });
      expect(result.error).toBeUndefined();
      expect(result.success).toEqual(true);
    }
  }
  return tournamentEngine.getTournament().tournamentRecord;
}

const dehydrated = (record: any) => {
  const copy = structuredClone(record);
  const result = dehydrateMatchUps({ tournamentRecord: copy });
  expect(result.success).toEqual(true);
  return copy;
};

const hydratedMatchUps = (record: any) => {
  tournamentEngine.setState(structuredClone(record));
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return Object.fromEntries(matchUps.map((m: any) => [m.matchUpId, JSON.parse(canonical(m))]));
};

describe.each(SHAPES)('dehydration: $name', (shape) => {
  const record = generate(shape);
  const hydrated = hydrateRecord(record);

  it('the hydrated fixture really is hydrated (guards the harness itself)', () => {
    expect(hydrationLeftovers(hydrated).length).toBeGreaterThan(0);
    expect(hydrationLeftovers(record)).toEqual([]);
  });

  it('1. leaves a canonical record unchanged', () => {
    expect(matchUpsById(dehydrated(record))).toEqual(matchUpsById(record));
  });

  // values the engine derives anyway compare as absent on both sides; 5. proves the engine reads them the same
  it('2. dehydrate(hydrate(record)) equals the record', () => {
    const result = withoutDerivedValues(dehydrated(hydrated));
    expect(matchUpsById(result)).toEqual(matchUpsById(withoutDerivedValues(record)));
  });

  it('3. is idempotent', () => {
    const once = dehydrated(hydrated);
    expect(matchUpsById(dehydrated(once))).toEqual(matchUpsById(once));
  });

  it('4. leaves no hydration-only key at any depth', () => {
    expect(hydrationLeftovers(dehydrated(hydrated))).toEqual([]);
  });

  it('5. the dehydrated record hydrates back to the same matchUps', () => {
    expect(hydratedMatchUps(dehydrated(hydrated))).toEqual(hydratedMatchUps(record));
  });
});

/**
 * The path that produced the 19.7 MB record: `getEventData` (what playtennis serves) assembled by
 * `buildFromSources`. The rebuilt record cannot equal the original — buildFromSources mints its own ids for some
 * things — but it must be canonical: nothing hydration-only, and the same stored keys on every matchUp and side.
 */
describe.each(SHAPES.filter(({ drawProfile }) => drawProfile.eventType === TEAM_EVENT))(
  'buildFromSources(getEventData) output is dehydrated: $name',
  (shape) => {
    const record = generate(shape);
    tournamentEngine.setState(structuredClone(record));
    const eventData = tournamentEngine.getEventData({ eventId: record.events[0].eventId });
    const participants = tournamentEngine.getParticipants();
    const rebuilt = buildFromSources([eventData, participants]).record;

    it('leaves no hydration-only key at any depth', () => {
      expect(hydrationLeftovers(rebuilt)).toEqual([]);
    });

    // What the record MEANS, read through the engine: a rebuilt record is reassembled, so its stored representation
    // may differ (a tie may carry the tieFormat its event no longer does) while every result and participant agrees.
    it('reads back as the same ties, collections, results and participants', () => {
      const meaning = (r: any) => {
        tournamentEngine.setState(structuredClone(r));
        const { matchUps } = tournamentEngine.allTournamentMatchUps();
        return Object.fromEntries(
          matchUps.map((m: any) => [
            m.matchUpId,
            {
              matchUpStatus: m.matchUpStatus,
              winningSide: m.winningSide,
              score: m.score?.scoreStringSide1,
              collectionId: m.collectionId,
              sides: (m.sides ?? []).map((side: any) => [side.sideNumber, side.participantId ?? null]),
            },
          ]),
        );
      };
      const original = meaning(record);
      expect(Object.keys(original).length).toBeGreaterThan(0);
      expect(meaning(rebuilt)).toEqual(original);
    });

    it('is not materially larger than the original record', () => {
      const size = (r: any) => JSON.stringify(r).length;
      expect(size(rebuilt) / size(record)).toBeLessThan(1.5);
    });
  },
);

/**
 * A record assembled from query output can hold its BYEs ONLY on hydrated sides: on 2026-10-22 every one of the
 * 4,008 BYE sides in 759 ingested records sat at a drawPosition with no positionAssignment. Dropping those sides
 * dropped the BYEs. Dehydration moves the fact into positionAssignments first.
 */
describe('dehydration keeps a BYE that only a hydrated side records', () => {
  const record = generate({ name: 'BYEs', drawProfile: { drawSize: 8, participantsCount: 6 }, complete: true });
  const hydrated = hydrateRecord(record);
  const structure = hydrated.events[0].drawDefinitions[0].structures[0];
  const byePositions = structure.positionAssignments.filter((a: any) => a.bye).map((a: any) => a.drawPosition);
  structure.positionAssignments = structure.positionAssignments.filter((a: any) => !a.bye);

  it('the fixture really has BYEs only on its sides', () => {
    expect(byePositions.length).toBeGreaterThan(0);
    const byeSides = storedMatchUpsOf(hydrated).flatMap((m) => (m.sides ?? []).filter((s: any) => s.bye));
    expect(byeSides.length).toEqual(byePositions.length);
  });

  it('restores the BYE assignments and reads back as the original', () => {
    const result = dehydrated(hydrated);
    const restored = result.events[0].drawDefinitions[0].structures[0].positionAssignments;
    expect(
      restored
        .filter((a: any) => a.bye)
        .map((a: any) => a.drawPosition)
        .sort(),
    ).toEqual([...byePositions].sort());
    expect(hydratedMatchUps(result)).toEqual(hydratedMatchUps(record));
  });

  it('never touches a drawPosition that already has an assignment', () => {
    const before = structuredClone(record.events[0].drawDefinitions[0].structures[0].positionAssignments);
    const result = dehydrated(hydrateRecord(record));
    expect(canonical(result.events[0].drawDefinitions[0].structures[0].positionAssignments)).toEqual(canonical(before));
  });
});
