import {
  ADMINISTRATION,
  CAPTAIN,
  COACH,
  COMPETITOR,
  DIRECTOR,
  HOSPITALITY,
  MEDIA,
  MEDICAL,
  OFFICIAL,
  OTHER,
  PHYSIO,
  SCOREKEEPER,
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TIMEKEEPER,
  TRAINER,
  TRANSPORT,
  VOLUNTEER,
} from './participantRoleValues';

// primitive role consts are generated from ParticipantRoleEnum (see participantRoleValues.ts).
// Member-level notes live on the enum, which is now the single source of truth.
export * from './participantRoleValues';

export const participantRoles = {
  ADMINISTRATION,
  CAPTAIN,
  COACH,
  COMPETITOR,
  DIRECTOR,
  HOSPITALITY,
  MEDIA,
  MEDICAL,
  OFFICIAL,
  OTHER,
  PHYSIO,
  SCOREKEEPER,
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TIMEKEEPER,
  TRAINER,
  TRANSPORT,
  VOLUNTEER,
} as const;
