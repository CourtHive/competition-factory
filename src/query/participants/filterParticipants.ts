import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getAllPositionedParticipantIds } from '../drawDefinition/positionsGetter';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '../event/getFlightProfile';
import { getAccessorValue } from '@Tools/getAccessorValue';
import { coercedGender } from '@Helpers/coercedGender';
import { getTimeItem } from '../base/timeItems';
import { unique } from '@Tools/arrays';

// constants and types
import { SIGN_IN_STATUS } from '@Constants/participantConstants';
import { ParticipantFilters } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedParticipant } from '@Types/hydrated';
import { SINGLES } from '@Constants/eventConstants';

type FilterParticipantsArgs = {
  participantFilters: ParticipantFilters;
  participants: HydratedParticipant[];
  tournamentRecord: Tournament;
};

export function filterParticipants({
  participantFilters = {},
  tournamentRecord,
  participants = [],
}: FilterParticipantsArgs): HydratedParticipant[] {
  if (!Object.keys(participantFilters).length) {
    return participants;
  }

  const {
    accessorValues,
    drawEntryStatuses, // {string[]} participantIds that are in draw.entries or flightProfile.flights[].drawEnteredParticipantIds with entryStatuses
    positionedParticipants, // boolean - participantIds that are included in any structure.positionAssignments
    eventEntryStatuses, // {string[]} participantIds that are in entry.entries with entryStatuses
    participantRoles,
    participantRoleResponsibilities,
    participantTypes,
    participantIds,
    signInStatus,
    enableOrFiltering,
    eventIds,
    genders,
  } = participantFilters;

  const tournamentEvents =
    (isValidFilterArray(eventIds) && tournamentRecord?.events?.filter((event) => eventIds?.includes(event.eventId))) ||
    tournamentRecord?.events ||
    [];

  const drawEnteredParticipantIds = drawEntryStatuses && getDrawEntries({ drawEntryStatuses, tournamentEvents });

  const eventEnteredParticipantIds = eventEntryStatuses && getEventEntries({ eventEntryStatuses, tournamentEvents });

  const positionedParticipantIds =
    positionedParticipants !== undefined &&
    [true, false].includes(positionedParticipants) &&
    tournamentEvents.reduce((participantIds, event) => {
      return participantIds.concat(
        ...(event.drawDefinitions ?? [])
          .map((drawDefinition) => getAllPositionedParticipantIds({ drawDefinition }).allPositionedParticipantIds)
          .filter(Boolean),
      );
    }, []);

  const participantHasAccessorValues = (participant) => {
    return accessorValues?.reduce((hasValues, keyValue) => {
      const { accessor, value } = keyValue;
      const { values } = getAccessorValue({
        element: participant,
        accessor,
      });
      return hasValues && values?.includes(value);
    }, true);
  };

  // Membership sets — built once so the per-participant checks below are O(1)
  // rather than O(n). The original arrays are kept for the `!array` presence
  // guards (an absent filter differs from an empty set).
  // coerce to canonical so the filter matches records that store either the
  // extended form or a TODS short code (e.g. externally-built records with sex 'M')
  const genderSet = genders && new Set(genders.map((gender) => coercedGender(gender)));
  const participantTypeSet = participantTypes && new Set(participantTypes);
  const participantRoleSet = participantRoles && new Set(participantRoles);
  const participantIdSet = participantIds && new Set(participantIds);
  const drawEnteredSet = drawEnteredParticipantIds && new Set(drawEnteredParticipantIds);
  const eventEnteredSet = eventEnteredParticipantIds && new Set(eventEnteredParticipantIds);
  const positionedSet = positionedParticipantIds && new Set(positionedParticipantIds);

  participants = participants?.filter((participant) => {
    const participantSignInStatus = getTimeItem({
      element: participant,
      itemType: SIGN_IN_STATUS,
    } as any)?.timeItem?.itemValue;
    const {
      participantRoleResponsibilities: responsibilities,
      participantType,
      participantRole,
      participantId,
      person,
    } = participant;

    const hasGender =
      Array.isArray(genders) && genders?.length && person?.sex && genderSet?.has(coercedGender(person.sex));

    if (enableOrFiltering) {
      return (
        (genders && hasGender) ||
        (positionedParticipants && positionedSet.has(participantId)) ||
        (positionedParticipants === false && !positionedSet.has(participantId)) ||
        drawEnteredSet?.has(participantId) ||
        eventEnteredSet?.has(participantId) ||
        participantIdSet?.has(participantId) ||
        (signInStatus && participantSignInStatus === signInStatus) ||
        (participantTypes &&
          participantType &&
          isValidFilterArray(participantTypes) &&
          participantTypeSet?.has(participantType)) ||
        (participantRoles &&
          participantRole &&
          isValidFilterArray(participantRoles) &&
          participantRoleSet?.has(participantRole)) ||
        (participantRoleResponsibilities &&
          isValidFilterArray(responsibilities) &&
          isValidFilterArray(participantRoleResponsibilities) &&
          participantRoleResponsibilities.find((roleResponsbility) => responsibilities?.includes(roleResponsbility))) ||
        (accessorValues?.length && isValidFilterArray(accessorValues) && participantHasAccessorValues(participant))
      );
    } else {
      return (
        (!genders || hasGender) &&
        (positionedParticipants === undefined ||
          (positionedParticipants && positionedSet.has(participantId)) ||
          (positionedParticipants === false && !positionedSet.has(participantId))) &&
        (!drawEnteredParticipantIds || drawEnteredSet?.has(participantId)) &&
        (!eventEnteredParticipantIds || eventEnteredSet?.has(participantId)) &&
        (!participantIds || participantIdSet?.has(participantId)) &&
        (!signInStatus || participantSignInStatus === signInStatus) &&
        (!participantTypes ||
          (participantType && isValidFilterArray(participantTypes) && participantTypeSet?.has(participantType))) &&
        (!participantRoles ||
          (participantRole && isValidFilterArray(participantRoles) && participantRoleSet?.has(participantRole))) &&
        (!participantRoleResponsibilities ||
          (isValidFilterArray(responsibilities) &&
            isValidFilterArray(participantRoleResponsibilities) &&
            participantRoleResponsibilities.find((roleResponsbility) =>
              responsibilities?.includes(roleResponsbility),
            ))) &&
        (!accessorValues?.length || (isValidFilterArray(accessorValues) && participantHasAccessorValues(participant)))
      );
    }
  });

  if (tournamentEvents.length && eventIds) {
    const participantIds = new Set(
      tournamentEvents
        .filter((event) => eventIds.includes(event.eventId))
        .flatMap((event) => {
          const enteredParticipantIds = (event.entries ?? []).map((entry) => entry.participantId);
          if (isMatchUpEventType(SINGLES)(event.eventType)) return enteredParticipantIds;
          const individualParticipantIds = (tournamentRecord?.participants ?? [])
            .filter((participant) => enteredParticipantIds.includes(participant.participantId))
            .flatMap((participant) => participant.individualParticipantIds);
          return enteredParticipantIds.concat(...individualParticipantIds);
        }),
    );
    participants = participants?.filter((participant) => participantIds.has(participant.participantId));
  }

  return participants;
}

