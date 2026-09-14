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

    const newMatchUp: any = {
      roundPosition: position.roundPosition,
      drawPositions: [feedDrawPosition],
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
