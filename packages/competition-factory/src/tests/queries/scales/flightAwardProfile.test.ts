import { awardProfileFlights, awardProfilePercentageFlights } from './awardProfileExamples';
import { finishingPositionSort, getFpMap } from './awardTestUtils';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { getAwardProfile } from '@Query/scales/getAwardProfile';

it('can award points for flights', () => {
  const eventProfiles = [
    {
      drawProfiles: [
        { uniqueParticipants: true, drawSize: 16 },
        { uniqueParticipants: true, drawSize: 16 },
      ],
    },
  ];
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    eventProfiles,
  });
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });

  for (const drawDefinition of event.drawDefinitions) {
    const { drawType } = drawDefinition;
    const { awardProfile } = getAwardProfile({
      awardProfiles: [awardProfileFlights],
      participation: {
        participationOrder: 1,
        flightNumber: 1,
      },
      eventType: event.eventType,
      category: event.category,
      drawSize: 16,
      drawType,
      level: 4,
    });
    expect(awardProfile).not.toBeUndefined();
  }

  const participants = tournamentEngine
    .getParticipants({
      withRankingProfile: true,
    })
    .participants.sort(finishingPositionSort);
  expect(participants.length).toEqual(32);

  result = tournamentEngine.tournamentMatchUps();
  expect(result.completedMatchUps.length).toEqual(30);

  const policyDefinitions: any = {
    [POLICY_TYPE_RANKING_POINTS]: {
      awardProfiles: [awardProfilePercentageFlights],
    },
  };

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 4 });
  expect(result.success).toEqual(true);

  let fpMap = getFpMap(participants, result.personPoints);

  const pointTotal = 2;
  let totalPointsAwarded = fpMap.map((entry) => entry[pointTotal]).reduce((a, b) => (a || 0) + (b || 0), 0);
  expect(totalPointsAwarded).toEqual(3079);

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
  expect(result.success).toEqual(true);

  fpMap = getFpMap(participants, result.personPoints);

  totalPointsAwarded = fpMap.map((entry) => entry[pointTotal]).reduce((a, b) => (a || 0) + (b || 0), 0);
  expect(totalPointsAwarded).toEqual(1710);

  // use a different awardProfile
  policyDefinitions[POLICY_TYPE_RANKING_POINTS].awardProfiles = [awardProfileFlights];
  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 4 });
  expect(result.success).toEqual(true);

  fpMap = getFpMap(participants, result.personPoints);
  totalPointsAwarded = fpMap.map((entry) => entry[pointTotal]).reduce((a, b) => (a || 0) + (b || 0), 0);
  expect(totalPointsAwarded).toEqual(3075);

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
  expect(result.success).toEqual(true);

  fpMap = getFpMap(participants, result.personPoints);
  totalPointsAwarded = fpMap.map((entry) => entry[pointTotal]).reduce((a, b) => (a || 0) + (b || 0), 0);
  expect(totalPointsAwarded).toEqual(1710);
});
