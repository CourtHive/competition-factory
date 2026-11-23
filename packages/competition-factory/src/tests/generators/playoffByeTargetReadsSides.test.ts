import { advanceByeMatchUps } from '@Generators/drawDefinitions/generateAndPopulatePlayoffStructures';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * Adding a playoff structure carries each source BYE into it: the BYE matchUp's LOSER target position
 * gets a BYE. The target position was read `loserMatchUp.drawPositions[loserMatchUpDrawPositionIndex]`,
 * and while one position is present the index is not the side — `[undefined, 9]` and `[9]` are one
 * matchUp, 9 on side 2, and the compacted spelling named nobody. It now asks `getSideDrawPosition`
 * (Mentat `planning/LEADING_HOLE_REMOVAL_DESIGN.md`).
 *
 * At generation the playoff's first round holds both positions, so the engine path never meets a lone
 * one; the spelling case is driven against the same function with the target re-spelled.
 *
 * SINGLE_ELIMINATION 16 with 12 participants: four first-round BYEs, whose losers' targets are the
 * playoff's first round.
 */
const drawId = 'playoff-bye-target';

function drawWithByes() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, participantsCount: 12, drawId }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return { structureId: drawDefinition.structures[0].structureId };
}

const byeMatchUpsOf = (matchUps: any[], structureId: string) =>
  matchUps.filter((m) => m.structureId === structureId && m.matchUpStatus === BYE);

it('adding a playoff for round 1 carries every first-round BYE into it', () => {
  const { structureId } = drawWithByes();
  const result = tournamentEngine.addPlayoffStructures({ roundNumbers: [1], structureId, drawId });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const playoff = drawDefinition.structures.find((s: any) => s.structureId !== structureId);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const sourceByes = byeMatchUpsOf(matchUps, structureId).filter((m: any) => m.roundNumber === 1);
  expect(sourceByes.length).toEqual(4);

  const playoffByes = playoff.positionAssignments.filter((assignment: any) => assignment.bye);
  expect(playoffByes.length).toEqual(sourceByes.length);
});

it('a BYE reaches its side-2 target for [9] exactly as for [undefined, 9]', () => {
  const answers = [false, true].map((holed) => {
    const { structureId } = drawWithByes();
    expect(tournamentEngine.addPlayoffStructures({ roundNumbers: [1], structureId, drawId }).success).toEqual(true);

    // a private copy: the BYE the engine placed at one side-2 target is lifted, to be placed again
    const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const playoff = drawDefinition.structures.find((s: any) => s.structureId !== structureId);

    const matchUps: any[] = getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? [];
    // an EVEN source roundPosition feeds side 2 of its target (TOP_DOWN)
    const source = byeMatchUpsOf(matchUps, structureId).find((m: any) => m.roundPosition % 2 === 0);
    const target = matchUps.find((m: any) => m.matchUpId === source.loserMatchUpId);
    const sideTwo = target.sides.find((side: any) => side.sideNumber === 2).drawPosition;
    const assignment = playoff.positionAssignments.find((candidate: any) => candidate.drawPosition === sideTwo);
    expect(assignment.bye).toEqual(true);
    delete assignment.bye;

    const spelling = holed ? [undefined, sideTwo] : [sideTwo];
    const inContextDrawMatchUps = (getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? []).map(
      (m: any) => (m.matchUpId === target.matchUpId ? { ...m, drawPositions: spelling } : m),
    );
    advanceByeMatchUps({
      inContextDrawMatchUps,
      sourceStructureId: structureId,
      tournamentRecord,
      drawDefinition,
      event,
    });

    return !!playoff.positionAssignments.find((candidate: any) => candidate.drawPosition === sideTwo)?.bye;
  });

  // dev: `[undefined, 9]` -> BYE placed, `[9]` -> `drawPositions[1]` is past the end, nothing placed
  expect(answers).toEqual([true, true]);
});
