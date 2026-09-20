import { getMappedStructureMatchUps } from '@Query/matchUps/getMatchUpsMap';

/**
 * THE MATCHUP THAT FEEDS THE SAME TARGET — the one structural statement of "paired previous".
 *
 * This replaces `roundPosition ± 1`, which was the ELIMINATION bracket rule (rp1 pairs with rp2,
 * rp3 with rp4) written out twice, here and in `getPairedPreviousMatchUpIsDoubleExit`. That rule
 * holds only where both previous-round matchUps advance into the SAME matchUp. On a FED round they
 * do not: each advances into its own target and the other side arrives over a link from another
 * structure. `doubleExitAdvancement` already said so — *"a fed target round has no paired previous
 * matchUp within this structure"* — but nothing enforced it, so the arithmetic answered anyway.
 *
 * Measured on FIRST_MATCH_LOSER_CONSOLATION 8/8 (`nonRandom: 61`): scoring `Consolation|1|2`
 * (roundPosition 2, offset -1) named `Consolation|1|1` as its pair and stamped that origin onto
 * `Consolation|2|2` side 1. `Consolation|1|1` advances into `Consolation|2|1`; `Consolation|2|2`
 * side 1 is a slot fed from the Main draw. The entry was false when written, and because the unwind
 * withdraws by IDENTITY it survived every clear — the residue behind four `DO_UNDO_IDENTITY` cells.
 *
 * `loserMatchUpId` counts as well as `winnerMatchUpId`: a consolation target is fed by losers, and
 * the question is whether the candidate arrives at the target at all, not how.
 *
 * NO ARITHMETIC FALLBACK. A candidate that does not feed the target is not a weaker answer, it is a
 * wrong one, and provenance built on it is an origin asserted about a side that came from somewhere
 * else — worse than no entry, because the unwind then trusts it. `buildSideExitProvenance` makes
 * the same refusal for the same reason.
 */
export function findPairedFeeder({ candidates, excludeMatchUpId, targetMatchUpId, roundNumber }): any {
  if (!roundNumber || !targetMatchUpId) return undefined;
  return candidates?.find(
    (candidate) =>
      candidate.roundNumber === roundNumber &&
      candidate.matchUpId !== excludeMatchUpId &&
      (candidate.winnerMatchUpId === targetMatchUpId || candidate.loserMatchUpId === targetMatchUpId),
  );
}

/** The other matchUp in `matchUp`'s own round that advances into the same winner target. */
export function getPairedPreviousMatchUp({ structureId, matchUpsMap, matchUp }) {
  const structureMatchUps = getMappedStructureMatchUps({ matchUpsMap, structureId });
  const pairedPreviousMatchUp = findPairedFeeder({
    targetMatchUpId: matchUp?.winnerMatchUpId,
    excludeMatchUpId: matchUp?.matchUpId,
    roundNumber: matchUp?.roundNumber,
    candidates: structureMatchUps,
  });
  return { pairedPreviousMatchUp };
}
