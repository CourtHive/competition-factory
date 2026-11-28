import { isRotatingPartnerDraw, validateRotatingPartnerMatchUps } from '@Validators/rotatingPartnerDraw';
import { addMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getMatchUpId } from '@Functions/global/extractors';
import { validMatchUps } from '@Validators/validMatchUp';
import { mustBeAnArray } from '@Tools/mustBeAnArray';
import { overlap } from '@Tools/arrays';

// constants and types
import { ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_VALUES,
  INVALID_STRUCTURE,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
  EXISTING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';
import type { DrawDefinition, Event, ItemStructure, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';

type AddAdHocMatchUpsParams = {
  suppressNotifications?: boolean; // internal - avoid duplicate notifications from mocksEngine
  tournamentRecord: Tournament;
  structureId?: string;
  drawDefinition: DrawDefinition;
  matchUps: MatchUp[];
  event: Event;
};

export function addAdHocMatchUps(params: AddAdHocMatchUpsParams): ResultType {
  const { suppressNotifications, tournamentRecord, drawDefinition, matchUps, event } = params;
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };

  let structureId = params?.structureId;
  if (!structureId && drawDefinition.structures?.length === 1)
    structureId = drawDefinition.structures?.[0]?.structureId;

  if (typeof structureId !== 'string') return { error: MISSING_STRUCTURE_ID };

  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES, info: mustBeAnArray('matchUps') };

  const structure = drawDefinition.structures?.find((structure) => structure.structureId === structureId) as
    (ItemStructure & { structures?: Structure[] }) | undefined;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const existingMatchUps = structure?.matchUps;
  const structureHasRoundPositions = existingMatchUps!.find((matchUp) => !!matchUp.roundPosition);

  if (structure.structures || structureHasRoundPositions || structure.finishingPosition === ROUND_OUTCOME) {
    return { error: INVALID_STRUCTURE };
  }

  if (isRotatingPartnerDraw(drawDefinition, event)) {
    const validation = validateRotatingPartnerMatchUps({ drawDefinition, tournamentRecord, matchUps });
    if (validation.error) return validation;
  }

  const existingMatchUpIds =
    allTournamentMatchUps({
      tournamentRecord,
      inContext: false,
    })?.matchUps?.map(getMatchUpId) ?? [];

  const newMatchUpIds = matchUps.map(getMatchUpId);

  if (overlap(existingMatchUpIds, newMatchUpIds)) {
    return {
      error: EXISTING_MATCHUP_ID,
      info: 'One or more matchUpIds already present in tournamentRecord',
    };
  }

  structure.matchUps!.push(...matchUps);

  const tieMatchUps = matchUps
    .map(({ tieMatchUps }) => tieMatchUps)
    .filter(Boolean)
    .flat();

  if (!suppressNotifications) {
    addMatchUpsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      matchUps: [...tieMatchUps, ...matchUps] as MatchUp[],
      eventId: event?.eventId,
      drawDefinition,
    });
    modifyDrawNotice({ drawDefinition, structureIds: [structureId] });
  }

  return { ...SUCCESS };
}
