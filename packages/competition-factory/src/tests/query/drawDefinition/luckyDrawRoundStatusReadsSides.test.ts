import { getLuckyDrawRoundStatus } from '@Query/drawDefinition/getLuckyDrawRoundStatus';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * `getLuckyDrawRoundStatus` reads STORED matchUps, which carry no `sides`, so it names a side's
 * participant from `drawPositions`. It read `drawPositions[sideNumber - 1]`, and while one position is
 * present the index is not the side: `[undefined, 3]` and `[3]` are one matchUp, 3 on side 2, and the
 * compacted spelling put 3 on side 1. The reader now asks `getSideDrawPosition`, which resolves a lone
 * position through the round profile (Mentat `planning/LEADING_HOLE_REMOVAL_DESIGN.md`).
 *
 * LUCKY_DRAW 11: round 1 has six matchUps (one a BYE), round 2 three, so round 2 is a pre-feed round
 * and reports its advancing winners and its eligible losers.
 */
const drawId = 'lucky-reads-sides';

function completedLuckyDraw() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: LUCKY_DRAW, drawSize: 11, drawId }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const participantAt = (drawPosition?: number) =>
    structure.positionAssignments.find((assignment: any) => assignment.drawPosition === drawPosition)?.participantId;
  return { drawDefinition, structure, participantAt };
}

it('names each round-2 winner and loser by side, as the hydrated matchUps do', () => {
  const { drawDefinition } = completedLuckyDraw();
  const result: any = getLuckyDrawRoundStatus({ drawDefinition });
  const round2 = result.rounds.find((round: any) => round.roundNumber === 2);
  expect(round2.isPreFeedRound).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const hydrated = matchUps
    .filter((m: any) => m.roundNumber === 2)
    .sort((a: any, b: any) => a.roundPosition - b.roundPosition);
  const sideOf = (m: any, sideNumber: number) =>
    m.sides.find((side: any) => side.sideNumber === sideNumber).participantId;

  expect(round2.advancingWinners.map(({ participantId }) => participantId)).toEqual(
    hydrated.map((m: any) => sideOf(m, m.winningSide)),
  );
  expect(
    round2.eligibleLosers.map(({ participantId }) => participantId).sort((a: string, b: string) => a.localeCompare(b)),
  ).toEqual(hydrated.map((m: any) => sideOf(m, 3 - m.winningSide)).sort((a: string, b: string) => a.localeCompare(b)));
});

it('a lone side-2 winner is named for [3] exactly as for [undefined, 3]', () => {
  const answers = [[3], [undefined, 3]].map((spelling) => {
    const { drawDefinition, structure, participantAt } = completedLuckyDraw();
    // round 2's first matchUp, its side-1 position emptied and the walkover awarded to side 2
    const matchUp = structure.matchUps.find((m: any) => m.roundNumber === 2 && m.roundPosition === 1);
    expect(matchUp.drawPositions).toEqual([2, 3]);
    Object.assign(matchUp, { drawPositions: spelling, winningSide: 2, matchUpStatus: WALKOVER, score: undefined });

    const result: any = getLuckyDrawRoundStatus({ drawDefinition });
    const round2 = result.rounds.find((round: any) => round.roundNumber === 2);
    const winner = round2.advancingWinners.find((info: any) => info.matchUpId === matchUp.matchUpId);
    return { winner: winner?.participantId, expected: participantAt(3) };
  });

  for (const { winner, expected } of answers) {
    expect(expected).toBeDefined();
    // dev: `[undefined, 3]` named the participant at 3, `[3]` named nobody (index 1 is past the end)
    expect(winner).toEqual(expected);
  }
});
