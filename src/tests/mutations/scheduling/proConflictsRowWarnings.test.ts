import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { CONFLICT_MATCHUP_ORDER, CONFLICT_PARTICIPANTS, SCHEDULE_CONFLICT } from '@Constants/scheduleConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * Two corrections to the row issues of `proConflicts` (CA 2026-10-18).
 *
 * 1. An issue cites only the matchUps it clashes with. A participant issue used to cite every matchUp of the clashing
 *    set: a second-round matchUp named the other second-round matchUps and their sources, which none of its
 *    participants can reach.
 * 2. Adjacent rows are an order of play, not a clock. Back to back is a WARNING only when the time between the two
 *    leaves the participants less than recovery (average minutes plus recovery minutes), read from what actually
 *    happened when it is known: the earlier matchUp's endTime or startTime, the later one's startTime or calledAt.
 *
 * The grid: a 16 draw on 4 courts. Row 1 holds R1 #1–4, row 2 R1 #5–8, row 3 R2 #1–4, court by court, so R2 #3 and
 * R2 #4 follow their sources in the adjacent row. SET3-S:6/TB7 singles on the default policy: 90 minutes, 60 recovery.
 */

const DATE = '2026-06-01';

type Placement = { roundNumber: number; roundPosition: number; row: number; court: number; schedule?: any };

function grid({ placements, localTimeZone }: { placements: Placement[]; localTimeZone?: string }) {
  tournamentEngine.reset();
  const {
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawId: 'd1', drawSize: 16 }],
    tournamentAttributes: localTimeZone ? { localTimeZone } : undefined,
    startDate: DATE,
    endDate: DATE,
    setState: true,
  });
  const courtIds = tournamentEngine.findVenue({ venueId }).venue.courts.map(({ courtId }) => courtId);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: ['d1'] } });
  const idOf = (roundNumber: number, roundPosition: number) =>
    matchUps.find((m) => m.roundNumber === roundNumber && m.roundPosition === roundPosition).matchUpId;

  for (const { roundNumber, roundPosition, row, court, schedule } of placements) {
    const result = tournamentEngine.addMatchUpScheduleItems({
      matchUpId: idOf(roundNumber, roundPosition),
      schedule: { venueId, courtId: courtIds[court - 1], courtOrder: row, scheduledDate: DATE, ...schedule },
      drawId: 'd1',
    });
    expect(result.success).toEqual(true);
  }

  const hydrated = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { scheduledDate: DATE },
    nextMatchUps: true,
    inContext: true,
  }).matchUps;
  const issues = Object.values(tournamentEngine.proConflicts({ matchUps: hydrated }).rowIssues).flat() as any[];
  const issueOf = (roundNumber: number, roundPosition: number) =>
    issues.find((issue) => issue.matchUpId === idOf(roundNumber, roundPosition));
  const cited = (roundNumber: number, roundPosition: number) =>
    [...(issueOf(roundNumber, roundPosition)?.issueIds ?? [])].sort((a, b) => a.localeCompare(b));
  const ids = (...pairs: [number, number][]) => pairs.map(([r, p]) => idOf(r, p)).sort((a, b) => a.localeCompare(b));

  return { issues, issueOf, cited, ids };
}

/** The three rows, each matchUp on its own court; `times` gives each row's scheduled time. */
function threeRows(times: (string | undefined)[] = [], schedules: Record<string, any> = {}): Placement[] {
  const placements: Placement[] = [];
  const rows: [number, number][][] = [
    [1, 2, 3, 4].map((p) => [1, p]),
    [5, 6, 7, 8].map((p) => [1, p]),
    [1, 2, 3, 4].map((p) => [2, p]),
  ];
  rows.forEach((row, index) =>
    row.forEach(([roundNumber, roundPosition], courtIndex) =>
      placements.push({
        schedule: {
          ...(times[index] && { scheduledTime: times[index] }),
          ...schedules[`${roundNumber}-${roundPosition}`],
        },
        court: courtIndex + 1,
        row: index + 1,
        roundPosition,
        roundNumber,
      }),
    ),
  );
  return placements;
}

