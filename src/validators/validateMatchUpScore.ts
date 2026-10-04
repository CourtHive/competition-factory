/**
 * Validate matchUp score against matchUpFormat
 *
 * PROTOTYPE: This logic will be moved to tods-competition-factory
 * Currently implemented in TMX for testing and refinement before factory integration
 */
import { tiebreakSetGames, isTiebreakGamesScore, tiebreakSetCeiling } from '@Query/matchUp/tiebreakAtRules';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { isTiebreakMarker } from '@Query/matchUp/tiebreakSetShape';
import { getMaxSetScore } from '@Query/matchUp/getComplement';
import { timedSetWinnerContradicts } from './timedSetWinner';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { setPlayedAfterDecision } from './setCount';
import { isMatchUpStatus } from './isMatchUpStatus';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Helper functions to reduce cognitive complexity
 */
function validateTiebreakOnlySet(
  winnerScore: number,
  loserScore: number,
  scoreDiff: number,
  tiebreakSetTo: number,
  allowIncomplete: boolean,
  NoAD: boolean = false,
): { isValid: boolean; error?: string } {
  if (allowIncomplete) {
    return { isValid: true };
  }

  if (winnerScore === 0 && loserScore === 0) {
    return { isValid: false, error: 'Tiebreak-only set requires both scores' };
  }

  if (winnerScore < tiebreakSetTo) {
    return {
      isValid: false,
      error: `Tiebreak-only set winner must reach at least ${tiebreakSetTo}, got ${winnerScore}`,
    };
  }

  // ── The margin cannot exceed the target ──
  //
  // A no-ad tiebreak is won by one; an ordinary one by two — EXCEPT where the target itself is one. A
  // `F:TB1` decider is the sudden-death point an aggregate timed format settles a tie with, and `1-0` is
  // the only score it can have; measured 2026-09-30, this refused it with "must be won by at least 2
  // points" while `checkSetIsComplete` (since #5049) accepted it. The cap below is the same one it uses,
  // so the validator and the analysis agree about the one set that can only ever be won by one.
  const requiredWinBy = NoAD ? 1 : Math.min(2, tiebreakSetTo);

  if (scoreDiff < requiredWinBy) {
    return {
      isValid: false,
      error: NoAD
        ? `Tiebreak-only set (NoAD) must be won by at least 1 point, got ${winnerScore}-${loserScore}`
        : `Tiebreak-only set must be won by at least ${requiredWinBy} point${requiredWinBy === 1 ? '' : 's'}, got ${winnerScore}-${loserScore}`,
    };
  }

  // Won by one — no-ad, or a target of one — the winner just needs to reach tiebreakTo.
  if (requiredWinBy === 1) {
    return { isValid: true };
  }

  // For regular tiebreaks, check win-by-2 rules
  if (winnerScore === tiebreakSetTo && loserScore > tiebreakSetTo - 2) {
    return {
      isValid: false,
      error: `Tiebreak-only set at ${tiebreakSetTo}-${loserScore} requires playing past ${tiebreakSetTo}`,
    };
  }

  if (winnerScore > tiebreakSetTo && scoreDiff !== 2) {
    return {
      isValid: false,
      error: `Tiebreak-only set past ${tiebreakSetTo} must be won by exactly 2 points, got ${winnerScore}-${loserScore}`,
    };
  }

  return { isValid: true };
}

function validateTiebreakSetGames(
  winnerScore: number,
  loserScore: number,
  setTo: number,
  tiebreakAt: number,
): { isValid: boolean; error?: string } {
  // 7-6 for `@6`, 6-5 for `@5`, 13-12 for `@12` — see `tiebreakAtRules`
  const games = tiebreakSetGames({ setTo, tiebreakAt });
  const expectedWinnerScore = games?.winner ?? setTo + 1;
  const expectedLoserScore = games?.loser ?? tiebreakAt;

  if (winnerScore !== expectedWinnerScore) {
    return {
      isValid: false,
      error: `Tiebreak set winner must have ${expectedWinnerScore} games, got ${winnerScore}`,
    };
  }
  if (loserScore !== expectedLoserScore) {
    return {
      isValid: false,
      error: `Tiebreak set loser must have ${expectedLoserScore} games, got ${loserScore}`,
    };
  }
  return { isValid: true };
}

