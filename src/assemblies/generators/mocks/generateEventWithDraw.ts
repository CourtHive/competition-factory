import { generateDrawDefinition } from '../drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { completeDrawMatchUps, completeDrawMatchUp } from './completeDrawMatchUps';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { drawMatic } from '../drawDefinitions/drawTypes/adHoc/drawMatic/drawMatic';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { addAdHocMatchUps } from '@Mutate/structures/addAdHocMatchUps';
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
import { SINGLES, DOUBLES, HYBRID } from '@Constants/eventConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { SEEDING } from '@Constants/timeItemConstants';
import { OBJECT } from '@Constants/attributeConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { nameMocks } from './nameMocks';

function generateEventParticipants({
  qualifyingParticipantsCount,
  participantsProfile,
  drawParticipantsCount,
  ratingsParameters,
  tournamentRecord,
  drawProfileCopy,
  participantType,
  categoryName,
  drawProfile,
  buildTeams,
  eventType,
  drawSize,
  isHybrid,
  drawIndex,
  category,
  gender,
  random,
  event,
  uuids,
}) {
  let individualParticipantCount = drawParticipantsCount;
  const gendersCount = { [MALE]: 0, [FEMALE]: 0 };
  let teamSize, genders;

  if (isHybrid) {
    // HYBRID: half entries are INDIVIDUAL, half are PAIR
    // Need extra individuals to form the pairs
    const pairCount = Math.floor(drawParticipantsCount / 2);
    individualParticipantCount = drawParticipantsCount - pairCount + pairCount * 2;
  }

  if (eventType === TEAM) {
    ({ teamSize, genders } = processTieFormat({
      tieFormatName: drawProfileCopy.tieFormatName,
      tieFormat: drawProfileCopy.tieFormat,
      alternatesCount: drawProfileCopy.alternatesCount || 0,
      drawSize,
      random,
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
    random,
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

  const uniqueParticipantIds: string[] = [];
  unique.forEach(({ participantId }) => uniqueParticipantIds.push(participantId));
  let targetParticipants: any = unique;

  if (eventType === TEAM) {
    const teamResult: any = buildTeamParticipants({
      drawParticipantsCount,
      tournamentRecord,
      drawProfileCopy,
      buildTeams,
      genders,
      teamSize,
      unique,
      random,
    });
    if (teamResult.error) return teamResult;
    targetParticipants = teamResult.teamParticipants;
  }

  if (isHybrid) {
    const hybridResult: any = buildHybridParticipants({
      drawParticipantsCount,
      tournamentRecord,
      unique,
      random,
    });
    if (hybridResult.error) return hybridResult;
    targetParticipants = hybridResult.targetParticipants;
  }

  return { uniqueParticipantIds, targetParticipants };
}

function buildTeamParticipants({
  drawParticipantsCount,
  tournamentRecord,
  drawProfileCopy,
  buildTeams,
  genders,
  teamSize,
  unique,
  random,
}) {
  const maleIndividualParticipantIds = genders[MALE]
    ? unique
        .filter(({ participantType: pt, person }) => pt === INDIVIDUAL && person?.sex === MALE)
        .map(getParticipantId)
    : [];
  const femaleIndividualParticipantIds = genders[FEMALE]
    ? unique
        .filter(({ participantType: pt, person }) => pt === INDIVIDUAL && isFemale(person?.sex))
        .map(getParticipantId)
    : [];
  const maleSet = new Set(maleIndividualParticipantIds);
  const femaleSet = new Set(femaleIndividualParticipantIds);
  const remainingParticipantIds = unique
    .filter(({ participantType: pt }) => pt === INDIVIDUAL)
    .map(getParticipantId)
    .filter((pid) => !maleSet.has(pid) && !femaleSet.has(pid));

  const teamNames = [
    ...(drawProfileCopy.teamNames ?? []),
    ...nameMocks({ count: drawParticipantsCount, random }).names,
  ];
  const mixedCount = teamSize - (genders[MALE] + genders[FEMALE]);
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
      participantId: UUID(undefined, random),
      participantRole: COMPETITOR,
      individualParticipantIds,
      participantType: TEAM,
    };
  });
  const result = addParticipants({
    participants: teamParticipants as Participant[],
    tournamentRecord,
  });
  if (!result.success) return result;
  return { teamParticipants };
}

function buildHybridParticipants({ drawParticipantsCount, tournamentRecord, unique, random }) {
  const individuals = unique.filter(({ participantType: pt }) => pt === INDIVIDUAL);
  const soloCount = drawParticipantsCount - Math.floor(drawParticipantsCount / 2);
  const pairMemberIndividuals = individuals.slice(soloCount);
  const pairParticipants: any[] = [];

  for (let i = 0; i + 1 < pairMemberIndividuals.length; i += 2) {
    const m1 = pairMemberIndividuals[i];
    const m2 = pairMemberIndividuals[i + 1];
    pairParticipants.push({
      participantName: `${m1.person?.standardGivenName ?? 'A'} / ${m2.person?.standardGivenName ?? 'B'}`,
      individualParticipantIds: [m1.participantId, m2.participantId],
      participantRole: COMPETITOR,
      participantType: PAIR,
      participantId: UUID(undefined, random),
    });
  }

  if (pairParticipants.length && tournamentRecord) {
    const result = addParticipants({
      participants: pairParticipants as Participant[],
      tournamentRecord,
    });
    if (!result.success) return result;
  }

  return { targetParticipants: [...individuals.slice(0, soloCount), ...pairParticipants] };
}

function addQualifyingEntries({
  qualifyingParticipantIds,
  autoEntryPositions,
  qualifyingProfiles,
  tournamentRecord,
  event,
}) {
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

  return undefined;
}

function processOutcomes({
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawDefinition,
  completionGoal,
  matchUpFormat,
  drawProfile,
  drawType,
  random,
  event,
}) {
  const goComplete = (p) => {
    const result = completeDrawMatchUps({
      completeAllMatchUps: p.completeAllMatchUps,
      completionGoal: p.completionGoal,
      matchUpStatusProfile,
      randomWinningSide,
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      random,
      event,
    });
    if (result.error) return result;

    if (drawType === ROUND_ROBIN_WITH_PLAYOFF) {
      const rrResult = completeRoundRobinPlayoff({
        completedCount: result.completedCount,
        matchUpStatusProfile,
        completeAllMatchUps,
        randomWinningSide,
        tournamentRecord,
        drawDefinition,
        completionGoal,
        matchUpFormat,
        random,
        event,
      });
      if (rrResult?.error) return rrResult;
    }
    return undefined;
  };

  // NOTE: completionGoal implies something less than "all matchUps"
  // ==> do this first with the assumption that any outcomes must come after
  if (completionGoal) goComplete({ completionGoal });

  if (drawProfile.outcomes) {
    const outcomesResult = applyDefinedOutcomes({
      outcomes: drawProfile.outcomes,
      tournamentRecord,
      drawDefinition,
      event,
    });
    if (outcomesResult?.error) return outcomesResult;
  }

  // NOTE: do this last => complete any matchUps which have not already been completed
  if (completeAllMatchUps) goComplete({ completeAllMatchUps });

  return { goComplete };
}

function completeRoundRobinPlayoff({
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawDefinition,
  completedCount,
  completionGoal,
  matchUpFormat,
  random,
  event,
}) {
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
    random,
    event,
  });
  if (result.error) return result;

  return undefined;
}

