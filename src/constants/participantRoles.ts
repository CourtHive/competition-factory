export const ADMINISTRATION = 'ADMINISTRATION';
export const CAPTAIN = 'CAPTAIN';
export const COACH = 'COACH';
export const COMPETITOR = 'COMPETITOR';
export const DIRECTOR = 'DIRECTOR';
export const HOSPITALITY = 'HOSPITALITY';
export const MEDIA = 'MEDIA';
// MEDICAL stays as the umbrella role for doctors / paramedics / on-call
// medical staff. TRAINER and PHYSIO are deliberately separate constants
// because team rosters distinguish them: a strength-and-conditioning
// `TRAINER` runs warm-ups and recovery, a `PHYSIO` handles rehab and
// soft-tissue work, and `MEDICAL` covers the qualified physician overseeing
// the program. Collapsing them into MEDICAL would lose roster-level
// information the import wizard already carries.
export const MEDICAL = 'MEDICAL';
export const OFFICIAL = 'OFFICIAL';
export const OTHER = 'OTHER';
export const PHYSIO = 'PHYSIO';
// SCOREKEEPER: a participant approved to keep score for matchUps (crowd-scoring
// nomination). Carried as a primary role for a dedicated scorekeeper, or (more
// commonly) as a participantRoleResponsibility on a competitor/official who may
// also keep score. Aligns with the existing INTENNSE "scorekeeper" workflow.
export const SCOREKEEPER = 'SCOREKEEPER';
export const SECURITY = 'SECURITY';
export const STRINGER = 'STRINGER';
export const SUPERVISOR = 'SUPERVISOR';
// TIMEKEEPER: a participant responsible for the match clock. Becomes relevant
// for timed matchUpFormats (e.g. INTENNSE bolt/serve clocks). Role-only today;
// a per-matchUp assignMatchUpTimekeeper can mirror the scorekeeper mutation when
// timed formats need a nominated timekeeper.
export const TIMEKEEPER = 'TIMEKEEPER';
export const TRAINER = 'TRAINER';
export const TRANSPORT = 'TRANSPORT';
export const VOLUNTEER = 'VOLUNTEER';

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