function isValidFilterArray(filter) {
  return filter && Array.isArray(filter) && filter.length;
}

function getDrawEntries({ drawEntryStatuses, tournamentEvents }) {
  const statusFilter = ({ entryStatus }) =>
    Array.isArray(drawEntryStatuses) ? drawEntryStatuses.includes(entryStatus) : true;

  return unique(
    tournamentEvents.reduce((entries, event) => {
      const { flightProfile } = getFlightProfile({ event } as any);
      const flightEntries =
        flightProfile?.flights?.flatMap(({ drawEntries }) =>
          Array.isArray(drawEntries) ? drawEntries.filter(statusFilter).map(getParticipantId) : [],
        ) ?? [];

      const drawEnteredParticipantIds =
        event.drawDefinitions?.map(({ entries }) =>
          entries ? entries.filter(statusFilter).map(getParticipantId) : [],
        ) ?? [];

      return entries.concat(...flightEntries, ...drawEnteredParticipantIds);
    }, []),
  );
}

function getEventEntries({ eventEntryStatuses, tournamentEvents }) {
  return unique(
    tournamentEvents.reduce((entries, event) => {
      const eventEntries = (event.entries ?? [])
        .filter(({ entryStatus }) =>
          Array.isArray(eventEntryStatuses) ? eventEntryStatuses.includes(entryStatus) : true,
        )
        .map(getParticipantId);

      return entries.concat(...eventEntries);
    }, []),
  );
}
