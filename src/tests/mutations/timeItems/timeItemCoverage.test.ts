import { addMatchUpTimeItem, resetMatchUpTimeItems } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { addTimeItem, resetTimeItems, addEventTimeItem } from '@Mutate/timeItems/addTimeItem';
import { INVALID_ATTESTATION_SUBJECT } from '@Constants/errorConditionConstants';
import { getTimeItemValues } from '@Mutate/timeItems/getTimeItemValues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

describe('addTimeItem edge cases', () => {
  it('returns error for missing timeItem', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addTournamentTimeItem({});
    expect(result.error).toBeDefined();
  });

  it('returns error for invalid timeItem structure', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    // missing itemValue key
    let result = tournamentEngine.addTournamentTimeItem({
      timeItem: { itemType: 'test' },
    });
    expect(result.error).toBeDefined();

    // itemType not a string
    result = tournamentEngine.addTournamentTimeItem({
      timeItem: { itemType: 123, itemValue: 'test' },
    });
    expect(result.error).toBeDefined();
  });

  it('handles duplicate value prevention', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const timeItem = { itemType: 'test.value', itemValue: 'same' };

    let result = tournamentEngine.addTournamentTimeItem({ timeItem });
    expect(result.success).toEqual(true);

    // adding same value with duplicateValues: false should succeed silently
    result = tournamentEngine.addTournamentTimeItem({
      timeItem,
      duplicateValues: false,
    });
    expect(result.success).toEqual(true);
  });

  it('handles removePriorValues', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const timeItem = { itemType: 'test.prior', itemValue: 'first' };
    tournamentEngine.addTournamentTimeItem({ timeItem });

    const timeItem2 = { itemType: 'test.prior', itemValue: 'second' };
    const result = tournamentEngine.addTournamentTimeItem({
      timeItem: timeItem2,
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);
  });

  it('handles removePriorValues with no new itemValue', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const timeItem = { itemType: 'test.clear', itemValue: 'value' };
    tournamentEngine.addTournamentTimeItem({ timeItem });

    // removePriorValues with undefined itemValue should not push new item
    const result = tournamentEngine.addTournamentTimeItem({
      timeItem: { itemType: 'test.clear', itemValue: undefined },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);
  });

  it('handles empty itemSubTypes', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const timeItem = { itemType: 'test.sub', itemValue: 'val', itemSubTypes: [] };
    const result = tournamentEngine.addTournamentTimeItem({ timeItem });
    expect(result.success).toEqual(true);
  });

  it('addEventTimeItem returns error when event not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addEventTimeItem({
      timeItem: { itemType: 'test', itemValue: 'x' },
    });
    expect(result.error).toBeDefined();
  });

  it('addParticipantTimeItem returns errors for missing params', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    tournamentEngine.setState(tournamentRecord);

    // missing participantId
    let result = tournamentEngine.addParticipantTimeItem({
      timeItem: { itemType: 'test', itemValue: 'x' },
    });
    expect(result.error).toBeDefined();

    // valid participantId
    const { participantId } = tournamentRecord.participants[0];
    result = tournamentEngine.addParticipantTimeItem({
      participantId,
      timeItem: { itemType: 'test.participant', itemValue: 'val' },
    });
    expect(result.success).toEqual(true);
  });

  it('addTournamentTimeItem fires MODIFY_TOURNAMENT_DETAIL notice', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addTournamentTimeItem({
      timeItem: { itemType: 'custom.value', itemValue: 'data' },
    });
    expect(result.success).toEqual(true);
  });
});

describe('publishOrderOfPlay edge cases', () => {
  it('publishOrderOfPlay with embargo', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    let result = tournamentEngine.publishOrderOfPlay({ embargo: futureDate });
    expect(result.success).toEqual(true);

    // invalid embargo
    result = tournamentEngine.publishOrderOfPlay({ embargo: 'not-a-date' });
    expect(result.error).toBeDefined();
  });

  it('publishOrderOfPlay with language', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.publishOrderOfPlay({ language: 'fr' });
    expect(result.success).toEqual(true);
  });

  it('publishOrderOfPlay with specific scheduledDates', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.publishOrderOfPlay({
      scheduledDates: ['2025-07-01', '2025-07-02'],
    });
    expect(result.success).toEqual(true);
  });

  it('publishOrderOfPlay with eventIds', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.publishOrderOfPlay({
      eventIds: ['event1', 'event2'],
    });
    expect(result.success).toEqual(true);
  });

  it('unPublishOrderOfPlay when not published', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    // unpublish when nothing is published — should succeed
    const result = tournamentEngine.unPublishOrderOfPlay();
    expect(result.success).toEqual(true);
  });
});

