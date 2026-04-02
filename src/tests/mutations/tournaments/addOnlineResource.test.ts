import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import {
  COURT_NOT_FOUND,
  INVALID_OBJECT,
  INVALID_PARTICIPANT,
  INVALID_VALUES,
  NOT_FOUND,
  PARTICIPANT_NOT_FOUND,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('supports adding onlineResources', () => {
  const participantsProfile = { participantsCount: 2 };
  const venueProfiles = [
    {
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 3,
    },
  ];
  const {
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    tournamentName: 'Online Resources',
    participantsProfile,
    venueProfiles,
  });
  expect(tournamentRecord.onlineResources?.length ?? 0).toEqual(0);

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const onlineResource = {
    identifier: 'http://someUrl/some.jpg',
    resourceSubType: 'IMAGE',
    name: 'tournamentImage',
    resourceType: 'URL',
  };

  result = tournamentEngine.addOnlineResource({ onlineResource });
  expect(result.success).toEqual(true);

  let tournament = tournamentEngine.getTournament().tournamentRecord;
  expect(tournament.onlineResources.length).toEqual(1);

  tournamentEngine.removeOnlineResource({ onlineResource });
  tournament = tournamentEngine.getTournament().tournamentRecord;
  expect(tournament.onlineResources.length).toEqual(0);

  result = tournamentEngine.addOnlineResource();
  expect(result.error).toEqual(INVALID_OBJECT);

  result = tournamentEngine.addOnlineResource({
    onlineResource: { identifier: 'x' },
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.addOnlineResource({
    onlineResource,
    venueId: 'vid',
  });
  expect(result.error).toEqual(VENUE_NOT_FOUND);

  result = tournamentEngine.addOnlineResource({
    participantId: 'pid',
    onlineResource,
  });
  expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);

  result = tournamentEngine.addOnlineResource({
    personId: 'pid',
    onlineResource,
  });
  expect(result.error).toEqual(NOT_FOUND);

  result = tournamentEngine.addOnlineResource({
    courtId: 'courtId',
    onlineResource,
  });
  expect(result.error).toEqual(COURT_NOT_FOUND);

  result = tournamentEngine.addOnlineResource({
    organisationId: 'organisationId',
    onlineResource,
  });
  expect(result.error).toEqual(NOT_FOUND);

  result = tournamentEngine.addOnlineResource({
    onlineResource,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.findVenue({ venueId });
  expect(result.success).toEqual(true);
  expect(result.venue.onlineResources.length).toEqual(1);

  const participantId = tournamentRecord.participants[0].participantId;
  const personId = tournamentRecord.participants[0].person.personId;

  result = tournamentEngine.addOnlineResource({
    onlineResource,
    participantId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addOnlineResource({
    onlineResource,
    personId,
  });
  expect(result.success).toEqual(true);

  const participant = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [participantId] },
  }).participants[0];
  expect(participant.onlineResources.length).toEqual(1);
  expect(participant.person.onlineResources.length).toEqual(1);

  // Edge case: both personId and participantId with mismatch
  result = tournamentEngine.addOnlineResource({
    participantId: tournamentRecord.participants[1].participantId, // Different participant
    personId: tournamentRecord.participants[0].person.personId, // First participant's person
    onlineResource,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT);

  // Edge case: courtId with specific venueId
  const court = tournamentEngine.findVenue({ venueId }).venue.courts[0];
  result = tournamentEngine.addOnlineResource({
    courtId: court.courtId,
    venueId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: courtId without venueId (should search all venues)
  result = tournamentEngine.addOnlineResource({
    courtId: court.courtId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: add duplicate resource (should merge/dedupe)
  const duplicateResource = {
    identifier: 'http://sameUrl/same.jpg',
    resourceSubType: 'IMAGE',
    name: 'dupImage',
    resourceType: 'URL',
  };

  result = tournamentEngine.addOnlineResource({
    onlineResource: duplicateResource,
  });
  expect(result.success).toEqual(true);

  tournament = tournamentEngine.getTournament().tournamentRecord;
  const initialCount = tournament.onlineResources.length;

  // Add same resource again
  result = tournamentEngine.addOnlineResource({
    onlineResource: duplicateResource,
  });
  expect(result.success).toEqual(true);

  tournament = tournamentEngine.getTournament().tournamentRecord;
  // Should dedupe - same identifier, resourceType, and resourceSubType
  expect(tournament.onlineResources.length).toEqual(initialCount);

  // Edge case: add resource with different identifier
  const differentResource = {
    identifier: 'http://differentUrl/different.jpg',
    resourceSubType: 'IMAGE',
    name: 'differentImage',
    resourceType: 'URL',
  };

  result = tournamentEngine.addOnlineResource({
    onlineResource: differentResource,
  });
  expect(result.success).toEqual(true);

  tournament = tournamentEngine.getTournament().tournamentRecord;
  expect(tournament.onlineResources.length).toEqual(initialCount + 1);

  // Edge case: remove resource from court
  result = tournamentEngine.removeOnlineResource({
    courtId: court.courtId,
    venueId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: remove resource from venue
  result = tournamentEngine.removeOnlineResource({
    venueId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: remove resource from participant
  result = tournamentEngine.removeOnlineResource({
    participantId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: remove resource from person
  result = tournamentEngine.removeOnlineResource({
    personId,
    onlineResource,
  });
  expect(result.success).toEqual(true);

  // Edge case: courtId with wrong venueId
  result = tournamentEngine.addOnlineResource({
    courtId: court.courtId,
    venueId: 'wrongVenueId',
    onlineResource,
  });
  expect(result.error).toEqual(COURT_NOT_FOUND);
});
