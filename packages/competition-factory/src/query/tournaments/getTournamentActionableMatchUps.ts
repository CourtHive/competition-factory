import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// constants and types
import { BYE, completedMatchUpStatuses, IN_PROGRESS, SUSPENDED } from '@Constants/matchUpStatusConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

// Classifies every scoreable matchUp into decided / actionable / pending and reports
// whether the tournament is *effectively complete* — i.e. nothing is left to score.
//
// This is looser than the strict roll-up in getTournamentCompleteness (which requires
// every position assigned + every matchUp played):
//   - decided    — has a winningSide, or a terminal completedMatchUpStatus
//                  (COMPLETED / RETIRED / WALKOVER / DEFAULTED / DOUBLE_* / ABANDONED /
//                  CANCELLED / DEAD_RUBBER). ABANDONED and CANCELLED count as decided.
//   - actionable — IN_PROGRESS / SUSPENDED, or readyToScore with no winner. These are the
//                  ONLY matchUps that can still be scored, so they block completion.
//   - pending    — not ready and not decided (waiting on upstream). A pending matchUp whose
//                  feeders are terminal-without-advancer (e.g. both abandoned) can never
//                  become ready, so it does NOT block completion.
//
// effectivelyComplete === (no actionable matchUps). This surfaces the "every ready-to-score
// matchUp was abandoned" case as complete, which strict completeness would not.

const COMPLETED = new Set<string>(completedMatchUpStatuses);
const ACTIONABLE_LIVE = new Set<string>([IN_PROGRESS, SUSPENDED]);

export type TournamentActionability = {
  effectivelyComplete: boolean;
  allDecided: boolean;
  counts: { total: number; decided: number; actionable: number; pending: number };
  actionableMatchUpIds: string[];
};

export function getTournamentActionableMatchUps(params: {
  tournamentRecord?: Tournament;
}): ResultType & Partial<TournamentActionability> {
  const { tournamentRecord } = params ?? {};
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord, inContext: true });

  let decided = 0;
  let actionable = 0;
  let pending = 0;
  const actionableMatchUpIds: string[] = [];

  for (const matchUp of matchUps) {
    const { matchUpStatus, winningSide, readyToScore, matchUpId } = matchUp;
    if (matchUpStatus === BYE) continue;

    if (winningSide || (matchUpStatus && COMPLETED.has(matchUpStatus))) {
      decided += 1;
    } else if ((matchUpStatus && ACTIONABLE_LIVE.has(matchUpStatus)) || readyToScore) {
      actionable += 1;
      actionableMatchUpIds.push(matchUpId);
    } else {
      pending += 1;
    }
  }

  const total = decided + actionable + pending;
  return {
    ...SUCCESS,
    effectivelyComplete: actionable === 0,
    allDecided: actionable === 0 && pending === 0,
    counts: { total, decided, actionable, pending },
    actionableMatchUpIds,
  };
}
