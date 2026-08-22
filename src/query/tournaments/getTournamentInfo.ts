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
import {
  ADMINISTRATION,
  DIRECTOR,
  HOSPITALITY,
  MEDIA,
  MEDICAL,
  OFFICIAL,
  PHYSIO,
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TRAINER,
  TRANSPORT,
} from '@Constants/participantRoles';
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { TOURNAMENT_IMAGE_RESOURCE_NAME } from '@Constants/tournamentConstants';
import POLICY_PRIVACY_STAFF from '@Fixtures/policies/POLICY_PRIVACY_STAFF';
import { ParticipantRoleUnion, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Roles whose holders appear in `tournamentContacts`.
 *
 * DIRECTOR was absent, which meant the **tournament director** — the single person a competitor most
 * needs to reach — was excluded from the tournament's contact list by role, before any question about
 * contact details arose. SUPERVISOR joined it, and CA added the on-site service roles a competitor
 * genuinely needs to reach during an event: PHYSIO, TRAINER, STRINGER, TRANSPORT, HOSPITALITY.
 *
 * Still excluded: COACH, CAPTAIN, VOLUNTEER, SCOREKEEPER, TIMEKEEPER, OTHER. A coach or captain is
 * affiliated with a competitor rather than with the tournament, and publishing them would turn the
 * tournament's contact list into a roster.
 *
 * This is the set for the bundled policy. A provider supplying its own `policyDefinitions` shapes which
 * ATTRIBUTES are published; this list decides WHO is considered staff at all. Note that appearing here
 * publishes nothing on its own — each contact still has to be marked `isPublic`.
 */
const STAFF_CONTACT_ROLES = [
  ADMINISTRATION,
  DIRECTOR,
  HOSPITALITY,
  MEDIA,
  MEDICAL,
  OFFICIAL,
  PHYSIO,
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TRAINER,
  TRANSPORT,
] as ParticipantRoleUnion[];

/**
 * Keep only contacts explicitly marked `isPublic === true`.
 *
 * Runs AFTER the privacy policy has shaped which attributes survive, and is deliberately a predicate
 * rather than part of the policy template. A template array acts as an allow-list, but `attributeFilter`
 * only evaluates it for keys the source object actually carries (`attributeFilter.ts:49-51`) — so a
 * contact with no `isPublic` is never examined and passes. That is fail-OPEN, and since nothing in the
 * ecosystem writes the flag today, every existing contact would publish.
 *
 * Strict equality is the point: absent and `false` both withhold. Opting in has to be deliberate.
 */
function publishableContacts(participant: any): any {
  const filterContacts = (contacts: any) =>
    Array.isArray(contacts) ? contacts.filter((contact) => contact?.isPublic === true) : contacts;

  if (!participant?.contacts && !participant?.person?.contacts) return participant;

  return {
    ...participant,
    ...(participant.contacts ? { contacts: filterContacts(participant.contacts) } : {}),
    ...(participant.person?.contacts
      ? { person: { ...participant.person, contacts: filterContacts(participant.person.contacts) } }
      : {}),
  };
}

export function getTournamentInfo(params?: {
  withStructureDetails?: boolean;
  tournamentRecord: Tournament;
  withMatchUpStats?: boolean;
  usePublishState?: boolean;
  policyDefinitions?: any;
  withVenueData?: boolean;
}): {
  tournamentInfo?: any;
  eventInfo?: any[];
  error?: ErrorType;
} {
  const { tournamentRecord, withMatchUpStats, withStructureDetails, withVenueData, policyDefinitions } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const extractTournamentInfo = ({
    tournamentId,
    tournamentRank,
    tournamentStatus,
    tournamentTier,

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
    parentOrganisation,

    updatedAt,
  }: Tournament) => ({
    tournamentId,
    tournamentRank,
    tournamentStatus,
    tournamentTier,

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
    // The owning provider (organisationId / name / abbreviation). Public info —
    // lets off-server consumers scope provider-keyed reads/writes (e.g. courthive-
    // public registration against the declarations service) without a mutation-server call.
    parentOrganisation,

    updatedAt,
  });

  const tournamentInfo: any = extractTournamentInfo(tournamentRecord);

  const primaryVenue = tournamentRecord.venues?.find((v) => v.isPrimary);
  if (primaryVenue?.addresses?.length) {
    tournamentInfo.tournamentAddress = primaryVenue.addresses[0];
  }

  const participantResult = getParticipants({
    participantFilters: { participantRoles: STAFF_CONTACT_ROLES },
    policyDefinitions: policyDefinitions ?? POLICY_PRIVACY_STAFF,
    tournamentRecord,
  });

  const tournamentContacts = (participantResult?.participants ?? []).map(publishableContacts);
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
