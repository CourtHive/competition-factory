import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// Constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_QF, MAIN } from '@Constants/drawDefinitionConstants';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

// https://github.com/CourtHive/competition-factory/issues/5481
// A participant already placed in a matchUp scheduled on an earlier date (here the player who received a BYE)
// is only a POTENTIAL participant of the matchUps that matchUp feeds: they reach the main SF or the consolation
// feed, never both. Treating them as certain for both booked them into the SF and delayed the consolation matchUp.

const venueId = 'venue1';
const startDate = '2025-01-01';
const secondDate = '2025-01-02';

function setup(participantsCount: number) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount, drawType: FEED_IN_CHAMPIONSHIP_TO_QF }],
    venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 17, venueId }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    endDate: '2025-01-03',
    startDate,
  });

  competitionEngine.setState(tournamentRecord);

  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  const structureId = (stage) => structures.find((structure) => structure.stage === stage).structureId;

  const addRound = (scheduleDate, stage, roundNumber) => {
    const result: any = competitionEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId: structureId(stage), roundNumber },
      scheduleDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  };

  return { addRound };
}

function roundScheduledTimes(stage, roundNumber) {
  const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
  return matchUps
    .filter((matchUp) => matchUp.stage === stage && matchUp.roundNumber === roundNumber)
    .sort((a, b) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0))
    .map(({ schedule }) => schedule?.scheduledTime);
}

describe('a participant known from a matchUp on an earlier date is a potential, not an actual, booking', () => {
  it.each([16, 15])('schedules each date with its own call: %s entrants', (participantsCount) => {
    const { addRound } = setup(participantsCount);

    addRound(startDate, MAIN, 1);
    addRound(startDate, MAIN, 2);
    addRound(startDate, CONSOLATION, 1);
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    addRound(secondDate, MAIN, 3);
    addRound(secondDate, CONSOLATION, 2);
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [secondDate] });
    expect(result.success).toEqual(true);

    expect(roundScheduledTimes(MAIN, 3)).toEqual(['08:00', '08:00']);
    expect(roundScheduledTimes(CONSOLATION, 2)).toEqual(['08:00', '08:00', '08:00', '08:00']);
  });

  it.each([16, 15])('schedules both dates in one call: %s entrants', (participantsCount) => {
    const { addRound } = setup(participantsCount);

    addRound(startDate, MAIN, 1);
    addRound(startDate, MAIN, 2);
    addRound(startDate, CONSOLATION, 1);
    addRound(secondDate, MAIN, 3);
    addRound(secondDate, CONSOLATION, 2);

    const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate, secondDate] });
    expect(result.success).toEqual(true);

    expect(roundScheduledTimes(MAIN, 3)).toEqual(['08:00', '08:00']);
    expect(roundScheduledTimes(CONSOLATION, 2)).toEqual(['08:00', '08:00', '08:00', '08:00']);
  });
});
