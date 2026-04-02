import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { INVALID_OBJECT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { MatchUp } from '@Types/tournamentTypes';

type MatchUpArg = {
  [key: string | number | symbol]: unknown;
} & MatchUp;

// TASK: add verify/validate structure as option in setState

let keyedMatchUps = {};
let matchUpId;

export function setState(value: MatchUpArg, deepCopyOption = true) {
  if (!value) return { error: MISSING_VALUE };
  if (typeof value !== 'object') return { error: INVALID_OBJECT };

  if (value.matchUpId) {
    matchUpId = value.matchUpId;
    keyedMatchUps[matchUpId] = deepCopyOption ? makeDeepCopy(value) : value;
  } else {
    const items: MatchUpArg[] = Array.isArray(value)
      ? [...value].reverse()
      : (Object.values(value) as MatchUpArg[]);
    storeMatchUpItems(items, deepCopyOption);
  }

  return deepCopyOption ? makeDeepCopy(value) : value;
}

function storeMatchUpItems(items: MatchUpArg[], deepCopyOption: boolean) {
  for (const m of items) {
    if (m.matchUpId) {
      keyedMatchUps[m.matchUpId] = deepCopyOption ? makeDeepCopy(m) : m;
      if (!matchUpId) matchUpId = m.matchUpId;
    }
  }
}

export function getMatchUp() {
  return keyedMatchUps[matchUpId];
}

export function getMatchUps() {
  return Object.values(keyedMatchUps);
}

export function reset() {
  matchUpId = undefined;
  keyedMatchUps = {};
}

export function getState(params?) {
  return makeDeepCopy(keyedMatchUps[matchUpId], params?.convertExtensions, false, params?.removeExtensions);
}
