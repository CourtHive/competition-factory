import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { addIndividualParticipantIds } from './addIndividualParticipantIds';
import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { participantRoles } from '@Constants/participantRoles';
import { definedAttributes } from '@Tools/definedAttributes';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { isValidDateString } from '@Tools/dateTime';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { countries } from '@Fixtures/countryData';
import { addParticipant } from './addParticipant';
import { coercedSex } from '@Helpers/coercedSex';
import { isString } from '@Tools/objects';

// constants
import { CANNOT_MODIFY_PARTICIPANT_TYPE, INVALID_DATE } from '@Constants/errorConditionConstants';
import { GROUP, INDIVIDUAL, PAIR, participantTypes } from '@Constants/participantConstants';
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
  if (participantName && isString(participantName)) newValues.participantName = participantName;

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
      individualParticipants,
      newValues,
    });
  }
}

function generatePairParticipantName({ individualParticipants, newValues }) {
  const individualParticipantIds = newValues.individualParticipantIds;
  let participantName = individualParticipants
    .filter(({ participantId }) => individualParticipantIds.includes(participantId))
    .map((p) => p.person?.standardFamilyName || p.participantOtherName || p.participantName || '')
    .filter(Boolean)
    .sort()
    .join('/');

  if (individualParticipantIds.length === 1) participantName += '/Unknown';
  return participantName;
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
  const { standardFamilyName, standardGivenName, nationalityCode, personId, birthDate, tennisId, sex } = person;
  const canonicalSex = coercedSex(sex);
  if (canonicalSex) newPersonValues.sex = canonicalSex;

  let personNameModified;
  if (isString(personId)) newPersonValues.personId = personId;

  if (isClearRequest(nationalityCode)) {
    clearedKeys.push('nationalityCode');
  } else if (nationalityCode && isString(nationalityCode) && validNationalityCode(nationalityCode)) {
    newPersonValues.nationalityCode = nationalityCode;
  }

  if (standardFamilyName && typeof isString(standardFamilyName) && standardFamilyName.length > 1) {
    newPersonValues.standardFamilyName = standardFamilyName;
    personNameModified = true;
  }

  if (standardGivenName && typeof isString(standardGivenName) && standardGivenName.length > 1) {
    newPersonValues.standardGivenName = standardGivenName;
    personNameModified = true;
  }

  if (personNameModified && updateParticipantName) {
    const givenName = newPersonValues.standardGivenName || existingParticipant.person?.standardGivenName;
    const familyName = newPersonValues.standardFamilyName || existingParticipant.person?.standardFamilyName;
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
