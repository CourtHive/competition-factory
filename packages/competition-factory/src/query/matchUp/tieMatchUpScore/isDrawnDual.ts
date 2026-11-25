import { structuresOf } from '@Helpers/drawTopology/structureMembers';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { CONTAINER, ITEM } from '@Constants/drawDefinitionConstants';
import type { MatchUp, Structure } from '@Types/tournamentTypes';

type SetScore = { side1Score?: number; side2Score?: number };

/**
 * A ROUND ROBIN TEAM TIE WHOSE LINES HAVE ALL FINISHED LEVEL IS A DRAW (CA ruling, 2026-11-07; TEAM results item 2):
 * COMPLETED with no winner, as a single matchUp that ends level in a format that can end level. In elimination a winner
 * must advance, so a level tie there stays in progress until a decider or a recorded decision names one.
 *
 * Read by v1 (`updateTieMatchUpScore`), by v2 (`projectedDualStatus`) and by the round robin tally (`isDrawnResult`),
 * so the three agree on which ties are drawn. `set` is the tally's one aggregate set (`generateTieMatchUpScore`);
 * `structure` is the structure the tie sits in, a round robin CONTAINER or one of its groups.
 */
export function isDrawnDual({
  tieMatchUps,
  winningSide,
  structure,
  set,
}: {
  tieMatchUps?: Pick<MatchUp, 'matchUpStatus'>[];
  structure?: Structure;
  winningSide?: number;
  set?: SetScore;
}): boolean {
  if (winningSide || !set || !tieMatchUps?.length) return false;
  if (!isRoundRobinStructure(structure)) return false;
  if ((set.side1Score ?? 0) !== (set.side2Score ?? 0)) return false;
  return tieMatchUps.every(({ matchUpStatus }) => !!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus));
}

function isRoundRobinStructure(structure?: Structure): boolean {
  if (!structure) return false;
  // the CONTAINER, or one of its groups
  return structure.structureType === CONTAINER || structure.structureType === ITEM || !!structuresOf(structure)?.length;
}
