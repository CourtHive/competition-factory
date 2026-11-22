import { isDoubleExit } from '@Validators/isExit';
import { MatchUpStatusUnion } from '@Types/tournamentTypes';
import {
  nonDirectingMatchUpStatuses,
  directingMatchUpStatuses,
  activeMatchUpStatuses,
} from '@Constants/matchUpStatusConstants';

export function isDirectingMatchUpStatus({ matchUpStatus }) {
  return directingMatchUpStatuses.includes(matchUpStatus);
}

export function isActiveMatchUpStatus({ matchUpStatus }) {
  return activeMatchUpStatuses.includes(matchUpStatus);
}

type IsNonDirectingArgs = {
  matchUpStatus: MatchUpStatusUnion;
};
export function isNonDirectingMatchUpStatus({ matchUpStatus }: IsNonDirectingArgs) {
  return nonDirectingMatchUpStatuses.includes(matchUpStatus);
}

/** A collection line reopened for play or withdrawn cannot keep credit for its former winner. */
export function clearsCollectionWinner(
  existing: { collectionId?: string; winningSide?: number },
  update: { matchUpStatus?: MatchUpStatusUnion; winningSide?: number },
): boolean {
  if (!existing.collectionId || !existing.winningSide || !update.matchUpStatus) return false;
  return (
    isDoubleExit(update.matchUpStatus) ||
    (!update.winningSide && isNonDirectingMatchUpStatus({ matchUpStatus: update.matchUpStatus }))
  );
}
