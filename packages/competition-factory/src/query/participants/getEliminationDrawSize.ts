import { decorateResult } from '@Functions/global/decorateResult';
import { nextPowerOf2 } from '@Tools/math';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type GetDrawSizeArgs = {
  participantsCount?: number;
  participantCount?: number;
};
export function getEliminationDrawSize({
  participantsCount,
  participantCount,
}: GetDrawSizeArgs): ResultType & { drawSize?: number } {
  participantsCount = participantsCount ?? participantCount;
  if (!participantsCount) return { error: INVALID_VALUES };

  const drawSize = nextPowerOf2(participantsCount);

  if (!drawSize)
    return decorateResult({
      result: { error: INVALID_VALUES },
      stack: 'getEliminationDrawSize',
      context: { participantsCount },
    });

  return { drawSize };
}
