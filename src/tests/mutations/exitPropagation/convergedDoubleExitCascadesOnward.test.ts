import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * The CONVERGED double exit: BOTH feeders of a matchUp are double exits, so nobody can ever arrive
 * on either side of it. The converged matchUp is itself a double exit, and it must cascade onward
 * exactly as a single one does — which is the case this branch is named for.
 *
 * The onward exit is PENDING: `3|1` takes a WALKOVER with provenance on the side the exit arrived
 * on and NO winningSide, because the other side is still to be decided by `2|2`. Awarding there
 * would be awarding against a side that has not arrived — see `byeIsNeverWon.test.ts`.
 */
it('a matchUp whose BOTH feeders are double exits cascades the exit onward', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, drawId: 'A' }],
  });
  tournamentEngine.setState(tournamentRecord);

  const find = (roundNumber: number, roundPosition: number) => {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    return matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);
  };
  const enter = (matchUp: any, matchUpStatus: string) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      outcome: { matchUpStatus },
    });

  expect(enter(find(1, 1), DOUBLE_WALKOVER).success).toEqual(true);
  expect(enter(find(1, 2), DOUBLE_WALKOVER).success).toEqual(true);

  // the convergence: both feeders exited, so the target is a double exit and carries provenance on
  // BOTH sides, each naming the DOUBLE_WALKOVER it came from
  const converged = find(2, 1);
  expect(converged.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.winningSide).toBeUndefined();
  expect(converged.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.sideExitProvenance?.[1]?.matchUpStatus).toEqual(WALKOVER);
  expect(converged.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);

  // and it cascades ONWARD rather than stopping at the convergence
  const onward = find(3, 1);
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  expect(onward.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(onward.sideExitProvenance?.[2]).toBeUndefined();

  // PENDING — 2|2 has not been played, so there is no side to award against
  expect(onward.winningSide).toBeUndefined();
  expect(find(2, 2).matchUpStatus).toEqual(TO_BE_PLAYED);
});
