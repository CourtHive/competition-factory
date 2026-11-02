import { applyPersonOtherIds, planPersonOtherIds, sameValue } from '@Mutate/participants/participantSetterFields';
import { coercedSex, isUnrecognizedSex, UNRECOGNIZED_SEX_INFO } from '@Helpers/coercedSex';
import { isClearRequest } from '@Mutate/participants/isClearRequest';
import { isValidDateString } from '@Tools/dateTime';
import { collapseWhitespace } from '@Tools/strings';
import { isObject, isString } from '@Tools/objects';
import { competitionNow } from '@Tools/clock';
import {
  checkBiographicalInformation,
  checkOnlineResources,
  validNationalityCode,
  checkAddresses,
  checkStrings,
  refusal,
} from '@Mutate/participants/personAttributeShapes';

// constants and types
import { INVALID_DATE, INVALID_VALUES, NATIONALITY_CODE_UNRECOGNIZED } from '@Constants/errorConditionConstants';
import type { Participant, Person, UnifiedPersonID } from '@Types/tournamentTypes';
import type { ResultType, ResultWarning } from '@Types/factoryTypes';

/**
 * What `modifyParticipant` does with each `person` attribute: write it, clear it, or refuse the call.
 *
 * - `undefined` and `null` leave an attribute untouched; '' clears it (see isClearRequest), and so does an empty
 *   array or object for a list or object attribute.
 * - A value equal to the stored one is never refused: consumers send the whole person on every save.
 * - Every refusal happens before anything is written. The one exception to refusal is `nationalityCode`: an
 *   unrecognised code is written and the result carries a NATIONALITY_CODE_UNRECOGNIZED warning (CA 2026-11-02).
 * - `isMock`, `createdAt` and `updatedAt` are metadata and are ignored.
 */

export type PersonWarning = ResultWarning & { participantId?: string; nationalityCode?: string };
type Outcome = { write?: unknown; clear?: boolean; error?: ResultType; alert?: PersonWarning };
type Rule = (value: unknown, field: string) => Outcome;

const NO_CHANGE: Outcome = {};
const MUST_BE_A_STRING = 'must be a string';

const stringRule: Rule = (value, field) => {
  if (isClearRequest(value)) return { clear: true };
  return isString(value) ? { write: value } : { error: refusal(field, MUST_BE_A_STRING, value) };
};

// a list or object attribute: '' and an empty value clear it; anything else must pass its shape check
const shapeRule =
  (check: (value: unknown, field: string) => ResultType | undefined, isEmpty: (value: unknown) => boolean): Rule =>
  (value, field) => {
    if (isClearRequest(value) || isEmpty(value)) return { clear: true };
    const error = check(value, field);
    return error ? { error } : { write: value };
  };

const emptyArray = (value: unknown) => Array.isArray(value) && !value.length;
const emptyObject = (value: unknown) => isObject(value) && !Object.keys(value as object).length;

const birthYearRule: Rule = (value, field) => {
  if (isClearRequest(value)) return { clear: true };
  const thisYear = competitionNow().getFullYear();
  if (!Number.isInteger(value) || (value as number) < 1900 || (value as number) > thisYear)
    return { error: refusal(field, `must be a whole year from 1900 to ${thisYear}`, value) };
  return { write: value };
};

const booleanRule: Rule = (value, field) => {
  if (isClearRequest(value)) return { clear: true };
  return typeof value === 'boolean' ? { write: value } : { error: refusal(field, 'must be a boolean', value) };
};

const nationalityCodeRule: Rule = (value, field) => {
  if (isClearRequest(value)) return { clear: true };
  if (!isString(value)) return { error: refusal(field, MUST_BE_A_STRING, value) };
  if (validNationalityCode(value)) return { write: value };
  return { write: value, alert: { ...NATIONALITY_CODE_UNRECOGNIZED, nationalityCode: value } };
};

const birthDateRule: Rule = (value) => {
  if (isClearRequest(value)) return { clear: true };
  if (!isValidDateString(value)) return { error: { error: INVALID_DATE } };
  const date = new Date(value as string);
  if (date > competitionNow() || date.getFullYear() < 1900)
    return { error: { error: INVALID_DATE, info: 'birthDate must be a past date' } };
  return { write: value };
};

// An unrecognised sex used to be skipped without a word; '' clears it, since sex is optional.
const sexRule: Rule = (value) => {
  if (isClearRequest(value)) return { clear: true };
  if (isUnrecognizedSex(value))
    return { error: { error: INVALID_VALUES, info: UNRECOGNIZED_SEX_INFO, context: { sex: value } } };
  return { write: coercedSex(value) };
};

const personIdRule: Rule = (value, field) =>
  isString(value) && value ? { write: value } : { error: refusal(field, 'must be a non-empty string', value) };

// Replace-whole-array, not merge: a contact list is edited as a list, and a merge would make removal unexpressible.
// `[]` clears the list by storing it empty, as it always has.
const contactsRule: Rule = (value, field) =>
  Array.isArray(value) && value.every(isObject)
    ? { write: value }
    : { error: refusal(field, 'must be an array of contacts', value) };

