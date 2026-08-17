import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getDrawIsPublished } from '@Query/publishing/getDrawIsPublished';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import { getParticipants } from '@Query/participants/getParticipants';
import { getPublishState } from '@Query/publishing/getPublishState';
import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { getVenueData } from '@Query/venues/getVenueData';
import { findExtension } from '@Acquire/findExtension';
import { isConvertableInteger } from '@Tools/math';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { findEvent } from '@Acquire/findEvent';
import { generateRange } from '@Tools/arrays';

// constants and types
import { ParticipantsProfile, PolicyDefinitions, StructureSortConfig } from '@Types/factoryTypes';
import { EVENT_NOT_FOUND, INVALID_VALUES, ErrorType } from '@Constants/errorConditionConstants';
import { PayloadProfileEnum, PayloadProfileUnion, Event, Tournament } from '@Types/tournamentTypes';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { DISPLAY } from '@Constants/extensionConstants';
import { ANY_OF } from '@Constants/attributeConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';

type GetEventDataArgs = {
  participantsProfile?: ParticipantsProfile;
  includePositionAssignments?: boolean;
  policyDefinitions?: PolicyDefinitions;
  allParticipantResults?: boolean;
  sortConfig?: StructureSortConfig;
  hydrateParticipants?: boolean;
  tournamentRecord: Tournament;
  usePublishState?: boolean;
  refreshResults?: boolean;
  pressureRating?: boolean;
  drawsProfile?: PayloadProfileUnion;
  participantFilters?: any;
  contextProfile?: any;
  eventId?: string;
  status?: string;
  event?: Event;
};

