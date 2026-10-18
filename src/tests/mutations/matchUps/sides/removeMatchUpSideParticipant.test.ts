import { removeMatchUpSideParticipant } from '@Mutate/matchUps/sides/removeMatchUpSideParticipant';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import {
  INVALID_DRAW_TYPE,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

describe('removeMatchUpSideParticipant', () => {
  // Unit tests for parameter validation
  it('returns error when tournamentRecord is missing', () => {
    const result = removeMatchUpSideParticipant({
      drawDefinition: {} as any,
      matchUpId: 'test',
    } as any);

    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('returns error when drawDefinition is missing', () => {
    const result = removeMatchUpSideParticipant({
      tournamentRecord: {} as any,
      matchUpId: 'test',
    } as any);

    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when matchUpId is missing', () => {
    const result = removeMatchUpSideParticipant({
      tournamentRecord: {} as any,
      drawDefinition: {} as any,
    } as any);

    expect(result.error).toEqual(MISSING_MATCHUP_ID);
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

    expect(result.error).toEqual(INVALID_VALUES);
  });

  // 0 is falsy: it used to skip the 1-or-2 check and then clear BOTH sides of the matchUp
  it('sideNumber 0 is refused and clears nothing; no sideNumber clears both sides', () => {
    const drawProfile = { drawType: AD_HOC, automated: true, roundsCount: 1, drawSize: 8, completionGoal: 0 };
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
    const assigned = () =>
      tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.sides?.every((side) => side.participantId));
    const { matchUpId } = assigned();
    const participantIds = (id: string) =>
      tournamentEngine.findMatchUp({ drawId, matchUpId: id }).matchUp.sides.map((side) => side.participantId ?? null);

    let result: any = tournamentEngine.removeMatchUpSideParticipant({ drawId, matchUpId, sideNumber: 0 });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(participantIds(matchUpId).every(Boolean)).toEqual(true);

    result = tournamentEngine.removeMatchUpSideParticipant({ drawId, matchUpId, sideNumber: 2 });
    expect(result.success).toEqual(true);
    expect(participantIds(matchUpId).filter(Boolean).length).toEqual(1);

    result = tournamentEngine.removeMatchUpSideParticipant({ drawId, matchUpId });
    expect(result.success).toEqual(true);
    expect(participantIds(matchUpId)).toEqual([null, null]);
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
