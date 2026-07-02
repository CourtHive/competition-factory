import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';

// constants and types
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { DrawLink } from '@Types/tournamentTypes';

// Mirrors directLoser's determination of whether a matchUp's loser is FED INTO the target structure
// as a participant. A FIRST_MATCHUP (FMLC round-2) LOSER link feeds the loser only if this was their
// first match — zero prior scored wins; otherwise the engine places a backdraw bye and the loser does
// NOT enter the target. Every other LOSER link feeds its loser unconditionally. Shares
// getDrawPositionWinCount with the mutation path so the integrity check and the engine never diverge.
export function isFedLoserEligible({
  sourceMatchUps,
  loserDrawPosition,
  loserTargetLink,
}: {
  sourceMatchUps: HydratedMatchUp[];
  loserDrawPosition: number;
  loserTargetLink: DrawLink;
}): boolean {
  if (loserTargetLink.linkCondition === FIRST_MATCHUP) {
    return getDrawPositionWinCount({ sourceMatchUps, drawPosition: loserDrawPosition }) === 0;
  }
  return true;
}
