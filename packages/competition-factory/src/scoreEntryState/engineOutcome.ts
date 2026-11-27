/**
 * From what a score state reports to what the factory's `setMatchUpStatus` reads: the canonical `outcome` a host sends
 * (to CFS's executionQueue, or to an engine) for a score state.
 *
 * The score entry modal is built to understand and integrate cleanly with the factory's `setMatchUpStatus`.
 * The mapping lives here, with
 * the score state; courthive-components' dialog applies it on Submit, and a host hands the result on as its `outcome`.
 *
 * Every line is a MEASURED difference between the two shapes (2026-10-01 against factory 7.4.0, re-measured
 * 2026-10-05 against 7.5.0; pinned by `src/tests/scoreEntryState/engineOutcome.test.ts` against `setMatchUpStatus`):
 *
 *   - the engine reads `outcome.score.sets`, `winningSide`, `matchUpStatus`, `sideStatusCodes`,
 *     `matchUpStatusCode`, `clearStatusCodes` and `matchUpFormat`, and nothing else; the card's `score` STRING is
 *     refused outright, and `sets` at the top level are ignored (a winner is recorded with NO score);
 *   - a reason travels keyed: `sideStatusCodes` for the side that did not win a single exit, or both sides of a
 *     double exit; `matchUpStatusCode` for an ending that resolves nobody;
 *   - it is sent only when a reason was chosen: a result sent with no reason keeps the reason a previous edit
 *     recorded, where it still describes the result;
 *   - a clear is `{ score: { sets: [] }, clearStatusCodes: true }`: `{}` or `{ cleared: true }` leaves the
 *     stale score standing as IN_PROGRESS, and the explicit clear removes the reasons with it;
 *   - a format chosen through the chip rides along as `matchUpFormat`, which the engine persists once it
 *     accepts the result; otherwise the change is lost.
 *
 * `setMatchUpStatus` MUTATES the outcome it is handed (it writes the derived score strings into it), so a
 * host that logs or reuses what it sent should pass a copy.
 */
import { isDoubleExitStatus, requiresWinner } from './irregularEnding';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ScoreEntrySet } from './types';

/** What a score state reports on Submit (`submission`), with the entered sets added. */
export type ReportedOutcome = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  reasonCode?: string;
  score?: string;
  cleared?: boolean;
  sets?: ScoreEntrySet[];
};

/** The outcome in the shape `tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome })` reads. */
export type EngineOutcome = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  matchUpFormat?: string;
  sideStatusCodes?: Record<number, string>;
  matchUpStatusCode?: string;
  clearStatusCodes?: boolean;
  score: { sets: ScoreEntrySet[] };
};

export function toEngineOutcome(outcome: ReportedOutcome, matchUpFormat?: string): EngineOutcome {
  if (outcome.cleared) {
    // Measured: `{}` leaves the stale score as IN_PROGRESS; the explicit clear takes the reasons with the result.
    return { score: { sets: [] }, clearStatusCodes: true };
  }
  const reasons = keyedStatusCodes(outcome);
  return {
    // a played result names its winner and no ending; the engine would derive COMPLETED, and a host
    // reading what it sent should not have to know that
    matchUpStatus: outcome.matchUpStatus ?? (outcome.winningSide ? COMPLETED : undefined),
    winningSide: outcome.winningSide,
    score: { sets: outcome.sets ?? [] },
    ...(matchUpFormat ? { matchUpFormat } : {}),
    ...reasons,
  };
}

/**
 * The keyed reason the engine reads.
 *
 * A single exit: the side that did NOT win. A double exit: both. An ending that resolves nobody: the match
 * (`matchUpStatusCode`), since there is no side.
 */
export function keyedStatusCodes({
  reasonCode,
  matchUpStatus,
  winningSide,
}: ReportedOutcome): Pick<EngineOutcome, 'sideStatusCodes' | 'matchUpStatusCode'> | undefined {
  if (!reasonCode) return undefined;
  if (isDoubleExitStatus(matchUpStatus)) return { sideStatusCodes: { 1: reasonCode, 2: reasonCode } };
  if (requiresWinner(matchUpStatus) && (winningSide === 1 || winningSide === 2))
    return { sideStatusCodes: { [3 - winningSide]: reasonCode } };
  return { matchUpStatusCode: reasonCode };
}
