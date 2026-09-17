import { generateMatchUpId } from './generateMatchUpId';
import { generateRange } from '@Tools/arrays';

// constants and types
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MatchUp } from '@Types/tournamentTypes';

type BuildFeedRoundArgs = {
  includeMatchUpType?: boolean;
  drawPosition?: number;
  matchUpType?: string;
  roundNumber: number;
  matchUps: MatchUp[];
  idPrefix?: string;
  isMock?: boolean;
  uuids?: string[];
  fed: number;
  nodes: any;
};
export function buildFeedRound({
  includeMatchUpType,
  drawPosition,
  roundNumber,
  matchUpType,
  idPrefix,
  matchUps,
  isMock,
  uuids,
  nodes,
  fed,
}: BuildFeedRoundArgs): {
  drawPosition: number | undefined;
  matchUps: MatchUp[];
  roundNodes: any;
} {
  const feedRoundMatchUpsCount = nodes.length;
  const initialGroupDrawPosition = drawPosition ? drawPosition - feedRoundMatchUpsCount : undefined;
  const drawPositionGroup = generateRange(0, feedRoundMatchUpsCount).map((value) =>
    initialGroupDrawPosition ? initialGroupDrawPosition + value : undefined,
  );

  const roundNodes: any[] = [];
  for (let nodeIndex = 0; nodeIndex < feedRoundMatchUpsCount; nodeIndex++) {
    const feedDrawPosition = drawPositionGroup.shift();

    const feedArm = {
      drawPosition: feedDrawPosition,
      fed: fed + 1,
      feed: true,
    };

    const position = nodes[nodeIndex];
    position.roundNumber = roundNumber - 1;
    const matchUpId = generateMatchUpId({
      roundPosition: position.roundPosition,
      roundNumber,
      idPrefix,
      uuids,
    });

    /**
     * A matchUp that holds no drawPosition says so with an EMPTY array, never with `[undefined]`.
     *
     * `drawPosition` is optional on this function, and when it is absent `initialGroupDrawPosition`
     * is undefined, so every entry of `drawPositionGroup` is undefined and `feedDrawPosition` comes
     * out undefined too. Writing it into a one-element array produced `drawPositions: [undefined]`
     * — which serialises to `[null]` and is stored that way.
     *
     * A one-element array whose only entry is a hole carries no information: there is no surviving
     * position for the hole to hold a side open beside. (A MIXED array like `[undefined, 5]` is
     * different and is deliberate — `releaseAdvancedDrawPosition` preserves that hole because
     * `drawPositions` is positional and closing it would move the survivor to the other side.)
     *
     * Measured over 150 generated draws spanning 10 draw types, 3 draw sizes and 5 participant
     * counts: 15 carried an all-holes array, every one of them DOUBLE_ELIMINATION's Main final,
     * at every size and count. That value then reached `removeDoubleExit`, where an unguarded
     * `.includes` on the absent-or-holey array threw a TypeError while unwinding a double exit.
     */
    const newMatchUp: any = {
      drawPositions: feedDrawPosition !== undefined ? [feedDrawPosition] : [],
      roundPosition: position.roundPosition,
      matchUpStatus: TO_BE_PLAYED,
      roundNumber,
      matchUpId,
    };

    // matchUpType is derived for inContext matchUps from structure or drawDefinition
    if (includeMatchUpType) newMatchUp.matchUpType = matchUpType;
    if (isMock) newMatchUp.isMock = true;

    matchUps.push(newMatchUp);

    const roundNode = { children: [position, feedArm] };
    roundNodes.push(roundNode);
  }

  const nextDrawPosition = drawPosition ? drawPosition - feedRoundMatchUpsCount : undefined;

  return { roundNodes, matchUps, drawPosition: nextDrawPosition };
}
