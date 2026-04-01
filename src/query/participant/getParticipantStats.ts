import { countGames, countPoints, countSets } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { getMatchUpCompetitiveProfile } from '@Query/matchUp/getMatchUpCompetitiveProfile';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';
import { decorateResult } from '@Functions/global/decorateResult';
import { getParticipantId } from '@Functions/global/extractors';
import { intersection } from '@Tools/arrays';
import { isObject } from '@Tools/objects';

// constants and types
import { ParticipantTypeUnion, Tournament } from '@Types/tournamentTypes';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { ResultType, Tally } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_MATCHUP,
  INVALID_PARTICIPANT_IDS,
  MISSING_MATCHUPS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

export type StatCounters = {
  participantName: string;
  competitorIds: string[];
  participantId: string;

  matchUpStatuses: { [key: string]: number };
  competitiveness: { [key: string]: Tally };
  competitiveRatio?: number;
  decisiveRatio?: number;
  routineRatio?: number;

  tiebreaksRatio?: number;
  matchUpsRatio?: number;
  pointsRatio?: number;
  gamesRatio?: number;
  setsRatio?: number;

  tiebreaksRank?: number;
  matchUpsRank?: number;
  pointsRank?: number;
  gamesRank?: number;
  setsRank?: number;

  tiebreaks: Tally;
  matchUps: Tally;
  points: Tally;
  games: Tally;
  sets: Tally;
};

type GetTeamStatistics = {
  withCompetitiveProfiles?: boolean;
  opponentParticipantId?: string;
  withIndividualStats?: boolean;
  tournamentRecord: Tournament;
  matchUps?: HydratedMatchUp[];
  teamParticipantId?: string;
  withScaleValues?: boolean;
  tallyPolicy?: any;
};

type TeamStatsResults = {
  allParticipantStats?: StatCounters[];
  relevantMatchUps: HydratedMatchUp[];
  participatingTeamsCount?: number;
  opponentStats?: StatCounters;
  teamStats?: StatCounters;
  success: boolean;
};

