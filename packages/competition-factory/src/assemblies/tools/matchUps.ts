/**
 * MatchUp shape validators over a matchUp the caller holds: stateless and positional. Their home is
 * `tools.matchUps` (the `contracts` package at 8.0.0); `matchUpGovernor` also exports them in 7.x, and that placement
 * goes at 8.0.0.
 *
 * Below them, readers of matchUps the caller holds that take one params object and read no state (confirmed
 * stateless by the statelessGovernorTools test): analysis, margins and upsets, check-in, home
 * participant, round grouping and filtering, schedule locks and the court grid. `matchUpGovernor` (and
 * `scheduleGovernor` for `matchUpScheduleLocked` and `courtGridRows`) keeps them in 7.x; their engine routes are
 * unchanged.
 */
export { validMatchUp, validMatchUps } from '@Validators/validMatchUp';

// params-object queries, also matchUpGovernor
export { participantScheduledMatchUps } from '@Query/matchUps/participantScheduledMatchUps';
export { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
export { getMatchUpCheckInState } from '@Query/matchUp/getMatchUpCheckInState';
export { calculateMatchUpMargin } from '@Query/matchUp/calculateMatchUpMargin';
export { getHomeParticipantId } from '@Query/matchUp/getHomeParticipantId';
export { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
export { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
export { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
export { getMatchUpType } from '@Query/matchUp/getMatchUpType';
export { getDualIssues } from '@Query/matchUp/getDualIssues';
export { filterMatchUps } from '@Query/filterMatchUps';

// params-object queries, also scheduleGovernor
export { matchUpScheduleLocked } from '@Query/matchUp/isScheduleLocked';
export { courtGridRows } from '@Helpers/scheduling/courtGridRows';
