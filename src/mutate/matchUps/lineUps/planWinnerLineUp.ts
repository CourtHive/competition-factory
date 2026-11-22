import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import type { LineUp } from '@Types/factoryTypes';

/** An advancing team takes side 2 of a feed round (draw-positions rule 4). */
export function planWinnerLineUp(
  held: LineUp,
  sourcePosition: number,
  target: { roundPosition?: number; feedRound?: boolean },
) {
  const advancedByPosition =
    (sourcePosition === target.roundPosition && sourcePosition !== 1) ||
    Math.floor(sourcePosition / 2) === target.roundPosition;
  const sideNumber = target.feedRound || advancedByPosition ? 2 : 1;
  const lineUp = removeLineUpSubstitutions({ lineUp: held.filter((assignment) => assignment?.participantId) });
  return { sideNumber, lineUp };
}
