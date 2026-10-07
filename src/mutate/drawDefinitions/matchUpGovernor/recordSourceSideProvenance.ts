import {
  mergeSideExitProvenance,
  decidesForTheSide,
  producedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { definedAttributes } from '@Tools/definedAttributes';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// types
import { DrawDefinition, MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type RecordSourceSideProvenanceArgs = {
  /** the positions the matchUp holds in the state the entry is keyed to: after the arrival, or after the removal */
  drawPositions?: (number | undefined)[];
  drawDefinition?: DrawDefinition;
  inContextDrawMatchUps: any[];
  sourceMatchUpStatus?: MatchUpStatusUnion;
  matchUpsMap: MatchUpsMap;
  sourceMatchUpId?: string;
  matchUp: MatchUp;
};

export function recordSourceSideProvenance({
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  sourceMatchUpId,
  drawDefinition,
  drawPositions,
  matchUpsMap,
  matchUp,
}: RecordSourceSideProvenanceArgs): undefined {
  // find sourceMatchUp and matchUp paired with sourceMatchUp to workout sourceSideNumber
  const sourceMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === sourceMatchUpId);
  const { pairedPreviousMatchUp } = getPairedPreviousMatchUp({
    structureId: sourceMatchUp?.structureId,
    matchUp: sourceMatchUp,
    matchUpsMap,
  });
  if (sourceMatchUp && pairedPreviousMatchUp) {
    const pairedPreviousMatchUpId = pairedPreviousMatchUp?.matchUpId;
    const pairedMatchUp = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === pairedPreviousMatchUpId);
    const sameStructure = sourceMatchUp?.structureId === pairedMatchUp?.structureId;
    const sourceSideNumber = sameStructure
      ? (seatSideNumber({ drawDefinition, drawPositions, matchUp, sourceMatchUp, pairedMatchUp }) ??
        // an empty matchUp: the source's seat is its bracket side, which a lone arrival takes
        ((sourceMatchUp?.roundPosition < pairedMatchUp?.roundPosition && 1) || 2))
      : // if different structureIds then structureId that is not equivalent to noContextWinnerMatchUp.structureId is fed
        // ... and fed positions are always sideNumber 1
        1;

    // This is the site that LEARNS a side's origin after the fact, and it used to record it only in
    // the legacy array. So a matchUp could carry the truthful origin in `matchUpStatusCodes`
    // (`previousMatchUpStatus: COMPLETED`) while `sideExitProvenance` held nothing for that side —
    // or, before the guard in `buildSideExitProvenance`, held `TO_BE_PLAYED`, which is not an
    // origin at all.
    //
    // **P37 removed the array write entirely, and with it this function's last reason to be named after
    // the array.** It mapped every element, wrapping a bare value as `{ code }` and stamping the origin
    // onto the element whose `sideNumber` matched the source's. The exit tenant is evicted, so no element
    // carries a `sideNumber` and the stamp could never land: the map's only surviving effect was turning
    // `'WO'` into `{ code: 'WO' }` — one more element shape in an array whose whole problem was having
    // four. `convergingDoubleExitStatus` now pins that every persisted element is a string.
    //
    // Merged, not set: the other side's origin may already be recorded, and may have arrived first.
    // An UNDECIDED source is not recorded — provenance can never be TO_BE_PLAYED.
    //
    // WHAT THE ENTRY SAYS. `previousMatchUpStatus` is why this side holds the position: the source ended that
    // way. `matchUpStatus` is what was decided on THIS side as a result, and for an ARRIVAL that is nothing: a
    // participant who won a DEFAULTED (or any result) is simply waiting here. A double exit decides something
    // for the side it feeds, since nobody arrives and the exit it produced stands pending there; a BYE origin
    // leaves the side holding a BYE, which the BYE-arrival readers ask for by status.
    //
    // This wrote `producedExitStatus(source status)` for every source, so a participant who won a DEFAULTED
    // carried `{ matchUpStatus: DEFAULTED, previousMatchUpStatus: DEFAULTED }` into the next round: byte for
    // byte the entry the LOSER of that DEFAULTED carries over the loser link, which does mean "this side is
    // exiting". `carriedExitStatus` read both as an exit (OUTCOME_PIPELINE_OPEN_QUESTIONS F9, census w2
    // 9100389: v2 planned a convergence where a present participant wins the produced exit). CA, 2026-10-07:
    // "there should be no matchUpStatus on the provenance for A, because nothing was decided when they
    // arrived, they were just waiting."
    //
    // The same writer stamps the source's LOSER where they are relayed past a BYE in the structure the loser link
    // feeds (FRLC w2 9100283: the Main|1|12 walkover's loser passes a consolation BYE into Consolation|2|3). That
    // side IS exiting, so its status stays. Which one arrived is read off the seat: the source's winner is an
    // arrival; anyone else carried the exit in.
    if (sourceMatchUpStatus && sourceMatchUpStatus !== TO_BE_PLAYED) {
      const decided =
        decidesForTheSide(sourceMatchUpStatus) ||
        !seatHoldsSourceWinner({ inContextDrawMatchUps, drawDefinition, drawPositions, sourceMatchUp, matchUp });
      mergeSideExitProvenance({
        matchUp,
        provenance: {
          [sourceSideNumber]: definedAttributes({
            matchUpStatus: decided ? producedExitStatus(sourceMatchUpStatus) : undefined,
            previousMatchUpStatus: sourceMatchUpStatus,
            sourceMatchUpId,
          }),
        },
      });
    }
  }
}

