import { pushGlobalLog } from '@Functions/global/globalLog';
import { getDevContext } from '@Global/state/globalState';

import { MISSING_MATCHUPS } from '@Constants/errorConditionConstants';

export function validDrawPositions({ matchUps }) {
  if (!matchUps) return { error: MISSING_MATCHUPS };
  const drawPositions = matchUps.map((matchUp) => matchUp.drawPositions).flat();

  if (getDevContext()) {
    matchUps.forEach((matchUp) => {
      if (!Array.isArray(matchUp.drawPositions)) {
        pushGlobalLog({ method: 'validDrawPositions', issue: 'drawPositions is not an array', matchUp });
        return;
      }
      matchUp.drawPositions?.forEach((drawPosition) => {
        if (!validDrawPosition(drawPosition)) {
          pushGlobalLog({ method: 'validDrawPositions', issue: 'invalid drawPosition', matchUp });
        }
      });
    });
  }

  const allPositionsValid = drawPositions?.every(validDrawPosition);

  const matchUpDrawPositionsNotArray = matchUps.find((matchUp) => !Array.isArray(matchUp.drawPositions));

  return allPositionsValid && !matchUpDrawPositionsNotArray;
}

function validDrawPosition(drawPosition) {
  return drawPosition !== null && (drawPosition === undefined || !isNaN(drawPosition));
}
