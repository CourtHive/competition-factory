import { allTournamentMatchUps } from './getAllTournamentMatchUps';
import { withContextExclusion } from './contextExclusion';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  ContextProfile,
  MatchUpFilters,
  ParticipantsProfile,
  PolicyDefinitions,
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
  afterRecoveryTimes?: boolean;
  usePublishState?: boolean;
  nextMatchUps?: boolean;
  inContext?: boolean;
};

type CompetitionMatchUpsResult = {
  matchUps?: HydratedMatchUp[];
  error?: ErrorType;
};

export function allCompetitionMatchUps(params: CompetitionMatchUpsArgs): CompetitionMatchUpsResult {
  return withContextExclusion(params, allCompetitionMatchUpsUnredacted);
}

function allCompetitionMatchUpsUnredacted({
  scheduleVisibilityFilters,
  afterRecoveryTimes,
  participantsProfile,
  tournamentRecords,
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
  const competitionMatchUps: HydratedMatchUp[] = tournamentIds
    .map((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      return (
        allTournamentMatchUps({
          scheduleVisibilityFilters,
          afterRecoveryTimes,
          participantsProfile,
          policyDefinitions,
          tournamentRecord,
          usePublishState,
          matchUpFilters,
          contextFilters,
          contextProfile,
          nextMatchUps,
          inContext,
        }).matchUps ?? []
      );
    })
    .flat();

  return { ...SUCCESS, matchUps: competitionMatchUps };
}
