import { unPublishOrderOfPlay } from '@Mutate/timeItems/unPublishOrderOfPlay';
import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { PUBLIC } from '@Constants/timeItemConstants';

it('can publish order of play for specified days', () => {
  const startDate = '2022-01-01';
  const day2Date = '2022-01-02';
  const endDate = '2022-01-07';
  const firstVenueId = 'first';
  const secondVenueId = 'second';
  const venueProfiles = [
    {
      venueId: firstVenueId,
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueId: secondVenueId,
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  const drawProfiles = [
    {
      drawName: 'U16 Male Singles',
      participantsCount: 32,
      idPrefix: 'M16',
      drawId: 'idM16',
      drawSize: 32,
    },
  ];
  const schedulingProfile = [
    {
      scheduleDate: startDate,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-16',
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
            },
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-8',
              roundSegment: { segmentNumber: 1, segmentsCount: 2 },
            },
          ],
        },
        {
          venueId: secondVenueId,
          rounds: [
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-16',
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
            },
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-8',
              roundSegment: { segmentNumber: 2, segmentsCount: 2 },
            },
          ],
        },
      ],
    },
    {
      scheduleDate: day2Date,
      venues: [
        {
          venueId: firstVenueId,
          rounds: [
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-4',
            },
            {
              drawId: 'idM16',
              winnerFinishingPositionRange: '1-2',
            },
          ],
        },
      ],
    },
  ];

  let result = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    autoSchedule: true,
    schedulingProfile,
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  competitionEngine.setState(result.tournamentRecord);

  let publishState = competitionEngine.getPublishState().publishState;
  expect(publishState.tournament?.orderOfPlay?.published).toBeUndefined();

  result = competitionEngine.publishOrderOfPlay();
  expect(result.success).toEqual(true);

  result = competitionEngine.getState();
  const tournamentRecord: Tournament = Object.values(result.tournamentRecords)[0] as Tournament;
  expect(tournamentRecord.timeItems?.[1].itemValue[PUBLIC].orderOfPlay).not.toBeUndefined();

  publishState = competitionEngine.getPublishState().publishState;
  expect(publishState.tournament.orderOfPlay.published).toEqual(true);
  expect(publishState.tournament.status.published).toEqual(true);

  result = competitionEngine.unPublishOrderOfPlay({ removePriorValues: false });
  expect(result.success).toEqual(true);

  publishState = competitionEngine.getPublishState().publishState;
  expect(publishState.tournament.status.published).toEqual(false);
  expect(publishState.tournament.orderOfPlay).toBeUndefined();
});

it('returns error when no tournament records are provided', () => {
  const result = unPublishOrderOfPlay({});
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
});

it('handles unPublishOrderOfPlay with non-existent status key', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  // publish OOP first so there is a timeItem
  let result = competitionEngine.publishOrderOfPlay();
  expect(result.success).toEqual(true);

  // unpublish with a custom status that does not exist in itemValue
  // this exercises the `if (itemValue[status])` false branch
  result = competitionEngine.unPublishOrderOfPlay({ status: 'NONEXISTENT' });
  expect(result.success).toEqual(true);

  // the PUBLIC orderOfPlay should still be published since we only unpublished a non-existent status
  const publishState = competitionEngine.getPublishState().publishState;
  expect(publishState.tournament.orderOfPlay.published).toEqual(true);
});

it('handles unPublishOrderOfPlay when no prior publish exists', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    setState: true,
  });

  // unpublish without publishing first — exercises the fallback `{ [status]: {} }` branch
  const result = competitionEngine.unPublishOrderOfPlay();
  expect(result.success).toEqual(true);

  const publishState = competitionEngine.getPublishState().publishState;
  expect(publishState.tournament.orderOfPlay).toBeUndefined();
});
