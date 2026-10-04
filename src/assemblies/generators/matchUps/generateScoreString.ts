import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isNumeric } from '@Tools/math';

// constants and types
import { ErrorType, MISSING_VALUE } from '@Constants/errorConditionConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import {
  ABANDONED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  SUSPENDED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

type GenerateScoreString = {
  addOutcomeString?: boolean;
  autoComplete?: boolean;
  matchUpStatus?: MatchUpStatusUnion;
  matchUpFormat?: string;
  winnerFirst?: boolean;
  winningSide?: number;
  setTBlast?: boolean; // when true, the tiebreak score always appears last in set score string; when false, the tiebreak score is listed in parentheses after the losing set score
  reversed?: boolean;
  sets: any;
};
export function generateScoreString(
  params: GenerateScoreString,
): string | { error?: ErrorType; info?: ErrorType | string } {
  const {
    winnerFirst = true,
    setTBlast = true,
    addOutcomeString,
    reversed = false,
    matchUpStatus,
    matchUpFormat,
    autoComplete,
    winningSide,
    sets,
  } = params;

  if (!sets) return { error: MISSING_VALUE, info: 'missing sets' };

  const parsedFormat: any = matchUpFormat && parse(matchUpFormat);
  const { bestOf, finalSetFormat, setFormat } = parsedFormat ?? {};

  const scoresInSideOrder = !winnerFirst || !winningSide || winningSide === 1;
  const reverseScores = reversed || !scoresInSideOrder;

  const outcomeString = addOutcomeString ? getOutcomeString({ matchUpStatus }) : '';

  const setScores =
    sets
      ?.sort(setSort)
      .map(setString)
      .filter(Boolean) // handle situation where there are multiple empty set objects
      .join(' ') || '';

  if (!outcomeString) return setScores;
  if (winningSide === 2) return `${outcomeString} ${setScores}`;
  return `${setScores} ${outcomeString}`;

  function setString(currentSet) {
    const isFinalSet = bestOf && currentSet.setNumber === bestOf;
    const format = isFinalSet && finalSetFormat ? finalSetFormat : setFormat;
    const hasGameScores = (set) => isNumeric(set?.side1Score) || isNumeric(set?.side2Score);
    const hasTiebreakScores = (set) => isNumeric(set?.side1TiebreakScore) || isNumeric(set?.side2TiebreakScore);

    const tbscores = hasTiebreakScores(currentSet);
    const isTiebreakSet = format?.tiebreakSet || (!hasGameScores(currentSet) && tbscores);

    const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore } = currentSet;

    const t1 = side1TiebreakScore || (isNumeric(side1TiebreakScore) || (tbscores && autoComplete) ? 0 : '');
    const t2 = side2TiebreakScore || (isNumeric(side2TiebreakScore) || (tbscores && autoComplete) ? 0 : '');

    if (isTiebreakSet) {
      // For tiebreak-only sets (TB10), check if scores are in side1Score/side2Score or tiebreak scores
      // If game scores exist and no tiebreak scores, use game scores (these are actually tiebreak points)
      const useGameScores = hasGameScores(currentSet) && !tbscores;
      const score1 = useGameScores ? side1Score : t1;
      const score2 = useGameScores ? side2Score : t2;
      const tiebreakScore = reverseScores ? [score2, score1] : [score1, score2];
      return `[${tiebreakScore.join('-')}]`;
    }

    const lowTiebreakScore = tbscores ? Math.min(t1, t2) : '';
    const lowTiebreakSide = lowTiebreakScore === t1 ? 1 : 2;
    const tiebreak = isNumeric(lowTiebreakScore) ? `(${lowTiebreakScore})` : '';

    const s1 = side1Score || (isNumeric(side1Score) || autoComplete ? 0 : '');
    const s2 = side2Score || (isNumeric(side2Score) || autoComplete ? 0 : '');

    const includeTiebreak = (sideNumber) => (!setTBlast && lowTiebreakSide === sideNumber ? tiebreak : '');
    const ss1 = `${s1}${includeTiebreak(1)}`;
    const ss2 = `${s2}${includeTiebreak(2)}`;

    const tbLast = setTBlast && tbscores ? `(${lowTiebreakScore})` : '';
    let scoreString = reverseScores ? `${[ss2, ss1].join('-')}${tbLast}` : `${[ss1, ss2].join('-')}${tbLast}`;

    if (['-', ' '].includes(scoreString)) scoreString = '';
    return scoreString;
  }
}

function getOutcomeString({ matchUpStatus }) {
  const outcomeStrings = {
    [RETIRED]: 'RET',
    [WALKOVER]: 'WO',
    [DOUBLE_DEFAULT]: 'DF/DF',
    [DOUBLE_WALKOVER]: 'WO/WO',
    [SUSPENDED]: 'SUS',
    [ABANDONED]: 'ABN',
    [DEFAULTED]: 'DEF',
    [DEAD_RUBBER]: 'DR',
  };

  return (matchUpStatus && outcomeStrings[matchUpStatus]) || '';
}

function setSort(a, b) {
  return a.setNumber - b.setNumber;
}
