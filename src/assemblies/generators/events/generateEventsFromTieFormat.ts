import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { coercedGender } from '@Helpers/coercedGender';
import { isGendered } from '@Validators/isGendered';
import { addEvent } from '@Mutate/events/addEvent';
import { isMixed } from '@Validators/isMixed';
import { UUID, UUIDS } from '@Tools/UUID';

// Constants
import { ONE_OF, TIE_FORMAT, TIE_FORMAT_NAME, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { EntryStatusUnion, Event, TieFormat, Tournament } from '@Types/tournamentTypes';
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';

type GenerateEventsFromTieFormatArgs = {
  entryStatus?: EntryStatusUnion; // default to DIRECT_ACCEPTANCE
  addEntriesFromTeams?: boolean; // add team participants as entryStage entries to appropriate gender events
  tournamentRecord: Tournament;
  tieFormatName?: string;
  tieFormat?: TieFormat;
  addEvents?: boolean;
  uuids?: string[];
};

export function generateEventsFromTieFormat(params: GenerateEventsFromTieFormatArgs) {
  const paramsCheck = checkRequiredParameters(params, [
    { [ONE_OF]: { [TIE_FORMAT]: true, [TIE_FORMAT_NAME]: true } },
    { [TOURNAMENT_RECORD]: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const tieFormat = params.tieFormat || tieFormatDefaults({ namedFormat: params.tieFormatName });
  const uuids = params.uuids || [UUIDS(tieFormat.collectionDefinitions.length)];

  const genderedParticipants = params.addEntriesFromTeams
    ? buildGenderedParticipants(params.tournamentRecord)
    : { [MALE]: [] as string[], [FEMALE]: [] as string[] };

  const events: Event[] = [];
  for (const collectionDefinition of tieFormat.collectionDefinitions ?? []) {
    const eventId: string = uuids?.pop()?.toString() || UUID();
    const event: Event = {
      matchUpFormat: collectionDefinition.matchUpFormat,
      eventName: collectionDefinition.collectionName,
      category: collectionDefinition.category,
      gender: collectionDefinition.gender,
      eventType: collectionDefinition.matchUpType,
      eventId,
    };

    if (params.addEntriesFromTeams) {
      const result: any = addTeamEntriesToEvent({
        genderedParticipants,
        collectionDefinition,
        entryStatus: params.entryStatus,
        event,
      });
      if (result?.error) return result;
    }

    events.push(event);

    if (params.addEvents !== false) {
      const result = addEvent({ internalUse: true, tournamentRecord: params.tournamentRecord, event });
      if (result.error) return result;
    }
  }

  return { ...SUCCESS, events };
}

function buildGenderedParticipants(tournamentRecord) {
  const genderedParticipants = { [MALE]: [] as string[], [FEMALE]: [] as string[] };
  const teamParticipants = tournamentRecord.participants?.filter((p) => p.participantType === TEAM_PARTICIPANT);
  const individualParticipantIdSet = new Set(
    teamParticipants?.flatMap((teamParticipant) => teamParticipant.individualParticipantIds ?? []),
  );

  for (const participant of tournamentRecord.participants ?? []) {
    if (individualParticipantIdSet.has(participant.participantId)) {
      const gender = participant.person?.sex;
      if (gender && isGendered(gender)) {
        const coerced = coercedGender(gender);
        if (coerced) genderedParticipants[coerced].push(participant.participantId);
      }
    }
  }

  return genderedParticipants;
}

function addTeamEntriesToEvent({ genderedParticipants, collectionDefinition, entryStatus, event }) {
  const eventType = collectionDefinition.matchUpType;
  const eventGender = collectionDefinition.gender;
  const resolvedEntryStatus = eventType === DOUBLES_EVENT ? UNGROUPED : entryStatus || DIRECT_ACCEPTANCE;
  const participantIds = isMixed(eventGender)
    ? [...genderedParticipants[MALE], ...genderedParticipants[FEMALE]]
    : (genderedParticipants[coercedGender(eventGender) || OTHER] ?? []);

  if (participantIds.length) {
    return addEventEntries({
      participantIds,
      entryStatus: resolvedEntryStatus,
      event,
    });
  }

  return undefined;
}
