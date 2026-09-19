/**
 * Presence vocabulary — CODES first-class.
 *
 * Two facts, one shape. `SIGNED_IN` / `SIGNED_OUT` record arrival at the TOURNAMENT and live on the
 * participant; `CHECKED_IN` / `CHECKED_OUT` record presenting at the desk for ONE matchUp and live on
 * the matchUp. They are deliberately distinct words on one enum rather than a shared boolean: D4a
 * settled that an operator control must never offer both, and a shared value would make the two
 * indistinguishable once promoted onto a common `PresenceAttestation`.
 *
 * See Mentat/planning/PRESENCE_ATTESTATION_FIRST_CLASS.md.
 */
export const CHECKED_IN = 'CHECKED_IN';
export const CHECKED_OUT = 'CHECKED_OUT';
export const SIGNED_IN_STATE = 'SIGNED_IN';
export const SIGNED_OUT_STATE = 'SIGNED_OUT';

export const matchUpPresenceStates = [CHECKED_IN, CHECKED_OUT] as const;
export const tournamentPresenceStates = [SIGNED_IN_STATE, SIGNED_OUT_STATE] as const;

/**
 * WHO attested the presence — never who is present. The subject is the attestation's `participantId`.
 *
 * `DECLARED` is the reason this is a union rather than a participantId. A minor's parent signs them in
 * at the desk and is NOT a Participant — modelling them as one would put them inside `addEventEntries`
 * (which gates on `participantType`), the tournament's player counts and rankings ingest. The same
 * reasoning is already recorded on `ContactRelationshipEnum`, whose vocabulary this reuses.
 */
export const PARTICIPANT_ATTRIBUTION = 'PARTICIPANT';
export const PERSON_ATTRIBUTION = 'PERSON';
export const DECLARED_ATTRIBUTION = 'DECLARED';
export const DEVICE_ATTRIBUTION = 'DEVICE';
export const SYSTEM_ATTRIBUTION = 'SYSTEM';

export const attributionTypes = [
  PARTICIPANT_ATTRIBUTION,
  PERSON_ATTRIBUTION,
  DECLARED_ATTRIBUTION,
  DEVICE_ATTRIBUTION,
  SYSTEM_ATTRIBUTION,
] as const;

export const presenceConstants = {
  PARTICIPANT_ATTRIBUTION,
  tournamentPresenceStates,
  DECLARED_ATTRIBUTION,
  matchUpPresenceStates,
  PERSON_ATTRIBUTION,
  DEVICE_ATTRIBUTION,
  SYSTEM_ATTRIBUTION,
  SIGNED_OUT_STATE,
  SIGNED_IN_STATE,
  attributionTypes,
  CHECKED_OUT,
  CHECKED_IN,
} as const;

export default presenceConstants;