/**
 * Does the seat being stamped hold the source's WINNER?
 *
 * The participant is read from the positionAssignments of the structure the matchUp belongs to, against the positions
 * the matchUp holds in the keyed state (`drawPositions`, passed because the in-context copy predates the placement).
 * A source with no winner (a double exit) has nobody to arrive, and the caller has already kept the status; an
 * unresolvable seat answers false, which keeps the status too, as every record before this read did.
 */
function seatHoldsSourceWinner({
  inContextDrawMatchUps,
  drawDefinition,
  drawPositions,
  sourceMatchUp,
  matchUp,
}: {
  drawPositions?: (number | undefined)[];
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition?: DrawDefinition;
  sourceMatchUp?: HydratedMatchUp;
  matchUp: MatchUp;
}): boolean {
  const winnerParticipantId = sourceMatchUp?.sides?.find(
    (side) => side?.sideNumber === sourceMatchUp?.winningSide,
  )?.participantId;
  if (!winnerParticipantId || !drawDefinition) return false;
  const structureId = inContextDrawMatchUps.find((m) => m.matchUpId === matchUp.matchUpId)?.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  const held = (drawPositions ?? matchUp.drawPositions ?? []).filter((position): position is number => !!position);
  return !!positionAssignmentsOf(structure)?.some(
    (assignment) => held.includes(assignment.drawPosition) && assignment.participantId === winnerParticipantId,
  );
}

/**
 * The side of the seat the source feeds, read from what the matchUp HOLDS in the keyed state, never from roundPosition
 * order. Two positions sort ascending, so where the second round carries larger, fed-in positions the source's
 * participant can sit on side 2 although its matchUp has the lower roundPosition. At the arrival the entry is keyed
 * after `rekeySideFacts`, against both positions, and the roundPosition formula named the wrong side 13 times over the
 * census (factory-a7's re-probe, 2026-10-06; e.g. w1 9000055 FMLC `Consolation|3|2`, keyed [4,9]: the source's dp 9 is
 * on side 2, the formula said 1). After a removal the formula happened to agree, because the lone survivor takes its
 * bracket side. A position of the source names its own side; one of the paired matchUp names the other. Neither
 * present: `undefined`, and the caller falls back to the bracket.
 */
function seatSideNumber({
  drawDefinition,
  drawPositions,
  matchUp,
  sourceMatchUp,
  pairedMatchUp,
}: {
  drawPositions?: (number | undefined)[];
  drawDefinition?: DrawDefinition;
  pairedMatchUp?: HydratedMatchUp;
  sourceMatchUp?: HydratedMatchUp;
  matchUp: MatchUp;
}): number | undefined {
  const held = (drawPositions ?? matchUp.drawPositions ?? []).filter((position): position is number => !!position);
  const sideOf = (drawPosition: number) =>
    getDrawPositionSideNumber({
      matchUp: { ...matchUp, sides: undefined, drawPositions: held },
      structureId: sourceMatchUp?.structureId,
      drawDefinition,
      drawPosition,
    });
  const fromSource = held.find((drawPosition) => sourceMatchUp?.drawPositions?.includes(drawPosition));
  if (fromSource) return sideOf(fromSource);
  const fromPaired = held.find((drawPosition) => pairedMatchUp?.drawPositions?.includes(drawPosition));
  const pairedSide = fromPaired ? sideOf(fromPaired) : undefined;
  return pairedSide ? 3 - pairedSide : undefined;
}
