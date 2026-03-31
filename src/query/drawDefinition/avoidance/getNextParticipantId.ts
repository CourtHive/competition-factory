import { randomMember } from '@Tools/arrays';

type GetNextParticipantId = {
  allGroups: { [key: string]: string[] };
  targetParticipantIds: string[];
  useSpecifiedGroupKey?: boolean;
  largestFirst?: boolean;
  groupKey: string;
  random?: () => number;
};

export function getNextParticipantId({
  useSpecifiedGroupKey = false,
  targetParticipantIds,
  largestFirst = true,
  allGroups,
  groupKey,
  random,
}: GetNextParticipantId): { participantId: string; groupKey: string } {
  const groupings = Object.assign(
    {},
    ...Object.keys(allGroups)
      .map((group) => [group, allGroups[group].filter((id) => targetParticipantIds.includes(id))])
      .filter((item) => item[1].length)
      .map(([group, ids]) => ({ [group as string]: ids })),
  );

  const largestGroupSize = Object.keys(groupings).reduce(
    (size, key) => (groupings[key].length > size ? groupings[key].length : size),
    0,
  );
  const largestSizedGroupings = Object.keys(groupings).filter((key) => groupings[key].length === largestGroupSize);

  const randomGroupKey = largestFirst ? randomMember(largestSizedGroupings, random) : randomMember(Object.keys(groupings), random);

  groupKey = useSpecifiedGroupKey && groupings[groupKey]?.length ? groupKey : randomGroupKey;

  const participantId =
    groupKey && groupings[groupKey] ? randomMember(groupings[groupKey], random) : randomMember(targetParticipantIds, random);
  return { participantId, groupKey };
}
