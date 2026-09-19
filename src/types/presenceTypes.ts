import type { ContactRelationshipUnion, Extension } from '@Types/tournamentTypes';
import type {
  CHECKED_IN,
  CHECKED_OUT,
  DECLARED_ATTRIBUTION,
  DEVICE_ATTRIBUTION,
  PARTICIPANT_ATTRIBUTION,
  PERSON_ATTRIBUTION,
  SIGNED_IN_STATE,
  SIGNED_OUT_STATE,
  SYSTEM_ATTRIBUTION,
} from '@Constants/presenceConstants';

export type MatchUpPresenceStateUnion = typeof CHECKED_IN | typeof CHECKED_OUT;
export type TournamentPresenceStateUnion = typeof SIGNED_IN_STATE | typeof SIGNED_OUT_STATE;
export type PresenceStateUnion = MatchUpPresenceStateUnion | TournamentPresenceStateUnion;

/**
 * WHO attested a presence fact.
 *
 * A discriminated union so the cheap case stays cheap: a desk operator who is a Participant costs one
 * id, while a parent who is not in the record at all can still be named. `relationship` reuses
 * {@link ContactRelationshipUnion} (`SELF | PARENT | GUARDIAN | CHAPERONE | EMERGENCY | OTHER`) rather
 * than minting a second vocabulary for the same distinction — the sanctioning policy's category
 * allowances (e.g. U10 permits PARENT) are expressed against these same values.
 *
 * ⚠️ `DECLARED` carries contact details for a person who is NOT in the record and is therefore
 * governed by nothing `person.contacts` is governed by. It must be scrubbed by
 * `anonymizeTournamentRecord`, filtered by POLICY_TYPE_PRIVACY, and never emitted on a public surface.
 */
export type Attribution =
  | { attributionType: typeof PARTICIPANT_ATTRIBUTION; participantId: string; relationship?: ContactRelationshipUnion }
  | { attributionType: typeof PERSON_ATTRIBUTION; personId: string; relationship?: ContactRelationshipUnion }
  | {
      attributionType: typeof DECLARED_ATTRIBUTION;
      relationship?: ContactRelationshipUnion;
      emailAddress?: string;
      telephone?: string;
      name: string;
    }
  | { attributionType: typeof DEVICE_ATTRIBUTION; deviceId?: string }
  | { attributionType: typeof SYSTEM_ATTRIBUTION; source?: string };

/**
 * One recorded presence fact: a person, present (or gone), at a time, attested by someone.
 *
 * Replaces the `CHECK_IN` / `CHECK_OUT` timeItems on a matchUp and the `SIGN_IN_STATUS` timeItems on a
 * participant. Promoted to a first-class COLLECTION rather than a scalar because presence is folded
 * from an ordered log, not resolved last-write-wins: `setFirstClassOrTimeItem` strips the history in
 * NATIVE mode, which is precisely how `SCHEDULE.ASSIGNMENT.OFFICIAL` lost its assignment history.
 */
export interface PresenceAttestation {
  /**
   * Minted at the ORIGIN, so a mutation replayed after a disconnected sync is recognisable as the same
   * fact rather than appended twice. Same principle as minting participantIds at the origin.
   */
  attestationId: string;
  /**
   * WHO is present — the SUBJECT, never the attester.
   *
   * INDIVIDUAL participants only. The pre-promotion API also accepted a PAIR or TEAM and reconciled it
   * with nothing, so a desk that checked in the pair and a desk that checked in both players stored
   * different state for the same physical fact. Reading still DERIVES side-level presence from its
   * members (and vice versa); only the write subject is restricted.
   */
  participantId: string;
  state: PresenceStateUnion;
  /**
   * ISO — when the presence actually HAPPENED. The resolution and ordering key.
   *
   * Distinct from {@link recordedAt} on purpose. A timeItem's `createdAt` was doing both jobs, so an
   * arrival recorded at the desk and synced hours later both misreported its time and SORTED as though
   * it happened at sync time — changing what "latest" resolves to.
   */
  occurredAt: string;
  /** ISO — when this instance wrote it. Audit and sync-gap only; never used for resolution. */
  recordedAt?: string;
  attributedTo?: Attribution;
  notes?: string;
  extensions?: Extension[];
}
