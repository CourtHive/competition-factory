import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';

test('a round robin draw is not pruned and nothing is written onto its container', () => {
  const deletedMatchUpIds: string[] = [];
  setSubscriptions({
    subscriptions: {
      [DELETED_MATCHUP_IDS]: (notices) => notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds)),
    },
  });

  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 8 }],
    setState: true,
  });

  // one first-round result makes the draw read as prunable match play
  const firstRoundMatchUp = tournamentEngine.allDrawMatchUps({ drawId }).matchUps?.find((m) => m.roundNumber === 1);
  const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
  let result: any = tournamentEngine.setMatchUpStatus({ matchUpId: firstRoundMatchUp?.matchUpId, outcome, drawId });
  expect(result.success).toEqual(true);

  const { drawsAnalysis } = tournamentEngine.analyzeDraws();
  expect(drawsAnalysis.canBePruned).toEqual([drawId]);
  expect(drawsAnalysis.matchPlay).toEqual([drawId]);

  const before = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];

  result = tournamentEngine.pruneDrawDefinition({ drawId });
  expect(result.success).toEqual(true);

  const after = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(Object.keys(after)).not.toContain('matchUps');
  expect(Object.keys(after)).not.toContain('positionAssignments');
  expect(after.structures).toEqual(before.structures);
  expect(tournamentEngine.allDrawMatchUps({ drawId }).matchUps?.length).toEqual(12);
  expect(deletedMatchUpIds).toEqual([]);

  setSubscriptions({ subscriptions: { [DELETED_MATCHUP_IDS]: undefined } });
});
