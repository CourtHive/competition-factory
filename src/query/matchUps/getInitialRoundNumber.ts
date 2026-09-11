import { numericSort } from '@Tools/sorting';

import { MatchUp } from '@Types/tournamentTypes';

type GetInitialRoundNumberArgs = {
  // Only inspects base fields (`drawPositions`, `roundNumber`).
  matchUps?: MatchUp[];
  drawPosition: number;
};
export function getInitialRoundNumber({ drawPosition, matchUps = [] }: GetInitialRoundNumberArgs) {
  // determine the initial round where drawPosition appears
  // drawPosition cannot be removed from its initial round
  const initialRoundNumber = matchUps
    .filter(({ drawPositions }) => drawPosition && drawPositions?.includes(drawPosition))
    .map(({ roundNumber }) => roundNumber)
    .sort(numericSort)[0];
  return { initialRoundNumber };
}
