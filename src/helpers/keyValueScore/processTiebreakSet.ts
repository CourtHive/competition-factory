import { getHighTiebreakValue, testTiebreakEntry } from './keyValueUtilities';
import { tiebreakMargin } from '@Tools/scoring/scoringUtilities';
import { ensureInt } from '@Tools/ensureInt';

import { MATCH_TIEBREAK_BRACKETS, MATCH_TIEBREAK_JOINER } from './constants';

export function processTiebreakSet({ analysis, auto, lowSide, scoreString = '', sets, value }) {
  let updated, info;
  const {
    tiebreakSet: { tiebreakTo, NoAD },
  } = analysis.setFormat;

  const [open] = MATCH_TIEBREAK_BRACKETS.split('');
  if (!analysis.isMatchTiebreakEntry) {
    scoreString += open;
  }

  const tiebreakSet = sets[analysis.setNumber - 1];
  if (!tiebreakSet) {
    const highValue = getHighTiebreakValue({
      lowValue: ensureInt(value || 0),
      tiebreakTo,
      NoAD,
    });
    const setScores = [ensureInt(value), highValue];
    if (lowSide === 2) setScores.reverse();
    const set = {
      side1TiebreakScore: setScores[0],
      side2TiebreakScore: setScores[1],
      setNumber: sets?.length + 1 || 1,
    };
    sets.push(set);
    scoreString += setScores.join(MATCH_TIEBREAK_JOINER);
    updated = true;
  } else {
    // if not auto-calculating high scores add new value at the end of string
    const { lastOpenBracketIndex } = testTiebreakEntry({
      brackets: MATCH_TIEBREAK_BRACKETS,
      scoreString,
    });
    const matchTiebreakScoreString = scoreString.slice((lastOpenBracketIndex ?? 0) + 1) + (auto ? '' : value);
    const matchTiebreakScores = matchTiebreakScoreString.split(MATCH_TIEBREAK_JOINER);
    const lowSideLength = matchTiebreakScores[lowSide - 1]?.length || 0;

    if (lowSideLength >= 2) {
      // don't allow tiebreak scores to have more than two digits
      info = 'tiebreak digit limit';
    } else if (auto) {
      if (lowSide === 1) matchTiebreakScores[0] = (matchTiebreakScores[0] || '') + value;
      if (lowSide === 2) matchTiebreakScores[1] = (matchTiebreakScores[1] || '') + value;
      const setScores = [matchTiebreakScores[0] || 0, matchTiebreakScores[1] || 0].map((s) => ensureInt(s));
      const highIndex = lowSide === 1 ? 1 : 0;
      setScores[highIndex] = setScores[1 - highIndex] + tiebreakMargin(tiebreakTo, NoAD);
      if (setScores[highIndex] < tiebreakTo) setScores[highIndex] = tiebreakTo;

      const lastSet = sets[sets.length - 1];
      lastSet.side1TiebreakScore = setScores[0];
      lastSet.side2TiebreakScore = setScores[1];

      scoreString = scoreString.slice(0, (lastOpenBracketIndex ?? 0) + 1);
      scoreString += setScores.join(MATCH_TIEBREAK_JOINER);
      updated = true;
    } else {
      const setScores = [matchTiebreakScores[0] || 0, matchTiebreakScores[1] || 0].map((s) => ensureInt(s));

      const lastSet = sets[sets.length - 1];
      lastSet.side1TiebreakScore = setScores[0];
      lastSet.side2TiebreakScore = setScores[1];

      scoreString += value;
      updated = true;
    }
  }

  return { info, scoreString, sets, updated };
}
