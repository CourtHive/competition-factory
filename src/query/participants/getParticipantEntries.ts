import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getEventSeedAssignments } from '@Query/event/getEventSeedAssignments';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { getDrawId, getParticipantId } from '@Functions/global/extractors';
import { processEventEntry } from '@Query/participant/processEventEntry';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { getPublishState } from '@Query/publishing/getPublishState';
import { addScheduleItem } from '@Query/matchUps/addScheduleItem';
import { structureSort } from '@Functions/sorters/structureSort';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { timeSort, timeStringMinutes } from '@Tools/dateTime';
import { extensionsToAttributes } from '@Tools/makeDeepCopy';
import { processSides } from '@Query/matchUps/processSides';
import { definedAttributes } from '@Tools/definedAttributes';
import { stringSort } from '@Functions/sorters/stringSort';
import { isExit } from '@Validators/isExit';
import { isObject } from '@Tools/objects';

// constants and types
import { UNGROUPED, UNPAIRED } from '@Constants/entryStatusConstants';
import { CONTAINER, MAIN, PLAY_OFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { WIN_RATIO } from '@Constants/statsConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { unique } from '@Tools/arrays';

export function getParticipantEntries(params) {
  const {
    participantFilters,
    convertExtensions,
    policyDefinitions,
    tournamentRecord,
    usePublishState,
    contextFilters,
    matchUpFilters,
    participantMap,
    contextProfile,

    withPotentialMatchUps,
    withRankingProfile,
    withScheduleItems,
    scheduleAnalysis,
    withTeamMatchUps,
    withStatistics,
    withOpponents,
    withMatchUps,
    withSeeding,
    withEvents,
    withDraws,
  } = params;

  const targetParticipantIds = participantFilters?.participantIds;
  const getRelevantParticipantIds = (participantId) => {
    const relevantParticipantIds = [participantId];
    participantMap[participantId]?.participant.individualParticipantIds?.forEach((individualParticiapntId) =>
      relevantParticipantIds.push(individualParticiapntId),
    );

    return relevantParticipantIds.some((id) => !targetParticipantIds?.length || targetParticipantIds.includes(id))
      ? relevantParticipantIds
      : [];
  };

  const withOpts = {
    withMatchUps: withMatchUps || withRankingProfile,
    withEvents: withEvents || withRankingProfile,
    withDraws: withDraws || withRankingProfile,
    withPotentialMatchUps,
    withRankingProfile,
    withScheduleItems,
    scheduleAnalysis,
    withTeamMatchUps,
    withStatistics,
    participantMap,
    withOpponents,
    withSeeding,
  };

  const participantIdsWithConflicts: string[] = [];
  const mappedMatchUps: { [key: string]: HydratedMatchUp } = {};
  const matchUps: HydratedMatchUp[] = [];
  const eventsPublishStatuses = {};
  const derivedEventInfo: any = {};
  const derivedDrawInfo: any = {};

  // RR group matchUp collection for tally-based finishing positions
  const rrGroupMatchUps: { [structureId: string]: HydratedMatchUp[] } = {};
  const rrContainerInfo: { [containerStructureId: string]: { drawDefinition: any; drawId: string } } = {};

  const getRanking = ({ eventType, scaleNames, participantId }) =>
    participantMap[participantId]?.participant?.rankings?.[eventType]?.find((ranking) =>
      scaleNames.includes(ranking.scaleName),
    )?.scaleValue;

  for (const event of tournamentRecord?.events || []) {
    if (participantFilters?.eventIds && !participantFilters.eventIds.includes(event.eventId)) continue;

    const {
      drawDefinitions = [],
      extensions = [],
      wheelchairClass,
      eventType,
      eventName,
      category,
      entries,
      eventId,
      gender,
    } = event;

    const { flightProfile } = getFlightProfile({ event });
    const flights = flightProfile?.flights ?? [];

    const publishStatuses = getPublishState({ event }).publishState;
    if (publishStatuses) eventsPublishStatuses[eventId] = publishStatuses;
    const publishedSeeding = publishStatuses?.status?.publishedSeeding;

    if (withEvents || withSeeding || withRankingProfile) {
      const extensionConversions = convertExtensions
        ? Object.assign({}, ...extensionsToAttributes(extensions ?? []))
        : {};

      derivedEventInfo[eventId] = {
        ...extensionConversions,
        wheelchairClass,
        eventName,
        eventType,
        category,
        eventId,
        gender,
      };

      const scaleNames = [category?.categoryName, category?.ageCategoryCode].filter(Boolean);

      for (const entry of entries) {
        const { participantId } = entry;
        if (!participantId || !participantMap[participantId]) continue; // handle bad data

        // get event ranking; this is the same for pairs, teams and all individual participants
        const ranking = getRanking({ eventType, scaleNames, participantId });

        let seedAssignments, seedValue;
        if (withSeeding) {
          const participant = participantMap[participantId].participant;
          ({ seedAssignments, seedValue } = getEventSeedAssignments({
            publishedSeeding,
            usePublishState,
            withSeeding,
            participant,
            event,
          }));
        }
        // IMPORTANT NOTE!
        // id is the pair, team or individual participant currently being processed
        // whereas participantId is the id of the entry into the event
        const addEventEntry = (id: string) => {
          if (participantMap[id]?.events?.[eventId]) return;
          const participant = participantMap[id];

          processEventEntry({
            convertExtensions,
            seedAssignments,
            participant,
            withSeeding,
            seedValue,
            eventId,
            ranking,
            entry,
          });
        };

        addEventEntry(participantId);

        // add details for individualParticipantIds for TEAM/PAIR events
        const individualParticipantIds = participantMap[participantId].participant.individualParticipantIds || [];
        individualParticipantIds.forEach(addEventEntry);
      }
    }
    const eventPublishedSeeding = eventsPublishStatuses?.[eventId]?.publishedSeeding;

    if (withDraws || withRankingProfile || withSeeding) {
      const drawIds = unique([...drawDefinitions.map(getDrawId), ...flights.map(getDrawId)]);

      for (const drawId of drawIds) {
        processDrawEntries({
          drawDefinitions,
          participantMap,
          derivedDrawInfo,
          eventPublishedSeeding,
          usePublishState,
          withRankingProfile,
          withSeeding,
          withDraws,
          eventType,
          category,
          eventId,
          flights,
          drawId,
          getRanking,
        });
      }
    }

    if (
      withRankingProfile ||
      scheduleAnalysis ||
      withTeamMatchUps ||
      withStatistics ||
      withOpponents ||
      withMatchUps ||
      withDraws
    ) {
      const nextMatchUps = !!scheduleAnalysis || withPotentialMatchUps;
      const eventMatchUps =
        allEventMatchUps({
          afterRecoveryTimes: !!scheduleAnalysis,
          policyDefinitions,
          tournamentRecord,
          inContext: true,
          participantMap,
          contextFilters,
          matchUpFilters,
          contextProfile,
          nextMatchUps,
          event,
        })?.matchUps ?? [];

      for (const matchUp of eventMatchUps) {
        processEventMatchUp({
          getRelevantParticipantIds,
          withScheduleItems,
          tournamentRecord,
          drawDefinitions,
          scheduleAnalysis,
          withRankingProfile,
          rrContainerInfo,
          rrGroupMatchUps,
          mappedMatchUps,
          participantMap,
          nextMatchUps,
          withOpts,
          matchUp,
        });
      }

      matchUps.push(...eventMatchUps);
    }
  }

  const rrFinishingPositions = computeRRFinishingPositions(rrGroupMatchUps, rrContainerInfo, withRankingProfile);

  if (withStatistics || withRankingProfile || !!scheduleAnalysis) {
    const conflicts = computeStatisticsAndRankingProfile({
      rrFinishingPositions,
      withRankingProfile,
      scheduleAnalysis,
      withStatistics,
      derivedDrawInfo,
      participantMap,
    });
    participantIdsWithConflicts.push(...conflicts);
  }

  return {
    participantIdsWithConflicts,
    eventsPublishStatuses,
    derivedEventInfo,
    derivedDrawInfo,
    mappedMatchUps,
    participantMap,
    matchUps,
  };
}

function getSeedingMap(assignments) {
  return assignments
    ? Object.assign(
        {},
        ...assignments.map(({ participantId, seedValue, seedNumber }) => ({
          [participantId]: { seedValue, seedNumber },
        })),
      )
    : undefined;
}

function addParticipantDrawEntrySeedings({
  participantMap,
  id,
  participantId,
  eventId,
  eventType,
  drawId,
  mainSeedingMap,
  qualifyingSeedingMap,
  seedingPublished,
  withSeeding,
}) {
  const includeSeeding = withSeeding && seedingPublished;

  const seedAssignments = includeSeeding ? {} : undefined;
  const mainSeeding = includeSeeding
    ? mainSeedingMap?.[participantId]?.seedValue || mainSeedingMap?.[participantId]?.seedNumber
    : undefined;
  const mainSeedingAssignments = mainSeeding ? mainSeedingMap?.[participantId] : undefined;
  const qualifyingSeeding = includeSeeding
    ? qualifyingSeedingMap?.[participantId]?.seedValue || qualifyingSeedingMap?.[participantId]?.seedNumber
    : undefined;
  const qualifyingSeedingAssignments = qualifyingSeeding ? qualifyingSeedingMap?.[participantId] : undefined;

  if (seedAssignments && mainSeeding) seedAssignments[MAIN] = mainSeedingAssignments;
  if (seedAssignments && qualifyingSeeding) seedAssignments[QUALIFYING] = qualifyingSeedingAssignments;

  const seedValue = mainSeeding || qualifyingSeeding;
  if (seedValue) {
    if (!participantMap[id].participant.seedings[eventType])
      participantMap[id].participant.seedings[eventType] = [];

    if (mainSeedingAssignments) {
      participantMap[id].participant.seedings[eventType].push({
        ...mainSeedingAssignments,
        scaleName: drawId,
      });
    }
    if (qualifyingSeedingAssignments) {
      participantMap[id].participant.seedings[eventType].push({
        ...qualifyingSeedingAssignments,
        scaleName: drawId,
      });
    }

    if (seedAssignments) {
      if (!participantMap[id].events[eventId].seedAssignments)
        participantMap[id].events[eventId].seedAssignments = {};

      Object.keys(seedAssignments).forEach(
        (stage) => (participantMap[id].events[eventId].seedAssignments[stage] = seedAssignments[stage]),
      );
    }
  }

  return { seedAssignments, seedValue };
}

function processDrawEntries({
  drawDefinitions,
  participantMap,
  derivedDrawInfo,
  eventPublishedSeeding,
  usePublishState,
  withRankingProfile,
  withSeeding,
  withDraws,
  eventType,
  category,
  eventId,
  flights,
  drawId,
  getRanking,
}) {
  const drawDefinition = drawDefinitions.find((drawDefinition) => drawDefinition.drawId === drawId);
  const scaleNames = [category?.categoryName, category?.ageCategoryCode].filter(Boolean);
  const { structures = [], drawOrder, drawName, drawType } = drawDefinition ?? {};
  const flight = flights?.find((flight) => flight.drawId === drawId);
  const entries = drawDefinition?.entries || flight?.drawEntries;
  const flightNumber = flight?.flightNumber;

  const orderedStructureIds = (drawDefinition?.structures || [])
    .sort((a, b) => structureSort(a, b))
    .map(({ structureId, structures }) => {
      return [structureId, ...(structures || []).map(({ structureId }) => structureId)];
    })
    .flat(Infinity);

  let qualifyingPositionAssignments,
    qualifyingSeedAssignments,
    mainPositionAssignments,
    mainSeedAssignments,
    drawSize = 0;

  const assignedParticipantIds = new Set(
    structures
      .filter(({ stage, stageSequence }) => (stage === MAIN && stageSequence === 1) || stage === QUALIFYING)
      .flatMap((structure) => {
        const { positionAssignments } = getPositionAssignments({ structure });
        const { seedAssignments, stageSequence, stage } = structure;

        if (stage === MAIN) {
          drawSize = positionAssignments?.length ?? 0;
          mainPositionAssignments = positionAssignments;
          mainSeedAssignments = seedAssignments;
        } else if (stageSequence === 1) {
          qualifyingPositionAssignments = positionAssignments;
          qualifyingSeedAssignments = seedAssignments;
        }
        return positionAssignments;
      })
      .map(({ participantId }) => participantId)
      .filter(Boolean),
  );

  const mainSeedingMap = getSeedingMap(mainSeedAssignments);
  const qualifyingSeedingMap = getSeedingMap(qualifyingSeedAssignments);

  const relevantEntries = drawDefinition
    ? entries.filter(({ participantId }) => assignedParticipantIds.has(participantId))
    : entries;

  const seedingPublished =
    !usePublishState ||
    (eventPublishedSeeding?.published &&
      (eventPublishedSeeding?.drawIds?.length === 0 || eventPublishedSeeding?.drawIds?.includes(drawId)));

  for (const entry of relevantEntries) {
    if (!participantMap[entry.participantId]) continue;
    const { entryStatus, entryStage, entryPosition, participantId } = entry;

    const ranking = getRanking({
      participantId,
      scaleNames,
      eventType,
    });

    const addParticipantDrawEntry = (id) => {
      if (!participantMap[id] || participantMap[id].draws?.[drawId]) return;

      const { seedAssignments, seedValue } = addParticipantDrawEntrySeedings({
        participantMap,
        id,
        participantId,
        eventId,
        eventType,
        drawId,
        mainSeedingMap,
        qualifyingSeedingMap,
        seedingPublished,
        withSeeding,
      });

      if (withDraws || withRankingProfile) {
        participantMap[id].draws[drawId] = definedAttributes(
          {
            seedAssignments,
            entryPosition,
            entryStatus,
            entryStage,
            seedValue,
            eventId,
            ranking,
            drawId,
          },
          false,
          false,
          true,
        );
      }
    };

    if (![UNGROUPED, UNPAIRED].includes(entryStatus)) {
      addParticipantDrawEntry(participantId);

      const individualParticipantIds = participantMap[participantId].participant.individualParticipantIds || [];
      individualParticipantIds?.forEach(addParticipantDrawEntry);
    }
  }

  const stages = (drawDefinition?.structures ?? []).reduce((stages, structure) => {
    if (!stages.includes(structure.stage)) stages.push(structure.stage);
    return stages;
  }, []);

  const linksCount = (drawDefinition?.links ?? []).length;

  derivedDrawInfo[drawId] = {
    qualifyingPositionAssignments,
    qualifyingSeedAssignments,
    mainPositionAssignments,
    qualifyingSeedingMap,
    mainSeedAssignments,
    orderedStructureIds,
    mainSeedingMap,
    flightNumber,
    linksCount,
    drawOrder,
    drawName,
    drawType,
    drawSize,
    drawId,
    stages,
  };
}

function processEventMatchUp({
  getRelevantParticipantIds,
  withScheduleItems,
  tournamentRecord,
  drawDefinitions,
  scheduleAnalysis,
  withRankingProfile,
  rrContainerInfo,
  rrGroupMatchUps,
  mappedMatchUps,
  participantMap,
  nextMatchUps,
  withOpts,
  matchUp,
}) {
  const {
    finishingPositionRange,
    potentialParticipants,
    tieMatchUps = [],
    sides = [],
    winningSide,
    matchUpType,
    matchUpId,
    eventId,
    drawId,
    collectionId,
    containerStructureId,
    stageSequence,
    finishingRound,
    matchUpStatus,
    roundPosition,
    roundNumber,
    structureId,
    schedule,
    score,
    stage,
  } = matchUp;

  mappedMatchUps[matchUpId] = matchUp;

  if (withRankingProfile && containerStructureId && structureId && drawId) {
    if (!rrGroupMatchUps[structureId]) rrGroupMatchUps[structureId] = [];
    rrGroupMatchUps[structureId].push(matchUp);
    if (!rrContainerInfo[containerStructureId]) {
      const drawDef = drawDefinitions.find((dd) => dd.drawId === drawId);
      if (drawDef) rrContainerInfo[containerStructureId] = { drawDefinition: drawDef, drawId };
    }
  }

  const baseAttrs = {
    finishingPositionRange,
    containerStructureId,
    finishingRound,
    stageSequence,
    roundPosition,
    collectionId,
    roundNumber,
    structureId,
    schedule,
    eventId,
    drawId,
    score,
    stage,
  };

  processSides({
    tournamentRecord,
    drawDefinitions,
    ...baseAttrs,
    ...withOpts,
    matchUpStatus,
    winningSide,
    matchUpType,
    matchUpId,
    sides,
  });

  for (const tieMatchUp of tieMatchUps) {
    const {
      winningSide: tieMatchUpWinningSide,
      sides: tieMatchUpSides = [],
      matchUpId: tieMatchUpId,
      collectionPosition,
      collectionId: tieCollectionId,
      matchUpStatus,
      matchUpType,
    } = tieMatchUp;
    processSides({
      ...baseAttrs,
      ...withOpts,
      winningSide: tieMatchUpWinningSide,
      tieWinningSide: winningSide,
      matchUpTieId: matchUpId,
      matchUpId: tieMatchUpId,
      sides: tieMatchUpSides,
      collectionId: tieCollectionId,
      collectionPosition,
      matchUpSides: sides,
      matchUpStatus,
      matchUpType,
    });
  }

  if (Array.isArray(potentialParticipants) && (nextMatchUps || !!scheduleAnalysis || withScheduleItems)) {
    processPotentialParticipants({
      getRelevantParticipantIds,
      potentialParticipants,
      withScheduleItems,
      tournamentRecord,
      scheduleAnalysis,
      participantMap,
      matchUpStatus,
      roundPosition,
      structureId,
      matchUpType,
      roundNumber,
      matchUpId,
      schedule,
      eventId,
      drawId,
      score,
    });
  }
}

function processPotentialParticipants({
  getRelevantParticipantIds,
  potentialParticipants,
  withScheduleItems,
  tournamentRecord,
  scheduleAnalysis,
  participantMap,
  matchUpStatus,
  roundPosition,
  structureId,
  matchUpType,
  roundNumber,
  matchUpId,
  schedule,
  eventId,
  drawId,
  score,
}) {
  const potentialParticipantIds = potentialParticipants.flat().map(getParticipantId).filter(Boolean);
  potentialParticipantIds?.forEach((participantId) => {
    const relevantParticipantIds = getRelevantParticipantIds(participantId);

    relevantParticipantIds?.forEach((relevantParticipantId) => {
      if (!participantMap[relevantParticipantId]) {
        return;
      }
      participantMap[relevantParticipantId].potentialMatchUps[matchUpId] = definedAttributes({
        tournamentId: tournamentRecord?.tournamentId,
        matchUpId,
        eventId,
        drawId,
      });
    });

    if (!!scheduleAnalysis || withScheduleItems) {
      addScheduleItem({
        potential: true,
        participantMap,
        participantId,
        matchUpStatus,
        roundPosition,
        structureId,
        matchUpType,
        roundNumber,
        matchUpId,
        schedule,
        drawId,
        score,
      });
    }
  });
}

function calculateRRRange({
  drawPositionsCount,
  containerStructureId,
  bracketsCount,
  playoffStructure,
  drawDefinition,
  bracketSize,
  order,
}) {
  if (drawPositionsCount === bracketSize && order) {
    return [order, order];
  }
  if (bracketsCount > 1 && order && !playoffStructure) {
    return [1, bracketsCount];
  }
  if (bracketsCount > 1 && order && playoffStructure) {
    const advancingPositions = drawDefinition.links?.find(
      (link) => link.source.structureId === containerStructureId,
    )?.source?.finishingPositions;
    if (advancingPositions) {
      const totalAdvancing = advancingPositions.length * bracketsCount;
      if (advancingPositions.includes(order)) {
        return [1, totalAdvancing];
      }
      const finishingOffset = (bracketSize - order) * bracketsCount;
      return [totalAdvancing + 1, drawPositionsCount - finishingOffset];
    }
  }
  return undefined;
}

function processRRBracket({
  containedStructure,
  rrGroupMatchUps,
  drawPositionsCount,
  containerStructureId,
  bracketsCount,
  playoffStructure,
  drawDefinition,
  drawPositions,
}) {
  const childStructureId = containedStructure.structureId;
  const groupMatchUps = rrGroupMatchUps[childStructureId];
  if (!groupMatchUps?.length) return;

  const bracketSize = containedStructure.positionAssignments?.length;
  const { subOrderMap } = createSubOrderMap({
    positionAssignments: containedStructure.positionAssignments,
  });

  const tallyResult = tallyParticipantResults({ matchUps: groupMatchUps, subOrderMap });
  if (!tallyResult?.participantResults) return;

  for (const [participantId, result] of Object.entries(tallyResult.participantResults) as any) {
    const order = result.groupOrder || result.provisionalOrder;
    if (!order) continue;

    const range = calculateRRRange({
      drawPositionsCount,
      containerStructureId,
      bracketsCount,
      playoffStructure,
      drawDefinition,
      bracketSize,
      order,
    });

    if (range) drawPositions[participantId] = range;
  }
}

function computeRRFinishingPositions(rrGroupMatchUps, rrContainerInfo, withRankingProfile) {
  const rrFinishingPositions: { [drawId: string]: { [participantId: string]: number[] } } = {};

  if (!withRankingProfile) return rrFinishingPositions;

  for (const [containerStructureId, containerInfo] of Object.entries(rrContainerInfo) as any) {
    const { drawDefinition, drawId } = containerInfo;
    const mainStructure = drawDefinition.structures?.find(
      (s) => s.structureType === CONTAINER && s.stage === MAIN && s.stageSequence === 1,
    );
    if (!mainStructure?.structures) continue;

    const containedStructures = mainStructure.structures;
    const bracketsCount = containedStructures.length;
    const drawPositionsCount = containedStructures.reduce((sum, s) => sum + (s.positionAssignments?.length || 0), 0);
    const playoffStructure = drawDefinition.structures?.find((s) => s.stage === PLAY_OFF);

    if (!rrFinishingPositions[drawId]) rrFinishingPositions[drawId] = {};

    for (const containedStructure of containedStructures) {
      processRRBracket({
        containedStructure,
        rrGroupMatchUps,
        drawPositionsCount,
        containerStructureId,
        bracketsCount,
        playoffStructure,
        drawDefinition,
        drawPositions: rrFinishingPositions[drawId],
      });
    }
  }

  return rrFinishingPositions;
}

function detectScheduleConflicts({ scheduleItems, potentialMatchUps, scheduleAnalysis }) {
  const scheduledMinutesDifference = isObject(scheduleAnalysis) ? scheduleAnalysis.scheduledMinutesDifference : 0;
  const scheduleConflicts: { [key: string]: any } = {};

  const dateItems = scheduleItems.reduce((dateItems, scheduleItem) => {
    const { scheduledDate, scheduledTime } = scheduleItem;
    if (!dateItems[scheduledDate]) dateItems[scheduledDate] = [];
    if (scheduledTime) dateItems[scheduledDate].push(scheduleItem);

    return dateItems;
  }, {});

  Object.values(dateItems).forEach((items: any) => items.sort(timeSort));

  for (const scheduleItem of scheduleItems) {
    const { typeChangeTimeAfterRecovery, timeAfterRecovery, scheduledDate, scheduledTime } = scheduleItem;

    const scheduleItemsToConsider = dateItems[scheduledDate];
    const scheduledMinutes = timeStringMinutes(scheduledTime);

    for (const consideredItem of scheduleItemsToConsider) {
      const ignoreItem =
        consideredItem.matchUpId === scheduleItem.matchUpId ||
        (isExit(consideredItem.matchUpStatus) && !consideredItem.checkScoreHasValue);
      if (ignoreItem) continue;

      const typeChange = scheduleItem.matchUpType !== consideredItem.matchUpType;

      const notBeforeTime = typeChange ? typeChangeTimeAfterRecovery || timeAfterRecovery : timeAfterRecovery;

      const sameDraw = scheduleItem.drawId === consideredItem.drawId;

      const bothPotential =
        potentialMatchUps[scheduleItem.matchUpId] && potentialMatchUps[consideredItem.matchUpId];

      const consideredMinutes = timeStringMinutes(consideredItem.scheduledTime);
      const minutesDifference = Math.abs(consideredMinutes - scheduledMinutes);
      const itemIsPrior = consideredMinutes >= scheduledMinutes;

      const timeOverlap =
        scheduledMinutesDifference && !Number.isNaN(scheduledMinutesDifference)
          ? minutesDifference <= scheduledMinutesDifference
          : itemIsPrior && timeStringMinutes(consideredItem.scheduledTime) < timeStringMinutes(notBeforeTime);

      if (timeOverlap && !(bothPotential && sameDraw) && itemIsPrior) {
        const key = [scheduleItem.matchUpId, consideredItem.matchUpId].sort(stringSort).join('|');
        scheduleConflicts[key] = {
          priorScheduledMatchUpId: scheduleItem.matchUpId,
          matchUpIdWithConflict: consideredItem.matchUpId,
        };
      }
    }
  }

  return scheduleConflicts;
}

function computeStatisticsAndRankingProfile({
  rrFinishingPositions,
  withRankingProfile,
  scheduleAnalysis,
  withStatistics,
  derivedDrawInfo,
  participantMap,
}) {
  const participantIdsWithConflicts: string[] = [];
  const aggregators: any[] = Object.values(participantMap);

  for (const participantAggregator of aggregators) {
    const {
      wins,
      losses,
      [SINGLES]: { wins: singlesWins, losses: singlesLosses },
      [DOUBLES]: { wins: doublesWins, losses: doublesLosses },
    } = participantAggregator.counters;

    const addStatValue = (statCode, wins, losses) => {
      const denominator = wins + losses;
      const numerator = wins;

      const statValue = denominator && numerator / denominator;

      participantAggregator.statistics[statCode] = {
        denominator,
        numerator,
        statValue,
        statCode,
      };
    };

    if (withStatistics) {
      addStatValue(WIN_RATIO, wins, losses);
      addStatValue(`${WIN_RATIO}.${SINGLES}`, singlesWins, singlesLosses);
      addStatValue(`${WIN_RATIO}.${DOUBLES}`, doublesWins, doublesLosses);
    }

    if (withRankingProfile) {
      computeRankingProfileForParticipant({
        participantAggregator,
        derivedDrawInfo,
        rrFinishingPositions,
      });
    }

    if (scheduleAnalysis) {
      computeScheduleConflictsForParticipant({
        participantAggregator,
        scheduleAnalysis,
        participantMap,
        participantIdsWithConflicts,
      });
    }
  }

  return participantIdsWithConflicts;
}

function computeRankingProfileForParticipant({ participantAggregator, derivedDrawInfo, rrFinishingPositions }) {
  const diff = (range = []) => Math.abs(range[0] - range[1]);

  for (const drawId of Object.keys(participantAggregator.draws)) {
    const { orderedStructureIds = [], flightNumber } = derivedDrawInfo[drawId] || {};
    if (!participantAggregator.structureParticipation || !orderedStructureIds.length) continue;

    let finishingPositionRange;
    let nonQualifyingOrder = 0;

    const orderedParticipation = orderedStructureIds
      .map((structureId) => {
        const participation = participantAggregator.structureParticipation[structureId];
        if (!participation) return undefined;

        if (!finishingPositionRange) finishingPositionRange = participation?.finishingPositionRange;
        if (diff(finishingPositionRange) > diff(participation?.finishingPositionRange))
          finishingPositionRange = participation?.finishingPositionRange;

        const notQualifying = participation.stage !== QUALIFYING;
        if (notQualifying) nonQualifyingOrder += 1;

        const participationOrder = notQualifying ? nonQualifyingOrder : undefined;

        return definedAttributes({
          ...participation,
          participationOrder,
          flightNumber,
        });
      })
      .filter(Boolean);

    if (participantAggregator.draws[drawId]) {
      const participantId = participantAggregator.participant.participantId;
      const rrRange = rrFinishingPositions[drawId]?.[participantId];
      if (rrRange) finishingPositionRange = rrRange;

      participantAggregator.draws[drawId].finishingPositionRange = finishingPositionRange;
      participantAggregator.draws[drawId].structureParticipation = orderedParticipation;
    }
  }
}

function computeScheduleConflictsForParticipant({
  participantAggregator,
  scheduleAnalysis,
  participantMap,
  participantIdsWithConflicts,
}) {
  const scheduleItems = participantAggregator.scheduleItems || [];
  const potentialMatchUps = participantAggregator.potentialMatchUps || {};

  participantAggregator.scheduleConflicts = detectScheduleConflicts({
    scheduleAnalysis,
    scheduleItems,
    potentialMatchUps,
  });

  const pid = participantAggregator.participant.participantId;
  if (Object.keys(participantAggregator.scheduleConflicts).length) {
    participantIdsWithConflicts.push(pid);
  }

  participantMap[pid].scheduleConflicts = participantAggregator.scheduleConflicts;
}
