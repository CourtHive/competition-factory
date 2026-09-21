import { mergeSideExitProvenance, producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getPairedPreviousMatchUp } from '@Query/matchUps/getPairedPreviousMatchup';
import { definedAttributes } from '@Tools/definedAttributes';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// types
import { MatchUpStatusCodeRecord, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';
import { MatchUp } from '@Types/tournamentTypes';

type UpdateMatchUpStatusCodesArgs = {
  inContextDrawMatchUps: any[];
  sourceMatchUpStatus?: MatchUpStatusUnion;
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
      // Wrap only a BARE code. The old guard was `isString(code) || !isNaN(code)`, which could not
      // narrow once the element type was declared honestly: `isNaN` of an object is true, so objects
      // fell through correctly, but nothing told the compiler that — and `{ code }` where `code`
      // might itself be a record is the double-wrap this array's shape confusion invites.
      // Pass RECORDS through; wrap everything else. The old guard was
      // `isString(code) || !isNaN(code)`, which could not narrow once the element type was declared
      // honestly — and its edges were wrong in both directions: `isNaN(null)` is FALSE, so a null
      // element was wrapped (right, and `[null, null]` is a shape this array has genuinely been
      // persisted with), while `isNaN(undefined)` is TRUE, so an undefined element fell through as
      // `value` and threw on the `.sideNumber` read below. Asking whether it is a record answers
      // both, and is what the union actually discriminates on.
      const value: MatchUpStatusCodeRecord =
        typeof code === 'object' && code !== null ? code : { code: code ?? undefined };
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
