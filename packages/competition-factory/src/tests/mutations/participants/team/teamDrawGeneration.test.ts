import { tieFormatConstants, tieFormats } from '@courthive/competition-catalogue';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants and fixtures
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM } from '@Constants/eventConstants';

const { LAVER_CUP } = tieFormatConstants;

test('it can use tieFormatName in addEvent', () => {
  const participantsCount = 8;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount },
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addEvent({
    event: { eventType: TEAM, tieFormatName: LAVER_CUP },
  });

  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  eventResult.tieFormat.collectionDefinitions.forEach((collectionDefinition) => {
    expect(collectionDefinition.collectionId).not.toBeUndefined();
  });

  // must remove the collectionIds to check equality with template
  eventResult.tieFormat.collectionDefinitions.forEach(
    (collectionDefinition) => (collectionDefinition.collectionId = undefined),
  );
  expect(eventResult.tieFormat).toEqual(tieFormats[LAVER_CUP]);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  const participantIds = participants.map((p) => p.participantId);
  expect(participants.length).toEqual(participantsCount);

  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);
});

test('it will provide default tieFormat for TEAM events', () => {
  const participantsCount = 8;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount },
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addEvent({ event: { eventType: TEAM } });

  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  const participantIds = participants.map((p) => p.participantId);
  expect(participants.length).toEqual(participantsCount);

  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    eventId,
  });

  expect(drawDefinition.tieFormat).not.toBeUndefined();
  expect(drawDefinition.matchUpType).toEqual(TEAM);
});

test('generateDrawDefinition refuses an unknown tieFormatName, as addEvent does', () => {
  const participantsCount = 8;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount },
  });

  tournamentEngine.setState(tournamentRecord);

  let result: any = tournamentEngine.addEvent({ event: { eventType: TEAM, tieFormatName: 'NOT_A_TIE_FORMAT' } });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.addEvent({ event: { eventType: TEAM } });
  const { eventId } = result.event;
  const { participants } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [TEAM] } });
  result = tournamentEngine.addEventEntries({ eventId, participantIds: participants.map((p) => p.participantId) });
  expect(result.success).toEqual(true);

  // the same name used to build a STANDARD draw silently
  result = tournamentEngine.generateDrawDefinition({ eventId, tieFormatName: 'NOT_A_TIE_FORMAT' });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.drawDefinition).toBeUndefined();

  result = tournamentEngine.generateDrawDefinition({ eventId, tieFormatName: LAVER_CUP });
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.tieFormat.tieFormatName).toEqual(tieFormats[LAVER_CUP].tieFormatName);
});

it('can generate draws with unique TEAM participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, uniqueParticipants: true }],
  });

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(participants.length).toEqual(8);
});
