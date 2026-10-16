import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { TOTAL } from '@Constants/scheduleConstants';
import { SINGLES } from '@Constants/matchUpTypes';

// R3: the scheduling policy documents per-participant daily limits (`matchUpDailyLimits: [{ participantId, … }]`) and
// they were never read; and with several tournaments loaded, the last tournament's limits applied to everyone.

const startDate = '2025-01-01';
const endDate = '2025-01-03';

function generate({ tournamentId, venueId, policyDefinitions = undefined as any }) {
  return mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 8, venueId }],
    tournamentAttributes: { tournamentId },
    drawProfiles: [{ drawSize: 8 }],
    policyDefinitions,
    startDate,
    endDate,
  }).tournamentRecord;
}

function profileRounds({ tournamentRecord, venueId }) {
  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  for (const roundNumber of [1, 2]) {
    const result: any = competitionEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber },
      scheduleDate: startDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }
  return drawId;
}

const scheduledInRound = (drawId, roundNumber) =>
  competitionEngine
    .allCompetitionMatchUps({ inContext: true })
    .matchUps.filter((matchUp) => matchUp.drawId === drawId && matchUp.roundNumber === roundNumber)
    .filter(({ schedule }) => schedule?.scheduledTime);

it('applies a participant override from the scheduling policy on top of the defaults', () => {
  const venueId = 'venue';
  const firstRecord = generate({ tournamentId: 'probe', venueId });
  const [firstMatchUp] = firstRecord.events[0].drawDefinitions[0].structures[0].matchUps;
  const firstPositions = firstMatchUp.drawPositions;
  const { positionAssignments } = firstRecord.events[0].drawDefinitions[0].structures[0];
  const protectedId = positionAssignments.find(({ drawPosition }) => drawPosition === firstPositions[0]).participantId;

  const policyDefinitions = {
    [POLICY_TYPE_SCHEDULING]: {
      defaultTimes: { averageTimes: [{ minutes: { default: 60 } }], recoveryTimes: [{ minutes: { default: 30 } }] },
      matchUpDailyLimits: [{ participantId: protectedId, [SINGLES]: 1 }],
      defaultDailyLimits: { [SINGLES]: 2, [TOTAL]: 3 },
    },
  };
  // the same draw, now with the policy
  const tournamentRecord = { ...firstRecord };
  competitionEngine.setState(tournamentRecord);
  let result: any = competitionEngine.attachPolicies({ policyDefinitions });
  expect(result.success).toEqual(true);
  const drawId = profileRounds({ tournamentRecord, venueId });

  result = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
  expect(result.success).toEqual(true);

  expect(scheduledInRound(drawId, 1).length).toEqual(4);
  // the protected participant may play only one SINGLES matchUp today: the R2 matchUp they can reach waits
  const secondRound = scheduledInRound(drawId, 2);
  expect(secondRound.length).toEqual(1);
  const [overLimit] = result.overLimitMatchUpDetails[startDate];
  const atLimit = overLimit.participants.find(({ participantId }) => participantId === protectedId);
  expect(atLimit.atLimitCounters).toEqual([{ counter: SINGLES, count: 1, limit: 1 }]);
});

it('applies each tournament its own daily limits when several are loaded', () => {
  const strict = generate({ tournamentId: 'strict', venueId: 'strictVenue' });
  const relaxed = generate({ tournamentId: 'relaxed', venueId: 'relaxedVenue' });
  competitionEngine.setState([strict, relaxed]);

  let result: any = competitionEngine.setMatchUpDailyLimits({
    dailyLimits: { [SINGLES]: 1, [TOTAL]: 1 },
    tournamentId: 'strict',
  });
  expect(result.success).toEqual(true);
  result = competitionEngine.setMatchUpDailyLimits({
    dailyLimits: { [SINGLES]: 2, [TOTAL]: 2 },
    tournamentId: 'relaxed',
  });
  expect(result.success).toEqual(true);

  const strictDrawId = profileRounds({ tournamentRecord: strict, venueId: 'strictVenue' });
  const relaxedDrawId = profileRounds({ tournamentRecord: relaxed, venueId: 'relaxedVenue' });
  result = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
  expect(result.success).toEqual(true);

  expect(scheduledInRound(strictDrawId, 1).length).toEqual(4);
  expect(scheduledInRound(relaxedDrawId, 1).length).toEqual(4);
  // one SINGLES matchUp a day in the strict tournament; two in the relaxed one
  expect(scheduledInRound(strictDrawId, 2).length).toEqual(0);
  expect(scheduledInRound(relaxedDrawId, 2).length).toEqual(2);
});