function applyDefinedOutcomes({ tournamentRecord, drawDefinition, outcomes, event }) {
  const { matchUps } = allDrawMatchUps({
    inContext: true,
    drawDefinition,
    event,
  });

  const orderedStructures = buildOrderedStructures(matchUps);

  for (const outcomeDef of outcomes) {
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

  return undefined;
}

function buildOrderedStructures(matchUps) {
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

  return Object.assign(
    {},
    ...Object.keys(structureMatchUpIds).map((structureId, index) => ({
      [structureId]: index + 1,
    })),
  );
}

function processIterativeAdHoc({
  tournamentRecord,
  drawDefinition,
  drawProfileCopy,
  drawProfile,
  goComplete,
  category,
  isMock,
  event,
}) {
  const totalRounds = drawProfileCopy.roundsCount;
  const scaleName = drawProfile.drawMatic?.scaleName ?? drawProfile.scaleName ?? category?.ratingType;

  for (let i = 2; i <= totalRounds; i++) {
    // Generate next round using drawMatic with dynamic ratings
    const drawMaticResult = drawMatic({
      eventType: drawProfile.drawMatic?.eventType ?? drawProfile.matchUpType,
      updateParticipantRatings: !!scaleName,
      dynamicRatings: !!scaleName,
      generateMatchUps: true,
      tournamentRecord,
      drawDefinition,
      roundsCount: 1,
      scaleName,
      isMock,
      event,
    });
    if (drawMaticResult.error) return drawMaticResult;

    if (drawMaticResult.matchUps?.length) {
      const addResult = addAdHocMatchUps({
        matchUps: drawMaticResult.matchUps,
        suppressNotifications: true,
        tournamentRecord,
        drawDefinition,
        event,
      });
      if (addResult.error) return addResult;
    }

    // Complete this round's matchUps
    const completeResult = goComplete({ completeAllMatchUps: true });
    if (completeResult?.error) return completeResult;
  }

  return undefined;
}

function addMockEntries({
  qualifyingParticipantsCount,
  consideredParticipants,
  isEventParticipantType,
  excessParticipantAlternates,
  tournamentAlternates,
  autoEntryPositions,
  qualifyingProfiles,
  participantsCount,
  alternatesCount,
  tournamentRecord,
  participantIds,
  isEventGender,
  drawSize,
  isMock,
  event,
  stage,
}) {
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
    const qResult = addQualifyingEntries({
      qualifyingParticipantIds,
      autoEntryPositions,
      qualifyingProfiles,
      tournamentRecord,
      event,
    });
    if (qResult?.error) return qResult;
  }

  const participantIdSet = new Set(participantIds);
  const alternatesParticipantIds =
    excessParticipantAlternates &&
    tournamentRecord?.participants
      ?.filter(({ participantId }) => !participantIdSet.has(participantId))
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

  return undefined;
}

