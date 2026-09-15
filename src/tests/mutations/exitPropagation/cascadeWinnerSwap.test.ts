import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * The PROPAGATION CASCADE can re-score an already-decided matchUp with a different winner, and when
 * it does it reaches `swapWinnerLoser`.
 *
 * `progressExitStatus` hardcodes `allowChangePropagation: true` (and `propagatingExit: true`) on its
 * internal `setMatchUpState` call, so the branch that serves an operator correction is also on the
 * cascade's own path. **"Flag-OFF" and "the swap branch is unreachable" are therefore not the same
 * claim** — the cascade enters it with no consumer involved.
 *
 * This test exists so that the CASCADE's reachability is pinned rather than incidental.
 * Delta-debugged from census seed 9100247's 30-step schedule down to three steps.
 *
 * **What it pins, measured rather than asserted.** Making `swapWinnerLoser` throw fails 12 tests
 * across 5 files, so the function is far from untested — `swapWinnerLoserFedStructures` (5),
 * `changePropagationPolicy` (4), `allowChangePropagationFlag`, `swapWinnerLoserEligibility` and this
 * one. What the other eleven have in common is that they all arrive through the CONSUMER flag. This
 * is the only one that arrives through the cascade's own hardcoded call, which is the path a change
 * to `progressExitStatus` would break silently.
 *
 * **It does NOT pin the relabel, and two attempts to make it do so both failed — which is the
 * finding.** Neutering the swap (both `participantId` writes made no-ops) fails six OTHER tests and
 * leaves this one green. Adding an integrity scan does not catch it, because a relabel that does
 * nothing still leaves a self-consistent draw. Adding a positional assertion on the back-draw
 * occupant does not catch it either.
 *
 * The reason is worth carrying forward: **in this scenario the swap's relabel makes no observable
 * difference**, because the cascade re-derives the placement through its own traversal regardless.
 * So the cascade's documented dependence on `swapWinnerLoser` is NOT a dependence on the relabel —
 * it is a dependence on the function NOT clearing and replaying. That is the distinction anyone
 * trying to retire this function needs: seed 9100247 fails under a clear-and-replay correction,
 * `noDownstreamDependencies` and the ordinary dispatch alike, and none of those failures is about
 * who gets relabelled.
 *
 * The relabel is covered by the five consumer-path files; do not let this test's presence suggest
 * otherwise. The back-draw assertion below is kept because it is a stronger statement than the
 * integrity scan and would catch a cascade that stopped placing the loser at all — but it is not
 * evidence about the relabel.
 *
 * A note on provenance, because the original form of this test claimed more than it could support.
 * It was written on a branch where the consumer path had been moved OFF `swapWinnerLoser`, leaving
 * the cascade as the only caller — there, `pnpm verify`'s per-file coverage gate reported 0% for the
 * file, which is hard evidence for "nothing else reaches it". On `dev` that is false: making the
 * function throw fails 12 tests across 5 files. The claim was tree-dependent and stated without the
 * qualifier. What survives in BOTH trees is the sentence above: this is the only test arriving
 * through the cascade's hardcoded call.
 *
 * Seed 9100247 is also the scenario that measured the cascade's DEPENDENCE on this path: it passes
 * here and fails under a clear-and-replay correction, `noDownstreamDependencies` and the ordinary
 * dispatch alike. Asking the cascade to clear and replay a subtree from inside its own traversal is
 * re-entrant, and measurably wrong.
 *
 * Carried from the parallel structural workstream, which wrote and shrank it; see
 * `Mentat/planning/SWAP_WINNER_LOSER_TWO_ROUTES.md`.
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

  // The relabel is observable DOWNSTREAM, not here.
  //
  // A swap does not move anyone within the structure they played in — the drawPosition/participant
  // binding THERE is precisely what does not change, and asserting it swapped fails against correct
  // behaviour (measured: positions 7 and 8 hold the same participants before and after). What
  // changes is which of the two occupies the back-draw place their loss fed.
  const contestants = (() => {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const found: any = matchUps.find((matchUp: any) => coordinates(matchUp) === 'East|1|4');
    return (found?.sides ?? []).map((side: any) => side.participantId).filter(Boolean);
  })();
  // CONTROL: two distinct contestants, or "the other one" below is not well defined.
  expect(new Set(contestants).size).toEqual(2);

  const backDrawOccupants = () => {
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const west: any = drawDefinition.structures.find((structure: any) => structure.structureName === 'West');
    return (west?.positionAssignments ?? []).map((assignment: any) => assignment.participantId).filter(Boolean);
  };
  const fedBefore = contestants.filter((participantId: string) => backDrawOccupants().includes(participantId));
  // CONTROL: exactly one of the pair is in the back draw before the re-decision — the one who lost.
  expect(fedBefore).toHaveLength(1);

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

  // The relabel itself: the back-draw place must now be held by the OTHER contestant. An integrity
  // scan cannot distinguish a correct relabel from a no-op — both leave a self-consistent draw —
  // which is why this is asserted directly.
  const expected = contestants.find((participantId: string) => participantId !== fedBefore[0]);
  const fedAfter = contestants.filter((participantId: string) => backDrawOccupants().includes(participantId));
  expect(fedAfter).toEqual([expected]);
});
