/**
 * Compute per-round visibility state (hidden / embargoed) for a draw structure.
 *
 * Used by clients to determine which rounds should be hidden (beyond roundLimit)
 * or visually marked as embargoed (schedule embargo active) when rendering a draw.
 *
 * @param structureDetail - The `PublishingDetail` for a specific structure, as found in
 *   `publishState.status.drawDetails[drawId].structureDetails[structureId]`.
 *   Contains optional `roundLimit` and `scheduledRounds` with per-round embargo dates.
 * @param matchUps - Array of matchUp objects for the structure. Only `roundNumber` is read;
 *   used to determine the maximum round number.
 * @returns A map from round number to `{ hidden?, embargoed? }`, or `undefined` when
 *   no rounds have visibility restrictions.
 */
import { isEmbargoed } from './isEmbargoed';

import type { PublishingDetail } from '@Mutate/publishing/publishEvent';

export interface RoundVisibility {
  hidden?: boolean;
  embargoed?: boolean;
}

export function getRoundVisibilityState(
  structureDetail?: PublishingDetail,
  matchUps?: { roundNumber?: number }[],
): Record<number, RoundVisibility> | undefined {
  if (!structureDetail || !matchUps?.length) return undefined;

  const roundLimit = structureDetail.roundLimit;
  const scheduledRounds = structureDetail.scheduledRounds ?? {};
  const maxRound = matchUps.reduce((max, m) => Math.max(max, m.roundNumber || 0), 0);
  if (maxRound === 0) return undefined;

  const state: Record<number, RoundVisibility> = {};
  let hasState = false;

  for (let rn = 1; rn <= maxRound; rn++) {
    const entry: RoundVisibility = {};
    if (roundLimit != null && rn > roundLimit) {
      entry.hidden = true;
      hasState = true;
    }
    const rd = scheduledRounds[rn];
    if (rd && isEmbargoed(rd)) {
      entry.embargoed = true;
      hasState = true;
    }
    if (entry.hidden || entry.embargoed) {
      state[rn] = entry;
    }
  }

  return hasState ? state : undefined;
}
