import { getWinningSide } from './winningSide';

import { SPACE_CHARACTER, SET_TIEBREAK_BRACKETS, SCORE_JOINER } from './constants';

export function keyValueSetScore({ analysis, lowSide, scoreString, value }) {
  const { setTo, tiebreakAt, tiebreakFormat, noTiebreak, winBy } = analysis?.setFormat ?? {};
  // an advantage set never opens a tiebreak and is won by two clear games (or its declared `winBy`);
  // this opened "7-6(" for a low 6 in `SET1-S:6` and completed a 4 to a 6 under `S:5WB1` (2026-10-02)
  const formatHasTiebreak = !noTiebreak && !!(tiebreakFormat || typeof tiebreakAt === 'number');
  const margin = winBy ?? 2;
  const needsTiebreak = formatHasTiebreak && value === parseInt(tiebreakAt || setTo);

  if (tiebreakAt && tiebreakAt < setTo && value > tiebreakAt) return { scoreString };
  if (formatHasTiebreak && value > setTo) return { scoreString };

  const highValue = getHighSetValue();
  const setScores = [value, highValue];
  if (lowSide === 2) setScores.reverse();

  const brackets = SET_TIEBREAK_BRACKETS;
  const open = brackets.split('')[0];
  const addition = setScores.join(SCORE_JOINER) + (needsTiebreak ? open : SPACE_CHARACTER);
  scoreString = (scoreString || '') + addition;

  const set: any = {
    side1Score: setScores[0],
    side2Score: setScores[1],
  };
  const winningSide = getWinningSide({ analysis, set });
  set.winningSide = winningSide || undefined;

  return { scoreString, set };

  function getHighSetValue() {
    if (needsTiebreak) return value + 1;
    if (!formatHasTiebreak && value >= setTo - 1) return value + margin;
    if (value + 1 === setTo) {
      return value + margin;
    }
    return setTo;
  }
}
