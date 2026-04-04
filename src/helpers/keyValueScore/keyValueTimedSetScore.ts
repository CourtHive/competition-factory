import { ensureInt } from '@Tools/ensureInt';
import { removeFromScore } from './keyValueUtilities';
import { processOutcome } from './processOutcome';

import { BACKSPACE, OUTCOMEKEYS, SCORE_JOINER, SPACE_KEY } from './constants';

export function keyValueTimedSetScore(params) {
  let { sets, info, scoreString, winningSide, matchUpStatus } = params;
  const { analysis, lowSide, value } = params;
  let updated, outcomeRemoved;
  if (!sets?.length && value !== BACKSPACE) sets = [{ setNumber: 1 }];
  const setIndex = sets.length - 1;

  if (OUTCOMEKEYS.includes(value)) {
    ({ sets, info, scoreString, winningSide, matchUpStatus, updated } = handleOutcomeKey({
      sets,
      info,
      scoreString,
      winningSide,
      matchUpStatus,
      analysis,
      lowSide,
      value,
    }));
  } else if (value === BACKSPACE) {
    ({ scoreString, sets, outcomeRemoved } = removeFromScore({
      analysis,
      scoreString,
      sets,
    }));
    ({ sets, scoreString, winningSide, matchUpStatus, updated } = handleBackspace({
      sets,
      scoreString,
      outcomeRemoved,
    }));
  } else if (analysis.hasOutcome) {
    info = 'has outcome';
  } else if (winningSide) {
    return {
      sets,
      scoreString,
      winningSide,
      matchUpStatus,
      updated: false,
      info: 'matchUp is complete',
    };
  } else if (value === SPACE_KEY) {
    ({ sets, scoreString, updated } = handleSpaceKey({ sets, scoreString, winningSide, analysis }));
  } else if (
    value === SCORE_JOINER &&
    sets[setIndex].side1Score !== undefined &&
    sets[setIndex].side2Score === undefined &&
    scoreString &&
    analysis.isNumericEnding
  ) {
    scoreString += '-';
    sets[setIndex].side2Score = 0;
    matchUpStatus = undefined;
    winningSide = undefined;
    updated = true;
  } else if (!Number.isNaN(Number(value))) {
    ({ sets, scoreString, updated } = handleNumericKey({ sets, setIndex, value, scoreString }));
  }

  return { sets, scoreString, winningSide, matchUpStatus, info, updated };
}

function handleOutcomeKey({ sets, info, scoreString, winningSide, matchUpStatus, analysis, lowSide, value }) {
  let updated;
  const lastSet = sets.at(-1) ?? {};
  const { side1Score, side2Score } = lastSet;
  if (side1Score && !side2Score) {
    info = 'missing side2Score';
  } else if (analysis.finalSetIsComplete || winningSide) {
    info = 'final set is already complete';
  } else if (analysis.isIncompleteSetScore) {
    info = 'incomplete set scoreString';
  } else {
    ({ sets, scoreString, winningSide, matchUpStatus, updated } = processOutcome({
      lowSide,
      value,
      sets,
      scoreString,
      matchUpStatus,
      winningSide,
    }));
  }
  return { sets, info, scoreString, winningSide, matchUpStatus, updated };
}

function handleBackspace({ sets, scoreString, outcomeRemoved }) {
  let updatedScoreString = scoreString;
  let updatedSets = sets;

  if (updatedScoreString?.trim() === '') {
    updatedScoreString = updatedScoreString.trim();
  }
  if (!updatedScoreString) updatedSets = [];

  if (outcomeRemoved) {
    const lastSet = updatedSets.at(-1) ?? {};
    const { side1Score, side2Score } = lastSet;
    if (side1Score && side2Score) {
      const setWinner = (side1Score > side2Score && 1) || (side2Score > side1Score && 2) || undefined;
      if (setWinner) {
        lastSet.winningSide = setWinner;
        updatedSets.push({ setNumber: updatedSets.length + 1 });
      }
    }
  }

  return {
    sets: updatedSets,
    scoreString: updatedScoreString,
    winningSide: undefined,
    matchUpStatus: undefined,
    updated: true,
  };
}

function handleSpaceKey({ sets, scoreString, winningSide, analysis }) {
  let updated;
  let updatedScoreString = scoreString;
  const lastSet = sets.at(-1) ?? {};
  const { side1Score, side2Score } = lastSet;
  const setWinningSide = (side1Score > side2Score && 1) || (side2Score > side1Score && 2) || undefined;

  if (setWinningSide && !winningSide && !analysis.isIncompleteSetScore) {
    sets.at(-1).winningSide = setWinningSide;
    sets.push({ setNumber: sets.length + 1 });
    updatedScoreString += ' ';
    updated = true;
  }

  return { sets, scoreString: updatedScoreString, updated };
}

function handleNumericKey({ sets, setIndex, value, scoreString }) {
  let currentSetScore;
  let updated;
  let updatedScoreString = scoreString;

  if (sets[setIndex].side2Score === undefined) {
    const newValue = ensureInt((sets[setIndex].side1Score || 0).toString() + value)
      .toString()
      .slice(0, 2);
    sets[setIndex].side1Score = ensureInt(newValue);
    currentSetScore = sets[setIndex].side1Score.toString();
    updated = true;
  } else {
    const newValue = ensureInt((sets[setIndex].side2Score || 0).toString() + value)
      .toString()
      .slice(0, 2);
    sets[setIndex].side2Score = ensureInt(newValue);
    currentSetScore = [sets[setIndex].side1Score, sets[setIndex].side2Score].join('-');
    updated = true;
  }

  if (updated) {
    const priorSetScores = (sets.slice(0, setIndex) ?? [])
      .filter((set) => set)
      .map((set) => [set.side1Score, set.side2Score].join('-'))
      .join(' ');
    updatedScoreString = priorSetScores ? priorSetScores + ' ' + currentSetScore : currentSetScore;
  }

  return { sets, scoreString: updatedScoreString, updated };
}
