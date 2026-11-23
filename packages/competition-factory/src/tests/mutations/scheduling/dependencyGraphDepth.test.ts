import { getParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { timeStringMinutes } from '@Tools/dateTime';
import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// Constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const venueId = 'venue1';
const startDate = '2025-01-01';

describe('getMatchUpDependencies participant dependencies reach the whole draw (G1)', () => {
  it('a final depends on every participant of an unplayed draw of 8', () => {
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }], setState: true });
    const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
    const { matchUpDependencies } = competitionEngine.getMatchUpDependencies({ includeParticipantDependencies: true });

    const final = matchUps.find(({ roundNumber }) => roundNumber === 3);
    expect(matchUpDependencies[final.matchUpId].matchUpIds.length).toEqual(6);
    // a matchUp's own participants replaced the ones its sources had pushed onto it, so the final had none
    expect(new Set(matchUpDependencies[final.matchUpId].participantIds).size).toEqual(8);
  });

  it('the reachability model still leaves out a participant eliminated by a completed matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 8, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 }] },
      ],
      setState: true,
    });
    expect(tournamentRecord).toBeDefined();
    const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true, nextMatchUps: true });
    const { matchUpDependencies } = competitionEngine.getMatchUpDependencies({
      includeParticipantDependencies: true,
      matchUps,
    });
    const reachability = getParticipantReachability({ matchUpDependencies, matchUps });

    const firstMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 1);
    expect(firstMatchUp.matchUpStatus).toEqual(COMPLETED);
    const loserId = firstMatchUp.sides.find(({ sideNumber }) => sideNumber !== firstMatchUp.winningSide).participantId;
    const final = matchUps.find(({ roundNumber }) => roundNumber === 3);

    expect(matchUpDependencies[final.matchUpId].participantIds).toContain(loserId);
    expect(reachability.matchUps[final.matchUpId].potential).not.toContain(loserId);
    expect(reachability.matchUps[final.matchUpId].potential.length).toEqual(7);
  });
});

describe('a qualifier position depends on the qualifying round that fills it (G2)', () => {
  function setup(policyDefinitions) {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          qualifyingProfiles: [{ roundTarget: 1, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
          drawSize: 16,
        },
      ],
      venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 17, venueId }],
      endDate: '2025-01-03',
      policyDefinitions,
      startDate,
    });
    competitionEngine.setState(tournamentRecord);

    const { tournamentId } = tournamentRecord;
    const { eventId, drawDefinitions } = tournamentRecord.events[0];
    const { drawId, structures } = drawDefinitions[0];
    const structureId = (stage) => structures.find((structure) => structure.stage === stage).structureId;
    for (const [stage, roundNumber] of [
      [QUALIFYING, 1],
      [QUALIFYING, 2],
      [MAIN, 1],
    ]) {
      const result: any = competitionEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId: structureId(stage), roundNumber },
        scheduleDate: startDate,
        venueId,
      });
      expect(result.success).toEqual(true);
    }

    const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
    const qualifyingFinals = matchUps.filter(({ stage, roundNumber }) => stage === QUALIFYING && roundNumber === 2);
    const qualifierSlots = matchUps.filter(
      ({ stage, roundNumber, sides }) => stage === MAIN && roundNumber === 1 && sides?.some((side) => side.qualifier),
    );
    expect(qualifierSlots.length).toEqual(2);
    return { result, qualifyingFinals, qualifierSlots };
  }

  it('records the dependency', () => {
    setup(POLICY_SCHEDULING_DEFAULT);
    const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
    const { matchUpDependencies } = competitionEngine.getMatchUpDependencies();
    const qualifierSlots = matchUps.filter(
      ({ stage, roundNumber, sides }) => stage === MAIN && roundNumber === 1 && sides?.some((side) => side.qualifier),
    );
    // every qualifying matchUp: any qualifying winner can be placed in either qualifier position
    for (const { matchUpId } of qualifierSlots) expect(matchUpDependencies[matchUpId].matchUpIds.length).toEqual(6);
  });

  it('starts a qualifier position only after the qualifying final has ended', () => {
    const policyDefinitions = {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: {
          recoveryTimes: [{ minutes: { default: 60 } }],
          averageTimes: [{ minutes: { default: 90 } }],
        },
      },
    };
    const { qualifyingFinals, qualifierSlots } = setup(policyDefinitions);
    const latestFinal = Math.max(...qualifyingFinals.map(({ schedule }) => timeStringMinutes(schedule?.scheduledTime)));
    for (const { schedule } of qualifierSlots) {
      // they were scheduled at 08:00, beside qualifying R1
      expect(schedule?.scheduledTime).toBeDefined();
      expect(timeStringMinutes(schedule?.scheduledTime)).toBeGreaterThanOrEqual(latestFinal + 150);
    }
  });

  it('a qualifier position is over the daily limit on the day its qualifiers play twice', () => {
    // SINGLES limit 2: a qualifier who plays qualifying R1 and R2 cannot also play main R1 that day
    const { result, qualifierSlots } = setup(POLICY_SCHEDULING_DEFAULT);
    for (const { matchUpId, schedule } of qualifierSlots) {
      expect(schedule?.scheduledTime).toBeUndefined();
      expect(result.overLimitMatchUpIds[startDate]).toContain(matchUpId);
    }
    expect(POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING].defaultDailyLimits[SINGLES]).toEqual(2);
  });
});
