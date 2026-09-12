import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { addIndividualParticipantIds } from './addIndividualParticipantIds';
import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { participantRoles } from '@Constants/participantRoles';
import { definedAttributes } from '@Tools/definedAttributes';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { isValidDateString } from '@Tools/dateTime';
import { collapseWhitespace } from '@Tools/strings';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { countries } from '@Fixtures/countryData';
import { addParticipant } from './addParticipant';
import { coercedSex } from '@Helpers/coercedSex';
import { isString } from '@Tools/objects';

// constants
import {
  CANNOT_MODIFY_PARTICIPANT_TYPE,
  INVALID_DATE,
  INVALID_PARTICIPANT_IDS,
} from '@Constants/errorConditionConstants';
import { GROUP, INDIVIDUAL, PAIR, participantTypes } from '@Constants/participantConstants';
import { PARTICIPANT_NAME_DERIVED_FROM_PERSON } from '@Constants/infoConstants';
import { TOURNAMENT_RECORD, PARTICIPANT } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';

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

  const {
    participantRoleResponsibilities,
    contactParticipantIds,
    individualParticipantIds,
    participantOtherName,
    participantName,
    participantRole,
    participantType,
    onlineResources,
    contacts,
    person,
  } = participant;

  if (participantType && existingParticipant.participantType !== participantType)
    return { error: CANNOT_MODIFY_PARTICIPANT_TYPE };

  const newValues: any = {};

  // validate participant attributes
  if (contacts) newValues.contacts = contacts;
  if (onlineResources) newValues.onlineResources = onlineResources;

  if (participantOtherName !== undefined) newValues.participantOtherName = participantOtherName || undefined;
  const suppliedParticipantName =
    participantName && isString(participantName) ? collapseWhitespace(participantName) : undefined;
  if (suppliedParticipantName) newValues.participantName = suppliedParticipantName;

  if (Array.isArray(individualParticipantIds)) {
    updateIndividualParticipantIds({
      individualParticipantIds,
      updateParticipantName,
      existingParticipant,
      participantType,
      tournamentRecord,
      pairOverride,
      newValues,
    });
  }
  // Designated contact people for a grouping. Validated against the membership the participant will
  // HAVE after this call — `newValues.individualParticipantIds` when membership is being changed in the
  // same mutation, the existing list otherwise. Validating against the stale list would reject a
  // legitimate "add these members and make one of them the contact" in a single call.
  //
  // A pointer to a non-member is stale rather than authoritative, so it is refused on write instead of
  // being tolerated and filtered on every read.
  if (Array.isArray(contactParticipantIds)) {
    const membership = newValues.individualParticipantIds ?? existingParticipant.individualParticipantIds ?? [];
    const invalid = contactParticipantIds.filter((participantId) => !membership.includes(participantId));
    if (invalid.length) return { error: INVALID_PARTICIPANT_IDS, invalid };
    newValues.contactParticipantIds = contactParticipantIds;
  }

  if (Object.keys(participantRoles).includes(participantRole)) newValues.participantRole = participantRole;
  if (Object.keys(participantTypes).includes(participantType)) newValues.participantType = participantType;

  if (Array.isArray(participantRoleResponsibilities))
    newValues.participantRoleResponsibilities = participantRoleResponsibilities;

  if (existingParticipant.participantType === participantTypes.INDIVIDUAL && person) {
    const personResult = updatePerson({
      updateParticipantName,
      existingParticipant,
      newValues,
      person,
    });
    if (personResult?.error) return personResult;
  }

  // A supplied participantName can be superseded by a derived one — from `person` for an INDIVIDUAL,
  // or from the individuals of a PAIR. That is intended precedence, but returning success while
  // silently dropping a value the caller passed makes a partial no-op indistinguishable from a full
  // success. Surface it instead. See PARTICIPANT_NAME_DERIVED_FROM_PERSON.
  const participantNameSuperseded = !!suppliedParticipantName && newValues.participantName !== suppliedParticipantName;

  Object.assign(existingParticipant, definedAttributes(newValues));

  if (groupingParticipantId) {
    addIndividualParticipantIds({
      individualParticipantIds: [existingParticipant.participantId],
      groupingParticipantId,
      removeFromOtherTeams,
      tournamentRecord,
    });
  }

  modifyParticipantsNotice({
    tournamentId: tournamentRecord.tournamentId,
    participants: [existingParticipant],
  });

  return {
    participant: makeDeepCopy(existingParticipant),
    ...SUCCESS,
    // conditional: callers that did not hit the precedence see the response shape they always have
    ...(participantNameSuperseded && { info: PARTICIPANT_NAME_DERIVED_FROM_PERSON }),
  };
}

