import { generateRange } from '@Tools/arrays';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type GetValidGroupSizesArgs = {
  groupSizeLimit?: number;
  drawSize: number;
};

export function getValidGroupSizes(params: GetValidGroupSizesArgs): ResultType & { validGroupSizes?: number[] } {
  const { groupSizeLimit = 10, drawSize = 0 } = params ?? {};
  const validGroupSizes = generateRange(3, groupSizeLimit + 1).filter((groupSize) => {
    const groupsCount = Math.ceil(drawSize / groupSize);
    const byesCount = groupsCount * groupSize - drawSize;
    const maxParticipantsPerGroup = Math.ceil(drawSize / groupsCount);
    const maxByesPerGroup = Math.ceil(byesCount / groupsCount);
    return (
      (!byesCount || byesCount < groupSize) &&
      maxParticipantsPerGroup === groupSize &&
      maxParticipantsPerGroup >= 3 &&
      maxByesPerGroup < 2
    );
  });
  return { ...SUCCESS, validGroupSizes };
}
