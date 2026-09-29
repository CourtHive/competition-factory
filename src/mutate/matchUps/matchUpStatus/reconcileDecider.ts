import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DEAD_RUBBER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

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
 * This runs at the end of every `setMatchUpStatus`, and returns at once unless the matchUp that was
 * just scored feeds a decider AND its `winningSide` is different from what it was. That is what
 * keeps the third clause of the rule true: clearing a DEAD_RUBBER and playing the decider is a
 * mutation of the DECIDER, which this never reacts to, so a result entered for fun stays.
 *
 * ## NEEDED is asked of the results, not of the draw type
 *
 * The decider is needed when the final's LOSER has lost only that once. Counting losses is the
 * definition of the format rather than a description of one bracket layout, so it holds for any
 * structure that feeds a matchUp from both sides of another.
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
}): void {
  if (!drawDefinition || !matchUpId) return;

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const final: any = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  if (!final || final.collectionId || final.winningSide === winningSideBefore) return;

  const { winnerMatchUp, loserMatchUp } =
    positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId })?.targetMatchUps ?? {};
  const feedsOneMatchUp = winnerMatchUp?.matchUpId && winnerMatchUp.matchUpId === loserMatchUp?.matchUpId;
  if (!feedsOneMatchUp || winnerMatchUp.structureId === final.structureId) return;

  const decider = matchUpsMap.drawMatchUps.find((matchUp) => matchUp.matchUpId === winnerMatchUp.matchUpId);
  if (!decider) return;

  const participantOn = (sideNumber?: number) =>
    (final.sides ?? []).find((side: any) => side.sideNumber === sideNumber)?.participantId;
  const winnerId = participantOn(final.winningSide);
  const loserId = final.winningSide ? participantOn(3 - final.winningSide) : undefined;

  if (winnerId && loserId) {
    seatFinalists({ structureId: winnerMatchUp.structureId, drawDefinition, winnerId, loserId });
  }

  const lossesOutsideTheDecider = (participantId?: string) =>
    inContextDrawMatchUps.filter(
      (matchUp: any) =>
        matchUp.matchUpId !== decider.matchUpId &&
        !matchUp.collectionId &&
        matchUp.winningSide &&
        (matchUp.sides ?? []).some(
          (side: any) => side.participantId === participantId && side.sideNumber !== matchUp.winningSide,
        ),
    ).length;
  const needed = !loserId || lossesOutsideTheDecider(loserId) < 2;
  const matchUpStatus = winnerId && !needed ? DEAD_RUBBER : TO_BE_PLAYED;

  const holdsAResult = !!decider.winningSide || !!decider.score?.sets?.length;
  if (!holdsAResult && decider.matchUpStatus === matchUpStatus) return;

  modifyMatchUpScore({
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