export function getEventData(params: GetEventDataArgs): {
  participants?: HydratedParticipant[];
  error?: ErrorType;
  success?: boolean;
  eventData?: any;
} {
  const {
    includePositionAssignments,
    participantsProfile,
    policyDefinitions,
    usePublishState,
    status = PUBLIC,
    contextProfile,
    sortConfig,
    drawsProfile = PayloadProfileEnum.FULL,
  } = params;

  // Unknown value is an ERROR, never a silent fall-through to FULL: a typo must not quietly return
  // the 788 KB payload a caller was explicitly trying to avoid.
  if (!Object.values(PayloadProfileEnum).includes(drawsProfile as PayloadProfileEnum)) {
    return { error: INVALID_VALUES, context: { drawsProfile } } as any;
  }

  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true },
    { [ANY_OF]: { event: false, eventId: false } },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const tournamentRecord = makeDeepCopy(params.tournamentRecord, false, true);
  const foundEvent = params.event == null ? findEvent({ tournamentRecord, eventId: params.eventId }).event : undefined;
  const event = params.event
    ? makeDeepCopy(params.event, false, true)
    : (foundEvent && makeDeepCopy(foundEvent, false, true)) || undefined;

  if (!event) return { error: EVENT_NOT_FOUND };

  const { eventId } = event;
  const { tournamentId, endDate } = tournamentRecord;

  const publishStatus = getEventPublishStatus({ event, status });
  const eventPublishState = getPublishState({ event }).publishState ?? {};
  const eventPublished = !!eventPublishState?.status?.published;

  const { participants: tournamentParticipants } = getParticipants({
    participantFilters: params.participantFilters,
    withGroupings: true,
    withEvents: false,
    withDraws: false,
    policyDefinitions, // necessary here for returning public participant data
    ...participantsProfile, // order is important!!
    tournamentRecord,
  });

  const stageFilter = ({ stage, drawId }) => {
    if (!usePublishState) return true;
    const stageDetails = publishStatus?.drawDetails?.[drawId]?.stageDetails;
    if (!stageDetails || !Object.keys(stageDetails).length) return true;
    return isVisiblyPublished(stageDetails[stage]);
  };

  const structureFilter = ({ structureId, drawId }) => {
    if (!usePublishState) return true;
    const structureDetails = publishStatus?.drawDetails?.[drawId]?.structureDetails;
    if (!structureDetails || !Object.keys(structureDetails).length) return true;
    return isVisiblyPublished(structureDetails[structureId]);
  };

  const drawFilter = ({ drawId }) => {
    if (usePublishState) {
      return getDrawIsPublished({ publishStatus, drawId });
    }
    return true;
  };

  const roundLimitMapper = ({ drawId, drawType, structure }) => {
    if (!usePublishState) return structure;
    if (!isAdHocType(drawType)) return structure;
    const roundLimit = publishStatus?.drawDetails?.[drawId]?.structureDetails?.[structure.structureId]?.roundLimit;
    if (isConvertableInteger(roundLimit)) {
      const roundNumbers = generateRange(1, roundLimit + 1);
      const roundMatchUps = {};
      const roundProfile = {};
      for (const roundNumber of roundNumbers) {
        if (structure.roundMatchUps[roundNumber]) {
          roundMatchUps[roundNumber] = structure.roundMatchUps[roundNumber];
          roundProfile[roundNumber] = structure.roundProfile[roundNumber];
        }
      }
      structure.roundMatchUps = roundMatchUps;
      structure.roundProfile = roundProfile;
    }
    return structure;
  };

  const drawDefinitions = event.drawDefinitions ?? [];

  /**
   * Cheap per-draw metadata — no structure assembly, no participant hydration.
   *
   * `drawGenerated` / `drawCompleted` are included because both reduce `matchUpStatus`, which is
   * first-class on the RAW matchUp, so neither needs hydrated structures. Verified equivalent to the
   * `getDrawData` values across single-elimination, round-robin and compass draws in every completion
   * state. The recursion matters: round-robin containers hold their matchUps in nested `structures[]`,
   * and a flat `structure.matchUps` read reports every such draw as ungenerated.
   *
   * `participantPlacements`, `drawActive` and `structures` are deliberately absent — they are
   * drill-in concerns and cannot be derived without the work this profile exists to skip.
   */
  const buildDrawStub = (drawDefinition) => {
    const { matchUpFormat, updatedAt, drawType, drawName, drawId } = drawDefinition;
    const leafMatchUps = (function collect(structures) {
      return (structures ?? []).flatMap((structure) =>
        structure?.structures?.length ? collect(structure.structures) : (structure?.matchUps ?? []),
      );
    })(drawDefinition.structures);
    const completedStatuses = [...completedMatchUpStatuses, BYE];

    return {
      matchUpFormat,
      updatedAt,
      drawName,
      drawType,
      drawId,
      display: findExtension({ element: drawDefinition, name: DISPLAY }).extension?.value,
      drawGenerated: leafMatchUps.length > 0,
      drawCompleted:
        leafMatchUps.length > 0 && leafMatchUps.every((matchUp) => completedStatuses.includes(matchUp?.matchUpStatus)),
      drawPublished: usePublishState ? eventPublished && getDrawIsPublished({ publishStatus, drawId }) : undefined,
    };
  };

  // Draws are withheld entirely when honouring publish state on an unpublished event; otherwise the
  // profile selects how much of each draw is assembled. Written as statements rather than a nested
  // ternary (no-nested-ternary is a hard lint gate in this repo).
  const drawsVisible = !usePublishState || eventPublished;

  const buildFullDrawsData = () =>
    drawDefinitions
      .filter(drawFilter)
      .map((drawDefinition) =>
        (({ drawInfo, structures }) => {
          return {
            ...drawInfo,
            structures,
          };
        })(
          getDrawData({
            allParticipantResults: params.allParticipantResults,
            hydrateParticipants: params.hydrateParticipants,
            context: { eventId, tournamentId, endDate },
            pressureRating: params.pressureRating,
            refreshResults: params.refreshResults,
            includePositionAssignments,
            tournamentParticipants,
            eventPublishState,
            noDeepCopy: true,
            policyDefinitions,
            tournamentRecord,
            usePublishState,
            contextProfile,
            drawDefinition,
            publishStatus,
            sortConfig,
            event,
          }),
        ),
      )
      .map(({ structures, ...drawData }) => {
        const filteredStructures = structures
          ?.filter(
            ({ stage, structureId }) =>
              structureFilter({ structureId, drawId: drawData.drawId }) &&
              stageFilter({ stage, drawId: drawData.drawId }),
          )
          .map((structure) => roundLimitMapper({ drawId: drawData.drawId, drawType: drawData.drawType, structure }));
        return {
          ...drawData,
          structures: filteredStructures,
        };
      })
      .filter((drawData) => drawData.structures?.length);

  let drawsData;
  if (!drawsVisible) {
    drawsData = undefined;
  } else if (drawsProfile === PayloadProfileEnum.STUBS) {
    drawsData = drawDefinitions.filter(drawFilter).map(buildDrawStub);
  } else {
    drawsData = buildFullDrawsData();
  }

  const venues = Array.isArray(tournamentRecord.venues) ? tournamentRecord.venues : [];
  const venuesData = venues.map((venue) => {
    const { venueData } = getVenueData({
      venueId: venue.venueId,
      tournamentRecord,
    });
    return {
      ...venueData,
    };
  });

  const eventInfo: any = (({
    eventId,
    eventName,
    eventType,
    eventLevel,
    surfaceCategory,
    matchUpFormat,
    competitionFormat,
    category,
    gender,
    startDate,
    endDate,
    ballType,
    discipline,
  }) => {
    return {
      eventId,
      eventName,
      eventType,
      eventLevel,
      surfaceCategory,
      matchUpFormat,
      competitionFormat,
      category,
      gender,
      startDate,
      endDate,
      ballType,
      discipline,
    };
  })(event);

  // competitionFormat carries timers/multipliers/penalties that may not yet
  // be public — strip it when consumers are honoring publish state and the
  // event is not yet published. Other eventInfo fields are public metadata
  // and stay regardless. See Mentat/planning/COMPETITION_FORMAT_HYDRATION.md.
  if (usePublishState && !eventPublished) {
    delete eventInfo.competitionFormat;
  }

  eventInfo.display = findExtension({
    element: event,
    name: DISPLAY,
  }).extension?.value;

  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });

  const eventData = {
    tournamentInfo,
    venuesData,
    eventInfo,
    drawsData,
  };

  eventData.eventInfo.publishState = eventPublishState;
  eventData.eventInfo.published = eventPublishState?.status?.published;

  return { ...SUCCESS, eventData, participants: tournamentParticipants };
}
