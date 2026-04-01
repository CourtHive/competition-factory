import { parse } from '@Helpers/matchUpFormatCode/parse';
import { arrayIndices } from '@Tools/arrays';

import {
  SET_TIEBREAK_BRACKETS,
  MATCH_TIEBREAK_BRACKETS,
  OUTCOMES,
  MATCH_TIEBREAK_JOINER,
  SPACE_CHARACTER,
  WINNING_STATUSES,
} from './constants';

export function addOutcome({ scoreString, lowSide, outcome }) {
  ({ scoreString } = removeOutcome({ scoreString }));

  if (lowSide === 2) {
    const lastScoreCharacter = scoreString?.[scoreString.length - 1];
    const spacer = lastScoreCharacter === SPACE_CHARACTER ? '' : SPACE_CHARACTER;
    return scoreString + spacer + outcome;
  } else {
    return outcome + SPACE_CHARACTER + scoreString;
  }
}

function removeOutcome({ scoreString }) {
  if (!scoreString) return { scoreString: '' };

  let removed = false;

  for (const outcome of OUTCOMES) {
    const index = scoreString?.indexOf(outcome);
    if (index === 0) {
      scoreString = scoreString.slice(outcome.length + 1).trim() + SPACE_CHARACTER;
    } else if (index > 0) {
      scoreString = scoreString.slice(0, index);
    }
    if (index >= 0) removed = true;
  }

  if (!scoreString?.trim()) scoreString = '';

  return { scoreString, removed };
}
type RemoveFromScoreArgs = {
  scoreString: string;
  lowSide?: number;
  analysis: any;
  sets: any[];
};
function processMatchTiebreakRemoval({
  newScore,
  scoreString,
  lastMatchTiebreakOpenBracketIndex,
  lastSet,
  lowSide,
  NoAD,
  tiebreakTo,
}) {
  const matchTiebreakScoreString = newScore.slice(lastMatchTiebreakOpenBracketIndex + 1);
  const splitScoreString = matchTiebreakScoreString.split(MATCH_TIEBREAK_JOINER);
  const side1TiebreakScore =
    (splitScoreString?.length > 0 &&
      splitScoreString[0] !== undefined &&
      !Number.isNaN(Number.parseInt(splitScoreString[0])) &&
      Number.parseInt(splitScoreString[0])) ||
    undefined;
  const side2TiebreakScore =
    (splitScoreString?.length > 1 &&
      splitScoreString[1] !== undefined &&
      !Number.isNaN(Number.parseInt(splitScoreString[1])) &&
      Number.parseInt(splitScoreString[1])) ||
    undefined;
  const matchTiebreakScores = [side1TiebreakScore, side2TiebreakScore];
  let isIncompleteScore = false;

  if (side2TiebreakScore) {
    const highIndex = lowSide === 1 ? 1 : 0;

    matchTiebreakScores[highIndex] = (matchTiebreakScores?.[1 - highIndex] || 0) + (NoAD ? 1 : 2);
    if ((matchTiebreakScores[highIndex] || 0) < tiebreakTo) matchTiebreakScores[highIndex] = tiebreakTo;

    newScore = scoreString.slice(0, lastMatchTiebreakOpenBracketIndex + 1);
    newScore += matchTiebreakScores.join(MATCH_TIEBREAK_JOINER);
  } else if (side1TiebreakScore === undefined) {
    newScore = scoreString.slice(0, lastMatchTiebreakOpenBracketIndex);
    isIncompleteScore = true;
  } else {
    newScore = scoreString.slice(0, lastMatchTiebreakOpenBracketIndex + 1);
    newScore += side1TiebreakScore;
  }

  lastSet.side1TiebreakScore = matchTiebreakScores[0] || 0;
  lastSet.side2TiebreakScore = matchTiebreakScores[1] || 0;

  return { newScore, isIncompleteScore };
}

