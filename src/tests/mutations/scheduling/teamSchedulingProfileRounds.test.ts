import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

it('can return participant scheduled matchUps', () => {
  const startDate = '2023-06-26';
  const endDate = '2023-06-28';

  const venueProfiles = [{ courtsCount: 4 }];
  const {
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { rounds } = tournamentEngine.getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  let result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
  });
  expect(matchUps.every(({ schedule }) => schedule.scheduledTime)).toEqual(true);
});
