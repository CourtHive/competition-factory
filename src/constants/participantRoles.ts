export const ADMINISTRATION: any = 'ADMINISTRATION';
export const CAPTAIN: any = 'CAPTAIN';
export const COACH: any = 'COACH';
export const COMPETITOR: any = 'COMPETITOR';
export const DIRECTOR: any = 'DIRECTOR';
export const HOSPITALITY: any = 'HOSPITALITY';
export const MEDIA: any = 'MEDIA';
// MEDICAL stays as the umbrella role for doctors / paramedics / on-call
// medical staff. TRAINER and PHYSIO are deliberately separate constants
// because team rosters distinguish them: a strength-and-conditioning
// `TRAINER` runs warm-ups and recovery, a `PHYSIO` handles rehab and
// soft-tissue work, and `MEDICAL` covers the qualified physician overseeing
// the program. Collapsing them into MEDICAL would lose roster-level
// information the import wizard already carries.
export const MEDICAL: any = 'MEDICAL';
export const OFFICIAL: any = 'OFFICIAL';
export const OTHER: any = 'OTHER';
export const PHYSIO: any = 'PHYSIO';
export const SECURITY: any = 'SECURITY';
export const STRINGER: any = 'STRINGER';
export const SUPERVISOR: any = 'SUPERVISOR';
export const TRAINER: any = 'TRAINER';
export const TRANSPORT: any = 'TRANSPORT';
export const VOLUNTEER: any = 'VOLUNTEER';

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
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TRAINER,
  TRANSPORT,
  VOLUNTEER,
};
