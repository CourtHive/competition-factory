import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { CONFLICT_PARTICIPANTS, SCHEDULE_CONFLICT } from '@Constants/scheduleConstants';
import { FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';

// With participant dependencies reaching the whole draw (G1), the losers of a completed R1 are dependency participants
// of main R2 as well as of the consolation matchUp they were placed in. proColumnResolve keyed rows on those
// participants, so it split two matchUps with four different participants that proConflicts reports as compatible.

const startDate = '2024-01-15';

it('proColumnResolve leaves main R2 and the consolation matchUp on one row when their participants are disjoint', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        outcomes: [
          { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
          { roundNumber: 1, roundPosition: 2, scoreString: '6-1 6-1', winningSide: 1 },
        ],
        drawType: FEED_IN_CHAMPIONSHIP,
        drawSize: 8,
      },
    ],
    venueProfiles: [{ courtsCount: 4 }],
    endDate: '2024-01-20',
    setState: true,
    startDate,
  });
  const [court1, court2] = tournamentEngine.getVenuesAndCourts().courts.map(({ courtId }) => courtId);
  const allMatchUps = () => tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true }).matchUps;

  const matchUps = allMatchUps();
  const firstRound = matchUps
    .filter((matchUp) => matchUp.stage === MAIN && matchUp.roundNumber === 1)
    .sort((a, b) => a.roundPosition - b.roundPosition);
  const secondRound = matchUps.find((matchUp) => matchUp.matchUpId === firstRound[0].winnerMatchUpId);
  const consolation = matchUps.find((matchUp) => matchUp.matchUpId === firstRound[0].loserMatchUpId);
  const sideIds = (matchUp) => matchUp.sides.map(({ participantId }) => participantId).filter(Boolean);
  expect(sideIds(secondRound).length).toEqual(2);
  expect(sideIds(consolation).length).toEqual(2);
  expect(sideIds(secondRound).some((id) => sideIds(consolation).includes(id))).toEqual(false);

  const detail = (matchUp, courtOrder, courtId, scheduledTime) => ({
    schedule: { courtOrder, courtId, scheduledDate: startDate, scheduledTime },
    tournamentId: matchUp.tournamentId,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  let result: any = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      detail(firstRound[0], 1, court1, '09:00'),
      detail(firstRound[1], 1, court2, '09:00'),
      detail(consolation, 2, court1, '11:00'),
      detail(secondRound, 2, court2, '11:00'),
    ],
    scheduleCompletedMatchUps: true,
  });
  expect(result.success).toEqual(true);

  const scheduled = allMatchUps().filter((matchUp) => matchUp.schedule?.scheduledDate === startDate);
  result = tournamentEngine.proConflicts({ matchUps: scheduled });
  const conflicts = result.rowIssues
    .flat()
    .filter(({ issue, issueType }) => issue === SCHEDULE_CONFLICT && issueType === CONFLICT_PARTICIPANTS);
  expect(conflicts).toEqual([]);

  // the resolver agrees with the detector, so it moves nothing
  result = tournamentEngine.proColumnResolve({ scheduledDate: startDate, matchUps: scheduled });
  expect(result.success).toEqual(true);
  expect(result.resolved).toEqual([]);
});
