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
// SCOREKEEPER: a participant approved to keep score for matchUps (crowd-scoring
// nomination). Carried as a primary role for a dedicated scorekeeper, or (more
// commonly) as a participantRoleResponsibility on a competitor/official who may
// also keep score. Aligns with the existing INTENNSE "scorekeeper" workflow.
export const SCOREKEEPER: any = 'SCOREKEEPER';
export const SECURITY: any = 'SECURITY';
export const STRINGER: any = 'STRINGER';
export const SUPERVISOR: any = 'SUPERVISOR';
// TIMEKEEPER: a participant responsible for the match clock. Becomes relevant
// for timed matchUpFormats (e.g. INTENNSE bolt/serve clocks). Role-only today;
// a per-matchUp assignMatchUpTimekeeper can mirror the scorekeeper mutation when
// timed formats need a nominated timekeeper.
export const TIMEKEEPER: any = 'TIMEKEEPER';
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
  SCOREKEEPER,
  SECURITY,
  STRINGER,
  SUPERVISOR,
  TIMEKEEPER,
  TRAINER,
  TRANSPORT,
  VOLUNTEER,
};
