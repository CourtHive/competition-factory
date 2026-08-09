import { resolveTieFormat } from './resolveTieFormat';

// constants and types
import { DrawDefinition, Event, Structure, TieScoreSourceEnum, TieScoreSourceUnion } from '@Types/tournamentTypes';

type ResolveTieScoreSourceArgs = {
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  matchUp?: object;
  event?: Event;
};

/**
 * Resolves where a TEAM matchUp's score comes from, following the same hierarchy as the tieFormat it is
 * declared on: matchUp > structure > drawDefinition > event.
 *
 * Defaults to DERIVED, so a tieFormat that says nothing behaves exactly as it always has — the tie score is
 * computed from its collection matchUps.
 */
export function resolveTieScoreSource(params: ResolveTieScoreSourceArgs): TieScoreSourceUnion {
  const tieFormat = resolveTieFormat(params)?.tieFormat;
  return tieFormat?.scoreSource === TieScoreSourceEnum.REPORTED
    ? TieScoreSourceEnum.REPORTED
    : TieScoreSourceEnum.DERIVED;
}
