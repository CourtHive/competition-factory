/**
 * From what a draft reports to what the factory's `setMatchUpStatus` reads: the canonical `outcome` a host sends
 * (to CFS's executionQueue, or to an engine) for a score-entry draft.
 *
 * CA, 2026-10-08: *"Shouldn't the new score entry modal be built in such a way that it cleanly
 * understands and integrates with the factory setMatchUpStatus method?"* It should. The mapping lives here, with
 * the draft; courthive-components' dialog applies it on Submit, and a host hands the result on as its `outcome`.
 *
 * Every line is a MEASURED difference between the two shapes (2026-10-01 against factory 7.4.0, re-measured
 * 2026-10-05 against 7.5.0; pinned by `src/tests/scoreEntryState/engineOutcome.test.ts` against `setMatchUpStatus`):
 *
 *   - the engine reads `outcome.score.sets`, `winningSide`, `matchUpStatus`, `matchUpStatusCodes` and
 *     `matchUpFormat`, and nothing else; the card's `score` STRING is refused outright, and `sets` at the
 *     top level are ignored (a winner is recorded with NO score);
 *   - a reason travels as a POSITIONAL `matchUpStatusCodes` array: the side that did not win, at its
 *     index, for a single exit; both for a double exit; index 0 for an ending that resolves nobody;
 *   - it is sent only when a reason was chosen, because an empty array BLANKS the codes and a played
 *     result with no reason must not erase one a previous edit recorded;
 *   - a clear is `{ score: { sets: [] }, matchUpStatusCodes: [] }`: `{}` or `{ cleared: true }` leaves the
 *     stale score standing as IN_PROGRESS, and the codes survive a clear unless blanked;
 *   - a format chosen through the chip rides along as `matchUpFormat`, which the engine persists once it
 *     accepts the result; otherwise the change is lost.
 *
 * `setMatchUpStatus` MUTATES the outcome it is handed (it writes the derived score strings into it), so a
 * host that logs or reuses what it sent should pass a copy.
 */
import { isDoubleExitStatus } from './irregularEnding';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ScoreEntrySet } from './types';

/** What a draft reports on Submit (`submission`), with the entered sets added. */
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
  matchUpStatusCodes?: string[];
  score: { sets: ScoreEntrySet[] };
};

export function toEngineOutcome(outcome: ReportedOutcome, matchUpFormat?: string): EngineOutcome {
  if (outcome.cleared) {
    // Measured: `{}` leaves the stale score as IN_PROGRESS, and codes survive a clear unless blanked.
    return { score: { sets: [] }, matchUpStatusCodes: [] };
  }
  const codes = positionalCodes(outcome);
  return {
    // a played result names its winner and no ending; the engine would derive COMPLETED, and a host
    // reading what it sent should not have to know that
    matchUpStatus: outcome.matchUpStatus ?? (outcome.winningSide ? COMPLETED : undefined),
    winningSide: outcome.winningSide,
    score: { sets: outcome.sets ?? [] },
    ...(matchUpFormat ? { matchUpFormat } : {}),
    ...(codes ? { matchUpStatusCodes: codes } : {}),
  };
}

/**
 * The positional array the engine reads a reason from.
 *
 * A single exit: the side that did NOT win, at its index. A double exit: both. An ending that resolves
 * nobody: index 0, since there is no side — the engine files that one as `matchUpStatusCode`.
 */
export function positionalCodes({ reasonCode, matchUpStatus, winningSide }: ReportedOutcome): string[] | undefined {
  if (!reasonCode) return undefined;
  if (isDoubleExitStatus(matchUpStatus)) return [reasonCode, reasonCode];
  if (winningSide === 1) return ['', reasonCode];
  return [reasonCode];
}
