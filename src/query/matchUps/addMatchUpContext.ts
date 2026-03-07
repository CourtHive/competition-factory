import { getMatchUpCompetitiveProfile } from '@Query/matchUp/getMatchUpCompetitiveProfile';
import { getCheckedInParticipantIds } from '@Query/matchUp/getCheckedInParticipantIds';
import { getMatchUpScheduleDetails } from '@Query/matchUp/getMatchUpScheduleDetails';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getOrderedDrawPositions } from './getOrderedDrawPositions';
import { getCollectionAssignment } from './getCollectionAssignment';
import { getMatchUpType } from '@Query/matchUp/getMatchUpType';
import { definedAttributes } from '@Tools/definedAttributes';
import { attributeFilter } from '@Tools/attributeFilter';
import { findParticipant } from '@Acquire/findParticipant';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isConvertableInteger } from '@Tools/math';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';
import { getSide } from './getSide';

// constants and types
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { isEmbargoed } from '@Query/publishing/isEmbargoed';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { MIXED } from '@Constants/genderConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { SINGLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';
import {
  Participant,
  Tournament,
  Event,
  Structure,
  DrawDefinition,
  SeedAssignment,
  PositionAssignment,
} from '@Types/tournamentTypes';
import {
  ContextContent,
  ContextProfile,
  ParticipantMap,
  PolicyDefinitions,
  ScheduleTiming,
  ScheduleVisibilityFilters,
} from '@Types/factoryTypes';

type AddMatchUpContextArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  additionalContext?: { [key: string]: any };
  positionAssignments: PositionAssignment[];
  tournamentParticipants?: Participant[];
  seedAssignments?: SeedAssignment[];
  appliedPolicies?: PolicyDefinitions;
  context?: { [key: string]: any };
  participantMap?: ParticipantMap;
  scheduleTiming?: ScheduleTiming;
  contextContent?: ContextContent;
  sourceDrawPositionRanges?: any;
  contextProfile?: ContextProfile;
  hydrateParticipants?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  initialRoundOfPlay?: number;
  tieDrawPositions?: number[];
  drawPositionsRanges?: any;
  isCollectionBye?: boolean;
  usePublishState?: boolean;
  afterRecoveryTimes?: any;
  matchUp: HydratedMatchUp;
  roundNamingProfile?: any;
  scoringActive?: boolean;
  isRoundRobin?: boolean;
  matchUpTieId?: string;
  structure: Structure;
  publishStatus?: any;
  sideLineUps?: any[];
  roundProfile?: any;
  event?: Event;
};

