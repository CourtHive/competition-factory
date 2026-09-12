import { mergeSideExitProvenance, producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { definedAttributes } from '@Tools/definedAttributes';
import { isString } from '@Tools/objects';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// types
import { MatchUpsMap } from '@Types/factoryTypes';
import { MatchUp } from '@Types/tournamentTypes';

type UpdateMatchUpStatusCodesArgs = {
  inContextDrawMatchUps: any[];
  sourceMatchUpStatus?: string;
  matchUpsMap: MatchUpsMap;
  sourceMatchUpId?: string;
  matchUp: MatchUp;
};

export function updateMatchUpStatusCodes({
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  sourceMatchUpId,
  matchUpsMap,
  matchUp,
}: UpdateMatchUpStatusCodesArgs): undefined {
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
    const sourceSideNumber =
      sourceMatchUp?.structureId === pairedMatchUp?.structureId
        ? // if structureIds are equivalent then sideNumber is inferred from roundPositions
          (sourceMatchUp?.roundPosition < pairedMatchUp?.roundPosition && 1) || 2
        : // if different structureIds then structureId that is not equivalent to noContextWinnerMatchUp.structureId is fed
          // ... and fed positions are always sideNumber 1
          (sourceMatchUp.structureId === pairedMatchUp?.structureId && 2) || 1;

    matchUp.matchUpStatusCodes = (matchUp.matchUpStatusCodes ?? []).map((code) => {
      const value = isString(code) || !isNaN(code) ? { code } : code;
      if (value.sideNumber === sourceSideNumber) {
        // `matchUpStatus` and `previousMatchUpStatus` are a PAIR — the second is the origin, the
        // first is what that origin produced. Stamping only the origin left them contradicting each
        // other: an element already reading `{ DEFAULTED, DOUBLE_DEFAULT }` became
        // `{ DEFAULTED, DOUBLE_WALKOVER }`, i.e. a walkover origin producing a default. Measured as
        // the last surviving entry-order dependence on the consolation convergence path — one order
        // produced the coherent pair and the other this one.
        return {
          ...value,
          matchUpStatus: producedExitStatus(sourceMatchUpStatus),
          previousMatchUpStatus: sourceMatchUpStatus,
        };
      }
      return value;
    });

    // This is the site that LEARNS a side's origin after the fact, and it was recording it only in
    // the legacy array. So a matchUp could carry the truthful origin in `matchUpStatusCodes`
    // (`previousMatchUpStatus: COMPLETED`) while `sideExitProvenance` held nothing for that side —
    // or, before the guard in `buildSideExitProvenance`, held `TO_BE_PLAYED`, which is not an
    // origin at all.
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
          }) as any,
        },
      });
    }
  }
}
