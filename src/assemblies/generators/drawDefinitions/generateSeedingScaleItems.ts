import { ErrorType, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import { SEEDING } from '@Constants/scaleConstants';
import { Entry } from '@Types/tournamentTypes';

type ScaleItemsWithParticipantId = {
  participantId: string;
  scaleItems: any[];
};
type GenerateSeedingScaleItemsArgs = {
  scaleAttributes?: ScaleAttributes;
  scaledEntries: any[] | null;
  stageEntries: Entry[];
  seedsCount: number;
  scaleName?: string;
};
export function generateSeedingScaleItems({
  scaleAttributes,
  scaledEntries,
  stageEntries,
  seedsCount,
  scaleName,
}: GenerateSeedingScaleItemsArgs): {
  scaleItemsWithParticipantIds?: ScaleItemsWithParticipantId[];
  error?: ErrorType;
  info?: any;
} {
  if (!scaleAttributes) return { error: MISSING_VALUE, info: 'missing scaleAttributes' };

  const seededEntries = Object.assign(
    {},
    ...(scaledEntries ?? []).slice(0, seedsCount).map(({ participantId }, index) => ({ [participantId]: index + 1 })),
  );

  scaleName = scaleName || scaleAttributes.scaleName;
  const scaleDate = new Date().toISOString();

  const scaleItemsWithParticipantIds = stageEntries.map(({ participantId }) => {
    const scaleItem = {
      scaleValue: seededEntries[participantId],
      eventType: scaleAttributes.eventType,
      scaleType: SEEDING,
      scaleName,
      scaleDate,
    };
    return {
      scaleItems: [scaleItem],
      participantId,
    };
  });

  return { scaleItemsWithParticipantIds };
}