function validateExplicitTiebreakScore(
  side1TiebreakScore: number,
  side2TiebreakScore: number,
  tiebreakFormat: any,
): { isValid: boolean; error?: string } {
  const tbWinnerScore = Math.max(side1TiebreakScore || 0, side2TiebreakScore || 0);
  const tbLoserScore = Math.min(side1TiebreakScore || 0, side2TiebreakScore || 0);
  const tbDiff = tbWinnerScore - tbLoserScore;
  const tbTo = tiebreakFormat.tiebreakTo || 7;

  if (tbWinnerScore < tbTo) {
    return {
      isValid: false,
      error: `Tiebreak winner must reach ${tbTo} points, got ${tbWinnerScore}`,
    };
  }
  // A no-ad tiebreak is won by one at the target — the ITF's short-set tiebreak (first to five, deciding
  // point at four-all), Fast4's, World TeamTennis's nine-pointer. This demanded two from every tiebreak
  // and refused all of them, including the mocks' own 5-4 under `TB5NOAD@5` (measured 2026-10-01).
  const requiredWinBy = tiebreakFormat.NoAD ? 1 : 2;
  if (tbDiff < requiredWinBy) {
    return {
      isValid: false,
      error: `Tiebreak must be won by ${requiredWinBy} point${requiredWinBy === 1 ? '' : 's'}, got ${tbWinnerScore}-${tbLoserScore}`,
    };
  }
  if (tbLoserScore >= tbTo - 1 && tbDiff > requiredWinBy) {
    return {
      isValid: false,
      error: `Tiebreak score ${tbWinnerScore}-${tbLoserScore} is invalid`,
    };
  }
  return { isValid: true };
}

function validateTwoGameMargin(
  side1Score: number,
  side2Score: number,
  setTo: number,
  tiebreakAt: number | undefined,
): { isValid: boolean; error?: string } {
  if (!tiebreakAt) return { isValid: true };

  if (side1Score === setTo + 1 && side2Score < setTo - 1) {
    return {
      isValid: false,
      error: `With tiebreak format, if side 1 has ${setTo + 1} games, side 2 must be at least ${setTo - 1}, got ${side2Score}`,
    };
  }
  if (side2Score === setTo + 1 && side1Score < setTo - 1) {
    return {
      isValid: false,
      error: `With tiebreak format, if side 2 has ${setTo + 1} games, side 1 must be at least ${setTo - 1}, got ${side1Score}`,
    };
  }
  return { isValid: true };
}

function validateRegularSetCompletion(
  winnerScore: number,
  loserScore: number,
  scoreDiff: number,
  setTo: number,
  tiebreakAt: number | undefined,
  winBy: number = 2,
): { isValid: boolean; error?: string } {
  if (winnerScore < setTo) {
    return {
      isValid: false,
      error: `Set winner must reach ${setTo} games, got ${winnerScore}`,
    };
  }

  const isTiebreakWon = !!tiebreakAt && isTiebreakGamesScore(winnerScore, loserScore, { setTo, tiebreakAt });

  if (scoreDiff < winBy && !isTiebreakWon) {
    return {
      isValid: false,
      error: `Set must be won by at least ${winBy} game${winBy === 1 ? '' : 's'}, got ${winnerScore}-${loserScore}`,
    };
  }

  if (tiebreakAt) {
    if (loserScore >= tiebreakAt && !isTiebreakWon) {
      return {
        isValid: false,
        error: `When tied at ${tiebreakAt}-${tiebreakAt}, must play tiebreak. Use format like ${tiebreakAt + 1}-${tiebreakAt}(5)`,
      };
    }
    const maxWinnerScore = tiebreakSetCeiling({ setTo, tiebreakAt }) ?? setTo + 1;
    if (winnerScore > maxWinnerScore) {
      return {
        isValid: false,
        error: `With tiebreak format, set score cannot exceed ${maxWinnerScore}-${tiebreakAt}. Got ${winnerScore}-${loserScore}`,
      };
    }
  } else if (winnerScore > setTo + 10) {
    return {
      isValid: false,
      error: `Set score ${winnerScore}-${loserScore} exceeds reasonable limits`,
    };
  }

  return { isValid: true };
}

