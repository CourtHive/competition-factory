import { addNotice, writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { getParticipantPresence } from '@Acquire/presenceAttestations';
import { decorateResult } from '@Functions/global/decorateResult';
import { deriveElement } from '@Query/base/deriveElement';
import { getTimeItemValues } from './getTimeItemValues';
import { getTimeItem } from '@Query/base/timeItems';
import { isValidDateString } from '@Tools/dateTime';
import { isObject, isString } from '@Tools/objects';

// constants and types
import { DrawDefinition, Event, TimeItem, Tournament } from '@Types/tournamentTypes';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { SIGN_IN_STATUS } from '@Constants/participantConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  EVENT_NOT_FOUND,
  INVALID_DATE,
  INVALID_TIME_ITEM,
  INVALID_VALUES,
  MISSING_PARTICIPANT_ID,
  MISSING_TIME_ITEM,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  UNSUPPORTED_IN_LEGACY_MODE,
} from '@Constants/errorConditionConstants';

type AddTimeItemArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  participantId?: string;
  creationTime?: boolean;
  timeItem: TimeItem;
  event?: Event;
  element: any;
};

export function addTimeItem(params: AddTimeItemArgs) {
  const { duplicateValues = true, creationTime = true, removePriorValues, timeItem } = params;
  if (!timeItem) return { error: MISSING_TIME_ITEM };

  const element = deriveElement(params);
  if (element.error) return element;

  const validTimeItem =
    isObject(timeItem) && isString(timeItem.itemType) && Object.keys(timeItem).includes('itemValue');
  if (!validTimeItem) return { error: INVALID_TIME_ITEM };

  // Validate itemDate format if provided as a string
  if (timeItem.itemDate && typeof timeItem.itemDate === 'string' && !isValidDateString(timeItem.itemDate)) {
    return { error: INVALID_DATE };
  }

  if (!element.timeItems) {
    element.timeItems = [];
  } else if (hasEquivalentTimeItem({ element, duplicateValues, timeItem })) {
    return { ...SUCCESS };
  }

  if (timeItem.itemSubTypes && !timeItem.itemSubTypes.length) delete timeItem.itemSubTypes;

  if (creationTime) {
    // Honour a caller-supplied `createdAt` rather than overwriting it.
    //
    // `createdAt` on a timeItem is not decoration — it is the ORDERING KEY used
    // to resolve "the latest value" (ratings via getScaleValues /
    // participantScaleItem, check-in, startTime/endTime, scheduling details,
    // quality-win points, latestVisibleTimeItemValue). Stamping unconditionally
    // means the value can only ever be *write* time, so an edit made at a venue
    // and synced hours later is recorded as having happened at sync time.
    //
    // Inert for every current caller: none of the 11 call sites supplies
    // `createdAt`, so the default path is unchanged. This only lets an origin
    // pin the value — which is what makes the mutation faithfully replayable,
    // the same principle as minting ids at the origin.
    //
    // `creationTime: false` still means "do not add a createdAt at all".
    timeItem.createdAt ??= new Date().toISOString();
  }

  if (removePriorValues) element.timeItems = element.timeItems.filter(({ itemType }) => timeItem.itemType !== itemType);

  // if priorValues are being remvoed and there is no new itemValue, do not add by pushing
  const doNotAdd = removePriorValues && !timeItem.itemValue;
  if (!doNotAdd) element.timeItems.push(timeItem);

  return { ...SUCCESS };
}

function hasEquivalentTimeItem({ element, duplicateValues, timeItem }) {
  // check if timeItem with equivalent value already exists
  const { itemType, itemSubTypes, itemValue } = timeItem;
  const existingTimeItem =
    itemType &&
    getTimeItem({
      itemSubTypes,
      itemType,
      element,
    })?.timeItem;

  return (
    existingTimeItem && JSON.stringify(existingTimeItem?.itemValue) === JSON.stringify(itemValue) && !duplicateValues
  );
}

type AddParticipantTimeItemArgs = {
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  disableNotice?: boolean;
  creationTime?: boolean;
  participantId: string;
  timeItem: TimeItem;
};

export function addParticipantTimeItem({
  creationTime = true,
  removePriorValues,
  tournamentRecord,
  duplicateValues,
  disableNotice,
  participantId,
  timeItem,
}: AddParticipantTimeItemArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  const result = findTournamentParticipant({ tournamentRecord, participantId });
  if (result.error) return result;

  const addResult = addTimeItem({
    element: result.participant,
    removePriorValues,
    duplicateValues,
    creationTime,
    timeItem,
  });
  if (addResult.error) return addResult;

  // The generic participant time-item entry point was silent — direct callers
  // got no notice (batch callers like sign-in/payment status dispatch their own,
  // passing disableNotice). Dispatch MODIFY_PARTICIPANTS for the touched participant.
  if (!disableNotice) {
    modifyParticipantsNotice({ tournamentId: tournamentRecord.tournamentId, participants: [result.participant] });
  }

  return addResult;
}

/**
 * The presence-log counterpart to {@link addParticipantTimeItem}.
 *
 * The participant is BOTH the element the log hangs on AND the subject of every entry — unlike a
 * matchUp check-in, where the subject is named by the attestation and the matchUp is merely where it
 * lives. That asymmetry is why the legacy `SIGN_IN_STATUS` timeItem carries the STATE as its
 * `itemValue` while `CHECK_IN` carries the participantId, and it is the reason the read accessor
 * supplies the subject for one and reads it from the entry for the other.
 */
