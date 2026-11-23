import { keyValueMatchUpScore } from '@Helpers/keyValueScore/keyValueScore';

export const TIEBREAK_CLOSER = { value: 'space' };

export function scoreMatchUp(params) {
  const { lowSide, value } = params;
  let { matchUp } = params;
  let info, updated;
  ({ matchUp, info, updated } = keyValueMatchUpScore({
    lowSide,
    value,
    matchUp,
  }));
  return { matchUp, info, updated };
}

export function enterValues({ values, matchUp }) {
  let info;
  const messages: any[] = [];
  values.forEach((item) => {
    const { lowSide, value } = item;
    ({ matchUp, info } = scoreMatchUp({ lowSide, value, matchUp }));
    if (info) messages.push(info);
  });
  return { matchUp, messages };
}
