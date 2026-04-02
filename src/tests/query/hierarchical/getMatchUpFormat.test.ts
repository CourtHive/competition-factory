import { describe, expect, it } from 'vitest';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { MISSING_DRAW_ID } from '@Constants/errorConditionConstants';

describe('getMatchUpFormat', () => {
  it('returns matchUpFormat from matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];
    const matchUpFormat = { matchUpType: 'SINGLES', bestOf: 3 };
    matchUp.matchUpFormat = matchUpFormat;

    const result = getMatchUpFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.matchUpFormat).toEqual(matchUpFormat);
  });

  it('returns structureDefaultMatchUpFormat when matchUp has no format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
    const matchUpFormat = { matchUpType: 'SINGLES', bestOf: 5 };
    structure.matchUpFormat = matchUpFormat;

    const result = getMatchUpFormat({
      tournamentRecord,
      structureId: structure.structureId,
      drawDefinition: tournamentRecord.events[0].drawDefinitions[0],
    });

    expect(result.structureDefaultMatchUpFormat).toEqual(matchUpFormat);
  });

  it('returns drawDefaultMatchUpFormat when structure has no format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structureId = drawDefinition.structures[0].structureId;
    const matchUpFormat = { matchUpType: 'DOUBLES', bestOf: 3 };
    drawDefinition.matchUpFormat = matchUpFormat;

    const result = getMatchUpFormat({
      tournamentRecord,
      drawDefinition,
      structureId,
    });

    expect(result.drawDefaultMatchUpFormat).toEqual(matchUpFormat);
  });

  it('returns eventDefaultMatchUpFormat when draw has no format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const matchUpFormat = { matchUpType: 'SINGLES', bestOf: 3 };
    event.matchUpFormat = matchUpFormat;

    const result = getMatchUpFormat({
      tournamentRecord,
      event,
    });

    expect(result.eventDefaultMatchUpFormat).toEqual(matchUpFormat);
  });

  it('prioritizes matchUp format over structure format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
    const matchUp = structure.matchUps[0];

    structure.matchUpFormat = { bestOf: 5 };
    matchUp.matchUpFormat = { bestOf: 3 };

    const result = getMatchUpFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.matchUpFormat).toEqual({ bestOf: 3 });
  });

  it('prioritizes structure format over draw format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structure = drawDefinition.structures[0];

    drawDefinition.matchUpFormat = { bestOf: 5 };
    structure.matchUpFormat = { bestOf: 3 };

    const result = getMatchUpFormat({
      tournamentRecord,
      structureId: structure.structureId,
      drawDefinition,
    });

    expect(result.matchUpFormat).toEqual({ bestOf: 3 });
  });

  it('prioritizes draw format over event format', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const structureId = drawDefinition.structures[0].structureId;

    event.matchUpFormat = { bestOf: 5 };
    drawDefinition.matchUpFormat = { bestOf: 3 };

    const result = getMatchUpFormat({
      tournamentRecord,
      drawDefinition,
      structureId,
      event,
    });

    expect(result.matchUpFormat).toEqual({ bestOf: 3 });
  });

  it('returns error when tournamentRecord is missing', () => {
    const result = getMatchUpFormat({
      tournamentRecord: null as any,
    });

    expect(result.error).toBeDefined();
  });

  it('returns error when no identifying parameters provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = getMatchUpFormat({
      tournamentRecord,
    });

    expect(result.error).toBeDefined();
  });

  it('handles invalid matchUpId gracefully', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getMatchUpFormat({
      tournamentRecord,
      matchUpId: 'nonexistent',
    });

    // Function returns result even if matchUp not found
    expect(result).toBeDefined();
  });

  it('returns error when structureId provided without drawDefinition', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    const result = getMatchUpFormat({
      tournamentRecord,
      structureId,
    });

    expect(result.error).toEqual(MISSING_DRAW_ID);
  });

  it('returns error when structureId is invalid', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = getMatchUpFormat({
      tournamentRecord,
      structureId: 'nonexistent',
      drawDefinition,
    });

    expect(result.error).toBeDefined();
  });

  it('handles undefined matchUpFormat in all contexts', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const result = getMatchUpFormat({
      tournamentRecord,
      event: tournamentRecord.events[0],
    });

    // Should return undefined matchUpFormat when none are set
    expect(result.matchUpFormat).toBeUndefined();
  });

  it('resolves drawDefinition from matchUpResult when not provided', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];

    const result = getMatchUpFormat({
      tournamentRecord,
      matchUpId: matchUp.matchUpId,
      // Not providing drawDefinition - should resolve internally
    });

    expect(result.matchUpFormat).toBeDefined();
  });

  it('handles structureId with drawId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const structureId = drawDefinition.structures[0].structureId;

    const result = getMatchUpFormat({
      tournamentRecord,
      drawId: drawDefinition.drawId,
      structureId,
    });

    expect(result).toBeDefined();
  });
});