function applySeedingScales({ tournamentRecord, participantIds, seedingScaleName, seedsCount, startDate, eventType }) {
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
}

function generateAndAttachDraw({
  matchUpStatusProfile,
  completeAllMatchUps,
  randomWinningSide,
  tournamentRecord,
  drawProfileCopy,
  seedingScaleName,
  drawExtensions,
  iterativeAdHoc,
  completionGoal,
  matchUpFormat,
  drawProfile,
  drawType,
  category,
  generate,
  drawName,
  isMock,
  random,
  eventId,
  publish,
  event,
  qualifyingPositions,
  stage,
}) {
  const drawProfileForGeneration = iterativeAdHoc
    ? { ...makeDeepCopy(drawProfile, false, true), roundsCount: 1 }
    : makeDeepCopy(drawProfile, false, true);

  const result = generateDrawDefinition({
    ...drawProfileForGeneration,
    tournamentRecord,
    seedingScaleName,
    matchUpFormat,
    eventId,
    isMock,
    random,
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
      const outcomesResult: any = processOutcomes({
        matchUpStatusProfile,
        completeAllMatchUps,
        randomWinningSide,
        tournamentRecord,
        drawDefinition,
        completionGoal,
        matchUpFormat,
        drawProfile,
        drawType,
        random,
        event,
      });
      if (outcomesResult?.error) return outcomesResult;

      if (iterativeAdHoc) {
        const adHocResult = processIterativeAdHoc({
          goComplete: outcomesResult.goComplete,
          tournamentRecord,
          drawDefinition,
          drawProfileCopy,
          drawProfile,
          category,
          isMock,
          event,
        });
        if (adHocResult?.error) return adHocResult;
      }
    }

    if (publish) {
      publishEvent({ tournamentRecord, event });
    }
  } else {
    const flightResult = addFlight({
      drawEntries: drawDefinition.entries,
      drawName: drawName || drawType,
      qualifyingPositions,
      drawId,
      event,
      stage,
    });
    if (flightResult.error) return flightResult;
  }

  return { drawDefinition, drawId };
}

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
    random,
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

  const eventId = drawProfileCopy.eventId || UUID(undefined, random);
  const eventType = drawProfile.eventType || drawProfile.matchUpType || SINGLES;
  const isHybrid = eventType === HYBRID;
  const participantType = eventType === DOUBLES ? PAIR : INDIVIDUAL;

  const tieFormat = resolveTieFormat({
    drawProfile,
    tournamentRecord,
    eventId,
    eventType,
    category,
    gender,
    tieFormatName,
    hydrateCollections,
    isMock,
  });

  const categoryName = category?.categoryName || category?.ageCategoryCode || category?.ratingType;

  const eventName = drawProfile.eventName || categoryName || `Generated ${eventType}`;
  let targetParticipants = tournamentRecord?.participants ?? [];

  const qualifyingParticipantsCount = calcQualifyingParticipantsCount({ qualifyingProfiles, participantType });

  const participantsCount =
    (!drawProfile.participantsCount || drawProfile.participantsCount > drawSize
      ? drawSize
      : drawProfile.participantsCount) || 0;

  const event = buildMockEvent({
    eventName,
    eventType,
    tieFormat,
    category,
    eventId,
    gender,
    timeItems,
    drawProfile,
    eventExtensions,
  });

  const uniqueParticipantIds: string[] = [];
  const needsUniqueParticipants =
    participantsProfile?.participantsCount === 0 ||
    drawProfile.uniqueParticipants ||
    qualifyingParticipantsCount ||
    !tournamentRecord ||
    gender ||
    category ||
    isHybrid;

  if (needsUniqueParticipants) {
    const drawParticipantsCount = (participantsCount || 0) + alternatesCount + qualifyingParticipantsCount;

    const genResult = generateEventParticipants({
      qualifyingParticipantsCount,
      participantsProfile,
      drawParticipantsCount,
      ratingsParameters,
      tournamentRecord,
      drawProfileCopy,
      participantType,
      categoryName,
      drawProfile,
      buildTeams,
      eventType,
      drawSize,
      isHybrid,
      drawIndex,
      category,
      gender,
      random,
      event,
      uuids,
    });
    if (genResult.error) return genResult;

    genResult.uniqueParticipantIds.forEach((id) => uniqueParticipantIds.push(id));
    targetParticipants = genResult.targetParticipants;
  }

  const { consideredParticipants, participantIds, isEventParticipantType, isEventGender } =
    filterConsideredParticipants({
      allUniqueParticipantIds,
      targetParticipants,
      participantsCount,
      drawProfile,
      eventType,
      isHybrid,
    });

  const entriesResult: any = addMockEntries({
    qualifyingParticipantsCount,
    consideredParticipants,
    isEventParticipantType,
    excessParticipantAlternates,
    tournamentAlternates,
    autoEntryPositions,
    qualifyingProfiles,
    participantsCount,
    alternatesCount,
    tournamentRecord,
    participantIds,
    isEventGender,
    drawSize,
    isMock,
    event,
    stage,
  });
  if (entriesResult?.error) return entriesResult;

  const seedingScaleName = categoryName || eventName;
  applySeedingScales({
    tournamentRecord,
    participantIds,
    seedingScaleName,
    seedsCount,
    startDate,
    eventType,
  });

  const iterativeAdHoc =
    isAdHocType(drawType) &&
    completeAllMatchUps &&
    drawProfile.automated !== false &&
    (drawProfileCopy.roundsCount ?? 1) > 1;

  const genResult: any = generateAndAttachDraw({
    matchUpStatusProfile,
    completeAllMatchUps,
    randomWinningSide,
    tournamentRecord,
    drawProfileCopy,
    seedingScaleName,
    drawExtensions,
    iterativeAdHoc,
    completionGoal,
    matchUpFormat,
    drawProfile,
    drawType,
    category,
    generate,
    drawName,
    isMock,
    random,
    eventId,
    publish,
    event,
    qualifyingPositions,
    stage,
  });
  if (genResult.error) return genResult;

  return {
    ...SUCCESS,
    event: definedAttributes(event),
    drawDefinition: genResult.drawDefinition,
    uniqueParticipantIds,
    targetParticipants,
    eventId,
    drawId: genResult.drawId,
  };
}

