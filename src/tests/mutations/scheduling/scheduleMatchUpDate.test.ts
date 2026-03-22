import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { INVALID_DATE } from '@Constants/errorConditionConstants';

it('can re-schedule matchUp date backwards and forwards in time', () => {
  const startDate = '2020-01-01';
  const endDate = '2020-01-08';
  const drawProfiles = [
    {
      participantsCount: 30,
      drawSize: 32,
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(31);

  const matchUp = matchUps[0];
  const { drawId, matchUpId } = matchUp;

  const scheduledDate = '2020-01-03';
  let result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  let {
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  });
  expect(schedule.scheduledDate).toEqual(scheduledDate);

  const newScheduledDate = '2020-01-02';
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: newScheduledDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }));
  expect(schedule.scheduledDate).toEqual(newScheduledDate);

  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }));
  expect(schedule.scheduledDate).toEqual(scheduledDate);

  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: undefined,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUp: { schedule },
  } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  }));
  expect(schedule.scheduledDate).toBeUndefined();

  const matchUpModifyNotices: any[] = [];
  const subscriptions = {
    modifyMatchUp: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          matchUpModifyNotices.push(matchUp);
        });
      }
    },
  };
  setSubscriptions({ subscriptions });

  const setStatusResult = tournamentEngine.setMatchUpStatus({
    schedule: { scheduledDate },
    matchUpId,
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);
  expect(matchUpModifyNotices.length).toEqual(1);
});

it('rejects scheduledDate outside tournament date range', () => {
  const startDate = '2024-06-01';
  const endDate = '2024-06-07';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { drawId, matchUpId } = matchUps[0];

  // date before tournament start
  let result: any = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: '2024-05-31',
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DATE);

  // date after tournament end
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: '2024-06-08',
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_DATE);

  // date within range should succeed
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: '2024-06-03',
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // boundary: exact start date should succeed
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: startDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // boundary: exact end date should succeed
  result = tournamentEngine.addMatchUpScheduledDate({
    scheduledDate: endDate,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
});
