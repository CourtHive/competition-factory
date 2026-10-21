import { getTargetElement } from '@Query/scales/getTargetElement';

// constants
import { LATEST_AVAILABLE, MATCH_DATE, TOURNAMENT_START, USE_DEFAULT_RANK } from '@Constants/rankingConstants';
import { WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { SCALE, RANKING } from '@Constants/scaleConstants';
import type { Participant } from '@Types/tournamentTypes';

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
      rankingSnapshot = LATEST_AVAILABLE,
      unrankedOpponentBehavior,
      defaultRank,
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
        unrankedRank: unrankedOpponentBehavior === USE_DEFAULT_RANK ? defaultRank : undefined,
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

/**
 * The date an opponent's ranking is read as of, or undefined for the latest.
 *
 * `matchDate` uses the match's `endDate`, else its scheduled date; a match
 * carrying neither falls back to the tournament start rather than to the
 * latest ranking, so a missing date never reads a rank from after the match.
 */
export function getRankingCutoffDate({
  rankingSnapshot,
  tournamentStartDate,
  matchUp,
}: {
  rankingSnapshot: string;
  tournamentStartDate?: string;
  matchUp?: { endDate?: string; schedule?: { scheduledDate?: string } };
}): string | undefined {
  if (rankingSnapshot === TOURNAMENT_START) return tournamentStartDate;
  if (rankingSnapshot === MATCH_DATE)
    return matchUp?.endDate ?? matchUp?.schedule?.scheduledDate ?? tournamentStartDate;
  return undefined;
}

function resolveRanking({
  participant,
  rankingScaleName,
  cutoffDate,
}: {
  participant: Participant;
  rankingScaleName: string;
  cutoffDate?: string;
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

  if (cutoffDate) {
    const cutoff = new Date(cutoffDate).getTime();
    filteredItems = rankingItems.filter((ti) => {
      const itemDate = ti.itemDate ? new Date(ti.itemDate).getTime() : 0;
      return itemDate <= cutoff;
    });
  }

  if (!filteredItems.length) return undefined;

  // sort by createdAt ascending, take most recent
  filteredItems.sort(
    (a, b) => (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0),
  );

  const mostRecent = filteredItems.at(-1);
  const value = mostRecent?.itemValue;

  return typeof value === 'number' ? value : undefined;
}

type EvaluateMatchUpArgs = {
  matchUpId: string;
  mappedMatchUps: Record<string, any>;
  participantSideMap: Record<string, number>;
  participantById: Record<string, any>;
  includeWalkovers: boolean;
  rankingScaleName: string;
  rankingSnapshot: string;
  tournamentStartDate?: string;
  /** The rank an opponent with no ranking is treated as holding (useDefaultRank). */
  unrankedRank?: number;
  /** `value` is a number, or a level-keyed lookup resolved with getTargetElement. */
  rankingRanges: { rankRange: number[]; value: number | Record<string, any> }[];
  level?: number;
};

function evaluateMatchUpForQualityWin({
  matchUpId,
  mappedMatchUps,
  participantSideMap,
  participantById,
  includeWalkovers,
  rankingScaleName,
  rankingSnapshot,
  tournamentStartDate,
  unrankedRank,
  rankingRanges,
  level,
}: EvaluateMatchUpArgs): QualityWin | undefined {
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

  const opponentRank =
    resolveRanking({
      cutoffDate: getRankingCutoffDate({ rankingSnapshot, tournamentStartDate, matchUp }),
      participant: opponent,
      rankingScaleName,
    }) ?? unrankedRank;

  if (!opponentRank) return undefined;

  const matchingRange = rankingRanges.find((r) => opponentRank >= r.rankRange[0] && opponentRank <= r.rankRange[1]);

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
