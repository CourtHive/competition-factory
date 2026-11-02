import { applyScaleItems, checkSetterOwnedAttributes, planTimeItems, sameValue } from './participantSetterFields';
import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { applyPersonUpdate, planPersonUpdate, type PersonPlan } from './modifyPersonFields';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { addIndividualParticipantIds } from './addIndividualParticipantIds';
import { refusal, validNationalityCode } from './personAttributeShapes';
import { isClearRequest } from '@Mutate/participants/isClearRequest';
import { requireParams } from '@Helpers/parameters/requireParams';
import { participantRoles } from '@Constants/participantRoles';
import { definedAttributes } from '@Tools/definedAttributes';
import { isObject, isString } from '@Tools/objects';
import { collapseWhitespace } from '@Tools/strings';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addParticipant } from './addParticipant';

// constants
import { PARTICIPANT_NAME_DERIVED_FROM_PERSON } from '@Constants/infoConstants';
import { TOURNAMENT_RECORD, PARTICIPANT } from '@Constants/attributeConstants';
import { GROUP, INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  CANNOT_MODIFY_PARTICIPANT_TYPE,
  INVALID_PARTICIPANT_TYPE,
  INVALID_PARTICIPANT_IDS,
  PARTICIPANT_NOT_FOUND,
  VENUE_NOT_FOUND,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

// types
import { ParticipantStatusEnum, type Participant, type Tournament } from '@Types/tournamentTypes';
import type { ResultType, ScaleItem } from '@Types/factoryTypes';

/**
 * Every attribute of the supplied participant is WRITTEN or the call is REFUSED; none is accepted and dropped
 * (CA 2026-11-02). The rules, which keep "consumers send the whole participant on every save" working:
 *
 * - `undefined` and `null` leave an attribute untouched; '' clears an optional scalar (see isClearRequest).
 * - A value equal to the stored one is never refused, whatever it is (a home venue since deleted, a legacy code).
 * - Every check runs before the first write, so a refused call changes nothing.
 * - `timeItems` and `person.personOtherIds` are merged; the other setter-owned attributes are refused with the
 *   setter named (see participantSetterFields).
 * - Metadata is ignored: `isMock`, `createdAt`, `updatedAt`, `personId` and `teamId`, and attributes that are not
 *   part of a CODES participant (such as those getParticipants adds).
 * - An unrecognised `person.nationalityCode` is written, and the result carries a NATIONALITY_CODE_UNRECOGNIZED
 *   warning.
 */
export function modifyParticipant(params) {
  const {
    updateParticipantName = true,
    groupingParticipantId,
    removeFromOtherTeams,
    tournamentRecord,
    pairOverride,
    participant,
  } = params;
  const paramsCheck = requireParams({ tournamentRecord, participant }, [TOURNAMENT_RECORD, PARTICIPANT]);
  if (paramsCheck.error) return paramsCheck;

  if (!participant.participantId) return addParticipant({ tournamentRecord, participant });

  const { participant: existingParticipant } = findTournamentParticipant({
    participantId: participant.participantId,
    tournamentRecord,
  });

  if (!existingParticipant) return addParticipant({ tournamentRecord, participant });

  const { participantType } = participant;
  if (participantType && existingParticipant.participantType !== participantType)
    return { error: CANNOT_MODIFY_PARTICIPANT_TYPE };

  const plan = planModification({
    updateParticipantName,
    groupingParticipantId,
    existingParticipant,
    tournamentRecord,
    pairOverride,
    participant,
  });
  if (plan.error) return plan;

  // ---- nothing above this line writes ----
  const { newValues, clearedKeys, personPlan, scaleItems, suppliedParticipantName } = plan as ModificationPlan;
  if (personPlan) applyPersonUpdate({ existingParticipant, plan: personPlan });
  applyScaleItems({ participant: existingParticipant, scaleItems });

  // A supplied participantName can be superseded by a derived one: from `person` for an INDIVIDUAL, or from the
  // individuals of a PAIR. That is intended precedence, and it is surfaced (PARTICIPANT_NAME_DERIVED_FROM_PERSON).
  const participantNameSuperseded = !!suppliedParticipantName && newValues.participantName !== suppliedParticipantName;

  Object.assign(existingParticipant, definedAttributes(newValues));
  // After the assign, so a cleared key cannot be reinstated by it.
  for (const key of clearedKeys) delete existingParticipant[key];

  if (groupingParticipantId) {
    // its refusals were checked by checkGrouping before any write
    const result = addIndividualParticipantIds({
      individualParticipantIds: [existingParticipant.participantId],
      groupingParticipantId,
      removeFromOtherTeams,
      tournamentRecord,
    });
    if (result.error) return result;
  }

  modifyParticipantsNotice({
    tournamentId: tournamentRecord.tournamentId,
    participants: [existingParticipant],
  });

  const warnings = personPlan?.warnings ?? [];
  return {
    participant: makeDeepCopy(existingParticipant),
    ...SUCCESS,
    // conditional: callers that did not hit the precedence see the response shape they always have
    ...(participantNameSuperseded && { info: PARTICIPANT_NAME_DERIVED_FROM_PERSON }),
    ...(warnings.length ? { warnings } : {}),
  };
}

// the caller's participant and the values assembled from it: open records, validated attribute by attribute
type Loose = Record<string, any>;

type ModificationPlan = ResultType & {
  newValues: Loose;
  suppliedParticipantName?: string;
  personPlan?: PersonPlan;
  scaleItems: ScaleItem[];
  clearedKeys: string[];
};

type PlanArgs = {
  existingParticipant: Participant;
  updateParticipantName?: boolean;
  groupingParticipantId?: string;
  tournamentRecord: Tournament;
  pairOverride?: boolean;
  participant: Loose;
};

type FieldArgs = {
  existingParticipant: Participant;
  newValues: Loose;
  clearedKeys: string[];
  participant: Loose;
};

function planModification(args: PlanArgs): ModificationPlan | ResultType {
  const { existingParticipant, participant, tournamentRecord } = args;
  const newValues: Loose = {};
  const clearedKeys: string[] = [];
  const fieldArgs: FieldArgs = { existingParticipant, participant, clearedKeys, newValues };

  // first, so that a PAIR's derived name and then the person's supersede it, as they always have
  const name = participantNameValue({ existingParticipant, participant });
  if (name.error) return name;
  if (name.participantName) newValues.participantName = name.participantName;

  const checks: (() => ResultType | undefined)[] = [
    () => checkGrouping(args),
    () => checkSetterOwnedAttributes({ existingParticipant, participant }),
    () => setParticipantAttributes({ tournamentRecord, ...fieldArgs }),
    () => setListAttributes(fieldArgs),
    () => setRoleAndNotes(fieldArgs),
    () => setParticipantOtherName(fieldArgs),
    () => setIndividualParticipantIds({ ...args, newValues }),
    () => checkContactParticipantIds(fieldArgs),
  ];
  for (const check of checks) {
    const result = check();
    if (result?.error) return result;
  }

  const timeItems = planTimeItems({ existingParticipant, timeItems: participant.timeItems });
  if (timeItems.error) return timeItems;

  const personPlan = planPerson({ ...args });
  if (personPlan?.error) return personPlan;
  if (personPlan?.participantName) newValues.participantName = personPlan.participantName;

  return {
    suppliedParticipantName: name.participantName,
    scaleItems: timeItems.scaleItems ?? [],
    clearedKeys,
    personPlan,
    newValues,
  };
}

function planPerson({ existingParticipant, participant, updateParticipantName }: PlanArgs): PersonPlan | undefined {
  const { person } = participant;
  if (person === undefined || person === null) return undefined;
  if (existingParticipant.participantType !== INDIVIDUAL) {
    if (sameValue(person, existingParticipant.person)) return undefined;
    return { error: INVALID_PARTICIPANT_TYPE, info: 'only an INDIVIDUAL participant has a person' };
  }
  return planPersonUpdate({ existingParticipant, person, updateParticipantName });
}

// The grouping a participant is added to is checked here, before any write; addIndividualParticipantIds used to run
// after the participant was modified and its refusal was discarded.
function checkGrouping({ groupingParticipantId, existingParticipant, tournamentRecord }: PlanArgs) {
  if (groupingParticipantId === undefined || groupingParticipantId === null) return undefined;
  const grouping = (tournamentRecord.participants ?? []).find(
    (candidate) => candidate.participantId === groupingParticipantId,
  );
  if (!grouping) return { error: PARTICIPANT_NOT_FOUND, context: { groupingParticipantId } };
  if (grouping.participantType && ![TEAM, GROUP].includes(grouping.participantType))
    return { error: INVALID_PARTICIPANT_TYPE, info: 'groupingParticipantId must be a TEAM or a GROUP' };
  if (existingParticipant.participantType !== INDIVIDUAL)
    return { error: INVALID_PARTICIPANT_IDS, info: 'only an INDIVIDUAL participant joins a grouping' };
  return undefined;
}

function participantNameValue({
  existingParticipant,
  participant,
}: {
  existingParticipant: Participant;
  participant: Loose;
}): ResultType & { participantName?: string } {
  const { participantName } = participant;
  if (participantName === undefined || participantName === null) return {};
  if (sameValue(participantName, existingParticipant.participantName)) return { participantName };
  const collapsed = isString(participantName) ? collapseWhitespace(participantName) : undefined;
  if (!collapsed) return refusal('participantName', 'must be a non-empty string', participantName);
  return { participantName: collapsed };
}

// contacts and onlineResources replace the stored list; participantRoleResponsibilities likewise
function setListAttributes({ existingParticipant, participant, newValues }: FieldArgs) {
  const lists: [string, (item: unknown) => boolean, string][] = [
    ['contacts', isObject, 'an array of contacts'],
    ['onlineResources', isObject, 'an array of onlineResources'],
    ['participantRoleResponsibilities', isString, 'an array of strings'],
  ];
  for (const [field, isItem, description] of lists) {
    const value = participant[field];
    if (value === undefined || value === null || sameValue(value, existingParticipant[field])) continue;
    if (!Array.isArray(value) || !value.every(isItem)) return refusal(field, `must be ${description}`, value);
    newValues[field] = value;
  }
  return undefined;
}

function setRoleAndNotes({ existingParticipant, participant, clearedKeys, newValues }: FieldArgs) {
  const { participantRole, notes } = participant;
  if (isClearRequest(participantRole)) {
    clearedKeys.push('participantRole');
  } else if (![undefined, null, existingParticipant.participantRole].includes(participantRole)) {
    if (!Object.keys(participantRoles).includes(participantRole))
      return refusal('participantRole', `must be one of ${Object.keys(participantRoles).join(', ')}`, participantRole);
    newValues.participantRole = participantRole;
  }

  // `addNotes` cannot reach a stored participant through the engine, so notes are written here
  if (isClearRequest(notes)) {
    clearedKeys.push('notes');
  } else if (![undefined, null, existingParticipant.notes].includes(notes)) {
    if (!isString(notes)) return refusal('notes', 'must be a string', notes);
    newValues.notes = notes;
  }
  return undefined;
}

// Same clear contract as the person fields: '' clears, `undefined` leaves untouched. The assign branch is gated on
// isString: `definedAttributes` strips only '', null and undefined, so a 0 or a false would otherwise persist.
function setParticipantOtherName({ participant, clearedKeys, newValues }: FieldArgs): undefined {
  const { participantOtherName } = participant;
  if (isClearRequest(participantOtherName)) {
    clearedKeys.push('participantOtherName');
  } else if (isString(participantOtherName)) {
    newValues.participantOtherName = participantOtherName;
  }
  return undefined;
}

// Designated contact people for a grouping, validated against the membership the participant will HAVE after this
// call. A pointer to a non-member is refused on write instead of being tolerated and filtered on every read.
function checkContactParticipantIds({ existingParticipant, participant, newValues }: FieldArgs) {
  const { contactParticipantIds } = participant;
  if (!Array.isArray(contactParticipantIds)) return undefined;
  const membership = newValues.individualParticipantIds ?? existingParticipant.individualParticipantIds ?? [];
  const invalid = contactParticipantIds.filter((participantId) => !membership.includes(participantId));
  if (invalid.length) return { error: INVALID_PARTICIPANT_IDS, invalid };
  newValues.contactParticipantIds = contactParticipantIds;
  return undefined;
}

/**
 * Members of a PAIR, TEAM or GROUP. An id that is not an INDIVIDUAL of this tournament is refused (one the grouping
 * already holds is tolerated and removed, as before); a PAIR must have exactly two members unless `pairOverride`.
 */
function setIndividualParticipantIds({
  updateParticipantName,
  existingParticipant,
  tournamentRecord,
  pairOverride,
  participant,
  newValues,
}: PlanArgs & { newValues: Loose }) {
  const { individualParticipantIds } = participant;
  if (individualParticipantIds === undefined || individualParticipantIds === null) return undefined;
  if (!Array.isArray(individualParticipantIds) || !individualParticipantIds.every(isString))
    return refusal('individualParticipantIds', 'must be an array of participantIds', individualParticipantIds);

  const groupingType = existingParticipant.participantType;
  if (![PAIR, TEAM, GROUP].includes(groupingType as string)) {
    if (!individualParticipantIds.length) return undefined;
    return { error: INVALID_PARTICIPANT_TYPE, info: 'only a PAIR, TEAM or GROUP has individualParticipantIds' };
  }

  const individualParticipants = (tournamentRecord.participants ?? []).filter(
    ({ participantType }) => participantType === INDIVIDUAL,
  );
  const individualIds = new Set(individualParticipants.map(({ participantId }) => participantId));
  const heldIds = existingParticipant.individualParticipantIds ?? [];
  const unknown = individualParticipantIds.filter((id) => !individualIds.has(id) && !heldIds.includes(id));
  if (unknown.length)
    return { error: INVALID_PARTICIPANT_IDS, info: 'not individual participants of this tournament', invalid: unknown };

  const members = individualParticipantIds.filter((id) => individualIds.has(id));
  if (groupingType === PAIR && new Set(members).size !== 2 && !pairOverride)
    return { error: INVALID_PARTICIPANT_IDS, info: 'a PAIR has exactly two individual participants', invalid: members };

  newValues.individualParticipantIds = members;
  if (groupingType === PAIR && updateParticipantName) {
    newValues.participantName = generatePairParticipantName({
      individualParticipantIds: members,
      individualParticipants,
    });
  }
  return undefined;
}

const participantStatuses: string[] = Object.values(ParticipantStatusEnum);

/**
 * Participant attributes that had no write path: `modifyParticipant` returned success and dropped them.
 *
 * `undefined` leaves a field untouched and '' clears a scalar (see isClearRequest); `[]` clears `homeVenueIds`.
 * A value is refused, never dropped, when it is invalid -- EXCEPT a value equal to what the participant already
 * carries: consumers send the whole participant on every save, and an unrelated edit must not fail on a value
 * this call does not change (a home venue since deleted, say).
 */
function setParticipantAttributes({ tournamentRecord, existingParticipant, participant, clearedKeys, newValues }) {
  const { homeVenueIds, participantStatus, representing, useOtherName } = participant;

  if (homeVenueIds !== undefined) {
    const result = getHomeVenueIds({ tournamentRecord, existingParticipant, homeVenueIds });
    if (result.error) return result;
    if (result.homeVenueIds?.length) newValues.homeVenueIds = result.homeVenueIds;
    else clearedKeys.push('homeVenueIds');
  }

  if (isClearRequest(participantStatus)) {
    clearedKeys.push('participantStatus');
  } else if (participantStatus !== undefined && participantStatus !== existingParticipant.participantStatus) {
    if (!participantStatuses.includes(participantStatus))
      return { error: INVALID_VALUES, info: 'participantStatus must be ACTIVE or WITHDRAWN', participantStatus };
    newValues.participantStatus = participantStatus;
  }

  if (isClearRequest(representing)) {
    clearedKeys.push('representing');
  } else if (representing !== undefined && representing !== existingParticipant.representing) {
    if (!isString(representing) || !validNationalityCode(representing))
      return { error: INVALID_VALUES, info: 'representing must be a country code', representing };
    newValues.representing = representing;
  }

  if (useOtherName !== undefined) {
    if (typeof useOtherName !== 'boolean')
      return { error: INVALID_VALUES, info: 'useOtherName must be a boolean', useOtherName };
    newValues.useOtherName = useOtherName;
  }

  return undefined;
}

// A TEAM's home venues: each must be a venue of this tournament. Only a TEAM has home venues.
type GetHomeVenueIdsArgs = { tournamentRecord: Tournament; existingParticipant: Participant; homeVenueIds: unknown };
type HomeVenueIdsResult = ResultType & { homeVenueIds?: string[]; venueIds?: string[] };

function getHomeVenueIds({
  tournamentRecord,
  existingParticipant,
  homeVenueIds,
}: GetHomeVenueIdsArgs): HomeVenueIdsResult {
  if (!Array.isArray(homeVenueIds) || !homeVenueIds.every(isString))
    return { error: INVALID_VALUES, info: 'homeVenueIds must be an array of venueIds', context: { homeVenueIds } };
  const uniqueVenueIds: string[] = [...new Set<string>(homeVenueIds)];
  if (uniqueVenueIds.length && existingParticipant.participantType !== TEAM)
    return { error: INVALID_PARTICIPANT_TYPE, info: 'only a TEAM participant has homeVenueIds' };

  const venueIds = new Set((tournamentRecord.venues ?? []).map((venue) => venue.venueId));
  const heldVenueIds = existingParticipant.homeVenueIds ?? [];
  const unknownVenueIds = uniqueVenueIds.filter((venueId) => !venueIds.has(venueId) && !heldVenueIds.includes(venueId));
  if (unknownVenueIds.length) return { error: VENUE_NOT_FOUND, venueIds: unknownVenueIds };

  return { homeVenueIds: uniqueVenueIds };
}
