import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';
import { CONFLICT_PARTICIPANTS, SCHEDULE_CONFLICT } from '@Constants/scheduleConstants';

// Main R2 P1 and the consolation matchUp fed by the losers of R1 P1 and R1 P2 share all four R1 participants as
// potentials, yet each of them plays exactly one of the two: a feeder's winner path and loser path are alternatives.
// The pro grid reported them as a participant conflict and would not place them on the same row.

const startDate = '2024-01-15';

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueName: 'V', venueAbbreviation: 'V', courtsCount: 4 }],
    drawProfiles: [{ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP }],
    endDate: '2024-01-20',
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const allMatchUps = () => tournamentEngine.allCompetitionMatchUps({ nextMatchUps: true, inContext: true }).matchUps;
  const matchUps = allMatchUps();
  const firstRound = matchUps
    .filter((matchUp) => matchUp.stage === MAIN && matchUp.roundNumber === 1)
    .sort((a, b) => a.roundPosition - b.roundPosition);
  const secondRound = matchUps.find(
    (matchUp) => matchUp.stage === MAIN && matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );
  const consolation = matchUps.find((matchUp) => matchUp.matchUpId === firstRound[0].loserMatchUpId);

  expect(consolation.stage).toEqual(CONSOLATION);
  expect(firstRound[1].loserMatchUpId).toEqual(consolation.matchUpId);
  expect(firstRound[0].winnerMatchUpId).toEqual(secondRound.matchUpId);
  expect(firstRound[1].winnerMatchUpId).toEqual(secondRound.matchUpId);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  return { allMatchUps, firstRound, secondRound, consolation, courtIds: courts.map(({ courtId }) => courtId) };
}

it('proConflicts reports no participant conflict between a feeder winner path and loser path on one row', () => {
  const { allMatchUps, firstRound, secondRound, consolation, courtIds } = setup();
  const detail = (matchUp, courtOrder, courtId) => ({
    schedule: { courtOrder, courtId, scheduledDate: startDate },
    tournamentId: matchUp.tournamentId,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  let result: any = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      detail(firstRound[0], 1, courtIds[0]),
      detail(firstRound[1], 1, courtIds[1]),
      detail(secondRound, 3, courtIds[0]),
      detail(consolation, 3, courtIds[1]),
    ],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.proConflicts({
    matchUps: allMatchUps().filter((matchUp) => matchUp.schedule?.scheduledDate === startDate),
  });
  const participantConflicts = result.rowIssues
    .flat()
    .filter(
      ({ matchUpId, issue, issueType }) =>
        [secondRound.matchUpId, consolation.matchUpId].includes(matchUpId) &&
        issue === SCHEDULE_CONFLICT &&
        issueType === CONFLICT_PARTICIPANTS,
    );
  expect(participantConflicts).toEqual([]);
});

it('proConflicts still reports a participant who can play two matchUps on one row', () => {
  const { allMatchUps, firstRound, secondRound, courtIds } = setup();
  // R1 P1 feeds R2 P1: its players are certain in one and can reach the other, so they cannot share a row
  const detail = (matchUp, courtId) => ({
    schedule: { courtOrder: 1, courtId, scheduledDate: startDate },
    tournamentId: matchUp.tournamentId,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  let result: any = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [detail(firstRound[0], courtIds[0]), detail(secondRound, courtIds[1])],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.proConflicts({
    matchUps: allMatchUps().filter((matchUp) => matchUp.schedule?.scheduledDate === startDate),
  });
  const conflictedMatchUpIds = result.rowIssues
    .flat()
    .filter(({ issue }) => issue === SCHEDULE_CONFLICT)
    .map(({ matchUpId }) => matchUpId);
  expect(conflictedMatchUpIds).toContain(secondRound.matchUpId);
});

it('proAutoSchedule places a feeder winner path and loser path on the same row', () => {
  const { allMatchUps, firstRound, secondRound, consolation } = setup();
  const pick = (matchUpIds) => allMatchUps().filter(({ matchUpId }) => matchUpIds.includes(matchUpId));

  let result: any = tournamentEngine.proAutoSchedule({
    matchUps: pick([firstRound[0].matchUpId, firstRound[1].matchUpId]),
    scheduledDate: startDate,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.proAutoSchedule({
    matchUps: pick([secondRound.matchUpId, consolation.matchUpId]),
    scheduledDate: startDate,
  });
  expect(result.success).toEqual(true);

  const courtOrder = (matchUpId) => pick([matchUpId])[0].schedule?.courtOrder;
  expect(courtOrder(firstRound[0].matchUpId)).toEqual(1);
  // neither feeds the other and no participant can play both: they were placed a row apart
  expect(courtOrder(secondRound.matchUpId)).toEqual(courtOrder(consolation.matchUpId));
});
