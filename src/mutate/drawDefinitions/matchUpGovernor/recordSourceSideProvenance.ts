import { mergeSideExitProvenance, producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
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
    if (sourceMatchUpStatus && sourceMatchUpStatus !== TO_BE_PLAYED) {
      mergeSideExitProvenance({
        matchUp,
        provenance: {
          [sourceSideNumber]: definedAttributes({
            matchUpStatus: producedExitStatus(sourceMatchUpStatus),
            previousMatchUpStatus: sourceMatchUpStatus,
            sourceMatchUpId,
          }),
        },
      });
    }
  }
}

/**
 * The side of the seat the source feeds, read from what the matchUp HOLDS in the keyed state, never from roundPosition
 * order. Two positions sort ascending, so where the second round carries larger, fed-in positions the source's
 * participant can sit on side 2 although its matchUp has the lower roundPosition (factory-a7's probe, 2026-10-06: 14
 * of 33 stamps on the wrong side, e.g. census w1 9000055 FMLC `Consolation|3|2`, source dp[3,9] beside paired
 * dp[4,11], seated {1: dp4, 2: dp9}). A position of the source names its own side; one of the paired matchUp names
 * the other. Neither present: `undefined`, and the caller falls back to the bracket.
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
