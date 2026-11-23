import { decorateResult } from '@Functions/global/decorateResult';
import { modifyMappedMatchUps } from './modifyMappedMatchUps';
import { checkRoundsArgs } from './checkRoundsArgs';
import { isNumeric } from '@Tools/math';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { ARRAY, OF_TYPE, VALIDATE } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Swaps two rounds within the specified structure
 * e.g. { roundNumbers: [3, 5] } would reorder [1,2,3,4,5,6] to [1,2,5,4,3,6] and then renumber the swapped rounds
 * matchUpNoficiation notices for matchUps in the two swapped rounds are be generated
 */

type SwapRoundsArgs = {
  roundNumbers: [number, number];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  event?: Event;
};

export function swapAdHocRounds(params: SwapRoundsArgs) {
  const check = checkRoundsArgs(params, [
    {
      roundNumbers: true,
      [OF_TYPE]: ARRAY,
      [VALIDATE]: (value) => value.length === 2 && value.every(isNumeric),
    },
  ]);
  if (check.error) return check;

  const { structure, roundMatchUps, roundNumbers } = check;
  if (!params.roundNumbers.every((roundNumber) => roundNumbers?.includes(roundNumber))) {
    return decorateResult({ result: { error: INVALID_VALUES, message: 'roundNumbers must be valid rounds' } });
  }

  const modMap = {};
  params.roundNumbers.forEach((roundNumber, i) =>
    (roundMatchUps?.[roundNumber] ?? []).forEach(({ matchUpId }) => {
      modMap[matchUpId] = params.roundNumbers[1 - i];
    }),
  );

  modifyMappedMatchUps({ params, modMap, structure });

  return { ...SUCCESS };
}
