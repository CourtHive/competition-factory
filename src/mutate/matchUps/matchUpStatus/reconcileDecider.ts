import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import { BYE, DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

/**
 * A DECIDER IS PLAYED ONLY IF IT IS NEEDED, and says so when it is not.
 *
 * A decider is the matchUp BOTH sides of a final feed — its winner and its loser go to the same
 * place. DOUBLE_ELIMINATION is the shape that has one: the undefeated finalist meets the Backdraw
 * champion, and if the undefeated finalist loses, both have lost once and they play again.
 *
 * If the undefeated finalist WINS, the other has lost twice and the event is over. The engine
 * seated the pair in the decider regardless, so it stood `TO_BE_PLAYED` with two participants — a
 * match a client would show as waiting to be played, and that a play-forward harness played.
 *
 * ## The rule — CA, 2026-09-29
 *
 * *"We implement logic to set it to a DEAD_RUBBER when it is unnecessary so that clients don't see
 * TO_BE_PLAYED matchUps; changing the winningSide of the final can clear the DEAD_RUBBER if the
 * decider becomes necessary. If someone wanted to clear the DEAD_RUBBER and play the decider 'just
 * for fun', there's no reason to prevent that."*
 *
 * And of a decider that was played before its final was changed: *"the decider should not have been
 * played … it should be destroyed."* No confirmation and no `force` flag — *"that would
 * overcomplicate the pipeline for an edge case that may never occur."*
 *
 * ## It acts only when the FINAL's winner changes
 *
 * This runs at the end of every `setMatchUpStatus`, for each final whose `winningSide` is different
 * from what it was before the mutation — see `getDeciderFinals`. That is what keeps the third clause
 * of the rule true: clearing a DEAD_RUBBER and playing the decider is a mutation of the DECIDER,
 * which this never reacts to, so a result entered for fun stays.
 *
 * ## The final need not be the matchUp that was scored
 *
 * A final can be decided by an ARRIVAL. When the Backdraw produces no champion its seat in the final
 * holds a produced exit, and the final gets its `winningSide` when the Main champion arrives there —
 * as a consequence of a result entered somewhere else. Asking only about the scored matchUp missed
 * every one of those: the last four cells of `verify:stall-budget`, all DOUBLE_ELIMINATION 16/16,
 * each a winner alone in a `TO_BE_PLAYED` decider. So the question is asked of the finals, by their
 * state before and after, and not of the mutation.
 *
 * ## NEEDED is asked of the results, not of the draw type
 *
 * The decider is needed when the final's LOSER has lost only that once. Counting losses is the
 * definition of the format rather than a description of one bracket layout, so it holds for any
 * structure that feeds a matchUp from both sides of another.
 *
 * A final that was WON and has no loser — its other side was an exit — has nobody to send, so its
 * decider is not needed either. The winner is seated there by the link, as both finalists are when
 * the undefeated one wins, and the matchUp says `DEAD_RUBBER` for the same reason.
 *
 * ## Why `swapWinnerLoser` needed this and the ordinary path did not
 *
 * Re-entering a result re-seats the pair through the links. A swap is a relabel, and
 * `getDownstreamStructureIds` declines a target that both sides of the flipped matchUp feed —
 * *"exchanging two participants who are both already there is a claim about their roles"* — so the
 * decider kept its occupants, its seats and its result. Those were the only two divergences in 698
 * flips of the route differential (punch-list P18). With the seats settled here, by the rule rather
 * than by relabelling, both routes leave the same decider and the allowance for them is gone.
 */
export function reconcileDecider({
  winningSideBefore,
  tournamentRecord,
  drawDefinition,
  matchUpId,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  winningSideBefore?: number;
  matchUpId?: string;
  event?: Event;
}): ResultType {
  if (!drawDefinition || !matchUpId) return { ...SUCCESS };

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const final = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  if (!final || final.collectionId || final.winningSide === winningSideBefore) return { ...SUCCESS };

  const targetData = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });
  if (targetData.error) return decorateResult({ result: targetData, stack: 'reconcileDecider' });
  const { winnerMatchUp, loserMatchUp } = targetData.targetMatchUps ?? {};
  const feedsOneMatchUp = winnerMatchUp?.matchUpId && winnerMatchUp.matchUpId === loserMatchUp?.matchUpId;
  if (!feedsOneMatchUp || winnerMatchUp.structureId === final.structureId) return { ...SUCCESS };

  const decider = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId);
  if (!decider) return { ...SUCCESS };

  const participantOn = (sideNumber?: number) =>
    (final.sides ?? []).find((side) => side.sideNumber === sideNumber)?.participantId;
  const winnerId = participantOn(final.winningSide);
  const loserId = final.winningSide ? participantOn(3 - final.winningSide) : undefined;

  if (winnerId && loserId) {
    seatFinalists({ structureId: winnerMatchUp.structureId, drawDefinition, winnerId, loserId });
  }

  const lossesOutsideTheDecider = (participantId?: string) =>
    inContextDrawMatchUps.filter(
      (matchUp) =>
        matchUp.matchUpId !== decider.matchUpId &&
        !matchUp.collectionId &&
        matchUp.winningSide &&
        (matchUp.sides ?? []).some(
          (side) => side.participantId === participantId && side.sideNumber !== matchUp.winningSide,
        ),
    ).length;
  const needed = !!loserId && lossesOutsideTheDecider(loserId) < 2;
  const matchUpStatus = winnerId && !needed ? DEAD_RUBBER : TO_BE_PLAYED;

  const holdsAResult = !!decider.winningSide || !!decider.score?.sets?.length;
  if (!holdsAResult && decider.matchUpStatus === matchUpStatus) return { ...SUCCESS };

  // WHAT THE CASCADE PLACED IS NOT OVERWRITTEN. A final that becomes a double exit sends the decider
  // a BYE (the default policy) or a produced exit (the policy off), and that is the decider's whole
  // record: nobody is coming from that final. Writing `TO_BE_PLAYED` over it said the opposite.
  // Measured 2026-09-30 by `correctionDivergenceDeep`: a DOUBLE_ELIMINATION final corrected from a
  // WALKOVER to a DOUBLE_WALKOVER left the decider `TO_BE_PLAYED` where the direct entry left it
  // `BYE`, in four cells. A result is still destroyed, as the rule says; a placement stays.
  if (!holdsAResult && (decider.matchUpStatus === BYE || isAnyExit(decider.matchUpStatus))) return { ...SUCCESS };

  // RETURNED, not dropped. This was a bare call and the function returned nothing, so a write that
  // failed left the decider as it was and `setMatchUpStatus` reported success.
  return modifyMatchUpScore({
    matchUpId: decider.matchUpId,
    removeWinningSide: true,
    context: 'reconcileDecider',
    removeScore: true,
    matchUp: decider,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    event,
  });
}

