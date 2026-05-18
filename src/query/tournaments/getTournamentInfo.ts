import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getTimeItemValues } from '@Mutate/timeItems/getTimeItemValues';
import { getParticipants } from '@Query/participants/getParticipants';
import { getPublishState } from '@Query/publishing/getPublishState';
import { extractEventInfo } from '@Query/event/extractEventInfo';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ADMINISTRATION, MEDIA, MEDICAL, OFFICIAL, SECURITY } from '@Constants/participantRoles';
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { TOURNAMENT_IMAGE_RESOURCE_NAME } from '@Constants/tournamentConstants';
import POLICY_PRIVACY_STAFF from '@Fixtures/policies/POLICY_PRIVACY_STAFF';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

export function getTournamentInfo(params?: {
  withStructureDetails?: boolean;
  tournamentRecord: Tournament;
  withMatchUpStats?: boolean;
  usePublishState?: boolean;
  withVenueData?: boolean;
}): {
  tournamentInfo?: any;
  eventInfo?: any[];
  error?: ErrorType;
} {
  const { tournamentRecord, withMatchUpStats, withStructureDetails, withVenueData } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const extractTournamentInfo = ({
    tournamentId,
    tournamentRank,
    tournamentStatus,

    formalName,
    tournamentName,
    promotionalName,
    onlineResources,

    localTimeZone,
    activeDates,
    startDate,
    endDate,

    hostCountryCode,
    venues,
    notes,

    registrationProfile,

    updatedAt,
  }: Tournament) => ({
    tournamentId,
    tournamentRank,
    tournamentStatus,

    formalName,
    tournamentName,
    promotionalName,
    onlineResources,

    localTimeZone,
    activeDates,
    startDate,
    endDate,

    hostCountryCode,
    venues,
    notes,

    registrationProfile,

    updatedAt,
  });

  const tournamentInfo: any = extractTournamentInfo(tournamentRecord);

  const primaryVenue = tournamentRecord.venues?.find((v) => v.isPrimary);
  if (primaryVenue?.addresses?.length) {
    tournamentInfo.tournamentAddress = primaryVenue.addresses[0];
  }

  const participantResult = getParticipants({
    participantFilters: { participantRoles: [ADMINISTRATION, OFFICIAL, MEDIA, MEDICAL, SECURITY] },
    policyDefinitions: POLICY_PRIVACY_STAFF,
    tournamentRecord,
  });

  const tournamentContacts = participantResult?.participants ?? [];
  if (tournamentContacts) tournamentInfo.tournamentContacts = tournamentContacts;

  const imageUrl = tournamentRecord?.onlineResources?.find(
    (r: any) => r.name === TOURNAMENT_IMAGE_RESOURCE_NAME && r.resourceType === 'URL',
  )?.identifier;
  if (imageUrl) tournamentInfo.imageUrl = imageUrl;

  const publishState = getPublishState({ tournamentRecord })?.publishState;
  const publishedEventIds = publishState?.tournament?.status?.publishedEventIds ?? [];
  const eventInfo: any[] = [];

  for (const event of tournamentRecord.events ?? []) {
    if (!params?.usePublishState || publishedEventIds.includes(event.eventId)) {
      const info = extractEventInfo({ event }).eventInfo;
      if (info) eventInfo.push(info);
    }
  }

  tournamentInfo.timeItemValues = getTimeItemValues({ element: tournamentRecord });

  tournamentInfo.publishState = publishState?.tournament;
  tournamentInfo.eventInfo = eventInfo;

  const structures: any[] = [];
  const matchUps: any[] = [];
  if (withMatchUpStats || withStructureDetails) {
    for (const event of tournamentRecord.events ?? []) {
      for (const drawDefinition of event.drawDefinitions ?? []) {
        for (const structure of drawDefinition.structures ?? []) {
          matchUps.push(...(structure.matchUps ?? []));
          structures.push(
            definedAttributes({
              eventId: event.eventId,
              eventName: event.eventName,
              eventType: event.eventType,
              drawId: drawDefinition.drawId,
              drawName: drawDefinition.drawName,
              drawType: drawDefinition.drawType,
              structureId: structure.structureId,
              structureName: structure.structureName,
              stage: structure.stage,
              stageSequence: structure.stageSequence,
              positionAssignments: structure.positionAssignments,
              seedAssignments: structure.seedAssignments,
              matchUpFormat: structure.matchUpFormat,
            }),
          );
        }
      }
    }
  }

  if (withStructureDetails) {
    tournamentInfo.structures = structures;
  }

  if (withMatchUpStats) {
    const individualParticipantCount =
      tournamentRecord.participants?.filter((p) => p.participantType === INDIVIDUAL).length ?? 0;
    const teamParticipantCount = tournamentRecord.participants?.filter((p) => p.participantType === TEAM).length ?? 0;
    const eventCount = tournamentRecord.events?.length ?? 0;

    const nonByeMatchUps = matchUps?.filter((m) => m.matchUpStatus !== BYE);
    const total = nonByeMatchUps?.length;
    const completed = nonByeMatchUps?.filter(
      (m) => completedMatchUpStatuses.includes(m.matchUpStatus) || m.winningSide,
    )?.length;
    const scheduled = nonByeMatchUps?.filter((matchUp) => {
      return scheduledMatchUpDate({ matchUp })?.scheduledDate || scheduledMatchUpTime({ matchUp })?.scheduledTime;
    })?.length;
    const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

    tournamentInfo.matchUpStats = { total, completed, scheduled, percentComplete };
    tournamentInfo.individualParticipantCount = individualParticipantCount;
    tournamentInfo.teamParticipantCount = teamParticipantCount;
    tournamentInfo.eventCount = eventCount;
  }

  if (withVenueData) {
    const { venues } = getVenuesAndCourts({ tournamentRecord });
    tournamentInfo.venues = venues ?? [];
  }

  return {
    tournamentInfo: makeDeepCopy(definedAttributes(tournamentInfo), false, true),
    ...SUCCESS,
  };
}
