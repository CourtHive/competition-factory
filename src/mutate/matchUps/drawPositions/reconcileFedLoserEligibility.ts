import { structureAssignedDrawPositions, getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { removeSubsequentRoundsParticipant } from '@Mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { directLoser } from '@Mutate/matchUps/drawPositions/directLoser';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';

// constants and types
import { DrawDefinition, DrawLink, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type ReconcileFedLoserEligibilityArgs = {
  loserMatchUpDrawPositionIndex?: number;
  inContextDrawMatchUps?: HydratedMatchUp[];
  propagateRetirementAsExit?: boolean;
  sourceMatchUpStatusCodes?: string[];
  tournamentRecord?: Tournament;
  propagateExitStatus?: boolean;
  sourceMatchUpStatus?: string;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  loserTargetLink?: DrawLink;
  sourceMatchUpId?: string;
  loserMatchUp?: MatchUp;
  loserDrawPosition: number;
  winningSide?: number;
  structure: Structure;
  event?: Event;
};

/**
 * The fed drawPosition of a `FIRST_MATCHUP` target matchUp.
 *
 * The lowest of the target matchUp's drawPositions — stated once here and read by both the
 * feasibility check below and, through `directLoser`'s `fedDrawPositionFMLC`, the placement itself.
 * (`directLoser` additionally gates on `loserMatchUp.roundNumber === 2` where the link's own
 * `target.roundNumber` is the authority; that latent coupling is recorded in
 * planning/SWAP_WINNER_LOSER_TWO_ROUTES.md and is not widened here.)
 */
const fedDrawPosition = (loserMatchUp?: MatchUp): number | undefined => {
  const drawPositions = (loserMatchUp?.drawPositions ?? []).filter(Boolean) as number[];
  return drawPositions.length ? Math.min(...drawPositions) : undefined;
};

/**
 * Can a newly eligible loser still be PLACED — asked BEFORE anything is written.
 *
 * A placement displaces whatever holds the fed slot, and the engine refuses to clear a drawPosition
 * that is ACTIVE: one that has advanced by winning, or is paired with one that has. When the
 * withheld loser's BYE has already played on, `clearDrawPosition` refuses — and by then
 * `swapWinnerLoser` has applied the new result, so the refusal arrives over a mutated draw. That is
 * the `ERROR_IMPLIES_NO_MUTATION` shape the census reports, and it is strictly worse than either
 * outcome it sits between.
 *
 * So the question is asked FIRST, while refusing is still free. Measured across the two 600-seed
 * census windows on the `allowChangePropagation` arm: of the 20 first-match-consolation seeds this
 * reconciliation reaches, 13 place into a quiet slot and 7 meet an active one.
 *
 * ## Why eligibility is computed here and not by the shared predicate
 *
 * `isFedLoserEligible` reads the draw as it STANDS, and this runs before the flip is applied — so
 * the prospective loser still holds wins that are about to stop being theirs, and the shared
 * predicate would answer the question for the wrong result. The count is taken over the same
 * `getDrawPositionWinCount`, applied to the rounds BEFORE the flipped one. The rule itself is not
 * restated — only the set of matchUps it is applied to changes.
 *
 * Those earlier rounds are exactly what survives the flip, and the boundary is not a
 * simplification. A swap rewrites the advancing drawPosition in EVERY LATER matchUp of the source
 * structure, so the prospective loser stops appearing in all of them at once — they do not merely
 * lose the flipped matchUp, they lose everything they won after it. Excluding only the flipped
 * matchUp reads a later-round win as still theirs and concludes "ineligible, nothing to place",
 * and the placement then happens anyway once the flip is applied: 40 of 55 blocked placements
 * escaped the check that way and returned their refusal over a mutated draw.
 */
export function fedLoserPlacementRefusal({
  prospectiveLoserDrawPosition,
  departingLoserDrawPosition,
  flippedRoundNumber,
  loserTargetLink,
  drawDefinition,
  loserMatchUp,
  structure,
  event,
}: {
  prospectiveLoserDrawPosition: number;
  departingLoserDrawPosition: number;
  loserTargetLink?: DrawLink;
  drawDefinition: DrawDefinition;
  flippedRoundNumber?: number;
  loserMatchUp?: MatchUp;
  structure: Structure;
  event?: Event;
}): ResultType | undefined {
  if (loserTargetLink?.linkCondition !== FIRST_MATCHUP) return undefined;
  const targetStructureId = loserTargetLink.target?.structureId;
  const drawPosition = fedDrawPosition(loserMatchUp);
  if (!targetStructureId || !drawPosition) return undefined;

  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });

  if (!flippedRoundNumber) return undefined;
  const winsAfterTheFlip = getDrawPositionWinCount({
    sourceMatchUps: (sourceMatchUps ?? []).filter((matchUp) => (matchUp.roundNumber ?? 0) < flippedRoundNumber),
    drawPosition: prospectiveLoserDrawPosition,
  });
  if (winsAfterTheFlip !== 0) return undefined; // ineligible after the flip — nothing will be placed

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: structure.structureId,
    drawDefinition,
  });
  const participantIdAt = (drawPosition: number): string | undefined =>
    sourcePositionAssignments?.find((assignment) => assignment.drawPosition === drawPosition)?.participantId;

  const prospectiveLoserParticipantId = participantIdAt(prospectiveLoserDrawPosition);
  if (!prospectiveLoserParticipantId) return undefined;

  /**
   * A placement is needed only when NEITHER identity is in the target — which is Gap 2's whole
   * shape: the previous loser was withheld, so there is no assignment to relabel and both of the
   * swap's `find`s miss.
   *
   * Testing only the arriving participant is wrong, and wrongly in the expensive direction. They are
   * absent from the target in the ORDINARY case too — they are the current WINNER, and a winner has
   * not been fed anywhere. Their assignment comes into existence through the relabel, which has not
   * run yet at this point. A check that reads their absence as "a placement will be needed" refuses
   * every flip the relabel was about to handle correctly: measured over 160 first-match-consolation
   * flips, it turned 5 successful relabels into refusals and refused 20 flips that had no defect at
   * all.
   */
  const departingLoserParticipantId = participantIdAt(departingLoserDrawPosition);
  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: targetStructureId });
  const holds = (participantId?: string): boolean =>
    !!participantId && !!positionAssignments?.some((assignment) => assignment.participantId === participantId);
  if (holds(prospectiveLoserParticipantId) || holds(departingLoserParticipantId)) return undefined;

  const { activeDrawPositions } = getStructureDrawPositionProfiles({
    structureId: targetStructureId,
    drawDefinition,
  });
  if (!activeDrawPositions?.includes(drawPosition)) return undefined;

  return { error: DRAW_POSITION_ACTIVE };
}

