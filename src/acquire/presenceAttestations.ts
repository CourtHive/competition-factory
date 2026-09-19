import { CHECKED_IN, CHECKED_OUT, SIGNED_IN_STATE, SIGNED_OUT_STATE } from '@Constants/presenceConstants';
import { CHECK_IN, CHECK_OUT } from '@Constants/timeItemConstants';
import { SIGN_IN_STATUS } from '@Constants/participantConstants';

// types
import type { PresenceAttestation, PresenceStateUnion } from '@Types/presenceTypes';
import type { TimeItem } from '@Types/tournamentTypes';

/**
 * Read helper for the CODES presence promotion — the LOG variant.
 *
 * `firstClassOrTimeItem` picks the latest timeItem for a last-write-wins attribute. Presence is not
 * that: it is an ordered log folded per participant, so this returns the WHOLE history, normalised to
 * {@link PresenceAttestation}, from whichever surface holds it.
 *
 * Prefers the first-class collection. Falls back to legacy timeItems so records written before the
 * promotion — and `SIGN_IN_STATUS` goes back to 2023 in real tournament records — read identically.
 * A promoted legacy entry carries no `attributedTo`: nobody ever recorded one, and an absent attester
 * is honest where a synthesised one would not be.
 */

type LegacyMapping = { itemType: string; toState: (timeItem: TimeItem) => PresenceStateUnion | undefined };

const MATCHUP_LEGACY: LegacyMapping[] = [
  { itemType: CHECK_IN, toState: () => CHECKED_IN },
  { itemType: CHECK_OUT, toState: () => CHECKED_OUT },
];

const PARTICIPANT_LEGACY: LegacyMapping[] = [
  {
    itemType: SIGN_IN_STATUS,
    toState: (timeItem) => (timeItem.itemValue === SIGNED_IN_STATE ? SIGNED_IN_STATE : SIGNED_OUT_STATE),
  },
];

function occurredAtOf(timeItem: TimeItem): string {
  const value = timeItem.createdAt ?? timeItem.itemDate;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
}

/**
 * A stable synthetic id for a legacy timeItem, so folding the same record twice does not produce two
 * attestations for one stored fact. Deliberately derived rather than minted: minting here would make
 * `getCheckedInParticipantIds` non-deterministic across calls.
 */
function legacyAttestationId(itemType: string, participantId: string, occurredAt: string): string {
  return `legacy:${itemType}:${participantId}:${occurredAt}`;
}

function fromTimeItems(timeItems: TimeItem[] | undefined, mappings: LegacyMapping[]): PresenceAttestation[] {
  if (!Array.isArray(timeItems)) return [];
  const attestations: PresenceAttestation[] = [];

  for (const timeItem of timeItems) {
    const mapping = mappings.find((candidate) => candidate.itemType === timeItem?.itemType);
    if (!mapping) continue;
    const state = mapping.toState(timeItem);
    if (!state) continue;

    // matchUp CHECK_IN carries the participantId as itemValue; participant SIGN_IN_STATUS carries the
    // state, and its subject is the participant the timeItem hangs on — supplied by the caller.
    const participantId = mapping.itemType === SIGN_IN_STATUS ? '' : (timeItem.itemValue ?? '');
    const occurredAt = occurredAtOf(timeItem);

    attestations.push({
      attestationId: legacyAttestationId(mapping.itemType, participantId, occurredAt),
      participantId,
      occurredAt,
      state,
    });
  }

  return attestations;
}

/** Ordered oldest-first by `occurredAt`. An entry with no `occurredAt` sorts first, as it always did. */
export function sortAttestations(attestations: PresenceAttestation[]): PresenceAttestation[] {
  return [...attestations].sort((a, b) => {
    const left = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const right = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return left - right;
  });
}

/** Presence history for a matchUp — first-class collection preferred, legacy timeItems as fallback. */
export function getMatchUpPresence(matchUp: any): PresenceAttestation[] {
  if (Array.isArray(matchUp?.checkIns)) return sortAttestations(matchUp.checkIns);
  return sortAttestations(fromTimeItems(matchUp?.timeItems, MATCHUP_LEGACY));
}

/**
 * Presence history for a participant. The legacy `SIGN_IN_STATUS` timeItem does not name its subject —
 * it hangs on the participant — so the subject is supplied here.
 */
export function getParticipantPresence(participant: any): PresenceAttestation[] {
  if (Array.isArray(participant?.presence)) return sortAttestations(participant.presence);
  const participantId = participant?.participantId ?? '';
  const promoted = fromTimeItems(participant?.timeItems, PARTICIPANT_LEGACY).map((attestation) => ({
    ...attestation,
    attestationId: legacyAttestationId(SIGN_IN_STATUS, participantId, attestation.occurredAt),
    participantId,
  }));
  return sortAttestations(promoted);
}