function parseSetScores(
  set: any,
  isTiebreakOnlyFormat: boolean,
  hasTiebreakScores: boolean,
): { side1Score: number; side2Score: number; side1TiebreakScore: number; side2TiebreakScore: number } {
  const side1TiebreakScore = set.side1TiebreakScore;
  const side2TiebreakScore = set.side2TiebreakScore;
  const side1Score = isTiebreakOnlyFormat && hasTiebreakScores ? side1TiebreakScore : set.side1Score || set.side1 || 0;
  const side2Score = isTiebreakOnlyFormat && hasTiebreakScores ? side2TiebreakScore : set.side2Score || set.side2 || 0;

  return { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore };
}

/**
 * The side that won the set on games must also hold the higher tiebreak points.
 *
 * ── A validator that read the pair side-blind ──
 *
 * Everything else in this file works from `winnerScore` / `loserScore`, the max and min of the games,
 * so which SIDE held which never entered into it — and `validateExplicitTiebreakScore` reads the points
 * the same way. A `7-6` whose set winner took 3 tiebreak points to the loser's 7 therefore passed:
 * measured 2026-09-30, `validateSetScore` and `validateMatchUpScore` both answered valid, while
 * `analyzeSet` given the winning side answered "winningSide tiebreak value is not high" and
 * `checkSetIsComplete` answered false. The validators had skipped the one check the analysis makes.
 *
 * Found from `courthive-components`, whose score-entry card had to hand-check it: the card showed the
 * lower points against the set winner and would have recorded the pair as typed.
 *
 * Only a contradiction is refused. A tied pair is left to `validateExplicitTiebreakScore`, which rejects
 * it with the margin message; level games say nothing about who should hold the points.
 */
function validateTiebreakWinner(
  side1Score: number,
  side2Score: number,
  side1TiebreakScore: number | undefined,
  side2TiebreakScore: number | undefined,
): { isValid: boolean; error?: string } | undefined {
  if (side1TiebreakScore === undefined || side2TiebreakScore === undefined) return undefined;
  if (side1Score === side2Score || side1TiebreakScore === side2TiebreakScore) return undefined;

  const gamesWinner = side1Score > side2Score ? 1 : 2;
  const pointsWinner = side1TiebreakScore > side2TiebreakScore ? 1 : 2;
  if (gamesWinner === pointsWinner) return undefined;

  return { isValid: false, error: `Set winner must win the tiebreak: side ${gamesWinner} won the set` };
}

function validateTiebreakSet(
  winnerScore: number,
  loserScore: number,
  setTo: number,
  tiebreakAt: number,
  side1TiebreakScore: number,
  side2TiebreakScore: number,
  tiebreakFormat: any,
): { isValid: boolean; error?: string } {
  if (setTo && tiebreakAt) {
    const validation = validateTiebreakSetGames(winnerScore, loserScore, setTo, tiebreakAt);
    if (!validation.isValid) return validation;
  }

  const hasExplicitTiebreak = side1TiebreakScore !== undefined || side2TiebreakScore !== undefined;
  if (hasExplicitTiebreak && tiebreakFormat) {
    return validateExplicitTiebreakScore(side1TiebreakScore, side2TiebreakScore, tiebreakFormat);
  }

  return { isValid: true };
}