function calcQualifyingParticipantsCount({ qualifyingProfiles, participantType }) {
  const rawCount =
    qualifyingProfiles
      ?.flatMap((profile) => profile.structureProfiles ?? [])
      .reduce((count, profile) => {
        const qpc =
          !profile.participantsCount || profile.participantsCount > profile.drawSize
            ? profile.drawSize
            : profile.participantsCount || 0;
        return count + qpc;
      }, 0) || 0;
  return rawCount * (participantType === PAIR ? 2 : 1);
}

function buildMockEvent({
  eventName,
  eventType,
  tieFormat,
  category,
  eventId,
  gender,
  timeItems,
  drawProfile,
  eventExtensions,
}) {
  const event = { eventName, eventType, tieFormat, category, eventId, gender };

  if (Array.isArray(timeItems)) {
    timeItems.forEach((timeItem) => addEventTimeItem({ event, timeItem }));
  }

  let { eventAttributes } = drawProfile;
  if (typeof eventAttributes !== 'object') eventAttributes = {};
  Object.assign(event, eventAttributes);

  if (eventExtensions?.length && Array.isArray(eventExtensions)) {
    const extensions = eventExtensions.filter(isValidExtension);
    if (extensions?.length) Object.assign(event, { extensions });
  }

  return event;
}