function buildSetsForIncompleteScore({ lastSet, sets, analysis }) {
  const side1Score = lastSet.side1Score?.toString();
  if (side1Score) {
    const newSide1Score = side1Score?.slice(0, -1);
    lastSet.side1Score = (Number.parseInt(newSide1Score) && !Number.isNaN(Number.parseInt(newSide1Score))) || undefined;
    if (lastSet.side1Score === undefined) lastSet.side2Score = undefined;
  }
  let newSets;
  if (analysis.isTimedSet) {
    newSets = lastSet.side1Score ? sets : sets?.slice(0, -1) || [];
    newSets[sets.length - 1] = lastSet;
  } else {
    newSets = sets?.slice(0, -1) || [];
  }
  return newSets;
}

function buildSetsForRemainingNumbers({ lastSet, sets, analysis }) {
  const side2Score = lastSet.side2Score?.toString();
  const side1Score = lastSet.side1Score?.toString();
  if (!analysis.isTiebreakEntry && !analysis.isMatchTiebreak) {
    if (lastSet.side2Score) {
      const newSide2Score = side2Score?.slice(0, -1);
      lastSet.side2Score = (!isNaN(newSide2Score) && parseInt(newSide2Score)) || undefined;
    } else {
      const newSide1Score = side1Score?.slice(0, -1);
      lastSet.side1Score = (!isNaN(newSide1Score) && parseInt(newSide1Score)) || undefined;
    }
  }
  let newSets;
  if (analysis.isTimedSet) {
    if (lastSet.side1Score) {
      newSets = sets || [];
      newSets[sets.length - 1] = lastSet;
    } else {
      newSets = sets?.slice(0, sets.length - 1) || [];
    }
  } else {
    newSets = sets || [];
    newSets[sets.length - 1] = lastSet;
  }

  if (newSets[newSets.length - 1]) {
    Object.assign(newSets[newSets.length - 1], { winningSide: undefined });
  }
  return newSets;
}

export function removeFromScore({ analysis, scoreString, sets, lowSide }: RemoveFromScoreArgs): {
  outcomeRemoved?: boolean;
  scoreString?: string;
  sets?: any[];
} {
  let newScore, newSets;
  if (!scoreString) return { scoreString, sets };

  const { scoreString: outcomeRemoved, removed } = removeOutcome({
    scoreString,
  });
  scoreString = outcomeRemoved;
  if (removed) return { scoreString, sets, outcomeRemoved: true };

  let lastSet = sets.at(-1) || {};
  // Looking for the last set which has some values defined
  // setValues Count determines if there are any values other than setNumber
  const setValuesCount = Object.values(lastSet).filter((f) => f !== undefined).length;
  if (lastSet.setNumber && setValuesCount === 1) {
    sets = sets.slice(0, -1);
    lastSet = sets.at(-1) || {};
  }
  const { tiebreakSet } = analysis.setFormat;
  const { tiebreakTo, NoAD } = tiebreakSet || {};

  const { isTiebreakEntry: isMatchTiebreak } = testTiebreakEntry({
    brackets: MATCH_TIEBREAK_BRACKETS,
    scoreString,
  });

  const index = lastNumericIndex(scoreString);
  if (index >= 0) {
    newScore = scoreString.slice(0, index);
    const { isTiebreakEntry: openSetTiebreak } = testTiebreakEntry({
      brackets: SET_TIEBREAK_BRACKETS,
      scoreString: newScore,
    });
    const { lastOpenBracketIndex: lastMatchTiebreakOpenBracketIndex, isTiebreakEntry: openMatchTiebreak } =
      testTiebreakEntry({
        brackets: MATCH_TIEBREAK_BRACKETS,
        scoreString: newScore,
      });
    const lastNewScoreChar = newScore?.length ? newScore[newScore.length - 1].trim() : undefined;
    const remainingNumbers = newScore && !isNaN(lastNewScoreChar);
    let isIncompleteScore = analysis.isIncompleteSetScore;

    if (isMatchTiebreak && openMatchTiebreak) {
      ({ newScore, isIncompleteScore } = processMatchTiebreakRemoval({
        newScore,
        scoreString,
        lastMatchTiebreakOpenBracketIndex,
        lastSet,
        lowSide,
        NoAD,
        tiebreakTo,
      }));
    }

    if (!newScore.length) newScore = undefined;
    if (isIncompleteScore) {
      newSets = buildSetsForIncompleteScore({ lastSet, sets, analysis });
    } else if (remainingNumbers) {
      newSets = buildSetsForRemainingNumbers({ lastSet, sets, analysis });
    } else if (openSetTiebreak) {
      newSets = sets || [];
      Object.assign(newSets[newSets.length - 1] || {}, {
        winningSide: undefined,
        side1TiebreakScore: undefined,
        side2TiebreakScore: undefined,
      });
    } else {
      if (isMatchTiebreak && !openMatchTiebreak) {
        newSets = sets?.slice(0, -1) || [];
      } else {
        newSets = sets;
        newSets[sets.length - 1] = lastSet;
      }
      if (!isMatchTiebreak) {
        newSets[newSets.length - 1].side2Score = 0;
        newSets[newSets.length - 1].winningSide = undefined;
      }
    }

    return { scoreString: newScore, sets: newSets };
  }

  return { scoreString, sets };
}

