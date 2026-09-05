import { getTiebreakComplement } from '@Query/matchUp/getComplement';
import { parse } from '@Helpers/matchUpFormatCode/parse';

type ParseScoreArgs = {
  scoreString: string;
  tiebreakTo?: number;
  matchUpFormat?: string;
};

type ParsedSetString = {
  winningSide: number | undefined;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  side1Score?: number;
  side2Score?: number;
  setNumber: number;
  NoAD?: boolean;
  tiebreakSet?: boolean;
};

type ParseSetArgs = {
  setNumber: number;
  set: string;
};

function determineWinningSide(score1: number, score2: number): number | undefined {
  return (score1 > score2 && 1) || (score1 < score2 && 2) || undefined;
}

function parseTiebreakOnlySet(bracketedScores: number[], isTiebreakOnlyFormat: boolean): Partial<ParsedSetString> {
  if (isTiebreakOnlyFormat) {
    return {
      side1Score: bracketedScores[0],
      side2Score: bracketedScores[1],
      winningSide: determineWinningSide(bracketedScores[0], bracketedScores[1]),
    };
  }

  return {
    side1TiebreakScore: bracketedScores[0],
    side2TiebreakScore: bracketedScores[1],
    winningSide: determineWinningSide(bracketedScores[0], bracketedScores[1]),
  };
}

// utility function just to allow testing with string score entry
export function parseScoreString({ tiebreakTo = 7, scoreString = '', matchUpFormat }: ParseScoreArgs) {
  // Parse matchUpFormat to check for tiebreak-only sets
  let parsedFormat: any;
  let bestOfSets = 3;
  if (matchUpFormat) {
    try {
      parsedFormat = parse(matchUpFormat);
      const bestOfMatch = /SET(\d+)/.exec(matchUpFormat)?.[1];
      bestOfSets = bestOfMatch ? Number.parseInt(bestOfMatch) : 3;
    } catch {
      // Ignore parse errors
    }
  }

  return scoreString
    ?.split(' ')
    .filter(Boolean)
    .map((set, index) => parseSet({ set, setNumber: index + 1 }));

  function checkIsTiebreakOnlyFormat(setNumber: number, isTiebreakOnlySet: boolean): boolean {
    if (!parsedFormat || !isTiebreakOnlySet) return false;

    const isDecidingSet = setNumber === bestOfSets;
    const setFormat =
      isDecidingSet && parsedFormat.finalSetFormat ? parsedFormat.finalSetFormat : parsedFormat.setFormat;

    if (!setFormat) return false;

    const tiebreakSetTo = setFormat.tiebreakSet?.tiebreakTo;
    const regularSetTo = setFormat.setTo;
    return !!tiebreakSetTo && !regularSetTo;
  }

  function getTiebreakToForSet(setNumber: number): number {
    if (!parsedFormat) return tiebreakTo;

    const isDecidingSet = setNumber === bestOfSets;
    const setFormat =
      isDecidingSet && parsedFormat.finalSetFormat ? parsedFormat.finalSetFormat : parsedFormat.setFormat;

    // For tiebreak-only sets, check tiebreakSet.tiebreakTo first
    return setFormat?.tiebreakSet?.tiebreakTo ?? setFormat?.tiebreakFormat?.tiebreakTo ?? tiebreakTo;
  }

  function parseTiebreakGame(
    tiebreakMatch: RegExpExecArray,
    winningSide: number | undefined,
    setNumber: number,
  ): [number | undefined, number | undefined] {
    const setTiebreakLowScore = tiebreakMatch[1];
    const setSpecificTiebreakTo = getTiebreakToForSet(setNumber);

    const side1TiebreakPerspective = getTiebreakComplement({
      lowValue: setTiebreakLowScore,
      isSide1: winningSide === 2,
      tiebreakTo: setSpecificTiebreakTo,
    });

    if (Array.isArray(side1TiebreakPerspective)) {
      return [side1TiebreakPerspective[0], side1TiebreakPerspective[1]];
    }

    return [undefined, undefined];
  }

  function parseRegularSet(
    set: string,
    tiebreak: RegExpExecArray | null,
    bracketed: RegExpExecArray | null,
    setNumber: number,
  ): Partial<ParsedSetString> {
    const setString = (tiebreak && set.replace(tiebreak[0], '')) || (bracketed && set.replace(bracketed[0], '')) || set;
    const setScores = setString.split('-').map((score) => Number.parseInt(score));
    const side1Score = setScores[0];
    const side2Score = setScores[1];
    const winningSide = determineWinningSide(side1Score, side2Score);

    let side1TiebreakScore: number | undefined;
    let side2TiebreakScore: number | undefined;

    if (tiebreak) {
      [side1TiebreakScore, side2TiebreakScore] = parseTiebreakGame(tiebreak, winningSide, setNumber);
    }

    if (bracketed) {
      const matchTiebreakScores = bracketed[1].split('-').map((score) => Number.parseInt(score));
      side1TiebreakScore = matchTiebreakScores[0];
      side2TiebreakScore = matchTiebreakScores[1];
    }

    return {
      side1Score,
      side2Score,
      side1TiebreakScore,
      side2TiebreakScore,
      winningSide,
    };
  }

  function parseSet({ set, setNumber }: ParseSetArgs): ParsedSetString {
    const inParentheses = /\(([^)]+)\)/;

    const inBrackets = /\[([^\]]+)\]/;
    const tiebreak = inParentheses.exec(set);
    const bracketed = inBrackets.exec(set);

    const isTiebreakOnlySet = set?.startsWith('[') && bracketed;
    const isTiebreakOnlyFormat = checkIsTiebreakOnlyFormat(setNumber, !!isTiebreakOnlySet);

    // Check if this is a TB1 format (tiebreakTo = 1, which means NoAD)
    const setSpecificTiebreakTo = getTiebreakToForSet(setNumber);
    const isNoAD = isTiebreakOnlyFormat && setSpecificTiebreakTo === 1;

    let result: Partial<ParsedSetString>;

    if (isTiebreakOnlySet) {
      const bracketedScores = bracketed[1].split('-').map((score) => Number.parseInt(score));
      result = parseTiebreakOnlySet(bracketedScores, isTiebreakOnlyFormat);
    } else {
      result = parseRegularSet(set, tiebreak, bracketed, setNumber);
    }

    return {
      side1Score: result.side1Score,
      side2Score: result.side2Score,
      side1TiebreakScore: result.side1TiebreakScore,
      side2TiebreakScore: result.side2TiebreakScore,
      winningSide: result.winningSide,
      setNumber,
      ...(isNoAD && { NoAD: true }),
      ...(isTiebreakOnlyFormat && { tiebreakSet: true }),
    };
  }
}
