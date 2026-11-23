import { isConvertableInteger } from '@Tools/math';
import { ensureInt } from '@Tools/ensureInt';

type GetGroupValueGroupsArgs = {
  collectionGroups: { groupValue?: number; groupNumber?: number }[];
};
export function getGroupValueGroups({ collectionGroups = [] }: GetGroupValueGroupsArgs) {
  // set up to handle groupValue. Keyed by groupNumber from the tieFormat: a null prototype keeps a non-numeric key
  // ordinary (the value-group membership check below already only admits integers; CodeQL #247)
  const groupValueGroups = Object.assign(
    Object.create(null),
    ...collectionGroups
      .filter((group: any) => isConvertableInteger(group?.groupValue) && group?.groupNumber)
      .map((group: any) => ({
        [group.groupNumber]: {
          ...group,
          allGroupMatchUpsCompleted: true,
          matchUpsCount: 0,
          sideWins: [0, 0],
          values: [0, 0],
        },
      })),
  );

  // must be coerced to numbers
  const groupValueNumbers = Object.keys(groupValueGroups).map((num) => ensureInt(num));

  return { groupValueGroups, groupValueNumbers };
}
