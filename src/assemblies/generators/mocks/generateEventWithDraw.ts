import { generateDrawDefinition } from '../drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { completeDrawMatchUps, completeDrawMatchUp } from './completeDrawMatchUps';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { addEventTimeItem } from '@Mutate/timeItems/addTimeItem';
import { isValidExtension } from '@Validators/isValidExtension';
import { getParticipantId } from '@Functions/global/extractors';
import tieFormatDefaults from '../templates/tieFormatDefaults';
import { addExtension } from '@Mutate/extensions/addExtension';
import { publishEvent } from '@Mutate/publishing/publishEvent';
import { generateParticipants } from './generateParticipants';
import { generateRange, intersection } from '@Tools/arrays';
import { definedAttributes } from '@Tools/definedAttributes';
import { coercedGender } from '@Helpers/coercedGender';
import { processTieFormat } from './processTieFormat';
import { addFlight } from '@Mutate/events/addFlight';
import { isGendered } from '@Validators/isGendered';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isFemale } from '@Validators/isFemale';
import { isObject } from '@Tools/objects';
import { coerceEven } from '@Tools/math';
import { UUID } from '@Tools/UUID';

// constants and types
import { MAIN, QUALIFYING, ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DRAW_DEFINITION_NOT_FOUND, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SEEDING } from '@Constants/timeItemConstants';
import { OBJECT } from '@Constants/attributeConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { nameMocks } from './nameMocks';

