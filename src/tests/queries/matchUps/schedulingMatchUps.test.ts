import { getSchedulingMatchUps } from '@Query/matchUps/scheduling/getSchedulingMatchUps';
import { getIndividualParticipantIds } from '@Query/matchUp/getIndividualParticipantIds';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { legacyMode } from '@Tests/testHarness/legacyMode';
import { describe, expect, it } from 'vitest';

// constants
import { generatedDrawTypes } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 * The scheduling projection is the hydration, as a scheduler reads it: for every generated draw type, fresh, part
 * played and fully played, for doubles, TEAM, qualifying and scheduled draws, each matchUp `getSchedulingMatchUps`
 * returns carries exactly the fields a scheduler reads of the matchUp `allCompetitionMatchUps({ nextMatchUps: true })`
 * returns, and the two return the same matchUps.
 */
const sizes: { [drawType: string]: number } = { LADDER: 8, PAGE_PLAYOFF: 8, ADAPTIVE: 8, SWISS: 8 };

const READ = [
  'matchUpId',
  'drawId',
  'eventId',
  'tournamentId',
  'structureId',
  'containerStructureId',
  'stage',
  'stageSequence',
  'roundNumber',
  'roundPosition',
  'matchUpType',
  'matchUpFormat',
  'matchUpStatus',
  'winningSide',
  'winnerMatchUpId',
  'loserMatchUpId',
  'drawPositions',
  'collectionId',
  'hasContext',
] as const;
const SCHEDULE = ['scheduledDate', 'scheduledTime', 'courtId', 'venueId', 'courtOrder', 'endTime', 'startTime', 'lock'];

function read(matchUp: any) {
  const picked: Record<string, unknown> = {};
  for (const key of READ) picked[key] = matchUp[key];
  picked.schedule = Object.fromEntries(SCHEDULE.map((key) => [key, matchUp.schedule?.[key]]));
  picked.sides = matchUp.sides?.map(({ participantId, bye, qualifier, sideNumber }: any) => ({
    participantId,
    sideNumber,
    qualifier,
    bye,
  }));
  picked.participants = getIndividualParticipantIds(matchUp);
  return canonicalJson(picked);
}

/** with and without the next matchUps: the grid reads the first, the overnight rest warnings the second */
function compare(tournamentRecord: any) {
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  let count = 0;
  for (const nextMatchUps of [true, false]) {
    const hydrated = allCompetitionMatchUps({ tournamentRecords, inContext: true, nextMatchUps }).matchUps ?? [];
    const projected = getSchedulingMatchUps({ tournamentRecords, nextMatchUps });
    const byId = new Map(projected.map((matchUp) => [matchUp.matchUpId, matchUp]));
    expect(projected.length).toEqual(hydrated.length);
    for (const matchUp of hydrated) expect(read(byId.get(matchUp.matchUpId))).toEqual(read(matchUp));
    count = hydrated.length;
  }
  return count;
}

describe('the scheduling projection is the hydration a scheduler reads', () => {
  const generated: string[] = [];
  it.each(generatedDrawTypes)('%s, fresh, part played and fully played', (drawType) => {
    for (const completionGoal of [0, 3, undefined]) {
      let tournamentRecord: any;
      try {
        ({ tournamentRecord } = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawType, drawSize: sizes[drawType] ?? 16, completionGoal }],
          completeAllMatchUps: completionGoal !== 0,
          randomWinningSide: true,
        }));
      } catch {
        continue;
      }
      if (!tournamentRecord?.events?.[0]?.drawDefinitions?.length) continue;
      compare(tournamentRecord);
      generated.push(`${drawType}:${completionGoal}`);
    }
  });

  it('generated enough draw shapes to mean something', () => {
    expect(generated.length).toBeGreaterThanOrEqual(45);
  });

  it('doubles, whose sides are read through the pair', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, eventType: DOUBLES, completionGoal: 6 }],
      completeAllMatchUps: true,
    });
    expect(compare(tournamentRecord)).toBeGreaterThan(0);
  });

  it('TEAM draws, which the structural index does not cover, through their own hydration', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: TEAM_EVENT }, { drawSize: 16 }],
      completeAllMatchUps: true,
    });
    expect(compare(tournamentRecord)).toBeGreaterThan(0);
  });

  it('qualifying into main and a round robin with playoff', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 16, qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }] },
        { drawSize: 8, drawType: 'ROUND_ROBIN_WITH_PLAYOFF' },
      ],
    });
    compare(tournamentRecord);
  });

  it('scheduled matchUps: dates, times, courts and court orders', scheduledMatchUps);
});

// the schedule written as timeItems, which hydration reads as the schedule
legacyMode('the scheduling projection reads a stored schedule', () => {
  it('scheduled matchUps, their schedule in timeItems', scheduledMatchUps);
});

function scheduledMatchUps() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 32 }, { drawSize: 16, eventType: DOUBLES }],
    startDate: '2026-03-02',
    endDate: '2026-03-04',
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const matchUpDetails = matchUps.slice(0, 12).map(({ matchUpId, drawId }: any, index: number) => ({
    schedule: {
      scheduledTime: index % 3 ? `2026-03-02T${10 + (index % 5)}:00` : undefined,
      courtOrder: index % 2 ? undefined : (index % 4) + 1,
      courtId: courts[index % courts.length].courtId,
      venueId: courts[index % courts.length].venueId,
      scheduledDate: '2026-03-02',
    },
    matchUpId,
    drawId,
  }));
  expect(tournamentEngine.bulkScheduleMatchUps({ matchUpDetails }).success).toEqual(true);
  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(compare(tournamentRecord)).toBeGreaterThan(0);
}
