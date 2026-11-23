import { getSchedulingMatchUps } from '@Query/matchUps/scheduling/getSchedulingMatchUps';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { dateGridRows } from '@Mutate/matchUps/schedule/pipeline/gridRows';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { ABANDONED, BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

/**
 * A date's grid from the scheduling projection is the grid `competitionScheduleMatchUps` returns: the same rows, each
 * cell holding the same matchUp, the same free cells and the same blocked ones. The fixtures put on courts what the
 * grid buckets: matchUps to play, completed, abandoned, BYEs, lines of a dual; some in the same cell, some on the day
 * with no court, and a booking that blocks a cell.
 */
const DAY = '2026-03-02';

function cells(rows: any[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, cell]: [string, any]) => [
        key,
        key === 'rowId'
          ? cell
          : {
              matchUpId: cell?.matchUpId,
              isBlocked: cell?.isBlocked,
              schedule: cell?.matchUpId ? undefined : cell?.schedule,
            },
      ]),
    ),
  );
}

function compare(minCourtGridRows?: number) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  const expected = competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: DAY },
    courtCompletedMatchUps: true,
    withCourtGridRows: true,
    tournamentRecords,
    minCourtGridRows,
  });
  const matchUps = getSchedulingMatchUps({ tournamentRecords });
  const { rows } = dateGridRows({ tournamentRecords, matchUps, scheduledDate: DAY, minCourtGridRows });
  expect(canonicalJson(cells(rows ?? []))).toEqual(canonicalJson(cells(expected.rows ?? [])));
  return (expected.rows as any[]).flatMap((row) => Object.values(row)).filter((cell: any) => cell?.matchUpId).length;
}

/**
 * each matchUp's schedule written into the stored record, as a director's placement leaves it: the write path skips a
 * BYE and a completed matchUp, which a grid must still show when the record holds them on a court
 */
function place(
  matchUps: any[],
  courts: any[],
  { courtOrder, time }: { courtOrder?: (i: number) => number; time?: boolean },
) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const stored = new Map<string, any>();
  for (const event of tournamentRecord.events ?? [])
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? [])
        for (const member of [structure, ...(structure.structures ?? [])])
          for (const matchUp of member.matchUps ?? []) {
            stored.set(matchUp.matchUpId, matchUp);
            for (const tieMatchUp of matchUp.tieMatchUps ?? []) stored.set(tieMatchUp.matchUpId, tieMatchUp);
          }
  matchUps.forEach(({ matchUpId }: any, index: number) => {
    const court = courts[index % courts.length];
    stored.get(matchUpId).schedule = {
      ...(courtOrder ? { courtOrder: courtOrder(index), courtId: court.courtId, venueId: court.venueId } : {}),
      ...(time ? { scheduledTime: `${DAY}T${10 + (index % 6)}:00` } : {}),
      scheduledDate: DAY,
    };
  });
  tournamentEngine.setState(tournamentRecord);
}

describe('a date grid from the scheduling projection is the competition schedule grid', () => {
  it('matchUps to play, completed, abandoned, on the day without a court, two in one cell', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 3, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [
        { drawSize: 32, completionGoal: 6 },
        { drawSize: 16, eventType: DOUBLES },
      ],
      startDate: DAY,
      endDate: DAY,
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    const completed = matchUps.filter(({ matchUpStatus }) => matchUpStatus === COMPLETED);
    const toPlay = matchUps.filter(({ matchUpStatus }) => matchUpStatus !== COMPLETED);
    expect(completed.length).toBeGreaterThan(0);
    place(completed, courts, { courtOrder: (i) => (i % 4) + 1 }); // under matchUps to play: the cell shows the last
    place(toPlay.slice(0, 6), courts, { courtOrder: (i) => (i % 4) + 1, time: true }); // some share a cell
    place(toPlay.slice(6, 17), courts, { time: true }); // on the day, no court: more than the busiest court's rows
    const abandoned = toPlay[17];
    place([abandoned], courts, { courtOrder: () => 5 });
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: ABANDONED },
      matchUpId: abandoned.matchUpId,
      drawId: abandoned.drawId,
    });
    expect(compare()).toBeGreaterThan(5);
    expect(compare(20)).toBeGreaterThan(5);
  });

  it('BYEs and a fed draw', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 2 }],
      drawProfiles: [{ drawSize: 32, participantsCount: 20, drawType: FEED_IN_CHAMPIONSHIP }],
      startDate: DAY,
      endDate: DAY,
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const byes = matchUps.filter(({ matchUpStatus }) => matchUpStatus === BYE);
    expect(byes.length).toBeGreaterThan(0);
    place(byes.slice(0, 4).concat(matchUps.filter(({ matchUpStatus }) => matchUpStatus !== BYE).slice(0, 12)), courts, {
      courtOrder: (i) => i + 1,
    });
    expect(compare()).toBeGreaterThan(0);
  });

  it('lines of a dual, and a booking that blocks a cell', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4 }],
      drawProfiles: [{ drawSize: 4, eventType: TEAM }, { drawSize: 8 }],
      startDate: DAY,
      endDate: DAY,
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    place(matchUps.slice(0, 14), courts, { courtOrder: (i) => (i % 5) + 2 });
    const result = tournamentEngine.addCourtGridBooking({
      courtId: courts[1].courtId,
      bookingType: 'MAINTENANCE',
      scheduledDate: DAY,
      courtOrder: 1,
    });
    expect(result.success).toEqual(true);
    expect(compare()).toBeGreaterThan(0);
  });
});
