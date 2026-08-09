import { addGoesTo } from '@Query/matchUps/addGoesTo';

/**
 * Stamp draw-progression edges (`winnerMatchUpId` / `loserMatchUpId`) onto ALREADY
 * FLATTENED in-context matchUps.
 *
 * Why this exists. The edges are stored on the drawDefinition's matchUps, but only for
 * draws generated after they were materialised — older records, and TODS files not
 * produced by the factory, simply do not carry them, so a projection built from a plain
 * flatten reports NULL and cannot distinguish "no loser feed" from "never recorded".
 * `addGoesTo` DERIVES both targets from the draw's links and topology, so the edges are
 * recoverable rather than lost.
 *
 * Why a stamping helper rather than swapping the flatten. `cast()` flattens
 * tournament-wide while `addGoesTo` works per drawDefinition, and the incremental
 * producer flattens a single draw. One helper called by both keeps them emitting
 * byte-identical rows — the property the whole read-model design rests on — without
 * either having to restructure how it acquires matchUps.
 *
 * PURE with respect to the tournamentRecord: `addGoesTo` builds its own matchUps map and
 * enriches those copies, so the stored record is never mutated. Only the passed
 * `matchUps` array (itself already a flattened, in-context copy) is written to.
 *
 * COST: `addGoesTo` resolves `positionTargets` per matchUp — measured at 1.16×–1.43× a
 * plain flatten depending on draw type. Call it where projected edges are needed, not on
 * every flatten.
 */
/** Every stored matchUp of a draw, including nested round-robin group structures. */
function collectStoredMatchUps(drawDefinition: any): any[] {
  const out: any[] = [];
  const walk = (structures: any[]) => {
    for (const structure of structures ?? []) {
      for (const matchUp of structure?.matchUps ?? []) out.push(matchUp);
      walk(structure?.structures);
    }
  };
  walk(drawDefinition?.structures);
  return out;
}

export function applyProgressionEdges({ drawDefinitions, matchUps }: { drawDefinitions: any[]; matchUps: any[] }): {
  winnerMatchUpIds: Record<string, string>;
  loserMatchUpIds: Record<string, string>;
} {
  const winnerMatchUpIds: Record<string, string> = {};
  const loserMatchUpIds: Record<string, string> = {};

  for (const drawDefinition of drawDefinitions ?? []) {
    if (!drawDefinition?.drawId) continue;

    // `addGoesTo` WRITES the derived edges (and a widened `finishingPositionRange.loser`)
    // onto the drawDefinition's stored matchUps. That is deliberate for its generator
    // callers, which want them persisted — but `cast()` is documented pure, and the CFS
    // rebuild hands it records it does not intend to write back. So snapshot the three
    // fields it touches and restore them, keeping only the returned goesToMap.
    const stored = collectStoredMatchUps(drawDefinition);
    const snapshot = stored.map((matchUp: any) => ({
      matchUp,
      hasWinner: 'winnerMatchUpId' in matchUp,
      hasLoser: 'loserMatchUpId' in matchUp,
      winner: matchUp.winnerMatchUpId,
      loser: matchUp.loserMatchUpId,
      finishingLoser: matchUp.finishingPositionRange?.loser,
    }));

    let result: any;
    try {
      result = addGoesTo({ drawDefinition });
    } finally {
      for (const entry of snapshot) {
        if (entry.hasWinner) entry.matchUp.winnerMatchUpId = entry.winner;
        else delete entry.matchUp.winnerMatchUpId;
        if (entry.hasLoser) entry.matchUp.loserMatchUpId = entry.loser;
        else delete entry.matchUp.loserMatchUpId;
        if (entry.matchUp.finishingPositionRange && entry.finishingLoser !== undefined) {
          entry.matchUp.finishingPositionRange.loser = entry.finishingLoser;
        }
      }
    }

    if (result?.error) continue; // a malformed draw must not abort the whole projection
    Object.assign(winnerMatchUpIds, result?.goesToMap?.winnerMatchUpIds ?? {});
    Object.assign(loserMatchUpIds, result?.goesToMap?.loserMatchUpIds ?? {});
  }

  for (const matchUp of matchUps ?? []) {
    const id = matchUp?.matchUpId;
    if (!id) continue;
    // Derived wins over stored: a stored edge can be stale after a structure is removed,
    // whereas the derived value always reflects the draw's CURRENT topology. Absent a
    // derived value the stored one is left untouched rather than cleared — deriving
    // nothing means "this draw has no such feed", which is already what absent encodes.
    if (winnerMatchUpIds[id]) matchUp.winnerMatchUpId = winnerMatchUpIds[id];
    if (loserMatchUpIds[id]) matchUp.loserMatchUpId = loserMatchUpIds[id];
  }

  return { winnerMatchUpIds, loserMatchUpIds };
}
