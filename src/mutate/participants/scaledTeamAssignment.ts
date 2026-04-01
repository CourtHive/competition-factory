import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { addParticipants } from './addParticipants';
import { isConvertableInteger } from '@Tools/math';
import { generateRange } from '@Tools/arrays';

// constants and types
import { INDIVIDUAL, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { Event, Participant, Tournament } from '@Types/tournamentTypes';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_EVENT_TYPE,
  INVALID_PARTICIPANT_TYPE,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  NO_CANDIDATES,
  PARTICIPANT_NOT_FOUND,
  TEAM_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/*
scaledParticipants are equivalent to scaledEntries
...because it should also be possible to assign INDIVIDUAL participants to teams outside of an event scope,
the parameter is generalized... as long as there is a `participantId` and a `scaleValue` is will succeed

{
  participantId: '60f3e684-b6d2-47fc-a579-d0ab8f020810',
  scaleValue: 1
}

scaleAttributes can include { accessor: 'attribute' } which will return scaleItem.scaleValue[accessor] for scaleValue
*/

type ScaledTeamAssignmentArgs = {
  individualParticipantIds?: string[];
  clearExistingAssignments?: boolean;
  reverseAssignmentOrder?: boolean;
  teamParticipantIds?: string[];
  tournamentRecord: Tournament;
  scaledParticipants?: any[];
  initialTeamIndex?: number;
  scaleAttributes?: any;
  teamNameBase?: string;
  teamsCount?: number;
  eventId?: string;
  event?: Event;
};
function validateScaledTeamArgs({
  teamParticipantIds,
  teamsCount,
  eventId,
  initialTeamIndex,
  scaledParticipants,
  scaleAttributes,
  individualParticipantIds,
}) {
  if (
    (!Array.isArray(teamParticipantIds) && !isConvertableInteger(teamsCount) && !eventId) ||
    !isConvertableInteger(initialTeamIndex) ||
    (scaledParticipants && !Array.isArray(scaledParticipants)) ||
    (scaleAttributes && (typeof scaleAttributes !== 'object' || !Object.keys(scaleAttributes).length))
  ) {
    return { error: INVALID_VALUES };
  }
  if (
    (!scaleAttributes && !scaledParticipants.length) ||
    (!scaledParticipants && !(individualParticipantIds && scaleAttributes))
  ) {
    return { error: MISSING_VALUE, info: 'Missing scaling details' };
  }
  return undefined;
}

function resolveTeamParticipantIds({ eventId, event, teamParticipantIds }) {
  if (eventId && !teamParticipantIds) {
    if (event?.eventType !== TEAM_EVENT) return { error: INVALID_EVENT_TYPE };
    return {
      teamParticipantIds: event?.entries
        ?.filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE)
        .map(getParticipantId),
    };
  }
  return { teamParticipantIds };
}

function collectRelevantTeams({ tournamentRecord, orderedTeamParticipantIds }) {
  const relevantTeams: any[] = [];
  for (const participant of tournamentRecord.participants ?? []) {
    const { participantId, participantType } = participant;
    if (!orderedTeamParticipantIds.includes(participantId)) continue;
    if (participantType !== TEAM_PARTICIPANT) return { error: INVALID_PARTICIPANT_TYPE, participant };
    relevantTeams.push(participant);
  }
  return { relevantTeams };
}

function ensureTeamsCount({ teamsCount, relevantTeams, teamNameBase, tournamentRecord }) {
  if (teamsCount && relevantTeams.length < teamsCount) {
    const addCount = teamsCount - (relevantTeams?.length || 0);
    const nameBase = teamNameBase ?? 'Team';
    const teamParticipants = generateRange(0, addCount).map((i) => ({
      participantName: `${nameBase} ${i + 1}`,
      participantType: TEAM_PARTICIPANT,
      participantRole: COMPETITOR,
    })) as Participant[];

    const { participants = [] } = addParticipants({
      participants: teamParticipants,
      returnParticipants: true,
      tournamentRecord,
    });
    const addedParticipantIds = new Set(participants.map(getParticipantId));
    const addedParticipants =
      tournamentRecord.participants?.filter(({ participantId }) => addedParticipantIds.has(participantId)) ?? [];
    relevantTeams.push(...addedParticipants);
  }
}

function buildScaledParticipants({ tournamentRecord, participantIdsToAssign, scaleAttributes, scaledParticipants }) {
  for (const participant of tournamentRecord.participants ?? []) {
    const { participantId, participantType } = participant;
    if (!participantIdsToAssign.includes(participantId)) continue;
    if (participantType !== INDIVIDUAL) return { error: INVALID_PARTICIPANT_TYPE, participant };

    const scaleItem = participantScaleItem({
      scaleAttributes,
      participant,
    })?.scaleItem;

    const scaleValue = scaleAttributes?.accessor
      ? scaleItem?.scaleValue?.[scaleAttributes?.accessor]
      : scaleItem?.scaleValue;

    scaledParticipants.push({ participantId, scaleValue });
  }

  if (!scaledParticipants.length) return { error: PARTICIPANT_NOT_FOUND };
  return undefined;
}

