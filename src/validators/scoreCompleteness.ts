import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { setPlayedAfterDecision } from '@Validators/setCount';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { MatchUpStatusUnion, Set as SetType } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

type ScoreCompletenessArgs = {
  matchUpStatus?: MatchUpStatusUnion;
  matchUpFormat?: string;
  winningSide?: number;
  sets: SetType[];
};

/**
 * A score that says a set was played must say a set that COULD be played.
 *
 * ── Bounds were the only question the write path asked ──
 *
 * `validateScore` → `analyzeScore` asks whether any set EXCEEDS what the format allows, and whether the
 * winner named is the winner the set counts produce. It never asked whether a set was finished, so under
 * `SET3-S:6/TB7` the engine recorded `3-7 6-4 6-4` and `4-2 2-6 2-6` as COMPLETED (measured 2026-10-01).
 * CA: *"accepting 3-7 6-4 6-4 for a standard SET3-S:6/TB7 is unacceptable behavior!"* — ruled a fix to
 * validation, not a major release.
 *
 * ── The rule ──
 *
 * - Every set before the last is a FINISHED, legal set: a later set cannot start until it ends.
 * - The last set is finished too when the outcome claims completion — `COMPLETED`, or a `winningSide`
 *   with no status.
 * - Otherwise the last set may be unfinished (RETIRED, DEFAULTED, IN_PROGRESS, SUSPENDED, ABANDONED …),
 *   though never past the format's ceiling — EVEN IF it names a winner. `parseScoreString` gives every
 *   set to the side ahead in it, so a retirement typed as `6-3 2-1` arrives with set 2 "won" by side 1;
 *   TMX builds free-text outcomes that way, and holding that set to finished refused every such
 *   retirement (measured 2026-10-02, the authored retirement scenario).
 *
 * Each set is asked of `validateSetScore`, the same answer the score-entry dialog gates its Submit on.
 * No format, no opinion: a record that declares no format is not checked here.
 *
 * Callers that must record a score the format cannot produce — an import, a migration, a correction to
 * history — pass `disableScoreValidation`, which skips this with the rest of score validation.
 */
export function checkScoreCompleteness({ matchUpFormat, matchUpStatus, winningSide, sets }: ScoreCompletenessArgs): {
  isComplete: boolean;
  info?: string;
} {
  if (!matchUpFormat || !sets?.length) return { isComplete: true };
  const parsed = parse(matchUpFormat);
  if (!parsed) return { isComplete: true };

  const maxSetNumber = parsed.bestOf ?? parsed.exactly;
  const claimsCompletion = matchUpStatus === COMPLETED || (!matchUpStatus && !!winningSide);

  for (let index = 0; index < sets.length; index++) {
    const set = sets[index];
    const setNumber = set?.setNumber ?? index + 1;
    const isLastSet = index === sets.length - 1;
    const mustBeFinished = !isLastSet || claimsCompletion;
    const isDecidingSet = finalSetGoverns(parsed, setNumber, !!maxSetNumber && setNumber === maxSetNumber);

    const { isValid, error } = validateSetScore(set, matchUpFormat, isDecidingSet, !mustBeFinished);
    if (!isValid) return { isComplete: false, info: `Set ${setNumber}: ${error}` };
  }

  // No set after the one that decided a best-of match, and no more sets than it plays (X2)
  const afterDecision = setPlayedAfterDecision(sets, matchUpFormat);
  if (afterDecision) return { isComplete: false, info: afterDecision };

  return { isComplete: true };
}
