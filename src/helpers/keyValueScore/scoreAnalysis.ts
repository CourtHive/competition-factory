import { checkValidMatchTiebreak, testTiebreakEntry } from './keyValueUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { arrayIndices } from '@Tools/arrays';

import {
  SCORE_JOINER,
  MATCH_TIEBREAK_JOINER,
  OPENERS,
  CLOSERS,
  OUTCOMES,
  SPACE_KEY,
  SET_TIEBREAK_BRACKETS,
  MATCH_TIEBREAK_BRACKETS,
} from './constants';

export function getScoreAnalysis({ matchUpFormat, scoreString, winningSide, value, sets }) {
  const completedSets = sets?.filter((set) => set?.winningSide)?.length || 0;
  const setNumber = completedSets + (winningSide ? 0 : 1);

  const matchUpScoringFormat: any = parse(matchUpFormat);
  const isDecidingSet = setNumber === matchUpScoringFormat?.bestOf;
  const setFormat = (isDecidingSet && matchUpScoringFormat?.finalSetFormat) || (matchUpScoringFormat?.setFormat ?? {});
  const isTimedSet = setFormat?.timed;

  const finalSet = isDecidingSet && sets[matchUpScoringFormat?.bestOf - 1];
  const finalSetIsComplete = finalSet?.winningSide;

  const { isTiebreakEntry: isSetTiebreakEntry } = testTiebreakEntry({
    brackets: SET_TIEBREAK_BRACKETS,
    scoreString,
  });
  const { isTiebreakEntry: isMatchTiebreakEntry } = testTiebreakEntry({
    brackets: MATCH_TIEBREAK_BRACKETS,
    scoreString,
  });
  const isTiebreakEntry = isSetTiebreakEntry || isMatchTiebreakEntry;

  const isTiebreakSet = !!setFormat.tiebreakSet;
  const lastScoreChar = scoreString?.[scoreString.length - 1]?.trim();
  const isNumericEnding = scoreString && !isNaN(lastScoreChar);

  const isIncompleteSetScore = !isTiebreakEntry && lastScoreChar === SCORE_JOINER;
  const isIncompleteSetTiebreak = isSetTiebreakEntry && OPENERS.includes(lastScoreChar);
  const isIncompleteMatchTiebreak = isMatchTiebreakEntry && OPENERS.includes(lastScoreChar);
  const isPartialMatchTiebreakValue = isMatchTiebreakEntry && lastScoreChar === MATCH_TIEBREAK_JOINER;

  const splitScore = scoreString?.split('');
  const [open] = MATCH_TIEBREAK_BRACKETS.split('');
  const lastOpenBracketIndex = splitScore && Math.max(...arrayIndices(open, splitScore));
  const lastJoinerIndex = splitScore && Math.max(...arrayIndices(MATCH_TIEBREAK_JOINER, splitScore));
  const matchTiebreakHasJoiner = splitScore && lastJoinerIndex > lastOpenBracketIndex;

  const lastSetIsComplete = sets[sets.length - 1]?.winningSide;
  const isGameScoreEntry = sets?.length && !lastSetIsComplete;

  const hasOutcome = OUTCOMES.find((outcome) => scoreString?.indexOf(outcome) >= 0);

  const isNumericValue = !isNaN(value);

  const isSpace = value === SPACE_KEY;
  const isCloser = CLOSERS.includes(value);
  const hasOpener = scoreString?.split('').find((char) => OPENERS.includes(char));

  const isInvalidMatchTiebreakValue =
    isCloser &&
    isMatchTiebreakEntry &&
    !isIncompleteMatchTiebreak &&
    (isPartialMatchTiebreakValue || !checkValidMatchTiebreak({ scoreString }));

  const isInvalidSetTiebreakValue = isSpace && isTiebreakEntry && isIncompleteSetTiebreak;
  const isTiebreakCloser = isCloser && hasOpener && isTiebreakEntry && isNumericEnding;
  const isTiebreakSetValue = isTiebreakSet && isNumericValue;

  return {
    isTiebreakSetValue,
    matchUpScoringFormat,
    setNumber,
    setFormat,
    matchTiebreakHasJoiner,
    isGameScoreEntry,
    isSpace,
    isCloser,
    isTiebreakCloser,
    isDecidingSet,
    isTiebreakSet,
    isTimedSet,
    isNumericEnding,
    isNumericValue,
    hasOpener,
    hasOutcome,
    finalSet,
    finalSetIsComplete,
    lastSetIsComplete,
    isInvalidSetTiebreakValue,
    isInvalidMatchTiebreakValue,
    isTiebreakEntry,
    isSetTiebreakEntry,
    isMatchTiebreakEntry,

    isIncompleteSetScore,
    isIncompleteSetTiebreak,
    isIncompleteMatchTiebreak,
    isPartialMatchTiebreakValue,
  };
}
