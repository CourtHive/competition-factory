import { generateDrawDefinition } from '../drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { isValidExtension } from '@Validators/isValidExtension';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { addExtension } from '@Mutate/extensions/addExtension';
import { completeDrawMatchUps } from './completeDrawMatchUps';
import { xa } from '@Tools/extractAttributes';
import { generateRange } from '@Tools/arrays';

// constants
import { DRAW_DEFINITION_NOT_FOUND, ErrorType, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SEEDING } from '@Constants/scaleConstants';

export function generateFlightDrawDefinitions({
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawProfiles,
  isMock,
  event,
}): {
  drawIds?: string[];
  success?: boolean;
  error?: ErrorType;
} {
  const flightProfile = getFlightProfile({ event }).flightProfile;
  const { eventName, eventType, category } = event;
  const { startDate } = tournamentRecord;
  const drawIds: string[] = [];

  const categoryName = category?.categoryName || category?.ageCategoryCode || category?.ratingType;
  const existingDrawIds = event.drawDefinitions?.map(({ drawId }) => drawId);

  if (Array.isArray(flightProfile?.flights)) {
    for (const [index, flight] of flightProfile.flights.entries()) {
      const { drawId, stage, drawName, drawEntries } = flight;
      drawIds.push(flight.drawId);

      const drawProfile = drawProfiles[index];
      const { seedsCount, generate = true } = drawProfile || {};

      if (generate) {
        const drawParticipantIds = drawEntries.filter(xa(PARTICIPANT_ID)).map(xa(PARTICIPANT_ID));

        const seedingScaleName = categoryName || eventName;

        if (tournamentRecord && seedsCount && seedsCount <= drawParticipantIds.length) {
          const scaleValues = generateRange(1, seedsCount + 1);
          scaleValues.forEach((scaleValue, index) => {
            const scaleItem = {
              scaleValue,
              scaleName: seedingScaleName,
              scaleType: SEEDING,
              eventType,
              scaleDate: startDate,
            };

            const participantId = drawParticipantIds[index];
            setParticipantScaleItem({
              tournamentRecord,
              participantId,
              scaleItem,
            });
          });
        }

        if (existingDrawIds?.includes(drawId)) break;

        let result = generateDrawDefinition({
          ...drawProfile,
          matchUpType: eventType,
          seedingScaleName,
          tournamentRecord,
          drawEntries,
          drawName,
          drawId,
          isMock,
          event,
          stage,
        });
        if (result.error) return { error: result.error, drawIds: [] };
        const { drawDefinition } = result;
        if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

        const drawExtensions = drawProfiles[index]?.drawExtensions;
        if (Array.isArray(drawExtensions)) {
          drawExtensions
            .filter(isValidExtension)
            .forEach((extension) => addExtension({ element: drawDefinition, extension }));
        }

        result = addDrawDefinition({
          suppressNotifications: true,
          tournamentRecord,
          drawDefinition,
          event,
        });
        if (result.error) return { error: result.error, drawIds: [] };

        // withPlayoffs is already processed inside generateDrawDefinition()
        // (including recursive roundPlayoffs via applyPlayoffsRecursive),
        // so no additional addPlayoffStructures call is needed here.

        const completionGoal = drawProfile?.completionGoal;
        const manual = drawProfile?.automated === false;

        if (!manual && (completeAllMatchUps || completionGoal)) {
          const matchUpFormat = drawProfile?.matchUpFormat;

          const result = completeDrawMatchUps({
            completeAllMatchUps: !completionGoal && completeAllMatchUps,
            matchUpStatusProfile,
            randomWinningSide,
            tournamentRecord,
            completionGoal,
            drawDefinition,
            matchUpFormat,
            event,
          });
          if (result.error) return { error: result.error, drawIds: [] };

          const completedCount = result.completedCount;

          if (drawProfile?.drawType === ROUND_ROBIN_WITH_PLAYOFF) {
            const mainStructure = drawDefinition.structures?.find((structure) => structure.stage === MAIN);
            if (!mainStructure) return { error: STRUCTURE_NOT_FOUND };
            let result = automatedPlayoffPositioning({
              structureId: mainStructure.structureId,
              tournamentRecord,
              drawDefinition,
              event,
            });
            if (result.error) return { error: result.error, drawIds: [] };

            const playoffCompletionGoal = completionGoal ? completionGoal - (completedCount ?? 0) : undefined;
            result = completeDrawMatchUps({
              completeAllMatchUps: !completionGoal && completeAllMatchUps,
              completionGoal: completionGoal ? playoffCompletionGoal : undefined,
              matchUpStatusProfile,
              randomWinningSide,
              tournamentRecord,
              drawDefinition,
              matchUpFormat,
              event,
            });
            if (result.error) return { error: result.error, drawIds: [] };
          }
        }
      }
    }
  }

  return { ...SUCCESS, drawIds };
}