describe('publishParticipants edge cases', () => {
  it('publishParticipants with embargo', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    let result = tournamentEngine.publishParticipants({ embargo: futureDate });
    expect(result.success).toEqual(true);

    // invalid embargo
    result = tournamentEngine.publishParticipants({ embargo: 'invalid' });
    expect(result.error).toBeDefined();
  });

  it('publishParticipants with columns config', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.publishParticipants({
      columns: { country: true, events: false },
    });
    expect(result.success).toEqual(true);
  });

  it('unPublishParticipants when not published', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.unPublishParticipants();
    expect(result.success).toEqual(true);
  });
});

describe('matchUp timeItems: checkIn/checkOut', () => {
  it('checkIn and checkOut participants in a matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find(
      (m) => m.roundNumber === 1 && m.sides?.[0]?.participantId && m.sides?.[1]?.participantId,
    );
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const participantId = firstRoundMatchUp.sides[0].participantId;

    // checkIn
    let result = tournamentEngine.checkInParticipant({ matchUpId, drawId, participantId });
    expect(result.success).toEqual(true);
    expect(result.checkedIn).toEqual(true);

    // checkIn again — should return success (already checked in)
    result = tournamentEngine.checkInParticipant({ matchUpId, drawId, participantId });
    expect(result.success).toEqual(true);

    // checkOut
    result = tournamentEngine.checkOutParticipant({ matchUpId, drawId, participantId });
    expect(result.success).toEqual(true);
    expect(result.checkedOut).toEqual(true);
  });

  it('checkIn returns error for invalid participantId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find((m) => m.roundNumber === 1 && m.sides?.[0]?.participantId);
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const result = tournamentEngine.checkInParticipant({
      matchUpId,
      drawId,
      participantId: 'invalid-id',
    });
    expect(result.error).toBeDefined();
  });

  it('checkOut returns error when matchUp is active/completed', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find(
      (m) => m.roundNumber === 1 && m.sides?.[0]?.participantId && m.sides?.[1]?.participantId,
    );
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const participantId = firstRoundMatchUp.sides[0].participantId;

    // checkIn first
    tournamentEngine.checkInParticipant({ matchUpId, drawId, participantId });

    // score the matchUp
    tournamentEngine.setMatchUpStatus({
      matchUpId,
      drawId,
      outcome: {
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
    });

    // checkOut should fail — matchUp is completed
    const result = tournamentEngine.checkOutParticipant({ matchUpId, drawId, participantId });
    expect(result.error).toBeDefined();
  });

  it('checkOut returns error for participant not checked in', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find(
      (m) => m.roundNumber === 1 && m.sides?.[0]?.participantId && m.sides?.[1]?.participantId,
    );
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const participantId = firstRoundMatchUp.sides[0].participantId;

    // checkOut without checkIn
    const result = tournamentEngine.checkOutParticipant({ matchUpId, drawId, participantId });
    expect(result.error).toBeDefined();
  });

  it('toggleParticipantCheckInState toggles correctly', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find(
      (m) => m.roundNumber === 1 && m.sides?.[0]?.participantId && m.sides?.[1]?.participantId,
    );
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const participantId = firstRoundMatchUp.sides[0].participantId;

    // toggle on (checkIn)
    let result = tournamentEngine.toggleParticipantCheckInState({ matchUpId, drawId, participantId });
    expect(result.success).toEqual(true);
    expect(result.checkedIn).toEqual(true);

    // toggle off (checkOut)
    result = tournamentEngine.toggleParticipantCheckInState({ matchUpId, drawId, participantId });
    expect(result.success).toEqual(true);
    expect(result.checkedOut).toEqual(true);
  });

  it('refuses the PAIR and checks its members in and out individually', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'DOUBLES' }],
      participantsProfile: { participantsCount: 20 },
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find(
      (m) => m.roundNumber === 1 && m.sides?.[0]?.participantId && m.sides?.[1]?.participantId,
    );
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const pairParticipantId = firstRoundMatchUp.sides[0].participantId;
    const memberParticipantId = firstRoundMatchUp.sides[0].participant.individualParticipants[0].participantId;

    // CODES 7.0.0: a PAIR is not a valid SUBJECT. Nothing reconciled a pair-level check-in with its
    // two individual ones, so two desks could store different state for one physical fact.
    let result = tournamentEngine.checkInParticipant({ matchUpId, drawId, participantId: pairParticipantId });
    expect(result.error).toEqual(INVALID_ATTESTATION_SUBJECT);

    result = tournamentEngine.checkInParticipant({ matchUpId, drawId, participantId: memberParticipantId });
    expect(result.success).toEqual(true);

    result = tournamentEngine.checkOutParticipant({ matchUpId, drawId, participantId: memberParticipantId });
    expect(result.success).toEqual(true);
    expect(result.checkedOut).toEqual(true);
  });

  it('checkOut returns error for invalid participantId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const firstRoundMatchUp = matchUps.find((m) => m.roundNumber === 1 && m.sides?.[0]?.participantId);
    if (!firstRoundMatchUp) return;

    const { matchUpId, drawId } = firstRoundMatchUp;
    const result = tournamentEngine.checkOutParticipant({
      matchUpId,
      drawId,
      participantId: 'invalid-id',
    });
    expect(result.error).toBeDefined();
  });
});