export function generateEventWithDraw(params) {
  const paramsCheck = checkRequiredParameters(params, [{ drawProfile: true, _ofType: OBJECT }]);
  if (paramsCheck.error) return paramsCheck;

  const {
    allUniqueParticipantIds = [],
    participantsProfile = {},
    matchUpStatusProfile,
    completeAllMatchUps,
    autoEntryPositions,
    hydrateCollections,
    randomWinningSide,
    ratingsParameters,
    tournamentRecord,
    isMock = true,
    drawProfile,
    startDate,
    drawIndex,
    uuids,
  } = params;

  const drawProfileCopy = makeDeepCopy(drawProfile, false, true);

  const {
    excessParticipantAlternates = true,
    matchUpFormat = FORMAT_STANDARD,
    drawType = SINGLE_ELIMINATION,
    tournamentAlternates = 0,
    alternatesCount = 0,
    qualifyingPositions,
    qualifyingProfiles,
    generate = true,
    eventExtensions,
    drawExtensions,
    completionGoal,
    tieFormatName,
    buildTeams,
    seedsCount,
    timeItems,
    drawName,
    category,
    publish,
    gender,
    stage,
  } = drawProfileCopy;

  const drawSize = drawProfileCopy.drawSize || (drawProfileCopy.ignoreDefaults ? undefined : 32);

  const eventId = drawProfileCopy.eventId || UUID();
  const eventType = drawProfile.eventType || drawProfile.matchUpType || SINGLES;
  const participantType = eventType === DOUBLES ? PAIR : INDIVIDUAL;

  const tieFormat =
    (isObject(drawProfile.tieFormat) && drawProfile.tieFormat) ||
    (eventType === TEAM &&
      tieFormatDefaults({
        event: { eventId, category, gender },
        namedFormat: tieFormatName,
        hydrateCollections,
        isMock,
      })) ||
    undefined;

  const categoryName = category?.categoryName || category?.ageCategoryCode || category?.ratingType;

  const eventName = drawProfile.eventName || categoryName || `Generated ${eventType}`;
  let targetParticipants = tournamentRecord?.participants || [];

  const qualifyingParticipantsCount =
    (qualifyingProfiles
      ?.flatMap((profile) => profile.structureProfiles || []) // in case each profile contains an array of stageSequences
      .reduce((count, profile) => {
        const qpc =
          !profile.participantsCount || profile.participantsCount > profile.drawSize
            ? profile.drawSize
            : profile.participantsCount || 0;
        return count + qpc;
      }, 0) || 0) * (participantType === PAIR ? 2 : 1);

  const participantsCount =
    (!drawProfile.participantsCount || drawProfile.participantsCount > drawSize
      ? drawSize
      : drawProfile.participantsCount) || 0;

  const event = { eventName, eventType, tieFormat, category, eventId, gender };

  if (Array.isArray(timeItems)) {
    timeItems.forEach((timeItem) => addEventTimeItem({ event, timeItem }));
  }

  let { eventAttributes } = drawProfile;
  if (typeof eventAttributes !== 'object') eventAttributes = {};
  Object.assign(event, eventAttributes);

  // attach any valid eventExtensions
  if (eventExtensions?.length && Array.isArray(eventExtensions)) {
    const extensions = eventExtensions.filter(isValidExtension);
    if (extensions?.length) Object.assign(event, { extensions });
  }

  const uniqueParticipantIds: string[] = [];
  if (
    participantsProfile?.participantsCount === 0 ||
    drawProfile.uniqueParticipants ||
    qualifyingParticipantsCount ||
    !tournamentRecord ||
    gender ||
    category
  ) {
    const drawParticipantsCount = (participantsCount || 0) + alternatesCount + qualifyingParticipantsCount;
    let individualParticipantCount = drawParticipantsCount;
    const gendersCount = { [MALE]: 0, [FEMALE]: 0 };
    let teamSize, genders;

    if (eventType === TEAM) {
      ({ teamSize, genders } = processTieFormat({
        alternatesCount,
        tieFormatName,
        tieFormat,
        drawSize,
      }));

      // Apply teamGenders override from drawProfile (floor, not ceiling)
      const teamGenders = drawProfileCopy.teamGenders;
      if (teamGenders) {
        for (const key of Object.keys(teamGenders)) {
          if (genders[key] !== undefined && teamGenders[key] > genders[key]) {
            genders[key] = teamGenders[key];
          }
        }
        // Ensure teamSize accommodates the overridden gender counts
        const genderTotal = (genders[MALE] || 0) + (genders[FEMALE] || 0);
        if (genderTotal > teamSize) teamSize = genderTotal;
      }

      Object.keys(genders).forEach((key) => {
        const coerced = coercedGender(key);
        if (coerced && isGendered(key) && genders[coerced]) {
          gendersCount[coerced] = drawSize * genders[coerced];
        }
      });
      individualParticipantCount = teamSize * ((drawSize || 0) + qualifyingParticipantsCount);
    }

    const idPrefix = participantsProfile?.idPrefix ? `D-${drawIndex}-${participantsProfile?.idPrefix}` : undefined;

    const result = generateParticipants({
      ...participantsProfile,
      scaledParticipantsCount: drawProfile.scaledParticipantsCount || participantsProfile.scaledParticipantsCount,
      participantsCount: individualParticipantCount,
      consideredDate: tournamentRecord?.startDate,
      sex: gender || participantsProfile?.sex,
      rankingRange: drawProfile.rankingRange,
      uuids: drawProfile.uuids || uuids,
      ratingsParameters,
      participantType,
      gendersCount,
      idPrefix,
      category,
    });
    const unique = result.participants as Participant[];

    // update categoryName **after** generating participants
    if (event.category) event.category.categoryName = categoryName;

    if (tournamentRecord) {
      const result = addParticipants({
        participants: unique,
        tournamentRecord,
      });
      if (result.error) return result;
    }

    unique.forEach(({ participantId }) => uniqueParticipantIds.push(participantId));
    targetParticipants = unique;

    if (eventType === TEAM) {
      const maleIndividualParticipantIds = genders[MALE]
        ? unique
            .filter(({ participantType, person }) => participantType === INDIVIDUAL && person?.sex === MALE)
            .map(getParticipantId)
        : [];
      const femaleIndividualParticipantIds = genders[FEMALE]
        ? unique
            .filter(({ participantType, person }) => participantType === INDIVIDUAL && isFemale(person?.sex))
            .map(getParticipantId)
        : [];
      const remainingParticipantIds = unique
        .filter(({ participantType }) => participantType === INDIVIDUAL)
        .map(getParticipantId)
        .filter(
          (participantId) =>
            !maleIndividualParticipantIds.includes(participantId) &&
            !femaleIndividualParticipantIds.includes(participantId),
        );

      const teamNames = [...(drawProfileCopy.teamNames ?? []), ...nameMocks({ count: drawParticipantsCount }).names];
      const mixedCount = teamSize - (genders[MALE] + genders[FEMALE]);
      // use indices to keep track of positions within pId arrays
      let fIndex = 0,
        mIndex = 0,
        rIndex = 0;
      const teamParticipants = generateRange(0, drawParticipantsCount).map((teamIndex) => {
        const fPIDs = femaleIndividualParticipantIds.slice(fIndex, fIndex + genders[FEMALE]);
        const mPIDs = maleIndividualParticipantIds.slice(mIndex, mIndex + genders[MALE]);
        const rIDs = remainingParticipantIds.slice(rIndex, rIndex + mixedCount);
        fIndex += genders[FEMALE];
        mIndex += genders[MALE];
        rIndex += mixedCount;

        const individualParticipantIds = buildTeams !== false ? [...fPIDs, ...mPIDs, ...rIDs] : []; // NOSONAR
        return {
          participantName: teamNames[teamIndex] || `Team ${teamIndex + 1}`,
          participantOtherName: `TM${teamIndex + 1}`,
          participantRole: COMPETITOR,
          individualParticipantIds,
          participantType: TEAM,
          participantId: UUID(),
        };
      });
      const result = addParticipants({
        participants: teamParticipants as Participant[],
        tournamentRecord,
      });
      if (!result.success) return result;
      targetParticipants = teamParticipants;
    }
  }

  const isEventParticipantType = (participant) => {
    const { participantType } = participant;
    if (isMatchUpEventType(SINGLES)(eventType) && participantType === INDIVIDUAL) return true;
    if (isMatchUpEventType(DOUBLES)(eventType) && participantType === PAIR) return true;
    return eventType === TEAM && participantType === TEAM;
  };

  const isEventGender = (participant) => {
    if (!drawProfile.gender) return true;
    if (participant.person?.sex === drawProfile.gender) return true;
    return participant.individualParticipantIds?.some((participantId) => {
      const individualParticipant = targetParticipants.find((p) => p.participantId === participantId);
      return individualParticipant && isEventGender(individualParticipant);
    });
  };

  const consideredParticipants = targetParticipants
    .filter(isEventParticipantType)
    .filter(isEventGender)
    .filter(({ participantId }) => !allUniqueParticipantIds.includes(participantId));

  const participantIds = consideredParticipants.slice(0, participantsCount).map((p) => p.participantId);

  if (isMock && participantIds?.length) {
    const result = addEventEntries({
      autoEntryPositions,
      entryStage: stage,
      tournamentRecord,
      participantIds,
      event,
    });
    if (result.error) return result;
  }

  const qualifyingParticipantIds = qualifyingParticipantsCount
    ? consideredParticipants
        .slice(participantsCount, participantsCount + qualifyingParticipantsCount)
        .map((p) => p.participantId)
    : 0;

  if (isMock && qualifyingParticipantIds?.length) {
    let qualifyingIndex = 0; // used to take slices of participants array
    let roundTarget = 1;

    const sequenceSort = (a, b) => a.stageSequence - b.stageSequence;
    const roundTargetSort = (a, b) => a.roundTarget - b.roundTarget;

    for (const roundTargetProfile of qualifyingProfiles.sort(roundTargetSort)) {
      roundTarget = roundTargetProfile.roundTarget || roundTarget;
      let entryStageSequence = 1;
      let qualifyingPositions;

      for (const structureProfile of roundTargetProfile.structureProfiles.sort(sequenceSort)) {
        const drawSize = structureProfile.drawSize || coerceEven(structureProfile.participantsCount);
        const participantsCount = drawSize - (qualifyingPositions || 0); // minus qualifyingPositions
        const participantIds = qualifyingParticipantIds.slice(qualifyingIndex, qualifyingIndex + participantsCount);
        const result = addEventEntries({
          entryStage: QUALIFYING,
          entryStageSequence,
          autoEntryPositions,
          tournamentRecord,
          participantIds,
          roundTarget,
          event,
        });

        if (result.error) {
          return result;
        }

        qualifyingPositions = structureProfile.qualifyingPositions;
        qualifyingIndex += participantsCount;
        entryStageSequence += 1;
      }

      roundTarget += 1;
    }
  }

  // alternates can still be taken from existing participants
  // when unique participants are used for DIRECT_ACCEPTANCE entries
  const alternatesParticipantIds =
    excessParticipantAlternates &&
    tournamentRecord?.participants
      ?.filter(({ participantId }) => !participantIds.includes(participantId))
      .filter(isEventParticipantType)
      .filter(isEventGender)
      .slice(0, alternatesCount || drawSize - participantsCount || tournamentAlternates)
      .map((p) => p.participantId);

  if (isMock && alternatesParticipantIds?.length) {
    const result = addEventEntries({
      participantIds: alternatesParticipantIds,
      autoEntryPositions: false,
      entryStatus: ALTERNATE,
      tournamentRecord,
      event,
    });
    if (result.error) return result.error;
  }

  // now add seeding information for seedsCount participants
  const seedingScaleName = categoryName || eventName;
  if (tournamentRecord && seedsCount && seedsCount <= participantIds.length) {
    const scaleValues = generateRange(1, seedsCount + 1);
    scaleValues.forEach((scaleValue, index) => {
      const scaleItem = {
        scaleName: seedingScaleName,
        scaleDate: startDate,
        scaleType: SEEDING,
        scaleValue,
        eventType,
      };
      const participantId = participantIds[index];
      setParticipantScaleItem({ tournamentRecord, participantId, scaleItem });
    });
  }

  const result = generateDrawDefinition({
    ...makeDeepCopy(drawProfile, false, true),
    tournamentRecord,
    seedingScaleName,
    matchUpFormat,
    eventId,
    isMock,
    event,
  });

  if (result.error) return result;
  if (!result.drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  const { drawDefinition } = result;
  const drawId = drawDefinition.drawId;

  if (Array.isArray(drawExtensions)) {
    drawExtensions
      .filter(isValidExtension)
      .forEach((extension) => addExtension({ element: drawDefinition, extension }));
  }

  if (generate) {
    addDrawDefinition({ drawDefinition, event, suppressNotifications: true });

    const manual = drawProfile.automated === false;
    if (isMock && !manual) {
      // NOTE: completionGoal needs to come before outcomes array because setMatchUpStatus has integrity checks
      // ... which may require positionAssignments and/or drawPositions to have been propagated
      const goComplete = (p) => {
        const result = completeDrawMatchUps({
          completeAllMatchUps: p.completeAllMatchUps,
          completionGoal: p.completionGoal,
          matchUpStatusProfile,
          // qualifyingProfiles,
          randomWinningSide,
          tournamentRecord,
          drawDefinition,
          matchUpFormat,
          event,
        });
        if (result.error) return result;
        const completedCount = result.completedCount;

        if (drawType === ROUND_ROBIN_WITH_PLAYOFF) {
          const mainStructure = drawDefinition.structures?.find((structure) => structure.stage === MAIN);
          if (!mainStructure) return { error: STRUCTURE_NOT_FOUND };

          automatedPlayoffPositioning({
            structureId: mainStructure.structureId,
            tournamentRecord,
            drawDefinition,
            event,
          });
          // ignore when positioning cannot occur because of incomplete source structure

          const playoffCompletionGoal = completionGoal ? completionGoal - (completedCount ?? 0) : undefined;
          const result = completeDrawMatchUps({
            completionGoal: completionGoal ? playoffCompletionGoal : undefined,
            matchUpStatusProfile,
            completeAllMatchUps,
            randomWinningSide,
            tournamentRecord,
            drawDefinition,
            matchUpFormat,
            event,
          });
          if (result.error) return result;
        }
        return undefined;
      };

      // NOTE: completionGoal implies something less than "all matchUps"
      // ==> do this first with the assumption that any outcomes must come after
      if (completionGoal) goComplete({ completionGoal });

      if (drawProfile.outcomes) {
        const { matchUps } = allDrawMatchUps({
          inContext: true,
          drawDefinition,
          event,
        });
        for (const outcomeDef of drawProfile.outcomes) {
          const {
            matchUpStatus = COMPLETED,
            matchUpStatusCodes,
            stageSequence = 1,
            matchUpIndex = 0,
            structureOrder, // like a group number; for RR = the order of the structureType: ITEM within structureType: CONTAINER
            matchUpFormat,
            drawPositions,
            roundPosition,
            stage = MAIN,
            roundNumber,
            winningSide,
            scoreString,
          } = outcomeDef;

          const structureMatchUpIds =
            matchUps?.reduce((sm, matchUp) => {
              const { structureId, matchUpId } = matchUp;
              if (sm[structureId]) {
                sm[structureId].push(matchUpId);
              } else {
                sm[structureId] = [matchUpId];
              }
              return sm;
            }, {}) ?? [];

          const orderedStructures = Object.assign(
            {},
            ...Object.keys(structureMatchUpIds).map((structureId, index) => ({
              [structureId]: index + 1,
            })),
          );

          const targetMatchUps = matchUps?.filter((matchUp) => {
            return (
              (!stage || matchUp.stage === stage) &&
              (!stageSequence || matchUp.stageSequence === stageSequence) &&
              (!roundNumber || matchUp.roundNumber === roundNumber) &&
              (!roundPosition || matchUp.roundPosition === roundPosition) &&
              (!structureOrder || orderedStructures[matchUp.structureId] === structureOrder) &&
              (!drawPositions || intersection(drawPositions, matchUp.drawPositions).length === 2)
            );
          });

          // targeting only one matchUp, specified by the index in the array of returned matchUps
          const targetMatchUp = targetMatchUps?.[matchUpIndex];

          const result = completeDrawMatchUp({
            matchUpStatusCodes,
            tournamentRecord,
            drawDefinition,
            targetMatchUp,
            matchUpFormat,
            matchUpStatus,
            scoreString,
            winningSide,
          });
          // will not throw errors for BYE matchUps
          if (result?.error) return result;
        }
      }

      // NOTE: do this last => complete any matchUps which have not already been completed
      if (completeAllMatchUps) goComplete({ completeAllMatchUps });
    }

    if (publish) {
      publishEvent({ tournamentRecord, event });
    }
  } else {
    const result = addFlight({
      drawEntries: drawDefinition.entries,
      drawName: drawName || drawType,
      qualifyingPositions,
      drawId,
      event,
      stage,
    });
    if (result.error) {
      return result;
    }
  }

  return {
    ...SUCCESS,
    event: definedAttributes(event),
    uniqueParticipantIds,
    targetParticipants,
    drawDefinition,
    eventId,
    drawId,
  };
}
