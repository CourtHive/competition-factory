import { addOutcome } from './keyValueUtilities';

import {
  OUTCOME_DEFAULT,
  OUTCOME_RETIREMENT,
  OUTCOME_WALKOVER,
  STATUS_DEFAULT,
  STATUS_RETIREMENT,
  STATUS_WALKOVER,
  STATUS_ABANDONED,
  STATUS_INTERRUPTED,
  STATUS_SUSPENDED,
  RETIRE,
  DEFAULT,
  WALKOVER,
  ABANDON,
  INTERRUPT,
  SUSPEND,
  OUTCOME_ABANDONED,
  OUTCOME_INTERRUPTED,
  OUTCOME_SUSPENDED,
} from '@Constants/keyValueConstants';

export function processOutcome({ lowSide, value, sets, scoreString, winningSide, matchUpStatus }) {
  let updated;

  if (value === RETIRE) {
    if (scoreString) {
      updated = true;
      scoreString = addOutcome({
        scoreString,
        lowSide,
        outcome: OUTCOME_RETIREMENT,
      });
      winningSide = lowSide === 2 ? 1 : 2;
      matchUpStatus = STATUS_RETIREMENT;
    } else {
      updated = true;
      scoreString = addOutcome({
        scoreString,
        lowSide,
        outcome: OUTCOME_DEFAULT,
      });
      winningSide = lowSide === 2 ? 1 : 2;
      matchUpStatus = STATUS_DEFAULT;
    }
  } else if (value === DEFAULT) {
    updated = true;
    scoreString = addOutcome({
      scoreString,
      lowSide,
      outcome: OUTCOME_DEFAULT,
    });
    winningSide = lowSide === 2 ? 1 : 2;
    matchUpStatus = STATUS_DEFAULT;
  } else if (value === WALKOVER) {
    updated = true;
    sets = [];
    scoreString = OUTCOME_WALKOVER;
    winningSide = lowSide === 2 ? 1 : 2;
    matchUpStatus = STATUS_WALKOVER;
  } else if (value === SUSPEND && scoreString) {
    updated = true;
    scoreString = addOutcome({
      scoreString,
      lowSide,
      outcome: OUTCOME_SUSPENDED,
    });
    matchUpStatus = STATUS_SUSPENDED;
    winningSide = undefined;
  } else if (value === ABANDON) {
    updated = true;
    scoreString = addOutcome({
      scoreString,
      lowSide,
      outcome: OUTCOME_ABANDONED,
    });
    matchUpStatus = STATUS_ABANDONED;
    winningSide = undefined;
  } else if (value === INTERRUPT && scoreString) {
    updated = true;
    scoreString = addOutcome({
      scoreString,
      lowSide,
      outcome: OUTCOME_INTERRUPTED,
    });
    matchUpStatus = STATUS_INTERRUPTED;
    winningSide = undefined;
  }

  return { updated, sets, scoreString, matchUpStatus, winningSide };
}
