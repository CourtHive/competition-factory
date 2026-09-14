import { getUpdatedSchedulingProfile } from '@Query/matchUps/scheduling/getUpdatedSchedulingProfile';
import { checkAndUpdateSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';

const scheduleDate = '2022-01-03';
it('can update a schedulingProfile when venues change', () => {
  const drawProfiles = [{ drawSize: 16 }];
  const venueProfiles = [
    { venueName: 'venue 1', courtsCount: 4 },
    { venueName: 'venue 2', courtsCount: 8 },
  ];
  const { tournamentRecord, venueIds, eventIds, drawIds } = mocksEngine.generateTournamentRecord({
    startDate: '2022-01-01',
    endDate: '2022-01-07',
    venueProfiles,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allCompetitionMatchUps();
  const { tournamentId, eventId, drawId, structureId } = matchUp;

  let result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    venueId: venueIds[0],
    scheduleDate,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
    venueId: venueIds[1],
    scheduleDate,
  });
  expect(result.success).toEqual(true);

  let { schedulingProfile, modifications, issues } = tournamentEngine.getSchedulingProfile();

  expect(modifications).toEqual(0);
  expect(issues).toBeUndefined();
  expect(schedulingProfile.length).toEqual(1);
  expect(schedulingProfile[0].venues.length).toEqual(2);

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: 'badDate',
    venueId: venueIds[1],
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 3 },
  });
  expect(result.error).toEqual(INVALID_DATE);

  result = tournamentEngine.addSchedulingProfileRound({
    venueId: venueIds[0],
    scheduleDate,
    round: {
      drawId: 'bogusId',
      tournamentId,
      roundNumber: 3,
      structureId,
      eventId,
    },
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.deleteVenue({ venueId: venueIds[0] });
  expect(result.success).toEqual(true);

  ({ schedulingProfile, modifications, issues } = tournamentEngine.getSchedulingProfile());

  expect(modifications).toEqual(0);
  expect(issues).toBeUndefined();
  expect(schedulingProfile.length).toEqual(1);
  expect(schedulingProfile[0].venues.length).toEqual(1);

  const badDateProfile = Object.assign({}, schedulingProfile[0], {
    scheduleDate: 'Invalid Date',
  });
  schedulingProfile.push(badDateProfile);

  result = getUpdatedSchedulingProfile({
    schedulingProfile,
    venueIds,
    eventIds,
    drawIds,
  });

  expect(result.modifications).toEqual(1);
  expect(result.issues.length).toEqual(1);
  expect(result.updatedSchedulingProfile.length).toEqual(1);
  expect(result.updatedSchedulingProfile[0].venues.length).toEqual(1);

  result = getUpdatedSchedulingProfile({
    schedulingProfile,
    venueIds: [],
    eventIds,
    drawIds,
  });

  expect(result.modifications).toEqual(2);
  expect(result.issues.length).toEqual(2);
  expect(result.updatedSchedulingProfile.length).toEqual(0);

  result = getUpdatedSchedulingProfile({
    schedulingProfile,
    venueIds,
    eventIds: [],
    drawIds,
  });

  expect(result.modifications).toEqual(2);
  expect(result.issues.length).toEqual(2);
  expect(result.updatedSchedulingProfile.length).toEqual(0);

  const extension = {
    name: SCHEDULING_PROFILE,
    value: schedulingProfile,
  };
  result = tournamentEngine.addTournamentExtension({ extension });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getSchedulingProfile();
  expect(result.modifications).toEqual(1);
  expect(result.issues.length).toEqual(1);
  expect(result.schedulingProfile.length).toEqual(1);

  result = tournamentEngine.addTournamentExtension({ extension });
  expect(result.success).toEqual(true);

  result = checkAndUpdateSchedulingProfile({ schedulingProfile });
  expect(result.issues.length).toEqual(2);

  result = tournamentEngine.getSchedulingProfile();
  result = checkAndUpdateSchedulingProfile({
    schedulingProfile: result.schedulingProfile,
  });
  expect(result.issues.length).toEqual(1);

  const { tournamentRecord: snapshot } = tournamentEngine.getTournament();
  result = checkAndUpdateSchedulingProfile({ tournamentRecord: snapshot });
  expect(!!result.modifications).toEqual(false);
});
