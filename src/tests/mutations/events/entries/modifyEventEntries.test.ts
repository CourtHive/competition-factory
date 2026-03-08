import { chunkArray, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_PARTICIPANT_IDS, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { ALTERNATE, UNGROUPED } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';

it('can modify entries for a DOUBLES event and create PAIR participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 32 },
  });
  let participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];

  let participantTypes = unique(participants.map(({ participantType }) => participantType));
  expect(participantTypes).toEqual([INDIVIDUAL]);

  const participantIds = participants.map(({ participantId }) => participantId);
  expect(participantIds.length).toEqual(32);
  const participantIdPairs = chunkArray(participantIds, 2);

  const eventName = 'Test Event';
  const event = {
    eventType: DOUBLES_EVENT,
    eventName,
  };

  let result = tournamentEngine.addEvent({ event });
  expect(result.success).toEqual(true);
  const { eventId } = result.event;

  result = tournamentEngine.modifyEventEntries({ participantIdPairs });
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.modifyEventEntries({
    participantIdPairs: ['invalid'],
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  result = tournamentEngine.modifyEventEntries({ eventId, participantIdPairs });
  expect(result.success).toEqual(true);

  participants = tournamentEngine.getParticipants().participants ?? [];
  participantTypes = unique(participants.map(({ participantType }) => participantType));

  // modifyEventEntries has automatically created PAIR participants
  expect(participantTypes).toEqual([INDIVIDUAL, PAIR]);
});

it('will not allow duplicated entries to be created', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const { participants } = tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  const eventName = 'Test Event';
  const event = {
    eventType: SINGLES_EVENT,
    eventName,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.addedEntriesCount).toEqual(0);
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({
    entryStatus: ALTERNATE,
    participantIds,
    eventId,
  });
  expect(result.addedEntriesCount).toEqual(0);
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({
    entryStatus: ALTERNATE,
    entryStage: QUALIFYING,
    participantIds,
    eventId,
  });
  expect(result.addedEntriesCount).toEqual(0);
  expect(result.success).toEqual(true);
});

it('returns error when participantIdPairs contain pairs with wrong length', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });
  const participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];
  const participantIds = participants.map(({ participantId }) => participantId);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  // Pair with only 1 participantId (wrong length)
  result = tournamentEngine.modifyEventEntries({
    participantIdPairs: [[participantIds[0]]],
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  // Pair with 3 participantIds (wrong length)
  result = tournamentEngine.modifyEventEntries({
    participantIdPairs: [[participantIds[0], participantIds[1], participantIds[2]]],
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
});

it('handles already-existing PAIR participants without duplicating them', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });
  let participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];
  const participantIds = participants.map(({ participantId }) => participantId);
  const participantIdPairs = chunkArray(participantIds, 2);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  // First call creates PAIR participants
  result = tournamentEngine.modifyEventEntries({ eventId, participantIdPairs });
  expect(result.success).toEqual(true);

  participants = tournamentEngine.getParticipants().participants ?? [];
  const pairCountAfterFirst = participants.filter((p) => p.participantType === PAIR).length;

  // Second call with same pairs should not create duplicates
  result = tournamentEngine.modifyEventEntries({ eventId, participantIdPairs });
  expect(result.success).toEqual(true);

  participants = tournamentEngine.getParticipants().participants ?? [];
  const pairCountAfterSecond = participants.filter((p) => p.participantType === PAIR).length;
  expect(pairCountAfterSecond).toEqual(pairCountAfterFirst);
});

it('handles unpairedParticipantIds creating UNGROUPED entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });
  const participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];
  const participantIds = participants.map(({ participantId }) => participantId);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  // Add unpaired participants
  result = tournamentEngine.modifyEventEntries({
    unpairedParticipantIds: [participantIds[0], participantIds[1]],
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  const ungroupedEntries = updatedEvent.entries.filter((e) => e.entryStatus === UNGROUPED);
  expect(ungroupedEntries.length).toEqual(2);
  expect(ungroupedEntries.every((e) => e.entryStage === MAIN)).toEqual(true);
});

it('handles mixed participantIdPairs and unpairedParticipantIds', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });
  const participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];
  const participantIds = participants.map(({ participantId }) => participantId);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  // Add pairs AND unpaired participants in one call
  result = tournamentEngine.modifyEventEntries({
    participantIdPairs: [[participantIds[0], participantIds[1]]],
    unpairedParticipantIds: [participantIds[2], participantIds[3]],
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  const ungroupedEntries = updatedEvent.entries.filter((e) => e.entryStatus === UNGROUPED);
  expect(ungroupedEntries.length).toEqual(2);
});

it('applies custom entryStatus and entryStage to pair entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
  });
  const participants = tournamentEngine.setState(tournamentRecord).getParticipants().participants ?? [];
  const participantIds = participants.map(({ participantId }) => participantId);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  result = tournamentEngine.modifyEventEntries({
    participantIdPairs: [[participantIds[0], participantIds[1]]],
    entryStatus: ALTERNATE,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  // Pair entries should have the specified entryStatus
  const pairEntries = updatedEvent.entries.filter((e) => e.entryStatus === ALTERNATE);
  expect(pairEntries.length).toEqual(1);
  expect(pairEntries[0].entryStage).toEqual(QUALIFYING);
});

it('returns error when unpairedParticipantIds contain invalid IDs', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
  });
  tournamentEngine.setState(tournamentRecord);

  const event = { eventType: DOUBLES_EVENT, eventName: 'Doubles Test' };
  let result = tournamentEngine.addEvent({ event });
  const { eventId } = result.event;

  result = tournamentEngine.modifyEventEntries({
    unpairedParticipantIds: ['non-existent-id'],
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
});
