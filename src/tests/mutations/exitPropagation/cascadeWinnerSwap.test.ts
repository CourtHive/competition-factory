import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * The PROPAGATION CASCADE can re-score an already-decided matchUp with a different winner, and when
 * it does it reaches `swapWinnerLoser` — not `correctDecidedOutcome`.
 *
 * `progressExitStatus` hardcodes `allowChangePropagation: true` (and `propagatingExit: true`) on its
 * internal `setMatchUpState` call, so the branch in `resolveAndApplyOutcome` that serves an operator
 * correction is also on the cascade's own path. A consumer correction was moved off
 * `swapWinnerLoser` because it disagreed with the director's sequence on 36 of 189 flips; the
 * cascade was deliberately NOT moved, because it is already re-deriving progression and asking it to
 * clear and replay a subtree from inside its own traversal is re-entrant — and measurably wrong.
 * Census seed 9100247 (the scenario this test is shrunk from) passes on this path and fails under
 * `correctDecidedOutcome`, `noDownstreamDependencies` and the ordinary dispatch alike.
 *
 * This test exists so that split is PINNED rather than incidental. Delta-debugged from that seed's
 * 30-step schedule down to three steps; without it nothing in the suite reaches `swapWinnerLoser` at
 * all, and a later change could silently retire the cascade's only implementation.
 *
 * See Mentat/planning/SWAP_WINNER_LOSER_TWO_ROUTES.md, "Result — SWL-A".
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

function apply(drawId: string, coordinate: string, outcome: any) {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinate);
  // a step that matched no matchUp is silently skipped, which would make the assertions vacuous
  expect(target, `no matchUp at ${coordinate}`).toBeDefined();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
  return result;
}

it('a cascade that re-decides an already-decided matchUp leaves the draw consistent', () => {
  const drawId = 'cascade-swap';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId }],
    nonRandom: 9100247,
    setState: true,
  });
  setSubscriptions({});

  // 1. East|1|4 is decided, and its loser is directed into the back draw.
  expect(apply(drawId, 'East|1|4', { winningSide: 2 })?.error).toBeUndefined();

  // 2. a DOUBLE_DEFAULT alongside it produces exits that propagate.
  expect(apply(drawId, 'East|1|3', { matchUpStatus: DOUBLE_DEFAULT })?.error).toBeUndefined();

  // 3. re-deciding East|1|4 the OTHER way while that propagation is live is what puts the cascade
  //    into a winning-side change on a matchUp that already carries one.
  expect(apply(drawId, 'East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 })?.error).toBeUndefined();

  // CONTROL: the flip must actually have taken, or the integrity assertion below holds trivially
  // over a draw nothing changed.
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const flipped: any = matchUps.find((matchUp: any) => coordinates(matchUp) === 'East|1|4');
  expect(flipped?.winningSide).toEqual(1);
  expect(flipped?.matchUpStatus).toEqual(DEFAULTED);

  expect(tournamentEngine.getDrawInconsistencies({ drawId })?.inconsistencies ?? []).toEqual([]);
});
