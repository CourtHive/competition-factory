import { getTargetMatchUp } from '@Query/matchUps/getTargetMatchUp';
import { positionTargets } from '@Query/matchUp/positionTargets';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, WINNER } from '@Constants/drawDefinitionConstants';

/**
 * `getTargetMatchUp` names the drawPosition on the side a link's source feeds, for a target round that
 * reserves no fed slot. It read that position as `drawPositions.length === 2 && drawPositions[index]`,
 * which answers by ARRAY SHAPE: a lone side-2 position held as `[undefined, 1]` was named, the same
 * position held compacted as `[1]` was not (`false`). The leading hole is about to stop being written
 * (Mentat `planning/LEADING_HOLE_REMOVAL_DESIGN.md`), so the reader now asks `getSideDrawPosition`, and
 * the two shapes are one matchUp.
 *
 * The shape that reaches it: `DOUBLE_ELIMINATION`'s Main final, the target of the Backdraw's WINNER
 * link. Once the Main bracket is played its winner waits there alone on side 2 (it ADVANCED; the
 * Backdraw winner arrives on side 1), and the engine already stores that compacted, as `[1]`.
 */
const drawId = 'target-reads-sides';
const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

function playMainUpToItsFinal() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId }],
    setState: true,
  });
  // round by round, so each round is ready when it is scored
  for (const roundNumber of [1, 2, 3]) {
    const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
    const round = matchUps.filter((m: any) => m.structureName === 'Main' && m.roundNumber === roundNumber);
    for (const { matchUpId } of round) {
      expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
    }
  }
}

/** the stored drawDefinition, with the Main final re-spelled — the same occupancy either way */
function withMainFinalSpelled(drawPositions: (number | undefined)[]) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const main = drawDefinition.structures.find((s: any) => s.structureName === 'Main');
  const mainFinal = main.matchUps.find((m: any) => m.roundNumber === 4);
  mainFinal.drawPositions = drawPositions;
  const inContextDrawMatchUps = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.map((m: any) => (m.matchUpId === mainFinal.matchUpId ? { ...m, drawPositions } : m));
  return { drawDefinition, inContextDrawMatchUps, main, mainFinal };
}

it('the engine stores the Main final compacted, its lone advanced winner on side 2', () => {
  playMainUpToItsFinal();
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const mainFinal = matchUps.find((m: any) => m.structureName === 'Main' && m.roundNumber === 4);
  expect(mainFinal.drawPositions).toEqual([1]);
  const held = mainFinal.sides.filter((side: any) => side.drawPosition);
  expect(held.map(({ sideNumber, drawPosition }) => ({ sideNumber, drawPosition }))).toEqual([
    { sideNumber: 2, drawPosition: 1 },
  ]);
});

it("positionTargets: the Backdraw final's WINNER target names no position on the empty side, in either spelling", () => {
  playMainUpToItsFinal();

  for (const spelling of [[1], [undefined, 1]]) {
    const { drawDefinition, inContextDrawMatchUps, mainFinal } = withMainFinalSpelled(spelling);
    const backdrawFinal = inContextDrawMatchUps.find((m: any) => m.structureName === 'Backdraw' && m.roundNumber === 4);
    const result: any = positionTargets({ matchUpId: backdrawFinal.matchUpId, inContextDrawMatchUps, drawDefinition });

    expect(result.targetMatchUps.winnerMatchUp.matchUpId).toEqual(mainFinal.matchUpId);
    expect(result.targetMatchUps.winnerMatchUpDrawPositionIndex).toEqual(0);
    // dev: the compacted `[1]` answered `false` here, the holed one nothing — two answers for one matchUp
    expect(result.targetMatchUps.winnerTargetDrawPosition).toBeUndefined();
  }
});

it('getTargetMatchUp: the position on side 2 is named for [1] exactly as for [undefined, 1]', () => {
  playMainUpToItsFinal();

  const answers = [[1], [undefined, 1]].map((spelling) => {
    const { drawDefinition, inContextDrawMatchUps, main } = withMainFinalSpelled(spelling);
    const targetLink = drawDefinition.links.find(
      (link: any) => link.linkType === WINNER && link.target.structureId === main.structureId,
    );
    // an EVEN source roundPosition feeds the target's side 2 (index 1): the side the winner holds
    return getTargetMatchUp({
      sourceRoundMatchUpCount: 2,
      sourceRoundPosition: 2,
      inContextDrawMatchUps,
      drawDefinition,
      targetLink,
    });
  });

  for (const { matchUpDrawPositionIndex } of answers) expect(matchUpDrawPositionIndex).toEqual(1);
  // dev: `[undefined, 1]` -> 1, `[1]` -> false
  expect(answers.map(({ targetDrawPosition }) => targetDrawPosition)).toEqual([1, 1]);
});
