import { addParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { refusal } from '@Mutate/participants/personAttributeShapes';
import { canonicalJson } from '@Tools/canonicalJson';
import { isObject, isString } from '@Tools/objects';
import { isValidDateString } from '@Tools/dateTime';
import { nowIso } from '@Tools/clock';

// constants and types
import type { Participant, Person, TimeItem, UnifiedPersonID } from '@Types/tournamentTypes';
import { RANKING, RATING, SCALE } from '@Constants/scaleConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import type { ResultType, ScaleItem } from '@Types/factoryTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * The attributes of a participant that `modifyParticipant` does not write itself, and what it does with each.
 *
 * Consumers send the whole participant on every save, so each of these arrives on almost every call. A value equal to
 * the stored one is therefore never refused; only a CHANGED value is acted on:
 *
 * - `timeItems` and `person.personOtherIds` are MERGED (CA 2026-11-02): a re-import must be able to carry new ratings
 *   and new ids, and nothing stored is ever deleted by omission.
 * - every other setter-owned attribute is REFUSED with an error naming the method that writes it.
 */

/** Deep equality on stored values; an empty array and an absent attribute are the same thing. */
export function sameValue(a: unknown, b: unknown): boolean {
  const normalize = (value: unknown) => (Array.isArray(value) && !value.length ? undefined : value);
  const [left, right] = [normalize(a), normalize(b)];
  if (left === undefined || right === undefined || left === null || right === null) return left === right;
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

const participantSetters: Record<string, string[]> = {
  participantOtherIds: ['addParticipantOtherId'],
  extensions: ['addParticipantExtension', 'removeParticipantExtension'],
  penalties: ['addPenalty', 'modifyPenalty', 'removePenalty'],
  presence: ['modifyParticipantsSignInStatus'],
};

const personUnwritable = ['extensions', 'timeItems'];

export function checkSetterOwnedAttributes({
  existingParticipant,
  participant,
}: {
  existingParticipant: Participant;
  participant: Record<string, unknown>;
}): ResultType | undefined {
  for (const [field, setters] of Object.entries(participantSetters)) {
    const value = participant[field];
    if (value === undefined || value === null || sameValue(value, existingParticipant[field])) continue;
    return {
      ...refusal(field, `is not written by modifyParticipant; use ${setters.join(' / ')}`, value),
      context: { field, value, setters },
    };
  }

  const person = participant.person as Record<string, unknown> | undefined;
  if (!isObject(person)) return undefined;
  for (const field of personUnwritable) {
    const value = person?.[field];
    if (value === undefined || value === null || sameValue(value, existingParticipant.person?.[field])) continue;
    return refusal(`person.${field}`, 'has no write path; it cannot be changed through modifyParticipant', value);
  }
  return undefined;
}

type TimeItemsPlan = ResultType & { scaleItems?: ScaleItem[] };

/**
 * Incoming `timeItems` the participant does not already hold. A rating or ranking (`SCALE.RATING.*` /
 * `SCALE.RANKING.*`) is added the way `setParticipantScaleItem` adds one: appended when its value differs from the
 * current one, never replacing or deleting history. Any other new timeItem is refused: `addParticipantTimeItem` is
 * its writer.
 */
export function planTimeItems({
  existingParticipant,
  timeItems,
}: {
  existingParticipant: Participant;
  timeItems: unknown;
}): TimeItemsPlan {
  if (timeItems === undefined || timeItems === null) return { scaleItems: [] };
  if (!Array.isArray(timeItems)) return refusal('timeItems', 'must be an array of timeItems', timeItems);

  const held = existingParticipant.timeItems ?? [];
  const scaleItems: ScaleItem[] = [];
  for (const [index, timeItem] of timeItems.entries()) {
    if (held.some((stored) => sameValue(stored, timeItem))) continue;
    const result = toScaleItem({ existingParticipant, timeItem, field: `timeItems[${index}]` });
    if (result.error) return result;
    if (result.scaleItem) scaleItems.push(result.scaleItem);
  }
  return { scaleItems };
}

function toScaleItem({
  existingParticipant,
  timeItem,
  field,
}: {
  existingParticipant: Participant;
  timeItem: unknown;
  field: string;
}): ResultType & { scaleItem?: ScaleItem } {
  if (!isObject(timeItem) || !isString((timeItem as TimeItem).itemType))
    return refusal(field, 'must be a timeItem with an itemType', timeItem);

  const { itemType, itemValue, itemDate, itemSubTypes, createdAt } = timeItem as TimeItem;
  const [prefix, scaleType, eventType, ...scaleNameParts] = (itemType as string).split('.');
  const scaleName = scaleNameParts.join('.');
  if (prefix !== SCALE || ![RATING, RANKING].includes(scaleType) || !eventType || !scaleName)
    return refusal(field, 'only ratings and rankings are merged; use addParticipantTimeItem', timeItem);
  if (itemDate !== undefined && !(isString(itemDate) && isValidDateString(itemDate)))
    return refusal(`${field}.itemDate`, 'must be a date', itemDate);
  if (existingParticipant.participantType === TEAM_PARTICIPANT && eventType !== TEAM_EVENT)
    return refusal(field, 'a TEAM participant takes only TEAM scale items', timeItem);

  const scaleItem: ScaleItem & { createdAt?: unknown; scaleId?: string } = {
    eventType: eventType as ScaleItem['eventType'],
    scaleValue: itemValue,
    scaleType,
    scaleName,
  };
  if (itemDate !== undefined) scaleItem.scaleDate = itemDate;
  if (createdAt !== undefined) scaleItem.createdAt = createdAt;
  if (Array.isArray(itemSubTypes) && isString(itemSubTypes[0])) scaleItem.scaleId = itemSubTypes[0];
  return { scaleItem };
}

export function applyScaleItems({ participant, scaleItems }: { participant: Participant; scaleItems: ScaleItem[] }) {
  // every condition addParticipantScaleItem refuses on was checked by planTimeItems, before any write
  for (const scaleItem of scaleItems) addParticipantScaleItem({ participant, scaleItem, removePriorValues: false });
}

type OtherId = Partial<UnifiedPersonID>;
type OtherIdsPlan = ResultType & { personOtherIds?: OtherId[] };

/**
 * `person.personOtherIds` upserted, as `addPersonOtherId` does: keyed by `organisationId`, or by
 * `uniqueOrganisationName` when an entry has no organisationId. Entries the caller omits are kept. A new entry
 * with no organisationId stores its uniqueOrganisationName as the id, which CODES requires.
 */
export function planPersonOtherIds({
  existingPerson,
  person,
}: {
  person: Record<string, unknown>;
  existingPerson?: Person;
}): OtherIdsPlan {
  const personOtherIds = person.personOtherIds;
  if (personOtherIds === undefined || personOtherIds === null) return { personOtherIds: [] };
  if (sameValue(personOtherIds, existingPerson?.personOtherIds)) return { personOtherIds: [] };
  if (!Array.isArray(personOtherIds)) return refusal('person.personOtherIds', 'must be an array', personOtherIds);

  for (const [index, entry] of personOtherIds.entries()) {
    const field = `person.personOtherIds[${index}]`;
    if (!isObject(entry)) return refusal(field, 'must be an object', entry);
    const { organisationId, uniqueOrganisationName, personId } = entry as OtherId;
    if (!isString(personId) || !personId) return refusal(`${field}.personId`, 'must be a string', personId);
    if (!(isString(organisationId) && organisationId) && !(isString(uniqueOrganisationName) && uniqueOrganisationName))
      return refusal(field, 'needs an organisationId or a uniqueOrganisationName', entry);
  }
  return { personOtherIds };
}

export function applyPersonOtherIds({ person, personOtherIds }: { person: Person; personOtherIds: OtherId[] }) {
  if (!personOtherIds.length) return;
  person.personOtherIds ??= [];
  for (const entry of personOtherIds) {
    const existing = person.personOtherIds.find((stored) =>
      entry.organisationId
        ? stored?.organisationId === entry.organisationId
        : stored?.uniqueOrganisationName === entry.uniqueOrganisationName ||
          stored?.organisationId === entry.uniqueOrganisationName,
    );
    if (existing) {
      if (existing.personId === entry.personId) continue;
      existing.personId = entry.personId as string;
      existing.updatedAt = nowIso();
    } else {
      const { organisationId, uniqueOrganisationName, personId, createdAt } = entry;
      // organisationId is required by CODES: an entry keyed only by name stores the name as its id too
      const added: UnifiedPersonID = {
        organisationId: (organisationId || uniqueOrganisationName) as string,
        createdAt: createdAt ?? nowIso(),
        personId: personId as string,
      };
      if (uniqueOrganisationName) added.uniqueOrganisationName = uniqueOrganisationName;
      person.personOtherIds.push(added);
    }
  }
}