function resolveTieFormat({
  drawProfile,
  tournamentRecord,
  eventId,
  eventType,
  category,
  gender,
  tieFormatName,
  hydrateCollections,
  isMock,
}) {
  if (isObject(drawProfile.tieFormat)) return drawProfile.tieFormat;

  if (drawProfile.tieFormatId) {
    const found = tournamentRecord?.events
      ?.find((e) => e.eventId === eventId)
      ?.tieFormats?.find((tf) => tf.tieFormatId === drawProfile.tieFormatId);
    if (found) return found;
  }

  if (eventType === TEAM) {
    return tieFormatDefaults({
      event: { eventId, category, gender },
      namedFormat: tieFormatName,
      hydrateCollections,
      isMock,
    });
  }

  return undefined;
}

function filterConsideredParticipants({
  allUniqueParticipantIds,
  targetParticipants,
  participantsCount,
  drawProfile,
  eventType,
  isHybrid,
}) {
  const isEventParticipantType = (participant) => {
    const { participantType } = participant;
    if (isHybrid && (participantType === INDIVIDUAL || participantType === PAIR)) return true;
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

  const allUniqueSet = new Set(allUniqueParticipantIds);
  const consideredParticipants = targetParticipants
    .filter(isEventParticipantType)
    .filter(isEventGender)
    .filter(({ participantId }) => !allUniqueSet.has(participantId));

  const participantIds = consideredParticipants.slice(0, participantsCount).map((p) => p.participantId);

  return { consideredParticipants, participantIds, isEventParticipantType, isEventGender };
}
