import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { deriveElement } from '@Query/base/deriveElement';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

describe('deriveElement', () => {
  it('derives element from participantId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 4 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    const result = deriveElement({ tournamentRecord, participantId });

    expect(result.participantId).toEqual(participantId);
    expect(result.error).toBeUndefined();
  });

  it('returns participant from participantId lookup', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    const result = deriveElement({ tournamentRecord, participantId });

    expect(result).toMatchObject(tournamentRecord.participants[0]);
  });

  it('returns error result when participantId not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 1 },
    });

    const result = deriveElement({ tournamentRecord, participantId: 'nonexistent' });

    expect(result.error).toBeDefined();
  });

  it('derives element from direct element parameter', () => {
    const element = { id: 'test', name: 'Test Element' };
    const result = deriveElement({ element });

    expect(result).toEqual(element);
  });

  it('derives element from drawDefinition', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const result = deriveElement({ drawDefinition });

    expect(result).toEqual(drawDefinition);
  });

  it('derives element from event', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const result = deriveElement({ event });

    expect(result).toEqual(event);
  });

  it('derives element from tournamentRecord', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const result = deriveElement({ tournamentRecord });

    expect(result).toEqual(tournamentRecord);
  });

  it('prioritizes element over drawDefinition', () => {
    const element = { id: 'direct', type: 'element' };
    const drawDefinition = { drawId: 'draw', type: 'drawDefinition' };

    const result = deriveElement({ element, drawDefinition });

    expect(result).toEqual(element);
  });

  it('prioritizes element over event', () => {
    const element = { id: 'direct', type: 'element' };
    const event = { eventId: 'event', type: 'event' };

    const result = deriveElement({ element, event });

    expect(result).toEqual(element);
  });

  it('prioritizes element over tournamentRecord', () => {
    const element = { id: 'direct', type: 'element' };
    const tournamentRecord = { tournamentId: 'tournament' };

    const result = deriveElement({ element, tournamentRecord });

    expect(result).toEqual(element);
  });

  it('prioritizes drawDefinition over event', () => {
    const drawDefinition = { drawId: 'draw', type: 'drawDefinition' };
    const event = { eventId: 'event', type: 'event' };

    const result = deriveElement({ drawDefinition, event });

    expect(result).toEqual(drawDefinition);
  });

  it('prioritizes drawDefinition over tournamentRecord', () => {
    const drawDefinition = { drawId: 'draw', type: 'drawDefinition' };
    const tournamentRecord = { tournamentId: 'tournament' };

    const result = deriveElement({ drawDefinition, tournamentRecord });

    expect(result).toEqual(drawDefinition);
  });

  it('prioritizes event over tournamentRecord', () => {
    const event = { eventId: 'event', type: 'event' };
    const tournamentRecord = { tournamentId: 'tournament' };

    const result = deriveElement({ event, tournamentRecord });

    expect(result).toEqual(event);
  });

  it('returns error when no valid element provided', () => {
    const result = deriveElement({});

    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when all parameters are undefined', () => {
    const result = deriveElement({
      element: undefined,
      drawDefinition: undefined,
      event: undefined,
      tournamentRecord: undefined,
    });

    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns error when all parameters are null', () => {
    const result = deriveElement({
      element: null,
      drawDefinition: null,
      event: null,
      tournamentRecord: null,
    });

    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('handles participantId with missing tournamentRecord', () => {
    const result = deriveElement({ participantId: 'someId' });

    expect(result.error).toBeDefined();
  });

  it('handles participantId with null tournamentRecord', () => {
    const result = deriveElement({ participantId: 'someId', tournamentRecord: null as any });

    expect(result.error).toBeDefined();
  });

  it('prioritizes participantId over all other parameters', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
    });

    const participantId = tournamentRecord.participants[0].participantId;
    const element = { id: 'direct' };
    const drawDefinition = { drawId: 'draw' };

    const result = deriveElement({
      participantId,
      tournamentRecord,
      element,
      drawDefinition,
    });

    // Should return participant, not element or drawDefinition
    expect(result.participantId).toEqual(participantId);
    expect(result).not.toEqual(element);
    expect(result).not.toEqual(drawDefinition);
  });
});
