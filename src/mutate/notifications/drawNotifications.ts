import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { addNotice, deleteNotice } from '@Global/state/globalState';
import { requireParams } from '@Helpers/parameters/requireParams';

// Constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION, STRUCTURE } from '@Constants/attributeConstants';
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ADD_DRAW_DEFINITION,
  ADD_MATCHUPS,
  DELETED_DRAW_IDS,
  DELETED_MATCHUP_IDS,
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  MODIFY_SEED_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

function drawUpdatedAt(drawDefinition: DrawDefinition, structureIds?: string[]) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  let timeStamp = Date.now();
  if (drawDefinition.updatedAt && timeStamp === new Date(drawDefinition.updatedAt).getTime()) timeStamp += 1;
  const updatedAt = new Date(timeStamp).toISOString();

  const relevantStructureIds = structureIds?.filter(Boolean);

  drawDefinition.updatedAt = updatedAt;
  drawDefinition.structures?.filter(Boolean).forEach((structure) => {
    if (!relevantStructureIds?.length || relevantStructureIds?.includes(structure.structureId)) {
      structure.updatedAt = updatedAt;
    }
  });

  return { ...SUCCESS };
}

type AddMatchUpsNoticeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  matchUps: MatchUp[];
  eventId?: string;
};
export function addMatchUpsNotice({ drawDefinition, tournamentId, matchUps, eventId }: AddMatchUpsNoticeArgs) {
  if (drawDefinition) drawUpdatedAt(drawDefinition);
  addNotice({
    payload: { matchUps, tournamentId, eventId },
    topic: ADD_MATCHUPS,
  });

  return { ...SUCCESS };
}

type DeleteMatchUpsNoticeArga = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  matchUpIds: string[];
  eventId?: string;
  action?: any;
};
export function deleteMatchUpsNotice({
  drawDefinition,
  tournamentId,
  matchUpIds,
  eventId,
  action,
}: DeleteMatchUpsNoticeArga) {
  if (drawDefinition) drawUpdatedAt(drawDefinition);
  addNotice({
    topic: DELETED_MATCHUP_IDS,
    payload: {
      tournamentId,
      matchUpIds,
      eventId,
      action,
    },
  });
  for (const matchUpId of matchUpIds) {
    deleteNotice({ key: matchUpId });
  }

  return { ...SUCCESS };
}

type ModifyMatchUpNoticeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  structureId?: string;
  matchUp: MatchUp;
  eventId?: string;
  context?: any;
};

export function modifyMatchUpNotice({
  drawDefinition,
  tournamentId,
  structureId,
  context,
  eventId,
  matchUp,
}: ModifyMatchUpNoticeArgs) {
  if (!matchUp) {
    console.log(MISSING_MATCHUP);
    return { error: MISSING_MATCHUP };
  }
  if (drawDefinition) {
    const structureIds = structureId ? [structureId] : undefined;
    modifyDrawNotice({
      drawDefinition,
      structureIds,
      tournamentId,
      eventId,
    });
  }
  addNotice({
    topic: MODIFY_MATCHUP,
    payload: { matchUp, tournamentId, context },
    key: matchUp.matchUpId,
  });

  return { ...SUCCESS };
}

export function updateInContextMatchUp({ tournamentId, inContextMatchUp }) {
  if (!inContextMatchUp) {
    return { error: MISSING_MATCHUP };
  }
  addNotice({
    payload: { inContextMatchUp, tournamentId },
    topic: UPDATE_INCONTEXT_MATCHUP,
    key: inContextMatchUp.matchUpId,
  });

  return { ...SUCCESS };
}

type AddDrawNoticeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  eventId?: string;
};
export function addDrawNotice({ tournamentId, eventId, drawDefinition }: AddDrawNoticeArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (!drawDefinition) {
    console.log(MISSING_DRAW_DEFINITION);
    return { error: MISSING_DRAW_DEFINITION };
  }
  drawUpdatedAt(drawDefinition);
  addNotice({
    payload: { drawDefinition, tournamentId, eventId },
    topic: ADD_DRAW_DEFINITION,
    key: drawDefinition.drawId,
  });

  return { ...SUCCESS };
}

type DeleteDrawNoticeArgs = {
  tournamentId?: string;
  eventId?: string;
  drawId: string;
};
export function deleteDrawNotice({ tournamentId, eventId, drawId }: DeleteDrawNoticeArgs) {
  addNotice({
    payload: { drawId, tournamentId, eventId },
    topic: DELETED_DRAW_IDS,
    key: drawId,
  });
  deleteNotice({ key: drawId });

  return { ...SUCCESS };
}

type ModifyDrawNoticeArgs = {
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  tournamentId?: string;
  eventId?: string;
};
export function modifyDrawNotice({ drawDefinition, tournamentId, structureIds, eventId }: ModifyDrawNoticeArgs) {
  if (!drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }
  drawUpdatedAt(drawDefinition, structureIds);
  addNotice({
    payload: { tournamentId, eventId, drawDefinition },
    topic: MODIFY_DRAW_DEFINITION,
    key: drawDefinition.drawId,
  });

  return { ...SUCCESS };
}

export function modifySeedAssignmentsNotice({ drawDefinition, tournamentId, structure, eventId }) {
  const paramsCheck = requireParams({ drawDefinition, structure }, [DRAW_DEFINITION, STRUCTURE]);
  if (paramsCheck.error) return paramsCheck;

  const seedAssignments = structure.seedAssignments;
  const structureId = structure.structureId;
  const drawId = drawDefinition.drawId;

  addNotice({
    payload: { tournamentId, eventId, drawId, structureId, seedAssignments },
    topic: MODIFY_SEED_ASSIGNMENTS,
    key: drawDefinition.drawId,
  });
  modifyDrawNotice({
    structureIds: [structureId],
    drawDefinition,
    tournamentId,
    eventId,
  });

  return { ...SUCCESS };
}

export function modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event }) {
  const paramsCheck = requireParams({ drawDefinition, structure }, [DRAW_DEFINITION, STRUCTURE]);
  if (paramsCheck.error) return paramsCheck;

  const positionAssignments = getPositionAssignments({ structure });
  const structureId = structure.structureId;
  const drawId = drawDefinition.drawId;
  const eventId = event?.eventId;

  addNotice({
    topic: MODIFY_POSITION_ASSIGNMENTS,
    payload: {
      positionAssignments,
      tournamentId,
      structureId,
      eventId,
      drawId,
    },
    key: structureId,
  });

  modifyDrawNotice({
    structureIds: [structureId],
    drawDefinition,
    tournamentId,
    eventId,
  });

  return { ...SUCCESS };
}
