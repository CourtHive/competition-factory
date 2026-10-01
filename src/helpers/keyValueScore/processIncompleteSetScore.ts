import { getWinningSide } from './winningSide';
import { ensureInt } from '@Tools/ensureInt';

import { SPACE_CHARACTER, SET_TIEBREAK_BRACKETS } from './constants';

export function processIncompleteSetScore({ analysis, scoreString, sets, value }) {
  let updated;

  if (!sets?.length) return { sets: [] };

  const set = sets[sets.length - 1];
  value = ensureInt(value);
  const { validSide2Score, requiresTiebreak } = checkValidSide2Score({
    analysis,
    set,
    value,
  });

  if (validSide2Score) {
    updated = true;
    scoreString = (scoreString || '') + value;
    set.side2Score = value;

    const winningSide = getWinningSide({
      analysis,
      set: sets[sets.length - 1],
    });
    set.winningSide = winningSide || undefined;

    if (requiresTiebreak) {
      const open = SET_TIEBREAK_BRACKETS.split('')[0];
      scoreString += open;
    } else if (!analysis.isDecidingSet) {
      scoreString += SPACE_CHARACTER;
    }
  }

  return { sets, scoreString, updated };
}

type CheckValidSide2ScoreArgs = {
  analysis: any;
  value: any;
  set: any;
};
function checkValidSide2Score({ analysis, set = {}, value }: CheckValidSide2ScoreArgs) {
  const setFormat =
    (analysis.isDecidingSet && analysis.matchUpScoringFormat.finalSetFormat) || analysis.matchUpScoringFormat.setFormat;
  const { tiebreakAt, setTo, tiebreakFormat, noTiebreak, winBy } = setFormat;
  const { side1Score } = set;

  let validSide2Score, requiresTiebreak;

  // an advantage set: any score the set could still be at, or could have ended at, and never a tiebreak
  const formatHasTiebreak = !noTiebreak && !!(tiebreakFormat || typeof tiebreakAt === 'number');
  if (!formatHasTiebreak) {
    const margin = winBy ?? 2;
    const validSide2 = value <= Math.max(side1Score, setTo - 1) + margin;
    return { validSide2Score: validSide2, requiresTiebreak: false };
  }

  if (tiebreakAt && tiebreakAt < setTo) {
    if (side1Score === tiebreakAt) {
      validSide2Score = value <= setTo;
    } else {
      validSide2Score = value <= tiebreakAt;
    }
  } else if (side1Score === setTo || side1Score === setTo - 1) {
    // no-advantage games do not shorten the set: the same pairs are valid with or without `NoAD`
    validSide2Score = value <= setTo + 1;
  } else if (side1Score === setTo + 1) {
    validSide2Score = value === setTo || value === setTo - 1;
  } else {
    validSide2Score = value <= setTo;
  }

  if (validSide2Score) {
    if (tiebreakAt && tiebreakAt < setTo) {
      requiresTiebreak =
        (side1Score === setTo && value === tiebreakAt) || (side1Score === tiebreakAt && value === setTo);
    } else {
      requiresTiebreak = side1Score >= setTo && value >= setTo && side1Score !== value;
    }
  }

  return { validSide2Score, requiresTiebreak };
}