describe('addTimeItem and getTimeItemValues direct calls', () => {
  it('addTimeItem returns error when no element can be derived', () => {
    const result = addTimeItem({
      timeItem: { itemType: 'test', itemValue: 'x' },
      element: undefined,
    } as any);
    expect(result.error).toBeDefined();
  });

  it('addTimeItem with creationTime false does not set createdAt', () => {
    const element: any = {};
    const result = addTimeItem({
      timeItem: { itemType: 'test', itemValue: 'x' },
      creationTime: false,
      element,
    });
    expect(result.success).toEqual(true);
    expect(element.timeItems[0].createdAt).toBeUndefined();
  });

  it('addTimeItem with participantId derives element from participant', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    const participantId = tournamentRecord.participants[0].participantId;

    const result = addTimeItem({
      timeItem: { itemType: 'test.derived', itemValue: 'val' },
      tournamentRecord,
      participantId,
    } as any);
    expect(result.success).toEqual(true);
  });

  it('resetTimeItems returns error for missing element', () => {
    const result = resetTimeItems({ element: undefined });
    expect(result.error).toBeDefined();
  });

  it('resetTimeItems clears timeItems array', () => {
    const element: any = { timeItems: [{ itemType: 'a', itemValue: 1 }] };
    const result: any = resetTimeItems({ element });
    expect(result.success).toEqual(true);
    expect(element.timeItems.length).toEqual(0);
  });

  it('getTimeItemValues handles edge cases', () => {
    // missing element
    let result = getTimeItemValues({ element: undefined });
    expect(result.error).toBeDefined();

    // no timeItems
    result = getTimeItemValues({ element: {} });
    expect(Object.keys(result).length).toEqual(0);

    // non-array timeItems
    result = getTimeItemValues({ element: { timeItems: 'invalid' } });
    expect(result.error).toBeDefined();

    // valid timeItems
    result = getTimeItemValues({
      element: {
        timeItems: [
          { itemType: 'a', itemValue: 1 },
          { itemType: 'b', itemValue: 2 },
        ],
      },
    });
    expect(result['a']).toEqual(1);
    expect(result['b']).toEqual(2);

    // timeItem missing itemType
    result = getTimeItemValues({
      element: { timeItems: [{ itemValue: 'orphan' }] },
    });
    expect(Object.keys(result).length).toEqual(0);
  });
});

describe('publishOrderOfPlay full lifecycle', () => {
  it('publish then unpublish then re-publish with different params', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    // publish with scheduledDates
    let result = tournamentEngine.publishOrderOfPlay({
      scheduledDates: ['2025-07-01'],
      language: 'es',
    });
    expect(result.success).toEqual(true);

    // unpublish
    result = tournamentEngine.unPublishOrderOfPlay();
    expect(result.success).toEqual(true);

    // re-publish without scheduledDates (all dates)
    result = tournamentEngine.publishOrderOfPlay();
    expect(result.success).toEqual(true);
  });

  it('publishParticipants with language and then unpublish', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.publishParticipants({
      language: 'de',
      columns: { country: true },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.unPublishParticipants();
    expect(result.success).toEqual(true);

    // re-publish
    result = tournamentEngine.publishParticipants({ embargo: new Date(Date.now() + 86400000).toISOString() });
    expect(result.success).toEqual(true);
  });
});

describe('matchUpTimeItems direct calls', () => {
  it('addMatchUpTimeItem returns error for invalid matchUpId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const result = addMatchUpTimeItem({
      drawDefinition,
      matchUpId: 'nonexistent',
      timeItem: { itemType: 'test', itemValue: 'x' },
    });
    expect(result.error).toBeDefined();
  });

  it('addMatchUpTimeItem with disableNotice', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.roundNumber === 1);
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = addMatchUpTimeItem({
      drawDefinition,
      matchUpId: matchUp.matchUpId,
      timeItem: { itemType: 'test.quiet', itemValue: 'silent' },
      disableNotice: true,
    });
    expect(result.success).toEqual(true);
  });

  it('resetMatchUpTimeItems clears timeItems on matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.roundNumber === 1);
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    // Add a timeItem first
    addMatchUpTimeItem({
      drawDefinition,
      matchUpId: matchUp.matchUpId,
      timeItem: { itemType: 'test.reset', itemValue: 'val' },
    });

    // Reset
    const result: any = resetMatchUpTimeItems({
      matchUpId: matchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
    });
    expect(result.success).toEqual(true);
  });

  it('resetMatchUpTimeItems returns error for invalid matchUpId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetMatchUpTimeItems({
      drawDefinition,
      matchUpId: 'nonexistent',
    });
    expect(result.error).toBeDefined();
  });

  it('addEventTimeItem directly with missing event', () => {
    const result = addEventTimeItem({
      timeItem: { itemType: 'test', itemValue: 'x' },
    });
    expect(result.error).toBeDefined();
  });
});