/**
 * The matchUps that feed a decider, with the `winningSide` each holds now.
 *
 * Read from the LINKS: a round whose winners and losers are both sent to the same other structure.
 * A draw with no such pair of links returns nothing, which is every draw type but one, so the cost
 * to `setMatchUpStatus` of asking is a scan of the links.
 */
export function getDeciderFinals(drawDefinition?: DrawDefinition): Map<string, number | undefined> {
  const finals = new Map<string, number | undefined>();
  const links = drawDefinition?.links ?? [];

  for (const winnerLink of links.filter((link) => link.linkType === WINNER)) {
    const { structureId, roundNumber } = winnerLink.source ?? {};
    const targetStructureId = winnerLink.target?.structureId;
    const feedsBoth = links.some(
      (link) =>
        link.linkType === LOSER &&
        link.source?.structureId === structureId &&
        link.source?.roundNumber === roundNumber &&
        link.target?.structureId === targetStructureId,
    );
    if (!feedsBoth || targetStructureId === structureId) continue;

    const { structure } = findStructure({ drawDefinition, structureId });
    for (const matchUp of matchUpsOf(structure) ?? []) {
      if (matchUp.roundNumber === roundNumber) finals.set(matchUp.matchUpId, matchUp.winningSide);
    }
  }

  return finals;
}

/** Settle the decider of every final whose winner is not what it was — see `reconcileDecider`. */
export function reconcileDeciders({
  tournamentRecord,
  drawDefinition,
  finalsBefore,
  event,
}: {
  finalsBefore: Map<string, number | undefined>;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): ResultType {
  if (!finalsBefore.size) return { ...SUCCESS };

  for (const [matchUpId, winningSide] of getDeciderFinals(drawDefinition)) {
    if (winningSide === finalsBefore.get(matchUpId)) continue;
    const result = reconcileDecider({
      winningSideBefore: finalsBefore.get(matchUpId),
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

/**
 * The final's winner takes the decider's first seat and its loser the second — which is where the
 * links put them when a result is entered, measured in both directions on DOUBLE_ELIMINATION 8/8.
 * Both are already in the structure; only which of them sits where can be out of date.
 */
function seatFinalists({
  drawDefinition,
  structureId,
  winnerId,
  loserId,
}: {
  drawDefinition: DrawDefinition;
  structureId: string;
  winnerId: string;
  loserId: string;
}) {
  const { structure } = findStructure({ drawDefinition, structureId });
  const assignments = (getPositionAssignments({ structure }).positionAssignments ?? [])
    .filter((assignment) => assignment.participantId === winnerId || assignment.participantId === loserId)
    .sort((a, b) => a.drawPosition - b.drawPosition);
  if (assignments.length !== 2 || assignments[0].participantId === winnerId) return;

  assignments[0].participantId = winnerId;
  assignments[1].participantId = loserId;
}