export function testTiebreakEntry({ brackets = SET_TIEBREAK_BRACKETS, scoreString }) {
  if (!scoreString) return {};
  const [open, close] = brackets.split('');
  const splitScore = scoreString.split('');
  const lastOpenBracketIndex = Math.max(...arrayIndices(open, splitScore));
  const lastCloseBracketIndex = Math.max(...arrayIndices(close, splitScore));
  const isTiebreakEntry = lastOpenBracketIndex > lastCloseBracketIndex;
  return { isTiebreakEntry, lastOpenBracketIndex };
}

export function checkValidMatchTiebreak({ scoreString }) {
  if (!scoreString) return false;
  const lastScoreChar = scoreString?.[scoreString.length - 1].trim();
  const isNumericEnding = scoreString && !isNaN(lastScoreChar);

  const [open, close] = MATCH_TIEBREAK_BRACKETS.split('');
  const splitScore = scoreString.split('');
  const lastOpenBracketIndex = Math.max(...arrayIndices(open, splitScore));
  const lastCloseBracketIndex = Math.max(...arrayIndices(close, splitScore));
  const lastJoinerIndex = Math.max(...arrayIndices(MATCH_TIEBREAK_JOINER, splitScore));
  return isNumericEnding && lastOpenBracketIndex > lastCloseBracketIndex && lastJoinerIndex > lastOpenBracketIndex;
}

export function lastNumericIndex(str) {
  const arr = str.split('');
  const arrayIndices = arr.reduce((a, e, i) => {
    if (e.match(/\d+/g)) a.push(i);
    return a;
  }, []);
  return arrayIndices.pop();
}

export function getHighTiebreakValue(params?) {
  const { lowValue = 0, NoAD = false, tiebreakTo } = params || {};
  const winBy = NoAD ? 1 : 2;
  if (lowValue + 1 >= tiebreakTo) {
    return lowValue + winBy;
  }
  return parseInt(tiebreakTo);
}

export function getMatchUpWinner({ matchUpFormat, matchUpStatus, winningSide, sets }) {
  const matchUpScoringFormat: any = parse(matchUpFormat);
  const { bestOf } = matchUpScoringFormat;
  const scoreGoal = Math.ceil(bestOf / 2);
  const sideScores = sets?.reduce(
    (scores, set) => {
      const { winningSide } = set;
      if (winningSide) scores[winningSide - 1]++;
      return scores;
    },
    [0, 0],
  );

  let matchUpWinningSide = sideScores?.indexOf(scoreGoal) + 1 || undefined;
  if (WINNING_STATUSES.includes(matchUpStatus) && winningSide) {
    matchUpWinningSide = winningSide;
  }
  return { matchUpWinningSide };
}
