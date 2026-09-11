/**
 * Validate matchUp score against matchUpFormat
 *
 * PROTOTYPE: This logic will be moved to tods-competition-factory
 * Currently implemented in TMX for testing and refinement before factory integration
 */
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

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

  // NoAD tiebreaks require win by 1, regular tiebreaks require win by 2
  const requiredWinBy = NoAD ? 1 : 2;

  if (scoreDiff < requiredWinBy) {
    return {
      isValid: false,
      error: NoAD
        ? `Tiebreak-only set (NoAD) must be won by at least 1 point, got ${winnerScore}-${loserScore}`
        : `Tiebreak-only set must be won by at least 2 points, got ${winnerScore}-${loserScore}`,
    };
  }

  // For NoAD tiebreaks, winner just needs to reach tiebreakTo
  if (NoAD) {
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
  const expectedWinnerScore = tiebreakAt === setTo ? setTo + 1 : setTo;
  const expectedLoserScore = tiebreakAt;

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
  if (tbDiff < 2) {
    return {
      isValid: false,
      error: `Tiebreak must be won by 2 points, got ${tbWinnerScore}-${tbLoserScore}`,
    };
  }
  if (tbLoserScore >= tbTo - 1 && tbDiff > 2) {
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

  const isTiebreakWon = tiebreakAt && winnerScore === setTo && loserScore === tiebreakAt && scoreDiff === 1;

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
    const maxWinnerScore = tiebreakAt === setTo ? setTo + 1 : setTo;
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

function validateIncompleteSet(
  winnerScore: number,
  loserScore: number,
  setTo: number | undefined,
): { isValid: boolean; error?: string } {
  if (setTo && (winnerScore > setTo + 10 || loserScore > setTo + 10)) {
    return {
      isValid: false,
      error: `Set score ${winnerScore}-${loserScore} exceeds expected range for ${setTo}-game sets`,
    };
  }
  return { isValid: true };
}

function validateRegularSet(
  scores: { side1: number; side2: number; winner: number; loser: number; diff: number },
  setFormat: { setTo: number | undefined; tiebreakAt: number | undefined; winBy?: number },
  allowIncomplete: boolean | undefined,
): { isValid: boolean; error?: string } {
  const { side1: side1Score, side2: side2Score, winner: winnerScore, loser: loserScore, diff: scoreDiff } = scores;
  const { setTo, tiebreakAt, winBy } = setFormat;
  if (setTo && tiebreakAt) {
    const marginValidation = validateTwoGameMargin(side1Score, side2Score, setTo, tiebreakAt);
    if (!marginValidation.isValid) return marginValidation;
  }

  if (allowIncomplete) {
    return validateIncompleteSet(winnerScore, loserScore, setTo);
  }

  if (setTo) {
    return validateRegularSetCompletion(winnerScore, loserScore, scoreDiff, setTo, tiebreakAt, winBy);
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
  if (setFormat.timed) {
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

  const { setTo, tiebreakAt, tiebreakFormat, tiebreakSet } = setFormat;

  const tiebreakSetTo = tiebreakSet?.tiebreakTo;
  const isTiebreakOnlyFormat = !!tiebreakSetTo && !setTo;

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
  const isImplicitTiebreak = setTo && winnerScore === setTo + 1 && loserScore === setTo;
  const hasTiebreak = hasExplicitTiebreak || isImplicitTiebreak;

  if (hasTiebreak) {
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
    { setTo, tiebreakAt, winBy: setFormat.winBy },
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
  if (!sets || sets.length === 0) {
    return { isValid: true }; // Empty is valid (not an error, just incomplete)
  }

  // Parse matchUpFormat once
  const bestOfMatch = matchUpFormat?.match(/SET(\d+)/)?.[1];
  const bestOfSets = bestOfMatch ? Number.parseInt(bestOfMatch) : 3;

  // Check if this is an irregular ending (allows incomplete scores)
  const isIrregularEnding = [RETIRED, WALKOVER, DEFAULTED].includes(matchUpStatus || '');

  // Validate each set against matchUpFormat
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];

    // Check if this specific set is the deciding set (last possible set in the match)
    const isDecidingSet = i + 1 === bestOfSets;

    // Allow incomplete scores when:
    // 1. matchUpStatus is undefined AND set has no winningSide (in progress, not claiming completion)
    // 2. matchUpStatus is an irregular ending (RETIRED, WALKOVER, DEFAULTED)
    const setHasWinner = set.winningSide !== undefined;
    const matchInProgress = matchUpStatus === undefined;
    const allowIncomplete = isIrregularEnding || (matchInProgress && !setHasWinner);

    const setValidation = validateSetScore(set, matchUpFormat, isDecidingSet, allowIncomplete);

    if (!setValidation.isValid) {
      return {
        isValid: false,
        error: `Set ${i + 1}: ${setValidation.error}`,
      };
    }
  }

  return { isValid: true };
}
