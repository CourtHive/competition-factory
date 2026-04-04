import { getInitialRoundNumber } from '../matchUps/getInitialRoundNumber';
import { getRoundMatchUps } from '../matchUps/getRoundMatchUps';

// types
import { HydratedMatchUp } from '@Types/hydrated';

// defaults to finding the paired drawPosition in the initial roundNumber in which the drawPosition occurs
// for feed-in rounds fed drawPositions will not initially have a paired drawPosition
type GetPairedDrawPosition = {
  matchUps: HydratedMatchUp[];
  drawPosition: number;
  roundNumber: number;
};
export function getPairedDrawPosition({ drawPosition, roundNumber, matchUps }: GetPairedDrawPosition): {
  pairedDrawPosition?: number | undefined;
} {
  if (!matchUps) return {};

  const { roundProfile } = getRoundMatchUps({ matchUps }) ?? {};
  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition,
    matchUps,
  });

  const roundIndex = roundNumber || initialRoundNumber;
  const targetRoundProfile: any = roundIndex && roundProfile?.[roundIndex];
  const pairedDrawPositions = targetRoundProfile?.pairedDrawPositions?.find((pair) => pair.includes(drawPosition));
  const pairedDrawPosition = pairedDrawPositions?.find((currentPosition) => currentPosition !== drawPosition);

  return { pairedDrawPosition };
}
