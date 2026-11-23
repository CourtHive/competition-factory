import { finalSetGoverns, unlevelDeciderRefusal } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { formatForSet } from '@Helpers/matchUpFormatCode/setRules/tiebreakSetShape';
import { getHighTiebreakValue } from '@Helpers/matchUpFormatCode/setRules/setComplement';
import { INVALID_MATCHUP_FORMAT, INVALID_SCORE, MISSING_MATCHUP_FORMAT } from '@Constants/errorConditionConstants';
import { validateSetScore } from '@Scoring/analysis/validateMatchUpScore';
import { setPlayedAfterDecision } from '@Scoring/analysis/setCount';
import { parseScoreString as parseLenient } from './parseScoreString';
import { parse, type SetFormat } from '@Helpers/matchUpFormatCode/parse';

type Options = { matchUpFormat?: string; strict?: boolean; tiebreakTo?: number };
type Sets = ReturnType<typeof parseLenient>;
type Refusal = {
  error: typeof MISSING_MATCHUP_FORMAT | typeof INVALID_MATCHUP_FORMAT | typeof INVALID_SCORE;
  reason: 'FORMAT_REQUIRED' | 'INVALID_FORMAT' | 'INVALID_SYNTAX' | 'INVALID_SET_SCORE' | 'INVALID_SET_SEQUENCE';
  info: string;
  setNumber?: number;
};

const games = /^(\d+)(?:\((\d+)\))?-(\d+)(?:\((\d+)\)|\[(\d+)-(\d+)\])?$/;
const points = /^\[(\d+)-(\d+)\]$/;

function winner(left: number, right: number) {
  if (left === right) return undefined;
  return left > right ? 1 : 2;
}

// Read every digit before deriving a missing tiebreak complement. The lenient parser accepts partial
// tokens and its two-digit input helper can truncate long tiebreaks.
function readSet(token: string, setNumber: number, format?: SetFormat): Sets[number] | undefined {
  const bracket = points.exec(token);
  if (bracket) {
    if (!format?.tiebreakSet) return undefined;
    const left = Number(bracket[1]);
    const right = Number(bracket[2]);
    return {
      setNumber,
      side1Score: undefined,
      side2Score: undefined,
      side1TiebreakScore: left,
      side2TiebreakScore: right,
      winningSide: winner(left, right),
      tiebreakSet: true,
      ...(format.tiebreakSet.tiebreakTo === 1 && { NoAD: true }),
    };
  }

  const match = games.exec(token);
  if (!match) return undefined;
  const [, left, leftLow, right, tailLow, tbLeft, tbRight] = match;
  const side1Score = Number(left);
  const side2Score = Number(right);
  let winningSide = winner(side1Score, side2Score);
  let side1TiebreakScore = tbLeft === undefined ? undefined : Number(tbLeft);
  let side2TiebreakScore = tbRight === undefined ? undefined : Number(tbRight);
  if (tbLeft !== undefined && !format?.tiebreakFormat) return undefined;
  if (leftLow !== undefined || tailLow !== undefined) {
    if (leftLow !== undefined && (tailLow !== undefined || tbLeft !== undefined || winningSide !== 2)) return undefined;
    if (!winningSide || !format?.tiebreakFormat) return undefined;
    const lowValue = Number(leftLow ?? tailLow);
    const { tiebreakTo, NoAD } = format.tiebreakFormat;
    const highValue = getHighTiebreakValue({ lowValue, tiebreakTo, NoAD });
    side1TiebreakScore = winningSide === 1 ? highValue : lowValue;
    side2TiebreakScore = winningSide === 2 ? highValue : lowValue;
  }
  if (!winningSide && format?.timed && side1TiebreakScore !== undefined && side2TiebreakScore !== undefined) {
    winningSide = winner(side1TiebreakScore, side2TiebreakScore);
  }
  return { setNumber, side1Score, side2Score, side1TiebreakScore, side2TiebreakScore, winningSide };
}

export function parseScoreString(scoreString: string, options?: Options & { strict?: false }): Sets;
// eslint-disable-next-line no-redeclare -- TypeScript overload for callers selecting strict parsing
export function parseScoreString(scoreString: string, options: Options): Sets | Refusal;
// eslint-disable-next-line no-redeclare -- overload implementation
export function parseScoreString(scoreString: string, options: Options = {}): Sets | Refusal {
  const { matchUpFormat } = options;
  if (!options.strict) return parseLenient({ scoreString, matchUpFormat, tiebreakTo: options.tiebreakTo });
  if (matchUpFormat === undefined || matchUpFormat === null || matchUpFormat === '') {
    return {
      error: MISSING_MATCHUP_FORMAT,
      reason: 'FORMAT_REQUIRED',
      info: 'Strict parsing requires a matchUpFormat',
    };
  }
  const parsed = typeof matchUpFormat === 'string' && parse(matchUpFormat);
  if (!parsed) return { error: INVALID_MATCHUP_FORMAT, reason: 'INVALID_FORMAT', info: 'Unrecognized matchUpFormat' };
  if (typeof scoreString !== 'string' || !scoreString.trim()) {
    return { error: INVALID_SCORE, reason: 'INVALID_SYNTAX', info: 'Expected a score string containing a set' };
  }

  const sets: Sets = [];
  for (const token of scoreString.trim().split(/\s+/)) {
    const setNumber = sets.length + 1;
    const set = readSet(token, setNumber, formatForSet(parsed, setNumber));
    if (
      !set ||
      ![set.side1Score, set.side2Score, set.side1TiebreakScore, set.side2TiebreakScore].every(
        (value) => value === undefined || Number.isSafeInteger(value),
      )
    ) {
      return {
        error: INVALID_SCORE,
        reason: 'INVALID_SYNTAX',
        setNumber,
        info: 'Expected a complete numeric set token',
      };
    }
    const deciding = finalSetGoverns(parsed, setNumber, parsed.bestOf === setNumber);
    const verdict = validateSetScore(set, matchUpFormat, deciding, false);
    if (!verdict.isValid) {
      return { error: INVALID_SCORE, reason: 'INVALID_SET_SCORE', setNumber, info: verdict.error! };
    }
    sets.push(set);
  }

  const sequence = setPlayedAfterDecision(sets, matchUpFormat) ?? unlevelDeciderRefusal(parsed, sets);
  return sequence ? { error: INVALID_SCORE, reason: 'INVALID_SET_SEQUENCE', info: sequence } : sets;
}