/**
 * After a result changes, make the `FIRST_MATCHUP`-fed slot hold what the feed rule says it should.
 *
 * ## Why this is not part of the swap
 *
 * Changing a winner is a RELABEL: the two participants keep their drawPositions in the structure
 * they played in, and in every structure downstream the occupant's identity changes. Nothing is
 * placed and nothing is removed — a swap has no placement decision to make, because the position
 * and its binding already exist.
 *
 * **Exactly one thing can break that symmetry, and it is link-defined.** `FIRST_MATCHUP` is the only
 * `linkCondition` the engine emits, and it makes entry conditional on the arriving participant
 * rather than on the position: a loser feeds the target only on zero prior scored wins. So a flip
 * can change WHO IS ELIGIBLE, not merely who lost. That consequence is a property of the LINK, not
 * of the swap, so it lives here.
 *
 * ## It reconciles in BOTH directions, and the second one is not symmetric with the first
 *
 * - **Present although ineligible** — the relabel wrote a participant into a structure they cannot
 *   enter. The slot reverts to the BYE `directLoser` would have placed. Measured on census seed
 *   9000349; closed in #4875(factory).
 * - **Eligible although absent** — there was nothing to relabel. When the previous loser was
 *   withheld by the link condition, `directLoser` placed a BYE INSTEAD of an assignment, so the
 *   swap's two `find`s both miss, its whole body is a no-op, and a loser the rule ADMITS is left out
 *   of the structure that should hold them. A relabel cannot fix this, because the assignment it
 *   would relabel does not exist: the participant has to be PLACED.
 *
 * The second direction was the missing mirror of the first for as long as the first existed alone.
 * It is 25 of the 29 `FIRST_MATCH_LOSER_CONSOLATION` findings on the `allowChangePropagation` arm
 * of the two 600-seed census windows, reported as `DROPPED_PROGRESSION` — "a loser eligible to feed
 * the linked target structure is absent from it".
 *
 * Placement goes through `directLoser` rather than a local `assignDrawPosition`. It already owns the
 * fed-position rule (`fedDrawPositionFMLC` — the lowest drawPosition of the target matchUp), the
 * treatment of a `byeFromPropagation` slot as AVAILABLE, seed propagation and exit propagation. A
 * second implementation of any of those is a divergence waiting to happen, which is the same reason
 * `isFedLoserEligible` is shared between this reconciliation, `directLoser` and
 * `getDrawInconsistencies`.
 *
 * ## It is a STATE check, not a transition check
 *
 * It asks "does this structure hold what the feed rule says it should?" — so it needs no knowledge
 * of what changed, and it must run AFTER the new result is applied. That ordering also removes a
 * subtlety the in-swap version carried: it had to count wins over PRIOR ROUNDS ONLY, because it ran
 * before the new `winningSide` was written and would otherwise have counted the very win being taken
 * away. Once the result is applied, the shared predicate over the whole structure is simply correct.
 */
