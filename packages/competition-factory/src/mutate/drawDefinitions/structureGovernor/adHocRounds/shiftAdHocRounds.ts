import { decorateResult } from '@Functions/global/decorateResult';
import { modifyMappedMatchUps } from './modifyMappedMatchUps';
import { checkRoundsArgs } from './checkRoundsArgs';
import { generateRange } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { NUMBER, OF_TYPE } from '@Constants/attributeConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Shifts roundNumber to targetRoundNumber within the specified structure
 * e.g. { roundNumber: 2, targetRoundNumber: 5 } would reorder [1,2,3,4,5,6] to [1,3,4,5,2,6] and then renumber the rounds
 * matchUpNoficiation notices for all affected matchUps are generated
 */

type ShiftRoundsArgs = {
  drawDefinition: DrawDefinition;
  targetRoundNumber: number;
  roundNumber: number;
  structureId: string;
};

export function shiftAdHocRounds(params: ShiftRoundsArgs) {
  const check = checkRoundsArgs(params, [{ targetRoundNumber: true, roundNumber: true, [OF_TYPE]: NUMBER }]);
  if (check.error) return check;

  const { structure, roundMatchUps, roundNumbers } = check;
  const { targetRoundNumber, roundNumber } = params;
  if (!roundNumbers?.includes(roundNumber) || !roundNumbers?.includes(targetRoundNumber)) {
    return decorateResult({ result: { error: INVALID_VALUES }, info: 'roundNumbers must be valid rounds' });
  }
  !!structure && !!roundMatchUps;

  const downShift = targetRoundNumber > roundNumber;
  const collateralShifts = downShift
    ? generateRange(roundNumber + 1, targetRoundNumber + 1)
    : generateRange(targetRoundNumber, roundNumber);

  const modMap = {};
  collateralShifts.forEach((roundNumber) =>
    (roundMatchUps?.[roundNumber] ?? []).forEach(({ matchUpId }) => {
      modMap[matchUpId] = roundNumber - (downShift ? 1 : -1);
    }),
  );
  roundMatchUps?.[roundNumber]?.forEach(({ matchUpId }) => (modMap[matchUpId] = targetRoundNumber));

  modifyMappedMatchUps({ params, modMap, structure });

  return { ...SUCCESS };
}
