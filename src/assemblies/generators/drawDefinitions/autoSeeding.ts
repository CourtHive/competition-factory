import { generateSeedingScaleItems } from '@Assemblies/generators/drawDefinitions/generateSeedingScaleItems';
import { getEntriesAndSeedsCount } from '@Query/entries/getEntriesAndSeedsCount';
import { getScaledEntries } from '@Query/event/getScaledEntries';

// constants and types
import { DrawDefinition, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, ScaleAttributes } from '@Types/factoryTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

type AutoSeedingParams = {
  sortDescending: boolean;
  stage: StageTypeUnion;
  tournamentRecord: Tournament;
  policyDefinitions: PolicyDefinitions;
  scaleAttributes: ScaleAttributes;
  scaleSortMethod: any;
  drawDefinition: DrawDefinition;
  scaleName: string;
  drawSize: number;
  drawId: string;
  event: Event;
};

export function autoSeeding({
  tournamentRecord,
  drawDefinition,

  policyDefinitions,
  scaleAttributes,
  scaleName,
  drawSize,
  drawId,
  event,
  stage,

  sortDescending,
  scaleSortMethod,
}: AutoSeedingParams) {
  const result = getEntriesAndSeedsCount({
    policyDefinitions,
    drawDefinition,
    drawSize,
    drawId,
    event,
    stage,
  });

  if (result.error) return result;

  const { entries, seedsCount, stageEntries } = result;
  if (!stageEntries || !seedsCount) return { error: INVALID_VALUES };

  const scaledEntries =
    getScaledEntries({
      tournamentRecord,
      scaleAttributes,
      scaleSortMethod,
      sortDescending,
      entries,
      stage,
    }).scaledEntries ?? [];

  const { scaleItemsWithParticipantIds } = generateSeedingScaleItems({
    scaleAttributes,
    scaledEntries,
    stageEntries,
    seedsCount,
    scaleName,
  });

  return { scaleItemsWithParticipantIds };
}
