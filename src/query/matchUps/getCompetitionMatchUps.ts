import { tournamentMatchUps } from './getTournamentMatchUps';
import { withContextExclusion } from './contextExclusion';

// constants and types
import { MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import {
  ContextProfile,
  GroupInfo,
  MatchUpFilters,
  ParticipantsProfile,
  PolicyDefinitions,
  ResultType,
  ScheduleVisibilityFilters,
  TournamentRecords,
} from '@Types/factoryTypes';

type CompetitionMatchUpsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  participantsProfile?: ParticipantsProfile;
  tournamentRecords: TournamentRecords;
  policyDefinitions?: PolicyDefinitions;
  matchUpFilters?: MatchUpFilters;
  contextFilters?: MatchUpFilters;
  contextProfile?: ContextProfile;
  hydrateParticipants?: boolean;
  afterRecoveryTimes?: boolean;
  useParticipantMap?: boolean;
  usePublishState?: boolean;
  nextMatchUps?: boolean;
  inContext?: boolean;
};

type CompetitionMatchUpsResult = ResultType & {
  mappedParticipants?: { [key: string]: HydratedParticipant };
  abandonedMatchUps?: HydratedMatchUp[];
  completedMatchUps?: HydratedMatchUp[];
  upcomingMatchUps?: HydratedMatchUp[];
  pendingMatchUps?: HydratedMatchUp[];
  byeMatchUps?: HydratedMatchUp[];
  groupInfo?: GroupInfo;
};

export function getCompetitionMatchUps(params: CompetitionMatchUpsArgs): CompetitionMatchUpsResult {
  return withContextExclusion(params, competitionMatchUpsUnredacted);
}

function competitionMatchUpsUnredacted({
  scheduleVisibilityFilters,
  hydrateParticipants,
  afterRecoveryTimes,
  participantsProfile,
  tournamentRecords,
  useParticipantMap,
  policyDefinitions,
  usePublishState,
  matchUpFilters,
  contextFilters,
  contextProfile,
  nextMatchUps,
  inContext,
}: CompetitionMatchUpsArgs): CompetitionMatchUpsResult {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const tournamentIds = Object.keys(tournamentRecords);
  const tournamentsMatchUps = tournamentIds.map((tournamentId) => {
    const tournamentRecord = tournamentRecords[tournamentId];
    return tournamentMatchUps({
      scheduleVisibilityFilters,
      hydrateParticipants,
      afterRecoveryTimes,
      participantsProfile,
      useParticipantMap,
      policyDefinitions,
      tournamentRecord,
      usePublishState,
      matchUpFilters,
      contextFilters,
      contextProfile,
      nextMatchUps,
      inContext,
    });
  });

  const mappedParticipants = {};
  const groupInfo = {};

  const competitionMatchUpsResult = tournamentsMatchUps.reduce((groupings, matchUpGroupings) => {
    const keys = Object.keys(matchUpGroupings);
    keys.forEach((key) => {
      if (key === 'groupInfo') {
        Object.assign(groupInfo, matchUpGroupings[key]);
      } else if (key === 'participants') {
        for (const participant of matchUpGroupings[key] ?? []) {
          mappedParticipants[participant.participantId] = participant;
        }
      } else if (Array.isArray(matchUpGroupings[key])) {
        if (!groupings[key]) groupings[key] = [];
        groupings[key] = groupings[key].concat(matchUpGroupings[key]);
      }
    });

    return groupings;
  }, {});

  return { ...competitionMatchUpsResult, groupInfo, mappedParticipants };
}