function distributeParticipantsToTeams({ scaledParticipants, relevantTeams }) {
  let index = 0;
  while (index < scaledParticipants.length) {
    for (const relevantTeam of relevantTeams) {
      if (index + 1 > scaledParticipants.length) break;
      const scaledParticipant = scaledParticipants[index];
      relevantTeam.individualParticipantIds.push(scaledParticipant.participantId);
      index++;
    }
    relevantTeams.reverse();
  }
}

function removeAssignedFromEvents({ tournamentRecord, relevantTeams }) {
  const relevantTeamParticipantIds = new Set(relevantTeams.map(getParticipantId));
  for (const event of tournamentRecord.events ?? []) {
    if (event.eventType !== TEAM_EVENT) continue;
    const relevantTeamEntries = (event.entries ?? []).filter((entry) =>
      relevantTeamParticipantIds.has(entry.participantId),
    );
    for (const relevantEntry of relevantTeamEntries) {
      const relevantTeam = relevantTeams.find(
        (teamParticipant) => teamParticipant.participantId === relevantEntry.participantId,
      );
      const individualParticipantIds = relevantTeam?.individualParticipantIds;
      event.entries = (event.entries ?? []).filter((entry) => !individualParticipantIds.includes(entry.participantId));
      (event.drawDefinitions ?? []).forEach((drawDefinition) => {
        drawDefinition.entries = (drawDefinition.entries ?? []).filter(
          (entry) => !individualParticipantIds.includes(entry.participantId),
        );
      });
      const { flightProfile } = getFlightProfile({ event });
      (flightProfile?.flights || []).forEach((flight) => {
        flight.drawEntries = (flight.drawEntries || []).filter(
          (entry) => !individualParticipantIds.includes(entry.participantId),
        );
      });
    }
  }
}

export function scaledTeamAssignment({
  clearExistingAssignments = true,
  individualParticipantIds,
  reverseAssignmentOrder,
  initialTeamIndex = 0,
  scaledParticipants = [],
  teamParticipantIds,
  tournamentRecord,
  scaleAttributes,
  teamNameBase,
  teamsCount,
  eventId,
  event,
}: ScaledTeamAssignmentArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const validationError = validateScaledTeamArgs({
    teamParticipantIds,
    teamsCount,
    eventId,
    initialTeamIndex,
    scaledParticipants,
    scaleAttributes,
    individualParticipantIds,
  });
  if (validationError) return validationError;

  const resolved = resolveTeamParticipantIds({ eventId, event, teamParticipantIds });
  if (resolved.error) return resolved;
  teamParticipantIds = resolved.teamParticipantIds;

  if (!teamParticipantIds?.length && !teamsCount) {
    return {
      info: 'Missing teamParticipantIds or teamsCount',
      error: MISSING_VALUE,
    };
  }

  let participantIdsToAssign = individualParticipantIds ?? scaledParticipants.map(({ participantId }) => participantId);

  if (reverseAssignmentOrder) {
    teamParticipantIds?.reverse();
    initialTeamIndex += 1;
  }
  if (initialTeamIndex > (teamParticipantIds?.length || 0) - 1) initialTeamIndex = 0;

  const orderedTeamParticipantIds =
    teamParticipantIds?.slice(initialTeamIndex).concat(...teamParticipantIds.slice(0, initialTeamIndex)) ?? [];

  const collected = collectRelevantTeams({ tournamentRecord, orderedTeamParticipantIds });
  if (collected.error) return collected;
  const { relevantTeams } = collected;

  ensureTeamsCount({ teamsCount, relevantTeams, teamNameBase, tournamentRecord });

  if (!relevantTeams.length) return { error: TEAM_NOT_FOUND };

  if (clearExistingAssignments) {
    for (const relevantTeam of relevantTeams) {
      relevantTeam.individualParticipantIds = [];
    }
  } else {
    const preAssignedParticipantIds = new Set(relevantTeams.flat());

    if (individualParticipantIds?.length) {
      participantIdsToAssign = participantIdsToAssign.filter(
        (participantId) => !preAssignedParticipantIds.has(participantId),
      );
    } else {
      scaledParticipants = scaledParticipants?.filter(
        ({ participantId }) => !preAssignedParticipantIds.has(participantId),
      );
    }
  }

  if (!individualParticipantIds?.length && !scaledParticipants?.length) {
    return { error: NO_CANDIDATES, info: 'Nothing to be done' };
  }

  if (!scaledParticipants.length) {
    const buildError = buildScaledParticipants({
      tournamentRecord,
      participantIdsToAssign,
      scaleAttributes,
      scaledParticipants,
    });
    if (buildError) return buildError;
  }

  scaledParticipants.sort((a, b) =>
    scaleAttributes?.sortOrder
      ? (b?.scaleValue || 0) - (a?.scaleValue || 0)
      : (a?.scaleValue || Infinity) - (b?.scaleValue || Infinity),
  );

  for (const scaledParticipant of scaledParticipants) {
    if (!scaledParticipant.participantId) return { error: INVALID_VALUES, scaledParticipant };
  }

  distributeParticipantsToTeams({ scaledParticipants, relevantTeams });

  removeAssignedFromEvents({ tournamentRecord, relevantTeams });

  return { ...SUCCESS, scaledParticipants };
}