/**
 * An unfinished set: forgive the games not yet played, refuse the games that cannot be played.
 *
 * `allowIncomplete` says nothing about a CEILING. A set to six with a tiebreak at six cannot reach
 * eight games whether or not it has finished, so a score above the format's maximum is wrong at every
 * stage — and a score-entry interface asking this question as the operator types needs to be told so.
 *
 * This used a slack of `setTo + 10`, which accepted a 9-4 in a set to six and a 6-4 in a set to four.
 * The slack existed because the true ceiling was not computable here; `getMaxSetScore` computes it,
 * and returns `undefined` exactly where no ceiling exists — a timed set, an advantage set, a match
 * tiebreak. Where it has no opinion the old slack still applies, because an advantage set really can
 * run to 24-22 and refusing that would be the worse error.
 *
 * `opponentScore` is deliberately NOT passed. It would tighten the ceiling to `setTo` for a side whose
 * opponent is below `setTo` — true of a FINISHED set, since 7-3 is unreachable — but this function
 * also sees a set mid-entry, where one cell holds a 7 and the other is still empty and reads as 0.
 * Tightening there would fire an error at the moment the second value is being typed.
 */
function validateIncompleteSet(
  winnerScore: number,
  loserScore: number,
  setFormat: { setTo: number | undefined; tiebreakAt?: number; NoAD?: boolean; winBy?: number },
): { isValid: boolean; error?: string } {
  const { NoAD, setTo, tiebreakAt, winBy } = setFormat;
  if (!setTo) return { isValid: true };

  const ceiling = getMaxSetScore({ NoAD, setTo, tiebreakAt, winBy }) ?? setTo + 10;

  if (winnerScore > ceiling || loserScore > ceiling) {
    return {
      isValid: false,
      error: `Set score ${winnerScore}-${loserScore} exceeds expected range for ${setTo}-game sets`,
    };
  }
  return { isValid: true };
}

function validateRegularSet(
  scores: { side1: number; side2: number; winner: number; loser: number; diff: number },
  setFormat: { setTo: number | undefined; tiebreakAt: number | undefined; NoAD?: boolean; winBy?: number },
  allowIncomplete: boolean | undefined,
): { isValid: boolean; error?: string } {
  const { side1: side1Score, side2: side2Score, winner: winnerScore, loser: loserScore, diff: scoreDiff } = scores;
  const { setTo, tiebreakAt, winBy } = setFormat;
  if (setTo && tiebreakAt) {
    const marginValidation = validateTwoGameMargin(side1Score, side2Score, setTo, tiebreakAt);
    if (!marginValidation.isValid) return marginValidation;
  }

  if (allowIncomplete) {
    return validateIncompleteSet(winnerScore, loserScore, setFormat);
  }

  if (setTo) {
    return validateRegularSetCompletion(winnerScore, loserScore, scoreDiff, setTo, tiebreakAt, winBy);
  }

  return { isValid: true };
}

/** A timed set: a completed one needs a score, and a tied points-based one its tiebreak. */
function validateTimedSet(set: any, setFormat: any, allowIncomplete?: boolean): { isValid: boolean; error?: string } {
  if (timedSetWinnerContradicts(set)) return { isValid: false, error: 'Timed set winner contradicts the set score' };
  // For timed sets, just validate that scores exist if set is complete
  if (!allowIncomplete) {
    const side1Score = set.side1Score ?? 0;
    const side2Score = set.side2Score ?? 0;

    // At least one side should have a score for completed timed set
    if (side1Score === 0 && side2Score === 0) {
      return { isValid: false, error: 'Timed set requires at least one side to have scored' };
    }

    // For points-based (not aggregate), tied scores need tiebreak if format specifies
    if (setFormat.based === 'P' && side1Score === side2Score && side1Score > 0 && setFormat.tiebreakFormat) {
      const hasTiebreak = set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined;
      if (!hasTiebreak) {
        return { isValid: false, error: 'Tied timed set requires tiebreak' };
      }
    }
    // For aggregate (match-level A), tied individual sets are fine - winner determined by total aggregate
  }
  return { isValid: true };
}

