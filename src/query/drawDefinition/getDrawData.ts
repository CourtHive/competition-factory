import type { ContextProfile, ParticipantsProfile, PolicyDefinitions, StructureSortConfig } from '@Types/factoryTypes';
import { DrawDefinition, Event, Participant, PayloadProfileEnum, Tournament } from '@Types/tournamentTypes';
import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { isTalliedStructure, refreshParticipantResults } from './refreshParticipantResults';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getDrawIsPublished } from '@Query/publishing/getDrawIsPublished';
import { isStructureVisible } from '@Query/publishing/isStructureVisible';
import { getStructureGroups } from '@Query/structure/getStructureGroups';
import { withContextExclusion } from '@Query/matchUps/contextExclusion';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import { createHydrationCache } from '@Query/matchUps/hydrationCache';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { getPublishState } from '@Query/publishing/getPublishState';
import { applyRoundLimit } from '@Query/publishing/applyRoundLimit';
import { drawWithDerivedGoesTo } from '@Query/matchUps/addGoesTo';
import { structureSort } from '@Functions/sorters/structureSort';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { findExtension } from '@Acquire/findExtension';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { xa } from '@Tools/extractAttributes';

// constants
import { CONSOLATION, MAIN, PLAY_OFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { DISPLAY, TALLY } from '@Constants/extensionConstants';
import { PUBLIC_DISPLAY } from '@Constants/displayConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  BYE,
  CANCELLED,
  COMPLETED,
  completedMatchUpStatuses,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  UNLINKED_STRUCTURES,
} from '@Constants/errorConditionConstants';

/**
 * Arguments for {@link getDrawData}.
 *
 * Added in 7.0.0. This is a published query that previously had **no argument type at all**, so a
 * consumer got no completion, no compile-time check on a misspelled key, and no signal that
 * `structuresProfile` is a closed set. The rigour already existed in this file — `PayloadProfileEnum`
 * is a closed union and an unknown value is an error rather than a silent fall-through to the full
 * payload — it simply stopped at the function boundary.
 *
 * `tournamentRecord` is optional rather than required: `drawDefinition` is the only hard requirement
 * (its absence returns `MISSING_DRAW_DEFINITION`), and the other inputs enrich the result.
 */
export type GetDrawDataArgs = {
  /** when true, `eventPublishState` or `event` must also be provided */
  usePublishState?: boolean;
  includePositionAssignments?: boolean;
  tournamentParticipants?: Participant[];
  policyDefinitions?: PolicyDefinitions;
  /** defaults to `PayloadProfileEnum.FULL`; an unrecognised value is `INVALID_VALUES`, never a fall-through */
  structuresProfile?: PayloadProfileEnum;
  sortConfig?: StructureSortConfig;
  contextProfile?: ContextProfile;
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  /** a flag, forwarded to `tallyParticipantResults` */
  pressureRating?: boolean;
  refreshResults?: boolean;
  context?: { [key: string]: any };
  /** pre-resolved, to avoid re-deriving it per draw when a caller already has it */
  eventPublishState?: { status?: { [key: string]: any } };
  participantsProfile?: ParticipantsProfile;
  allParticipantResults?: boolean;
  hydrateParticipants?: boolean;
  publishStatus?: any;
  noDeepCopy?: boolean;
  inContext?: boolean;
  /** publish-state key; `PUBLIC` unless a provider uses a private channel */
  status?: string;
  event?: Event;
};

type DrawInfo = Pick<DrawDefinition, 'matchUpFormat' | 'updatedAt' | 'drawName' | 'drawType' | 'drawId'> & {
  participantPlacements?: boolean;
  drawPublished?: boolean;
  drawGenerated?: boolean;
  drawCompleted?: boolean;
  drawActive?: boolean;
  display?: unknown;
};

// NOTE: if { usePublishState: true } then { eventPublishState } or { event } must be provided
export function getDrawData(params: GetDrawDataArgs) {
  return withContextExclusion(params, getDrawDataUnredacted);
}

