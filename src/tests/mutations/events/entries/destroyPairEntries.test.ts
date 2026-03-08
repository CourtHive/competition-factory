import { destroyPairEntries as destroyPairEntriesFn } from '@Mutate/entries/destroyPairEntry';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { PAIR } from '@Constants/participantConstants';

it('can destroy multiple pair entries at once', () => {
  const doublesId = 'doublesId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 8 },
    eventProfiles: [{ eventType: DOUBLES, eventId: doublesId }],
  });

  tournamentEngine.setState(tournamentRecord);

  const pairParticipantIds = tournamentRecord.participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.participantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: pairParticipantIds,
    eventId: doublesId,
  });
  expect(result.success).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId: doublesId });
  expect(event.entries.length).toEqual(8);

  // Destroy 3 pair entries at once
  const idsToDestroy = pairParticipantIds.slice(0, 3);
  result = tournamentEngine.destroyPairEntries({
    participantIds: idsToDestroy,
    eventId: doublesId,
  });
  expect(result.success).toEqual(true);
  expect(result.destroyedCount).toEqual(3);

  ({ event } = tournamentEngine.getEvent({ eventId: doublesId }));
  // 5 remaining pairs + 6 ungrouped individuals from 3 destroyed pairs
  expect(event.entries.length).toEqual(11);
});

it('returns error when tournamentRecord is missing for destroyPairEntries', () => {
  const result = destroyPairEntriesFn({
    participantIds: ['id1'],
    event: {},
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('returns errors when participantIds are invalid', () => {
  const doublesId = 'doublesId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 4 },
    eventProfiles: [{ eventType: DOUBLES, eventId: doublesId }],
  });

  tournamentEngine.setState(tournamentRecord);

  const pairParticipantIds = tournamentRecord.participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.participantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: pairParticipantIds,
    eventId: doublesId,
  });
  expect(result.success).toEqual(true);

  // Try to destroy entries with invalid participant IDs
  result = tournamentEngine.destroyPairEntries({
    participantIds: ['invalidId1', 'invalidId2'],
    eventId: doublesId,
  });
  // All fail, so error should be returned
  expect(result.error).toBeDefined();
  expect(result.success).toBeUndefined();
});

it('handles mixed valid and invalid participantIds', () => {
  const doublesId = 'doublesId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 4 },
    eventProfiles: [{ eventType: DOUBLES, eventId: doublesId }],
  });

  tournamentEngine.setState(tournamentRecord);

  const pairParticipantIds = tournamentRecord.participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.participantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: pairParticipantIds,
    eventId: doublesId,
  });
  expect(result.success).toEqual(true);

  // Mix valid and invalid IDs
  result = tournamentEngine.destroyPairEntries({
    participantIds: [pairParticipantIds[0], 'invalidId'],
    eventId: doublesId,
  });
  // At least one succeeded
  expect(result.success).toEqual(true);
  expect(result.destroyedCount).toEqual(1);
});