export function addMatchUpContext({
  scheduleVisibilityFilters,
  sourceDrawPositionRanges,
  tournamentParticipants,
  positionAssignments,
  drawPositionsRanges,
  hydrateParticipants,
  afterRecoveryTimes,
  initialRoundOfPlay,
  additionalContext,
  roundNamingProfile,
  tournamentRecord,
  tieDrawPositions,
  appliedPolicies,
  isCollectionBye,
  seedAssignments,
  usePublishState,
  participantMap,
  contextContent,
  scheduleTiming,
  contextProfile,
  drawDefinition,
  publishStatus,
  scoringActive,
  matchUpTieId,
  isRoundRobin,
  roundProfile,
  sideLineUps,
  structure,
  context,
  matchUp,
  event,
}: AddMatchUpContextArgs) {
  additionalContext = additionalContext ?? {};
  const tieFormat = resolveTieFormat({
    drawDefinition,
    structure,
    matchUp,
    event,
  })?.tieFormat;

  const { roundOffset, structureId, structureName, stage, stageSequence } = structure;
  const { drawId, drawName, drawType } = drawDefinition ?? {};
  const collectionDefinitions = tieFormat?.collectionDefinitions;
  const collectionDefinition =
    matchUp.collectionId &&
    collectionDefinitions?.find((definition) => definition.collectionId === matchUp.collectionId);

  const matchUpFormat = matchUp.collectionId
    ? collectionDefinition?.matchUpFormat
    : (matchUp.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition?.matchUpFormat ?? event?.matchUpFormat);

  const matchUpType =
    matchUp.matchUpType ||
    collectionDefinition?.matchUpType ||
    structure?.matchUpType ||
    drawDefinition?.matchUpType ||
    (!isMatchUpEventType(TEAM)(event?.eventType) && event?.eventType);

  const matchUpStatus = isCollectionBye ? BYE : matchUp.matchUpStatus;
  let { schedule, endDate } = getMatchUpScheduleDetails({
    scheduleVisibilityFilters,
    afterRecoveryTimes,
    tournamentRecord,
    usePublishState,
    scheduleTiming,
    drawDefinition,
    matchUpFormat,
    publishStatus,
    matchUpType,
    matchUp,
    event,
  });

  // Strip schedule for rounds with active embargo (mirrors competitionScheduleMatchUps)
  if (usePublishState && schedule && publishStatus && drawDefinition?.drawId && structure?.structureId) {
    const structDetail =
      publishStatus?.drawDetails?.[drawDefinition.drawId]?.structureDetails?.[structure.structureId];
    if (structDetail) {
      const rn = matchUp.roundNumber;
      if (isConvertableInteger(rn)) {
        const roundDetail = structDetail.scheduledRounds?.[rn!];
        if (roundDetail && isEmbargoed(roundDetail)) {
          schedule = undefined;
        }
      }
    }
  }

  const drawPositions: number[] = tieDrawPositions ?? matchUp.drawPositions ?? [];
  const { collectionPosition, collectionId, roundPosition } = matchUp;
  const roundNumber = matchUp.roundNumber ?? additionalContext.roundNumber;

  const collectionAssignmentDetail = collectionId
    ? getCollectionAssignment({
        tournamentParticipants,
        positionAssignments,
        collectionPosition,
        participantMap,
        drawDefinition,
        drawPositions,
        collectionId,
        sideLineUps,
        matchUpType,
      })
    : undefined;

  const roundName = roundNamingProfile?.[roundNumber]?.roundName || additionalContext.roundName;
  const abbreviatedRoundName =
    roundNamingProfile?.[roundNumber]?.abbreviatedRoundName || additionalContext.abbreviatedRoundName;
  const feedRound = roundProfile?.[roundNumber]?.feedRound;
  const preFeedRound = roundProfile?.[roundNumber]?.preFeedRound;
  const roundFactor = roundProfile?.[roundNumber]?.roundFactor;

  const drawPositionsRoundRanges = drawPositionsRanges?.[roundNumber];
  const drawPositionsRange = roundPosition ? drawPositionsRoundRanges?.[roundPosition] : undefined;
  const sourceDrawPositionRoundRanges = sourceDrawPositionRanges?.[roundNumber];

  // if part of a tie matchUp and collectionDefinition has a category definition, prioritize
  const matchUpCategory = collectionDefinition?.category
    ? {
        ...context?.category,
        ...collectionDefinition.category,
      }
    : (context?.category ?? event?.category);

  const processCodes =
    (matchUp.processCodes?.length && matchUp.processCodes) ||
    (collectionDefinition?.processCodes?.length && collectionDefinition?.processCodes) ||
    (structure?.processCodes?.length && structure?.processCodes) ||
    (drawDefinition?.processCodes?.length && drawDefinition?.processCodes) ||
    (event?.processCodes?.length && event?.processCodes) ||
    tournamentRecord?.processCodes;

  const competitiveProfile =
    contextProfile?.withCompetitiveness && getMatchUpCompetitiveProfile({ ...contextContent, matchUp });

  // necessry for SINGLES/DOUBLES matchUps that are part of TEAM tournaments
  const finishingPositionRange = matchUp.finishingPositionRange ?? additionalContext.finishingPositionRange;

  const roundOfPlay =
    stage !== QUALIFYING && isConvertableInteger(initialRoundOfPlay) && initialRoundOfPlay + (roundNumber || 0);

  // order is important here as Round Robin matchUps already have inContext structureId
  const onlyDefined = (obj) => definedAttributes(obj, undefined, true);

  const matchUpWithContext = {
    ...onlyDefined(context),
    ...onlyDefined({
      matchUpFormat: matchUpType === TEAM ? undefined : matchUpFormat,
      tieFormat: matchUpType === TEAM ? tieFormat : undefined,
      gender: collectionDefinition?.gender ?? event?.gender,
      endDate: matchUp.endDate ?? endDate,
      discipline: event?.discipline,
      category: matchUpCategory,
      finishingPositionRange,
      abbreviatedRoundName,
      drawPositionsRange,
      competitiveProfile,
      structureName,
      stageSequence,
      drawPositions,
      matchUpStatus,
      processCodes,
      isRoundRobin,
      matchUpTieId,
      preFeedRound,
      matchUpType,
      roundFactor,
      roundOffset,
      structureId,
      roundNumber,
      roundOfPlay,
      feedRound,
      roundName,
      drawName,
      drawType,
      schedule,
      drawId,
      stage,
    }),
    ...makeDeepCopy(onlyDefined(matchUp), true, true),
  };

  if (matchUpFormat && matchUp.score?.scoreStringSide1) {
    const parsedFormat = parse(matchUpFormat);
    const { bestOf, finalSetFormat, setFormat } = parsedFormat ?? {};
    if (finalSetFormat?.tiebreakSet || setFormat?.tiebreakSet || setFormat?.timed) {
      matchUpWithContext.score.sets = matchUpWithContext.score.sets
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((set, i) => {
          const setNumber = i + 1;
          const isDecidingSet = setNumber === bestOf;
          const currentSetFormat = isDecidingSet && finalSetFormat ? finalSetFormat : setFormat;

          // Check if this set is tiebreak-only (not timed)
          const isTiebreakOnly = currentSetFormat?.tiebreakSet && !currentSetFormat?.timed;
          const isTimed = currentSetFormat?.timed;

          if (isTiebreakOnly) {
            // Only mark as tiebreakSet for actual tiebreak-only sets (TB10, TB1, etc.)
            set.tiebreakSet = true;
            // For tiebreak-only sets, normalize scores to 1-0 or 0-1
            if ([1, 2].includes(set.winningSide)) {
              set.side1Score = set.winningSide === 1 ? 1 : 0;
              set.side2Score = set.winningSide === 2 ? 1 : 0;
            }
          } else if (isTimed) {
            // For timed sets, mark as tiebreakSet for backwards compatibility
            // but DO NOT modify the scores - they are actual point totals
            set.timed = true;
          }

          return set;
        });
    }
  }

  if (Array.isArray(drawPositions)) {
    const { orderedDrawPositions, displayOrder } = getOrderedDrawPositions({
      drawPositions,
      roundProfile,
      roundNumber,
    });

    const isFeedRound = roundProfile?.[roundNumber]?.feedRound;
    const reversedDisplayOrder = displayOrder[0] !== orderedDrawPositions[0];

    // ensure there are two sides generated
    const sideDrawPositions = orderedDrawPositions.concat(undefined, undefined).slice(0, 2);

    const sides = sideDrawPositions.map((drawPosition, index) => {
      const sideNumber = index + 1;
      const displaySideNumber = reversedDisplayOrder ? 3 - sideNumber : sideNumber;

      const side = getSide({
        ...collectionAssignmentDetail,
        positionAssignments,
        displaySideNumber,
        seedAssignments,
        drawPosition,
        isFeedRound,
        sideNumber,
      });

      const existingSide = matchUp.sides?.find((existing) => existing.sideNumber === sideNumber);

      // drawPositions for consolation structures are offset by the number of fed positions in subsequent rounds
      // columnPosition gives an ordered position value relative to a single column
      const columnPosition = roundPosition ? (roundPosition - 1) * 2 + index + 1 : undefined;
      const sourceDrawPositionRange = columnPosition ? sourceDrawPositionRoundRanges?.[columnPosition] : undefined;

      return onlyDefined({
        sourceDrawPositionRange,
        ...existingSide,
        ...side,
      });
    });

    Object.assign(matchUpWithContext, makeDeepCopy({ sides }, true, true));
  }

  if (tournamentParticipants && matchUpWithContext.sides) {
    const participantAttributes = appliedPolicies?.[POLICY_TYPE_PARTICIPANT];
    const getMappedParticipant = (participantId) => {
      const participant = participantMap?.[participantId]?.participant;
      return (
        participant &&
        attributeFilter({
          template: participantAttributes?.participant,
          source: participant,
        })
      );
    };

    matchUpWithContext.sides.filter(Boolean).forEach((side) => {
      if (side.participantId) {
        const participant = makeDeepCopy(
          getMappedParticipant(side.participantId) ||
            (tournamentParticipants
              ? findParticipant({
                  policyDefinitions: appliedPolicies,
                  participantId: side.participantId,
                  tournamentParticipants,
                  internalUse: true,
                  contextProfile,
                })
              : undefined),
          undefined,
          true,
        );

        if (participant) {
          let entryStatus, entryStage;

          if (drawDefinition?.entries) {
            const entry = drawDefinition.entries.find((entry) => entry.participantId === side.participantId);
            // even.entries are used as a fallback for entryStatus when entries missing from drawDefinition
            const eEntry = event?.entries?.find((entry) => entry.participantId === side.participantId);
            entryStatus = entry?.entryStatus || eEntry?.entryStatus;
            participant.entryStatus = entryStatus;
            if (entry?.entryStage) {
              entryStage = entry.entryStage;
              participant.entryStage = entryStage;
            }
          }

          // Check if participant's position assignment has a luckyAdvancement extension
          // This distinguishes lucky draw advancement (re-entered after losing) from
          // qualifying lucky losers who entered the draw with LUCKY_LOSER status
          let luckyAdvancement: boolean | undefined;
          if (side.drawPosition && positionAssignments) {
            const assignment = positionAssignments.find((a) => a.drawPosition === side.drawPosition);
            if (assignment?.extensions?.some((ext) => ext.name === 'luckyAdvancement')) {
              luckyAdvancement = true;
              participant.luckyAdvancement = true;
            }
          }

          if (hydrateParticipants === false) {
            // when hydrateParticipants is false, only add entryStatus and entryStage to side.participant, because unique to this context
            // it is expected that receiving client will have access to participant data and can hydrate as needed
            Object.assign(side, { participant: { entryStage, entryStatus, luckyAdvancement } });
          } else {
            Object.assign(side, { participant });
          }
        }
      }

      if (side?.participant?.individualParticipantIds?.length && !side.participant.individualParticipants?.length) {
        const individualParticipants = side.participant.individualParticipantIds.map((participantId) => {
          return (
            getMappedParticipant(participantId) ||
            (tournamentParticipants
              ? findParticipant({
                  policyDefinitions: appliedPolicies,
                  tournamentParticipants,
                  internalUse: true,
                  contextProfile,
                  participantId,
                })
              : undefined)
          );
        });
        if (hydrateParticipants !== false) Object.assign(side.participant, { individualParticipants });
      }
    });

    if (!matchUpWithContext.matchUpType) {
      const { matchUpType } = getMatchUpType({ matchUp: matchUpWithContext });
      if (matchUpType) Object.assign(matchUpWithContext, { matchUpType });
    }

    const inferGender =
      contextProfile?.inferGender &&
      (!matchUpWithContext.gender || matchUpWithContext.gender === MIXED) &&
      matchUpWithContext.sides?.length === 2 &&
      matchUpWithContext.matchUpType !== TEAM;

    if (inferGender) {
      const sideGenders = matchUpWithContext.sides.map((side) => {
        if (isMatchUpEventType(SINGLES)(matchUpWithContext.matchUpType)) return side.participant?.person?.sex;

        if (side.participant?.individualParticipants?.length === 2) {
          const pairGenders = unique(
            side.participant.individualParticipants.map((participant) => participant.person?.sex),
          ).filter(Boolean);
          if (pairGenders.length === 1) return pairGenders[0];
        }

        return undefined;
      });
      if (sideGenders.filter(Boolean).length === 2 && unique(sideGenders).length === 1) {
        const inferredGender = sideGenders[0];
        matchUpWithContext.inferredGender = inferredGender;
      }
    }
  }

  if (matchUpWithContext.tieMatchUps) {
    const isCollectionBye = matchUpWithContext.matchUpStatus === BYE;
    const lineUps = matchUpWithContext.sides?.map(({ participant, drawPosition, sideNumber, lineUp }) => {
      const teamParticipant = participant?.participantType === TEAM && participant;
      const teamParticipantValues =
        teamParticipant &&
        definedAttributes({
          participantRoleResponsibilities: teamParticipant.participantRoleResponsibilities,
          participantOtherName: teamParticipant.participanOthertName,
          participantName: teamParticipant.participantName,
          participantId: teamParticipant.participantId,
          teamId: teamParticipant.teamId,
        });

      return {
        teamParticipant: teamParticipantValues,
        drawPosition,
        sideNumber,
        lineUp,
      };
    });

    matchUpWithContext.tieMatchUps = matchUpWithContext.tieMatchUps.map((matchUp) => {
      const matchUpTieId = matchUpWithContext.matchUpId;
      const finishingPositionRange = matchUpWithContext.finishingPositionRange;
      const additionalContext = {
        finishingPositionRange,
        abbreviatedRoundName,
        roundNumber,
        roundName,
      };

      return addMatchUpContext({
        tieDrawPositions: drawPositions,
        scheduleVisibilityFilters,
        sourceDrawPositionRanges,
        sideLineUps: lineUps,
        drawPositionsRanges,
        initialRoundOfPlay,
        roundNamingProfile,
        additionalContext,
        appliedPolicies,
        isCollectionBye,
        usePublishState,
        publishStatus,
        matchUpTieId,
        isRoundRobin,
        roundProfile,
        matchUp,
        event,

        tournamentParticipants,
        positionAssignments,
        tournamentRecord,
        seedAssignments,
        participantMap,
        contextContent,
        scheduleTiming,
        contextProfile,
        drawDefinition,
        scoringActive,
        structure,
        context,
      });
    });
  }

  const hasParticipants = matchUpWithContext.sides?.filter((side) => side?.participantId).length === 2;
  const hasNoWinner = !matchUpWithContext.winningSide;
  const readyToScore = scoringActive && hasParticipants && hasNoWinner;
  Object.assign(matchUpWithContext, { readyToScore, hasContext: true });

  if (hasParticipants) {
    const { allParticipantsCheckedIn, checkedInParticipantIds } = getCheckedInParticipantIds({
      matchUp: matchUpWithContext,
    });

    Object.assign(matchUpWithContext, {
      allParticipantsCheckedIn,
      checkedInParticipantIds,
    });
  }

  if (Array.isArray(contextProfile?.exclude)) {
    // loop through all attributes and delete them from matchUpWithContext
    contextProfile?.exclude.forEach((attribute) => delete matchUpWithContext[attribute]);
  }

  return matchUpWithContext;
}
