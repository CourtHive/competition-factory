import { getDevContext } from '@Global/state/globalState';
import { generateRange } from '@Tools/arrays';

// constants
import { BOTTOM_UP, TOP_DOWN, LOSER, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { Structure } from '@Types/tournamentTypes';

type FeedInLinksArgs = {
  mainStructure: Structure;
  consolationStructure;
  roundOffset?: number;
  roundsCount: number;
  feedPolicy?: any;
  fmlc?: boolean;
};
export function feedInLinks({
  consolationStructure,
  roundOffset = 0,
  mainStructure,
  roundsCount,
  feedPolicy,
  fmlc,
}: FeedInLinksArgs) {
  const consolationMatchUps = consolationStructure.matchUps;
  const roundsFed = consolationMatchUps.reduce((p, matchUp) => {
    const drawPositions = (matchUp.drawPositions ?? []).filter(Boolean);
    return drawPositions.length && !p.includes(matchUp.roundNumber) ? p.concat(matchUp.roundNumber) : p;
  }, []);

  const roundGroupedOrder = feedPolicy?.roundGroupedOrder ?? [];
  const roundFeedProfiles = feedPolicy?.roundFeedProfiles;

  // range excludes final round which is final matchUp
  return generateRange(1 + roundOffset, roundsCount + 1 + roundOffset)
    .map((roundNumber) => {
      const feedProfile = roundFeedProfiles?.[roundNumber - 1]
        ? roundFeedProfiles[roundNumber - 1]
        : (roundNumber % 2 && TOP_DOWN) || BOTTOM_UP;

      // after first two rounds of target feed, matchUps are every other round
      const targetRound =
        roundNumber - roundOffset <= 2 ? roundNumber - roundOffset : (roundNumber - roundOffset - 2) * 2 + 2;

      const link: any = {
        linkType: LOSER,
        source: {
          roundNumber,
          structureId: mainStructure.structureId,
        },
        target: {
          feedProfile,
          roundNumber: targetRound,
          structureId: consolationStructure.structureId,
        },
      };
      const groupedOrder = roundGroupedOrder[roundNumber - 1];
      if (groupedOrder) link.target.groupedOrder = groupedOrder;
      if (getDevContext()) {
        link.source.structureName = mainStructure.structureName;
        link.target.structureName = consolationStructure.structureName;
      }
      if (roundNumber === 2 && fmlc) {
        link.linkCondition = FIRST_MATCHUP;
        link.target.feedProfile = TOP_DOWN;
      }
      return roundsFed.includes(targetRound) ? link : undefined;
    })
    .filter(Boolean);
}