export function getParticipantStats({
  withCompetitiveProfiles,
  opponentParticipantId,
  withIndividualStats,
  teamParticipantId,
  tournamentRecord,
  withScaleValues,
  tallyPolicy,
  matchUps,
}: GetTeamStatistics): ResultType | TeamStatsResults {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (matchUps && !Array.isArray(matchUps)) return { error: INVALID_MATCHUP };

  const participantsProfile = withScaleValues ? { withScaleValues } : undefined;
  matchUps = matchUps ?? allTournamentMatchUps({ tournamentRecord, participantsProfile }).matchUps;
  if (!matchUps?.length) return { error: MISSING_MATCHUPS };

  const teamParticipantIds: string[] = [];
  if (opponentParticipantId) teamParticipantIds.push(opponentParticipantId);
  if (teamParticipantId) teamParticipantIds.push(teamParticipantId);

  const participantFilters = !teamParticipantIds.length
    ? { participantTypes: [TEAM_PARTICIPANT as ParticipantTypeUnion] }
    : { participantIds: teamParticipantIds };

  const teamParticipants = getParticipants({ participantFilters, tournamentRecord }).participants ?? [];

  if (!teamParticipants.every(({ participantType }) => participantType === TEAM_PARTICIPANT)) {
    return { error: INVALID_PARTICIPANT_IDS };
  }

  if (!teamParticipantIds.length) teamParticipantIds.push(...teamParticipants.map(getParticipantId));

  const participantDetails = new Map<string, { participantName: string; ratings: any }>();
  const participantStats = new Map<string, StatCounters>();
  const participating = new Map<string, boolean>();
  const teamMap = new Map<string, string[]>();

  const initStats = (participantId, participantName = '') =>
    participantStats.get(participantId) ||
    (participantStats.set(participantId, {
      participantName,
      participantId,

      competitorIds: [],
      competitiveness: {},
      matchUpStatuses: {},

      tiebreaks: [0, 0],
      matchUps: [0, 0],
      points: [0, 0],
      games: [0, 0],
      sets: [0, 0],
    }) &&
      participantStats.get(participantId));

  for (const teamParticipant of teamParticipants) {
    const { participantId, individualParticipantIds } = teamParticipant;
    teamMap.set(participantId, individualParticipantIds ?? []);
    initStats(participantId, teamParticipant.participantName);
  }

  if (teamParticipantId && !teamMap.get(teamParticipantId))
    return decorateResult({
      result: { error: PARTICIPANT_NOT_FOUND },
      context: { teamParticipantId },
    });

  if (opponentParticipantId && !teamMap.get(opponentParticipantId))
    return decorateResult({
      result: { error: PARTICIPANT_NOT_FOUND },
      context: { opponentParticipantId },
    });

  const relevantMatchUps: HydratedMatchUp[] = [];

  const getSideParticipantIds = (sides: HydratedSide[]) => {
    const sideParticipantIds: [string[], string[]] = [[], []];

    for (const side of sides) {
      const participant = side.participant;
      if (participant?.participantName) {
        participantDetails.set(participant.participantId, {
          participantName: participant.participantName,
          ratings: participant.ratings,
        });
        const stats = participantStats.get(participant.participantId);
        if (stats) stats.participantName = participant.participantName;
      }
    }

    const getCompetitorIds = ({ side, individualParticipantIds }) => {
      return (
        (side.participantId &&
          (!individualParticipantIds?.length || individualParticipantIds.includes(side.participantId)) && [
            side.participantId,
          ]) ||
        (side.participant?.individualParticipantIds?.length &&
          (!individualParticipantIds?.length ||
            intersection(individualParticipantIds, side.participant?.individualParticipantIds).length ===
              side.participant?.individualParticipantIds?.length) &&
          side.participant.individualParticipantIds)
      );
    };

    if (teamMap.size) {
      const processSides = (thisTeamId, individualParticipantIds) => {
        for (const side of sides) {
          if (!side.participant) continue;
          const competitorIds = getCompetitorIds({
            individualParticipantIds,
            side,
          });
          if (competitorIds?.length) {
            const sideNumber = side.sideNumber;
            if (!sideNumber) continue;
            const ids = [thisTeamId];
            if (withIndividualStats) ids.push(...competitorIds);
            sideParticipantIds[sideNumber - 1] = ids;

            const stats = participantStats.get(thisTeamId);
            for (const id of competitorIds.filter(Boolean)) {
              if (stats && !stats.competitorIds.includes(id)) stats.competitorIds.push(id);
            }
          }
        }
      };

      if (teamParticipantId) {
        const processForTeam =
          !opponentParticipantId ||
          sides.every((side) => {
            return (
              side.participant &&
              (getCompetitorIds({
                individualParticipantIds: teamMap.get(teamParticipantId),
                side,
              }) ||
                getCompetitorIds({
                  individualParticipantIds: teamMap.get(opponentParticipantId),
                  side,
                }))
            );
          });

        if (processForTeam) {
          processSides(teamParticipantId, teamMap.get(teamParticipantId));
        }
      } else {
        for (const [thisTeamId, individualParticipantIds] of teamMap) {
          processSides(thisTeamId, individualParticipantIds);
        }
      }
    } else if (withIndividualStats) {
      // no teams so process individuals
      for (const side of sides) {
        if (!side.participant) continue;
        const competitorIds = getCompetitorIds({
          individualParticipantIds: [],
          side,
        });
        const sideNumber = side.sideNumber;
        if (!sideNumber) continue;
        sideParticipantIds[sideNumber - 1] = competitorIds;
      }
    }

    return sideParticipantIds;
  };

  for (const matchUp of matchUps) {
    if (!isObject(matchUp)) return { error: INVALID_MATCHUP };

    const { matchUpStatus, matchUpFormat, matchUpType, winningSide, score, sides } = matchUp;

    if (!sides || !score || matchUpType === TEAM_MATCHUP || matchUpStatus === BYE) continue;

    const sideParticipantIds = getSideParticipantIds(sides);
    if (!sideParticipantIds.filter(Boolean).length) continue;

    const competitiveness =
      withCompetitiveProfiles && winningSide && getMatchUpCompetitiveProfile({ matchUp })?.competitiveness;

    relevantMatchUps.push(matchUp);

    const setsTally = countSets({
      matchUpStatus,
      matchUpFormat,
      tallyPolicy,
      winningSide,
      score,
    });
    const gamesTally = countGames({
      matchUpStatus,
      matchUpFormat,
      tallyPolicy,
      winningSide,
      score,
    });
    const { pointsTally, tiebreaksTally } = countPoints({
      matchUpFormat,
      score,
    });

    accumulateTallies({
      tallies: { setsTally, gamesTally, pointsTally, tiebreaksTally },
      sideParticipantIds,
      participantDetails,
      competitiveness,
      matchUpStatus,
      winningSide,
      initStats,
    });
  }
  const ratio = computeRatios(participantStats, participating);

  if (!teamParticipantId) {
    computeRanks(participantStats, ratio);
  }

  const result: TeamStatsResults = { relevantMatchUps, ...SUCCESS };
  if (teamParticipantId) {
    result.teamStats = participantStats.get(teamParticipantId);
    if (opponentParticipantId) result.opponentStats = participantStats.get(opponentParticipantId);
  } else {
    result.participatingTeamsCount = participating.size;
  }
  result.allParticipantStats = [...participantStats.values()];

  return result;
}

