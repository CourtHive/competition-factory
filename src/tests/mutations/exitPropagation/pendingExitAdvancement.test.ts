import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
} from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

/**
 * Re-scoring an upstream walkover must not leave a PHANTOM walkover in the consolation.
 *
 * ## What this suite was, and why its subject changed
 *
 * It was written for `assignMatchUpDrawPosition`'s `positionAssigned && isPropagatedExit` branch,
 * which advanced an arriving drawPosition unconditionally. A participant can arrive on the EXITING
 * side of a pending exit — re-scoring an upstream matchUp swaps which participant is the loser, so
 * the consolation seat is vacated and re-filled, and by then the matchUp is already an exit.
 * `arrivesOnExitingSide` is the guard that resulted.
 *
 * **The scenario below no longer reaches that guard, and the reason is a defect this suite was
 * silently pinning.** Its control asserted that the scenario ends with a decided consolation
 * walkover. Measured on `dev` 2026-09-13, that walkover was a phantom: after the re-score,
 * CONSOLATION/1.2 kept `WALKOVER winningSide: 2` and provenance naming a source that had become a
 * COMPLETED match, while its occupant had been swapped for a participant who never walked over.
 * The next arrival then won a walkover nobody played, and under FIRST_MATCH_LOSER_CONSOLATION
 * advanced through a BYE on the strength of it. `getDrawInconsistencies` reported nothing at any
 * step, which is why it survived a suite whose other assertions all run through that checker.
 *
 * `withdrawProducedExits` takes the exit back when its source stops being one, so the consolation
 * matchUp now reverts to TO_BE_PLAYED and there is no exit for anyone to arrive at. The assertions
 * below were re-authored onto that — the PHANTOM is the subject now, and the oracle is provenance
 * rather than the inconsistency checker, because the checker demonstrably could not see it.
 *
 * ## `arrivesOnExitingSide` is no longer covered here, and that is stated rather than implied
 *
 * Measured, not assumed. Instrumenting the branch across the 600 frozen census schedules: **138
 * hits at `dev`, 19 with the withdrawal in place** — the path survives, the withdrawal makes it
 * rare. But forcing `arrivesOnExitingSide` to `false`:
 *
 *  - leaves all five cases in this file GREEN;
 *  - leaves the 600-seed frozen-schedule census at **27 failing seeds, unchanged**;
 *  - on the smallest of the 19 surviving hits (seed 9000489, an 8-draw FEED_IN_CHAMPIONSHIP),
 *    produces a draw that is byte-identical apart from generated ids.
 *
 * So no oracle in this repo currently discriminates that guard. It is left in place — it is cheap,
 * and one 600-seed window is not proof of unreachability — but nothing here should be read as
 * testing it. See `Mentat/planning/DESIGN_FLAWS_PUNCH_LIST.md`.
 *
 * Gated on `propagateExitStatus`, which nothing in the ecosystem currently sets; the policy is
 * attached here so the scenario is reachable at all.
 */

const DRAW_ID = 'pending-exit-advancement';

function mainRoundOne(roundPosition: number) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.stage === 'MAIN' && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
    );
}

function issues() {
  const drawDefinition = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const result: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  return (result?.inconsistencies ?? []).map((issue: any) => issue.issueType);
}

/**
 * Every exit whose provenance names a source that is no longer an exit.
 *
 * This is the oracle the phantom needed and the inconsistency checker does not provide. Provenance
 * is a claim about WHERE an exit came from, so a matchUp asserting `previousMatchUpStatus: WALKOVER`
 * from a source that now records a completed result is asserting something false about the draw —
 * whatever its own status, its occupants, or its winningSide happen to look like.
 */
function phantomExits() {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps;
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));

  return matchUps.flatMap((matchUp: any) =>
    Object.values(matchUp.sideExitProvenance ?? {})
      .filter((entry: any) => {
        if (!entry?.sourceMatchUpId) return false;
        const source: any = byId.get(entry.sourceMatchUpId);
        // a source that is absent is not evidence of a phantom — it is a different draw's matchUp,
        // or one this projection does not carry
        if (!source) return false;
        return source.matchUpStatus !== entry.previousMatchUpStatus;
      })
      .map((entry: any) => ({
        source: (byId.get(entry.sourceMatchUpId) as any)?.matchUpStatus,
        claimed: entry.previousMatchUpStatus,
        matchUpId: matchUp.matchUpId,
      })),
  );
}

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, first: 3 },
  { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, first: 3 },
  { drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, first: 3 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, first: 3 },
])('re-scoring a walkover in a $drawType withdraws the exit it produced', ({ drawType, first }) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_SCORING]: { policyName: 'carry exits', propagateExitStatus: true } },
  });

  const score = (roundPosition: number, outcome: any) => {
    const matchUp = mainRoundOne(roundPosition);
    expect(matchUp?.matchUpId).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: DRAW_ID, outcome });
    expect(result.success).toEqual(true);
  };

  const consolationMatchUps = () =>
    tournamentEngine
      .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
      .matchUps.filter((matchUp: any) => matchUp.stage !== 'MAIN');

  // 1. the walkover propagates its loser into the consolation, carrying the exit status
  score(first, { matchUpStatus: WALKOVER, winningSide: 2 });
  expect(issues()).toEqual([]);

  // the control: the scenario must actually PRODUCE an exit, or step 2 withdraws nothing and every
  // assertion below passes vacuously. This is the control the old version lacked — it checked for a
  // decided walkover only at the END, by which point a phantom satisfies it just as well as a real
  // one does.
  const carried = consolationMatchUps().filter(
    (matchUp: any) => matchUp.matchUpStatus === WALKOVER && matchUp.sideExitProvenance,
  );
  expect(carried.length, `${drawType}: no exit was carried into the consolation`).toBeGreaterThan(0);
  const carriedMatchUpId = carried[0].matchUpId;

  // 2. the re-score replaces the walkover with a completed result, so it produces no exit at all.
  //    The exit it HAD produced must come back with it.
  score(first, { winningSide: 1 });
  expect(issues()).toEqual([]);

  const withdrawn = consolationMatchUps().find((matchUp: any) => matchUp.matchUpId === carriedMatchUpId);
  expect(withdrawn?.matchUpStatus, `${drawType}: the produced exit survived its source`).toEqual(TO_BE_PLAYED);
  expect(withdrawn?.winningSide).toBeUndefined();
  expect(withdrawn?.sideExitProvenance).toBeUndefined();
  // and the seat is still occupied — the withdrawal takes back the EXIT, never the placement. The
  // re-scored matchUp still has a loser and they still belong in the consolation.
  expect((withdrawn?.sides ?? []).filter((side: any) => side.participantId).length).toBeGreaterThan(0);

  // 3. the sibling delivers the second consolation player. Nobody wins on arrival: the matchUp they
  //    join is live, not a walkover somebody already holds.
  score(first % 2 === 1 ? first + 1 : first - 1, { winningSide: 2 });
  expect(issues()).toEqual([]);

  const resolved = consolationMatchUps().find((matchUp: any) => matchUp.matchUpId === carriedMatchUpId);
  expect(resolved?.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(resolved?.winningSide).toBeUndefined();
  expect((resolved?.sides ?? []).filter((side: any) => side.participantId).length).toEqual(2);

  // the general form, which does not depend on this scenario's shape: no exit anywhere in the draw
  // claims an origin its source no longer records
  expect(phantomExits()).toEqual([]);
});
