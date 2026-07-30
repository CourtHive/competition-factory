export const WHEELCHAIR_TENNIS = 'WHEELCHAIR_TENNIS';
export const BEACH_TENNIS = 'BEACH_TENNIS';
export const TENNIS = 'TENNIS';

// Canonical discipline values. DisciplineUnion (the type) derives from this tuple so the
// accepted values and the type can never disagree, and attr-audit gains a value vocab to
// guard the discipline literals against typos (mirrors tournamentStatuses / TournamentStatusUnion).
export const disciplines = [TENNIS, BEACH_TENNIS, WHEELCHAIR_TENNIS] as const;

export const disciplineConstants = {
  WHEELCHAIR_TENNIS,
  BEACH_TENNIS,
  TENNIS,
};
