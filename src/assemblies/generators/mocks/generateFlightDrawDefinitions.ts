import { generateDrawDefinition } from '@Generators/drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { completeDrawMatchUps } from '@Mutate/simulation/completeDrawMatchUps';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { resolveCompletionOptions } from './resolveCompletionOptions';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { isValidExtension } from '@Validators/isValidExtension';
import { applyDefinedOutcomes } from './generateEventWithDraw';
import { addExtension } from '@Mutate/extensions/addExtension';
import { findEvent } from '@Acquire/findEvent';
import { generateRange } from '@Tools/arrays';
import { xa } from '@Tools/extractAttributes';

// constants
import { DRAW_DEFINITION_NOT_FOUND, ErrorType, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SEEDING } from '@Constants/scaleConstants';

export function generateFlightDrawDefinitions({
  deferredOutcomes,
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawProfiles,
  random,
  isMock,
  event,
}: {
  /** results to apply once the tournament is scheduled (see generateEventWithDraw), instead of now */
  deferredOutcomes?: (() => { error?: ErrorType } | undefined)[];
  random?: () => number;
  matchUpStatusProfile?: any;
  completeAllMatchUps?: boolean | string;
  randomWinningSide?: boolean;
  tournamentRecord: Tournament;
  drawProfiles: any[];
  isMock?: boolean;
  event: Event;
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

  // the drawProfiles describe the flights this call added: on an existing event (modifyTournamentRecord) the
  // flights already drawn come first, and pairing by position matched profile 0 to the old draw and stopped
  const newFlights = flightProfile.flights.filter(({ drawId }) => !existingDrawIdSet.has(drawId));
  for (const [index, flight] of newFlights.entries()) {
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
    const outcomes = drawProfiles[index]?.outcomes;
    // a drawProfile's own completion options take precedence over the event/top-level ones for that draw
    const completion = resolveCompletionOptions(drawProfile, {
      matchUpStatusProfile,
      completeAllMatchUps,
      randomWinningSide,
    });

    if (!manual && (completion.completeAllMatchUps || completionGoal || outcomes?.length)) {
      const complete = (target: { drawDefinition: DrawDefinition; event: Event }) =>
        completeFlightMatchUps({
          matchUpFormat: drawProfiles[index]?.matchUpFormat,
          drawType: drawProfiles[index]?.drawType,
          matchUpStatusProfile: completion.matchUpStatusProfile,
          completeAllMatchUps: completion.completeAllMatchUps,
          randomWinningSide: completion.randomWinningSide,
          drawDefinition: target.drawDefinition,
          event: target.event,
          tournamentRecord,
          completionGoal,
          outcomes,
          random,
        });
      if (deferredOutcomes) {
        deferredOutcomes.push(() => {
          const found = findEvent({ tournamentRecord, drawId });
          return found.event && found.drawDefinition
            ? complete({ drawDefinition: found.drawDefinition, event: found.event })
            : undefined;
        });
      } else {
        const completeResult = complete({ drawDefinition, event });
        if (completeResult?.error) return { error: completeResult.error, drawIds: [] };
      }
    }
  }

  return { ...SUCCESS, drawIds };
}

function applySeeding({ drawParticipantIds, seedingScaleName, tournamentRecord, seedsCount, startDate, eventType }) {
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
      .filter((extension) => isValidExtension({ extension }))
      .forEach((extension) => addExtension({ element: drawDefinition, extension }));
  }

  // announced as a client's addDrawDefinition is: the event is already on the record
  result = addDrawDefinition({
    tournamentRecord,
    drawDefinition,
    event,
  });
  if (result.error) return { error: result.error };

  return { drawDefinition };
}

/**
 * A flight's draw is completed as a drawProfiles draw is: its completionGoal first, then its defined outcomes, then
 * every matchUp left when completeAllMatchUps is set and no goal is (a goal wins: exactly that many are completed).
 */
function completeFlightMatchUps(params) {
  const { completionGoal, completeAllMatchUps, outcomes, tournamentRecord, drawDefinition, event } = params;
  if (completionGoal) {
    const goalResult = completeFlightPass({ ...params, completeAllMatchUps: false });
    if (goalResult?.error) return goalResult;
  }
  if (outcomes?.length) {
    const outcomesResult = applyDefinedOutcomes({ tournamentRecord, drawDefinition, outcomes, event });
    if (outcomesResult?.error) return outcomesResult;
  }
  if (completeAllMatchUps && !completionGoal) {
    const allResult = completeFlightPass({ ...params, completionGoal: undefined });
    if (allResult?.error) return allResult;
  }
  return undefined;
}

function completeFlightPass({
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
