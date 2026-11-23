import { getParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { getDayLoad } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';
import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// Constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_QF, MAIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TOTAL } from '@Constants/scheduleConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

// The daily limit rule (CA, 2026-10-16): a participant's load for a day is every matchUp they are certain to play plus
// the longest CHAIN of matchUps they can only potentially play. A feeder's winner path and loser path are alternatives,
// not a sum; a run of rounds on one day is a chain and every round of it counts.

const venueId = 'venue1';
const day1 = '2025-01-01';
const day2 = '2025-01-02';

function setup({
  drawType,
  policyDefinitions,
  dailyLimits,
}: {
  drawType?: any;
  policyDefinitions?: any;
  dailyLimits?: any;
}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 17, venueId }],
    drawProfiles: [{ drawSize: 16, drawType }],
    endDate: '2025-01-03',
    policyDefinitions,
    startDate: day1,
  });
  competitionEngine.setState(tournamentRecord);
  if (dailyLimits) {
    const result: any = competitionEngine.setMatchUpDailyLimits({ dailyLimits });
    expect(result.success).toEqual(true);
  }

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
  const roundMatchUps = (stage, roundNumber) =>
    competitionEngine
      .allCompetitionMatchUps({ inContext: true })
      .matchUps.filter((matchUp) => matchUp.stage === stage && matchUp.roundNumber === roundNumber);
  const scheduledOn = (scheduleDate, stage, roundNumber) =>
    roundMatchUps(stage, roundNumber).filter((matchUp) => matchUp.schedule?.scheduledDate === scheduleDate).length;

  return { addRound, roundMatchUps, scheduledOn, drawId, tournamentId };
}

describe('daily limits count the matchUps a participant can actually play', () => {
  it('schedules consolation R1 beside main R2: no R1 player can play both', () => {
    const { addRound, scheduledOn } = setup({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT, // SINGLES limit 2
      drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
    });
    addRound(day1, MAIN, 1);
    addRound(day1, MAIN, 2);
    addRound(day1, CONSOLATION, 1);
    const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
    expect(result.success).toEqual(true);

    expect(scheduledOn(day1, MAIN, 2)).toEqual(4);
    // R1 plus EITHER main R2 OR consolation R1 is 2; both paths were summed to 3, which left 0 of 4 scheduled
    expect(scheduledOn(day1, CONSOLATION, 1)).toEqual(4);
  });

  it('counts the participants of a feeder scheduled on an earlier date', () => {
    const dailyLimits = { [SINGLES]: 2, [TOTAL]: 2 };

    // control: R1, R2 and R3 on one day; a player who wins R1 and R2 would play 3
    let context = setup({ dailyLimits });
    [1, 2, 3].forEach((roundNumber) => context.addRound(day1, MAIN, roundNumber));
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
    expect(result.success).toEqual(true);
    expect(context.scheduledOn(day1, MAIN, 3)).toEqual(0);

    // R1 on day 1, unscored; R2, R3 and R4 on day 2: a finalist would play 3 on day 2
    context = setup({ dailyLimits });
    context.addRound(day1, MAIN, 1);
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
    expect(result.success).toEqual(true);
    [2, 3, 4].forEach((roundNumber) => context.addRound(day2, MAIN, roundNumber));
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day2] });
    expect(result.success).toEqual(true);

    expect(context.scheduledOn(day2, MAIN, 2)).toEqual(4);
    expect(context.scheduledOn(day2, MAIN, 3)).toEqual(2);
    // R4 was booked: day 2 counted nobody for R2 and R4 because their feeders were not scheduled on day 2
    expect(context.scheduledOn(day2, MAIN, 4)).toEqual(0);
  });

  it('a completed feeder sends only its winner on and only its loser to the consolation', () => {
    const { addRound, roundMatchUps, scheduledOn, drawId, tournamentId } = setup({
      dailyLimits: { [SINGLES]: 2, [TOTAL]: 3 },
      drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
    });
    addRound(day1, MAIN, 1);
    addRound(day1, MAIN, 2);
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
    expect(result.success).toEqual(true);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      matchUpStatus: COMPLETED,
      scoreString: '6-1 6-1',
      winningSide: 1,
    });
    for (const { matchUpId } of roundMatchUps(MAIN, 1)) {
      result = competitionEngine.setMatchUpStatus({ outcome, matchUpId, drawId, tournamentId });
      expect(result.success).toEqual(true);
    }

    addRound(day1, CONSOLATION, 1);
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day1] });
    expect(result.success).toEqual(true);

    // each consolation R1 player lost main R1 today: 2 matchUps, within the limit
    expect(roundMatchUps(CONSOLATION, 1).every((matchUp) => matchUp.sides.every((side) => side.participantId))).toEqual(
      true,
    );
    expect(result.overLimitMatchUpIds[day1]).toEqual([]);
    expect(scheduledOn(day1, CONSOLATION, 1)).toEqual(4);
  });
});

describe('getDayLoad', () => {
  // R1 feeds R2 (winner) and C1 (loser); R2 feeds R3
  const reachability: any = {
    upstream: { R1: new Set(), R2: new Set(['R1']), C1: new Set(['R1']), R3: new Set(['R1', 'R2']), X: new Set() },
    matchUps: {},
  };
  const entry = (matchUpId, certain, drawId = 'draw') => ({ matchUpId, drawId, certain, matchUpType: SINGLES });

  it('counts certain matchUps and the longest chain of potential ones', () => {
    const dayMatchUps = [entry('R1', true), entry('R2', false), entry('C1', false), entry('R3', false)];
    // R1, then R2 and R3: the consolation is the alternative to R2, not an addition
    expect(getDayLoad({ reachability, dayMatchUps })).toEqual(3);
    expect(getDayLoad({ reachability, dayMatchUps: dayMatchUps.slice(0, 3) })).toEqual(2);
  });

  it('counts an actual matchUp after a potential one in the same draw', () => {
    // a potential matchUp counted earlier used to stop the participant's later ACTUAL matchUps in the draw counting
    expect(getDayLoad({ reachability, dayMatchUps: [entry('R2', false), entry('X', true)] })).toEqual(2);
  });

  it('adds the loads of separate draws', () => {
    const dayMatchUps = [entry('R2', false), entry('C1', false), entry('R2', false, 'other')];
    expect(getDayLoad({ reachability, dayMatchUps })).toEqual(2);
  });
});

describe('getParticipantReachability', () => {
  it('a feeder loser is not a potential participant of the matchUp the feeder winner has reached', () => {
    const matchUps: any[] = [
      {
        matchUpId: 'R1',
        winningSide: 1,
        winnerMatchUpId: 'R2',
        sides: [{ participantId: 'A' }, { participantId: 'B' }],
      },
      { matchUpId: 'R1b', winnerMatchUpId: 'R2', sides: [{ participantId: 'C' }, { participantId: 'D' }] },
      { matchUpId: 'R2', sides: [{ participantId: 'A' }, {}] },
    ];
    const { matchUps: reachability } = getParticipantReachability({ matchUps });
    expect(reachability.R2.certain).toEqual(['A']);
    // B lost a completed feeder; C and D are still one matchUp away
    expect([...reachability.R2.potential].sort((a, b) => a.localeCompare(b))).toEqual(['C', 'D']);
  });
});