/** The 1-0 marker must name the same winner as the set, where the set names one. */
function validateTiebreakMarker(set: any): { isValid: boolean; error?: string } {
  const markerWinner = set.side1Score === 1 ? 1 : 2;
  if (set.winningSide !== undefined && set.winningSide !== markerWinner) {
    return { isValid: false, error: 'Tiebreak set marker contradicts the set winner' };
  }
  return { isValid: true };
}

/**
 * Validate a single set score against matchUpFormat rules
 */
export function validateSetScore(
  set: any,
  matchUpFormat?: string,
  isDecidingSet?: boolean,
  allowIncomplete?: boolean,
): { isValid: boolean; error?: string } {
  if (!matchUpFormat) return { isValid: true };

  const parsed = parse(matchUpFormat);
  if (!parsed) return { isValid: true };

  const setFormat = isDecidingSet && parsed.finalSetFormat ? parsed.finalSetFormat : parsed.setFormat;
  if (!setFormat) return { isValid: true };

  // Handle timed sets (based: 'P'/'G' or timed: true)
  if (setFormat.timed) return validateTimedSet(set, setFormat, allowIncomplete);

  const { setTo, tiebreakAt, tiebreakFormat, tiebreakSet } = setFormat;

  const tiebreakSetTo = tiebreakSet?.tiebreakTo;
  const isTiebreakOnlyFormat = !!tiebreakSetTo && !setTo;

  // The 1-0 marker alone records a finished tiebreak set whose points were not kept (CA, V11)
  if (isTiebreakOnlyFormat && isTiebreakMarker(set, setFormat)) return validateTiebreakMarker(set);

  const hasTiebreakScores = set.side1TiebreakScore !== undefined && set.side2TiebreakScore !== undefined;
  const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore } = parseSetScores(
    set,
    isTiebreakOnlyFormat,
    hasTiebreakScores,
  );

  const winnerScore = Math.max(side1Score, side2Score);
  const loserScore = Math.min(side1Score, side2Score);
  const scoreDiff = winnerScore - loserScore;

  if (isTiebreakOnlyFormat) {
    // Check NoAD from the set object first (set by parseScoreString), fall back to format
    const NoAD = set.NoAD ?? setFormat.tiebreakSet?.NoAD ?? false;
    return validateTiebreakOnlySet(winnerScore, loserScore, scoreDiff, tiebreakSetTo, allowIncomplete ?? false, NoAD);
  }

  const hasExplicitTiebreak = side1TiebreakScore !== undefined || side2TiebreakScore !== undefined;
  // Only a format that HAS a tiebreak can have played one. This read a 7-6 as an implicit tiebreak and
  // then skipped every tiebreak check because the format carried no `tiebreakAt` — so `7-6(5)` was a
  // valid set in `SET1-S:6`, an advantage set, and `retainScoreForFormat` kept it across a change of
  // format (measured 2026-10-02). `parse` writes `noTiebreak` for such a set; a hand-built format with
  // neither tiebreak field reads the same way.
  const formatHasTiebreak = !setFormat.noTiebreak && !!(tiebreakFormat || typeof tiebreakAt === 'number');
  if (hasExplicitTiebreak && !formatHasTiebreak) {
    return { isValid: false, error: 'Tiebreak scores recorded for a set whose format has no tiebreak' };
  }
  const isImplicitTiebreak = formatHasTiebreak && setTo && winnerScore === setTo + 1 && loserScore === setTo;
  const hasTiebreak = hasExplicitTiebreak || isImplicitTiebreak;

  if (hasTiebreak) {
    const contradiction = validateTiebreakWinner(side1Score, side2Score, side1TiebreakScore, side2TiebreakScore);
    if (contradiction) return contradiction;

    return validateTiebreakSet(
      winnerScore,
      loserScore,
      setTo,
      tiebreakAt,
      side1TiebreakScore,
      side2TiebreakScore,
      tiebreakFormat,
    );
  }

  return validateRegularSet(
    { side1: side1Score, side2: side2Score, winner: winnerScore, loser: loserScore, diff: scoreDiff },
    { setTo, tiebreakAt, NoAD: setFormat.NoAD, winBy: setFormat.winBy },
    allowIncomplete,
  );
}