describe('an issue cites only the matchUps it clashes with', () => {
  it('back to back: a second-round matchUp cites its own sources, not the other matchUps of the rows', () => {
    const { cited, ids, issueOf } = grid({ placements: threeRows() });

    // untimed, so nothing clears the warnings
    expect(issueOf(2, 3)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(cited(2, 3)).toEqual(ids([1, 5], [1, 6]));
    expect(issueOf(2, 4)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(cited(2, 4)).toEqual(ids([1, 7], [1, 8]));
  });

  it('same row: a participant conflict cites the matchUps its participants also play, not every clash in the row', () => {
    tournamentEngine.reset();
    const {
      venueIds: [venueId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'rr', drawSize: 8, drawType: ROUND_ROBIN }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });
    const courtIds = tournamentEngine.findVenue({ venueId }).venue.courts.map(({ courtId }) => courtId);
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const playing = (participantId: string) =>
      matchUps.filter((m) => m.sides.some((side) => side.participantId === participantId));

    // two matchUps of one participant from each group, all four on row 1
    const [groupA, groupB] = [...new Set<string>(matchUps.map((m) => m.structureId))];
    const firstOf = (structureId: string) => matchUps.find((m) => m.structureId === structureId).sides[0].participantId;
    const [a1, a2] = playing(firstOf(groupA));
    const [b1, b2] = playing(firstOf(groupB));
    [a1, a2, b1, b2].forEach(({ matchUpId }, index) =>
      tournamentEngine.addMatchUpScheduleItems({
        schedule: { venueId, courtId: courtIds[index], courtOrder: 1, scheduledDate: DATE },
        drawId: 'rr',
        matchUpId,
      }),
    );

    const hydrated = tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true }).matchUps;
    const issues = Object.values(tournamentEngine.proConflicts({ matchUps: hydrated }).rowIssues).flat() as any[];
    const issueOf = (matchUpId: string) => issues.find((issue) => issue.matchUpId === matchUpId);

    for (const [matchUp, other] of [
      [a1, a2],
      [a2, a1],
      [b1, b2],
      [b2, b1],
    ]) {
      expect(issueOf(matchUp.matchUpId)?.issue).toEqual(SCHEDULE_CONFLICT);
      expect(issueOf(matchUp.matchUpId)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
      expect(issueOf(matchUp.matchUpId)?.issueIds).toEqual([other.matchUpId]);
    }
  });

  it('a source in the previous row on another court is warned of, though the other source shares the court', () => {
    // R2 #4 is on court 4 with its source R1 #8; its other source R1 #7 played on court 3
    const { issues, ids } = grid({ placements: threeRows() });
    const orderWarnings = issues.filter((issue) => issue.issueType === CONFLICT_MATCHUP_ORDER);
    expect(orderWarnings.map(({ matchUpId }) => matchUpId).sort((a, b) => a.localeCompare(b))).toEqual(
      ids([1, 5], [1, 6], [1, 7]),
    );
  });
});

describe('back to back is a warning only when short of recovery', () => {
  const rowIssues = (issueOf: (r: number, p: number) => any) => [1, 2, 3, 4].map((p) => issueOf(2, p));

  it('scheduled times that leave average plus recovery clear the warnings', () => {
    // row 2 at 10:00 is free at 11:30 and recovered at 12:30
    const { issues } = grid({ placements: threeRows(['08:00', '10:00', '12:30']) });
    expect(issues).toEqual([]);
  });

  it('scheduled times short of recovery keep them', () => {
    const { issueOf, cited, ids } = grid({ placements: threeRows(['08:00', '10:00', '12:29']) });
    expect(rowIssues(issueOf).map((issue) => issue?.issueType)).toEqual([
      undefined,
      undefined,
      CONFLICT_PARTICIPANTS,
      CONFLICT_PARTICIPANTS,
    ]);
    expect(cited(2, 3)).toEqual(ids([1, 5], [1, 6]));
  });

  it('a later startTime on the earlier matchUp brings the warning back', () => {
    // R1 #5 started at 11:30, so it is free at 13:00 and recovered at 14:00
    const { issueOf, cited, ids } = grid({
      placements: threeRows(['08:00', '10:00', '13:00'], { '1-5': { startTime: '11:30' } }),
    });
    expect(issueOf(2, 3)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(cited(2, 3)).toEqual(ids([1, 5]));
    expect(issueOf(2, 4)).toBeUndefined();
  });

  it('an endTime is read before the projection from the start', () => {
    // started late but finished at 11:50: recovered at 12:50
    const { issues } = grid({
      placements: threeRows(['08:00', '10:00', '13:00'], { '1-5': { startTime: '11:30', endTime: '11:50' } }),
    });
    expect(issues).toEqual([]);
  });

  it('an earlier startTime on the later matchUp brings the warning back', () => {
    const { issueOf, cited, ids } = grid({
      placements: threeRows(['08:00', '10:00', '13:00'], { '2-3': { startTime: '12:00' } }),
    });
    expect(issueOf(2, 3)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(cited(2, 3)).toEqual(ids([1, 5], [1, 6]));
  });

  it('an early calledAt on the later matchUp brings the warning back when the zone is known', () => {
    // 15:45 UTC is 11:45 in New York (EDT), before R1 #5 and R1 #6 are recovered
    const called = { '2-3': { calledAt: '2026-06-01T15:45:00.000Z' } };
    const zoned = grid({
      placements: threeRows(['08:00', '10:00', '13:00'], called),
      localTimeZone: 'America/New_York',
    });
    expect(zoned.issueOf(2, 3)?.issueType).toEqual(CONFLICT_PARTICIPANTS);
    expect(zoned.cited(2, 3)).toEqual(zoned.ids([1, 5], [1, 6]));

    // the same call at 17:30 UTC is 13:30 local, after both are recovered
    const late = { '2-3': { calledAt: '2026-06-01T17:30:00.000Z' } };
    const lateCall = grid({
      placements: threeRows(['08:00', '10:00', '13:00'], late),
      localTimeZone: 'America/New_York',
    });
    expect(lateCall.issues).toEqual([]);
  });

  it('without a zone a calledAt instant cannot be set against wall clock times, so the plan decides', () => {
    const called = { '2-3': { calledAt: '2026-06-01T11:45:00.000Z' } };
    const { issues } = grid({ placements: threeRows(['08:00', '10:00', '13:00'], called) });
    expect(issues).toEqual([]);
  });
});
