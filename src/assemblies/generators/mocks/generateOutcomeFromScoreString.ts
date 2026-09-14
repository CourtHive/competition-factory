import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { generateScoreString } from '@Generators/matchUps/generateScoreString';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { definedAttributes } from '@Tools/definedAttributes';
import { parseScoreString } from '@Tools/parseScoreString';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

function inferWinningSideFromAggregate(neutralParsedSets) {
  const aggregateTotals = neutralParsedSets.reduce(
    (totals: any, set: any) => {
      if (set.side1Score !== undefined || set.side2Score !== undefined) {
        totals.side1 += set.side1Score ?? 0;
        totals.side2 += set.side2Score ?? 0;
      }
      return totals;
    },
    { side1: 0, side2: 0 },
  );

  if (aggregateTotals.side1 > aggregateTotals.side2) return 1;
  if (aggregateTotals.side2 > aggregateTotals.side1) return 2;

  const tiebreakSet = neutralParsedSets.find(
    (set: any) => set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined,
  );
  return tiebreakSet?.winningSide;
}

function inferWinningSideFromSets(neutralParsedSets) {
  const setsWon = { side1: 0, side2: 0 };
  neutralParsedSets.forEach((set: any) => {
    if (set.winningSide === 1) setsWon.side1++;
    else if (set.winningSide === 2) setsWon.side2++;
  });

  if (setsWon.side1 > setsWon.side2) return 1;
  if (setsWon.side2 > setsWon.side1) return 2;
  return undefined;
}

function inferWinningSide(winningSide, matchUpFormat, neutralParsedSets) {
  if (winningSide || !matchUpFormat || !neutralParsedSets) return winningSide;

  const parsedFormat = parse(matchUpFormat);

  return isAggregateFormat(parsedFormat)
    ? inferWinningSideFromAggregate(neutralParsedSets)
    : inferWinningSideFromSets(neutralParsedSets);
}

function generateScoreForSideOrder(scoreString, matchUpFormat, setTBlast) {
  const sets = parseScoreString({ scoreString, matchUpFormat });
  return {
    sets,
    scoreStringSide1: generateScoreString({ sets, matchUpFormat, setTBlast }),
    scoreStringSide2: generateScoreString({ sets, reversed: true, matchUpFormat, setTBlast }),
  };
}

function generateScoreForWinnerOrder(neutralParsedSets, inferredWinningSide, matchUpFormat, setTBlast) {
  const winningScoreString = generateScoreString({ sets: neutralParsedSets, matchUpFormat, setTBlast });
  const losingScoreString = generateScoreString({ sets: neutralParsedSets, reversed: true, matchUpFormat, setTBlast });

  // Handle error cases from generateScoreString
  if (typeof winningScoreString !== 'string') return winningScoreString;
  if (typeof losingScoreString !== 'string') return losingScoreString;

  const scoreStringSide1 = inferredWinningSide === 2 ? losingScoreString : winningScoreString;
  const scoreStringSide2 = inferredWinningSide === 2 ? winningScoreString : losingScoreString;

  return {
    sets: parseScoreString({ scoreString: scoreStringSide1, matchUpFormat }),
    scoreStringSide1,
    scoreStringSide2,
  };
}

/**
 * Generates TODS score object from parseable score string
 */
export function generateOutcomeFromScoreString(params) {
  const { matchUpFormat, matchUpStatus, winningSide, scoreString, setTBlast, preserveSideOrder = false } = params;
  if (!scoreString)
    return {
      outcome: {
        ...toBePlayed,
        winningSide,
        matchUpStatus,
      },
    };
  if (winningSide && ![1, 2, undefined].includes(winningSide)) return { error: INVALID_VALUES, winningSide };

  const neutralParsedSets = scoreString && parseScoreString({ scoreString, matchUpFormat });
  const isBracketNotation = scoreString?.trim().startsWith('[');
  const inferredWinningSide = inferWinningSide(winningSide, matchUpFormat, neutralParsedSets);

  const parsedFormat = parse(matchUpFormat);

  const score =
    preserveSideOrder || isBracketNotation || isAggregateFormat(parsedFormat)
      ? generateScoreForSideOrder(scoreString, matchUpFormat, setTBlast)
      : generateScoreForWinnerOrder(neutralParsedSets, inferredWinningSide, matchUpFormat, setTBlast);

  return definedAttributes({
    outcome: {
      matchUpStatus,
      winningSide: inferredWinningSide,
      score,
    },
  });
}
