import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { MULTI_STRUCTURE_DRAWS, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { DrawTypeUnion } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function getCoercedDrawType(params): ResultType & { drawType: DrawTypeUnion } {
  const { drawTypeCoercion, enforceMinimumDrawSize } = params;
  const drawSize = ensureInt(params.drawSize);

  let drawType =
    (drawTypeCoercion &&
      !isAdHocType(params.drawType) &&
      (typeof drawTypeCoercion === 'boolean' || drawTypeCoercion <= 2) &&
      drawSize === 2 &&
      SINGLE_ELIMINATION) ||
    params.drawType ||
    SINGLE_ELIMINATION;

  const multiStructure = MULTI_STRUCTURE_DRAWS.includes(drawType);
  if (drawSize && multiStructure) {
    if (drawTypeCoercion && ((typeof drawTypeCoercion === 'boolean' && drawSize < 4) || drawSize <= drawTypeCoercion)) {
      drawType = SINGLE_ELIMINATION;
    } else if (drawSize < 4 && enforceMinimumDrawSize) {
      return {
        ...decorateResult({
          context: {
            enforceMinimumDrawSize,
            drawSize,
            drawType,
          },
          result: { error: INVALID_DRAW_SIZE },
          stack: 'getCoercedDrawType',
        }),
        drawType,
      };
    }
  }
  return { drawType };
}