/**
 * Validate all sets in a score against matchUpFormat
 */
export function validateMatchUpScore(
  sets: any[],
  matchUpFormat?: string,
  matchUpStatus?: string,
): { isValid: boolean; error?: string } {
  if (matchUpStatus !== undefined && !isMatchUpStatus(matchUpStatus)) {
    return { isValid: false, error: `Unknown matchUpStatus: ${matchUpStatus}` };
  }
  if (!sets || sets.length === 0) {
    return { isValid: true }; // Empty is valid (not an error, just incomplete)
  }

  // Parse matchUpFormat once
  const bestOfMatch = matchUpFormat?.match(/SET(\d+)/)?.[1];
  const bestOfSets = bestOfMatch ? Number.parseInt(bestOfMatch) : 3;

  // ── Only the LAST set may be unfinished ──
  //
  // An irregular ending allowed EVERY set to be unfinished, so `4-2 6-3 1-0` RETIRED was valid here
  // while the engine — which since the completeness rule asks every set before the last to be finished —
  // refuses it. Score-entry dialogs gate Submit on this function, so the operator saw a live button and
  // then a refusal. Play only moves to the next set once the previous one ends, so the rule is the
  // engine's: every set before the last is finished; the last may be open unless the match is COMPLETED.
  //
  // With NO status the old reading stands for the last set — open while it names no winner — because a
  // dialog asks this as the operator types. A status other than COMPLETED (RETIRED, DEFAULTED,
  // IN_PROGRESS, SUSPENDED …) leaves the last set open even when it names one: `parseScoreString` gives
  // every set to the side ahead in it, so a typed `6-3 2-1` retirement arrives with set 2 "won".
  const matchInProgress = matchUpStatus === undefined;
  const lastSetMayBeOpen = !matchInProgress && matchUpStatus !== COMPLETED;

  // Validate each set against matchUpFormat
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];

    // Check if this specific set is the deciding set (last possible set in the match)
    const isDecidingSet = finalSetGoverns(parse(matchUpFormat ?? ''), i + 1, i + 1 === bestOfSets);
    const isLastSet = i === sets.length - 1;

    const setHasWinner = set.winningSide !== undefined;
    const allowIncomplete = isLastSet && (lastSetMayBeOpen || (matchInProgress && !setHasWinner));

    const setValidation = validateSetScore(set, matchUpFormat, isDecidingSet, allowIncomplete);

    if (!setValidation.isValid) {
      return {
        isValid: false,
        error: `Set ${i + 1}: ${setValidation.error}`,
      };
    }
  }

  // No set after the one that decided a best-of match, and no more sets than it plays (X2) — the same
  // answer the engine gives, so a dialog gating Submit here does not offer what the engine refuses
  const afterDecision = setPlayedAfterDecision(sets, matchUpFormat);
  if (afterDecision) return { isValid: false, error: afterDecision };

  // An `exactly` format is COMPLETED only once every set is played — the engine's `analyzeScore` refuses
  // fewer, and a dialog gating Submit here must not offer it
  const exactly = parse(matchUpFormat ?? '')?.exactly;
  if (exactly && matchUpStatus === COMPLETED && sets.length < exactly) {
    return { isValid: false, error: `exactly ${exactly} sets are played; ${sets.length} recorded` };
  }

  return { isValid: true };
}
