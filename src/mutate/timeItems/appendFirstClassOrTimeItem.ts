import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { decorateResult } from '@Functions/global/decorateResult';
import { addTimeItem } from './addTimeItem';

// constants and types
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_VALUE,
  UNSUPPORTED_IN_LEGACY_MODE,
} from '@Constants/errorConditionConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { SUCCESS } from '@Constants/resultConstants';

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
