import { participantsVersion as computeParticipantsVersion } from '@Query/participants/participantsVersion';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getDrawIsPublished } from '@Query/publishing/getDrawIsPublished';
import { isStructureVisible } from '@Query/publishing/isStructureVisible';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import { withContextExclusion } from '@Query/matchUps/contextExclusion';
import { getParticipants } from '@Query/participants/getParticipants';
import { getPublishState } from '@Query/publishing/getPublishState';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import { getVenueData } from '@Query/venues/getVenueData';
import { constrainedPlayingDates } from '@Query/event/extractEventInfo';
import { findExtension } from '@Acquire/findExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { DrawDefinition, PayloadProfileEnum, PayloadProfileUnion, Event, Tournament } from '@Types/tournamentTypes';
import type { DrawData, DrawStub, EventData, EventDataResult, EventInfo, VenueData } from '@Types/viewTypes';
import { ParticipantsProfile, PolicyDefinitions, StructureSortConfig } from '@Types/factoryTypes';
import { EVENT_NOT_FOUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses, BYE } from '@Constants/matchUpStatusConstants';
import { DISPLAY } from '@Constants/extensionConstants';
import { ANY_OF } from '@Constants/attributeConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
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
  participantsVersion?: string;
  withParticipantsVersion?: boolean;
  contextProfile?: any;
  eventId?: string;
  status?: string;
  event?: Event;
};

export function getEventData(params: GetEventDataArgs): EventDataResult {
  return withContextExclusion(params, getEventDataUnredacted);
}

function getEventDataUnredacted(params: GetEventDataArgs): EventDataResult {
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
    return { error: INVALID_VALUES, context: { drawsProfile } };
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
  const eventPublishState = getPublishState({ event, status }).publishState ?? {};
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

  const structureFilter = ({ structureId, stage, drawId }) => {
    if (!usePublishState) return true;
    return isStructureVisible({ drawDetail: publishStatus?.drawDetails?.[drawId], structureId, stage });
  };

  const drawFilter = ({ drawId }) => {
    if (usePublishState) {
      return getDrawIsPublished({ publishStatus, drawId });
    }
    return true;
  };

  // listed in display order: `drawOrder` first (set by `updateDrawIdsOrder`), then any draw without one, as stored
  const drawDefinitions = byDrawOrder(event.drawDefinitions ?? []);

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
  const buildDrawStub = (drawDefinition): DrawStub => {
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

  // every draw getDrawData refuses (no structures) is filtered out, so each entry carries its drawInfo
  const buildFullDrawsData = (): DrawData[] =>
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
          // Round limits are applied inside getDrawData, so every tier withholds the same rounds.
          ?.filter(({ stage, structureId }) => structureFilter({ structureId, stage, drawId: drawData.drawId }));
        return {
          ...drawData,
          structures: filteredStructures,
        };
      })
      .filter((drawData) => drawData.structures?.length) as DrawData[];

  let drawsData: DrawData[] | undefined;
  if (!drawsVisible) {
    drawsData = undefined;
  } else if (drawsProfile === PayloadProfileEnum.STUBS) {
    drawsData = drawDefinitions.filter(drawFilter).map(buildDrawStub);
  } else {
    drawsData = buildFullDrawsData();
  }

  const venues = Array.isArray(tournamentRecord.venues) ? tournamentRecord.venues : [];
  // every venue is read from this record, so getVenueData always finds it
  const venuesData = venues.map((venue): VenueData => {
    const { venueData } = getVenueData({
      venueId: venue.venueId,
      tournamentRecord,
    });
    return {
      ...venueData,
    } as VenueData;
  });

  const eventInfo: EventInfo = (({
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

  // only when the event's own dates narrow the tournament's, so unconstrained events keep their payload shape
  const playingDates = constrainedPlayingDates(tournamentRecord, event);
  if (playingDates) eventInfo.playingDates = playingDates;

  eventInfo.display = findExtension({
    element: event,
    name: DISPLAY,
  }).extension?.value;

  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });

  const eventData: EventData = {
    tournamentInfo,
    venuesData,
    eventInfo,
    drawsData,
  };

  eventData.eventInfo.publishState = eventPublishState;
  eventData.eventInfo.published = eventPublishState?.status?.published;

  // OPT-IN. Hashing the participant set costs ~18 ms of an ~89 ms five-event build (~20%), and every
  // caller would pay it for a handshake almost none of them use. So the stamp is computed only when
  // it can actually be used: the caller either supplied a version to check, or asked for one.
  //
  // Deliberately NOT a separate "enable the feature" flag divorced from the parameters — supplying a
  // version implies wanting the comparison, and a caller that had to set two things to get one
  // behaviour would eventually set only one and silently get the slow-and-useless combination.
  const versionRequested = params.withParticipantsVersion || params.participantsVersion !== undefined;
  const version = versionRequested ? computeParticipantsVersion(tournamentParticipants) : undefined;
  const clientHoldsCurrentSet = !!params.participantsVersion && params.participantsVersion === version;

  return {
    ...SUCCESS,
    eventData,
    // A mismatch or absence sends participants, exactly as today. Only an EXACT match omits them, so
    // the failure direction is "sent bytes that were not needed" rather than a blank bracket.
    participants: clientHoldsCurrentSet ? undefined : tournamentParticipants,
    // Conditional spread, not `participantsVersion: version`. An explicitly-undefined key still shows
    // up in Object.keys, so the unasked-for case would carry a key it never had before — a shape
    // change, however invisible to JSON.stringify.
    ...(version !== undefined && { participantsVersion: version }),
  };
}

function byDrawOrder(drawDefinitions: DrawDefinition[]): DrawDefinition[] {
  const ordered = (drawOrder?: number) => typeof drawOrder === 'number' && !Number.isNaN(drawOrder);
  return drawDefinitions
    .map((drawDefinition, index) => ({ drawDefinition, index }))
    .sort((a, b) => {
      const [aOrdered, bOrdered] = [ordered(a.drawDefinition.drawOrder), ordered(b.drawDefinition.drawOrder)];
      if (aOrdered && bOrdered) return (a.drawDefinition.drawOrder as number) - (b.drawDefinition.drawOrder as number);
      if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ drawDefinition }) => drawDefinition);
}
