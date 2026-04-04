import { getTieFormatDesc } from '@Query/hierarchical/tieFormats/getTieFormatDescription';
import { stringSort } from '@Functions/sorters/stringSort';
import { isConvertableInteger } from '@Tools/math';
import { difference, unique } from '@Tools/arrays';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { TieFormat } from '@Types/tournamentTypes';

type CompareTieFormatsArgs = {
  considerations?: { collectionName?: boolean; collectionOrder?: boolean };
  ancestor: TieFormat;
  descendant: any;
};

export function compareTieFormats({ considerations = {}, descendant, ancestor }: CompareTieFormatsArgs) {
  const descendantDifferences: any = {};
  const ancestorDifferences: any = {};

  const { matchUpFormats: descendantMatchUpFormats, tieFormatDesc: descendantDesc } = getTieFormatDesc(descendant);

  const { matchUpFormats: ancestorMatchUpFormats, tieFormatDesc: ancestorDesc } = getTieFormatDesc(ancestor);

  const matchUpFormatDifferences = unique(
    (descendantMatchUpFormats ?? [])
      .filter((format) => !(ancestorMatchUpFormats ?? []).includes(format))
      .concat((ancestorMatchUpFormats ?? []).filter((format) => !(descendantMatchUpFormats ?? []).includes(format))),
  );

  const nameDifference = !!(
    considerations?.collectionName &&
    descendant.collectionDefinitions.map(({ collectionName }) => collectionName).join('|') !==
      ancestor.collectionDefinitions.map(({ collectionName }) => collectionName).join('|')
  );

  const orderDifference = !!(
    considerations?.collectionOrder &&
    descendant.collectionDefinitions.map(({ collectionOrder }) => collectionOrder).join('|') !==
      ancestor.collectionDefinitions.map(({ collectionOrder }) => collectionOrder).join('|')
  );

  const descendantCollectionDefinitions = Object.assign(
    {},
    ...(descendant?.collectionDefinitions ?? []).map((collectionDefinition) => ({
      [collectionDefinition.collectionId]: collectionDefinition,
    })),
  );
  const ancestorCollectionDefinitions = Object.assign(
    {},
    ...(ancestor?.collectionDefinitions ?? []).map((collectionDefinition) => ({
      [collectionDefinition.collectionId]: collectionDefinition,
    })),
  );

  descendantDifferences.collectionIds = difference(
    Object.keys(descendantCollectionDefinitions),
    Object.keys(ancestorCollectionDefinitions),
  );
  ancestorDifferences.collectionIds = difference(
    Object.keys(ancestorCollectionDefinitions),
    Object.keys(descendantCollectionDefinitions),
  );

  descendantDifferences.collectionsValue = getCollectionsValue(descendantCollectionDefinitions);
  ancestorDifferences.collectionsValue = getCollectionsValue(ancestorCollectionDefinitions);

  descendantDifferences.groupsCount =
    ancestor?.collectionGroups?.length ?? (0 - (descendant?.collectionGroups?.length ?? 0) || 0);

  ancestorDifferences.groupsCount = descendantDifferences.groupsCount ? -1 * descendantDifferences.groupsCount : 0;

  const valueDifference =
    descendantDifferences.collectionsValue.totalValue - ancestorDifferences.collectionsValue.totalValue;
  const matchUpCountDifference =
    descendantDifferences.collectionsValue.totalMatchUps - ancestorDifferences.collectionsValue.totalMatchUps;

  const assignmentValuesCountDifference =
    ancestorDifferences.collectionsValue.assignmentValues.length !==
    descendantDifferences.collectionsValue.assignmentValues.length;

  const assignmentValuesDifference = ancestorDifferences.collectionsValue.assignmentValues.some((assignment, i) => {
    const comparisonAssignment = descendantDifferences.collectionsValue.assignmentValues[i];
    if (!comparisonAssignment) return true;

    if (assignment.valueKey !== comparisonAssignment.valueKey) return true;
    if (assignment.value !== comparisonAssignment.value) return true;
    if (Array.isArray(assignment.value)) {
      return assignment.value.every((value, i) => comparisonAssignment.value[i] === value);
    }

    return false;
  });

  const different =
    nameDifference ||
    orderDifference ||
    ancestorDesc !== descendantDesc ||
    assignmentValuesCountDifference ||
    assignmentValuesDifference ||
    valueDifference !== 0;

  const invalidValues = [
    ...ancestorDifferences.collectionsValue.invalidValues,
    ...descendantDifferences.collectionsValue.invalidValues,
  ];
  const invalid = invalidValues.length && invalidValues;

  return {
    matchUpFormatDifferences,
    matchUpCountDifference,
    descendantDifferences,
    ancestorDifferences,
    orderDifference,
    valueDifference,
    nameDifference,
    descendantDesc,
    ancestorDesc,
    ...SUCCESS,
    different,
    invalid,
  };
}

function getCollectionsValue(definitions) {
  const invalidValues: { collectionId: string }[] = [];
  const assignmentValues: { valueKey: string; value: number | number[] }[] = [];
  let totalMatchUps = 0;

  const collectionIds = Object.keys(definitions).sort(stringSort);
  const totalValue = collectionIds.reduce((total, collectionId) => {
    const collectionDefinition = definitions[collectionId];
    const { collectionValueProfiles, collectionValue, matchUpCount, matchUpValue, scoreValue, setValue } =
      collectionDefinition;

    const valueAssignments = {
      collectionValueProfiles,
      collectionValue,
      matchUpValue,
      scoreValue,
      setValue,
    };

    const valueKeys = Object.keys(valueAssignments).filter(
      (key) =>
        ![undefined, null].includes(valueAssignments[key]) &&
        (!Array.isArray(valueAssignments[key]) || valueAssignments[key].length > 0),
    );
    if (valueKeys.length !== 1) invalidValues.push({ collectionId });

    const valueKey = valueKeys[0];
    if (valueKey) {
      const value =
        valueKey === 'collectionValueProfiles' ? Object.values(collectionValueProfiles) : valueAssignments[valueKey];
      assignmentValues.push({ valueKey, value });
    }

    totalMatchUps += matchUpCount;

    if (collectionValueProfiles?.length)
      return total + collectionValueProfiles.reduce((total, profile) => total + profile.value, 0);

    if (matchUpCount) {
      if (isConvertableInteger(matchUpValue)) return total + matchUpValue * matchUpCount;
      if (isConvertableInteger(scoreValue)) return total + scoreValue * matchUpCount;
      if (isConvertableInteger(setValue)) return total + setValue * matchUpCount;
      return total + collectionValue;
    }

    return total;
  }, 0);

  return { totalValue, totalMatchUps, invalidValues, assignmentValues };
}
