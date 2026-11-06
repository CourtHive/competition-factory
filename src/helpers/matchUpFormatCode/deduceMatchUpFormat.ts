/**
 * Deduce matchUpFormat from a score string
 *
 * Uses tennis domain knowledge to infer the correct format code
 * from an observed score.
 *
 * @param scoreString - Score like "6-4 7-5" or "7-6(5) 6-4"
 * @returns Format code like "SET3-S:6/TB7" or "SET5-S:6/TB7-F:6"
 *
 * @example
 * deduceMatchUpFormat("6-4 6-2") // => "SET3-S:6/TB7"
 * deduceMatchUpFormat("7-6(5) 6-4") // => "SET3-S:6/TB7"
 * deduceMatchUpFormat("6-4 4-6 8-6") // => "SET5-S:6/TB7-F:6" (advantage final)
 * deduceMatchUpFormat("5-7 4-6 6-3 7-6(5) 8-6") // => "SET5-S:6/TB7-F:6"
 */
const DEFAULT_FORMAT = 'SET3-S:6/TB7';

export function deduceMatchUpFormat(scoreString: string): string {
  const setStrings = scoreString.split(/[\s,]+/).filter((s) => s.length > 0);

  if (setStrings.length === 0) {
    return DEFAULT_FORMAT;
  }

  const bestOf = deduceBestOf(setStrings.length);

  const matchTiebreakFormat = detectMatchTiebreak(setStrings, bestOf);
  if (matchTiebreakFormat) return matchTiebreakFormat;

  const setTo = deduceSetTo(setStrings);
  if (setTo === undefined) return DEFAULT_FORMAT;

  const finalSetAdvantage = detectFinalSetAdvantage(setStrings, setTo);

  return buildFormatString(bestOf, setTo, finalSetAdvantage);
}

function deduceBestOf(setCount: number): number {
  if (setCount === 1) return 1;
  if (setCount === 2) return 3;
  return 5;
}

function parseGameScores(setString: string): number[] {
  const gamesOnly = setString.replaceAll(/\([^)]*\)/g, '');
  return gamesOnly.match(/(\d+)/g)?.map((n) => Number.parseInt(n, 10)) ?? [];
}

function detectMatchTiebreak(setStrings: string[], bestOf: number): string | undefined {
  for (const set of setStrings) {
    const gameScores = parseGameScores(set);

    if (gameScores.length === 2) {
      const max = Math.max(...gameScores);
      const min = Math.min(...gameScores);
      const diff = max - min;

      if (max === 10 || (max > 10 && diff <= 2)) {
        return `SET${bestOf}-S:TB10`;
      }
    }
  }

  return undefined;
}

function deduceSetTo(setStrings: string[]): number | undefined {
  const setWithTiebreak = setStrings.find((set) => /\(/.test(set));

  if (setWithTiebreak) {
    return deduceSetToFromTiebreak(setWithTiebreak);
  }

  return deduceSetToFromGameScores(setStrings);
}

function deduceSetToFromTiebreak(setWithTiebreak: string): number | undefined {
  const gameScores = parseGameScores(setWithTiebreak);
  if (gameScores.length === 0) return undefined;

  const maxGames = Math.max(...gameScores);
  const minGames = Math.min(...gameScores);

  if (maxGames === minGames + 1) {
    return minGames;
  }

  return maxGames - 1;
}

function deduceSetToFromGameScores(setStrings: string[]): number | undefined {
  const allMaxScores: number[] = [];

  for (const set of setStrings) {
    const gameScores = parseGameScores(set);
    if (gameScores.length > 0) {
      allMaxScores.push(Math.max(...gameScores));
    }
  }

  if (allMaxScores.length === 0) return undefined;

  const overallMax = Math.max(...allMaxScores);

  if (overallMax >= 6) return 6;
  return overallMax;
}

function detectFinalSetAdvantage(setStrings: string[], setTo: number): boolean {
  if (setStrings.length < 3) return false;

  const lastSet = setStrings.at(-1);
  const gameScores = parseGameScores(lastSet!);

  if (gameScores.length !== 2) return false;

  const maxGames = Math.max(...gameScores);
  const minGames = Math.min(...gameScores);

  return maxGames > setTo + 1 && maxGames - minGames === 2;
}

function buildFormatString(bestOf: number, setTo: number, finalSetAdvantage: boolean): string {
  let baseFormat;
  if (setTo === 6) {
    baseFormat = `SET${bestOf}-S:6/TB7`;
  } else if (setTo === 4) {
    baseFormat = `SET${bestOf}-S:4/TB7`;
  } else {
    baseFormat = `SET${bestOf}-S:${setTo}/TB7`;
  }

  if (finalSetAdvantage) {
    baseFormat += `-F:${setTo}`;
  }

  return baseFormat;
}