function updateIndividualParticipantIds({
  individualParticipantIds,
  updateParticipantName,
  existingParticipant,
  participantType,
  tournamentRecord,
  pairOverride,
  newValues,
}) {
  const { participants: individualParticipants } = getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    tournamentRecord,
  });
  const allIndividualParticipantIds = individualParticipants?.map(getParticipantId);

  if (!allIndividualParticipantIds) return;

  const updatedIndividualParticipantIds = individualParticipantIds.filter(
    (participantId) => isString(participantId) && allIndividualParticipantIds.includes(participantId),
  );

  if (
    [GROUP, TEAM].includes(participantType || existingParticipant.participantType) ||
    (participantType === PAIR && (updatedIndividualParticipantIds.length === 2 || pairOverride))
  ) {
    newValues.individualParticipantIds = updatedIndividualParticipantIds;
  }

  if (existingParticipant.participantType === participantTypes.PAIR && updateParticipantName) {
    newValues.participantName = generatePairParticipantName({
      individualParticipantIds: newValues.individualParticipantIds,
      individualParticipants,
    });
  }
}

// An explicit empty string means "clear this field". `undefined` must keep meaning "leave
// untouched" — consumers send the whole person object on every save, so a field they do not
// manage has to survive. Clearing DELETES the key rather than storing '', so readers see an
// absent field instead of a falsy one each of them would have to special-case.
function isClearRequest(value) {
  return value === '';
}

function updatePerson({ updateParticipantName, existingParticipant, newValues, person }) {
  const newPersonValues: any = {};
  const clearedKeys: string[] = [];
  const { nationalityCode, personId, birthDate, tennisId, sex, contacts } = person;

  // Names are whitespace-normalized before they are measured or stored. Before, a
  // trailing space in a given-name field survived to compose 'Michael  Livson' —
  // a participantName that renders correctly (HTML collapses the run) and fails
  // every string comparison made against it afterwards, which is how it hid.
  // Normalizing ahead of the length check also stops ' A ' from passing a test
  // that the value actually persisted ('A') would fail.
  const standardFamilyName = collapseWhitespace(person.standardFamilyName);
  const standardGivenName = collapseWhitespace(person.standardGivenName);

  // `person.contacts` had no write path anywhere in the factory — declared on the type, readable, and
  // impossible to persist. That made `Contact.isPublic` inert by construction: nothing could set it, so
  // the publication gate on `tournamentContacts` had nothing to gate on.
  //
  // Replace-whole-array, not merge: a contact list is edited as a list (add a number, remove one, flip
  // one to public), and a merge would make removal unexpressible. Consistent with the "consumers send
  // the whole person object" contract above — omitting `contacts` leaves the existing list untouched,
  // while `[]` clears it.
  if (Array.isArray(contacts)) newPersonValues.contacts = contacts;
  const canonicalSex = coercedSex(sex);
  if (canonicalSex) newPersonValues.sex = canonicalSex;

  let personNameModified;
  if (isString(personId)) newPersonValues.personId = personId;

  if (isClearRequest(nationalityCode)) {
    clearedKeys.push('nationalityCode');
  } else if (nationalityCode && isString(nationalityCode) && validNationalityCode(nationalityCode)) {
    newPersonValues.nationalityCode = nationalityCode;
  }

  if (standardFamilyName && isString(standardFamilyName) && standardFamilyName.length > 1) {
    newPersonValues.standardFamilyName = standardFamilyName;
    personNameModified = true;
  }

  if (standardGivenName && isString(standardGivenName) && standardGivenName.length > 1) {
    newPersonValues.standardGivenName = standardGivenName;
    personNameModified = true;
  }

  if (personNameModified && updateParticipantName) {
    // Collapsed on the existing values too, not only the incoming ones: a record
    // that already carries 'Michael ' would otherwise re-compose the double space
    // whenever the OTHER name is the one being edited.
    const givenName = collapseWhitespace(
      newPersonValues.standardGivenName || existingParticipant.person?.standardGivenName,
    );
    const familyName = collapseWhitespace(
      newPersonValues.standardFamilyName || existingParticipant.person?.standardFamilyName,
    );
    if (givenName && familyName) {
      newValues.participantName = `${givenName} ${familyName}`;
    } else {
      const nameParts = [givenName, familyName].filter(Boolean).join(' ');
      newValues.participantName =
        nameParts || existingParticipant.participantOtherName || existingParticipant.participantName;
    }
  }

  if (isClearRequest(birthDate)) {
    clearedKeys.push('birthDate');
  } else if (birthDate) {
    if (!isValidDateString(birthDate)) return { error: INVALID_DATE };
    const birthYear = new Date(birthDate).getFullYear();
    if (new Date(birthDate) > new Date() || birthYear < 1900) {
      return { error: INVALID_DATE, info: 'birthDate must be a past date' };
    }
    newPersonValues.birthDate = birthDate;
  }

  if (tennisId && isString(tennisId)) {
    newPersonValues.tennisId = tennisId;
  }

  Object.assign(existingParticipant.person, newPersonValues);
  for (const key of clearedKeys) delete existingParticipant.person[key];
  return undefined;
}

export function validNationalityCode(code) {
  return countries
    .flatMap(({ iso, ioc }) => [iso, ioc])
    .filter(Boolean)
    .includes(code);
}