// Names are whitespace-normalized before they are measured or stored (see personNameWhitespace.test.ts).
const nameRule: Rule = (value, field) => {
  if (!isString(value)) return { error: refusal(field, MUST_BE_A_STRING, value) };
  const name = collapseWhitespace(value);
  if (!name) return { clear: true };
  if (name.length < 2) return { error: refusal(field, 'must be at least two characters', value) };
  return { write: name };
};

const personRules: Record<string, Rule> = {
  standardFamilyName: nameRule,
  standardGivenName: nameRule,
  nationalityCode: nationalityCodeRule,
  birthDate: birthDateRule,
  sex: sexRule,
  personId: personIdRule,
  contacts: contactsRule,
  tennisId: stringRule,
  nativeFamilyName: stringRule,
  nativeGivenName: stringRule,
  passportFamilyName: stringRule,
  passportGivenName: stringRule,
  parentOrganisationId: stringRule,
  sectionId: stringRule,
  status: stringRule,
  notes: stringRule,
  birthYear: birthYearRule,
  wheelchair: booleanRule,
  otherNames: shapeRule(checkStrings, emptyArray),
  previousNames: shapeRule(checkStrings, emptyArray),
  addresses: shapeRule(checkAddresses, emptyArray),
  onlineResources: shapeRule(checkOnlineResources, emptyArray),
  biographicalInformation: shapeRule(checkBiographicalInformation, emptyObject),
};

const NAME_FIELDS = ['standardFamilyName', 'standardGivenName'];

export type PersonPlan = ResultType & {
  personOtherIds?: Partial<UnifiedPersonID>[];
  values?: Record<string, unknown>;
  warnings?: PersonWarning[];
  participantName?: string;
  clearedKeys?: string[];
};

export function planPersonUpdate({
  updateParticipantName,
  existingParticipant,
  person,
}: {
  existingParticipant: Participant;
  updateParticipantName?: boolean;
  person: unknown;
}): PersonPlan {
  if (!isObject(person)) return refusal('person', 'must be an object', person);
  const incoming = person as Record<string, unknown>;
  const stored: Record<string, unknown> = { ...existingParticipant.person };

  const values: Record<string, unknown> = {};
  const warnings: PersonWarning[] = [];
  const clearedKeys: string[] = [];
  for (const [key, rule] of Object.entries(personRules)) {
    const outcome = outcomeFor({ key, rule, value: incoming[key], stored: stored[key] });
    if (outcome.error) return outcome.error;
    if (outcome.alert) warnings.push({ ...outcome.alert, participantId: existingParticipant.participantId });
    if (outcome.clear && stored[key] !== undefined) clearedKeys.push(key);
    if (outcome.write !== undefined) values[key] = outcome.write;
  }

  const otherIds = planPersonOtherIds({ person: incoming, existingPerson: existingParticipant.person });
  if (otherIds.error) return otherIds;

  // A supplied name re-derives participantName even when it is unchanged, as it always has: a supplied
  // participantName is superseded by the person's (see PARTICIPANT_NAME_DERIVED_FROM_PERSON).
  const nameSupplied = (key: string) => {
    const name = collapseWhitespace(incoming[key]);
    return isString(name) && name.length > 1;
  };
  const nameChanged = NAME_FIELDS.some((key) => key in values || clearedKeys.includes(key) || nameSupplied(key));
  const participantName =
    nameChanged && updateParticipantName ? composeName({ existingParticipant, values, clearedKeys }) : undefined;

  return { values, clearedKeys, warnings, participantName, personOtherIds: otherIds.personOtherIds };
}

function outcomeFor({ key, rule, value, stored }: { key: string; rule: Rule; value: unknown; stored: unknown }) {
  if (value === undefined || value === null) return NO_CHANGE;
  const comparable = NAME_FIELDS.includes(key) ? collapseWhitespace(value) : value;
  if (sameValue(comparable, NAME_FIELDS.includes(key) ? collapseWhitespace(stored) : stored)) return NO_CHANGE;
  return rule(value, `person.${key}`);
}

// Collapsed on the existing values too, not only the incoming ones: a record that already carries 'Michael ' would
// otherwise re-compose the double space whenever the OTHER name is the one being edited.
function composeName({
  existingParticipant,
  clearedKeys,
  values,
}: {
  existingParticipant: Participant;
  values: Record<string, unknown>;
  clearedKeys: string[];
}): string | undefined {
  const current = (key: string) =>
    clearedKeys.includes(key) ? undefined : collapseWhitespace(values[key] ?? existingParticipant.person?.[key]);
  const givenName = current('standardGivenName');
  const familyName = current('standardFamilyName');
  const nameParts = [givenName, familyName].filter(Boolean).join(' ');
  return nameParts || existingParticipant.participantOtherName || existingParticipant.participantName;
}

export function applyPersonUpdate({
  existingParticipant,
  plan,
}: {
  existingParticipant: Participant;
  plan: PersonPlan;
}) {
  existingParticipant.person ??= {} as Person;
  const person = existingParticipant.person;
  Object.assign(person, plan.values);
  for (const key of plan.clearedKeys ?? []) delete person[key];
  applyPersonOtherIds({ person, personOtherIds: plan.personOtherIds ?? [] });
}