function getDrawDataUnredacted(params: GetDrawDataArgs): {
  structures?: any[];
  success?: boolean;
  error?: ErrorType;
  drawInfo?: any;
} {
  const {
    tournamentParticipants = [],
    includePositionAssignments,
    policyDefinitions,
    tournamentRecord,
    inContext = true,
    usePublishState,
    status = PUBLIC,
    pressureRating,
    refreshResults,
    contextProfile,
    noDeepCopy,
    sortConfig,
    context,
    event,
    structuresProfile = PayloadProfileEnum.FULL,
  } = params;

  // Unknown value is an ERROR, never a silent fall-through to FULL — a typo must not quietly return the
  // full payload a caller was explicitly trying to avoid. Mirrors getEventData's drawsProfile.
  if (!Object.values(PayloadProfileEnum).includes(structuresProfile as PayloadProfileEnum)) {
    return { error: INVALID_VALUES };
  }

  if (!params.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  // A draw built outside the factory may not store its progression edges (`winnerMatchUpId` / `loserMatchUpId`) until a
  // scored matchUp stores them, and every bracket is drawn from them (an integrator report, 2026-10-18). Such a draw is
  // read from a copy that carries them: they reach the returned data and never the draw this query was handed.
  const drawDefinition = drawWithDerivedGoesTo(params.drawDefinition);
  const hydrationCache = createHydrationCache();

  // Built on first use, so a STUBS request builds none of it.
  let drawFacts: ReturnType<typeof buildDrawFacts> | undefined;
  const getDrawFacts = () => {
    drawFacts ??= buildDrawFacts({
      hydrate: inContext && !tournamentParticipants.length && !!tournamentRecord,
      participantsProfile: params.participantsProfile,
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      drawDefinition,
    });
    return drawFacts;
  };

  const { matchUpFormat, updatedAt, drawType, drawName, drawId } = drawDefinition;
  const drawInfo: DrawInfo = {
    matchUpFormat,
    updatedAt,
    drawName,
    drawType,
    drawId,
  };

  drawInfo.display = findExtension({ element: drawDefinition, name: DISPLAY }).extension?.value;

  const qualificationStageSeedAssignments = {};
  let mainStageSeedAssignments;

  const { allStructuresLinked, sourceStructureIds, hasDrawFeedProfile, structureGroups } = getStructureGroups({
    drawDefinition,
  });

  if (!allStructuresLinked) return { error: UNLINKED_STRUCTURES };

  const eventPublishState = params?.eventPublishState ?? getPublishState({ event, status }).publishState;
  const publishStatus = params?.publishStatus ?? getEventPublishStatus({ event, status });
  const drawDetails = eventPublishState?.status?.drawDetails?.[drawDefinition.drawId];
  const eventPublished = !!eventPublishState?.status?.published;

  let drawActive = false;
  let participantPlacements = false; // if any positionAssignments include a participantId
  /**
   * Cheap per-structure metadata — no `getAllStructureMatchUps`, no participant hydration.
   *
   * `structureActive` / `structureCompleted` are kept because both reduce `matchUpStatus`, which is
   * first-class on the RAW matchUp — the same reasoning that keeps drawGenerated/drawCompleted in a
   * draw stub. The recursion into nested `structures[]` is load-bearing: round-robin containers hold
   * their matchUps one level down, and a flat read reports every such structure as inactive.
   *
   * Absent by design: roundMatchUps, roundProfile, participantResults, seedAssignments,
   * positionAssignments and report — they cannot be produced without the work this profile skips.
   */
  const buildStructureStub = (structureId) => {
    const { structure } = findStructure({ drawDefinition, structureId });
    const leafMatchUps = (function collect(structs) {
      return (structs ?? []).flatMap((st) => {
        const contained = structuresOf(st);
        return contained?.length ? collect(contained) : (matchUpsOf(st) ?? []);
      });
    })(structure ? [structure] : []);
    const completedStatuses = [...completedMatchUpStatuses, BYE];
    const displaySettings = findExtension({ element: structure, name: DISPLAY }).extension?.value;

    return {
      stageSequence: structure?.stageSequence,
      structureName: structure?.structureName,
      structureType: structure?.structureType,
      finishingPosition: structure?.finishingPosition,
      matchUpFormat: structure?.matchUpFormat,
      stage: structure?.stage,
      display: displaySettings?.[PUBLIC_DISPLAY] ?? displaySettings,
      structureActive: leafMatchUps.some(
        (matchUp) => !!matchUp?.winningSide || !!matchUp?.score?.scoreStringSide1 || matchUp?.matchUpStatus === BYE,
      ),
      structureCompleted:
        leafMatchUps.length > 0 && leafMatchUps.every((matchUp) => completedStatuses.includes(matchUp?.matchUpStatus)),
      structureId,
    };
  };

  const groupedStructures = structureGroups.map((structureIds) => {
    if (structuresProfile === PayloadProfileEnum.STUBS) return structureIds.map(buildStructureStub);

    const completedStructures = {};
    const structures = structureIds
      .map((structureId) => {
        const { structure } = findStructure({ drawDefinition, structureId });
        const { seedAssignments } = getStructureSeedAssignments({
          drawDefinition,
          structure,
        });

        // capture the seedAssignments for MAIN/QUALIFYING { stageSequence: 1 }
        if (structure?.stage === MAIN && structure.stageSequence === 1) {
          mainStageSeedAssignments = seedAssignments;
        }
        if (structure?.stage === QUALIFYING) {
          qualificationStageSeedAssignments[structure.stageSequence ?? 0] = seedAssignments;
        }

        return structure;
      })
      .sort((a, b) => structureSort(a, b, sortConfig))
      .map((structure) => {
        if (!structure) return undefined;
        const structureId = structure?.structureId;
        let seedAssignments = [];
        // per structure: one that is not tallied here (a round robin under refreshResults) reports nothing,
        // rather than the report of the structure tallied before it
        let report;

        // pass seedAssignments from { stageSequence: 1 } to other stages
        if (structure.stage && [MAIN, CONSOLATION, PLAY_OFF].includes(structure.stage)) {
          seedAssignments = mainStageSeedAssignments;
        }

        if (structure?.stage === QUALIFYING) {
          seedAssignments = qualificationStageSeedAssignments[structure.stageSequence ?? 0];
        }

        const { matchUps, roundMatchUps, roundProfile } = getAllStructureMatchUps({
          // only propagate seedAssignments where none are present
          seedAssignments: structure?.seedAssignments?.length ? undefined : seedAssignments,
          context: { drawId: drawInfo.drawId, ...context },
          hydrateParticipants: params.hydrateParticipants,
          participantsProfile: params.participantsProfile,
          tournamentParticipants: getDrawFacts().participants ?? tournamentParticipants,
          matchUpsMap: getDrawFacts().matchUpsMap,
          exitProfiles: getDrawFacts().exitProfiles,
          policyDefinitions,
          tournamentRecord,
          usePublishState,
          hydrationCache,
          publishStatus,
          contextProfile,
          drawDefinition,
          inContext,
          structure,
          event,
        });

        const { positionAssignments } = getPositionAssignments({ structure });

        let participantResults = positionAssignments?.filter(xa(PARTICIPANT_ID)).map((assignment) => {
          const participantResult = firstClassOrExtension({ element: assignment, attribute: 'tally', name: TALLY });
          const { drawPosition, participantId } = assignment;
          participantPlacements = true;

          return {
            participantResult,
            participantId,
            drawPosition,
          };
        });

        // only a structure a tally describes is tallied (never elimination); a round robin is refreshed group by group
        if (
          matchUps.length &&
          isTalliedStructure({ drawDefinition, structure }) &&
          ((!participantResults?.length && params.allParticipantResults) || refreshResults)
        ) {
          const result = refreshParticipantResults({
            policyDefinitions,
            tournamentRecord,
            drawDefinition,
            pressureRating,
            structure,
            matchUps,
            event,
          });
          report = result.report;

          participantResults = positionAssignments?.filter(xa(PARTICIPANT_ID)).map((assignment) => {
            const { drawPosition, participantId } = assignment;
            participantPlacements = true;

            return {
              participantResult: participantId && result?.participantResults?.[participantId],
              participantId,
              drawPosition,
            };
          });
        }

        const structureInfo: any = structure
          ? {
              stageSequence: structure.stageSequence,
              structureName: structure.structureName,
              structureType: structure.structureType,
              finishingPosition: structure.finishingPosition,
              matchUpFormat: structure.matchUpFormat,
              stage: structure.stage,
            }
          : {};

        const displaySettings = findExtension({ element: structure, name: DISPLAY }).extension?.value;
        structureInfo.display = displaySettings?.[PUBLIC_DISPLAY] ?? displaySettings;
        structureInfo.sourceStructureIds = sourceStructureIds[structureId];
        structureInfo.hasDrawFeedProfile = hasDrawFeedProfile[structureId];
        structureInfo.positionAssignments = positionAssignments;

        structureInfo.structureActive = matchUps.reduce((active, matchUp) => {
          const structureActiveStatuses =
            matchUp.matchUpStatus !== undefined &&
            [DOUBLE_WALKOVER, DOUBLE_DEFAULT, IN_PROGRESS, COMPLETED, CANCELLED, DEFAULTED, RETIRED, WALKOVER].includes(
              matchUp.matchUpStatus,
            );
          return active || structureActiveStatuses || !!matchUp.winningSide || !!matchUp.score?.scoreStringSide1;
        }, false);

        // a decided TEAM matchUp completes its round even when a dead rubber is never played, so only TEAM-level
        // matchUps are read: the same answer as the stub profile (raw matchUps) and isCompletedStructure
        const structureCompleted = teamLevelMatchUps(matchUps).every(
          (matchUp) =>
            matchUp.matchUpStatus !== undefined && [...completedMatchUpStatuses, BYE].includes(matchUp.matchUpStatus),
        );
        structureInfo.structureCompleted = structureCompleted;
        completedStructures[structureId] = structureCompleted;

        if (structureInfo.structureActive) drawActive = true;

        return {
          ...structureInfo,
          participantResults,
          seedAssignments,
          roundMatchUps,
          roundProfile,
          structureId,
          report,
        };
      });

    // cleanup attribute used for sorting
    structures.forEach((structure) => {
      if (!includePositionAssignments) delete structure.positionAssignments;
      structure.sourceStructuresComplete = structure.sourceStructureIds?.every((id) => completedStructures[id]);
    });

    return structures;
  });

  // Stage and structure publishing, judged by the one rule every public reader shares: an unkeyed level
  // publishes everything (the legacy shape), a keyed level shows only what it lists as visibly published.
  //
  // This once read `... || isVisiblyPublished(...) || true`, which was unconditionally true, and then
  // treated a structure with NO detail as visible even when its siblings were keyed — so a structure
  // added after a selective publish appeared here while `getEventData` withheld it.
  const structures = groupedStructures
    .flat()
    .filter((structure) => {
      if (!usePublishState) return true;
      return isStructureVisible({
        structureId: structure?.structureId,
        stage: structure?.stage,
        drawDetail: drawDetails,
      });
    })
    .map((structure) => {
      if (!usePublishState) return structure;
      const structureDetail = drawDetails?.structureDetails?.[structure?.structureId];
      return applyRoundLimit({ structure, structureDetail, drawType });
    });

  drawInfo.drawActive = drawActive;
  drawInfo.participantPlacements = participantPlacements;
  drawInfo.drawGenerated = structures?.reduce((generated, structure) => {
    return generated || !!structure?.roundMatchUps;
  }, false);
  drawInfo.drawCompleted = structures?.reduce(
    (completed, structure) => completed && structure.structureCompleted,
    true,
  );
  drawInfo.drawPublished = usePublishState
    ? eventPublished && getDrawIsPublished({ publishStatus, drawId: drawInfo.drawId })
    : undefined;

  return {
    structures:
      !usePublishState || drawInfo.drawPublished
        ? (noDeepCopy && structures) || makeDeepCopy(structures, false, true)
        : undefined,
    drawInfo: noDeepCopy ? drawInfo : makeDeepCopy(drawInfo, false, true),
    ...SUCCESS,
  };
}

/**
 * Draw-wide inputs that getAllStructureMatchUps used to build again for every structure of a draw: the
 * matchUps map and exit profiles always cover the whole draw, and the participants were hydrated with the
 * same arguments each time (the arguments getAllStructureMatchUps would use). One read, one build.
 *
 * The draw's matchUps read only the participants the draw references and their groupings, so only those are
 * hydrated (as findMatchUp does): hydrating the whole pool made every drawData linear in the tournament's
 * participants, not in the draw's.
 */
function buildDrawFacts({
  participantsProfile,
  policyDefinitions,
  tournamentRecord,
  contextProfile,
  drawDefinition,
  hydrate,
}: {
  participantsProfile?: ParticipantsProfile;
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  contextProfile?: ContextProfile;
  drawDefinition: DrawDefinition;
  hydrate: boolean;
}) {
  const participants =
    hydrate && tournamentRecord
      ? hydrateParticipants({
          participants: getReferencedParticipants({
            participants: tournamentRecord.participants ?? [],
            record: drawDefinition,
          }),
          participantsProfile,
          policyDefinitions,
          tournamentRecord,
          contextProfile,
          inContext: true,
        }).participants
      : undefined;

  return {
    exitProfiles: getExitProfiles({ drawDefinition }).exitProfiles,
    matchUpsMap: getMatchUpsMap({ drawDefinition }),
    participants,
  };
}
