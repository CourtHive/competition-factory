import { HydratedMatchUp } from '@Types/hydrated';

type GetNextRoundMatchUpArgs = {
  structureMatchUps: HydratedMatchUp[];
  /** a round's non-tie matchUps from an operation's index (`buildTargetIndex`), in place of filtering */
  roundMatchUps?: (roundNumber?: number) => HydratedMatchUp[];
  matchUp: HydratedMatchUp;
};

/*
  returns the next round matchUp for winner of given matchUp
  must exclude tieMatchUps as next round matchUp count may not be consistent
*/
export function getNextRoundMatchUp({ structureMatchUps, roundMatchUps, matchUp }: GetNextRoundMatchUpArgs) {
  const { roundNumber, roundPosition } = matchUp;
  const roundOf = (n?: number) =>
    roundMatchUps?.(n) ?? structureMatchUps.filter((matchUp) => matchUp.roundNumber === n && !matchUp.matchUpTieId);
  const currentRoundMatchUps = roundOf(roundNumber);
  const nextRoundMatchUps = roundOf((roundNumber as number) + 1);

  if (nextRoundMatchUps.length) {
    let nextMatchUp;
    if (nextRoundMatchUps.length === currentRoundMatchUps.length) {
      nextMatchUp = nextRoundMatchUps.find((matchUp) => matchUp.roundPosition === roundPosition);
    } else if (nextRoundMatchUps.length === currentRoundMatchUps.length / 2) {
      nextMatchUp = nextRoundMatchUps.find(
        (matchUp) => matchUp.roundPosition === Math.ceil((roundPosition as number) / 2),
      );
    }

    return { matchUp: nextMatchUp };
  }
  return { message: 'no progression found' };
}
