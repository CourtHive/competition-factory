import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { getParticipantId } from '@Functions/global/extractors';
import { stringSort } from '@Functions/sorters/stringSort';
import { addNotice } from '@Global/state/globalState';
import { addEventEntries } from './addEventEntries';
import { intersection } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

// constants and types
import { DrawDefinition, EntryStatusUnion, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { INVALID_EVENT_TYPE, INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { EVENT, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { DOUBLES } from '@Constants/matchUpTypes';
import { isFemale } from '@Validators/isFemale';
import { isMixed } from '@Validators/isMixed';
import { isMale } from '@Validators/isMale';
import { isAny } from '@Validators/isAny';

/**
 * Add PAIR participant to an event
 * Creates new { participantType: PAIR } participants if necessary
 */

type AddEventEntryPairsArgs = {
  allowDuplicateParticipantIdPairs?: boolean;
  participantIdPairs?: string[][];
  entryStatus?: EntryStatusUnion;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  entryStage?: StageTypeUnion;
  enforceCategory?: boolean;
  uuids?: string[];
  drawId?: string;
  event: Event;
};
export function addEventEntryPairs(params: AddEventEntryPairsArgs) {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true, [EVENT]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const {
    allowDuplicateParticipantIdPairs,
    entryStatus = ALTERNATE,
    participantIdPairs = [],
    entryStage = MAIN,
    tournamentRecord,
    enforceCategory,
    drawDefinition,
    drawId,
    event,
    uuids,
  } = params;

  if (event.eventType !== DOUBLES) return { error: INVALID_EVENT_TYPE };

  const existingParticipantIdPairs: string[][] = [];
  const genderMap = new Map<string, string>();

  for (const participant of tournamentRecord.participants ?? []) {
    const { participantType, participantId, person, individualParticipantIds } = participant;
    if (participantType === INDIVIDUAL && person?.sex) {
      genderMap.set(participantId, person.sex);
    } else if (participantType === PAIR && individualParticipantIds) {
      existingParticipantIdPairs.push(individualParticipantIds);
    }
  }

  // ensure all participantIdPairs have two individual participantIds
  const invalidParticipantIdPairs = participantIdPairs.filter((pair) => {
    // invalid if not two participantIds
    if (pair.length !== 2) return true;
    // NOT invalid if event.gender is ANY or no gender is specified
    if (!event.gender || isAny(event.gender)) return false;
    // invalid if either participantId does not exist in genderMap
    if (!genderMap.has(pair[0]) || !genderMap.has(pair[1])) return true;

    const participantGenders = pair.map((id) => genderMap.get(id));
    // invalid if event.gender is MALE/FEMALE and both participants do not match
    let invalidParticiapntGenders =
      (isMale(event.gender) && (!isMale(participantGenders[0]) || !isMale(participantGenders[1]))) ||
      (isFemale(event.gender) && (!isFemale(participantGenders[0]) || !isFemale(participantGenders[1])));

    // invalid if event.gender is MIXED and participant genders are not different
    if (isMixed(event.gender)) {
      participantGenders.sort(stringSort);
      if (!isFemale(participantGenders[0]) || !isMale(participantGenders[1])) invalidParticiapntGenders = true;
    }

    return invalidParticiapntGenders;
  });

  if (invalidParticipantIdPairs.length) return { error: INVALID_PARTICIPANT_IDS, invalidParticipantIdPairs };

  // create provisional participant objects
  const provisionalParticipants: any[] = participantIdPairs.map((individualParticipantIds) => ({
    participantId: uuids?.pop() ?? UUID(),
    participantRole: COMPETITOR,
    individualParticipantIds,
    participantType: PAIR,
  }));

  // filter out existing participants unless allowDuplicateParticipantIdPairs is true
  const newParticipants = allowDuplicateParticipantIdPairs
    ? provisionalParticipants
    : provisionalParticipants.filter((participant) => {
        return !existingParticipantIdPairs.some(
          (existing) => intersection(existing, participant.individualParticipantIds).length === 2,
        );
      });

  let info;
  let addedParticipants: any[] = [];
  if (newParticipants) {
    const result = addParticipants({
      allowDuplicateParticipantIdPairs,
      participants: newParticipants,
      returnParticipants: true,
      tournamentRecord,
    });
    if (result.error) return result;
    addedParticipants = result.participants ?? [];
    info = result.info;
  }

  const pairParticipantIds = participantIdPairs
    .map((participantIds) => {
      const addedParticipant = addedParticipants.find(
        (addedPair) => intersection(addedPair.individualParticipantIds, participantIds).length === 2,
      );
      if (addedParticipant) return addedParticipant;

      const { participant } = getPairedParticipant({
        tournamentRecord,
        participantIds,
      });
      return participant;
    })
    .map((participant) => participant.participantId);

  // `drawId` must ride along. `addEventEntries` gates its `addDrawEntries` call on `drawId`, not on
  // `drawDefinition` — so resolving a drawDefinition here and dropping the id left the drawDefinition
  // inert and the PAIR confined to `event.entries`. Where this bit hardest: re-pairing two
  // individuals who were themselves draw entries. `addEventEntries` evicts the now-grouped
  // individuals from *every* drawDefinition, so without the id the draw lost two entries and gained
  // nothing. `destroyGroupEntry` has always passed `drawId` on the way out; this is the way back in.
  const result = addEventEntries({
    participantIds: pairParticipantIds,
    tournamentRecord,
    enforceCategory,
    drawDefinition,
    entryStatus,
    entryStage,
    drawId,
    event,
  });

  if (newParticipants.length) {
    addNotice({
      payload: { participants: newParticipants },
      topic: ADD_PARTICIPANTS,
    });
  }

  const newParticipantIds = newParticipants.map(getParticipantId);

  // `info` here is `addParticipants`' — usually undefined — and spreading it unconditionally
  // erased `addEventEntries`' own. That matters now that the drawId above makes `addDrawEntries`
  // reachable: its refusals (a full stage, a shared individual in a bracketed draw) are reported as
  // `info` on an otherwise successful result, and the caller was shown nothing at all. Prefer the
  // downstream reason; fall back to this one.
  return { ...result, info: result.info ?? info, newParticipantIds };
}