const STATS_ATTRIBUTES = ['tiebreaks', 'matchUps', 'points', 'games', 'sets'];
const COMPETITIVENESS_ATTRIBUTES = ['competitive', 'routine', 'decisive'];

function accumulateTallies({ tallies, sideParticipantIds, participantDetails, competitiveness, matchUpStatus, winningSide, initStats }) {
  const { setsTally, gamesTally, pointsTally, tiebreaksTally } = tallies;

  sideParticipantIds.forEach((ids, index) => {
    for (const id of ids) {
      const participantName = participantDetails.get(id)?.participantName;
      const stats = initStats(id, participantName);
      if (stats) {
        const teamSumTally = (stat: string, tally: number[]) => tally.forEach((t, i) => (stats[stat][i] += t));
        const tiebreaks = index ? [...tiebreaksTally].reverse() : tiebreaksTally;
        const points = index ? [...pointsTally].reverse() : pointsTally;
        const games = index ? [...gamesTally].reverse() : gamesTally;
        const sets = index ? [...setsTally].reverse() : setsTally;
        teamSumTally('tiebreaks', tiebreaks);
        teamSumTally('points', points);
        teamSumTally('games', games);
        teamSumTally('sets', sets);
        if (winningSide) {
          const tallyIndex = winningSide - 1 === index ? 0 : 1;
          stats.matchUps[tallyIndex] += 1;
        }
        if (competitiveness) {
          const attr = competitiveness.toLowerCase();
          if (!stats.competitiveness[attr]) stats.competitiveness[attr] = [0, 0];
          stats.competitiveness[attr][index] += 1;
        }
        if (matchUpStatus) {
          const attr = matchUpStatus.toLowerCase();
          if (!stats.matchUpStatuses[attr]) stats.matchUpStatuses[attr] = 0;
          stats.matchUpStatuses[attr] += 1;
        }
      }
    }
  });
}

function computeRatios(participantStats: Map<string, StatCounters>, participating: Map<string, boolean>) {
  const ratio = new Map<string, number[]>();
  const add = (a, b) => (a ?? 0) + (b ?? 0);

  for (const [participantId, stats] of participantStats.entries()) {
    for (const attr of STATS_ATTRIBUTES) {
      const total = stats[attr].reduce(add);
      if (total) {
        const value = stats[attr][0] / total;
        const accessor = `${attr}Ratio`;
        const fixedValue = parseFloat(value.toFixed(2));
        stats[accessor] = fixedValue;
        participating.set(participantId, true);
        if (!ratio.has(accessor)) ratio.set(accessor, []);
        ratio.get(accessor)?.push(fixedValue);
      }
    }
    for (const attr of COMPETITIVENESS_ATTRIBUTES) {
      const total = stats.competitiveness?.[attr]?.reduce(add);
      if (total) {
        const value = stats.competitiveness[attr][0] / total;
        const accessor = `${attr}Ratio`;
        const fixedValue = parseFloat(value.toFixed(2));
        stats[accessor] = fixedValue;
      }
    }
  }

  return ratio;
}

function computeRanks(participantStats: Map<string, StatCounters>, ratio: Map<string, number[]>) {
  const highLowSort = (a, b) => b - a;
  for (const stats of participantStats.values()) {
    for (const attr of STATS_ATTRIBUTES) {
      const accessor = `${attr}Ratio`;
      if (typeof stats[accessor] === 'number') {
        const index = ratio.get(accessor)?.sort(highLowSort).indexOf(stats[accessor]);
        if (typeof index === 'number' && index >= 0) {
          const rankAccessor = `${attr}Rank`;
          stats[rankAccessor] = index + 1;
        }
      }
    }
  }
}
