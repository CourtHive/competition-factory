import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';

function generateRoundRobinMainWithQualifying() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: ROUND_ROBIN,
        drawSize: 16,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }],
          },
        ],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const mainStructure = drawDefinition.structures.find(({ stage, stageSequence }) => {
    return stage === MAIN && stageSequence === 1;
  });
  const groupMatchUpIds = mainStructure.structures.flatMap((group) => group.matchUps).map(({ matchUpId }) => matchUpId);

  return { drawId, structureId: mainStructure.structureId, groupMatchUpIds };
}

describe('removeStructure() on a round robin MAIN stageSequence 1 with qualifying', () => {
  it('a round robin main with group scores is not removed', () => {
    const { drawId, structureId, groupMatchUpIds } = generateRoundRobinMainWithQualifying();
    expect(groupMatchUpIds.length).toBeGreaterThan(0);

    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const readyMatchUp = matchUps?.find(({ matchUpId, readyToScore }) => {
      return readyToScore && groupMatchUpIds.includes(matchUpId);
    });
    expect(readyMatchUp).toBeDefined();

    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    const matchUpId = readyMatchUp?.matchUpId;
    let result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
    expect(result.success).toEqual(true);

    result = tournamentEngine.removeStructure({ drawId, structureId });
    expect(result.error).toEqual(SCORES_PRESENT);
  });

  it('a round robin main is returned to an empty state through its groups, with a delete notice for each', () => {
    const deletedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETED_MATCHUP_IDS]: (notices) => notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds)),
      },
    });

    const { drawId, structureId, groupMatchUpIds } = generateRoundRobinMainWithQualifying();
    const result: any = tournamentEngine.removeStructure({ drawId, structureId });
    expect(result.success).toEqual(true);

    const sorted = (ids: string[]) => ids.toSorted((a, b) => a.localeCompare(b));
    expect(sorted(result.removedMatchUpIds)).toEqual(sorted(groupMatchUpIds));
    expect(sorted(deletedMatchUpIds)).toEqual(sorted(groupMatchUpIds));

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s) => s.structureId === structureId);
    expect(mainStructure.structures).toEqual([]);
    expect(mainStructure.matchUps).toBeUndefined();
    expect(mainStructure.positionAssignments).toBeUndefined();
    expect(mainStructure.seedAssignments).toEqual([]);
    setSubscriptions({ subscriptions: { [DELETED_MATCHUP_IDS]: undefined } });
  });
});
