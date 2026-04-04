import { getTargetElement } from '@Query/scales/getTargetElement';

import { WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { SCALE } from '@Constants/scaleConstants';
import { RANKING } from '@Constants/scaleConstants';

type QualityWin = {
  opponentParticipantId: string;
  opponentRank: number;
  matchUpId: string;
  points: number;
};

type GetQualityWinPointsArgs = {
  qualityWinProfiles: any[];
  wonMatchUpIds: string[];
  mappedMatchUps: Record<string, any>;
  participantId?: string;
  participantSideMap: Record<string, number>; // matchUpId → sideNumber
  tournamentParticipants: any[];
  tournamentStartDate?: string;
  level?: number;
};

export function getQualityWinPoints({
  qualityWinProfiles,
  wonMatchUpIds,
  mappedMatchUps,
  participantSideMap,
  tournamentParticipants,
  tournamentStartDate,
  level,
}: GetQualityWinPointsArgs) {
  let totalQualityWinPoints = 0;
  const qualityWins: QualityWin[] = [];

  // build a participant lookup map
  const participantById: Record<string, any> = {};
  for (const p of tournamentParticipants) {
    participantById[p.participantId] = p;
  }

  for (const profile of qualityWinProfiles) {
    const {
      rankingScaleName,
      rankingSnapshot = 'latestAvailable',
      includeWalkovers = false,
      rankingRanges = [],
      maxBonusPerTournament,
    } = profile;

    let profilePoints = 0;

    for (const matchUpId of wonMatchUpIds) {
      const result = evaluateMatchUpForQualityWin({
        matchUpId,
        mappedMatchUps,
        participantSideMap,
        participantById,
        includeWalkovers,
        rankingScaleName,
        rankingSnapshot,
        tournamentStartDate,
        rankingRanges,
        level,
      });

      if (!result) continue;

      profilePoints += result.points;
      qualityWins.push(result);
    }

    // apply per-tournament cap
    if (maxBonusPerTournament !== undefined && profilePoints > maxBonusPerTournament) {
      profilePoints = maxBonusPerTournament;
    }

    totalQualityWinPoints += profilePoints;
  }

  return { qualityWinPoints: totalQualityWinPoints, qualityWins };
}

function resolveRanking({
  participant,
  rankingScaleName,
  rankingSnapshot,
  tournamentStartDate,
}: {
  participant: any;
  rankingScaleName: string;
  rankingSnapshot: string;
  tournamentStartDate?: string;
}): number | undefined {
  const timeItems = participant.timeItems ?? [];

  // filter to ranking timeItems for the given scale name
  // timeItem.itemType format: "SCALE.RANKING.{eventType}.{scaleName}"
  const rankingItems = timeItems.filter((ti) => {
    if (!ti?.itemType) return false;
    const parts = ti.itemType.split('.');
    return parts[0] === SCALE && parts[1] === RANKING && parts[3] === rankingScaleName;
  });

  if (!rankingItems.length) return undefined;

  let filteredItems = rankingItems;

  if (rankingSnapshot === 'tournamentStart' && tournamentStartDate) {
    const cutoff = new Date(tournamentStartDate).getTime();
    filteredItems = rankingItems.filter((ti) => {
      const itemDate = ti.itemDate ? new Date(ti.itemDate).getTime() : 0;
      return itemDate <= cutoff;
    });
  }
  // 'latestAvailable' and 'matchDate' (future) just use all items

  if (!filteredItems.length) return undefined;

  // sort by createdAt ascending, take most recent
  filteredItems.sort(
    (a, b) => (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0),
  );

  const mostRecent = filteredItems.at(-1);
  const value = mostRecent?.itemValue;

  return typeof value === 'number' ? value : undefined;
}

function evaluateMatchUpForQualityWin({
  matchUpId,
  mappedMatchUps,
  participantSideMap,
  participantById,
  includeWalkovers,
  rankingScaleName,
  rankingSnapshot,
  tournamentStartDate,
  rankingRanges,
  level,
}): QualityWin | undefined {
  const matchUp = mappedMatchUps[matchUpId];
  if (!matchUp) return undefined;

  const { matchUpStatus, sides = [], winningSide } = matchUp;

  if (!includeWalkovers && (matchUpStatus === WALKOVER || matchUpStatus === DEFAULTED)) return undefined;

  const mySideNumber = participantSideMap[matchUpId];
  if (!mySideNumber || winningSide !== mySideNumber) return undefined;

  const opponentSide = sides.find((s) => s.sideNumber !== mySideNumber);
  const opponentParticipantId = opponentSide?.participantId;
  if (!opponentParticipantId) return undefined;

  const opponent = participantById[opponentParticipantId];
  if (!opponent) return undefined;

  const opponentRank = resolveRanking({
    participant: opponent,
    rankingScaleName,
    rankingSnapshot,
    tournamentStartDate,
  });

  if (!opponentRank) return undefined;

  const matchingRange = rankingRanges.find(
    (r) => opponentRank >= r.rankRange[0] && opponentRank <= r.rankRange[1],
  );

  if (!matchingRange) return undefined;

  let value: number | undefined;
  if (typeof matchingRange.value === 'number') {
    value = matchingRange.value;
  } else if (typeof matchingRange.value === 'object') {
    const resolved = getTargetElement(level, matchingRange.value.level ?? matchingRange.value);
    if (typeof resolved === 'number') value = resolved;
  }

  if (!value) return undefined;

  return {
    opponentParticipantId,
    opponentRank,
    points: value,
    matchUpId,
  };
}
