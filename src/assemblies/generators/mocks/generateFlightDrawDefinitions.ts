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
  random,
  isMock,
  event,
}: {
  random?: () => number;
  matchUpStatusProfile?: any;
  completeAllMatchUps?: boolean;
  randomWinningSide?: boolean;
  tournamentRecord: any;
  drawProfiles: any[];
  isMock?: boolean;
  event: any;
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
  const existingDrawIdSet = new Set(existingDrawIds ?? []);

  if (!Array.isArray(flightProfile?.flights)) return { ...SUCCESS, drawIds };

  for (const [index, flight] of flightProfile.flights.entries()) {
    const { drawId, stage, drawName, drawEntries } = flight;
    drawIds.push(flight.drawId);

    const drawProfile = drawProfiles[index];
    const { seedsCount, generate = true } = drawProfile ?? {};

    if (!generate) continue;

    const seedingScaleName = categoryName || eventName;

    applySeeding({
      drawParticipantIds: drawEntries.filter(xa(PARTICIPANT_ID)).map(xa(PARTICIPANT_ID)),
      seedingScaleName,
      tournamentRecord,
      seedsCount,
      startDate,
      eventType,
    });

    if (existingDrawIdSet.has(drawId)) break;

    const genResult = generateAndAddDraw({
      drawProfile: drawProfiles[index],
      seedingScaleName,
      tournamentRecord,
      drawEntries,
      eventType,
      drawName,
      drawId,
      isMock,
      random,
      event,
      stage,
    });
    if (genResult.error) return { error: genResult.error, drawIds: [] };

    const { drawDefinition } = genResult;

    const manual = drawProfiles[index]?.automated === false;
    const completionGoal = drawProfiles[index]?.completionGoal;

    if (!manual && (completeAllMatchUps || completionGoal)) {
      const completeResult = completeFlightMatchUps({
        matchUpFormat: drawProfiles[index]?.matchUpFormat,
        drawType: drawProfiles[index]?.drawType,
        matchUpStatusProfile,
        completeAllMatchUps,
        randomWinningSide,
        tournamentRecord,
        drawDefinition,
        completionGoal,
        random,
        event,
      });
      if (completeResult?.error) return { error: completeResult.error, drawIds: [] };
    }
  }

  return { ...SUCCESS, drawIds };
}

function applySeeding({
  drawParticipantIds,
  seedingScaleName,
  tournamentRecord,
  seedsCount,
  startDate,
  eventType,
}) {
  if (!tournamentRecord || !seedsCount || seedsCount > drawParticipantIds.length) return;

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

function generateAndAddDraw({
  seedingScaleName,
  tournamentRecord,
  drawProfile,
  drawEntries,
  eventType,
  drawName,
  drawId,
  isMock,
  random,
  event,
  stage,
}) {
  let result = generateDrawDefinition({
    ...drawProfile,
    matchUpType: eventType,
    seedingScaleName,
    tournamentRecord,
    drawEntries,
    drawName,
    drawId,
    isMock,
    random,
    event,
    stage,
  });
  if (result.error) return { error: result.error };
  const { drawDefinition } = result;
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  const drawExtensions = drawProfile?.drawExtensions;
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
  if (result.error) return { error: result.error };

  return { drawDefinition };
}

function completeFlightMatchUps({
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawDefinition,
  completionGoal,
  matchUpFormat,
  drawType,
  random,
  event,
}) {
  const result = completeDrawMatchUps({
    completeAllMatchUps: !completionGoal && completeAllMatchUps,
    matchUpStatusProfile,
    randomWinningSide,
    tournamentRecord,
    completionGoal,
    drawDefinition,
    matchUpFormat,
    random,
    event,
  });
  if (result.error) return result;

  if (drawType !== ROUND_ROBIN_WITH_PLAYOFF) return undefined;

  const mainStructure = drawDefinition.structures?.find((structure) => structure.stage === MAIN);
  if (!mainStructure) return { error: STRUCTURE_NOT_FOUND };

  const playoffResult = automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (playoffResult.error) return playoffResult;

  const completedCount = result.completedCount;
  const playoffCompletionGoal = completionGoal ? completionGoal - (completedCount ?? 0) : undefined;
  const playoffComplete = completeDrawMatchUps({
    completeAllMatchUps: !completionGoal && completeAllMatchUps,
    completionGoal: completionGoal ? playoffCompletionGoal : undefined,
    matchUpStatusProfile,
    randomWinningSide,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    random,
    event,
  });
  if (playoffComplete.error) return playoffComplete;

  return undefined;
}