export function reconcileFedLoserEligibility({
  loserMatchUpDrawPositionIndex,
  sourceMatchUpStatusCodes,
  propagateRetirementAsExit,
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  propagateExitStatus,
  loserDrawPosition,
  tournamentRecord,
  sourceMatchUpId,
  loserTargetLink,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  winningSide,
  structure,
  event,
}: ReconcileFedLoserEligibilityArgs): ResultType {
  // Every other link feeds unconditionally, so there is nothing a relabel could contradict.
  if (loserTargetLink?.linkCondition !== FIRST_MATCHUP) return { ...SUCCESS };

  const targetStructureId = loserTargetLink.target?.structureId;
  if (!targetStructureId) return { ...SUCCESS };

  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    structure,
    event,
  });

  const { positionAssignments: sourcePositionAssignments } = structureAssignedDrawPositions({
    structureId: structure.structureId,
    drawDefinition,
  });
  const loserParticipantId = sourcePositionAssignments?.find(
    (assignment) => assignment.drawPosition === loserDrawPosition,
  )?.participantId;
  // No participant at the fed position — the normal state after a double exit. There is nothing to
  // place and nothing to remove.
  if (!loserParticipantId) return { ...SUCCESS };

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId: targetStructureId });
  const assignment = positionAssignments?.find(({ participantId }) => participantId === loserParticipantId);

  const eligible = isFedLoserEligible({ sourceMatchUps: sourceMatchUps ?? [], loserDrawPosition, loserTargetLink });

  if (eligible) {
    // Already where the rule says they belong — the relabel had both identities and exchanged them.
    if (assignment) return { ...SUCCESS };
    // The target matchUp is what names the fed drawPosition; without it there is nothing to place
    // into, and inventing a position here is exactly the second implementation this defers to
    // `directLoser` to avoid.
    if (!loserMatchUp) return { ...SUCCESS };

    return directLoser({
      sourceMatchUpStatusCodes: sourceMatchUpStatusCodes ?? [],
      loserMatchUpDrawPositionIndex,
      propagateRetirementAsExit,
      sourceWinningSide: winningSide,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      propagateExitStatus,
      loserDrawPosition,
      tournamentRecord,
      sourceMatchUpId,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
      matchUpsMap,
      winningSide,
      event,
    });
  }

  if (!assignment) return { ...SUCCESS };

  /**
   * Take back what they won HERE before the slot becomes a BYE — in that order, and the order is
   * the fix.
   *
   * A participant who is no longer eligible for this structure did not merely occupy a position:
   * they may have played on from it. Emptying the assignment leaves those results standing over a
   * drawPosition that now holds a BYE, and the matchUp then reads as a BYE having WON — measured on
   * FMLC/13 `Main|2|3`, where `Consolation|2|3` stayed COMPLETED with winningSide 1 over sides
   * `[BYE, participant]` and the BYE went on to "win" `Consolation|3|2` as well. A BYE is not a
   * competitor; `getExitWinningSide` states the rule outright — *"A BYE draw position can never be
   * the winning side."*
   *
   * `assignDrawPositionBye` alone cannot produce this state correctly, and not for want of trying:
   * it sets BYE status at the drawPosition's FURTHEST ADVANCEMENT, so with the advancement still in
   * place the BYE lands on the LAST matchUp of the chain and every matchUp before it keeps its
   * result. Stripping the advancement first makes the fed matchUp the furthest advancement, which is
   * where the BYE belongs.
   *
   * `releaseAdvancedDrawPosition` — the narrow primitive `removeDirectedLoser` uses — cannot do it
   * either: by design it releases only UNDECIDED matchUps, and these are decided. The wider
   * `removeSubsequentRoundsParticipant` is correct HERE precisely because it rewrites status,
   * winningSide and codes on what it releases. `removeDirectedLoser` records that as too wide for
   * its own path; this path is the opposite case — those results record a participant the feed rule
   * never admitted, so they are exactly what must not survive.
   *
   * The fed matchUp itself is untouched by the call: it is the position's INITIAL round, which
   * `removeSubsequentRoundsParticipant` excludes, and `assignDrawPositionBye` then gives it BYE
   * status.
   */
  removeSubsequentRoundsParticipant({
    roundNumber: loserTargetLink.target?.roundNumber ?? 1,
    targetDrawPosition: assignment.drawPosition,
    structureId: targetStructureId,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });

  // The slot reverts to what `directLoser` would have put there for this participant on this link:
  // a BYE marked as propagation-produced, so removal can later tell it from a structural BYE.
  delete assignment.participantId;
  assignDrawPositionBye({
    drawPosition: assignment.drawPosition,
    structureId: targetStructureId,
    byeFromPropagation: true,
    tournamentRecord,
    drawDefinition,
    event,
  });

  return { ...SUCCESS };
}
