import { getParticipantEntries } from '@Query/participants/getParticipantEntries';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { filterParticipants } from '@Query/participants/filterParticipants';
import { getParticipantMap } from '@Query/participants/getParticipantMap';
import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { attributeFilter } from '@Tools/attributeFilter';
import { isObject } from '@Tools/objects';

// constants and types
import { MISSING_TOURNAMENT_RECORD, ErrorType } from '@Constants/errorConditionConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import {
  ContextProfile,
  ParticipantFilters,
  PolicyDefinitions,
  ScheduleAnalysis,
  ParticipantMap,
  MatchUpFilters,
} from '@Types/factoryTypes';

type GetParticipantsArgs = {
  withIndividualParticipants?: boolean | { [key: string]: any };
  participantFilters?: ParticipantFilters;
  scheduleAnalysis?: ScheduleAnalysis;
  policyDefinitions?: PolicyDefinitions;
  withPotentialMatchUps?: boolean;
  contextFilters?: MatchUpFilters;
  matchUpFilters?: MatchUpFilters;
  returnParticipantMap?: boolean; // defaults to true
  contextProfile?: ContextProfile;
  tournamentRecord: Tournament;
  withRankingProfile?: boolean;
  convertExtensions?: boolean;
  withScheduleItems?: boolean;
  withSignInStatus?: boolean;
  withTeamMatchUps?: boolean;
  withScaleValues?: boolean;
  usePublishState?: boolean;
  returnMatchUps?: boolean; // defaults to true
  withStatistics?: boolean;
  withOpponents?: boolean;
  withMatchUps?: boolean;
  internalUse?: boolean;
  withSeeding?: boolean;
  withEvents?: boolean;
  withDraws?: boolean;
  withISO2?: boolean;
  withIOC?: boolean;
};
export function getParticipants(params: GetParticipantsArgs): {
  eventsPublishStatuses?: { [key: string]: any };
  participantIdsWithConflicts?: string[];
  participants?: HydratedParticipant[];
  missingParticipantIds?: string[];
  participantMap?: ParticipantMap;
  matchUps?: HydratedMatchUp[];
  derivedEventInfo?: any;
  derivedDrawInfo?: any;
  mappedMatchUps?: any;
  error?: ErrorType;
  success?: boolean;
} {
  const {
    withIndividualParticipants,
    participantFilters = {},
    withPotentialMatchUps,
    withRankingProfile,
    convertExtensions,
    policyDefinitions,
    withScheduleItems,
    tournamentRecord,
    scheduleAnalysis,
    withSignInStatus,
    withTeamMatchUps,
    withScaleValues,
    usePublishState,
    withStatistics,
    contextFilters,
    matchUpFilters,
    contextProfile,
    withOpponents,
    withMatchUps,
    internalUse,
    withSeeding,
    withEvents,
    withDraws,
    withISO2,
    withIOC,
  } = params;

  const stack = 'getParticipants';

  if (!tournamentRecord) return decorateResult({ stack, result: { error: MISSING_TOURNAMENT_RECORD } });

  if (withMatchUps || withRankingProfile) {
    getMatchUpDependencies({ tournamentRecord }); // ensure goesTos are present
  }

  const mapResult = getParticipantMap({
    convertExtensions,
    tournamentRecord,
    withSignInStatus,
    withScaleValues,
    internalUse,
    withISO2,
    withIOC,
  });

  let { participantMap } = mapResult;

  const entriesResult = getParticipantEntries({
    withMatchUps: withMatchUps ?? withRankingProfile,
    withEvents: withEvents ?? withRankingProfile,
    withDraws: withDraws ?? withRankingProfile,
    withPotentialMatchUps,
    participantFilters,
    withRankingProfile,
    convertExtensions,
    withScheduleItems,
    policyDefinitions,
    tournamentRecord,
    scheduleAnalysis,
    withTeamMatchUps,
    usePublishState,
    withStatistics,
    contextFilters,
    matchUpFilters,
    participantMap,
    withOpponents,
    contextProfile,
    withSeeding,
  });

  const { participantIdsWithConflicts, eventsPublishStatuses, derivedEventInfo, derivedDrawInfo, mappedMatchUps } =
    entriesResult;

  const matchUps: any[] = entriesResult.matchUps;

  participantMap = entriesResult.participantMap;

  const nextMatchUps = scheduleAnalysis ?? withPotentialMatchUps;

  const processParticipant = ({
    potentialMatchUps,
    scheduleConflicts,
    scheduleItems,
    participant,
    statistics,
    opponents,
    matchUps,
    events,
    draws,
  }): HydratedParticipant => {
    const participantDraws: any[] = Object.values(draws);
    const participantOpponents = Object.values(opponents);
    if (withOpponents) {
      participantDraws?.forEach((draw) => {
        draw.opponents = participantOpponents.filter((opponent: any) => opponent.drawId === draw.drawId);
      });
    }

    return definedAttributes(
      {
        ...participant,
        scheduleConflicts: scheduleAnalysis ? Object.values(scheduleConflicts) : undefined,
        draws: withDraws || withRankingProfile ? participantDraws : undefined,
        events: withEvents || withRankingProfile ? Object.values(events) : undefined,
        matchUps: withMatchUps || withRankingProfile ? Object.values(matchUps) : undefined,
        opponents: withOpponents ? participantOpponents : undefined,
        potentialMatchUps: nextMatchUps ? Object.values(potentialMatchUps) : undefined,
        statistics: withStatistics ? Object.values(statistics) : undefined,
        scheduleItems: withScheduleItems ? scheduleItems : undefined,
      },
      false,
      false,
      true,
    );
  };

  const ppMap = new Map<string, HydratedParticipant>();
  for (const participantId of Object.keys(participantMap)) {
    ppMap.set(participantId, processParticipant(participantMap[participantId]));
  }

  const processedParticipants: HydratedParticipant[] = [...ppMap.values()];

  const participantAttributes = policyDefinitions?.[POLICY_TYPE_PARTICIPANT];
  const template = participantAttributes?.participant;

  // filter must be last so attributes can be used for reporting & etc.
  const filteredParticipants = filterParticipants({
    participants: processedParticipants,
    participantFilters,
    tournamentRecord,
  });

  if (withIndividualParticipants) {
    const template = isObject(withIndividualParticipants) ? withIndividualParticipants : undefined;
    for (const participant of filteredParticipants) {
      for (const individualParticipantId of participant.individualParticipantIds ?? []) {
        participant.individualParticipants ??= [];
        const source = ppMap.get(String(individualParticipantId));
        const individualParticipant = template ? attributeFilter({ template, source }) : source;
        participant.individualParticipants.push(individualParticipant);
      }
    }
  }

  const participants: HydratedParticipant[] = template
    ? filteredParticipants.map((source) => attributeFilter({ source, template }))
    : filteredParticipants;

  return {
    participantMap: params.returnParticipantMap !== false ? participantMap : undefined,
    mappedMatchUps: params.returnMatchUps !== false ? mappedMatchUps : undefined,
    matchUps: params.returnMatchUps !== false ? matchUps : undefined,
    missingParticipantIds: mapResult.missingParticipantIds,
    participantIdsWithConflicts,
    eventsPublishStatuses,
    derivedEventInfo,
    derivedDrawInfo,
    participants,
    ...SUCCESS,
  };
}