export function addParticipantPresenceAttestation({
  tournamentRecord,
  disableNotice,
  participantId,
  attestation,
}: {
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  participantId: string;
  attestation: PresenceAttestation;
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  const found = findTournamentParticipant({ tournamentRecord, participantId });
  if (found.error) return found;

  const result = appendFirstClassOrTimeItem({
    legacy: { itemType: SIGN_IN_STATUS, itemValue: attestation.state },
    promoted: getParticipantPresence(found.participant),
    legacyItemTypes: [SIGN_IN_STATUS],
    element: found.participant,
    attribute: 'presence',
    attestation,
  });
  if (result.error) return result;

  if (!disableNotice) {
    modifyParticipantsNotice({ tournamentId: tournamentRecord.tournamentId, participants: [found.participant] });
  }

  return result;
}

export function addTournamentTimeItem(params) {
  const { removePriorValues, tournamentRecord, duplicateValues, creationTime, timeItem } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const result = addTimeItem({
    element: tournamentRecord,
    removePriorValues,
    duplicateValues,
    creationTime,
    timeItem,
  });
  if (result.error) return result;

  const timeItemValues = getTimeItemValues({ element: tournamentRecord });
  addNotice({
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      timeItemValues,
    },
    topic: MODIFY_TOURNAMENT_DETAIL,
  });

  return result;
}

export function addEventTimeItem(params) {
  const { removePriorValues, duplicateValues, creationTime, timeItem, event } = params;
  if (!event) return { error: EVENT_NOT_FOUND };
  return addTimeItem({
    removePriorValues,
    duplicateValues,
    element: event,
    creationTime,
    timeItem,
  });
}

export function resetTimeItems({ element }) {
  if (!element) return { error: MISSING_VALUE };
  element.timeItems = [];
  return { ...SUCCESS };
}

// ============================================================================
// from appendFirstClassOrTimeItem.ts — merged to break the build-time cycle
// ============================================================================

type AppendFirstClassOrTimeItemArgs = {
  /** the object the log hangs on — a matchUp or a participant */
  element: any;
  /** the first-class collection attribute, e.g. 'checkIns' | 'presence' */
  attribute: string;
  attestation: PresenceAttestation;
  /** legacy mirror: the itemType to write, and the itemValue to write for it */
  legacy?: { itemType: string; itemValue: any };
  /** every itemType this log owns, stripped from `timeItems` once NATIVE holds the history */
  legacyItemTypes: string[];
  /** attestations promoted from `timeItems` — folded in before the first NATIVE append */
  promoted?: PresenceAttestation[];
};

/**
 * Write helper for promoting an ordered presence LOG to a first-class collection.
 *
 * The counterpart to `setFirstClassOrTimeItem`, and deliberately a separate function rather than a flag
 * on it. That helper is documented as last-write-wins only, and in NATIVE mode it calls
 * `stripTimeItemsByType` — for a log that is not a normalisation, it is data loss. It is exactly how
 * `SCHEDULE.ASSIGNMENT.OFFICIAL` lost its assignment history, taking `officialType` with it.
 *
 * Mode behaviour:
 *
 * - **NATIVE** — fold any legacy history into the collection FIRST (so the log is never split across
 *   two surfaces), append, then strip the legacy itemTypes. Promote-then-append, never append-then-strip.
 * - **BRIDGE** — first-class collection AND the legacy timeItem. ⚠️ **Lossy by construction**: a
 *   timeItem has one `itemValue`, so the mirror can carry who and when but never by-whom. A BRIDGE
 *   record read by a legacy consumer silently loses `attributedTo`.
 * - **LEGACY** — timeItem only, and an attestation carrying `attributedTo` is **REFUSED**. Dropping it
 *   silently is the fail-quiet shape the architectural standards exist to prevent; a caller that wants
 *   a legacy record must be told its attribution cannot be stored, not discover it later.
 */
export function appendFirstClassOrTimeItem(params?: AppendFirstClassOrTimeItemArgs): {
  attestation?: PresenceAttestation;
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'appendFirstClassOrTimeItem';

  if (typeof params !== 'object') return decorateResult({ result: { error: MISSING_VALUE }, stack });
  const { element, attribute, attestation, legacy, legacyItemTypes, promoted } = params;

  if (!element || typeof element !== 'object') return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof attribute !== 'string' || !attribute) {
    return decorateResult({ result: { error: INVALID_VALUES }, stack });
  }
  if (!attestation?.attestationId || !attestation?.participantId || !attestation?.state) {
    return decorateResult({ result: { error: INVALID_VALUES }, stack });
  }

  if (writeNativeEnabled()) {
    if (!Array.isArray(element[attribute])) {
      // Promote-then-append. Folding the legacy history in before the first native write is what keeps
      // a record from holding half its log in `timeItems` and half in the collection, which no reader
      // could reconcile without knowing which half came first.
      element[attribute] = [...(promoted ?? [])];
    }

    // Idempotent on attestationId, so a mutation replayed after a disconnected sync appends once.
    const exists = element[attribute].some(
      (existing: PresenceAttestation) => existing?.attestationId === attestation.attestationId,
    );
    if (!exists) element[attribute].push(attestation);

    if (Array.isArray(element.timeItems) && legacyItemTypes?.length) {
      element.timeItems = element.timeItems.filter((timeItem: any) => !legacyItemTypes.includes(timeItem?.itemType));
    }
  }

  if (!writeLegacyEnabled()) return { ...SUCCESS, attestation };

  if (attestation.attributedTo) {
    return decorateResult({
      result: { error: UNSUPPORTED_IN_LEGACY_MODE, context: { attribute, reason: 'attributedTo' } },
      stack,
    });
  }

  if (legacy?.itemType) {
    const result = addTimeItem({
      timeItem: { itemType: legacy.itemType, itemValue: legacy.itemValue, createdAt: attestation.occurredAt },
      element,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  return { ...SUCCESS, attestation };
}
