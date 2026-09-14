import { removeMatchUpSideParticipant } from '@Mutate/matchUps/sides/removeMatchUpSideParticipant';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_DRAW_TYPE, INVALID_VALUES, MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

describe('removeMatchUpSideParticipant', () => {
  // Unit tests for parameter validation
  it('returns error when tournamentRecord is missing', () => {
    const result = removeMatchUpSideParticipant({
      drawDefinition: {} as any,
      matchUpId: 'test',
    } as any);

    expect(result.error).toBeDefined();
  });

  it('returns error when drawDefinition is missing', () => {
    const result = removeMatchUpSideParticipant({
      tournamentRecord: {} as any,
      matchUpId: 'test',
    } as any);

    expect(result.error).toBeDefined();
  });

  it('returns error when matchUpId is missing', () => {
    const result = removeMatchUpSideParticipant({
      tournamentRecord: {} as any,
      drawDefinition: {} as any,
    } as any);

    expect(result.error).toBeDefined();
  });

  it('returns error when sideNumber is invalid (not 1 or 2)', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = removeMatchUpSideParticipant({
      matchUpId: 'test',
      tournamentRecord,
      drawDefinition,
      sideNumber: 3,
    });

    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when sideNumber is 0', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = removeMatchUpSideParticipant({
      matchUpId: 'test',
      tournamentRecord,
      drawDefinition,
      sideNumber: 0,
    });

    expect(result.error).toBeDefined();
  });

  it('returns error when matchUp not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = removeMatchUpSideParticipant({
      tournamentRecord,
      drawDefinition,
      matchUpId: 'nonexistent',
    });

    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });

  it('returns error when matchUp is not in an ad hoc structure', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);
    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const result = removeMatchUpSideParticipant({
      tournamentRecord,
      drawDefinition,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.error).toEqual(INVALID_DRAW_TYPE);
  });
});
