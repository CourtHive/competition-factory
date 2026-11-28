import { validMatchUps } from '@Validators/validMatchUp';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

type GetMatchUpContextIdsArgs = {
  matchUps: any;
  matchUpId: string;
};
export function getMatchUpContextIds({ matchUps, matchUpId }: GetMatchUpContextIdsArgs) {
  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES };

  const matchUp = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);

  const { drawId, eventId, structureId, tournamentId } = matchUp ?? {};
  return { matchUpId, drawId, eventId, structureId, tournamentId };
}
