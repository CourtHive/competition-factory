import { setSubscriptions } from '@Global/state/globalState';
import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

function generateRoundRobinQualifying({ completeAllMatchUps = false } = {}) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps,
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, drawType: ROUND_ROBIN, qualifyingPositions: 4 }],
          },
        ],
      },
    ],
  });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const groupMatchUpIds = qualifyingStructure.structures
    .flatMap((group) => group.matchUps)
    .map(({ matchUpId }) => matchUpId);

  return { drawId, structureId: qualifyingStructure.structureId, groupMatchUpIds };
}

describe('resetQualifyingStructure() on a round robin qualifying structure', () => {
  it('a qualifying round robin with scores is not reset', () => {
    const { drawId, structureId, groupMatchUpIds } = generateRoundRobinQualifying();
    expect(groupMatchUpIds.length).toBeGreaterThan(0);

    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    let result: any = tournamentEngine.setMatchUpStatus({ matchUpId: groupMatchUpIds[0], outcome, drawId });
    expect(result.success).toEqual(true);
    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId: groupMatchUpIds[0], drawId });
    expect(matchUp?.matchUpStatus).toEqual(COMPLETED);

    result = tournamentEngine.resetQualifyingStructure({ drawId, structureId });
    expect(result.error).toEqual(SCORES_PRESENT);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures.find((s) => s.structureId === structureId);
    expect(qualifyingStructure.structures.flatMap((group) => group.matchUps).length).toEqual(groupMatchUpIds.length);
  });

  it('a qualifying round robin is reset through its groups, with a delete notice for each group matchUp', () => {
    const deletedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETED_MATCHUP_IDS]: (notices) => notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds)),
      },
    });

    const { drawId, structureId, groupMatchUpIds } = generateRoundRobinQualifying();
    const result: any = tournamentEngine.resetQualifyingStructure({ drawId, structureId });
    expect(result.success).toEqual(true);

    expect(deletedMatchUpIds.toSorted((a, b) => a.localeCompare(b))).toEqual(
      groupMatchUpIds.toSorted((a, b) => a.localeCompare(b)),
    );

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const qualifyingStructure = drawDefinition.structures.find((s) => s.structureId === structureId);
    expect(qualifyingStructure.structures).toEqual([]);
    expect(qualifyingStructure.matchUps).toBeUndefined();
    expect(qualifyingStructure.positionAssignments).toBeUndefined();
    expect(qualifyingStructure.seedAssignments).toEqual([]);

    expect(tournamentEngine.allDrawMatchUps({ drawId }).matchUps?.length).toEqual(15);
    setSubscriptions({ subscriptions: { [DELETED_MATCHUP_IDS]: undefined } });
  });
});
