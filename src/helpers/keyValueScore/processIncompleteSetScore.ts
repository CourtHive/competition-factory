import { tiebreakSetGames, isTiebreakGamesScore } from '@Query/matchUp/tiebreakAtRules';
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

  // A pair is a score the format can reach when the lower side is at most the tiebreak games and the
  // higher side at most what that lower side allows: the tiebreak winner's games once the lower side
  // has reached the tiebreak, otherwise first to setTo or two clear games. Wherever the format puts
  // its tiebreak — `@5`, `@6`, `@12` — the same rule (2026-10-02, validator debate G1).
  const format = { setTo, tiebreakAt: tiebreakAt ?? setTo, winBy };
  const games = tiebreakSetGames(format)!;
  const low = Math.min(side1Score, value);
  const high = Math.max(side1Score, value);
  const highest = low >= games.loser ? games.winner : Math.max(setTo, low + (winBy ?? 2));
  validSide2Score = low <= games.loser && high <= highest;

  if (validSide2Score) {
    requiresTiebreak = isTiebreakGamesScore(high, low, format);
  }

  return { validSide2Score, requiresTiebreak };
}
