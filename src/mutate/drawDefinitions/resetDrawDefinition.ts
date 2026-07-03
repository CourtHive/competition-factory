import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import { MAIN, QUALIFYING, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DRAFT_STATE, POSITION_ACTIONS } from '@Constants/extensionConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { TimeItem } from '@Types/tournamentTypes';
import { HydratedSide } from '@Types/hydrated';
import {
  ASSIGN_COURT,
  ASSIGN_VENUE,
  ASSIGN_OFFICIAL,
  COURT_ANNOTATION,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  ALLOCATE_COURTS,
  COURT_ORDER,
} from '@Constants/timeItemConstants';

export function resetDrawDefinition({ tournamentRecord, removeScheduling, removeAssignments, drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const isLuckyDraw = isLuckyBasedDraw(drawDefinition.drawType);
  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  const getRawMatchUp = (matchUpId) => matchUpsMap?.drawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

  for (const structure of drawDefinition.structures ?? []) {
    const { stage } = structure;

    if (stage === VOLUNTARY_CONSOLATION) {
      resetVoluntaryConsolationStructure(structure);
      continue;
    }

    resetStructureAssignments({ structure, isLuckyDraw, removeAssignments });

    resetStructureMatchUps({
      removeScheduling,
      tournamentRecord,
      drawDefinition,
      getRawMatchUp,
      isLuckyDraw,
      matchUpsMap,
      structure,
      removeAssignments,
    });
  }

  // Remove all VOLUNTARY_CONSOLATION entries
  if (drawDefinition.entries?.length) {
    drawDefinition.entries = drawDefinition.entries.filter((entry) => entry.entryStage !== VOLUNTARY_CONSOLATION);
  }

  drawDefinition.extensions = drawDefinition.extensions.filter(
    (extension) => extension.name !== POSITION_ACTIONS && extension.name !== DRAFT_STATE,
  );
  // CODES: also wipe the first-class draftState if present
  delete drawDefinition.draftState;

  const structureIds = (drawDefinition.structures ?? []).map(({ structureId }) => structureId);

  modifyDrawNotice({ drawDefinition, structureIds });

  return { ...SUCCESS };
}

function resetVoluntaryConsolationStructure(structure) {
  structure.matchUps = [];
  if (structure.positionAssignments) {
    structure.positionAssignments = structure.positionAssignments.map((a) => {
      delete a.participantId;
      return a;
    });
  }
  structure.seedAssignments = [];
}

function resetStructureAssignments({ structure, isLuckyDraw, removeAssignments }) {
  const { positionAssignments, stage, stageSequence } = structure;
  const isMainOrQualifyingFirst = stageSequence === 1 && [QUALIFYING, MAIN].includes(stage);

  if (isLuckyDraw && positionAssignments) {
    resetLuckyDrawAssignments({ structure, positionAssignments, isMainOrQualifyingFirst, removeAssignments });
  } else if (positionAssignments && (!isMainOrQualifyingFirst || removeAssignments)) {
    structure.positionAssignments = positionAssignments.map((assignment) => {
      delete assignment.participantId;
      return assignment;
    });
    structure.seedAssignments = [];
  }
}

function resetLuckyDrawAssignments({ structure, positionAssignments, isMainOrQualifyingFirst, removeAssignments }) {
  const initialDrawPositions = new Set(
    (structure.matchUps ?? [])
      .filter((m: any) => m.roundNumber === 1)
      .flatMap((m: any) => m.drawPositions ?? [])
      .filter(Boolean),
  );

  if (isMainOrQualifyingFirst) {
    // Keep R1 position slots; clear participants/byes only if removeAssignments
    structure.positionAssignments = positionAssignments
      .filter((a) => initialDrawPositions.has(a.drawPosition))
      .map((a) => {
        if (removeAssignments) {
          delete a.bye;
          delete a.participantId;
        }
        return a;
      });
    if (removeAssignments) {
      structure.seedAssignments = [];
    }
  } else {
    // Playoff structures: clear all assignments
    structure.positionAssignments = [];
    structure.seedAssignments = [];
  }
}

function resetStructureMatchUps({
  removeScheduling,
  tournamentRecord,
  removeAssignments,
  drawDefinition,
  getRawMatchUp,
  isLuckyDraw,
  matchUpsMap,
  structure,
}) {
  const { matchUps: inContextMatchUps, isRoundRobin } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    matchUpsMap,
    structure,
  });

  for (const inContextMatchUp of inContextMatchUps) {
    const { matchUpId, roundNumber } = inContextMatchUp;
    const sides: HydratedSide[] = inContextMatchUp.sides ?? [];
    const matchUp = getRawMatchUp(matchUpId);
    if (!matchUp) continue;

    delete matchUp.extensions;
    delete matchUp.notes;

    resetMatchUpScore({ matchUp, isLuckyDraw, removeAssignments, roundNumber, sides, isRoundRobin });
    resetMatchUpScheduling({ matchUp, removeScheduling });

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'resetDrawDefinition',
      drawDefinition,
      matchUp,
    });
  }
}

function resetMatchUpScore({ matchUp, isLuckyDraw, removeAssignments, roundNumber, sides, isRoundRobin }) {
  if (isLuckyDraw) {
    if (!removeAssignments && matchUp.matchUpStatus === BYE) {
      // BYE matchUp stays as-is when preserving assignments
    } else {
      Object.assign(matchUp, toBePlayed);
    }
    if (roundNumber && roundNumber > 1) {
      matchUp.drawPositions = [];
    }
  } else {
    if (matchUp.matchUpStatus !== BYE) Object.assign(matchUp, toBePlayed);
    if (roundNumber && roundNumber > 1 && matchUp.drawPositions?.length && !isRoundRobin) {
      const fedDrawPositions = sides
        ?.map(({ drawPosition, participantFed }) => !participantFed && drawPosition)
        .filter(Boolean);
      const drawPositions = matchUp.drawPositions.map((drawPosition) =>
        fedDrawPositions.includes(drawPosition) ? undefined : drawPosition,
      ) as number[];
      matchUp.drawPositions = drawPositions;
    }
  }
}

// first-class schedule attributes (NATIVE / DUAL) matching the schedule timeItem types below —
// no timeItem mirror, so resetting the draw must clear these directly or the placement persists.
const SCHEDULE_FIRST_CLASS_ATTRS = [
  'allocatedCourts',
  'courtId',
  'venueId',
  'official',
  'courtAnnotation',
  'scheduledDate',
  'scheduledTime',
  'courtOrder',
  'calledAt',
];

function resetMatchUpScheduling({ matchUp, removeScheduling }) {
  if (removeScheduling) {
    delete matchUp.timeItems;
  } else if (matchUp.timeItems?.length) {
    matchUp.timeItems = matchUp.timeItems.filter(
      (timeItem: TimeItem) =>
        timeItem.itemType &&
        ![
          ALLOCATE_COURTS,
          ASSIGN_COURT,
          ASSIGN_VENUE,
          ASSIGN_OFFICIAL,
          COURT_ANNOTATION,
          SCHEDULED_DATE,
          SCHEDULED_TIME,
          COURT_ORDER,
        ].includes(timeItem.itemType),
    );
  }

  if (matchUp.schedule && typeof matchUp.schedule === 'object') {
    for (const attribute of SCHEDULE_FIRST_CLASS_ATTRS) delete matchUp.schedule[attribute];
  }
}
