import { destroyPairEntries as destroyPairEntriesFn } from '@Mutate/entries/destroyPairEntry';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_PARTICIPANT_IDS, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

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

/**
 * A refusal is ONE ErrorType. Until 2026-10-01 an all-invalid batch returned `{ error: [...] }`,
 * an array: no `code` for a client to switch on, and the golden corpus recorder, which validates
 * every recorded result against the corpus schema, was what found it. The failures are kept, in
 * `context.errors`, on refusal and on partial success alike.
 */
it('refuses with one error that carries a code, and every failure in context', () => {
  const doublesId = 'doublesId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 4 },
    eventProfiles: [{ eventType: DOUBLES, eventId: doublesId }],
  });
  tournamentEngine.setState(tournamentRecord);
  const pairParticipantIds = tournamentRecord.participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.participantId);
  expect(tournamentEngine.addEventEntries({ participantIds: pairParticipantIds, eventId: doublesId }).success).toEqual(
    true,
  );

  const refused = tournamentEngine.destroyPairEntries({ participantIds: ['nope-1', 'nope-2'], eventId: doublesId });
  expect(refused.success).toBeUndefined();
  expect(Array.isArray(refused.error)).toEqual(false);
  expect(refused.error.code).toMatch(/^ERR_[A-Z0-9_]+$/);
  expect(refused.context.errors).toHaveLength(2);
  expect(refused.context.errors[0]).toEqual(refused.error);

  const mixed = tournamentEngine.destroyPairEntries({
    participantIds: [pairParticipantIds[0], 'nope-3'],
    eventId: doublesId,
  });
  expect(mixed.success).toEqual(true);
  expect(mixed.destroyedCount).toEqual(1);
  expect(mixed.context.errors).toHaveLength(1);

  expect(tournamentEngine.destroyPairEntries({ participantIds: [], eventId: doublesId }).error).toEqual(
    MISSING_PARTICIPANT_IDS,
  );
});
