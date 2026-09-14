import { getSchedulingProfileIssues } from '@Query/matchUps/scheduling/getSchedulingProfileIssues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import { INVALID_DATE, INVALID_TOURNAMENT_RECORD, INVALID_VALUES } from '@Constants/errorConditionConstants';
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const startDate = '2022-01-01';
const endDate = '2022-01-07';

test.each([
  {
    drawSize: 4,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [1, 2],
    roundIndexShouldBeAfter: {},
    matchUpIdShouldBeAfterCount: 0,
  },
  {
    drawSize: 4,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [2, 1],
    roundIndexShouldBeAfter: {
      [startDate]: {
        0: [1],
      },
    },
    matchUpIdShouldBeAfterCount: 1,
  },
  {
    drawSize: 16,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [1, 2, 3, 4],
    roundIndexShouldBeAfter: {},
    matchUpIdShouldBeAfterCount: 0,
  },
  {
    drawSize: 16,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [1, 2, 4, 3],
    roundIndexShouldBeAfter: {
      [startDate]: {
        2: [3],
      },
    },
    matchUpIdShouldBeAfterCount: 1,
  },
  {
    drawSize: 16,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [1, 4, 2, 3],
    roundIndexShouldBeAfter: {
      [startDate]: {
        1: [2, 3],
      },
    },
    matchUpIdShouldBeAfterCount: 1,
  },
  {
    drawSize: 16,
    drawType: SINGLE_ELIMINATION,
    roundNumbers: [1, 3, 2, 4],
    roundIndexShouldBeAfter: {
      [startDate]: {
        1: [2],
      },
    },
    matchUpIdShouldBeAfterCount: 2,
  },
])(
  'it can report issues when schedulingProfile rounds are out of order',
  ({ drawSize, drawType, roundNumbers, roundIndexShouldBeAfter, matchUpIdShouldBeAfterCount }) => {
    const venueProfiles = [
      {
        startTime: '08:00',
        endTime: '19:00',
        courtsCount: 4,
      },
    ];

    const eventProfiles = [
      {
        eventExtensions: [],
        eventAttributes: {},
        eventName: 'Event Test',
        drawProfiles: [
          {
            drawSize,
            drawType,
          },
        ],
      },
    ];
    const {
      drawIds,
      venueIds: [venueId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      eventProfiles,
      venueProfiles,
      startDate,
      endDate,
    });

    tournamentEngine.setState(tournamentRecord);

    tournamentEngine.attachPolicies({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    });

    const { tournamentId } = tournamentRecord;

    const drawId = drawIds[0];
    for (const roundNumber of roundNumbers) {
      const {
        event: { eventId },
        drawDefinition: {
          structures: [{ structureId }],
        },
      } = tournamentEngine.getEvent({ drawId });
      const result = tournamentEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId, roundNumber },
        scheduleDate: startDate,
        venueId,
      });
      expect(result.success).toEqual(true);
    }

    const result = tournamentEngine.getSchedulingProfileIssues();
    expect(result.roundIndexShouldBeAfter).toEqual(roundIndexShouldBeAfter);
    expect(Object.keys(result.profileIssues.matchUpIdShouldBeAfter).length).toEqual(matchUpIdShouldBeAfterCount);
  },
);

test('getScheduligProfileIssues thows appropriate errors', () => {
  let result = tournamentEngine.reset().getSchedulingProfileIssues();
  expect(result.issues.length).toEqual(0);
  expect(result.success).toEqual(true);

  result = tournamentEngine.getSchedulingProfileIssues({
    scheduleDates: 'invalid value',
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.getSchedulingProfileIssues({
    scheduleDates: ['invalid value'],
  });
  expect(result.error).toEqual(INVALID_DATE);

  result = getSchedulingProfileIssues();
  expect(result.error).toEqual(INVALID_TOURNAMENT_RECORD);
});
