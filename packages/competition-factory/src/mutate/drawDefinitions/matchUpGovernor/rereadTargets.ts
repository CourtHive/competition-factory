import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';

// types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * The hydrated draw and the source matchUp's targets, read again after a write the advancement that follows must see.
 *
 * `setMatchUpState` hydrates the draw and reads the targets once, before anything is written. When a result becomes a
 * double exit, what the previous result directed is taken back first — `removeDoubleExit` for a double exit re-entered
 * as the other one, `removeDirectedParticipants` for a decided result — and `doubleExitAdvancement` then writes into
 * the same targets. Read before the removal, they still show the BYE or the exit the removal withdrew, and the
 * advancement answered for that: a produced exit converged with the one it replaced, or an exit was stamped on a seat
 * still read as a BYE (`doubleExitPropagateBye: false`, census w1 9000168, 9000252; w2 9100380).
 *
 * Writes `inContextDrawMatchUps`, `targetData` and `inContextMatchUp` onto `params`, as `setMatchUpState` does. A
 * target read that fails leaves `params` as it was.
 */
type RereadParams = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUpTieId?: string;
  targetData?: unknown;
  matchUp?: MatchUp;
  event?: Event;
};

export function rereadTargets(params: RereadParams): void {
  const { drawDefinition, tournamentRecord, event, matchUpsMap } = params;
  const inContextDrawMatchUps = getAllDrawMatchUps({
    inContext: true,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  }).matchUps;
  const matchUpId = params.matchUpTieId || params.matchUp?.matchUpId;
  if (!matchUpId) return;
  const targetData = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });
  if (targetData.error) return;
  const inContextMatchUp = inContextDrawMatchUps?.find(
    (candidate) => candidate.matchUpId === params.inContextMatchUp?.matchUpId,
  );
  Object.assign(params, { inContextDrawMatchUps, targetData, ...(inContextMatchUp ? { inContextMatchUp } : {}) });
}
